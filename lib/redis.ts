import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "./env";
import type { PlayerCard, RoutesByDay, YearCalendar } from "@/types/player";
import type { StoredTokens } from "@/types/strava";
import { decrypt, encrypt } from "./crypto";

/**
 * Caching layer. Everything Strava-derived lives here so repeat page views and
 * README embeds never touch the Strava API.
 *
 * Keys (all prefixed `sfut:`):
 *   card:{athleteId}      PlayerCard JSON           TTL 30d (freshness judged by card.scoutedAt)
 *   slug:{slug}           athleteId                 no TTL
 *   tokens:{athleteId}    AES-GCM encrypted tokens  no TTL
 *   lock:{athleteId}      scout-in-progress mutex   TTL 60s
 *   cooldown:{athleteId}  manual re-scout cooldown  TTL COOLDOWN
 *   budget                last seen Strava rate-limit usage
 *   cal:{athleteId}:{yr}  YearCalendar JSON         no TTL (past years never change)
 *   routes:{id}:{bucket}  RoutesByDay (shapes only) bucket = "recent" (rolling window) or a year
 */

const PREFIX = "sfut:";
const CARD_TTL_SECONDS = 60 * 60 * 24 * 30;
export const CARD_FRESH_MS = 1000 * 60 * 60 * 24; // 24h
export const RESCOUT_COOLDOWN_SECONDS = 60 * 10;
const LOCK_TTL_SECONDS = 60;

interface SetOptions {
  ex?: number;
  nx?: boolean;
}

interface KVStore {
  get<T>(key: string): Promise<T | null>;
  /** Returns false when `nx` is set and the key already exists. */
  set(key: string, value: unknown, opts?: SetOptions): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  ttl(key: string): Promise<number>;
}

class UpstashStore implements KVStore {
  constructor(private readonly redis: Redis) {}
  get<T>(key: string) {
    return this.redis.get<T>(key);
  }
  async set(key: string, value: unknown, opts: SetOptions = {}) {
    const res =
      opts.ex && opts.nx
        ? await this.redis.set(key, value, { ex: opts.ex, nx: true })
        : opts.ex
          ? await this.redis.set(key, value, { ex: opts.ex })
          : opts.nx
            ? await this.redis.set(key, value, { nx: true })
            : await this.redis.set(key, value);
    return res === "OK";
  }
  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }
  ttl(key: string) {
    return this.redis.ttl(key);
  }
}

/** Process-local fallback for local development without Redis. Not for production. */
class MemoryStore implements KVStore {
  private data = new Map<string, { value: string; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry?.expiresAt && entry.expiresAt < Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }
  async get<T>(key: string) {
    const entry = this.live(key);
    return entry ? (JSON.parse(entry.value) as T) : null;
  }
  async set(key: string, value: unknown, opts: SetOptions = {}) {
    if (opts.nx && this.live(key)) return false;
    this.data.set(key, {
      value: JSON.stringify(value),
      expiresAt: opts.ex ? Date.now() + opts.ex * 1000 : null,
    });
    return true;
  }
  async del(...keys: string[]) {
    keys.forEach((k) => this.data.delete(k));
  }
  async ttl(key: string) {
    const entry = this.live(key);
    if (!entry) return -2;
    return entry.expiresAt ? Math.ceil((entry.expiresAt - Date.now()) / 1000) : -1;
  }
}

const globalForStore = globalThis as unknown as { __sfutStore?: KVStore };

function store(): KVStore {
  if (globalForStore.__sfutStore) return globalForStore.__sfutStore;
  let instance: KVStore;
  if (env.redisUrl && env.redisToken) {
    instance = new UpstashStore(new Redis({ url: env.redisUrl, token: env.redisToken }));
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("[strava-fut] No Redis configured — using in-memory cache. Data will not persist across instances.");
    }
    instance = new MemoryStore();
  }
  globalForStore.__sfutStore = instance;
  return instance;
}

const k = {
  card: (id: number) => `${PREFIX}card:${id}`,
  slug: (slug: string) => `${PREFIX}slug:${slug.toLowerCase()}`,
  tokens: (id: number) => `${PREFIX}tokens:${id}`,
  lock: (id: number) => `${PREFIX}lock:${id}`,
  cooldown: (id: number) => `${PREFIX}cooldown:${id}`,
  budget: () => `${PREFIX}budget`,
  calendar: (id: number, year: number) => `${PREFIX}cal:${id}:${year}`,
  calendarLock: (id: number, year: number) => `${PREFIX}cal-lock:${id}:${year}`,
  routes: (id: number, bucket: RouteBucket) => `${PREFIX}routes:${id}:${bucket}`,
};

// ---------- Cards ----------

export async function getCachedCard(athleteId: number): Promise<PlayerCard | null> {
  return store().get<PlayerCard>(k.card(athleteId));
}

export async function saveCard(card: PlayerCard, previousSlug?: string): Promise<void> {
  const s = store();
  await s.set(k.card(card.athleteId), card, { ex: CARD_TTL_SECONDS });
  await s.set(k.slug(card.slug), card.athleteId);
  // Keep numeric-id URLs working even when the athlete has a username.
  await s.set(k.slug(String(card.athleteId)), card.athleteId);
  if (previousSlug && previousSlug.toLowerCase() !== card.slug.toLowerCase()) {
    await s.del(k.slug(previousSlug));
  }
}

export async function resolveSlug(slug: string): Promise<number | null> {
  const id = await store().get<number | string>(k.slug(slug));
  if (id === null) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

export function isFresh(card: PlayerCard): boolean {
  return Date.now() - Date.parse(card.scoutedAt) < CARD_FRESH_MS;
}

// ---------- Tokens (encrypted at rest) ----------

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await store().set(k.tokens(tokens.athleteId), encrypt(JSON.stringify(tokens)));
}

export async function getTokens(athleteId: number): Promise<StoredTokens | null> {
  const blob = await store().get<string>(k.tokens(athleteId));
  if (!blob) return null;
  try {
    return JSON.parse(decrypt(blob)) as StoredTokens;
  } catch {
    // Secret rotated or corrupted — treat as disconnected.
    return null;
  }
}

export async function deleteTokens(athleteId: number): Promise<void> {
  await store().del(k.tokens(athleteId));
}

export async function deleteAthlete(athleteId: number, slug?: string, calendarYears: number[] = []): Promise<void> {
  const keys = [
    k.card(athleteId),
    k.tokens(athleteId),
    k.slug(String(athleteId)),
    k.cooldown(athleteId),
    ...calendarYears.flatMap((y) => [k.calendar(athleteId, y), k.routes(athleteId, y)]),
    k.routes(athleteId, "recent"),
  ];
  if (slug) keys.push(k.slug(slug));
  await store().del(...keys);
}

// ---------- Concurrency & rate-limit guards ----------

/** Best-effort mutex so concurrent requests don't scout the same athlete twice. */
export async function acquireScoutLock(athleteId: number): Promise<boolean> {
  return store().set(k.lock(athleteId), Date.now(), { ex: LOCK_TTL_SECONDS, nx: true });
}

export async function releaseScoutLock(athleteId: number): Promise<void> {
  await store().del(k.lock(athleteId));
}

/** Starts the manual re-scout cooldown. Returns remaining seconds if already cooling down. */
export async function claimRescoutCooldown(athleteId: number): Promise<number | null> {
  const ok = await store().set(k.cooldown(athleteId), Date.now(), { ex: RESCOUT_COOLDOWN_SECONDS, nx: true });
  if (ok) return null;
  const ttl = await store().ttl(k.cooldown(athleteId));
  return ttl > 0 ? ttl : RESCOUT_COOLDOWN_SECONDS;
}

export interface RateBudget {
  shortUsage: number;
  shortLimit: number;
  dailyUsage: number;
  dailyLimit: number;
  /** Epoch ms when recorded. */
  at: number;
}

export async function recordRateBudget(budget: RateBudget): Promise<void> {
  await store().set(k.budget(), budget, { ex: 60 * 60 * 24 });
}

export async function getRateBudget(): Promise<RateBudget | null> {
  return store().get<RateBudget>(k.budget());
}

// ---------- Past-year calendars ----------

export async function getYearCalendar(athleteId: number, year: number): Promise<YearCalendar | null> {
  return store().get<YearCalendar>(k.calendar(athleteId, year));
}

export async function saveYearCalendar(athleteId: number, cal: YearCalendar): Promise<void> {
  await store().set(k.calendar(athleteId, cal.year), cal);
}

/** Stops two viewers fetching the same athlete-year at once. */
export async function acquireCalendarLock(athleteId: number, year: number): Promise<boolean> {
  return store().set(k.calendarLock(athleteId, year), Date.now(), { ex: LOCK_TTL_SECONDS, nx: true });
}

export async function releaseCalendarLock(athleteId: number, year: number): Promise<void> {
  await store().del(k.calendarLock(athleteId, year));
}

// ---------- Route shapes (per day, location-free) ----------

/** "recent" holds the rolling 12-month window; past years are stored by number. */
export type RouteBucket = "recent" | number;

export async function saveRoutes(athleteId: number, bucket: RouteBucket, routes: RoutesByDay): Promise<void> {
  await store().set(k.routes(athleteId, bucket), routes, bucket === "recent" ? { ex: CARD_TTL_SECONDS } : {});
}

export async function getRoutes(athleteId: number, bucket: RouteBucket): Promise<RoutesByDay | null> {
  return store().get<RoutesByDay>(k.routes(athleteId, bucket));
}

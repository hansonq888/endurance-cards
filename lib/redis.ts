import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "./env";
import type { CardSettings, PlayerCard, RoutesByDay, YearCalendar } from "@/types/player";
import type { StoredTokens } from "@/types/strava";
import { decrypt, encrypt } from "./crypto";

/**
 * Caching layer. Everything Strava-derived lives here so repeat page views and
 * README embeds never touch the Strava API.
 *
 * Keys (all prefixed `kudex:`):
 *   card:{athleteId}      PlayerCard JSON           TTL 30d (freshness judged by card.scoutedAt)
 *   meta:{athleteId}      every slug the athlete has had, for complete deletion  no TTL
 *   slug:{slug}           athleteId                 no TTL
 *   tokens:{athleteId}    AES-GCM encrypted tokens  no TTL
 *   lock:{athleteId}      scout-in-progress mutex (owner token)  TTL 150s
 *   dirty:{athleteId}     webhook saw a change; next view rebuilds  TTL 7d
 *   webhook-scout:{id}    debounce for webhook-triggered scouts      TTL 120s
 *   cooldown:{athleteId}  manual re-scout cooldown  TTL COOLDOWN
 *   budget                last seen Strava rate-limit usage
 *   cal:{athleteId}:{yr}  YearCalendar JSON         no TTL (past years never change)
 *   routes:{id}:{bucket}  RoutesByDay (shapes only) bucket = "recent" (rolling window) or a year
 *   settings:{athleteId}  CardSettings (visibility, share token, section toggles)  no TTL
 */

const PREFIX = "kudex:";
const CARD_TTL_SECONDS = 60 * 60 * 24 * 30;
export const CARD_FRESH_MS = 1000 * 60 * 60 * 24; // 24h
export const RESCOUT_COOLDOWN_SECONDS = 60 * 10;
/** Longer than the slowest scout (two passes of up to 5 calls with retries and 10 s timeouts). */
const LOCK_TTL_SECONDS = 150;

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

const globalForStore = globalThis as unknown as { __kudexStore?: KVStore };

function store(): KVStore {
  if (globalForStore.__kudexStore) return globalForStore.__kudexStore;
  let instance: KVStore;
  if (env.redisUrl && env.redisToken) {
    instance = new UpstashStore(new Redis({ url: env.redisUrl, token: env.redisToken }));
  } else {
    // Per-instance memory would silently break locks, the rate budget and every saved card.
    if (process.env.NODE_ENV === "production") {
      throw new Error("[kudex] Redis is required in production: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*).");
    }
    instance = new MemoryStore();
  }
  globalForStore.__kudexStore = instance;
  return instance;
}

const k = {
  card: (id: number) => `${PREFIX}card:${id}`,
  /** Legacy per-visitor card copies (before one card per athlete); only ever deleted now. */
  legacyCardView: (id: number, view: "link" | "public") => `${PREFIX}card:${id}:${view}`,
  /** Set by the webhook when an activity changes; forces the next view to re-scout. */
  dirty: (id: number) => `${PREFIX}dirty:${id}`,
  /** Last rendered share image of each kind, with the card version it was drawn from. */
  image: (id: number, kind: ImageKind) => `${PREFIX}img:${id}:${kind}`,
  /** Debounce for webhook-triggered scouts. */
  webhookScout: (id: number) => `${PREFIX}webhook-scout:${id}`,
  /** Never expires: what we need to find every key of an athlete when deleting them, even after the card expired. */
  meta: (id: number) => `${PREFIX}meta:${id}`,
  slug: (slug: string) => `${PREFIX}slug:${slug.toLowerCase()}`,
  tokens: (id: number) => `${PREFIX}tokens:${id}`,
  lock: (id: number) => `${PREFIX}lock:${id}`,
  cooldown: (id: number) => `${PREFIX}cooldown:${id}`,
  budget: () => `${PREFIX}budget`,
  calendar: (id: number, year: number) => `${PREFIX}cal:${id}:${year}`,
  calendarLock: (id: number, year: number) => `${PREFIX}cal-lock:${id}:${year}`,
  routes: (id: number, bucket: RouteBucket) => `${PREFIX}routes:${id}:${bucket}`,
  settings: (id: number) => `${PREFIX}settings:${id}`,
};

// ---------- Cards ----------

export async function getCachedCard(athleteId: number): Promise<PlayerCard | null> {
  return store().get<PlayerCard>(k.card(athleteId));
}

/** Permanent per-athlete index so deletion finds every slug even after the card itself expired. */
interface AthleteMeta {
  slugs: string[];
}

export async function saveCard(card: PlayerCard, previousSlug?: string): Promise<void> {
  const s = store();
  await s.set(k.card(card.athleteId), card, { ex: CARD_TTL_SECONDS });
  const meta = (await s.get<AthleteMeta>(k.meta(card.athleteId))) ?? { slugs: [] };
  if (!meta.slugs.includes(card.slug.toLowerCase())) {
    await s.set(k.meta(card.athleteId), { slugs: [...meta.slugs, card.slug.toLowerCase()] });
  }
  await s.set(k.slug(card.slug), card.athleteId);
  // Keep numeric-id URLs working even when the athlete has a username.
  await s.set(k.slug(String(card.athleteId)), card.athleteId);
  if (previousSlug && previousSlug.toLowerCase() !== card.slug.toLowerCase()) {
    await s.del(k.slug(previousSlug));
  }
}

// ---------- Rendered share images ----------

export type ImageKind = "card" | "story";
const IMAGE_TTL_SECONDS = 60 * 60 * 24 * 7;

/** A previously rendered image, if it was drawn from this exact card version. */
export async function getRenderedImage(athleteId: number, kind: ImageKind, version: string): Promise<Buffer | null> {
  const hit = await store().get<{ v: string; b64: string }>(k.image(athleteId, kind));
  return hit && hit.v === version ? Buffer.from(hit.b64, "base64") : null;
}

export async function saveRenderedImage(athleteId: number, kind: ImageKind, version: string, bytes: Buffer): Promise<void> {
  await store().set(k.image(athleteId, kind), { v: version, b64: bytes.toString("base64") }, { ex: IMAGE_TTL_SECONDS });
}

/** Webhook → "something changed on Strava; rebuild before trusting the cache". */
/** At most one webhook-triggered scout per athlete per window; later events just leave the card dirty. */
export async function claimWebhookScout(athleteId: number): Promise<boolean> {
  return store().set(k.webhookScout(athleteId), 1, { ex: 120, nx: true });
}

export async function markDirty(athleteId: number): Promise<void> {
  await store().set(k.dirty(athleteId), 1, { ex: 7 * 86_400 });
}

export async function isDirty(athleteId: number): Promise<boolean> {
  return (await store().get(k.dirty(athleteId))) !== null;
}

export async function clearDirty(athleteId: number): Promise<void> {
  await store().del(k.dirty(athleteId));
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

/** Strava launched in 2009; sweeping every year since means no calendar or route bucket is missed. */
const FIRST_STRAVA_YEAR = 2009;

/**
 * Removes every trace of an athlete: cards, tokens, settings, every slug they
 * ever had, all calendar years and routes, and the bookkeeping keys. Works even
 * when the card itself has expired, via the permanent meta index.
 */
export async function deleteAthlete(athleteId: number, slugs: string[] = []): Promise<void> {
  const s = store();
  const [settings, meta] = await Promise.all([getSettings(athleteId), s.get<AthleteMeta>(k.meta(athleteId))]);
  const years = Array.from({ length: new Date().getUTCFullYear() + 1 - FIRST_STRAVA_YEAR + 1 }, (_, i) => FIRST_STRAVA_YEAR + i);
  const keys = [
    k.card(athleteId),
    k.legacyCardView(athleteId, "link"),
    k.legacyCardView(athleteId, "public"),
    k.dirty(athleteId),
    k.tokens(athleteId),
    k.settings(athleteId),
    k.slug(String(athleteId)),
    k.cooldown(athleteId),
    ...years.flatMap((y) => [k.calendar(athleteId, y), k.routes(athleteId, y)]),
    k.routes(athleteId, "recent"),
    k.webhookScout(athleteId),
    k.image(athleteId, "card"),
    k.image(athleteId, "story"),
    k.meta(athleteId),
    ...[...slugs, ...(meta?.slugs ?? [])].map((slug) => k.slug(slug)),
  ];
  if (settings) keys.push(k.slug(settings.shareToken));
  await s.del(...keys);
}

// ---------- Concurrency & rate-limit guards ----------

/** Best-effort mutex so concurrent requests don't scout the same athlete twice. */
/** Returns an ownership token when acquired, null if someone else holds the lock. */
export async function acquireScoutLock(athleteId: number): Promise<string | null> {
  const token = crypto.randomUUID();
  return (await store().set(k.lock(athleteId), token, { ex: LOCK_TTL_SECONDS, nx: true })) ? token : null;
}

/** Releases only our own lock, so a scout that outlived its lock can't delete someone else's. */
export async function releaseScoutLock(athleteId: number, token: string): Promise<void> {
  if ((await store().get<string>(k.lock(athleteId))) === token) await store().del(k.lock(athleteId));
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

// ---------- Privacy settings ----------

export async function getSettings(athleteId: number): Promise<CardSettings | null> {
  const settings = await store().get<CardSettings & { visibility: string }>(k.settings(athleteId));
  // Cards saved as "public" before that option was removed are shared by link now.
  if (settings && settings.visibility !== "private" && settings.visibility !== "unlisted") return { ...settings, visibility: "unlisted" };
  return settings;
}

/** Saves settings and keeps the share-token slug pointing at the athlete (dropping a replaced token). */
export async function saveSettings(athleteId: number, settings: CardSettings, previousToken?: string): Promise<void> {
  const s = store();
  await s.set(k.settings(athleteId), settings);
  await s.set(k.slug(settings.shareToken), athleteId);
  if (previousToken && previousToken !== settings.shareToken) await s.del(k.slug(previousToken));
}

import "server-only";
import { cookies } from "next/headers";
import { sign, unsign } from "./crypto";

const SESSION_COOKIE = "sfut_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Marks the browser as belonging to a Strava athlete (enables re-scout / delete on their card). */
export async function setSession(athleteId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sign(String(athleteId)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getSessionAthleteId(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const value = unsign(raw);
  const id = value ? Number(value) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

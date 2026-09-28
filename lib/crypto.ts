import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function key(purpose: "sign" | "encrypt"): Buffer {
  return createHash("sha256").update(`${purpose}:${env.sessionSecret}`).digest();
}

/** HMAC-signs a value as `value.signature` (base64url). */
export function sign(value: string): string {
  const sig = createHmac("sha256", key("sign")).update(value).digest("base64url");
  return `${value}.${sig}`;
}

/** Returns the original value if the signature is valid, otherwise null. */
export function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const expected = Buffer.from(sign(value).slice(idx + 1));
  const actual = Buffer.from(signed.slice(idx + 1));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return value;
}

/** AES-256-GCM encryption for Strava tokens at rest. Output: iv.tag.ciphertext (base64url). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("encrypt"), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key("encrypt"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

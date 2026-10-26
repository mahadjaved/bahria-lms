import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { SessionData } from "./types";

export const SESSION_COOKIE = "bahria_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours, sliding
export const SESSION_COOKIE_MAX_AGE = 12 * 60 * 60; // seconds

// WARNING: the fallback is only for local development. Always set SESSION_SECRET in production.
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me-please";
function key(): Buffer { return createHash("sha256").update(SECRET).digest(); }

/* ------------------------------------------------------------------ */
/* Authoritative session carrier: the whole session, AES-256-GCM       */
/* encrypted into the browser cookie and re-issued on every response.  */
/*                                                                     */
/* Why the cookie again (v1 failed at this!): v1 encrypted the jar     */
/* into the cookie at login but NEVER wrote the refreshed jar back, so */
/* Aspire's cookie rotation stranded the browser with a stale jar.    */
/* Now `withSessionCookie` (lib/api-helpers.ts) re-encrypts the live   */
/* session into the cookie on EVERY API response, success or error —   */
/* the browser always presents the freshest jar, on ANY server         */
/* process or instance. The server-side store is just a cache + lock.  */
/* Token layout: base64url( iv[12] || authTag[16] || ciphertext ).     */
/* ------------------------------------------------------------------ */

export interface SessionCookiePayload {
  id: string;
  enrollment: string;
  name?: string;
  instituteId: string;
  subUserType: string;
  /** The live Bahria cookie jar. */
  cookies: Record<string, string>;
  /** Feature -> portal PATHNAME only (no scheme/host) to keep the cookie small. */
  nav: Record<string, string>;
  loggedInAt: number;
  jarUpdatedAt: number;
}

/** Serialize a live session for the cookie. Nav URLs are stripped to pathnames. */
export function sessionToCookiePayload(session: SessionData): SessionCookiePayload {
  const nav: Record<string, string> = {};
  for (const [k, v] of Object.entries(session.nav || {})) {
    if (!v) continue;
    try { nav[k] = new URL(v).pathname; }
    catch { if (v.startsWith("/")) nav[k] = v; }
  }
  return {
    id: session.id,
    enrollment: session.enrollment,
    name: session.name,
    instituteId: session.instituteId,
    subUserType: session.subUserType,
    cookies: { ...session.cookies },
    nav,
    loggedInAt: session.loggedInAt,
    jarUpdatedAt: session.jarUpdatedAt || session.loggedInAt
  };
}

export function encryptSessionPayload(payload: SessionCookiePayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSessionPayload(token: string | undefined | null): SessionCookiePayload | null {
  if (!token) return null;
  // GCM tokens are pure base64url and never contain "."; a dotted token is
  // the legacy signed-id format handled by parseSessionCookie below.
  if (token.includes(".")) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null; // iv + tag + at least 1 byte of JSON
    const iv = raw.subarray(0, 12); const tag = raw.subarray(12, 28); const enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    const parsed = JSON.parse(dec.toString("utf8")) as SessionCookiePayload;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.cookies !== "object" || parsed.cookies === null) return null;
    if (typeof parsed.enrollment !== "string" || typeof parsed.loggedInAt !== "number") return null;
    parsed.nav = parsed.nav && typeof parsed.nav === "object" ? parsed.nav : {};
    if (typeof parsed.jarUpdatedAt !== "number") parsed.jarUpdatedAt = parsed.loggedInAt;
    return parsed;
  } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* Legacy (v2) cookie: "<id>.<base64url hmac>" — id-only, jar in the   */
/* server store. Kept so sessions minted before this release can be    */
/* migrated: getSession() accepts a legacy cookie when a matching      */
/* store entry exists, and the next response upgrades it to a payload. */
/* ------------------------------------------------------------------ */

export function signSessionId(id: string): string {
  const sig = createHmac("sha256", key()).update(id).digest("base64url");
  return `${id}.${sig}`;
}

export function parseSessionCookie(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", key()).update(id).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch { return null; }
  return id;
}

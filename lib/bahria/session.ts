import { createHash, createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "bahria_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours, sliding
export const SESSION_COOKIE_MAX_AGE = 12 * 60 * 60; // seconds

// WARNING: the fallback is only for local development. Always set SESSION_SECRET in production.
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me-please";
function signingKey(): Buffer { return createHash("sha256").update(SECRET).digest(); }

/**
 * The browser cookie holds ONLY an opaque session id, HMAC-signed so it
 * cannot be forged or tampered with. The actual Bahria session (cookie jar,
 * profile, discovered nav) lives server-side in lib/bahria/store.ts.
 * Format: "<id>.<base64url hmac>"
 */
export function signSessionId(id: string): string {
  const sig = createHmac("sha256", signingKey()).update(id).digest("base64url");
  return `${id}.${sig}`;
}

export function parseSessionCookie(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", signingKey()).update(id).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch { return null; }
  return id;
}

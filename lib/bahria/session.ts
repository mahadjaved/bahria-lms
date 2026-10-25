import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { SessionData } from "./types";

export const SESSION_COOKIE = "bahria_session";
// WARNING: the fallback is only for local development. Always set SESSION_SECRET in production.
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me-please";
function key(): Buffer { return createHash("sha256").update(SECRET).digest(); }

export function encryptSession(data: SessionData): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}
export function decryptSession(token: string | undefined | null): SessionData | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, 12); const tag = raw.subarray(12, 28); const enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString("utf8")) as SessionData;
  } catch { return null; }
}

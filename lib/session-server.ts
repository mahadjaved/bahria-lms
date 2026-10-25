import { cookies } from "next/headers";
import { SESSION_COOKIE, parseSessionCookie } from "./bahria/session";
import { getStoredSession } from "./bahria/store";
import { UnauthorizedError, type SessionData } from "./bahria/types";

/**
 * Read the signed session id from the browser cookie and look the live
 * session up in the server-side store. Throws when the cookie is missing,
 * forged, unknown, or past its (sliding) 12h TTL.
 */
export function getSession(): SessionData {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const id = parseSessionCookie(token);
  const session = getStoredSession(id);
  if (!session) throw new UnauthorizedError();
  return session;
}
export function getSessionId(): string | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return parseSessionCookie(token);
}
export function trySession(): SessionData | null {
  try { return getSession(); } catch { return null; }
}

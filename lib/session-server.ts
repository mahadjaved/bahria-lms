import { cookies } from "next/headers";
import { BAHRIA_BASE_URL } from "./bahria/constants";
import {
  SESSION_COOKIE, SESSION_TTL_MS, decryptSessionPayload, parseSessionCookie,
  type SessionCookiePayload
} from "./bahria/session";
import { getStoredSession, isRevokedSession, saveSession } from "./bahria/store";
import { UnauthorizedError, type SessionData } from "./bahria/types";

/** Nav values travel in the cookie as pathnames; in memory they are absolute URLs. */
function rehydrateNav(nav: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(nav || {})) {
    if (!v) continue;
    out[k] = v.startsWith("/") ? BAHRIA_BASE_URL + v : v;
  }
  return out;
}

function sessionFromPayload(payload: SessionCookiePayload): SessionData {
  return {
    id: payload.id,
    cookies: { ...payload.cookies },
    enrollment: payload.enrollment,
    instituteId: payload.instituteId,
    subUserType: payload.subUserType,
    name: payload.name,
    loggedInAt: payload.loggedInAt,
    createdAt: payload.loggedInAt,
    lastSeenAt: Date.now(),
    jarUpdatedAt: payload.jarUpdatedAt,
    nav: rehydrateNav(payload.nav)
  };

}

/** Resolve the signed server-side session, accepting old encrypted cookies
 * during migration. The live store is authoritative whenever it has an entry. */
export function getSession(): SessionData {
  const token = cookies().get(SESSION_COOKIE)?.value;

  const payload = decryptSessionPayload(token);
  if (payload) {
    // An explicit logout revokes the id, even for a replayed cookie copy.
    if (isRevokedSession(payload.id)) throw new UnauthorizedError();
    const stored = getStoredSession(payload.id);
    if (stored) return stored;
    // Old encrypted cookies can be restored if their original activity is still valid.
    const lastActivity = Math.max(payload.loggedInAt || 0, payload.jarUpdatedAt || 0);
    if (Date.now() - lastActivity > SESSION_TTL_MS) throw new UnauthorizedError();
    const session = sessionFromPayload(payload);
    // Restore a valid legacy session into the store.
    saveSession(session);
    return session;
  }

  // Current signed-id cookie + live store entry.
  const id = parseSessionCookie(token);
  if (isRevokedSession(id)) throw new UnauthorizedError();
  const session = getStoredSession(id);
  if (!session) throw new UnauthorizedError();
  return session;
}

/** The session id from either cookie format (used by logout). */
export function getSessionId(): string | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = decryptSessionPayload(token);
  if (payload) return payload.id;
  return parseSessionCookie(token);
}

export function trySession(): SessionData | null {
  try { return getSession(); } catch { return null; }
}

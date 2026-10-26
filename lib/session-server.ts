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

function sessionFromPayload(payload: SessionCookiePayload, stored: SessionData | null): SessionData {
  const session: SessionData = {
    id: payload.id,
    cookies: { ...payload.cookies },
    enrollment: payload.enrollment,
    instituteId: payload.instituteId,
    subUserType: payload.subUserType,
    name: payload.name,
    loggedInAt: payload.loggedInAt,
    createdAt: stored?.createdAt ?? payload.loggedInAt,
    lastSeenAt: Date.now(),
    jarUpdatedAt: payload.jarUpdatedAt,
    nav: rehydrateNav(payload.nav),
    navDiscoveredAt: stored?.navDiscoveredAt
  };
  // Merge with the server-side cache: whichever side touched the Bahria
  // jar more recently wins for jar + nav (a request that just completed on
  // this process may hold a fresher jar than the cookie the browser sent).
  if (stored && (stored.jarUpdatedAt || 0) > (session.jarUpdatedAt || 0)) {
    session.cookies = stored.cookies;
    session.nav = stored.nav;
    session.jarUpdatedAt = stored.jarUpdatedAt;
    if (stored.name) session.name = stored.name;
    if (stored.navDiscoveredAt) session.navDiscoveredAt = stored.navDiscoveredAt;
  }
  return session;
}

/**
 * Resolve the current session. Primary source: the encrypted cookie
 * payload (authoritative — it travels with the browser, so ANY process or
 * instance can serve the request). The server store is merged in as a
 * cache and kept updated. Legacy signed-id cookies are accepted when a
 * matching store entry exists (migration path from the previous release).
 * Throws UnauthorizedError when there is no valid, unexpired session.
 */
export function getSession(): SessionData {
  const token = cookies().get(SESSION_COOKIE)?.value;

  const payload = decryptSessionPayload(token);
  if (payload) {
    // An explicit logout revokes the id, even for a replayed cookie copy.
    if (isRevokedSession(payload.id)) throw new UnauthorizedError();
    // Sliding 12h TTL, judged by last jar activity / login time.
    const lastActivity = Math.max(payload.loggedInAt || 0, payload.jarUpdatedAt || 0);
    if (Date.now() - lastActivity > SESSION_TTL_MS) throw new UnauthorizedError();
    const stored = getStoredSession(payload.id);
    const session = sessionFromPayload(payload, stored);
    // Keep the store warm as a cache (and so the per-session lock/merge on
    // this process has the freshest copy).
    saveSession(session);
    return session;
  }

  // Legacy migration: id-only signed cookie + a live store entry.
  const session = getStoredSession(parseSessionCookie(token));
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

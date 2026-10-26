import { randomBytes } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { SESSION_TTL_MS } from "./session";
import type { SessionData, SessionSeed } from "./types";

/**
 * Server-side session store — now a per-process CACHE, not the authority.
 *
 * History: v1 kept the jar only in the browser cookie but never wrote
 * refreshes back (Aspire rotates its session cookie, so the browser's stale
 * jar got users bounced to Login within seconds). v2 kept the jar only
 * here — which fixed rotation but broke whenever a request landed on a
 * different process/instance than the login (dev workers, restarts,
 * serverless): the store simply didn't have the session and the app
 * reported "logged out" mid-browsing.
 *
 * Current design: the encrypted browser cookie is the authoritative
 * carrier and is re-issued with the freshest jar on EVERY API response
 * (see session.ts + api-helpers.ts `withSessionCookie`). This store stays
 * as a cache (merged with the cookie payload on read — larger
 * `jarUpdatedAt` wins) and as the per-session request lock. Sessions also
 * persist to .data/sessions.json (gitignored) as a best-effort extra.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "sessions.json");
const REVOKED_FILE = path.join(DATA_DIR, "revoked.json");

interface StoreShape {
  sessions: Map<string, SessionData>;
  chains: Map<string, Promise<void>>;
  /** Session ids killed by an explicit logout: id -> revoked-at (ms). */
  revoked: Map<string, number>;
  loaded: boolean;
}

// Survive Next dev HMR by keeping the store on globalThis.
const g = globalThis as unknown as { __bahriaStore?: StoreShape };
function store(): StoreShape {
  if (!g.__bahriaStore) g.__bahriaStore = { sessions: new Map(), chains: new Map(), revoked: new Map(), loaded: false };
  if (!g.__bahriaStore.loaded) {
    g.__bahriaStore.loaded = true;
    const now = Date.now();
    try {
      const raw = readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as SessionData[];
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (s && s.id && now - (s.lastSeenAt || 0) < SESSION_TTL_MS) g.__bahriaStore.sessions.set(s.id, s);
        }
      }
    } catch { /* no file yet / unreadable — sessions just start empty */ }
    try {
      const raw = readFileSync(REVOKED_FILE, "utf8");
      const parsed = JSON.parse(raw) as [string, number][];
      if (Array.isArray(parsed)) {
        for (const [id, at] of parsed) {
          if (id && typeof at === "number" && now - at < SESSION_TTL_MS) g.__bahriaStore.revoked.set(id, at);
        }
      }
    } catch { /* no revocations yet */ }
  }
  return g.__bahriaStore;
}

function persist() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify([...store().sessions.values()]), "utf8");
  } catch { /* best-effort only */ }
}

function persistRevoked() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(REVOKED_FILE, JSON.stringify([...store().revoked.entries()]), "utf8");
  } catch { /* best-effort only */ }
}

/**
 * Was this session id explicitly logged out? The session cookie is
 * self-contained, so without a denylist a replayed pre-logout cookie would
 * resurrect the session. The list is per-process (persisted to disk
 * best-effort): it restores the old store-only logout semantics wherever
 * the store lives; a cookie replayed to a never-involved instance can
 * still only live until its 12h TTL.
 */
export function isRevokedSession(id: string | null | undefined): boolean {
  if (!id) return false;
  const s = store();
  const at = s.revoked.get(id);
  if (at === undefined) return false;
  if (Date.now() - at > SESSION_TTL_MS) { s.revoked.delete(id); return false; }
  return true;
}

export function createSession(seed: SessionSeed): SessionData {
  const s = store();
  const id = randomBytes(24).toString("base64url");
  const now = Date.now();
  const session: SessionData = {
    ...seed,
    id,
    createdAt: now,
    lastSeenAt: now,
    jarUpdatedAt: seed.jarUpdatedAt ?? now,
    nav: seed.nav || {}
  };
  s.sessions.set(id, session);
  persist();
  return session;
}

export function getStoredSession(id: string | null | undefined): SessionData | null {
  if (!id) return null;
  const s = store();
  const session = s.sessions.get(id);
  if (!session) return null;
  const now = Date.now();
  if (now - session.lastSeenAt > SESSION_TTL_MS) {
    s.sessions.delete(id);
    persist();
    return null;
  }
  // Sliding TTL: activity keeps the session alive.
  session.lastSeenAt = now;
  return session;
}

/** Persist the (possibly mutated) session back to the store + disk. */
export function saveSession(session: SessionData) {
  const s = store();
  // Never resurrect a logged-out session (an in-flight request that started
  // before the logout may still try to save its snapshot afterwards).
  if (s.revoked.has(session.id)) return;
  session.lastSeenAt = Date.now();
  s.sessions.set(session.id, session);
  persist();
}

export function deleteSession(id: string | null | undefined) {
  if (!id) return;
  const s = store();
  if (s.sessions.delete(id)) persist();
  s.chains.delete(id);
  // Record the revocation so a replayed copy of the (self-contained)
  // session cookie is refused too — see isRevokedSession.
  s.revoked.set(id, Date.now());
  persistRevoked();
}

/**
 * Serialize all portal work for one session through a promise chain, so
 * parallel dashboard requests can't race and corrupt the cookie jar.
 * NOT re-entrant: public client entry points acquire the lock once and
 * call the internal (unlocked) helpers from inside it.
 */
export async function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const s = store();
  const prev = s.chains.get(id) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  s.chains.set(id, prev.then(() => current));
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

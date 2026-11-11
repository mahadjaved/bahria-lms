import { randomBytes } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { SESSION_TTL_MS } from "./session";
import type { SessionData, SessionSeed } from "./types";

/** Server-side session state and per-session request locks. Run on one
 * persistent instance: the in-memory lock is not shared between processes. */

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
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(DATA_FILE, JSON.stringify([...store().sessions.values()]), { encoding: "utf8", mode: 0o600 });
  } catch { /* best-effort only */ }
}

function persistRevoked() {
  try {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(REVOKED_FILE, JSON.stringify([...store().revoked.entries()]), "utf8");
  } catch { /* best-effort only */ }
}

/** Revocations also reject encrypted cookies issued by older versions. */
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
  const chain = prev.then(() => current);
  s.chains.set(id, chain);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (s.chains.get(id) === chain) s.chains.delete(id);
  }
}

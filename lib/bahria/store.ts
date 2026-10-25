import { randomBytes } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { SESSION_TTL_MS } from "./session";
import type { SessionData, SessionSeed } from "./types";

/**
 * Server-side session store.
 *
 * Why this exists: the previous design kept an encrypted snapshot of the
 * Bahria cookie jar in the browser cookie. Aspire rotates its session
 * cookie after login, and refreshed cookies were never written back to the
 * browser — so every request after the first reused a stale jar, Bahria
 * redirected to Login.aspx, and the app reported the session as "expired"
 * within seconds. Now the jar lives here, server-side, and is updated
 * after every single portal response.
 *
 * Sessions persist to .data/sessions.json (gitignored) so a dev-server
 * restart doesn't log everyone out. All file IO is best-effort.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "sessions.json");

interface StoreShape {
  sessions: Map<string, SessionData>;
  chains: Map<string, Promise<void>>;
  loaded: boolean;
}

// Survive Next dev HMR by keeping the store on globalThis.
const g = globalThis as unknown as { __bahriaStore?: StoreShape };
function store(): StoreShape {
  if (!g.__bahriaStore) g.__bahriaStore = { sessions: new Map(), chains: new Map(), loaded: false };
  if (!g.__bahriaStore.loaded) {
    g.__bahriaStore.loaded = true;
    try {
      const raw = readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as SessionData[];
      if (Array.isArray(parsed)) {
        const now = Date.now();
        for (const s of parsed) {
          if (s && s.id && now - (s.lastSeenAt || 0) < SESSION_TTL_MS) g.__bahriaStore.sessions.set(s.id, s);
        }
      }
    } catch { /* no file yet / unreadable — sessions just start empty */ }
  }
  return g.__bahriaStore;
}

function persist() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify([...store().sessions.values()]), "utf8");
  } catch { /* best-effort only */ }
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
  session.lastSeenAt = Date.now();
  s.sessions.set(session.id, session);
  persist();
}

export function deleteSession(id: string | null | undefined) {
  if (!id) return;
  const s = store();
  if (s.sessions.delete(id)) persist();
  s.chains.delete(id);
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

import { cookies } from "next/headers";
import { SESSION_COOKIE, decryptSession } from "./bahria/session";
import { UnauthorizedError, type SessionData } from "./bahria/types";
export function getSession(): SessionData {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = decryptSession(token);
  if (!session) throw new UnauthorizedError();
  return session;
}
export function trySession(): SessionData | null {
  try { return getSession(); } catch { return null; }
}

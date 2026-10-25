import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/bahria/session";
import { deleteSession } from "@/lib/bahria/store";
import { getSessionId } from "@/lib/session-server";
export async function POST() {
  // Remove the server-side session (and its Bahria cookie jar) too,
  // not just the browser cookie.
  try { deleteSession(getSessionId()); } catch { /* cookie may already be gone */ }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

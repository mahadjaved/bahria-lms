import { NextResponse } from "next/server";
import { trySession } from "@/lib/session-server";
import { withSessionCookie } from "@/lib/api-helpers";
export async function GET() {
  const session = trySession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  const res = NextResponse.json({ ok: true, user: { enrollment: session.enrollment, name: session.name || null, instituteId: session.instituteId, subUserType: session.subUserType } });
  // Write the session cookie back (also upgrades legacy id-only cookies to
  // full payloads on first hit after an upgrade).
  return withSessionCookie(res, session);
}

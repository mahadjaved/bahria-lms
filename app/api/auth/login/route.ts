import { NextRequest, NextResponse } from "next/server";
import { loginToBahria } from "@/lib/bahria/client";
import { withSessionCookie } from "@/lib/api-helpers";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { enrollment, password, instituteId, subUserType } = body || {};
    if (!enrollment || !password || !instituteId) return NextResponse.json({ ok: false, error: "Enrollment, password and institute are required." }, { status: 400 });
    const { session } = await loginToBahria({ enrollment: String(enrollment).trim(), password: String(password), instituteId: String(instituteId), subUserType: subUserType ? String(subUserType) : "None" });
    const res = NextResponse.json({ ok: true, user: { enrollment: session.enrollment, name: session.name || null, instituteId: session.instituteId } });
    // The cookie carries the FULL encrypted session (Bahria cookie jar
    // included), so the session travels with the browser and works on any
    // server instance. It is re-issued with the freshest jar on every
    // response — see withSessionCookie in lib/api-helpers.ts.
    return withSessionCookie(res, session);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Login failed" }, { status: 401 });
  }
}

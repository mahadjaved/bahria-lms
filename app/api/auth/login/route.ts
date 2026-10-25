import { NextRequest, NextResponse } from "next/server";
import { loginToBahria } from "@/lib/bahria/client";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, signSessionId } from "@/lib/bahria/session";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { enrollment, password, instituteId, subUserType } = body || {};
    if (!enrollment || !password || !instituteId) return NextResponse.json({ ok: false, error: "Enrollment, password and institute are required." }, { status: 400 });
    const { session } = await loginToBahria({ enrollment: String(enrollment).trim(), password: String(password), instituteId: String(instituteId), subUserType: subUserType ? String(subUserType) : "None" });
    const res = NextResponse.json({ ok: true, user: { enrollment: session.enrollment, name: session.name || null, instituteId: session.instituteId } });
    // The cookie carries only the signed opaque session id — the Bahria
    // cookie jar itself stays in the server-side session store, so cookie
    // rotation by the portal can never strand the browser with a stale jar.
    res.cookies.set(SESSION_COOKIE, signSessionId(session.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_COOKIE_MAX_AGE });
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Login failed" }, { status: 401 });
  }
}

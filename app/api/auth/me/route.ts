import { NextResponse } from "next/server";
import { trySession } from "@/lib/session-server";
export async function GET() {
  const session = trySession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  return NextResponse.json({ ok: true, user: { enrollment: session.enrollment, name: session.name || null, instituteId: session.instituteId, subUserType: session.subUserType } });
}

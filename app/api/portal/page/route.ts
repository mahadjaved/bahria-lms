import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session-server";
import { getPortalPage } from "@/lib/bahria/client";
import { UnauthorizedError } from "@/lib/bahria/types";
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path");
    if (!path || !path.startsWith("/")) return NextResponse.json({ ok: false, error: "Provide a portal path starting with /, e.g. ?path=/Sys/Student/Dashboard.aspx" }, { status: 400 });
    if (path.includes("..")) return NextResponse.json({ ok: false, error: "Invalid path" }, { status: 400 });
    const session = getSession();
    const page = await getPortalPage(session, path);
    return NextResponse.json({ ok: true, page });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to fetch portal page" }, { status: 502 });
  }
}

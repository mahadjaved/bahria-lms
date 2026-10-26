import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-server";
import { ensureNav } from "@/lib/bahria/client";
import { PORTAL_FEATURES, PORTAL_PATHS } from "@/lib/bahria/paths";
import { BAHRIA_BASE_URL, LMS_BASE_URL } from "@/lib/bahria/constants";
import { withSessionCookie } from "@/lib/api-helpers";
import { UnauthorizedError, type SessionData } from "@/lib/bahria/types";

/** Features served from the LMS host; everything else is a CMS (/Sys/...) page. */
const LMS_FEATURES = new Set(["assignments", "quizzes", "materials", "announcements"]);

/**
 * Portal diagnostics — URLs only, no personal data.
 * Shows which portal URL each feature resolves to: the verified real path
 * (primary), or the URL discovered from the authenticated menu when the
 * verified path doesn't apply. Safe to share when a section comes up empty.
 */
export async function GET() {
  let session: SessionData | null = null;
  try {
    session = getSession();
    const nav = await ensureNav(session);
    const resolved: Record<string, { url: string; source: "verified" | "discovered" }> = {};
    for (const feature of PORTAL_FEATURES) {
      // LMS features resolve to their verified LMS page; CMS features to
      // their verified CMS path. `nav` above still shows any menu URLs that
      // discovery found, for comparison.
      const base = LMS_FEATURES.has(feature) ? LMS_BASE_URL : BAHRIA_BASE_URL;
      resolved[feature] = { url: base + PORTAL_PATHS[feature][0], source: "verified" };
    }
    return withSessionCookie(NextResponse.json({ ok: true, nav, navDiscoveredAt: session.navDiscoveredAt || null, resolved }), session);
  } catch (e) {
    const res = e instanceof UnauthorizedError
      ? NextResponse.json({ ok: false, error: e.message }, { status: 401 })
      : NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Diagnostics failed" }, { status: 502 });
    if (session) withSessionCookie(res, session);
    return res;
  }
}

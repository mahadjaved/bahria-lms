import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-server";
import { ensureNav } from "@/lib/bahria/client";
import { PORTAL_FEATURES, PORTAL_PATHS } from "@/lib/bahria/paths";
import { BAHRIA_BASE_URL } from "@/lib/bahria/constants";
import { UnauthorizedError } from "@/lib/bahria/types";

/**
 * Portal diagnostics — URLs only, no personal data.
 * Shows which portal URL each feature resolves to: the URL discovered from
 * the authenticated menu when available, otherwise the first candidate
 * fallback path. Safe to share when a section comes up empty.
 */
export async function GET() {
  try {
    const session = getSession();
    const nav = await ensureNav(session);
    const resolved: Record<string, { url: string; source: "discovered" | "candidate-fallback" }> = {};
    for (const feature of PORTAL_FEATURES) {
      if (nav[feature]) resolved[feature] = { url: nav[feature], source: "discovered" };
      else resolved[feature] = { url: BAHRIA_BASE_URL + PORTAL_PATHS[feature][0], source: "candidate-fallback" };
    }
    return NextResponse.json({ ok: true, nav, navDiscoveredAt: session.navDiscoveredAt || null, resolved });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Diagnostics failed" }, { status: 502 });
  }
}

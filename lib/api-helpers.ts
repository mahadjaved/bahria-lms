import { NextResponse } from "next/server";
import { getSession } from "./session-server";
import { getFeaturePage, getCourseResources, attendanceSummary } from "./bahria/client";
import type { PortalFeature } from "./bahria/paths";
import { UnauthorizedError } from "./bahria/types";

function errorResponse(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load data from Bahria portal" }, { status: 502 });
}

export async function featureResponse(feature: PortalFeature, extra?: (page: any) => object) {
  try {
    const session = getSession();
    const page = await getFeaturePage(session, feature);
    return NextResponse.json({ ok: true, page, ...(extra ? extra(page) : {}) });
  } catch (e) { return errorResponse(e); }
}

export async function resourcesResponse(kind: "assignments" | "quizzes" | "materials") {
  try {
    const session = getSession();
    const resources = await getCourseResources(session, kind);
    return NextResponse.json({ ok: true, ...resources });
  } catch (e) { return errorResponse(e); }
}
export { attendanceSummary };

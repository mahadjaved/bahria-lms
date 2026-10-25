import { NextResponse } from "next/server";
import { getSession } from "./session-server";
import { getFeaturePage, getAttendance, getTimetable, attendanceSummary } from "./bahria/client";
import { getLmsFeature, type LmsKind } from "./bahria/lms";
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

export async function attendanceResponse() {
  try {
    const session = getSession();
    const result = await getAttendance(session);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return errorResponse(e); }
}

export async function timetableResponse() {
  try {
    const session = getSession();
    const result = await getTimetable(session);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return errorResponse(e); }
}

/** Assignments / Quizzes / Materials / Announcements live on the LMS host and are harvested per course. */
export async function resourcesResponse(kind: LmsKind) {
  try {
    const session = getSession();
    const result = await getLmsFeature(session, kind);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return errorResponse(e); }
}
export { attendanceSummary };

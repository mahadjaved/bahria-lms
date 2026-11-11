import { NextResponse } from "next/server";
import { getSession } from "./session-server";
import { getFeaturePage, getAttendance, getTimetable, attendanceSummary } from "./bahria/client";
import { getLmsFeature, type LmsKind } from "./bahria/lms";
import type { PortalFeature } from "./bahria/paths";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, signSessionId } from "./bahria/session";
import { UnauthorizedError, type SessionData } from "./bahria/types";

/** Set only on login, so late parallel responses cannot replace a newer session. */
export function setSessionCookie(res: NextResponse, session: SessionData): NextResponse {
  res.cookies.set(SESSION_COOKIE, signSessionId(session.id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_COOKIE_MAX_AGE
  });
  return res;
}

function errorResponse(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load data from Bahria portal" }, { status: 502 });
}

/** Resolve the session and translate portal errors into API responses. */
async function respond<T>(build: (session: SessionData) => Promise<T>): Promise<NextResponse> {
  try {
    const session = getSession();
    const body = await build(session);
    return NextResponse.json(body);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function featureResponse(feature: PortalFeature, extra?: (page: any) => object) {
  return respond(async (session) => {
    const page = await getFeaturePage(session, feature);
    return { ok: true, page, ...(extra ? extra(page) : {}) };
  });
}

export async function attendanceResponse() {
  return respond(async (session) => {
    const result = await getAttendance(session);
    return { ok: true, ...result };
  });
}

export async function timetableResponse() {
  return respond(async (session) => {
    const result = await getTimetable(session);
    return { ok: true, ...result };
  });
}

/** Assignments / Quizzes / Materials / Announcements live on the LMS host and are harvested per course. */
export async function resourcesResponse(kind: LmsKind) {
  return respond(async (session) => {
    const result = await getLmsFeature(session, kind);
    return { ok: true, ...result };
  });
}
export { attendanceSummary };

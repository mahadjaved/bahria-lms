import { NextResponse } from "next/server";
import { getSession } from "./session-server";
import { getFeaturePage, getAttendance, getTimetable, attendanceSummary } from "./bahria/client";
import { getLmsFeature, type LmsKind } from "./bahria/lms";
import type { PortalFeature } from "./bahria/paths";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, encryptSessionPayload, sessionToCookiePayload } from "./bahria/session";
import { UnauthorizedError, type SessionData } from "./bahria/types";

/**
 * Re-issue the session cookie with the LIVE session state (freshest Bahria
 * cookie jar included). This write-back on EVERY response is what makes
 * the cookie-carried session work: Aspire rotates its cookies, and the
 * browser must always present the newest jar — whichever server process
 * or instance happens to serve the next request.
 */
export function withSessionCookie(res: NextResponse, session: SessionData): NextResponse {
  res.cookies.set(SESSION_COOKIE, encryptSessionPayload(sessionToCookiePayload(session)), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_COOKIE_MAX_AGE
  });
  return res;
}

function errorResponse(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load data from Bahria portal" }, { status: 502 });
}

/**
 * Wrap a response builder: load the session, run, and ALWAYS write the
 * refreshed session cookie back when a session was loaded — on success
 * AND on error (a failed portal call may still have rotated the jar; and
 * for UnauthorizedError the session is by definition gone, but if a
 * session object exists the freshest state is still the truthful one).
 */
async function respond<T>(build: (session: SessionData) => Promise<T>): Promise<NextResponse> {
  let session: SessionData | null = null;
  try {
    session = getSession();
    const body = await build(session);
    return withSessionCookie(NextResponse.json(body), session);
  } catch (e) {
    const res = errorResponse(e);
    if (session) withSessionCookie(res, session);
    return res;
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

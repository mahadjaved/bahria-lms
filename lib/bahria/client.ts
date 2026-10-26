import * as cheerio from "cheerio";
import { Impit } from "impit";
import { BAHRIA_BASE_URL, LOGIN_PATH } from "./constants";
import { PORTAL_PATHS, type PortalFeature } from "./paths";
import {
  parsePortalPage, extractHiddenFields, extractErrorText, extractStudentName, extractCalendarJson,
  analyzeWebForm, isSemesterSelect, pickSemesterValue, pickActionButton, type WebFormInfo
} from "./parser";
import {
  UnauthorizedError, type AttendanceCourse, type AttendanceResult, type PortalLink, type PortalPage,
  type SessionData, type TimetableResult
} from "./types";
import { createSession, getStoredSession, saveSession, withSessionLock } from "./store";

/**
 * ALL portal traffic goes through ONE Chrome-impersonating HTTP client.
 *
 * Why: cms.bahria.edu.pk sits behind a WAF that fingerprints the TLS/HTTP2
 * stack. A plain Node fetch (or curl) login appears to succeed, but the
 * session is then killed at /Sys/Student/PrepareSession.aspx and bounced
 * PrepareSession -> Logoff.aspx -> Login.aspx. With a real Chrome
 * fingerprint (impit, `browser: "chrome"`) the identical flow lands on the
 * dashboard and stays alive. Do not replace this with global fetch.
 */
const g = globalThis as unknown as { __bahriaImpit?: Impit };
function http(): Impit {
  if (!g.__bahriaImpit) g.__bahriaImpit = new Impit({ browser: "chrome" });
  return g.__bahriaImpit;
}

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type CookieJar = Map<string, string>;
export function jarFromRecord(rec: Record<string, string>): CookieJar { return new Map(Object.entries(rec)); }
export function jarToRecord(jar: CookieJar): Record<string, string> { return Object.fromEntries(jar); }
function cookieHeader(jar: CookieJar): string { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
function storeCookies(jar: CookieJar, res: { headers: Headers }) {
  const setCookies: string[] = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
    ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [];
  for (const sc of setCookies) {
    const pair = sc.split(";")[0]; const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

export interface FetchResult { status: number; url: string; html: string; jar: CookieJar; }

/**
 * Cookie-aware fetch with manual redirect handling: every hop's Set-Cookie
 * headers are folded into the jar immediately (the caller persists the jar
 * to the session store after the whole operation).
 */
export async function fetchWithJar(jar: CookieJar, url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}, maxRedirects = 10): Promise<FetchResult> {
  let currentUrl = url; let method = init.method || "GET"; let body = init.body;
  const hadJar = jar.size > 0;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await http().fetch(currentUrl, {
      method: method as "GET" | "POST", body: method === "GET" ? undefined : body, redirect: "manual",
      headers: { "User-Agent": CHROME_UA, ...(init.headers || {}), Cookie: cookieHeader(jar), ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }
    });
    storeCookies(jar, res);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location"); if (!loc) return { status: res.status, url: currentUrl, html: await res.text(), jar };
      const next = new URL(loc, currentUrl);
      // NEVER actually request Logoff.aspx: following that redirect EXECUTES
      // a real portal logoff and burns the session for every other page.
      // A redirect there just means "this session is dead" — surface it as a
      // synthetic result (no request made) and let assertLoggedIn report an
      // expired session. Same for Login.aspx once we hold a live jar: the
      // portal only sends authenticated traffic there when the session died,
      // and rendering it gains nothing. (The anonymous login flow itself is
      // unaffected: it starts with an empty jar and GETs Login.aspx directly.)
      if (/\/Logoff\.aspx$/i.test(next.pathname) || (hadJar && /\/Login\.aspx$/i.test(next.pathname))) {
        return { status: res.status, url: next.toString(), html: "", jar };
      }
      currentUrl = next.toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) { method = "GET"; body = undefined; }
      continue;
    }
    return { status: res.status, url: currentUrl, html: await res.text(), jar };
  }
  throw new Error("Too many redirects from Bahria portal");
}

function assertLoggedIn(result: FetchResult) {
  if (result.url.includes("Login.aspx") || result.url.includes("Logoff.aspx")) {
    throw new UnauthorizedError("Bahria session expired. Please log in again.");
  }
}
export function resolveUrl(path: string): string {
  return path.startsWith("http") ? path : BAHRIA_BASE_URL + (path.startsWith("/") ? path : "/" + path);
}
function pageScore(page: PortalPage): number {
  const rows = page.tables.reduce((n, t) => n + t.rows.length, 0);
  return rows * 10 + page.tables.length * 2 + page.headings.length;
}
function pageHasData(page: PortalPage): boolean { return page.tables.some((t) => t.rows.length > 0); }

/* ------------------------------------------------------------------ */
/* Nav discovery (bonus — the verified paths in paths.ts are primary)  */
/* ------------------------------------------------------------------ */

const NAV_RULES: [PortalFeature, RegExp][] = [
  ["announcements", /announcement/i],
  ["assignments", /assignment/i],
  ["quizzes", /quiz/i],
  ["materials", /lecture|course\s?folder|coursefolder|material|notes|download|resource/i],
  ["lms", /go\s?to\s?lms|\blms\b/i],
  ["attendance", /attendance/i],
  ["marks", /marks|result|exam/i],
  ["timetable", /timetable|time\s?table|schedule/i],
  ["fee", /fee|challan/i],
  ["courses", /course|enrolled|registered/i],
  ["profile", /profile|personal/i],
  ["dashboard", /dashboard|home|default/i]
];

export function classifyNavLinks(links: PortalLink[]): Partial<Record<PortalFeature, string>> {
  const found: Partial<Record<PortalFeature, string>> = {};
  for (const link of links) {
    if (!link.href.includes("bahria.edu.pk")) continue;
    if (/logout|log\s?out|sign\s?out/i.test(link.text) || link.href.includes("Login.aspx")) continue;
    const hay = `${link.text} ${link.href}`;
    for (const [feature, re] of NAV_RULES) {
      if (re.test(hay)) {
        if (!found[feature]) found[feature] = link.href;
        break; // first matching rule claims the link
      }
    }
  }
  return found;
}

/**
 * Cheap nav absorption: classify the links of a page the app already
 * fetched for a real feature and fill any nav gaps. NO extra requests —
 * discovery must never crawl guessed URLs (a wrong guess can redirect
 * toward Logoff.aspx and, worse, taught us nothing the verified paths
 * don't already cover). The login landing page is the seed; every real
 * feature page response feeds this too.
 */
function absorbNavLinks(session: SessionData, page: PortalPage) {
  const found = classifyNavLinks(page.links);
  let changed = false;
  for (const [k, v] of Object.entries(found)) {
    if (v && !session.nav[k]) { session.nav[k] = v; changed = true; }
  }
  if (changed) session.navDiscoveredAt = Date.now();
}

async function discoverNavInternal(session: SessionData, seedHtml?: string, seedUrl?: string) {
  if (seedHtml && seedUrl) {
    absorbNavLinks(session, parsePortalPage(seedHtml, seedUrl));
    if (!session.name) session.name = extractStudentName(seedHtml);
  }
  session.navDiscoveredAt = Date.now();
}

async function ensureNavInternal(session: SessionData) {
  const stale = !session.navDiscoveredAt || Date.now() - session.navDiscoveredAt > 60 * 60 * 1000;
  if (Object.keys(session.nav).length === 0 || stale) {
    // Seed-only now: with no fresh page in hand there is nothing safe to
    // fetch (no guessed-URL crawling). Real feature fetches re-absorb the
    // menu via absorbNavLinks as a side effect.
    await discoverNavInternal(session);
  }
}

/** Candidate URLs for a CMS feature: verified path first, then the discovered menu URL, then fallbacks. */
function featureCandidates(session: SessionData, feature: PortalFeature): string[] {
  const paths = PORTAL_PATHS[feature] as unknown as string[];
  const all = [BAHRIA_BASE_URL + paths[0], session.nav[feature], ...paths.slice(1).map((p) => BAHRIA_BASE_URL + p)];
  return all.filter((v, i, a): v is string => !!v && a.indexOf(v) === i && v.includes("/Sys/"));
}

/* ------------------------------------------------------------------ */
/* WebForms postbacks (fallback for CMS pages whose grids need one)    */
/* ------------------------------------------------------------------ */

interface PostbackAttempt { target: string; overrides: Record<string, string>; }
function buildAttempts(info: WebFormInfo): PostbackAttempt[] {
  const attempts: PostbackAttempt[] = [];
  const semSel = info.selects.find(isSemesterSelect);
  const semOverrides: Record<string, string> = {};
  let semChanged = false;
  if (semSel) {
    const v = pickSemesterValue(semSel);
    semOverrides[semSel.name] = v;
    semChanged = v !== semSel.selectedValue;
  }
  const btn = pickActionButton(info);
  if (btn) attempts.push({ target: btn, overrides: { ...semOverrides } });
  if (semSel && (semChanged || !btn)) attempts.push({ target: semSel.name, overrides: { ...semOverrides } });
  return attempts.slice(0, 3);
}

async function doPostback(jar: CookieJar, info: WebFormInfo, attempt: PostbackAttempt): Promise<FetchResult> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(info.fields)) form.set(k, v);
  for (const sel of info.selects) if (form.get(sel.name) === null) form.set(sel.name, sel.selectedValue);
  for (const [k, v] of Object.entries(attempt.overrides)) form.set(k, v);
  form.set("__EVENTTARGET", attempt.target);
  if (form.get("__EVENTARGUMENT") === null) form.set("__EVENTARGUMENT", "");
  return fetchWithJar(jar, info.action, { method: "POST", body: form.toString() });
}

/**
 * Fetch one candidate URL for a feature. Returns the parsed page AND the
 * HTTP status of the (final) GET, so callers can apply the accept rule:
 * a 200 is the real page — accept it as-is, even with zero data tables
 * (the dashboard legitimately has none). Only 404/transport failures and
 * login bounces (assertLoggedIn) move the caller to the next candidate.
 *
 * WebForms postbacks run ONLY when all of these hold: the GET returned
 * 200, the page has zero data rows, its form actually has selects/buttons,
 * and the feature is not dashboard/profile (those never need a postback;
 * replaying forms there is how stray requests wander toward Logoff).
 */
async function fetchWithPostbacks(
  jar: CookieJar, url: string, budget: { n: number }, feature: PortalFeature
): Promise<{ page: PortalPage; status: number }> {
  const first = await fetchWithJar(jar, url); budget.n++;
  assertLoggedIn(first);
  let best = parsePortalPage(first.html, first.url);
  if (first.status !== 200) return { page: best, status: first.status };
  if (pageHasData(best)) return { page: best, status: 200 };
  if (feature === "dashboard" || feature === "profile") return { page: best, status: 200 };
  const info = analyzeWebForm(first.html, first.url);
  if (!info || (info.selects.length === 0 && !pickActionButton(info))) return { page: best, status: 200 };
  for (const attempt of buildAttempts(info)) {
    if (budget.n >= 12) break;
    try {
      const res = await doPostback(jar, info, attempt); budget.n++;
      assertLoggedIn(res);
      const page = parsePortalPage(res.html, res.url);
      if (pageScore(page) > pageScore(best)) best = page;
      if (pageHasData(page)) return { page, status: 200 };
    } catch (e) { if (e instanceof UnauthorizedError) throw e; }
  }
  return { page: best, status: 200 };
}

/* ------------------------------------------------------------------ */
/* Internal (lock-held) operations                                     */
/* ------------------------------------------------------------------ */

async function getPortalPageInternal(jar: CookieJar, path: string): Promise<PortalPage> {
  const result = await fetchWithJar(jar, resolveUrl(path));
  assertLoggedIn(result);
  return parsePortalPage(result.html, result.url);
}

async function getFeaturePageInternal(session: SessionData, jar: CookieJar, feature: PortalFeature): Promise<PortalPage> {
  await ensureNavInternal(session);
  const candidates = featureCandidates(session, feature);
  const budget = { n: 0 };
  let richest: PortalPage | null = null;
  let lastError: unknown = null;
  // Candidates are ordered verified-path, discovered-URL, guesses. The
  // FIRST candidate that answers HTTP 200 is accepted as the feature's
  // page — even with no data tables (the dashboard has none; a section can
  // legitimately be empty). Guessed fallbacks are consulted only on
  // 404/transport failure; a login bounce throws immediately. Crawling
  // guesses past a healthy 200 wasted requests and risked wandering into
  // a portal logoff.
  for (const url of candidates) {
    if (budget.n >= 12) break;
    try {
      const { page, status } = await fetchWithPostbacks(jar, url, budget, feature);
      absorbNavLinks(session, page);
      if (status === 200) return page;
      if (!richest || pageScore(page) > pageScore(richest)) richest = page;
    } catch (e) {
      lastError = e;
      if (e instanceof UnauthorizedError) throw e;
    }
  }
  if (richest) return richest;
  throw lastError instanceof Error ? lastError : new Error("Could not load page from Bahria portal");
}

/** GET the first candidate that yields an HTTP 200 page (verified pages need no postbacks). */
async function fetchCandidatePage(session: SessionData, jar: CookieJar, feature: PortalFeature): Promise<{ page: PortalPage; html: string; url: string }> {
  await ensureNavInternal(session);
  let richest: { page: PortalPage; html: string; url: string } | null = null;
  let lastError: unknown = null;
  for (const url of featureCandidates(session, feature)) {
    try {
      const r = await fetchWithJar(jar, url);
      assertLoggedIn(r);
      const page = parsePortalPage(r.html, r.url);
      absorbNavLinks(session, page);
      if (r.status === 200) return { page, html: r.html, url: r.url };
      if (!richest || pageScore(page) > pageScore(richest.page)) richest = { page, html: r.html, url: r.url };
    } catch (e) {
      lastError = e;
      if (e instanceof UnauthorizedError) throw e;
    }
  }
  if (richest) return richest;
  throw lastError instanceof Error ? lastError : new Error("Could not load page from Bahria portal");
}

/* ---------------- Attendance: course table -> per-course Detail pages ---------------- */

function num(s: string | undefined): number {
  const n = parseFloat((s || "").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

async function getAttendanceInternal(session: SessionData, jar: CookieJar): Promise<AttendanceResult> {
  const { page, html } = await fetchCandidatePage(session, jar, "attendance");
  // The course table's rows each carry a "Detail" anchor to
  // AttendanceSummary.aspx?v=<encrypted>. Collect them in document order —
  // they pair with the main table's rows in the same order.
  const $ = cheerio.load(html);
  const detailUrls: string[] = [];
  $('a[href*="AttendanceSummary.aspx"]').each((_, a) => {
    const href = $(a).attr("href") || "";
    try { detailUrls.push(new URL(href, page.url).toString()); } catch { /* skip */ }
  });
  const mainTable = page.tables.find((t) => t.rows.length > 0) || null;
  const courses: AttendanceCourse[] = [];
  if (mainTable) {
    for (let i = 0; i < mainTable.rows.length && courses.length < 15; i++) {
      const row = mainTable.rows[i];
      const detailUrl = detailUrls[i] || mainTable.rowLinks?.[i] || null;
      if (!detailUrl || !detailUrl.includes("AttendanceSummary.aspx")) continue;
      try {
        const r = await fetchWithJar(jar, detailUrl);
        assertLoggedIn(r);
        const detail = parsePortalPage(r.html, r.url);
        const sessions = detail.tables.find((t) => t.headers.some((h) => /class date/i.test(h)))
          || detail.tables[1] || null;
        const infoTable = detail.tables.find((t) => t !== sessions) || null;
        const info: [string, string][] = infoTable
          ? infoTable.rows.filter((r2) => r2.length >= 2).map((r2) => [r2[0], r2.slice(1).join(" ")] as [string, string])
          : [];
        let totalHours = 0, presentHours = 0, absentHours = 0;
        if (sessions) {
          const ti = sessions.headers.findIndex((h) => /total hours/i.test(h));
          const pi = sessions.headers.findIndex((h) => /present hours/i.test(h));
          const ai = sessions.headers.findIndex((h) => /absent hours/i.test(h));
          for (const srow of sessions.rows) {
            if (ti >= 0) totalHours += num(srow[ti]);
            if (pi >= 0) presentHours += num(srow[pi]);
            if (ai >= 0) absentHours += num(srow[ai]);
          }
        }
        const percentage = totalHours > 0 ? Math.round((presentHours / totalHours) * 1000) / 10 : null;
        courses.push({
          course: row.filter((c) => !/^detail$/i.test(c.trim())),
          detailUrl,
          info,
          totalHours, presentHours, absentHours,
          percentage,
          sessions
        });
      } catch (e) { if (e instanceof UnauthorizedError) throw e; }
    }
  }
  return { page, courses };
}

/* ---------------- Timetable: schedule JSON in a hidden field ---------------- */

async function getTimetableInternal(session: SessionData, jar: CookieJar): Promise<TimetableResult> {
  await ensureNavInternal(session);
  let richest: PortalPage | null = null;
  let lastError: unknown = null;
  for (const url of featureCandidates(session, "timetable")) {
    try {
      const r = await fetchWithJar(jar, url);
      assertLoggedIn(r);
      const calendar = extractCalendarJson(r.html);
      const page = parsePortalPage(r.html, r.url);
      absorbNavLinks(session, page);
      // Accept the first HTTP 200 (the verified TimeTable page): its
      // schedule JSON either parses or it doesn't — guessed fallbacks
      // would serve a different page, not a better timetable.
      if (r.status === 200) return { page, calendar };
      if (!richest || pageScore(page) > pageScore(richest)) richest = page;
    } catch (e) {
      lastError = e;
      if (e instanceof UnauthorizedError) throw e;
    }
  }
  if (richest) return { page: richest, calendar: null };
  throw lastError instanceof Error ? lastError : new Error("Could not load timetable from Bahria portal");
}

/* ------------------------------------------------------------------ */
/* Public API — every call runs under the per-session lock and the     */
/* mutated cookie jar is written back to the store immediately.        */
/* ------------------------------------------------------------------ */

async function runWithJar<T>(session: SessionData, fn: (jar: CookieJar) => Promise<T>): Promise<T> {
  // Runs under the per-session lock: the previous lock holder has already
  // saved its jar, so if the store copy is fresher than the snapshot this
  // request was authorized with (e.g. a parallel request from the same
  // cookie), adopt the store's jar/nav before touching the portal.
  const stored = getStoredSession(session.id);
  if (stored && stored !== session && (stored.jarUpdatedAt || 0) > (session.jarUpdatedAt || 0)) {
    session.cookies = stored.cookies;
    session.nav = stored.nav;
    session.jarUpdatedAt = stored.jarUpdatedAt;
    if (stored.navDiscoveredAt) session.navDiscoveredAt = stored.navDiscoveredAt;
  }
  const jar = jarFromRecord(session.cookies);
  const before = JSON.stringify(session.cookies);
  try {
    return await fn(jar);
  } finally {
    const next = jarToRecord(jar);
    session.cookies = next;
    // Stamp the jar's freshness whenever it actually changed: this is the
    // clock the cookie<->store merge in session-server.ts compares, and it
    // is what gets written back into the browser cookie by the API layer.
    if (JSON.stringify(next) !== before) session.jarUpdatedAt = Date.now();
    saveSession(session);
  }
}

/** Run `fn` with the session's live cookie jar, under the per-session lock. */
export async function withJar<T>(session: SessionData, fn: (jar: CookieJar) => Promise<T>): Promise<T> {
  return withSessionLock(session.id, () => runWithJar(session, fn));
}

export async function getPortalPage(session: SessionData, path: string): Promise<PortalPage> {
  return withJar(session, (jar) => getPortalPageInternal(jar, path));
}

export async function getFeaturePage(session: SessionData, feature: PortalFeature): Promise<PortalPage> {
  return withJar(session, (jar) => getFeaturePageInternal(session, jar, feature));
}

export async function getAttendance(session: SessionData): Promise<AttendanceResult> {
  return withJar(session, (jar) => getAttendanceInternal(session, jar));
}

export async function getTimetable(session: SessionData): Promise<TimetableResult> {
  return withJar(session, (jar) => getTimetableInternal(session, jar));
}

export async function ensureNav(session: SessionData): Promise<Record<string, string>> {
  return withJar(session, async (jar) => {
    await ensureNavInternal(session);
    return session.nav;
  });
}

export interface LoginResult { session: SessionData; }
export async function loginToBahria(input: { enrollment: string; password: string; instituteId: string; subUserType: string }): Promise<LoginResult> {
  const jar: CookieJar = new Map();
  const loginUrl = BAHRIA_BASE_URL + LOGIN_PATH;
  const first = await fetchWithJar(jar, loginUrl);
  const hidden = extractHiddenFields(first.html);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(hidden)) form.set(k, v);
  form.set("__EVENTTARGET", "ctl00$BodyPH$btnLogin");
  form.set("__EVENTARGUMENT", ""); form.set("__LASTFOCUS", "");
  form.set("ctl00$hfJsEnabled", "1");
  form.set("ctl00$BodyPH$tbEnrollment", input.enrollment);
  form.set("ctl00$BodyPH$tbPassword", input.password);
  form.set("ctl00$BodyPH$ddlInstituteID", input.instituteId);
  form.set("ctl00$BodyPH$ddlSubUserType", input.subUserType);
  const posted = await fetchWithJar(jar, loginUrl, { method: "POST", body: form.toString() });
  // fetchWithJar no longer FOLLOWS redirects into Logoff.aspx/Login.aspx (it
  // returns the target as a synthetic URL instead), so a session killed at
  // PrepareSession surfaces here as a Logoff URL — that is a failed login.
  const stillOnLogin = posted.url.includes("Login.aspx") || posted.url.includes("Logoff.aspx");
  if (stillOnLogin) {
    const err = extractErrorText(posted.html);
    throw new Error(err || "Login failed. Check your enrollment, password, institute and account type.");
  }
  // Establish the LMS (lms.bahria.edu.pk) session inside the same jar NOW:
  // GoToLMS redirects to the LMS dashboard and sets the LMS cookies.
  try {
    await fetchWithJar(jar, BAHRIA_BASE_URL + "/Sys/Common/GoToLMS.aspx");
  } catch { /* LMS warm-up is best-effort; LMS fetchers can retry later */ }
  const name = extractStudentName(posted.html);
  const session = createSession({
    cookies: jarToRecord(jar),
    enrollment: input.enrollment,
    instituteId: input.instituteId,
    subUserType: input.subUserType,
    name,
    loggedInAt: Date.now()
  });
  // Discover the real menu URLs from the authenticated landing page now,
  // while we know the jar is fresh — used as a bonus after verified paths.
  try {
    await discoverNavInternal(session, posted.html, posted.url);
  } catch { /* discovery is best-effort; it retries lazily on first use */ }
  session.cookies = jarToRecord(jar);
  saveSession(session);
  return { session };
}

export function attendanceSummary(page: PortalPage) {
  // Shape attendance tables: find a % column, or Present/Total columns, and compute a percentage.
  return page.tables.map((table) => ({
    headers: table.headers,
    rows: table.rows.map((row) => {
      let percentage: number | null = null;
      row.forEach((cell, i) => {
        const header = (table.headers[i] || "").toLowerCase();
        const pct = cell.match(/(\d+(?:\.\d+)?)\s*%/);
        if (pct && (header.includes("%") || header.includes("percent") || header.includes("attendance"))) percentage = parseFloat(pct[1]);
      });
      if (percentage === null) {
        const presentIdx = table.headers.findIndex((h) => /present|attended/i.test(h));
        const totalIdx = table.headers.findIndex((h) => /total|held|classes/i.test(h));
        if (presentIdx >= 0 && totalIdx >= 0) {
          const p = parseFloat(row[presentIdx]); const t = parseFloat(row[totalIdx]);
          if (!isNaN(p) && !isNaN(t) && t > 0) percentage = Math.round((p / t) * 1000) / 10;
        }
      }
      return { cells: row, percentage };
    })
  }));
}

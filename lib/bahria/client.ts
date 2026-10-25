import { BAHRIA_BASE_URL, LOGIN_PATH } from "./constants";
import { PORTAL_PATHS, type PortalFeature } from "./paths";
import {
  parsePortalPage, extractHiddenFields, extractErrorText, extractStudentName,
  analyzeWebForm, isSemesterSelect, pickSemesterValue, pickActionButton, type WebFormInfo
} from "./parser";
import { UnauthorizedError, type CourseResources, type CourseResourcesGroup, type PortalLink, type PortalPage, type ResourceItem, type SessionData } from "./types";
import { createSession, saveSession, withSessionLock } from "./store";

export type CookieJar = Map<string, string>;
export function jarFromRecord(rec: Record<string, string>): CookieJar { return new Map(Object.entries(rec)); }
export function jarToRecord(jar: CookieJar): Record<string, string> { return Object.fromEntries(jar); }
function cookieHeader(jar: CookieJar): string { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
function storeCookies(jar: CookieJar, res: Response) {
  const setCookies: string[] = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() : [];
  for (const sc of setCookies) {
    const pair = sc.split(";")[0]; const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

interface FetchResult { status: number; url: string; html: string; jar: CookieJar; }
async function fetchWithJar(jar: CookieJar, url: string, init: RequestInit = {}, maxRedirects = 6): Promise<FetchResult> {
  let currentUrl = url; let method = init.method || "GET"; let body = init.body;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      method, body: method === "GET" ? undefined : body, redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", ...(init.headers || {}), Cookie: cookieHeader(jar), ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }
    } as RequestInit);
    storeCookies(jar, res);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location"); if (!loc) return { status: res.status, url: currentUrl, html: await res.text(), jar };
      currentUrl = new URL(loc, currentUrl).toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) { method = "GET"; body = undefined; }
      continue;
    }
    return { status: res.status, url: currentUrl, html: await res.text(), jar };
  }
  throw new Error("Too many redirects from Bahria portal");
}

function assertLoggedIn(result: FetchResult) {
  if (result.url.includes("Login.aspx")) throw new UnauthorizedError("Bahria session expired. Please log in again.");
}
function resolveUrl(path: string): string {
  return path.startsWith("http") ? path : BAHRIA_BASE_URL + (path.startsWith("/") ? path : "/" + path);
}
function pageScore(page: PortalPage): number {
  const rows = page.tables.reduce((n, t) => n + t.rows.length, 0);
  return rows * 10 + page.tables.length * 2 + page.headings.length;
}
function pageHasData(page: PortalPage): boolean { return page.tables.some((t) => t.rows.length > 0); }

/* ------------------------------------------------------------------ */
/* Nav discovery                                                       */
/* ------------------------------------------------------------------ */

const NAV_RULES: [PortalFeature, RegExp][] = [
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

async function discoverNavInternal(session: SessionData, jar: CookieJar, seedHtml?: string, seedUrl?: string) {
  const nav: Record<string, string> = { ...session.nav };
  const consider = (html: string, url: string) => {
    const page = parsePortalPage(html, url);
    const found = classifyNavLinks(page.links);
    for (const [k, v] of Object.entries(found)) if (v && !nav[k]) nav[k] = v;
    if (!session.name) session.name = extractStudentName(html);
  };
  if (seedHtml && seedUrl) consider(seedHtml, seedUrl);
  const candidates = ["/Sys/Student/Dashboard.aspx", "/Sys/Common/Dashboard.aspx", "/Sys/Student/Home.aspx", "/Sys/Student/Default.aspx"];
  let fetched = 0;
  for (const c of candidates) {
    if (fetched >= 2 || Object.keys(nav).length >= 6) break;
    try {
      const r = await fetchWithJar(jar, BAHRIA_BASE_URL + c);
      if (r.url.includes("Login.aspx")) break;
      consider(r.html, r.url);
      fetched++;
    } catch { break; }
  }
  session.nav = nav;
  session.navDiscoveredAt = Date.now();
}

async function ensureNavInternal(session: SessionData, jar: CookieJar) {
  const stale = !session.navDiscoveredAt || Date.now() - session.navDiscoveredAt > 60 * 60 * 1000;
  if (Object.keys(session.nav).length === 0 || stale) {
    await discoverNavInternal(session, jar);
  }
}

/* ------------------------------------------------------------------ */
/* WebForms postbacks                                                  */
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
 * GET a page; if its grids are empty, replay the WebForms postbacks Aspire
 * needs to populate them (search/show button, semester select). Returns the
 * richest page obtained.
 */
async function fetchWithPostbacks(jar: CookieJar, url: string, budget: { n: number }): Promise<PortalPage> {
  const first = await fetchWithJar(jar, url); budget.n++;
  assertLoggedIn(first);
  let best = parsePortalPage(first.html, first.url);
  if (pageHasData(best)) return best;
  const info = analyzeWebForm(first.html, first.url);
  if (!info) return best;
  for (const attempt of buildAttempts(info)) {
    if (budget.n >= 12) break;
    try {
      const res = await doPostback(jar, info, attempt); budget.n++;
      assertLoggedIn(res);
      const page = parsePortalPage(res.html, res.url);
      if (pageScore(page) > pageScore(best)) best = page;
      if (pageHasData(page)) return page;
    } catch (e) { if (e instanceof UnauthorizedError) throw e; }
  }
  return best;
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
  await ensureNavInternal(session, jar);
  const discovered = session.nav[feature];
  const candidates = [discovered, ...(PORTAL_PATHS[feature] as unknown as string[]).map((p) => BAHRIA_BASE_URL + p)]
    .filter((v, i, a): v is string => !!v && a.indexOf(v) === i);
  const budget = { n: 0 };
  let richest: PortalPage | null = null;
  let lastError: unknown = null;
  for (const url of candidates) {
    if (budget.n >= 12) break;
    try {
      const page = await fetchWithPostbacks(jar, url, budget);
      if (pageHasData(page)) return page;
      if (!richest || pageScore(page) > pageScore(richest)) richest = page;
    } catch (e) {
      lastError = e;
      if (e instanceof UnauthorizedError) throw e;
    }
  }
  if (richest) return richest;
  throw lastError instanceof Error ? lastError : new Error("Could not load page from Bahria portal");
}

const FILE_EXT_RE = /\.(pdf|docx?|pptx?|xlsx?|zip|rar)(\?|#|$)/i;
const KIND_MATCHERS: Record<string, (text: string, href: string) => boolean> = {
  assignments: (t, h) => /assignment/i.test(t) || /assignment/i.test(h),
  quizzes: (t, h) => /quiz/i.test(t) || /quiz/i.test(h),
  materials: (t, h) => /lecture|notes|slide|material|book|handout|download/i.test(t) || /_uploaded_documents/i.test(h) || FILE_EXT_RE.test(h)
};

async function getCourseResourcesInternal(session: SessionData, jar: CookieJar, kind: "assignments" | "quizzes" | "materials"): Promise<CourseResources> {
  await ensureNavInternal(session, jar);
  const matches = KIND_MATCHERS[kind];
  const groups = new Map<string, CourseResourcesGroup & { seen: Set<string> }>();
  const sourcePages: string[] = [];
  const addItem = (course: string, courseUrl: string | undefined, item: ResourceItem) => {
    if (!item.href || !item.title) return;
    let g = groups.get(course);
    if (!g) { g = { course, courseUrl, items: [], seen: new Set() }; groups.set(course, g); }
    if (g.seen.has(item.href)) return;
    g.seen.add(item.href);
    if (g.items.length < 60) g.items.push(item);
  };
  const harvestPage = (page: PortalPage, courseName: string) => {
    for (const link of page.links) {
      if (matches(link.text, link.href)) {
        addItem(courseName, page.url, { title: link.text || link.href.split("/").pop() || link.href, href: link.href, kind });
      }
    }
    for (const table of page.tables) {
      table.rows.forEach((row, i) => {
        const href = table.rowLinks?.[i] || null;
        if (href && matches(row.join(" "), href)) {
          addItem(courseName, page.url, { title: row.filter(Boolean).join(" — ") || href, href, kind });
        }
      });
    }
  };

  // (a) The feature's own discovered / candidate page(s).
  const featureUrls = [session.nav[kind], ...((PORTAL_PATHS[kind] as unknown as string[]).map((p) => BAHRIA_BASE_URL + p))]
    .filter((v, i, a): v is string => !!v && a.indexOf(v) === i).slice(0, 3);
  for (const url of featureUrls) {
    try {
      const budget = { n: 0 };
      const page = await fetchWithPostbacks(jar, url, budget);
      sourcePages.push(page.url);
      harvestPage(page, page.title || kind);
      // Tables on a feature page are real records even when they carry no link.
      for (const table of page.tables) {
        table.rows.forEach((row, i) => {
          const title = row.filter(Boolean).join(" — ");
          if (title) addItem(page.title || kind, page.url, { title, href: table.rowLinks?.[i] || page.url, kind });
        });
      }
      if (groups.size > 0) break;
    } catch (e) { if (e instanceof UnauthorizedError) throw e; }
  }

  // (b) Each course's own page, reached from the courses list.
  try {
    const coursesPage = await getFeaturePageInternal(session, jar, "courses");
    sourcePages.push(coursesPage.url);
    harvestPage(coursesPage, "Courses");
    const navUrls = new Set(Object.values(session.nav));
    const targets = new Map<string, string>(); // course name -> url
    for (const table of coursesPage.tables) {
      table.rows.forEach((row, i) => {
        const href = table.rowLinks?.[i];
        if (href && !navUrls.has(href) && !/logout/i.test(href)) {
          const name = row.filter(Boolean).slice(0, 2).join(" — ");
          if (name) targets.set(name, href);
        }
      });
    }
    for (const link of coursesPage.links) {
      if (!link.href.includes(".aspx")) continue;
      if (navUrls.has(link.href) || /logout|dashboard|profile/i.test(link.href)) continue;
      if (link.text.length >= 3 && !targets.has(link.text)) targets.set(link.text, link.href);
    }
    let visited = 0;
    for (const [name, url] of targets) {
      if (visited >= 10 || groups.size >= 15) break;
      visited++;
      try {
        const page = await getPortalPageInternal(jar, url);
        sourcePages.push(page.url);
        harvestPage(page, name);
      } catch (e) { if (e instanceof UnauthorizedError) throw e; }
    }
  } catch (e) { if (e instanceof UnauthorizedError) throw e; }

  // (c) The LMS entry point — follow it and harvest whatever it lands on.
  try {
    const lmsPage = await getPortalPageInternal(jar, session.nav["lms"] || "/Sys/Common/GoToLMS.aspx");
    sourcePages.push(lmsPage.url);
    harvestPage(lmsPage, "LMS");
  } catch (e) { if (e instanceof UnauthorizedError) throw e; }

  return {
    groups: [...groups.values()].filter((g) => g.items.length > 0).map(({ seen, ...g }) => g),
    sourcePages: [...new Set(sourcePages)]
  };
}

/* ------------------------------------------------------------------ */
/* Public API — every call runs under the per-session lock and the     */
/* mutated cookie jar is written back to the store immediately.        */
/* ------------------------------------------------------------------ */

async function runWithJar<T>(session: SessionData, fn: (jar: CookieJar) => Promise<T>): Promise<T> {
  const jar = jarFromRecord(session.cookies);
  try {
    return await fn(jar);
  } finally {
    session.cookies = jarToRecord(jar);
    saveSession(session);
  }
}

export async function getPortalPage(session: SessionData, path: string): Promise<PortalPage> {
  return withSessionLock(session.id, () => runWithJar(session, (jar) => getPortalPageInternal(jar, path)));
}

export async function getFeaturePage(session: SessionData, feature: PortalFeature): Promise<PortalPage> {
  return withSessionLock(session.id, () => runWithJar(session, (jar) => getFeaturePageInternal(session, jar, feature)));
}

export async function getCourseResources(session: SessionData, kind: "assignments" | "quizzes" | "materials"): Promise<CourseResources> {
  return withSessionLock(session.id, () => runWithJar(session, (jar) => getCourseResourcesInternal(session, jar, kind)));
}

export async function ensureNav(session: SessionData): Promise<Record<string, string>> {
  return withSessionLock(session.id, () => runWithJar(session, async (jar) => {
    await ensureNavInternal(session, jar);
    return session.nav;
  }));
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
  const stillOnLogin = posted.url.includes("Login.aspx");
  if (stillOnLogin) {
    const err = extractErrorText(posted.html);
    throw new Error(err || "Login failed. Check your enrollment, password, institute and account type.");
  }
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
  // while we know the jar is fresh — later feature lookups prefer these
  // over the guessed candidate paths.
  try {
    await discoverNavInternal(session, jar, posted.html, posted.url);
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

import { BAHRIA_BASE_URL, LOGIN_PATH } from "./constants";
import { PORTAL_PATHS, type PortalFeature } from "./paths";
import { parsePortalPage, extractHiddenFields, extractErrorText, extractStudentName } from "./parser";
import { UnauthorizedError, type PortalPage, type SessionData } from "./types";

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
  return { session: { cookies: jarToRecord(jar), enrollment: input.enrollment, instituteId: input.instituteId, subUserType: input.subUserType, name, loggedInAt: Date.now() } };
}

function assertLoggedIn(result: FetchResult) {
  if (result.url.includes("Login.aspx")) throw new UnauthorizedError("Bahria session expired. Please log in again.");
}

export async function getPortalPage(session: SessionData, path: string): Promise<PortalPage> {
  const jar = jarFromRecord(session.cookies);
  const url = path.startsWith("http") ? path : BAHRIA_BASE_URL + (path.startsWith("/") ? path : "/" + path);
  const result = await fetchWithJar(jar, url);
  assertLoggedIn(result);
  // Persist any refreshed cookies back onto the session object (callers may re-encrypt).
  session.cookies = jarToRecord(jar);
  return parsePortalPage(result.html, result.url);
}

export async function getFeaturePage(session: SessionData, feature: PortalFeature): Promise<PortalPage> {
  let lastError: unknown = null;
  for (const path of PORTAL_PATHS[feature] as unknown as string[]) {
    try {
      const page = await getPortalPage(session, path);
      if (page.tables.length > 0 || page.headings.length > 0) return page;
      lastError = new Error(`No content found at ${path}`);
    } catch (e) { lastError = e; if (e instanceof UnauthorizedError) throw e; }
  }
  // Return the last attempt's page shape if all candidates were empty, rather than fabricating data.
  const fallback = await getPortalPage(session, (PORTAL_PATHS[feature] as unknown as string[])[0]);
  if (fallback) return fallback;
  throw lastError instanceof Error ? lastError : new Error("Could not load page from Bahria portal");
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

import * as cheerio from "cheerio";
import { BAHRIA_BASE_URL, LMS_BASE_URL } from "./constants";
import { fetchWithJar, withJar, type CookieJar, type FetchResult } from "./client";
import { parsePortalPage } from "./parser";
import { UnauthorizedError, type LmsFeatureResult, type LmsTableGroup, type PortalTable, type SessionData } from "./types";

/**
 * The LMS proper — https://lms.bahria.edu.pk, a PHP app reached from the CMS
 * via /Sys/Common/GoToLMS.aspx (same cookie jar works on both hosts; the LMS
 * session is established at CMS login time in loginToBahria).
 *
 * How LMS feature pages really work (verified from the pages' own JS):
 * each page renders two selects in SEPARATE forms — `semesterName`
 * (id `semesterId`) and `courseName` (id `courseId`, first option empty,
 * then one per enrolled course). There is no form POST: the selects'
 * onchange handlers navigate with GET query parameters —
 *   SelectSemester():  <page>?s=<semesterValue>
 *   GetCourses():      <page>?s=<semesterValue>&oc=<courseValue>
 * So per feature: GET the page, read the course options, then GET
 * ?s=…&oc=… once per course (cap 12) and parse the main data table of each
 * response, grouped by course. Option values are appended RAW, exactly as
 * a browser would (they arrive pre-encoded, e.g. "MjAyNjM%3D").
 */

export type LmsKind = "assignments" | "quizzes" | "materials" | "announcements";

export const LMS_PAGES: Record<LmsKind, string[]> = {
  assignments: ["/Student/Assignments.php"],
  quizzes: ["/Student/Quizzes.php"],
  materials: ["/Student/LectureNotes.php", "/Student/CourseOutline.php", "/Student/CoursePlan.php"],
  announcements: ["/Student/Announcements.php"]
};

/** Header words expected on each feature's main data table (verified shapes). */
const HEADER_HINTS: Record<LmsKind, string[]> = {
  assignments: ["assign", "title", "deadline", "marks obtained", "submission"],
  quizzes: ["quiz", "marks", "solution"],
  materials: ["week", "lecture", "course", "outline", "file", "video", "topic", "remarks"],
  announcements: ["announcement", "title", "posted"]
};

function assertLmsLoggedIn(result: FetchResult) {
  if (result.url.includes("Login.aspx") || result.url.includes("Logoff.aspx")) {
    throw new UnauthorizedError("Bahria session expired. Please log in again.");
  }
}

/** GET an LMS URL; if the LMS session isn't established yet, establish it via the CMS and retry once. */
async function lmsGet(jar: CookieJar, url: string): Promise<FetchResult> {
  const first = await fetchWithJar(jar, url);
  if (!first.url.includes("Login.aspx") && !first.url.includes("Logoff.aspx")) return first;
  await fetchWithJar(jar, BAHRIA_BASE_URL + "/Sys/Common/GoToLMS.aspx");
  const retry = await fetchWithJar(jar, url);
  assertLmsLoggedIn(retry);
  return retry;
}

function norm(s: string): string { return s.replace(/\s+/g, " ").trim(); }

interface LmsSelects {
  /** The page's default semester: the option marked selected, else the first non-empty one. */
  semesterValue: string;
  courses: { value: string; label: string }[];
}

/** Read the semester/course selects (they live in separate forms — search the whole document). */
function analyzeLmsSelects(html: string): LmsSelects {
  const $ = cheerio.load(html);
  const readOptions = (name: string) => {
    const options: { value: string; label: string; selected: boolean }[] = [];
    $(`select[name="${name}"] option`).each((_, op) => {
      options.push({
        value: $(op).attr("value") ?? norm($(op).text()),
        label: norm($(op).text()),
        selected: $(op).attr("selected") !== undefined
      });
    });
    return options;
  };
  const semOptions = readOptions("semesterName").filter((o) => o.value !== "");
  const semester = semOptions.find((o) => o.selected) || semOptions[0];
  const courses = readOptions("courseName")
    .filter((o) => o.value !== "")
    .map((o) => ({ value: o.value, label: o.label || o.value }));
  return { semesterValue: semester ? semester.value : "", courses };
}

/**
 * Drop "no records" placeholder rows: when a course has nothing published,
 * the LMS renders the data table with a single-cell (colspan) message row.
 * A usable table keeps only rows with >= 2 cells; a table with none is not
 * a result at all.
 */
function usableTable(t: PortalTable): PortalTable | null {
  const keep = t.rows.map((r, i) => (r.length >= 2 ? i : -1)).filter((i) => i >= 0);
  if (keep.length === 0) return null;
  if (keep.length === t.rows.length) return t;
  return {
    headers: t.headers,
    rows: keep.map((i) => t.rows[i]),
    rowLinks: t.rowLinks ? keep.map((i) => t.rowLinks![i]) : undefined,
    cellLinks: t.cellLinks ? keep.map((i) => t.cellLinks![i]) : undefined
  };
}

/** Pick the feature's main data table: best header match, then most rows. */
function pickMainTable(tables: PortalTable[], kind: LmsKind): PortalTable | null {
  const hints = HEADER_HINTS[kind];
  let best: PortalTable | null = null;
  let bestScore = -1;
  for (const raw of tables) {
    const t = usableTable(raw);
    if (!t) continue;
    const headerText = t.headers.join(" ").toLowerCase();
    const matched = hints.filter((h) => headerText.includes(h)).length;
    const score = matched * 100 + t.rows.length;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

async function getLmsFeatureInternal(jar: CookieJar, kind: LmsKind): Promise<LmsFeatureResult> {
  const groups: LmsTableGroup[] = [];
  const groupByCourse = new Map<string, LmsTableGroup>();
  const seenTables = new Set<string>();
  const sourcePages: string[] = [];

  const addGroup = (course: string, table: PortalTable) => {
    // The identical table under several courses (e.g. a page that ignores
    // the course parameter) is kept once, under the first label produced.
    const sig = JSON.stringify([table.headers, table.rows.slice(0, 3), table.rows.length]);
    if (seenTables.has(sig)) return;
    seenTables.add(sig);
    let g = groupByCourse.get(course);
    if (!g) { g = { course, tables: [] }; groupByCourse.set(course, g); groups.push(g); }
    g.tables.push(table);
  };

  for (const path of LMS_PAGES[kind]) {
    const url = LMS_BASE_URL + path;
    const first = await lmsGet(jar, url);
    sourcePages.push(first.url);
    const selects = analyzeLmsSelects(first.html);

    // The bare page may already carry a real table (e.g. CourseOutline
    // lists every course without a selection).
    const landing = parsePortalPage(first.html, first.url);
    const landingTable = pickMainTable(landing.tables, kind);
    if (landingTable) addGroup(landing.title || kind, landingTable);

    for (const course of selects.courses.slice(0, 12)) {
      // Browser-faithful: option values go into the query string raw.
      const courseUrl = `${url}?s=${selects.semesterValue}&oc=${course.value}`;
      const res = await lmsGet(jar, courseUrl);
      sourcePages.push(res.url);
      const page = parsePortalPage(res.html, res.url);
      const table = pickMainTable(page.tables, kind);
      if (table) addGroup(course.label, table);
    }
  }

  return { groups: groups.filter((g) => g.tables.length > 0), sourcePages: [...new Set(sourcePages)] };
}

export async function getLmsFeature(session: SessionData, kind: LmsKind): Promise<LmsFeatureResult> {
  return withJar(session, (jar) => getLmsFeatureInternal(jar, kind));
}

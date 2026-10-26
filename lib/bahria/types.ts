export interface PortalTable {
  headers: string[];
  rows: string[][];
  /** Parallel to `rows`: the first real link found in that row (absolute URL), if any. */
  rowLinks?: (string | null)[];
  /** Parallel to `rows` and to each row's cells: the first link inside that cell, if any. */
  cellLinks?: (string | null)[][];
}
export interface PortalLink { text: string; href: string; }
export interface PortalPage {
  url: string;
  title: string;
  headings: string[];
  tables: PortalTable[];
  links: PortalLink[];
  text: string;
}

/**
 * A live Bahria session. The authoritative copy travels with the browser in
 * the AES-256-GCM-encrypted `bahria_session` cookie (see session.ts), which
 * is re-issued on every API response with the freshest cookie jar — so the
 * session works on any server process/instance, not just the one that
 * handled the login. The server-side store (lib/bahria/store.ts) remains as
 * a per-process cache + request lock and is merged with the cookie payload
 * on every read (whichever has the larger `jarUpdatedAt` wins).
 * `cookies` is the live, mutable Bahria cookie jar: Aspire rotates its
 * session cookie after login, so the jar is updated after every response.
 */
export interface SessionData {
  id: string;
  cookies: Record<string, string>;
  enrollment: string;
  instituteId: string;
  subUserType: string;
  name?: string;
  loggedInAt: number;
  createdAt: number;
  lastSeenAt: number;
  /** When the cookie jar last changed (ms epoch). Drives cookie/store merge. */
  jarUpdatedAt: number;
  /** Feature -> absolute portal URL, discovered from the authenticated menu after login. */
  nav: Record<string, string>;
  navDiscoveredAt?: number;
}

export type SessionSeed = Omit<SessionData, "id" | "createdAt" | "lastSeenAt" | "jarUpdatedAt" | "nav"> & {
  nav?: Record<string, string>;
  jarUpdatedAt?: number;
};

export interface ResourceItem {
  title: string;
  href: string;
  kind: string;
}
export interface CourseResourcesGroup {
  course: string;
  courseUrl?: string;
  items: ResourceItem[];
}
export interface CourseResources {
  groups: CourseResourcesGroup[];
  sourcePages: string[];
}

/** One course's attendance, followed from the StudentWiseAttendance "Detail" links. */
export interface AttendanceCourse {
  /** Cells of the course's row on the attendance course table (label text only). */
  course: string[];
  detailUrl: string;
  /** Label/value pairs from the detail page's course-info table. */
  info: [string, string][];
  totalHours: number;
  presentHours: number;
  absentHours: number;
  /** present / total * 100, one decimal; null when total is 0. */
  percentage: number | null;
  /** The per-class sessions table from the detail page, when present. */
  sessions: PortalTable | null;
}
export interface AttendanceResult {
  page: PortalPage;
  courses: AttendanceCourse[];
}

/** The TimeTable page carries its schedule as JSON in a hidden field, not as a table. */
export interface TimetableResult {
  page: PortalPage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendar: Record<string, any> | null;
}

/** LMS (lms.bahria.edu.pk) feature data: parsed tables grouped by course. */
export interface LmsTableGroup {
  course: string;
  tables: PortalTable[];
}
export interface LmsFeatureResult {
  groups: LmsTableGroup[];
  sourcePages: string[];
}

export class UnauthorizedError extends Error {
  constructor(message = "Not logged in to Bahria portal") { super(message); this.name = "UnauthorizedError"; }
}

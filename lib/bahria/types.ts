export interface PortalTable {
  headers: string[];
  rows: string[][];
  /** Parallel to `rows`: the first real link found in that row (absolute URL), if any. */
  rowLinks?: (string | null)[];
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
 * A live Bahria session. This object lives ONLY on the server, in the
 * server-side session store (lib/bahria/store.ts). The browser cookie
 * holds nothing but the opaque `id`, signed — never the cookie jar.
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
  /** Feature -> absolute portal URL, discovered from the authenticated menu after login. */
  nav: Record<string, string>;
  navDiscoveredAt?: number;
}

export type SessionSeed = Omit<SessionData, "id" | "createdAt" | "lastSeenAt" | "nav"> & {
  nav?: Record<string, string>;
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

export class UnauthorizedError extends Error {
  constructor(message = "Not logged in to Bahria portal") { super(message); this.name = "UnauthorizedError"; }
}

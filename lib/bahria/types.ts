export interface PortalTable { headers: string[]; rows: string[][]; }
export interface PortalLink { text: string; href: string; }
export interface PortalPage {
  url: string;
  title: string;
  headings: string[];
  tables: PortalTable[];
  links: PortalLink[];
  text: string;
}
export interface SessionData {
  cookies: Record<string, string>;
  enrollment: string;
  instituteId: string;
  subUserType: string;
  name?: string;
  loggedInAt: number;
}
export class UnauthorizedError extends Error {
  constructor(message = "Not logged in to Bahria portal") { super(message); this.name = "UnauthorizedError"; }
}

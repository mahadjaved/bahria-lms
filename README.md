# Bahria LMS

A clean, modern interface for the Bahria University student portal.

Bahria runs two systems: the Aspire CMS at `cms.bahria.edu.pk` (dashboard, courses, attendance, marks, timetable, fee, profile) and the LMS at `lms.bahria.edu.pk` (lecture notes, assignments, quizzes, announcements), reached from the CMS via `/Sys/Common/GoToLMS.aspx`. This app does not copy or store university data in a database. When you sign in, the server talks to both systems on your behalf, fetches your pages, parses the HTML, and shows it in a clean interface built with Next.js, Tailwind CSS and shadcn/ui components. The UI uses the Geist font and supports light and dark mode (system-aware, with a toggle in the top bar).

## ⚠️ Chrome impersonation is required (impit)

The CMS sits behind a WAF that fingerprints the TLS/HTTP2 stack. With a plain HTTP client (Node `fetch`, curl), login *appears* to succeed — but the session is killed at `/Sys/Student/PrepareSession.aspx` and bounced `PrepareSession → Logoff.aspx → Login.aspx`, so you are logged out again within seconds. With a real Chrome fingerprint the identical flow works. **All** portal requests in this app therefore go through [`impit`](https://www.npmjs.com/package/impit) (`new Impit({ browser: "chrome" })`, see `lib/bahria/client.ts`), with manual redirect handling and a per-session cookie jar. Do not replace it with global `fetch`.

## Features

- Dashboard, Courses, Attendance (per-course percentages computed from the portal's attendance detail pages, with expandable class sessions), Marks (provisional result), Timetable (rendered from the schedule JSON the portal embeds in the page), Fee challans, and Profile
- **Lecture Notes & Materials, Assignments, Quizzes, and Announcements** — harvested per course from the LMS (`lms.bahria.edu.pk`), grouped by course with the real file links
- A generic portal endpoint — `GET /api/portal/page?path=/Sys/Student/...` — that can fetch and parse any authenticated CMS page
- **Portal diagnostics** — `GET /api/debug/nav` (also linked from the dashboard) returns, for each section, the portal URL it resolved to. URLs only, no personal data — safe to share when a section comes up empty
- No data is fabricated. If Bahria returns nothing for a page, the UI says so honestly

## The verified page map

Confirmed against the live portal with a real student login. CMS pages are simple GETs (no postbacks needed) unless noted.

| Section | URL |
|---|---|
| Dashboard | `cms…/Sys/Student/Dashboard.aspx` |
| Profile | `cms…/Sys/Student/Profile.aspx` (label/value table) |
| Courses (registered) | `cms…/Sys/Student/CourseRegistration/RegisteredCourses.aspx` |
| Attendance | `cms…/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx` — each course row has a *Detail* link to `AttendanceSummary.aspx?v=…`; the detail page holds the per-class sessions table, from which totals + percentage are computed |
| Marks (provisional result) | `cms…/Sys/Student/Exams/ExamResult.aspx` |
| Timetable | `cms…/Sys/Student/CourseRegistration/TimeTable.aspx` — **no HTML table**: the schedule is JSON in the hidden field `BodyPH_hfCalendarJson` (`eventsData`, `timeSlots`, `resources`, …) |
| Fee challans | `cms…/Sys/Student/FeeManagement/FeeChallans` — **extensionless**, no `.aspx` |
| LMS entry | `cms…/Sys/Common/GoToLMS.aspx` → redirects to `lms…/Student/Dashboard.php` (same cookie jar) |
| Lecture notes | `lms…/Student/LectureNotes.php` (+ `CourseOutline.php`, `CoursePlan.php` shown on the same page) |
| Assignments | `lms…/Student/Assignments.php` |
| Quizzes | `lms…/Student/Quizzes.php` |
| Announcements | `lms…/Student/Announcements.php` |

**How LMS pages load data:** each LMS feature page renders two selects in separate forms — `semesterName` and `courseName` (empty first option, then one per course). There is no form POST: the selects' own `onchange` handlers navigate with GET query parameters — `?s=<semesterValue>&oc=<courseValue>` (see `SelectSemester()` / `GetCourses()` in the pages' inline JS). The harvester in `lib/bahria/lms.ts` does exactly that, once per course (cap 12), and groups the parsed tables by course. Courses with nothing published render a single-cell "no records" row, which the harvester discards.

## How Bahria login works

Bahria's CMS uses ASP.NET WebForms. Signing in is a server-side flow in `lib/bahria/client.ts`:

1. `GET https://cms.bahria.edu.pk/Logins/Student/Login.aspx` — collect cookies and the hidden WebForms fields (`__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, etc.) with cheerio.
2. `POST` the same URL with `ctl00$BodyPH$tbEnrollment`, `ctl00$BodyPH$tbPassword`, `ctl00$BodyPH$ddlInstituteID`, `ctl00$BodyPH$ddlSubUserType`, and `__EVENTTARGET=ctl00$BodyPH$btnLogin`, following redirects manually and capturing `Set-Cookie` headers at each step.
3. Success means the response lands off `Login.aspx`. Failure means it stays on the login page — Bahria's own error text is extracted and shown to you.
4. Immediately after a successful CMS login, the app GETs `/Sys/Common/GoToLMS.aspx` once so the LMS session is established inside the same cookie jar before the session is stored.
5. Course files are also served from `https://lms.bahria.edu.pk/_uploaded_documents/...`.

Your password is **never stored**. It is used only for that one login POST to Bahria.

## Sessions & deployment

The session **travels with the browser**: after login, the whole session (including the live Bahria cookie jar) is AES-256-GCM-encrypted into the `bahria_session` cookie, and every API response re-issues that cookie with the freshest jar. That write-back is essential — Aspire **rotates its session cookie after login**, so a jar snapshotted once at login goes stale within seconds (the original design's bug). A server-side store (`lib/bahria/store.ts`, persisted to `.data/sessions.json`) remains as a per-process cache and request lock, and is merged with the cookie on every read — whichever side has the fresher jar wins. Explicit logout revokes the session id server-side, so a replayed pre-logout cookie is refused. Sessions expire after 12 hours of inactivity (sliding). Your portal password is never stored — it is used only for the login POST itself.

**Deployment note:** run the app as a **single server process** (the normal local / single-instance setup — fully verified end-to-end). Bahria's WAF binds a CMS session to the authenticated channel of the process that performed the login: a *different* backend process presenting the same cookies is bounced to the login page by the portal itself, no matter what the client sends. So on multi-instance/serverless hosting, keep this app on one sticky instance; splitting requests across instances will log users out of CMS sections (courses, attendance, marks…). LMS sections (assignments, quizzes, materials, announcements) are not bound this way. This is a portal constraint, not an app bug — the cookie-carried session ensures the app itself never loses a session that the portal still honors.

## Architecture

```
app/
  login/                 Login form (enrollment, password, institute, Student/Parents)
  dashboard/ courses/ assignments/ quizzes/ materials/ announcements/
  attendance/ marks/ timetable/ fee/ profile/
  api/
    auth/login|logout|me Server-side Bahria login + session
    dashboard|courses|marks|timetable|fee|profile/
    attendance/          Course table + per-course Detail pages, totals computed
    assignments|quizzes|materials|announcements/   LMS harvest, grouped by course
    debug/nav/           Portal diagnostics (URLs only)
    portal/page/         Generic authenticated CMS page fetcher
lib/bahria/
  constants.ts           Base URLs, 15 institutes, sub-user types
  paths.ts               Verified portal paths per feature (+ fallbacks)
  client.ts              impit (Chrome) client, cookie jar, WebForms login, CMS fetchers
  lms.ts                 LMS select+POST-per-course harvester
  parser.ts              HTML -> headings / data tables / links, timetable JSON extraction
  store.ts               Server-side session cache + per-session lock, logout revocations
  session.ts             AES-256-GCM session-cookie payload (the session carrier)
components/ui/           shadcn/ui components (button, card, table, input, ...)
components/app-shell.tsx Sidebar (desktop) / sheet menu (mobile), top bar, theme toggle, logout
```

## Getting started

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes in production | Long random string used to sign the session-id cookie. A clearly-marked insecure fallback exists for local development only — never use it in production. |
| `BAHRIA_BASE_URL` | No | Defaults to `https://cms.bahria.edu.pk`. |

Copy `.env.example` to `.env.local` and set a real secret:

```bash
cp .env.example .env.local
# generate one: openssl rand -base64 32
```

## Disclaimer

This is an unofficial interface built for personal use. It is not affiliated with Bahria University. Use your own Bahria account only.

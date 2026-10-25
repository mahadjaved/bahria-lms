# Bahria LMS

A clean, modern interface for the Bahria University student portal (Aspire CMS).

Bahria's portal lives at `cms.bahria.edu.pk` ( `lms.bahria.edu.pk` redirects there). This app does not copy or store university data in a database. When you sign in, the server talks to Bahria's portal on your behalf, fetches your pages, parses the HTML, and shows it in a clean interface built with Next.js, Tailwind CSS and shadcn/ui components. The UI uses the Geist font and supports light and dark mode (system-aware, with a toggle in the top bar).

## Features

- Dashboard, Courses, Attendance (with percentages and progress bars), Marks & Results, Timetable, Fee, and Profile
- **Assignments, Quizzes, and Lecture Notes & Materials** — collected live from your course pages, the portal's own assignment/quiz pages, course folders, and the LMS entry point, grouped by course with real links
- A generic portal endpoint — `GET /api/portal/page?path=/Sys/Student/...` — that can fetch and parse any authenticated portal page, so pages without a dedicated view are still accessible
- **Portal diagnostics** — `GET /api/debug/nav` (also linked from the dashboard) returns, for each section, the portal URL it resolved to. URLs only, no personal data — safe to share when a section comes up empty
- No data is fabricated. If Bahria returns nothing for a page, the UI says so honestly

## How Bahria login works

Bahria uses ASP.NET WebForms. Signing in is a server-side flow in `lib/bahria/client.ts`:

1. `GET https://cms.bahria.edu.pk/Logins/Student/Login.aspx` — collect cookies and the hidden WebForms fields (`__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, etc.) with cheerio.
2. `POST` the same URL with `ctl00$BodyPH$tbEnrollment`, `ctl00$BodyPH$tbPassword`, `ctl00$BodyPH$ddlInstituteID`, `ctl00$BodyPH$ddlSubUserType`, and `__EVENTTARGET=ctl00$BodyPH$btnLogin`, following redirects manually and capturing `Set-Cookie` headers at each step.
3. Success means the response lands off `Login.aspx`. Failure means it stays on the login page — Bahria's own error text is extracted and shown to you.
4. Right after login, the app reads the authenticated menu on the landing page and **discovers the real portal URLs** for each section (they differ by campus). Discovered URLs are preferred; `lib/bahria/paths.ts` is only a fallback list.
5. Authenticated pages live under `https://cms.bahria.edu.pk/Sys/Student/...`; the LMS entry point is `/Sys/Common/GoToLMS.aspx` and course files are served from `https://lms.bahria.edu.pk/_uploaded_documents/...`.

Your password is **never stored**. It is used only for that one login POST to Bahria.

## Sessions

Sessions live **server-side** in `lib/bahria/store.ts` (an in-memory store, persisted to `.data/sessions.json` so dev restarts don't log you out). The browser cookie holds only a signed, opaque session id.

This matters because Aspire **rotates its session cookie after login**: if the cookie jar were snapshotted into the browser at login time, every later request would reuse a stale jar and Bahria would bounce you back to the login page within seconds. Here, the live jar stays on the server and is updated after every portal response, requests for one session are serialized so the jar can't race, and sessions expire after 12 hours of inactivity (sliding).

## How data pages are loaded

Aspire pages often render an empty grid until a WebForms postback runs. For each section the client:

1. Resolves the URL: discovered menu URL first, then the candidate paths in `lib/bahria/paths.ts`.
2. GETs the page and parses it (headings, data tables — layout tables are skipped — and links).
3. If no data table came back, it replays the page's own postbacks: the search/show/view button, and setting the semester/session dropdown to the current/most recent value.
4. Returns the richest result obtained. Assignments/Quizzes/Materials additionally follow each course's own page and the LMS entry point, and harvest matching links and files per course.

## Architecture

```
app/
  login/                 Login form (enrollment, password, institute, Student/Parents)
  dashboard/ courses/ assignments/ quizzes/ materials/
  attendance/ marks/ timetable/ fee/ profile/
  api/
    auth/login|logout|me Server-side Bahria login + session
    dashboard|courses|attendance|marks|timetable|fee|profile/
    assignments|quizzes|materials/   Per-course resource aggregation
    debug/nav/           Portal diagnostics (URLs only)
    portal/page/         Generic authenticated page fetcher
lib/bahria/
  constants.ts           Base URLs, 15 institutes, sub-user types
  paths.ts               Fallback candidate portal paths per feature
  client.ts              Cookie jar, WebForms login + postbacks, nav discovery
  parser.ts              HTML -> headings / data tables / links, WebForms analysis
  store.ts               Server-side session store (live cookie jars)
  session.ts             Signed session-id cookie helpers
components/ui/           shadcn/ui components (button, card, table, input, ...)
components/app-shell.tsx Sidebar (desktop) / sheet menu (mobile), top bar, theme toggle, logout
```

> **Note on page paths:** authenticated pages could not be verified without a real student account, and Aspire page names can differ by campus/semester. Discovery handles most of this automatically. If a section still shows an empty state, open Portal diagnostics (`/api/debug/nav`) to see which URL it resolved to, and if needed add the correct path for your campus in `lib/bahria/paths.ts` — a one-line change.

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

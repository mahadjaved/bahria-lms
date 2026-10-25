# Bahria LMS

A clean, modern interface for the Bahria University student portal (Aspire CMS).

Bahria's portal lives at `cms.bahria.edu.pk` ( `lms.bahria.edu.pk` redirects there). This app does not copy or store university data in a database. When you sign in, the server talks to Bahria's portal on your behalf, fetches your pages, parses the HTML, and shows it in a clean interface built with Next.js, Tailwind CSS and shadcn/ui components.

## Features

- Dashboard, Courses, Attendance (with percentages and progress bars), Marks & Results, Timetable, Fee, and Profile
- A generic portal endpoint — `GET /api/portal/page?path=/Sys/Student/...` — that can fetch and parse any authenticated portal page, so pages without a dedicated view are still accessible
- No data is fabricated. If Bahria returns no table for a page, the UI says so honestly

## How Bahria login works

Bahria uses ASP.NET WebForms. Signing in is a server-side flow in `lib/bahria/client.ts`:

1. `GET https://cms.bahria.edu.pk/Logins/Student/Login.aspx` — collect cookies and the hidden WebForms fields (`__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, etc.) with cheerio.
2. `POST` the same URL with `ctl00$BodyPH$tbEnrollment`, `ctl00$BodyPH$tbPassword`, `ctl00$BodyPH$ddlInstituteID`, `ctl00$BodyPH$ddlSubUserType`, and `__EVENTTARGET=ctl00$BodyPH$btnLogin`, following redirects manually and capturing `Set-Cookie` headers at each step.
3. Success means the response lands off `Login.aspx`. Failure means it stays on the login page — Bahria's own error text is extracted and shown to you.
4. Authenticated pages live under `https://cms.bahria.edu.pk/Sys/Student/...`; the LMS entry point is `/Sys/Common/GoToLMS.aspx` and course files are served from `https://lms.bahria.edu.pk/_uploaded_documents/...`.

Your password is **never stored**. It is used only for that one login POST to Bahria. What is kept is an httpOnly cookie containing Bahria's own session cookies, encrypted with AES-256-GCM (`lib/bahria/session.ts`).

## Architecture

```
app/
  login/                 Login form (enrollment, password, institute, Student/Parents)
  dashboard/ courses/ attendance/ marks/ timetable/ fee/ profile/
  api/
    auth/login|logout|me Server-side Bahria login + session
    dashboard|courses|attendance|marks|timetable|fee|profile/
    portal/page/         Generic authenticated page fetcher
lib/bahria/
  constants.ts           Base URLs, 15 institutes, sub-user types
  paths.ts               Candidate portal paths per feature (see note below)
  client.ts              Cookie jar, WebForms login, page fetching
  parser.ts              Generic HTML -> headings / tables / links (cheerio)
  session.ts             AES-256-GCM encryption for the session cookie
components/ui/           shadcn/ui components (button, card, table, input, ...)
components/app-shell.tsx Sidebar (desktop) / sheet menu (mobile), top bar, logout
```

Parsers are intentionally generic and resilient: they parse headings, tables and links from whatever HTML Bahria returns, with specific shaping only where the shape is known (for example, computing an attendance percentage from a `%` column or from Present / Total columns).

> **Note on page paths:** authenticated pages could not be verified without a real student account, and Aspire page names can differ by campus/semester. If a section shows an empty state, check `lib/bahria/paths.ts` — each feature lists several candidate paths that are tried in order, and adding the correct one for your campus is a one-line change.

## Getting started

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes in production | Long random string used to encrypt the session cookie. A clearly-marked insecure fallback exists for local development only — never use it in production. |
| `BAHRIA_BASE_URL` | No | Defaults to `https://cms.bahria.edu.pk`. |

Copy `.env.example` to `.env.local` and set a real secret:

```bash
cp .env.example .env.local
# generate one: openssl rand -base64 32
```

## Disclaimer

This is an unofficial interface built for personal use. It is not affiliated with Bahria University. Use your own Bahria account only.

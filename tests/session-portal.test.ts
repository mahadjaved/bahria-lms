import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(os.tmpdir(), "bahria-test-"));
process.chdir(dir);
let hits: string[] = [];
const server = http.createServer((req, res) => {
  hits.push(`${req.url} ${req.headers.cookie || ""}`);
  if (req.url === "/redirect") {
    res.writeHead(302, { Location: "/next", "Set-Cookie": ["session=rotated; Path=/", "scoped=private; Path=/next"] });
  } else if (req.url === "/evil") {
    res.writeHead(302, { Location: "http://example.com/steal" });
  } else if (req.url === "/logoff") {
    res.writeHead(302, { Location: "/Logoff.aspx" });
  } else if (req.url?.startsWith("/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx")) {
    res.end('<table><tr><th>Course</th><th>Detail</th></tr><tr><td>First</td><td>none</td></tr><tr><td>Second</td><td><a href="AttendanceSummary.aspx?v=2">Detail</a></td></tr></table>');
    return;
  } else if (req.url?.includes("AttendanceSummary.aspx")) {
    res.end('<table><tr><th>Class Date</th><th>Total Hours</th><th>Present Hours</th></tr><tr><td>Today</td><td>2</td><td>2</td></tr></table>');
    return;
  } else if (req.url?.startsWith("/Sys/Student/Exams/") || req.url?.startsWith("/Sys/Student/Results") || req.url?.startsWith("/Sys/Student/Marks") || req.url?.startsWith("/Sys/Student/MyResults") || req.url?.startsWith("/Sys/Student/ExamResults")) {
    res.writeHead(503);
  } else if (req.url === "/rotate") {
    const match = /session=(\d+)/.exec(req.headers.cookie || "");
    res.setHeader("Set-Cookie", `session=${Number(match?.[1] || 0) + 1}; Path=/`);
  }
  res.end("ok");
});
let base: string;
let client: typeof import("../lib/bahria/client");
let store: typeof import("../lib/bahria/store");
let sessionHelpers: typeof import("../lib/bahria/session");
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  process.env.BAHRIA_BASE_URL = base;
  client = await import("../lib/bahria/client");
  store = await import("../lib/bahria/store");
  sessionHelpers = await import("../lib/bahria/session");
});

after(() => { server.close(); process.chdir(os.tmpdir()); rmSync(dir, { recursive: true, force: true }); });

test("redirect cookies are scoped, rotated, serialized and never sent to another host", async () => {
  const { jarFromRecord, jarToRecord, fetchWithJar } = client;
  const jar = jarFromRecord({ session: "old" });
  await fetchWithJar(jar, `${base}/redirect`);
  assert.match(hits.at(-1)!, /session=rotated/);
  assert.match(hits.at(-1)!, /scoped=private/);
  const restored = jarFromRecord(jarToRecord(jar));
  assert.equal(restored.getCookieStringSync(`${base}/other`), "session=rotated");
  assert.equal(restored.getCookieStringSync("https://lms.bahria.edu.pk/"), "");
  restored.setCookieSync("session=lms; Path=/", "https://lms.bahria.edu.pk/");
  assert.equal(restored.getCookieStringSync(`${base}/other`), "session=rotated");
  restored.setCookieSync("session=; Max-Age=0; Path=/", `${base}/`);
  assert.equal(restored.getCookieStringSync(`${base}/other`), "");
});

test("refuses untrusted redirects and never follows logoff", async () => {
  const { jarFromRecord, fetchWithJar } = client;
  const jar = jarFromRecord({ session: "secret" });
  await assert.rejects(fetchWithJar(jar, `${base}/evil`), /untrusted/);
  hits = [];
  const res = await fetchWithJar(jar, `${base}/logoff`);
  assert.match(res.url, /Logoff.aspx/);
  assert.equal(hits.length, 1);
});

test("parallel portal operations use the latest jar and logout cannot resurrect it", async () => {
  const { jarFromRecord, fetchWithJar, withJar } = client;
  const { createSession, getStoredSession, deleteSession, isRevokedSession } = store;
  const { signSessionId, parseSessionCookie } = sessionHelpers;
  const session = createSession({ cookies: { session: "0" }, enrollment: "test", instituteId: "1", subUserType: "None", loggedInAt: Date.now() });
  const snapshots = [{ ...session }, { ...session }];
  await Promise.all(snapshots.map((snapshot) => withJar(snapshot, (jar) => fetchWithJar(jar, `${base}/rotate`))));
  const stored = getStoredSession(session.id)!;
  assert.equal(jarFromRecord(stored.cookies).getCookieStringSync(`${base}/`), "session=2");
  const token = signSessionId(session.id);
  assert.equal(parseSessionCookie(token), session.id);
  deleteSession(session.id);
  assert.equal(isRevokedSession(session.id), true);
  await assert.rejects(withJar(snapshots[0], async () => {}), /Not logged in/);
  assert.equal(getStoredSession(session.id), null);
});

test("locks remain serialized even if logout occurs during a request", async () => {
  const { withSessionLock, deleteSession } = store;
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const one = withSessionLock("lock", async () => { order.push("first"); await gate; order.push("done"); });
  await Promise.resolve();
  deleteSession("lock");
  const two = withSessionLock("lock", async () => { order.push("second"); });
  release();
  await Promise.all([one, two]);
  assert.deepEqual(order, ["first", "done", "second"]);
});

test("browser session cookie is a small signed identifier, not the portal jar", async () => {
  const { NextResponse } = await import("next/server");
  const { setSessionCookie } = await import("../lib/api-helpers");
  const session = store.createSession({ cookies: { huge: "x".repeat(10000) }, enrollment: "test", instituteId: "1", subUserType: "None", loggedInAt: Date.now() });
  const response = setSessionCookie(NextResponse.json({ ok: true }), session);
  const token = response.cookies.get("bahria_session")!.value;
  assert.equal(sessionHelpers.parseSessionCookie(token), session.id);
  assert.ok(token.length < 200);
  assert.doesNotMatch(token, /xxxxx/);
  store.deleteSession(session.id);
});


test("attendance detail links remain attached to their own rows", async () => {
  const session = store.createSession({ cookies: {}, enrollment: "test", instituteId: "1", subUserType: "None", loggedInAt: Date.now() });
  const result = await client.getAttendance(session);
  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].course[0], "Second");
  assert.equal(result.courses[0].percentage, 100);
  store.deleteSession(session.id);
});

test("portal HTTP errors are surfaced instead of displayed as empty data", async () => {
  const session = store.createSession({ cookies: {}, enrollment: "test", instituteId: "1", subUserType: "None", loggedInAt: Date.now() });
  await assert.rejects(client.getFeaturePage(session, "marks"), /HTTP 503/);
  assert.ok(store.getStoredSession(session.id));
  store.deleteSession(session.id);
});

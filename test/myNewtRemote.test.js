import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MyNewtRemote, registerMyNewtRemoteRoutes, remoteControlVersion, validateRemoteAction } from "../server/my-newt-remote.js";
import { MyNewtService } from "../server/my-newt.js";

const identity = { projectId: "test-project", nodeId: "test-newt", clientId: "home-editor", projectName: "Remote test" };
function rawRequest(url, options) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, options, (response) => {
      let text = ""; response.setEncoding("utf8"); response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, cookie: response.headers["set-cookie"]?.[0] || null, headers: response.headers, text }));
    });
    request.on("error", reject); request.end(options.body);
  });
}
const baseJob = () => ({ id: "job-1", status: "plan-approval", brief: "Make a campaign", settings: { budget: 5 },
  spent: 0.1, reserved: 0, remaining: 4.9, plan: { summary: "One hero image", steps: [{ id: "step-1", title: "Generate image" }], estimatedGenerationCost: .2 },
  noteVersion: 0, activity: [], outputs: [], pending: null });
async function listen(app) {
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1"); candidate.once("error", reject); candidate.once("listening", () => resolve(candidate));
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
async function fixture(t, options = {}) {
  let now = Date.now(), job = null;
  const remote = new MyNewtRemote({ now: () => now, getJob: (id, projectId, nodeId) => id === job?.id && projectId === identity.projectId && nodeId === identity.nodeId ? job : null,
    resolveAsset: async () => { throw new Error("No media fixture."); }, distDirectory: path.resolve("dist"), ...options });
  remote.startServer = async () => {};
  await remote.ready;
  const { server, origin } = await listen(remote.app);
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  remote.port = server.address().port;
  const host = { ...identity, hostToken: "fixture-host" };
  const enabled = await remote.enable({ ...identity, origin }); host.hostToken = enabled.hostToken;
  const heartbeat = (body = {}) => remote.hostAction("heartbeat", { ...host, ...identity, jobId: job?.id || "", budget: 5, ...body });
  async function http(route, { body, cookie, csrf, headers = {}, method } = {}) {
    const result = await rawRequest(`${origin}${route}`, { method: method || (body ? "POST" : "GET"), headers: {
      ...(body ? { Origin: remote.trust.origin || origin, "Content-Type": "application/json", "X-Newt-Remote": "1" } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-Newt-CSRF": csrf } : {}), ...headers
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    try { result.data = JSON.parse(result.text); } catch { result.data = null; }
    return result;
  }
  async function pair(confirm = true) {
    const pairing = await remote.hostAction("pair", host);
    const response = await http("/remote-api/pair", { body: { code: pairing.code, name: "Test phone" } });
    assert.equal(response.status, 200);
    const cookie = response.cookie.split(";")[0];
    const state = await http("/remote-api/status", { cookie });
    if (confirm) assert.equal((await http("/remote-api/connect", { cookie, csrf: state.data.csrf, body: { connectionId: state.data.connectionId } })).status, 200);
    return { cookie, csrf: state.data.csrf, code: pairing.code };
  }
  async function command(auth, action = "start", overrides = {}) {
    const body = { id: randomUUID(), connectionId: remote.room?.id || "", budget: 5, action, note: ["start", "continue", "note"].includes(action) ? "Create a new image" : "",
      jobId: job?.id || "", version: job ? remoteControlVersion(job) : "", ...overrides };
    return { body, ...(await http("/remote-api/command", { ...auth, body })) };
  }
  await heartbeat();
  return { remote, host, origin, http, pair, command, heartbeat, advance: (ms) => { now += ms; }, setJob: async (value) => { job = value; await heartbeat(); } };
}

test("remote starts disabled and rejects unrelated origins, forged hosts and unrestricted API routes", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.http("/remote-api/status")).status, 401);
  assert.equal((await f.http("/api/settings")).status, 404);
  assert.equal((await f.http("/outputs/secret.png")).status, 404);
  assert.equal((await f.http("/remote-api/pair", { body: { code: "x" }, headers: { Origin: "https://untrusted.example" } })).status, 403);
  assert.equal((await f.http("/remote-api/status", { headers: { Host: "untrusted.example" } })).status, 403);
  assert.equal((await f.http("/remote-api/pair", { body: { code: "x" }, headers: { "X-Newt-Remote": "" } })).status, 403);
  await f.remote.hostAction("disable", f.host);
  assert.equal((await f.http("/remote-api/status")).status, 403);
  assert.equal(new MyNewtRemote({}).server, null);
});

test("pairing is one-use, expiring, rate limited and uses HttpOnly SameSite cookies", async (t) => {
  const f = await fixture(t);
  const pairing = await f.remote.hostAction("pair", f.host);
  const response = await f.http("/remote-api/pair", { body: { code: pairing.code } });
  assert.match(response.cookie, /HttpOnly/); assert.match(response.cookie, /SameSite=Strict/);
  assert.equal((await f.http("/remote-api/pair", { body: { code: pairing.code } })).status, 401);
  const expired = await f.remote.hostAction("pair", f.host);
  for (let i = 0; i < 5; i++) { f.advance(60000); await f.heartbeat(); }
  assert.equal((await f.http("/remote-api/pair", { body: { code: expired.code } })).status, 401);
});

test("pairing attempts throttle and remote commands require per-device CSRF", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  for (let i = 0; i < 7; i++) assert.equal((await f.http("/remote-api/pair", { body: { code: "wrong" } })).status, 401);
  assert.equal((await f.http("/remote-api/pair", { body: { code: "wrong" } })).status, 429);
  assert.equal((await f.command({ cookie: auth.cookie })).status, 403);
  assert.equal((await f.command({ ...auth, csrf: "incorrect" })).status, 403);
});

test("remote commands reach only the paired home editor and are delivered at most once", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  const sent = await f.command(auth);
  assert.equal(sent.status, 200);
  const repeat = await f.http("/remote-api/command", { ...auth, body: sent.body });
  assert.equal(repeat.status, 200); assert.equal(f.remote.room.commands.size, 1);
  assert.equal((await f.command(auth)).status, 409);
  await assert.rejects(f.remote.hostAction("heartbeat", { ...f.host, hostToken: "wrong" }), /connection has ended/);
  await assert.rejects(f.remote.hostAction("heartbeat", { ...f.host, clientId: "other-tab" }), /connection has ended/);
  const next = await f.heartbeat(); assert.equal(next.command.id, sent.body.id);
  assert.equal((await f.heartbeat()).command, null);
  await f.heartbeat({ receipt: { id: sent.body.id, ok: true } });
  const state = await f.http("/remote-api/status", auth);
  assert.equal(state.data.commands[0].status, "accepted");
  assert.equal((await f.http("/remote-api/command", { ...auth, body: sent.body })).data.status, "accepted");
});

test("offline commands never queue, stale deliveries expire, and project switches release control without forgetting the phone", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  const sent = await f.command(auth);
  f.advance(16000);
  assert.equal((await f.http("/remote-api/status", auth)).data.online, false);
  assert.equal((await f.command(auth)).status, 409);
  assert.equal((await f.heartbeat()).command, null);
  assert.equal(f.remote.room.commands.get(sent.body.id).status, "cancelled");
  await assert.rejects(f.heartbeat({ projectId: "different" }), /project changed/);
  const waiting = await f.http("/remote-api/status", auth);
  assert.equal(waiting.status, 200); assert.equal(waiting.data.connectionId, "");
  assert.equal(waiting.data.job, null); assert.equal(waiting.data.online, false);
  assert.equal((await f.command(auth)).status, 409);
});

test("lost acknowledgements do not replay commands and revocation cancels queued work", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  await f.command(auth); await f.heartbeat(); f.advance(31000);
  assert.equal((await f.heartbeat()).command, null);
  assert.equal((await f.http("/remote-api/status", auth)).data.commands[0].status, "uncertain");
  const sent = await f.command(auth);
  await f.remote.hostAction("revoke", { ...f.host, deviceId: f.remote.trust.devices[0].id });
  assert.equal((await f.http("/remote-api/status", auth)).status, 401);
  assert.equal(f.remote.room.commands.get(sent.body.id).status, "cancelled");
  assert.equal((await f.heartbeat()).command, null);
});

test("remote review is bound to the exact task and plan; generic resume cannot bypass approval", async (t) => {
  const f = await fixture(t), auth = await f.pair(), job = baseJob(); await f.setJob(job);
  assert.equal((await f.command(auth, "resume")).status, 409);
  const sent = await f.command(auth, "approve-plan"); assert.equal(sent.status, 200);
  job.plan.summary = "Changed plan";
  assert.equal((await f.heartbeat()).command, null);
  assert.equal(f.remote.room.commands.get(sent.body.id).status, "cancelled");
  assert.equal((await f.command(auth, "approve-plan", { version: sent.body.version })).status, 409);
  assert.equal((await f.command(auth, "settings")).status, 400);
  assert.equal((await f.command(auth, "restore")).status, 400);
  assert.throws(() => validateRemoteAction("approve", "", { status: "approval", pending: {} }), /Review/);
  assert.throws(() => validateRemoteAction("approve-plan", "new notes", job), /separately/);
});

test("remote status excludes snapshots, credentials, local paths and arbitrary media URLs", async (t) => {
  const f = await fixture(t), auth = await f.pair(), job = baseJob();
  job.snapshot = { secret: "SENSITIVE_VALUE" }; job.receipts = { secret: "SENSITIVE_VALUE" }; job.checkpoint = { secret: "SENSITIVE_VALUE" };
  job.outputs = [{ label: "Image", url: "/outputs/result.png" }, { label: "Invalid", url: "https://other.example/secret.png" }, { label: "HTML", url: "/outputs/script.html" }];
  await f.setJob(job);
  const state = await f.http("/remote-api/status", auth);
  assert.doesNotMatch(state.text, /SENSITIVE_VALUE|\/outputs\/result|other\.example|script\.html/);
  assert.match(state.data.job.outputs[0].mediaUrl, /^\/remote-api\/media\//);
  assert.equal(state.data.job.outputs[1].mediaUrl, "");
  assert.equal((await f.http(state.data.job.outputs[0].mediaUrl)).status, 401);
  job.outputs = [];
  assert.equal((await f.http(state.data.job.outputs[0].mediaUrl, auth)).status, 404);
});

test("HTTPS private origin enables Secure cookies; public or malformed origins are rejected", async (t) => {
  const f = await fixture(t);
  f.remote.room = null;
  for (const origin of ["http://example.com", "https://example.com", "https://home.tail.ts.net/path", "https://user:pass@home.tail.ts.net", "https://home.tail.ts.net:9999"]) {
    await assert.rejects(f.remote.enable({ ...identity, origin }), /exact HTTPS/);
  }
  const result = await f.remote.enable({ ...identity, origin: "https://home.tail.ts.net" });
  const code = await f.remote.hostAction("pair", { ...identity, hostToken: result.hostToken });
  const paired = await f.http("/remote-api/pair", { body: { code: code.code }, headers: { Host: "home.tail.ts.net", Origin: "https://home.tail.ts.net" } });
  assert.match(paired.cookie, /Secure/);
});

test("local configuration endpoints require loopback Host, approved editor Origin and custom header", async (t) => {
  const app = express(); app.use(express.json());
  const remote = registerMyNewtRemoteRoutes(app, { localOrigins: ["http://127.0.0.1:5176"] }); remote.startServer = async () => {};
  const { server, origin } = await listen(app); t.after(() => { server.closeAllConnections(); server.close(); });
  const headers = { "Content-Type": "application/json", Origin: "http://127.0.0.1:5176", "X-Newt-Local": "1" };
  for (const changes of [{ Origin: "https://untrusted.example" }, { Host: "external.example" }, { "X-Newt-Local": "" }, { Origin: "" }]) {
    const reply = await rawRequest(`${origin}/api/my-newt/remote/enable`, { method: "POST", headers: { ...headers, ...changes }, body: JSON.stringify(identity) });
    assert.equal(reply.status, 403);
  }
  const reply = await rawRequest(`${origin}/api/my-newt/remote/enable`, { method: "POST", headers, body: JSON.stringify(identity) });
  assert.equal(reply.status, 200);
});

test("backend atomically rejects a stale remote approval before changing permissions or task status", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-remote-approval-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new MyNewtService({ directory, getKey: () => "", relay: async () => { throw new Error("No paid requests in this test."); } });
  await service.ready; service.kick = () => {};
  const job = { ...baseJob(), projectId: identity.projectId, nodeId: identity.nodeId, reservations: {}, createdIds: [], snapshot: { nodes: [], edges: [] } };
  service.jobs.set(job.id, job);
  const version = service.public(job).controlVersion;
  job.noteVersion++;
  await assert.rejects(service.control(job.id, { ...identity, action: "approve-plan", expectedVersion: version }), /changed after remote/);
  assert.equal(job.status, "plan-approval"); assert.equal(job.plan.approved, undefined);
  await assert.rejects(service.control(job.id, { ...identity, action: "approve-plan", expectedVersion: service.public(job).controlVersion, settings: { budget: 50 } }), /settings changed/);
  assert.equal(job.settings.budget, 5);
  await service.control(job.id, { ...identity, action: "approve-plan", expectedVersion: service.public(job).controlVersion });
  assert.equal(job.plan.approved, true);
});

test("gateway serves only the remote bundle and the active task's managed original media", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  const directory = await mkdtemp(path.join(tmpdir(), "newt-remote-bundle-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, ".vite")); await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, ".vite/manifest.json"), JSON.stringify({ "remote.html": { file: "assets/remote.js", imports: ["shared"] }, shared: { file: "assets/shared.js" }, "index.html": { file: "assets/main.js" } }));
  await writeFile(path.join(directory, "remote.html"), "Remote companion");
  await writeFile(path.join(directory, "assets/remote.js"), "Remote script");
  await writeFile(path.join(directory, "assets/shared.js"), "Shared script");
  await writeFile(path.join(directory, "assets/main.js"), "Private editor");
  await writeFile(path.join(directory, "original.png"), "original-full-resolution-bytes");
  f.remote.distDirectory = directory;
  assert.equal((await f.http("/")).text, "Remote companion");
  assert.equal((await f.http("/assets/remote.js")).status, 200);
  assert.equal((await f.http("/assets/shared.js")).status, 200);
  assert.equal((await f.http("/assets/main.js")).status, 404);
  assert.equal((await f.http("/.vite/manifest.json")).status, 404);
  assert.equal((await f.http("/assets/..%2fmain.js")).status, 404);
  f.remote.resolveAsset = async (url) => { assert.equal(url, "/outputs/original.png"); return { filePath: path.join(directory, "original.png") }; };
  const job = { ...baseJob(), outputs: [{ label: "Result", url: "/outputs/original.png" }] };
  await f.setJob(job);
  const mediaUrl = (await f.http("/remote-api/status", auth)).data.job.outputs[0].mediaUrl;
  const media = await f.http(mediaUrl, auth);
  assert.equal(media.status, 200); assert.equal(media.text, "original-full-resolution-bytes");
  assert.equal(media.headers["x-content-type-options"], "nosniff");
  await f.setJob(null);
  assert.equal((await f.http(mediaUrl, auth)).status, 404);
});

test("newly paired phones must explicitly confirm the project before seeing tasks or sending commands", async (t) => {
  const f = await fixture(t), auth = await f.pair(false);
  await f.setJob({ ...baseJob(), outputs: [{ url: "/outputs/private.png" }] });
  const state = (await f.http("/remote-api/status", auth)).data;
  assert.equal(state.requiresConfirmation, true); assert.equal(state.job, null); assert.deepEqual(state.commands, []);
  assert.equal(state.projectName, identity.projectName);
  assert.equal((await f.command(auth)).status, 409);
  assert.equal((await f.http("/remote-api/connect", { cookie: auth.cookie, body: { connectionId: state.connectionId } })).status, 403);
  assert.equal((await f.http("/remote-api/connect", { ...auth, body: { connectionId: "stale-project" } })).status, 409);
  assert.equal((await f.http("/remote-api/connect", { ...auth, body: { connectionId: state.connectionId } })).status, 200);
  assert.equal((await f.http("/remote-api/status", auth)).data.job.id, "job-1");
});

test("project switches preserve trusted phones but invalidate old drafts, media, commands and confirmations", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  const sent = await f.command(auth);
  const oldRoom = f.remote.room;
  const nextIdentity = { ...identity, projectId: "other-project", nodeId: "other-newt", projectName: "Another project" };
  const enabled = await f.remote.hostAction("resume", nextIdentity);
  const nextHost = { ...nextIdentity, hostToken: enabled.hostToken };
  await f.remote.hostAction("heartbeat", { ...nextHost, jobId: "", budget: 5 });
  assert.equal(f.remote.trust.devices.length, 1);
  assert.equal(f.remote.room.commands.size, 0);
  const state = (await f.http("/remote-api/status", auth)).data;
  assert.equal(state.projectName, "Another project"); assert.equal(state.requiresConfirmation, true);
  assert.equal((await f.http("/remote-api/command", { ...auth, body: sent.body })).status, 409);
  assert.equal((await f.http("/remote-api/connect", { ...auth, body: { connectionId: oldRoom.id } })).status, 409);
  assert.equal((await f.http("/remote-api/connect", { ...auth, body: { connectionId: state.connectionId } })).status, 200);
  // Even another already-open phone tab cannot send its old command into the newly confirmed project.
  assert.equal((await f.http("/remote-api/command", { ...auth, body: sent.body })).status, 409);
  await assert.rejects(f.remote.hostAction("detach", f.host), /connection has ended/);
  assert.equal(f.remote.room.projectId, "other-project");
  assert.equal((await f.remote.hostAction("heartbeat", { ...nextHost, jobId: "", budget: 5 })).command, null);
  assert.equal((await f.command(auth)).status, 200);
});

test("trusted-device hashes survive backend restart without persisting control credentials or project data", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-trust-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const trustPath = path.join(directory, "devices.json");
  const f = await fixture(t, { trustPath }), auth = await f.pair();
  const saved = await readFile(trustPath, "utf8"), parsed = JSON.parse(saved);
  assert.equal(parsed.enabled, true); assert.equal(parsed.devices.length, 1);
  assert.ok(!saved.includes(auth.cookie.split("=")[1])); assert.ok(!saved.includes(auth.csrf));
  assert.ok(!saved.includes(f.host.hostToken)); assert.ok(!saved.includes(identity.projectId));
  assert.ok(!saved.includes(auth.code));
  assert.equal((await stat(trustPath)).mode & 0o777, 0o600);
  const restart = async () => {
    const next = new MyNewtRemote({ trustPath, port: f.remote.port });
    next.startServer = async () => {};
    await next.ready;
    return next;
  };
  await f.remote.close();
  const next = await restart();
  const req = { headers: { cookie: auth.cookie } };
  assert.equal(next.session(req).session.name, "Test phone");
  assert.equal(next.session(req).room, null);
  const resumed = await next.hostAction("resume", { ...identity, clientId: "reloaded-editor" });
  assert.equal(resumed.origin, f.origin); assert.equal(resumed.devices.length, 1);
  assert.throws(() => next.session(req, true), /Confirm the current project/);
  await next.hostAction("revoke", { clientId: "reloaded-editor", hostToken: resumed.hostToken, deviceId: resumed.devices[0].id });
  const afterRevoke = await restart();
  assert.throws(() => afterRevoke.session(req), /Pair this device/);
  await next.hostAction("disable", { clientId: "reloaded-editor", hostToken: resumed.hostToken });
  const afterDisable = await restart();
  assert.equal(afterDisable.trust.enabled, false);
  assert.equal((await afterDisable.hostAction("resume", identity)).enabled, false);
  assert.equal(afterDisable.room, null);
});

test("remembered phones expire after 30 days and can forget themselves even without an open project", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  await f.remote.hostAction("detach", f.host);
  assert.equal((await f.http("/remote-api/status", auth)).status, 200);
  assert.equal((await f.http("/remote-api/logout", { ...auth, body: {} })).status, 200);
  assert.equal((await f.http("/remote-api/status", auth)).status, 401);
  Object.assign(f.host, await f.remote.hostAction("resume", identity));
  const fresh = await f.pair();
  f.advance(30 * 24 * 60 * 60 * 1000);
  assert.equal((await f.http("/remote-api/status", fresh)).status, 401);
});

test("an open editor cannot be taken over by a different active browser tab", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.remote.hostAction("resume", { ...identity, clientId: "other-tab" }), /Another editor/);
  const old = f.remote.room.id;
  f.advance(16000);
  const next = await f.remote.hostAction("resume", { ...identity, clientId: "reloaded-tab" });
  assert.notEqual(f.remote.room.id, old); assert.ok(next.hostToken);
  await assert.rejects(f.heartbeat(), /connection has ended/);
});

test("budget changes cannot silently increase a remotely submitted or queued task allowance", async (t) => {
  const f = await fixture(t), auth = await f.pair();
  const first = await f.command(auth);
  await f.heartbeat({ budget: 50 });
  assert.equal(f.remote.room.commands.get(first.body.id).status, "cancelled");
  assert.equal((await f.command(auth)).status, 409);
  assert.equal((await f.command(auth, "start", { budget: 50 })).status, 200);
});

test("concurrent pairing accepts a code only once and a persistence failure does not create a trusted device", async (t) => {
  const f = await fixture(t), pairing = await f.remote.hostAction("pair", f.host);
  const results = await Promise.all([1, 2].map(() => f.http("/remote-api/pair", { body: { code: pairing.code } })));
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 401]);
  const second = await f.remote.hostAction("pair", f.host);
  f.remote.trustPath = "/dev/null/not-a-directory/devices.json";
  assert.notEqual((await f.http("/remote-api/pair", { body: { code: second.code } })).status, 200);
  assert.equal(f.remote.trust.devices.length, 1);
});

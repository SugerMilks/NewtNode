import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createCameraCoverageService, registerCameraCoverageRoutes } from "../server/camera-coverage.js";
import express from "express";
import { newCoveragePoses } from "../src/cameraCoverage.js";
import { cameraCoverageApi } from "../src/api/newtApi.js";

async function harness(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "coverage-test-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { key: "test-key", submits: 0, uploads: 0, statuses: 0, downloads: 0, histories: [], status: "COMPLETED", failSubmit: false, failSave: false, failHistory: false };
  const dependencies = { directory, getKey: () => state.key,
    clientFor: () => ({ queue: {
      submit: async (endpoint, { input }) => { state.submits++; state.endpoint = endpoint; state.input = input; if (state.failSubmit) throw new Error("lost response"); return { request_id: "fal-request" }; },
      status: async () => { state.statuses++; return { status: state.status }; },
      result: async () => ({ data: { video: { url: "https://fal.test/video.mp4" }, image: { url: "https://fal.test/image.png" } } })
    } }),
    prepareImage: async () => { state.uploads++; return "https://fal.test/reference.png"; },
    saveResult: async job => { state.downloads++; if (state.failSave) throw new Error("disk busy"); return { url: job.request.kind === "pass" ? "/outputs/pass.mp4" : "/outputs/upscale.png", type: job.request.kind === "pass" ? "video" : "image" }; },
    recordHistory: async job => { if (state.failHistory) throw new Error("history unavailable"); if (!state.histories.includes(job.id)) state.histories.push(job.id); },
    charge: async () => ({ amountUsd: .72, estimated: false }) };
  return { directory, state, dependencies, service: createCameraCoverageService(dependencies), body: { requestId: randomUUID(), kind: "pass", sourceUrl: "/uploads/master.png",
    poses: newCoveragePoses("Coverage"), duration: 10, resolution: "768P", nodeId: "camera-test", projectId: "project" } };
}
test("same operation has one paid submission across concurrency and restarts", async t => {
  const { service, dependencies, state, body, directory } = await harness(t);
  const replies = await Promise.all([service.start(body), service.start(body)]);
  assert.equal(state.submits, 1); assert.equal(state.uploads, 1); assert.equal(replies[0].requestId, "fal-request");
  const restarted = createCameraCoverageService(dependencies);
  await restarted.start(body); assert.equal(state.submits, 1);
  const done = await restarted.inspect(body.requestId); assert.equal(done.status, "complete"); assert.equal(done.cost.amountUsd, .72); assert.equal(done.cost.estimated, false);
  await restarted.inspect(body.requestId); assert.equal(state.downloads, 1); assert.equal(state.histories.length, 1);
  assert.ok(!JSON.stringify(done).includes("test-key")); assert.ok(!(await readFile(path.join(directory, `${body.requestId}.json`), "utf8")).includes("test-key"));
  await assert.rejects(service.start({ ...body, duration: 5 }), /different settings/);
});
test("ambiguous submissions never replay or poll an invented request ID", async t => {
  const { service, dependencies, state, body } = await harness(t); state.failSubmit = true;
  assert.equal((await service.start(body)).status, "uncertain");
  const restarted = createCameraCoverageService(dependencies);
  assert.equal((await restarted.inspect(body.requestId)).status, "uncertain");
  await restarted.start(body); assert.equal(state.submits, 1); assert.equal(state.statuses, 0);
});
test("output saving and history recover without another generation", async t => {
  const { service, dependencies, state, body } = await harness(t); await service.start(body);
  state.failSave = true; await assert.rejects(service.inspect(body.requestId), /disk busy/); assert.equal(state.statuses, 1);
  state.failSave = false; state.failHistory = true;
  const restarted = createCameraCoverageService(dependencies);
  await assert.rejects(restarted.inspect(body.requestId), /history unavailable/);
  const downloads = state.downloads; state.failHistory = false;
  assert.equal((await restarted.inspect(body.requestId)).status, "complete");
  assert.equal(state.submits, 1); assert.equal(state.statuses, 1); assert.equal(state.downloads, downloads);
});
test("key continuity, unknown receipts and failed provider runs cannot trigger a POST", async t => {
  const { service, state, body } = await harness(t); await service.start(body);
  state.key = "changed"; await assert.rejects(service.inspect(body.requestId), /original enabled Fal key/);
  await assert.rejects(service.inspect(randomUUID()), /unavailable/); await assert.rejects(service.inspect("../../secret"), /Invalid/);
  state.key = "test-key"; state.status = "FAILED"; assert.equal((await service.inspect(body.requestId)).status, "failed");
  assert.equal(state.submits, 1); assert.equal(state.downloads, 0);
});
test("invalid inputs and disabled Fal are rejected before upload or billing", async t => {
  const { service, state, body } = await harness(t);
  await assert.rejects(service.start({ ...body, sourceUrl: "https://invalid.test/image.png" }), e => e.status === 400);
  state.key = ""; await assert.rejects(service.start(body), /Enable your Fal/);
  assert.equal(state.submits, 0); assert.equal(state.uploads, 0);
});
test("upscale is a separate operation with safe Topaz defaults", async t => {
  const { service, state, body } = await harness(t);
  await service.start({ ...body, kind: "upscale", upscaleFactor: 4 });
  assert.equal(state.endpoint, "fal-ai/topaz/upscale/image"); assert.equal(state.input.upscale_factor, 4); assert.equal(state.input.face_enhancement, false);
  const done = await service.inspect(body.requestId); assert.equal(done.result.type, "image"); assert.equal(done.result.url, "/outputs/upscale.png");
});
test("travel paths submit once through the same camera endpoint and retain their mode on recovery", async t => {
  const { service, dependencies, state, body } = await harness(t);
  const travel = { ...body, pathMode: "travel", poses: newCoveragePoses("Slide Coverage") };
  await service.start(travel);
  assert.equal(state.endpoint, "minimax/h3-max/camera-controls"); assert.equal(state.input.camera_trajectory.length, 12);
  assert.match(state.input.prompt, /straight-line/);
  const recovered = await createCameraCoverageService(dependencies).inspect(body.requestId);
  assert.equal(recovered.pathMode, "travel"); assert.equal(recovered.trajectory.length, 12); assert.equal(state.submits, 1);
  await assert.rejects(service.start({ ...travel, pathMode: "orbit" }), /different settings/);
});
test("an old backend cannot silently run travel as orbit", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, routes: { cameraCoverage: true } }));
  await assert.rejects(cameraCoverageApi.start({ kind: "pass", pathMode: "travel", poses: newCoveragePoses("Slide Coverage") }), /Restart NewtNode.*No generation/);
  assert.equal(mock.mock.callCount(), 1);
});

test("protected framing is persisted and recovered without another generation", async t => {
  const { service, dependencies, state, body, directory } = await harness(t);
  const request = { ...body, poses: newCoveragePoses("Close Coverage"), protectFraming: true, framingRoom: 30 };
  const reply = await service.start(request);
  assert.equal(reply.protectFraming, true); assert.equal(reply.framingRoom, 30);
  assert.ok(state.input.camera_trajectory.slice(2).every(p => p.distance >= 1.3));
  assert.match(state.input.prompt, /Framing priority/);
  const stored = JSON.parse(await readFile(path.join(directory, `${body.requestId}.json`), "utf8"));
  assert.deepEqual(stored.request.poses, request.poses);
  assert.equal(stored.request.effectivePoses[1].distance, 1.3);
  const recovered = await createCameraCoverageService(dependencies).inspect(body.requestId);
  assert.equal(recovered.framingRoom, 30); assert.equal(recovered.protectFraming, true); assert.equal(state.submits, 1);
  await assert.rejects(service.start({ ...request, framingRoom: 20 }), /different settings/);
});

test("old backends cannot silently omit protection and invalid room never uploads", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, routes: { cameraCoverage: true, cameraCoverageTravel: true } }));
  await assert.rejects(cameraCoverageApi.start({ kind: "pass", protectFraming: true }), /Restart NewtNode.*Protect Framing.*No generation/);
  assert.equal(mock.mock.callCount(), 1);
  const { service, state, body } = await harness(t);
  await assert.rejects(service.start({ ...body, protectFraming: true, framingRoom: 100 }), /Extra Room/);
  assert.equal(state.uploads, 0); assert.equal(state.submits, 0);
});

test("registered routes expose receipts without keys and reject invalid frame times", async t => {
  const { service, body, state } = await harness(t);
  const app = express(); app.use(express.json()); let captures = 0;
  registerCameraCoverageRoutes(app, { service, capture: async request => { captures++; return { image: { localUrl: "/outputs/frame.png" }, frameTime: request.frameTime }; },
    sendError: (res, e) => res.status(e.status || 500).json({ error: e.message }) });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, value) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  const start = await post("/api/node/camera-coverage", body); assert.equal(start.status, 202); assert.equal((await start.json()).status, "queued");
  const status = await fetch(`${base}/api/node/camera-coverage/${body.requestId}`);
  assert.equal(status.headers.get("cache-control"), "no-store"); assert.equal((await status.json()).status, "complete");
  for (const value of [-1, "1", null]) assert.equal((await post("/api/node/camera-coverage-capture", { sourceVideoUrl: "/outputs/pass.mp4", frameTime: value })).status, 400);
  const capture = await post("/api/node/camera-coverage-capture", { sourceVideoUrl: "/outputs/pass.mp4", frameTime: 1 });
  assert.equal(capture.status, 200); assert.equal((await capture.json()).image.localUrl, "/outputs/frame.png");
  assert.equal(captures, 1); assert.equal(state.submits, 1);
});

test("browser API refuses an old backend before paid submission", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, routes: {} }));
  await assert.rejects(cameraCoverageApi.start({}), e => e.status === 409 && /No generation/.test(e.message));
  assert.equal(mock.mock.callCount(), 1); assert.equal(mock.mock.calls[0].arguments[0], "/api/health");
});
for (const failure of ["network", "HTML", "body read"]) {
  test(`ReFrame browser API never replays after ${failure} failure`, async t => {
    const mock = t.mock.method(globalThis, "fetch", async url => {
      if (String(url).endsWith("/api/health")) return Response.json({ ok: true, routes: { cameraCoverage: true } });
      if (failure === "network") throw new Error("lost response");
      if (failure === "body read") return { text: async () => { throw new Error("stream lost"); } };
      return new Response("<html>Gateway timeout</html>", { status: 504 });
    });
    await assert.rejects(cameraCoverageApi.start({ requestId: randomUUID() }), /did not resubmit or cancel/);
    const posts = mock.mock.calls.filter(call => call.arguments[1]?.method === "POST");
    assert.equal(posts.length, 1); assert.equal(posts[0].arguments[1].signal, undefined);
  });
}

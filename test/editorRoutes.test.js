import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, realpath, rm, access } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import express from "express";
import { registerEditorRoutes } from "../server/routes/editor.js";
import { createEditorTimeline, editorImportMedia } from "../src/editorTimeline.js";
import { editorSetTransition } from "../src/editorTransitions.js";

async function harness(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-routes-")), sourceFile = path.join(dir, "source.mp4"), history = [], outputs = [];
  await writeFile(sourceFile, "fixture");
  const app = express(); app.use(express.json());
  const metadata = { type: "video", duration: 2, width: 160, height: 90, hasAudio: true };
  let calls = 0;
  const { jobs } = registerEditorRoutes(app, {
    resolveAsset: async url => { assert.equal(url, "/uploads/source.mp4"); return { filePath: sourceFile }; },
    createTarget: async (_req, kind, extension) => {
      const fileName = `${kind}-${randomUUID()}${extension}`, target = { fileName, filePath: path.join(dir, fileName), publicPath: `/outputs/${fileName}` };
      outputs.push(target); return target;
    },
    recordHistory: async entry => history.push(entry),
    probe: async () => { calls++; return metadata; }, waveform: async () => [.1, .4],
    execute: async (args, config) => {
      await writeFile(args.at(-1), "rendered"); config?.onProgress?.(1);
      if (config?.signal) await options.duringRender?.(dir);
      if (options.block && config?.signal) await new Promise((resolve, reject) => {
        config.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        if (config.signal.aborted) reject(new Error("aborted"));
      });
      if (options.fail && config?.signal) throw new Error("Renderer unavailable");
    }
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { for (const job of jobs.values()) job.controller.abort(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const request = async (route, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/editor/${route}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const timeline = editorImportMedia(createEditorTimeline(), { ...metadata, url: "/uploads/source.mp4", label: "Source" }, "source");
  const finish = async id => {
    for (let i = 0; i < 100; i++) {
      const result = await request(`jobs/${id}`); if (result.body.status !== "running") return result.body;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail("export did not settle");
  };
  return { request, timeline, finish, outputs, history, dir, sourceFile, calls: () => calls };
}

test("Editor media inspection validates local sources and caches probes", async t => {
  const h = await harness(t);
  assert.equal((await h.request("media", "POST", { url: "https://example.com/video.mp4" })).status, 400);
  const media = await h.request("media", "POST", { url: "/uploads/source.mp4", type: "video" });
  assert.equal(media.status, 200); assert.equal(media.body.hasAudio, true); assert.equal(media.body.filePath, undefined);
  assert.match(media.body.thumbnailUrl, /^\/outputs\//); assert.deepEqual(media.body.waveform, [.1, .4]);
  assert.equal((await h.request("media", "POST", { url: "/uploads/source.mp4", type: "audio" })).status, 400);
  assert.equal(h.calls(), 1);
});

test("Editor render is idempotent and records canonical local zero-cost output", async t => {
  const h = await harness(t), requestId = randomUUID(), body = { requestId, timeline: h.timeline, projectId: "project", nodeId: "editor" };
  assert.equal((await h.request("render", "POST", body)).status, 202);
  assert.equal((await h.request("render", "POST", body)).status, 200);
  assert.equal((await h.request("render", "POST", { ...body, frame: 1 })).status, 409);
  const done = await h.finish(requestId); assert.equal(done.status, "complete"); assert.equal(done.result.type, "video");
  assert.equal(done.result.durationSeconds, 2); assert.equal(done.result.cost.amountUsd, 0); assert.equal(h.history.length, 1);
  assert.equal(h.history[0].localVideo, done.result.url); assert.equal(h.outputs.length, 1);
  const stillId = randomUUID(); await h.request("render", "POST", { ...body, requestId: stillId, frame: 12 });
  const still = await h.finish(stillId); assert.equal(still.result.type, "image"); assert.match(still.result.url, /\.png$/);
});

test("Editor exposes clear validation and restart errors", async t => {
  const h = await harness(t);
  assert.equal((await h.request("render", "POST", { requestId: "bad", timeline: h.timeline })).status, 400);
  assert.equal((await h.request("render", "POST", { requestId: randomUUID(), timeline: h.timeline, frame: 10000 })).status, 400);
  const missing = await h.request(`jobs/${randomUUID()}`); assert.equal(missing.status, 404); assert.match(missing.body.error, /server may have restarted/);
});

test("Editor verifies crossfade handles against actual source duration before rendering", async t => {
  const h = await harness(t), requestId = randomUUID();
  const assetId = h.timeline.assets[0].id;
  const timeline = editorSetTransition({ ...h.timeline,
    assets: h.timeline.assets.map(a => ({ ...a, duration: 4 })),
    clips: [{ id: "left", assetId, trackId: "a1", start: 0, sourceIn: 24, duration: 24, volume: 1 },
      { id: "right", assetId, trackId: "a1", start: 24, sourceIn: 12, duration: 24, volume: 1 }]
  }, "left", "right", "crossFade", 12);
  assert.equal((await h.request("render", "POST", { requestId, timeline })).status, 202);
  const job = await h.finish(requestId);
  assert.equal(job.status, "failed"); assert.match(job.error, /no longer have enough spare media/);
  assert.equal(h.outputs.length, 0); assert.equal(h.history.length, 0);
});

test("Editor limits concurrency and cancels local exports without keeping partial files", async t => {
  const h = await harness(t, { block: true }), ids = [randomUUID(), randomUUID()];
  for (const requestId of ids) assert.equal((await h.request("render", "POST", { requestId, timeline: h.timeline })).status, 202);
  assert.equal((await h.request("render", "POST", { requestId: randomUUID(), timeline: h.timeline })).status, 429);
  for (const id of ids) { await h.request(`jobs/${id}`, "DELETE"); assert.equal((await h.finish(id)).status, "canceled"); }
  for (const target of h.outputs) await assert.rejects(access(target.filePath));
  assert.equal(h.history.length, 0);
});

test("Editor renderer failures become readable job errors and remove partial files", async t => {
  const h = await harness(t, { fail: true }), requestId = randomUUID();
  await h.request("render", "POST", { requestId, timeline: h.timeline });
  const job = await h.finish(requestId); assert.equal(job.status, "failed"); assert.equal(job.error, "Renderer unavailable");
  await assert.rejects(access(h.outputs[0].filePath)); assert.equal(h.history.length, 0);
});

test("Editor saves a named export and keeps its managed output for downstream nodes", async t => {
  const h = await harness(t), requestId = randomUUID(), exportFilePath = path.join(h.dir, "My final cut.mp4");
  const body = { requestId, timeline: h.timeline, exportFilePath };
  assert.equal((await h.request("render", "POST", body)).status, 202);
  const job = await h.finish(requestId);
  assert.equal(job.status, "complete"); assert.equal(job.savedFilePath, await realpath(exportFilePath));
  assert.equal(job.result.fileName, "My final cut.mp4"); assert.match(job.result.url, /^\/outputs\//);
  assert.equal(await readFile(exportFilePath, "utf8"), "rendered");
  assert.equal(await readFile(h.outputs[0].filePath, "utf8"), "rendered");
  assert.equal((await h.request("render", "POST", body)).body.savedFilePath, await realpath(exportFilePath));
  assert.equal((await h.request("render", "POST", { ...body, requestId: randomUUID(), exportFilePath: "relative.mp4" })).status, 400);
});

test("Editor refuses a source as the save target before rendering", async t => {
  const h = await harness(t), requestId = randomUUID();
  await h.request("render", "POST", { requestId, timeline: h.timeline, exportFilePath: h.sourceFile });
  const job = await h.finish(requestId);
  assert.equal(job.status, "failed"); assert.match(job.error, /must not replace a timeline source/);
  assert.equal(h.outputs.length, 0); assert.equal(await readFile(h.sourceFile, "utf8"), "fixture");
});

test("a failed destination save warns the user but retains the completed managed export", async t => {
  const h = await harness(t, { duringRender: dir => writeFile(path.join(dir, "chosen.mp4"), "external change") });
  const requestId = randomUUID(), exportFilePath = path.join(h.dir, "chosen.mp4");
  await h.request("render", "POST", { requestId, timeline: h.timeline, exportFilePath });
  const job = await h.finish(requestId);
  assert.equal(job.status, "complete"); assert.match(job.warning, /destination changed/); assert.equal(job.savedFilePath, undefined);
  assert.equal(await readFile(exportFilePath, "utf8"), "external change");
  assert.equal(await readFile(h.outputs[0].filePath, "utf8"), "rendered"); assert.equal(h.history.length, 1);
});

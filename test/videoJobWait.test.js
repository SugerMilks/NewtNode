import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { shouldRetryKreaJobLookup, kreaErrorMessage } from "../src/kreaApi.js";
import { relayLocalVideo } from "../server/local-video-request.js";

const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("async function runKreaGeneration("), source.indexOf("function kreaAuthorizationHeaders("));
function runner(lookup) {
  const calls = [], sleeps = [];
  const dependencies = {
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (options.method === "POST") return { ok: true, status: 200, body: { job_id: "paid-job" } };
      return lookup(calls.filter((call) => call.options.method !== "POST").length);
    },
    delay: async (ms) => { sleeps.push(ms); },
    responseJson: async (response) => {
      if (response.readError) throw new Error("Connection interrupted while reading");
      return response.body;
    },
    kreaApiBaseUrl: "https://api.krea.test",
    kreaAuthorizationHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    httpError: (status, message, extra) => Object.assign(new Error(message), { status }, extra),
    shouldRetryKreaJobLookup, kreaErrorMessage
  };
  const run = new Function(...Object.keys(dependencies), `${functions}\nreturn runKreaGeneration;`)(...Object.values(dependencies));
  return { run: (options = {}) => run({ endpoint: "/generate/video/test", input: { prompt: "test" }, label: "Video", apiKey: "original-key", waitUntilTerminal: true, ...options }), calls, sleeps };
}
const jobResponse = (status) => ({ ok: true, status: 200, body: { status } });

test("Krea video completes after both 20 minutes and one hour without a second submission", async () => {
  const state = runner((attempt) => jobResponse(attempt > 1900 ? "completed" : "processing"));
  assert.equal((await state.run()).job.status, "completed");
  assert.equal(state.sleeps.reduce((sum, ms) => sum + ms, 0), 3800000);
  assert.equal(state.calls.filter((call) => call.options.method === "POST").length, 1);
  assert.equal(state.calls.length, 1902);
  for (const call of state.calls.slice(1)) {
    assert.equal(call.url, "https://api.krea.test/jobs/paid-job");
    assert.equal(call.options.headers.Authorization, "Bearer original-key");
  }
  assert.equal(state.calls[0].options.signal, undefined);
});

test("video status polling recovers from extended transport, body-read, rate-limit and server failures", async () => {
  const state = runner((attempt) => {
    if (attempt <= 8) throw new Error("Network unavailable");
    if (attempt === 9) return { readError: true };
    if (attempt <= 18) return { ok: false, status: attempt % 2 ? 429 : 524, body: { error: "Temporary error" } };
    if (attempt === 19) return { ok: false, status: 521, body: {} };
    if (attempt === 20) return { ok: true, status: 200, body: {} };
    return jobResponse(attempt === 21 ? "processing" : "completed");
  });
  assert.equal((await state.run()).job.status, "completed");
  assert.equal(state.calls.length, 23);
  assert.equal(state.calls.filter((call) => call.options.method === "POST").length, 1);
  assert.equal(Math.max(...state.sleeps), 30000);
  assert.equal(state.sleeps.at(-1), 2000);
});

for (const status of ["failed", "cancelled"]) {
  test(`provider ${status} ends the wait without resubmitting or canceling`, async () => {
    const state = runner(() => jobResponse(status));
    await assert.rejects(state.run(), new RegExp(`job ${status}`));
    assert.equal(state.calls.length, 2);
  });
}

for (const status of [401, 403, 404]) {
  test(`HTTP ${status} reports lost access without implying the provider job was stopped`, async () => {
    const state = runner(() => ({ ok: false, status, body: { message: "Unavailable" } }));
    await assert.rejects(state.run(), /Check Krea history.*did not cancel or resubmit/);
    assert.equal(state.calls.length, status === 404 ? 17 : 2);
  });
}

test("the eventual-consistency grace period still allows video jobs to appear", async () => {
  const state = runner((attempt) => attempt < 4 ? { ok: false, status: 404, body: {} } : jobResponse("completed"));
  assert.equal((await state.run()).job.status, "completed");
});

test("non-video polling retains its existing limit", async () => {
  const state = runner(() => jobResponse("processing"));
  await assert.rejects(state.run({ waitUntilTerminal: false, label: "Image" }), /Image generation timed out after 20 minutes/);
  assert.equal(state.calls.length, 601);
});

test("all Krea video paths opt into unlimited waiting, not image or 3D paths", () => {
  for (const label of ['"Seedance"', '"MiniMax H3"', '"Topaz Video Upscale"', "selectedVideoModel.displayName"]) {
    const call = source.split("\n").find((line) => line.includes("runKreaGeneration({") && line.includes(`label: ${label}`));
    assert.match(call, /waitUntilTerminal: true/);
  }
  for (const label of ['"Hunyuan 3D 3.1 Pro"', "modelName"]) {
    const call = source.split("\n").find((line) => line.includes("runKreaGeneration({") && line.includes(`label: ${label}`));
    assert.doesNotMatch(call, /waitUntilTerminal: true/);
  }
  assert.match(source, /if \(isVideoGenerationRoute\(route\)\) return relayLocalVideo\(port, route, body\)/);
});

test("Newt video relay has no socket deadline and forwards one local request", async () => {
  let requests = 0, written, timeout, finish;
  const pending = relayLocalVideo(3336, "/api/node/generate-video", { prompt: "test" }, (options, callback) => {
    requests++;
    assert.equal(options.hostname, "127.0.0.1");
    assert.equal(options.path, "/api/node/generate-video");
    assert.equal(options.signal, undefined);
    const request = new EventEmitter();
    request.setTimeout = (ms) => { timeout = ms; };
    request.end = (body) => { written = body; };
    finish = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      response.emit("data", Buffer.from('{"video":'));
      response.emit("data", Buffer.from('{"localUrl":"/video.mp4"}}'));
      response.emit("end");
    };
    return request;
  });
  assert.equal(timeout, 0);
  assert.equal(written, '{"prompt":"test"}');
  finish();
  assert.deepEqual(await pending, { status: 200, data: { video: { localUrl: "/video.mp4" } } });
  assert.equal(requests, 1);
});

test("Newt video relay rejects a lost connection without replaying it", async () => {
  let requests = 0;
  await assert.rejects(relayLocalVideo(3336, "/api/node/generate-video", {}, (_options, _callback) => {
    requests++;
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.end = () => queueMicrotask(() => request.emit("error", new Error("Lost connection")));
    return request;
  }), /Lost connection/);
  assert.equal(requests, 1);
});

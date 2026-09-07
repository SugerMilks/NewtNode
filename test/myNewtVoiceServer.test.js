import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import express from "express";
import { createMyNewtVoiceTranscriber } from "../server/my-newt-voice.js";
import { registerMyNewtVoiceRoutes } from "../server/routes/myNewtVoice.js";
import { myNewtApi } from "../src/api/newtApi.js";

const run = promisify(execFile);
test("voice transcribes normalized temporary audio and cleans up on success and provider failure", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "newt-voice-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "microphone.webm");
  await run(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libopus", input]);
  const audio = { buffer: await readFile(input), mimetype: "audio/webm" };
  let workingDirectory, requests = 0;
  for (const ok of [true, false]) {
    const transcribe = createMyNewtVoiceTranscriber({
      runFfmpeg: (args) => { workingDirectory = path.dirname(args.at(-1)); assert.ok(args.includes("file,pipe")); return run(ffmpeg, args); },
      probeVideo: async (file) => {
        const { stdout } = await run(ffprobe.path, ["-v", "error", "-show_entries", "format=duration", "-of", "json", file]);
        return { duration: Number(JSON.parse(stdout).format.duration) };
      },
      request: async (url, options) => {
        requests += 1;
        assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
        assert.equal(options.body.get("model"), "gpt-transcribe");
        assert.equal(options.body.get("file").type, "audio/mpeg");
        assert.equal(options.headers.Authorization, "Bearer test-key");
        return { ok, status: 502, json: async () => { if (!ok) throw new Error("HTML"); return { text: "  Create nine angles.  " }; } };
      }
    });
    if (ok) {
      const result = await transcribe({ audio, key: "test-key" });
      assert.equal(result.text, "Create nine angles.");
      assert.ok(result.durationSeconds >= 1 && result.durationSeconds < 1.2);
      assert.ok(result.amountUsd > 0 && result.amountUsd < 0.0001);
    } else await assert.rejects(transcribe({ audio, key: "test-key" }), /HTTP 502/);
    await assert.rejects(access(workingDirectory), { code: "ENOENT" });
  }
  assert.equal(requests, 2);
});

test("invalid input, missing keys, bad audio and excessive duration fail before a paid request", async () => {
  let directory;
  const transcribe = createMyNewtVoiceTranscriber({
    runFfmpeg: async (args) => { directory = path.dirname(args.at(-1)); }, probeVideo: async () => ({ duration: 121 }),
    request: async () => assert.fail("No paid request allowed")
  });
  const audio = { buffer: Buffer.from("audio"), mimetype: "audio/webm" };
  await assert.rejects(transcribe({ audio }), /Enable an OpenAI/);
  await assert.rejects(transcribe({ audio: { ...audio, mimetype: "video/mp4" }, key: "test" }), /microphone recording/);
  await assert.rejects(transcribe({ audio: { ...audio, buffer: Buffer.alloc(9 * 1024 * 1024) }, key: "test" }), /under 8 MB/);
  await assert.rejects(transcribe({ audio, key: "test", signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(transcribe({ audio, key: "test" }), /two minutes/);
  await assert.rejects(access(directory), { code: "ENOENT" });
  const unreadable = createMyNewtVoiceTranscriber({ runFfmpeg: async () => { throw new Error("ffmpeg internal path"); } });
  await assert.rejects(unreadable({ audio, key: "test" }), /Could not read this microphone recording/);
});

test("multipart voice route respects enabled keys, validates uploads and records usage", async (t) => {
  let key = "", calls = 0; const usage = [];
  const app = express();
  registerMyNewtVoiceRoutes(app, {
    getKey: () => key,
    transcribe: async ({ audio, key: selectedKey }) => {
      calls += 1; assert.equal(selectedKey, "test-key"); assert.equal(audio.mimetype, "audio/webm");
      return { text: "A camera move.", amountUsd: 0.001, durationSeconds: 10 };
    },
    recordUsage: async (entry) => usage.push(entry)
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/my-newt/transcribe`;
  assert.equal((await fetch(url, { method: "POST" })).status, 400);
  assert.equal(calls, 0); key = "test-key";
  const form = new FormData();
  form.append("audio", new Blob(["audio"], { type: "audio/webm" }), "recording");
  form.append("projectId", "project-test"); form.append("nodeId", "newt-test");
  assert.deepEqual(await (await fetch(url, { method: "POST", body: form })).json(), { text: "A camera move." });
  assert.equal(usage[0].projectId, "project-test"); assert.equal(usage[0].nodeId, "newt-test");
  const invalid = new FormData(); invalid.append("audio", new Blob(["not audio"], { type: "text/plain" }), "bad.txt");
  assert.equal((await fetch(url, { method: "POST", body: invalid })).status, 400);
  assert.equal(calls, 1);
});

test("voice API sends one request only and propagates cancellation without paid fallback", async (t) => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  t.after(() => { globalThis.fetch = originalFetch; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
  globalThis.window = { location: { hostname: "127.0.0.1", port: "5176" } };
  let calls = 0;
  globalThis.fetch = async (url) => { calls += 1; assert.equal(url, "http://127.0.0.1:3336/api/my-newt/transcribe"); throw new Error("Network failure"); };
  await assert.rejects(myNewtApi.transcribe(new Blob(["audio"]), {}, new AbortController().signal), /Network failure/);
  assert.equal(calls, 1);
});

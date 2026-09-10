import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createElevenLabsClient, elevenLabsError, elevenLabsRates } from "../server/elevenlabs.js";
import { registerAudioModelRoutes } from "../server/routes/audioModel.js";
import { audioModelDefaults } from "../src/audioModel.js";

const input = (patch = {}) => ({ ...audioModelDefaults, prompt: "A quiet bell", voiceId: "voice1", ...patch });
const audioResponse = () => new Response(new Uint8Array([73, 68, 51, 1, 2, 3]), { headers: { "content-type": "audio/mpeg", "request-id": "test-request", "character-cost": "12" } });

test("ElevenLabs voice pagination keeps Default and Mine distinct without exposing provider records", async () => {
  const paths = [];
  const client = createElevenLabsClient({ fetchImpl: async (url, options) => {
    assert.equal(options.headers["xi-api-key"], "fake-key");
    paths.push(url);
    const query = new URL(url).searchParams;
    return Response.json(query.get("voice_type") === "default"
      ? { voices: [{ voice_id: "d", name: "Default", secret: "never-returned" }], has_more: false }
      : query.has("next_page_token") ? { voices: [{ voice_id: "m2", name: "Mine Two" }], has_more: false }
        : { voices: [{ voice_id: "m1", name: "Mine One", sharing: { rate: 0.2 } }], has_more: true, next_page_token: "next" });
  } });
  const voices = await client.listVoices("fake-key");
  assert.equal(paths.length, 3);
  assert.deepEqual(voices.map((voice) => voice.group), ["Default", "Mine", "Mine"]);
  assert.equal(voices[1].customRate, true);
  assert.equal(JSON.stringify(voices).includes("never-returned"), false);
});

test("ElevenLabs client submits JSON and multipart to the documented endpoints", async () => {
  const calls = [];
  const client = createElevenLabsClient({ fetchImpl: async (url, options) => { calls.push({ url, options }); return audioResponse(); } });
  for (const mode of ["tts", "sfx", "music"]) {
    const result = await client.generate({ data: input({ audioMode: mode }), key: "fake-key" });
    assert.equal(result.buffer.length, 6);
    assert.equal(result.requestId, "test-request");
    assert.equal(result.billedCharacters, 12);
  }
  await client.generate({ data: input({ audioMode: "sts", sourceAudioUrl: "/uploads/test.mp3", removeBackgroundNoise: true }), key: "fake-key", sourceAudio: { buffer: Buffer.from("speech"), mimeType: "audio/mpeg", fileName: "speech.mp3" }, durationSeconds: 5 });
  const sts = calls.at(-1);
  assert.match(sts.url, /\/v1\/speech-to-speech\/voice1\?output_format=mp3_44100_128$/);
  assert.equal(sts.options.body.get("audio").name, "speech.mp3");
  assert.equal(sts.options.body.get("remove_background_noise"), "true");
  assert.equal(sts.options.body.get("text"), null);
  assert.equal(sts.options.headers["Content-Type"], undefined);
  assert.equal(JSON.parse(sts.options.body.get("voice_settings")).similarity_boost, 0.75);
  assert(calls.every((call) => call.options.redirect === "error" && call.options.headers["xi-api-key"] === "fake-key"));
});

test("audio failures are readable and paid requests are never retried", async () => {
  let calls = 0;
  const client = createElevenLabsClient({ fetchImpl: async () => { calls++; return new Response("<!DOCTYPE html><title>Timeout</title>", { status: 524 }); } });
  await assert.rejects(client.generate({ data: input(), key: "fake-key" }), /HTTP 524/);
  assert.equal(calls, 1);
  await assert.rejects(client.generate({ data: input(), key: "" }), /enable.*ElevenLabs/);
  assert.equal(calls, 1);
  assert.match(elevenLabsError({ detail: [{ msg: "Invalid duration" }] }, 422), /Invalid duration/);
  assert.match(elevenLabsError({}, 403), /permissions/);
  const invalid = createElevenLabsClient({ fetchImpl: async () => Response.json({ ok: true }) });
  await assert.rejects(invalid.generate({ data: input(), key: "fake-key" }), /audio file/);
});

test("speech recording validation prevents paid calls on excessive or invalid duration", async () => {
  let calls = 0;
  const client = createElevenLabsClient({ fetchImpl: async () => { calls++; return audioResponse(); } });
  for (const durationSeconds of [0, NaN, 301]) await assert.rejects(client.generate({ data: input({ audioMode: "sts", sourceAudioUrl: "/uploads/test.mp3" }), key: "fake-key", sourceAudio: { buffer: Buffer.from("speech") }, durationSeconds }), /5 minutes/);
  assert.equal(calls, 0);
  assert.equal(elevenLabsRates({ ELEVENLABS_MUSIC_PER_MINUTE_USD: "0.4" }).musicPerMinute, 0.4);
  assert.equal(elevenLabsRates({ ELEVENLABS_MUSIC_PER_MINUTE_USD: "NaN" }).musicPerMinute, 0.15);
});

async function withRoutes(run) {
  let key = "key-A";
  const calls = [], histories = [], saves = [];
  const app = express(); app.use(express.json());
  registerAudioModelRoutes(app, { getKey: () => key,
    readAudio: async (url) => { assert.match(url, /^\/uploads\//); return { buffer: Buffer.from("source"), durationSeconds: 5 }; },
    saveAudio: async (req, buffer) => { saves.push({ req: req.body, buffer }); return { url: "/workflow-assets/project/outputs/audio.mp3", fileName: "audio.mp3", durationSeconds: 10 }; },
    recordHistory: async (history) => histories.push(history),
    client: {
      listVoices: async (requestedKey) => { calls.push({ type: "voices", key: requestedKey }); return [{ id: requestedKey === "key-A" ? "voice1" : "voice2", name: "My Voice", group: "Mine" }]; },
      generate: async (request) => { calls.push({ type: "generate", request }); return { buffer: Buffer.from("audio"), modelId: "test-model", endpoint: "/v1/test", requestId: "test-id" }; }
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/node/generate-audio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try { await run({ base, post, calls, histories, saves, setKey: (value) => { key = value; } }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test("audio route saves project-local output, records history and keeps failed runs separate", () => withRoutes(async ({ post, calls, histories, saves, setKey }) => {
  const result = await post(input({ projectId: "project", workflowPackage: { path: "/fixture/package" } }));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.audio, "/workflow-assets/project/outputs/audio.mp3");
  assert.equal(saves[0].req.projectId, "project");
  assert.equal(histories[0].mediaType, "audio");
  assert.equal(histories[0].provider, "ElevenLabs");
  assert.equal(histories[0].localAudio, data.audio);
  assert.equal(JSON.stringify(histories).includes("key-A"), false);
  setKey("");
  const missing = await post(input());
  assert.equal(missing.status, 400);
  assert.equal(calls.filter((call) => call.type === "generate").length, 1);
}));

test("key switching invalidates cached voices and never silently substitutes a voice", () => withRoutes(async ({ base, post, calls, setKey }) => {
  await fetch(`${base}/api/elevenlabs/voices`);
  setKey("key-B");
  const response = await post(input());
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /not available/);
  assert.deepEqual(calls.filter((call) => call.type === "voices").map((call) => call.key), ["key-A", "key-B"]);
  assert.equal(calls.some((call) => call.type === "generate"), false);
  assert.equal((await post(input({ voiceId: "voice2" }))).status, 200);
  assert.equal(calls.at(-1).request.key, "key-B");
}));

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import express from "express";
import { audioModelDefaults, audioModels, buildAudioRequest, elevenLabsPricing, estimateAudioCost, normalizeAudioModelData } from "../src/audioModel.js";
import { audioModelApi } from "../src/api/newtApi.js";
import { runAudioModelGeneration } from "../src/nodeRunners/audioModels.js";
import { createElevenLabsClient, elevenLabsRates } from "../server/elevenlabs.js";
import { registerAudioModelRoutes } from "../server/routes/audioModel.js";

const settings = (patch = {}) => ({ ...audioModelDefaults, ttsModel: "eleven_v4", voiceId: "voice1", prompt: "[whispering] We made it.\n[laughing] Finally!", ...patch });

test("v4 is TTS-only, preserves saved choices and does not change creation defaults", () => {
  assert.equal(audioModels.tts.find(model => model.id === "eleven_v4").maxCharacters, 10000);
  for (const mode of ["sts", "sfx", "music"]) assert(!audioModels[mode].some(model => model.id === "eleven_v4"));
  assert.equal(audioModelDefaults.ttsModel, "eleven_multilingual_v2");
  const saved = settings({ voiceName: "My Voice", voiceGroup: "Mine", style: 0.6, speed: 0.9,
    resultUrl: "/outputs/previous.mp3", resultItems: [{ type: "audio", url: "/outputs/previous.mp3" }] });
  assert.deepEqual(normalizeAudioModelData(JSON.parse(JSON.stringify(saved))), saved);
  const back = normalizeAudioModelData({ ...saved, ttsModel: "eleven_multilingual_v2" });
  assert.equal(back.style, 0.6); assert.equal(back.speed, 0.9);
  assert.equal(back.voiceId, "voice1"); assert.deepEqual(back.resultItems, saved.resultItems);
});

test("v4 submits literal audio tags and only its two supported voice settings", () => {
  const data = settings({ stability: 0.4, similarityBoost: 0.8, style: 0.9, speed: 1.2, speakerBoost: true, seed: 0 });
  const spec = buildAudioRequest(data);
  assert.equal(spec.endpoint, "/v1/text-to-speech/voice1");
  assert.equal(spec.modelId, "eleven_v4");
  assert.deepEqual(spec.body, { text: data.prompt, model_id: "eleven_v4", seed: 0,
    voice_settings: { stability: 0.4, similarity_boost: 0.8 } });
  assert.equal(buildAudioRequest(settings({ prompt: "x".repeat(10000) })).body.text.length, 10000);
  assert.throws(() => buildAudioRequest(settings({ prompt: "x".repeat(10001) })), /10,000/);
  assert.throws(() => buildAudioRequest(settings({ ttsModel: "not-a-model" })), /not supported/);
  assert.throws(() => buildAudioRequest(settings({ audioMode: "sts", stsModel: "eleven_v4" })), /not supported/);
  assert.throws(() => buildAudioRequest(settings({ audioMode: "music", musicModel: "eleven_v4" })), /not supported/);
});

test("v4 uses a separate standard rate and never guesses a missing account rate", () => {
  const data = settings({ prompt: "x".repeat(1000) });
  assert.equal(estimateAudioCost(data, { batchCount: 4 }).amountUsd, 0.32);
  assert.match(estimateAudioCost(data).pricingBasis, /promotions/);
  assert.equal(estimateAudioCost(data, { rates: { ttsPerThousand: 99 } }).amountUsd, null);
  assert.equal(estimateAudioCost(data, { customVoiceRate: true }).amountUsd, null);
  const rates = elevenLabsRates({ ELEVENLABS_V4_PER_1000_CHARACTERS_USD: "0.022" });
  assert.equal(estimateAudioCost(data, { rates }).amountUsd, 0.022);
  assert.equal(rates.ttsPerThousand, elevenLabsPricing.ttsPerThousand);
  assert.equal(elevenLabsRates({ ELEVENLABS_V4_PER_1000_CHARACTERS_USD: "NaN" }).v4PerThousand, 0.08);
});

test("old backends cannot silently substitute another model; interrupted v4 POSTs are not replayed", async t => {
  let supported = false, interrupt = false;
  const posts = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/health")) return Response.json({ routes: { elevenLabsV4: supported } });
    posts.push(JSON.parse(options.body));
    if (interrupt) throw new TypeError("Connection lost");
    return Response.json({ audio: "/outputs/v4.mp3", fileName: "v4.mp3", durationSeconds: 5 });
  });
  await assert.rejects(audioModelApi.generate(settings()), /Restart.*No generation was submitted/);
  assert.equal(posts.length, 0);
  supported = true;
  const node = { id: "audio1", data: settings({ title: "Narration", resultUrl: "/outputs/old.mp3" }) };
  const before = structuredClone(node);
  const output = await runAudioModelGeneration({ node, prompt: node.data.prompt, workflowContext: { projectId: "project" }, index: 0 });
  assert.equal(posts[0].ttsModel, "eleven_v4"); assert.equal(posts[0].projectId, "project");
  assert.equal(posts[0].resultUrl, undefined);
  assert.equal(output.type, "audio"); assert.equal(output.url, "/outputs/v4.mp3");
  interrupt = true;
  await assert.rejects(audioModelApi.generate(settings()), /not retried/);
  assert.equal(posts.length, 2);
  assert.deepEqual(node, before);
  assert.match(readFileSync(new URL("../server/index.js", import.meta.url), "utf8"), /elevenLabsV4: true/);
});

test("v4 route validates, submits once, saves canonical audio and records the exact model in History", async () => {
  const paid = [], histories = [], saves = [];
  let rejected = false;
  const client = createElevenLabsClient({ fetchImpl: async (url, options) => {
    if (options.method !== "POST") return Response.json({ voices: [{ voice_id: "voice1", name: "Narrator" }], has_more: false });
    paid.push({ url, body: JSON.parse(options.body) });
    if (rejected) return Response.json({ detail: { message: "Model not available on this account" } }, { status: 422 });
    return new Response(new Uint8Array([73, 68, 51]), { headers: { "content-type": "audio/mpeg", "request-id": "v4-run" } });
  } });
  const app = express(); app.use(express.json());
  registerAudioModelRoutes(app, { getKey: () => "fake-key", client, getRates: () => elevenLabsPricing,
    readAudio: () => assert.fail("TTS must not read source audio"),
    saveAudio: async (_req, buffer) => { saves.push(buffer); return { url: "/workflow-assets/project/outputs/v4.mp3", fileName: "v4.mp3", durationSeconds: 4 }; },
    recordHistory: async history => histories.push(history) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const post = data => fetch(`http://127.0.0.1:${server.address().port}/api/node/generate-audio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  try {
    for (const patch of [{ ttsModel: "unknown" }, { prompt: "x".repeat(10001) }]) assert.equal((await post(settings(patch))).status, 400);
    assert.equal(paid.length, 0);
    const response = await post(settings({ prompt: "x".repeat(1000), projectId: "project", nodeId: "node" }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.model, "eleven_v4"); assert.equal(result.cost.amountUsd, 0.08);
    assert.equal(saves.length, 1); assert.equal(histories[0].modelName, "eleven_v4");
    assert.equal(histories[0].localAudio, result.audio); assert.equal(histories[0].requestId, "v4-run");
    assert.deepEqual(histories[0].settings.voice_settings, { stability: 0.5, similarity_boost: 0.75 });
    assert.match(paid[0].url, /\/v1\/text-to-speech\/voice1\?output_format=mp3_44100_128$/);
    assert.equal(paid[0].body.model_id, "eleven_v4");
    rejected = true;
    const failure = await post(settings());
    assert.equal(failure.status, 422); assert.match((await failure.json()).error, /not available/);
    assert.equal(paid.length, 2); assert.equal(saves.length, 1); assert.equal(histories.length, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/AudioModelNodeBody.jsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, loader: { ".css": "empty" } });
const component = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), component, component.exports);

test("v4 controls hide unsupported settings without changing other audio modes", () => {
  const render = patch => renderToStaticMarkup(React.createElement(component.exports.AudioModelNodeBody, {
    node: { id: "audio", data: settings(patch) }, config: { input: [{ id: "promptIn" }, { id: "audioIn" }], output: [{ id: "audioOut" }] },
    prompt: "A voice", connectedPortKeys: new Set(), onUpdate: () => assert.fail("Render must not change settings"), onRun: () => {} }));
  const v4 = render({});
  assert.match(v4, /value="eleven_v4" selected=""/);
  for (const label of ["Stability", "Similarity"]) assert.match(v4, new RegExp(`aria-label="${label}"`));
  for (const label of ["Style", "Speed", "Speaker boost"]) assert(!v4.includes(`aria-label="${label}"`));
  assert(v4.includes('label="Default"')); assert(v4.includes('label="Mine"'));
  const legacy = render({ ttsModel: "eleven_multilingual_v2" });
  for (const label of ["Style", "Speed", "Speaker boost"]) assert(legacy.includes(`aria-label="${label}"`));
  assert(render({ ttsModel: "eleven_v3" }).includes('aria-label="Voice stability"'));
  for (const audioMode of ["sts", "sfx", "music"]) assert(!render({ audioMode }).includes('value="eleven_v4"'));
});

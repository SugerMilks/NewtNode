import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import sharp from "sharp";
import { registerImageEditRoutes } from "../server/routes/imageEdit.js";

async function withEditor(run, overrides = {}) {
  const source = await sharp({ create: { width: 64, height: 96, channels: 4, background: "#123456" } }).png().toBuffer();
  const calls = [], saves = [], histories = [];
  const app = express();
  registerImageEditRoutes(app, {
    limiter: (_req, _res, next) => next(), hasFal: () => true,
    readSource: async (url) => { assert.equal(url, "/uploads/source.png"); return { buffer: source }; },
    generate: async (request) => { calls.push(request); return { endpoint: "openai/gpt-image-2.5/sunburst/edit", remoteImage: { url: "mock-result" } }; },
    readGenerated: async () => source,
    save: async (req, buffer) => { saves.push({ body: req.body, buffer }); return { url: "/workflow-assets/test/outputs/edit.png", fileName: "edit.png" }; },
    recordHistory: async (item) => histories.push(item),
    sendError: (res, error) => res.status(error.status || 500).json({ error: error.message }), ...overrides
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const post = (changes = {}, layers = {}) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ sourceUrl: "/uploads/source.png", requestId: randomUUID(), prompt: "Make the jacket blue", projectId: "project", projectName: "Edit QA", workflowPackagePath: "/fixture/project", nodeId: "image1", mode: "edit", quality: "high", ...changes })) form.append(key, value);
    for (const [key, value] of Object.entries(layers)) form.append(key, new Blob([value], { type: "image/png" }), `${key}.png`);
    return fetch(`http://127.0.0.1:${server.address().port}/api/node/edit-image`, { method: "POST", body: form });
  };
  try { await run({ post, source, calls, saves, histories }); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test("image edits use Sunburst, persist native size with workflow context and honest history costs", () => withEditor(async ({ post, calls, saves, histories }) => {
  const response = await post(); assert.equal(response.status, 200);
  const { item } = await response.json();
  assert.equal(item.width, 64); assert.equal(item.height, 96); assert.equal(item.sourceUrl, "/uploads/source.png");
  assert.equal(item.cost.amountUsd, null);
  assert.equal(calls[0].model, "OpenAI Image 2.5 Sunburst"); assert.equal(calls[0].quality, "high");
  assert.equal(saves[0].body.workflowPackagePath, "/fixture/project");
  assert.equal(histories[0].localImage, item.url); assert.equal(histories[0].node.id, "image1");
  assert.match(histories[0].submittedPrompt, /clean original/);
}));

test("duplicate edit submissions share one paid generation and reject changed payloads", () => withEditor(async ({ post, calls, saves }) => {
  const requestId = randomUUID();
  const first = await post({ requestId }), second = await post({ requestId });
  assert.deepEqual(await first.json(), await second.json());
  assert.equal(calls.length, 1); assert.equal(saves.length, 1);
  assert.equal((await post({ requestId, prompt: "Different request" })).status, 409);
  assert.equal(calls.length, 1);
}));

test("invalid prompts, quality, layers and missing masks never reach the provider", () => withEditor(async ({ post, source, calls }) => {
  for (const changes of [{ quality: "invented" }, { requestId: "bad" }, { prompt: "" }, { mode: "remove" }, { mode: "sketch", blank: "true" }]) assert.equal((await post(changes)).status, 400);
  assert.equal((await post({}, { selection: Buffer.from("bad-png") })).status, 400);
  const response = await post({ mode: "remove", prompt: "" }, { selection: source });
  assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.ok(calls[0].mask);
}));

test("Fal disabled fails clearly without silently switching providers", () => withEditor(async ({ post, calls }) => {
  const response = await post(); assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Enable Fal/); assert.equal(calls.length, 0);
}, { hasFal: () => false }));

test("provider failures are surfaced, cached and never auto-retried", async () => {
  let runs = 0;
  await withEditor(async ({ post }) => {
    const requestId = randomUUID();
    for (let i = 0; i < 2; i++) {
      const response = await post({ requestId }); assert.equal(response.status, 422);
      assert.match((await response.json()).error, /content policy/);
    }
    assert.equal(runs, 1);
  }, { generate: async () => { runs++; throw Object.assign(new Error("Provider content policy rejection"), { status: 422 }); } });
});

test("history failure does not lose a generated and saved edit", () => withEditor(async ({ post, saves }) => {
  const response = await post(); assert.equal(response.status, 200);
  const data = await response.json(); assert.ok(data.item.url); assert.match(data.warning, /History/); assert.equal(saves.length, 1);
}, { recordHistory: async () => { throw new Error("history unavailable"); } }));

test("failed result downloads do not regenerate and explain the completed provider charge", () => withEditor(async ({ post, calls, saves }) => {
  const response = await post(); assert.equal(response.status, 502);
  assert.match((await response.json()).error, /completed.*Check Fal history/);
  assert.equal(calls.length, 1); assert.equal(saves.length, 0);
}, { readGenerated: async () => { throw new Error("download failed"); } }));

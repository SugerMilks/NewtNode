import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ValidationError } from "@fal-ai/client";
import { creativeImageDefaultModel } from "../src/modelOptions.js";
import { runCharacterSheetGeneration, runCharacterWardrobeEdit } from "../src/nodeRunners/mediaModels.js";

const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const route = server.slice(server.indexOf('app.post("/api/node/generate-image",'), server.indexOf("\nasync function runKreaImageModel("));
const errorHelpers = server.slice(server.indexOf("function errorStatusCode("), server.indexOf("function normalizeVoidVideoFrameCount("));
const rejectionMessage = "The content could not be processed because it contained material flagged by a content checker.";

function rejectedContent() {
  return new ValidationError({
    status: 422,
    message: "Unprocessable Entity",
    body: { detail: [{
      loc: ["body", "prompt"], type: "content_policy_violation", msg: rejectionMessage,
      input: { prompt: "Private reference prompt", image_urls: ["https://example.com/private.png"] }
    }] }
  });
}

function imageRoute(error) {
  let handler;
  const requests = [];
  const deps = {
    app: { post: (_path, _limiter, callback) => { handler = callback; } },
    imageGenerationRequestLimiter: null,
    process: { env: { FAL_KEY: "test-only" } },
    atlasMediaEnabled: () => false,
    resolveImageModel: () => ({ provider: "fal-openai-image-25", displayName: creativeImageDefaultModel }),
    isLocalAssetUrl: (url) => url.startsWith("/uploads/"),
    cleanImagePromptLabel: (value) => value || "",
    resolveImageGenerationAspectRatio: async ({ value }) => value || "16:9",
    generateFalOpenAiImage2: async (request) => { requests.push(request); throw error; }
  };
  new Function(...Object.keys(deps), `${errorHelpers}\n${route}`)(...Object.values(deps));
  return {
    requests,
    async run(body = { prompt: "Create a character sheet", model: creativeImageDefaultModel }) {
      let status = 200, data;
      const res = { headersSent: false, status(value) { status = value; return this; }, json(value) { data = value; this.headersSent = true; } };
      await handler({ body }, res);
      return { status, data };
    }
  };
}

test("image route exposes Fal's safety rejection instead of its generic HTTP status text", async () => {
  const api = imageRoute(rejectedContent());
  const result = await api.run();
  assert.deepEqual(result, { status: 422, data: { status: 422, error: `prompt: ${rejectionMessage}` } });
  assert.equal(api.requests.length, 1, "Never retry a rejected generation");
  assert.doesNotMatch(JSON.stringify(result), /Private reference|private\.png|Unprocessable Entity/);
});

test("image route preserves validation details, status codes and body-less errors", async () => {
  const cases = [
    [new ValidationError({ status: 422, message: "Unprocessable Entity", body: { detail: [{ loc: ["body", "image_size", "width"], msg: "Unsupported width" }] } }), 422, "image_size.width: Unsupported width"],
    [new ValidationError({ status: 422, message: "Unprocessable Entity", body: { detail: "Reference image could not be read" } }), 422, "Reference image could not be read"],
    [new ValidationError({ status: 422, message: "Unprocessable Entity" }), 422, "Unprocessable Entity"],
    [{ statusCode: 429, body: { detail: "Too many requests" } }, 429, "Too many requests"],
    [new Error("Connection interrupted"), 500, "Connection interrupted"],
    [{}, 500, "Image generation failed."]
  ];
  for (const [error, status, message] of cases) {
    assert.deepEqual(await imageRoute(error).run(), { status, data: { status, error: message } });
  }
});

test("all Character sheet stages display the upstream rejection without resubmitting", async (t) => {
  const api = imageRoute(rejectedContent());
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
    const { status, data } = await api.run(JSON.parse(options.body));
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  });
  const request = {
    node: { id: "character", type: "character", data: { characterSheetModel: creativeImageDefaultModel } },
    prompt: "Preserve the reference", characterTag: "Test", provider: "fal",
    portrait: { localUrl: "/uploads/portrait.png" },
    baseSheet: { url: "/uploads/base.png" }, wardrobe: { localUrl: "/uploads/wardrobe.png" }
  };
  for (const [run, sheetKind, prefix] of [
    [runCharacterSheetGeneration, "image", "Character sheet"],
    [runCharacterSheetGeneration, "video", "CU video base sheet"],
    [runCharacterWardrobeEdit, "image", "Wardrobe sheet"],
    [runCharacterWardrobeEdit, "video", "CU video wardrobe sheet"]
  ]) {
    const before = fetch.mock.callCount();
    await assert.rejects(run({ ...request, sheetKind }), { message: `${prefix}: prompt: ${rejectionMessage}` });
    assert.equal(fetch.mock.callCount(), before + 1);
    assert.equal(api.requests.at(-1).model, creativeImageDefaultModel);
    assert.equal(api.requests.at(-1).resolution, "4K");
    assert.equal(api.requests.at(-1).quality, "high");
  }
});

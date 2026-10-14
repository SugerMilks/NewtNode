import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as seedance from "../src/seedance25.js";
import { validateSeedanceDraft, seedanceDraftCost } from "../src/seedanceDraft.js";
import { buildVideoGenerationRequest } from "../src/nodeRunners/videoModels.js";
import { buildAtlasVideoRequest, supportsAtlasVideoModel } from "../src/atlasVideos.js";
import { createAtlasMedia } from "../server/atlas-media.js";
import { validateAtlasVideoAssets } from "../server/atlas-validation.js";
import { mergeSeedanceDirectorReferences, seedance25ImageReferenceLimit, seedanceImageReferenceLimit } from "../src/seedanceDirectorReferences.js";
import { resolveSeedanceRuntimeProvider, kreaSeedanceEndpoint, estimateKreaSeedanceCost } from "../src/kreaSeedance.js";
import { normalizeVideoGenerateAudio, videoAudioEnforcementMode } from "../src/videoAudio.js";
import { estimateVideoRunCost, generationEstimate } from "../src/generationPricing.js";
import { generationQuoteKey } from "../src/pricingTrust.js";
import { myNewtRunInputDigest } from "../src/myNewt/runReuse.js";

const model = "Seedance 2.5", clip = "/uploads/clip.mov", plate = "/uploads/plate.png";
const original = Object.freeze({ model, seedanceTask: "edit", prompt: "Edit @Video1 with @Image1.", videos: [clip], images: [plate], duration: 5, aspectRatio: "16:9", resolution: "1080p" });

test("Atlas edit uses the same model and endpoint with native edit controls", () => {
  const input = buildAtlasVideoRequest(original);
  assert.equal(input.model, "bytedance/seedance-2.5/reference-to-video");
  assert.equal(input.omni_reference_task_type, "edit");
  assert.equal(input.duration, -1);
  assert.equal(input.ratio, "adaptive");
  assert.deepEqual(input.reference_images, [plate]);
  assert.deepEqual(input.reference_videos, [clip]);
  const reference = buildAtlasVideoRequest({ ...original, seedanceTask: "reference" });
  assert.equal(reference.duration, 5);
  assert.equal(reference.ratio, "16:9");
  assert.equal(reference.omni_reference_task_type, "reference");
});

test("edit validation rejects unsupported models/providers and ambiguous inputs", () => {
  const valid = { model, seedanceTask: "edit", provider: "atlas", videos: [clip] };
  for (const patch of [{ seedanceTask: "auto" }, { model: "Seedance 2.0" }, { provider: "krea" },
    { videos: [] }, { videos: [clip, clip] }, { startFrames: [plate] }, { endFrames: [plate] }, { filmDirector: {} }]) {
    assert.throws(() => seedance.validateSeedance25Task({ ...valid, ...patch }), { status: 400 });
  }
  for (const patch of [{ videos: [] }, { videos: [clip, clip] }, { startImage: plate }, { model: "Seedance 2.0" }]) {
    assert.throws(() => buildAtlasVideoRequest({ ...original, ...patch }));
  }
  assert.equal(seedance.validateSeedance25Task({ model: "Seedance 2.0" }), false);
});

test("edit asset validation probes source duration before upload", async () => {
  for (const duration of [0, 2, 3.99, 30.01, NaN, undefined]) {
    await assert.rejects(validateAtlasVideoAssets({ model, seedanceTask: "edit", videos: [clip] }, async () => ({ duration })), /4 and 30 seconds/);
  }
  for (const duration of [4, 10.2, 30]) {
    await validateAtlasVideoAssets({ model, seedanceTask: "edit", videos: [clip] }, async () => ({ duration, fps: 24, mimeType: "video/quicktime", bytes: 1024 }));
  }
});

test("client edit request matches source and retains old node choices", () => {
  const node = { id: "video", data: { model, seedanceTask: "edit", duration: "5 seconds", aspectRatio: "21:9", resolution: "1080p" } };
  const before = structuredClone(node);
  const request = buildVideoGenerationRequest({ node, prompt: "Edit @Clip", referenceVideoUrls: [clip], referenceImageUrls: [plate] });
  assert.equal(request.duration, "Auto"); assert.equal(request.aspectRatio, "Auto"); assert.equal(request.model, model);
  assert.deepEqual(node, before);
  assert.throws(() => buildVideoGenerationRequest({ node, referenceVideoUrls: [clip], filmDirector: { videoModel: model } }), /Disconnect Director/);
  const regular = buildVideoGenerationRequest({ node: { ...node, data: { ...node.data, seedanceTask: "reference" } }, referenceVideoUrls: [clip] });
  assert.equal(regular.duration, "5 seconds"); assert.equal(regular.aspectRatio, "21:9");
});

test("unknown tags and missing numbered references cannot silently consume a generation", () => {
  const counts = { images: 1, videos: 1, audio: 1 };
  seedance.validateSeedance25ReferenceTags("Edit @Video1 using @Image1 and @Audio1. Email artist@example.com", counts);
  seedance.validateSeedance25ReferenceTags("Edit [Video1] using [Image1].", counts);
  for (const tag of ["@Clip", "@Cilp", "@Image2", "@Video0", "[Video2]", "@Audio2"]) {
    assert.throws(() => seedance.validateSeedance25ReferenceTags(`Use ${tag}.`, counts), /Unmatched reference tags/);
  }
});

test("edit cost stays unknown and cannot reuse regular-generation quote or output", async () => {
  const settings = { kind: "video", model, provider: "fal", duration: "5 seconds" };
  assert.ok(estimateVideoRunCost(settings) > 0);
  for (const provider of ["fal", "atlas", "krea"]) {
    assert.equal(estimateVideoRunCost({ ...settings, provider, seedanceTask: "edit" }), null);
    assert.equal(generationEstimate({ ...settings, provider, seedanceTask: "edit" }).amountUsd, null);
  }
  assert.notEqual(generationQuoteKey(settings), generationQuoteKey({ ...settings, seedanceTask: "edit" }));
  const graph = { nodes: [{ id: "video", type: "videoModel", data: { model } }], edges: [] };
  const before = await myNewtRunInputDigest(graph, "video");
  graph.nodes[0].data.seedanceTask = "edit";
  assert.notEqual(await myNewtRunInputDigest(graph, "video"), before);
});

const source = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
const routeCode = source.slice(source.indexOf('app.post("/api/node/generate-video"'), source.indexOf("\nasync function runKlingO3Video"));
const referenceCode = source.slice(source.indexOf("function normalizeReferenceNames("), source.indexOf("function cleanImagePromptLabel("));
const refs = new Function("uniqueReferenceName", `${referenceCode}; return { normalizeReferenceNames, rewriteSeedanceReferenceMentions };`)((name, used) => { assert.equal(used.has(name), false); used.add(name); return name; });

function harness(t, { provider = "atlas", duration = 5, failGeneration = false, draftId = "draft-123" } = {}) {
  let handler;
  const calls = [], histories = [];
  const submit = async (input) => { calls.push({ kind: "generate", input }); if (failGeneration) throw new Error("Provider failed"); return { requestId: "test", url: "https://example.com/result.mp4", job: { ...(input.draft ? { draft_id: draftId } : {}) } }; };
  const inspect = async (url) => url === clip ? { mimeType: "video/quicktime", bytes: 1000, fps: 24, duration }
    : { mimeType: "image/png", bytes: 1000, width: 1920, height: 1080 };
  const media = createAtlasMedia({
    client: { upload: async (asset) => { calls.push({ kind: "upload" }); return `https://example.com/${asset.fileName}`; }, generate: async ({ input }) => submit(input) },
    readLocalAsset: async (url) => ({ fileName: url.split("/").at(-1), buffer: Buffer.from("mock") }),
    validateVideoAssets: (options) => validateAtlasVideoAssets(options, inspect)
  });
  const deps = { ...seedance, ...refs, seedance25ImageReferenceLimit, seedanceImageReferenceLimit, mergeSeedanceDirectorReferences,
    validateSeedanceDraft, seedanceDraftCost,
    createSingleSubmissionFalClient: ({ credentials, endpoint }) => { calls.push({ kind: "client", credentials, endpoint }); return {}; },
    seedanceDrafts: { recordDraft: async (record) => { calls.push({ kind: "receipt", record }); return record.draftId ? { receiptId: "receipt", draftId: record.draftId, provider: record.provider } : null; } },
    resolveSeedanceRuntimeProvider, normalizeVideoGenerateAudio, videoAudioEnforcementMode, supportsAtlasVideoModel,
    app: { post: (_path, callback) => { handler = callback; } },
    console: { error: () => {} }, process: { env: { FAL_KEY: provider === "fal" ? "test" : "", KREA_API_KEY: provider === "krea" ? "test" : "", ATLAS_API_KEY: "test" } },
    resolveVideoModel: (displayName) => ({ displayName, provider: "fal-seedance" }),
    filmDirectorUsesMusic: () => false, atlasMediaEnabled: () => provider === "atlas",
    firstLocalOutput: (urls = []) => urls[0] || "", filterFilmDirectorReferencesForOutput: (value = []) => value,
    isLocalAssetUrl: (url) => typeof url === "string" && url.startsWith("/uploads/"),
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    resolveLocalAssetPath: async () => ({ filePath: "/mock/clip.mov" }), probeVideoFile: async () => ({ duration }),
    optionalInteger: () => undefined, atlasMedia: media,
    uploadLocalOutputToFal: async (url) => { calls.push({ kind: "upload" }); return `https://example.com/${url.split("/").at(-1)}`; },
    seedanceEndUserId: "test-user", subscribeFal: async (_endpoint, { input }) => { const result = await submit(input); return { requestId: result.requestId, data: { video: { url: result.url }, ...(input.draft ? { draft_id: draftId } : {}) } }; },
    kreaSeedanceEndpoint, estimateKreaSeedanceCost, durationToSeconds: value => Number.parseInt(value, 10),
    uploadLocalOutputToKrea: async (url, key) => { calls.push({ kind: "upload", key }); return `https://example.com/${url.split("/").at(-1)}`; },
    runKreaSeedanceGeneration: async ({ input, apiKey }) => { calls.push({ kind: "krea-key", key: apiKey }); const result = await submit(input); return { requestId: result.requestId, remoteVideo: { url: result.url } }; },
    downloadVideo: async () => ({ publicPath: "/outputs/edited.mp4", fileName: "edited.mp4", bytes: 1000 }),
    appendHistory: async (value) => histories.push(value), routeKindLabel: (kind) => kind,
    projectFromBody: () => ({}), nodeFromBody: () => ({}), sendApiError: (res, error) => res.status(error.status || 500).json({ error: error.message }), randomUUID: () => "test"
  };
  new Function(...Object.keys(deps), routeCode)(...Object.values(deps));
  t.mock.method(globalThis, "fetch", () => { throw new Error("Network forbidden"); });
  const run = async (patch = {}) => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body: { model, seedanceTask: "edit", prompt: "Edit @Clip using @Plate.", referenceImageUrls: [plate], referenceImageLabels: ["@Plate"], referenceVideoUrls: [clip], referenceVideoLabels: ["@Clip"], duration: "5 seconds", aspectRatio: "16:9", resolution: "1080p", ...patch } }, response);
    return response;
  };
  return { run, calls, histories };
}

for (const provider of ["atlas", "fal"]) {
  test(`${provider} actual node route sends opt-in editing, mapped tags, and source settings`, async (t) => {
    const h = harness(t, { provider }), result = await h.run();
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    const submitted = h.calls.filter(x => x.kind === "generate");
    assert.equal(submitted.length, 1);
    const { input } = submitted[0];
    assert.equal(input.prompt, "Edit @Video1 using @Image1.");
    assert.equal(input[provider === "atlas" ? "omni_reference_task_type" : "task"], provider === "atlas" ? "edit" : "editing");
    assert.equal(input.duration, provider === "atlas" ? -1 : "auto");
    assert.equal(input[provider === "atlas" ? "ratio" : "aspect_ratio"], provider === "atlas" ? "adaptive" : "auto");
    assert.equal(h.histories[0].settings.seedanceTask, "edit");
    assert.equal(h.histories[0].settings.sourceDurationSeconds, 5);
    assert.equal(h.histories[0].cost.amountUsd, null);
    assert.equal(result.body.video.localUrl, "/outputs/edited.mp4");
  });
  test(`${provider} invalid source duration fails before uploads or generation`, async (t) => {
    const h = harness(t, { provider, duration: 3.5 }), result = await h.run();
    assert.equal(result.statusCode, 400); assert.match(result.body.error, /4 and 30 seconds/); assert.deepEqual(h.calls, []);
  });
  test(`${provider} provider failure is surfaced without retry or saved success`, async (t) => {
    const h = harness(t, { provider, failGeneration: true }), result = await h.run();
    assert.equal(result.statusCode, 500); assert.equal(h.calls.filter(x => x.kind === "generate").length, 1); assert.equal(h.histories.length, 0);
  });
}

test("actual node route keeps generation as the legacy default and rejects unmatched tags before upload", async (t) => {
  const h = harness(t), result = await h.run({ seedanceTask: undefined });
  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  const { input } = h.calls.find(x => x.kind === "generate");
  assert.equal(input.omni_reference_task_type, "reference"); assert.equal(input.duration, 5); assert.equal(input.ratio, "16:9");
  h.calls.length = 0;
  const typo = await h.run({ prompt: "Edit @Cilp with @Plate." });
  assert.equal(typo.statusCode, 400); assert.match(typo.body.error, /@Cilp/); assert.deepEqual(h.calls, []);
});

test("Krea edit request fails before uploading and never switches providers", async (t) => {
  const h = harness(t, { provider: "krea" }), result = await h.run();
  assert.equal(result.statusCode, 400); assert.match(result.body.error, /Fal and Atlas only/); assert.deepEqual(h.calls, []);
});

for (const provider of ["fal", "atlas"]) for (const mode of ["text", "image", "reference", "edit"]) {
  test(`${provider} actual ${mode} route sends draft and retains finishing metadata`, async t => {
    const h = harness(t, { provider });
    const result = await h.run({ seedanceDraft: true, seedanceTask: mode === "edit" ? "edit" : "reference",
      ...(mode === "image" ? { startFrameUrls: [plate] } : {}),
      ...(["text", "image"].includes(mode) ? { prompt: "A cinematic scene", referenceImageUrls: [], referenceVideoUrls: [] } : {}) });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    assert.equal(h.calls.filter(x => x.kind === "generate").length, 1);
    const input = h.calls.find(x => x.kind === "generate").input;
    assert.equal(input.draft, true); assert.equal(input.resolution, "480p");
    if (provider === "fal") assert.equal(h.calls.find(x => x.kind === "client").credentials, "test");
    assert.equal(result.body.seedanceDraft.provider, provider);
    assert.equal(result.body.seedanceDraft.draftId, "draft-123");
    assert.equal(result.body.cost.amountUsd, null);
    assert.equal(h.histories[0].settings.resolution, "480p");
    assert.equal(h.histories[0].settings.draft.receiptId, "receipt");
    if (mode === "edit") assert.equal(input[provider === "fal" ? "task" : "omni_reference_task_type"], provider === "fal" ? "editing" : "edit");
  });
}

test("draft rejects unsupported providers and invalid values before uploads or billing", async t => {
  for (const provider of ["disabled"]) {
    const h = harness(t, { provider });
    const result = await h.run({ seedanceDraft: true });
    assert.equal(result.statusCode, 400); assert.match(result.body.error, /Draft mode requires/); assert.deepEqual(h.calls, []);
  }
  const h = harness(t, { provider: "fal" });
  for (const patch of [{ seedanceDraft: "true" }, { seedanceDraft: true, model: "Seedance 2.0" }]) {
    assert.equal((await h.run(patch)).statusCode, 400);
    assert.deepEqual(h.calls, []);
  }
});

for (const mode of ["text", "image", "reference"]) test(`Krea ${mode} draft is preview-only and never creates a completion receipt`, async t => {
  const h = harness(t, { provider: "krea" });
  const result = await h.run({ seedanceDraft: true, seedanceTask: "reference",
    ...(mode === "image" ? { startFrameUrls: [plate] } : {}),
    ...(["text", "image"].includes(mode) ? { prompt: "A cinematic scene", referenceImageUrls: [], referenceVideoUrls: [] } : {}) });
  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  const input = h.calls.find(x => x.kind === "generate").input;
  assert.equal(input.draft, true); assert.equal(input.resolution, "480p");
  assert.equal(result.body.seedanceDraft.completionSupported, false);
  assert.equal(result.body.seedanceDraft.provider, "krea");
  assert.equal(h.calls.filter(x => x.kind === "receipt").length, 0);
  assert.equal(h.calls.find(x => x.kind === "krea-key").key, "test");
  assert.match(h.histories[0].cost.pricingBasis, /Krea/);
});

test("missing draft ID preserves the returned video and warns without a fake finish action", async t => {
  const h = harness(t, { provider: "fal", draftId: null });
  const { body, statusCode } = await h.run({ seedanceDraft: true });
  assert.equal(statusCode, 200); assert.equal(body.video.localUrl, "/outputs/edited.mp4");
  assert.equal(body.seedanceDraft, null); assert.match(body.warning, /without a draft ID/);
});

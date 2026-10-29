import test from "node:test";
import assert from "node:assert/strict";
import { createVideoOutpaintRunner, registerVideoOutpaintRoutes, validateOutpaintInputs } from "../server/routes/videoOutpaint.js";
import { finishSeedanceOutpaint, prepareSeedanceOutpaint } from "../server/seedance-outpaint.js";
import { planVideoOutpaint, normalizeUtilityOutpaintSettings, seedanceOutpaintRequest } from "../src/videoOutpaint.js";
import { buildUtilityVideoRequest, normalizeUtilityVideoGenerationResult } from "../src/nodeRunners/videoModels.js";
import { nodeBatchCount } from "../src/nodeRunner.js";
import { displayMediaUrl } from "../src/mediaAssets.js";

const local = url => typeof url === "string" && /^\/(uploads|outputs)\//.test(url);
const source = "/uploads/source.mp4";
const settings = normalizeUtilityOutpaintSettings({ seedanceResolution: "480p" });
const prepared = { sourceUrl: source, videoUrl: "/outputs/canvas.mp4", generationVideoUrl: "/outputs/conditioning.mp4", maskVideoUrl: "/outputs/mask.mp4", maskImageUrl: "/outputs/mask.png", plan: planVideoOutpaint({ width: 640, height: 360, duration: 5, fps: 24 }, settings) };
const request = (values = {}) => ({ body: { model: "Video Outpaint", prompt: "Continue the visible garden.", referenceVideoUrls: [source], referenceImageUrls: ["/uploads/look.png"], videoOutpaint: settings, ...values } });
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });

test("Outpaint validates references without dropping extra source, canvas or image inputs", () => {
  assert.equal(validateOutpaintInputs(request().body, local).model, "seedance-2.5");
  for (const body of [{ referenceVideoUrls: [] }, { referenceVideoUrls: [source, source] }, { referenceVideoUrls: ["https://example.org/video"] }, { canvasVideoUrl: "/etc/passwd" }, { referenceImageUrls: [null] }, { referenceImageUrls: Array(31).fill("/uploads/look.png") }]) {
    assert.throws(() => validateOutpaintInputs(request(body).body, local));
  }
  assert.throws(() => validateOutpaintInputs(request({ videoOutpaint: { model: "wan-vace" }, referenceImageUrls: Array(5).fill("/uploads/look.png") }).body, local), /up to 4/);
});

test("Seedance Outpaint uses editing on the prepared canvas with ordered reference labels and no draft or provider replay", async () => {
  const calls = [], histories = [];
  const runner = createVideoOutpaintRunner({ isLocalAssetUrl: local, service: { prepare: async () => prepared }, seedanceConnection: () => ({ provider: "atlas", apiKey: "fake-test-key" }),
    generateSeedance: async (req, res, context) => { calls.push({ body: req.body, context }); throw new Error("Provider response interrupted"); }, generateWan: () => assert.fail("Never switch engines"), appendHistory: h => histories.push(h) });
  await assert.rejects(runner(request({ videoOutpaintContext: { plan: { needsOutpaint: false } } }), response()), /interrupted/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "Seedance 2.5");
  assert.equal(calls[0].body.seedanceTask, "edit");
  assert.equal(calls[0].body.seedanceDraft, false);
  assert.equal(calls[0].context.prepared, prepared);
  assert.deepEqual(calls[0].body.referenceVideoUrls, [prepared.generationVideoUrl]);
  assert.deepEqual(calls[0].body.referenceImageLabels, ["Image1"]);
  assert.equal(calls[0].body.generateAudio, false);
  assert.match(calls[0].body.prompt, /SPATIAL LOCK/);
});

test("Krea-only outpaint stops before provider submission; crop-only works without credentials", async () => {
  await assert.rejects(prepareSeedanceOutpaint(seedanceOutpaintRequest(request().body), { provider: "krea", apiKey: "", prepare: async () => prepared }), /requires Fal or Atlas/);
  const histories = [], crop = { ...prepared, plan: { ...prepared.plan, needsOutpaint: false } };
  const runner = createVideoOutpaintRunner({ isLocalAssetUrl: local, service: { prepare: async () => crop, finish: async () => ({ filePath: "crop.mov", publicPath: "/outputs/crop.mov", fileName: "crop.mov", bytes: 1, mimeType: "video/quicktime", outputFormat: "ProRes" }) },
    seedanceConnection: () => ({ provider: "", apiKey: "" }), generateSeedance: () => assert.fail("No paid work"), generateWan: () => assert.fail("No paid work"),
    resolveAsset: async () => ({ filePath: "canvas.mp4" }), probeVideo: async () => ({ duration: 3.375 }), appendHistory: async h => histories.push(h), projectFromBody: () => "Project", nodeFromBody: () => "Utility" });
  const res = response(); await runner(request({ prompt: "" }), res);
  assert.equal(res.body.cost.amountUsd, 0); assert.equal(res.body.video.mimeType, "video/quicktime");
  assert.equal(histories[0].provider, "local"); assert.equal(res.body.videoOutpaint.localCrop, true);
});

test("Wan keeps mask timing and neutral-gray conditioning without provider preprocessing or prompt expansion", async () => {
  const wan = { ...prepared, plan: { ...prepared.plan, settings: { ...settings, model: "wan-vace" } } };
  let called;
  const runner = createVideoOutpaintRunner({ isLocalAssetUrl: local, service: { prepare: async () => wan }, falKey: () => "fake-test-key",
    generateSeedance: () => assert.fail(), generateWan: async (req, res, options) => { called = { req, options }; } });
  await runner(request({ videoOutpaint: { model: "wan-vace" }, wanVaceInpainting: { preprocess: true, seed: 123, enablePromptExpansion: true } }), response());
  assert.deepEqual(called.options.referenceVideoUrls, [prepared.generationVideoUrl]);
  assert.deepEqual(called.options.maskVideoUrls, [prepared.maskVideoUrl]);
  assert.equal(called.req.body.wanVaceInpainting.preprocess, false);
  assert.equal(called.req.body.wanVaceInpainting.enablePromptExpansion, false);
  assert.equal(called.req.body.wanVaceInpainting.seed, 123);
  assert.equal(called.options.selectedVideoModel.id, "fal-ai/wan-vace-14b/inpainting");
});

test("finishing failure returns the paid raw result, no retry and no false restoration claim", async () => {
  let finishes = 0;
  const raw = { filePath: "raw.mp4", publicPath: "/outputs/raw.mp4" };
  const result = await finishSeedanceOutpaint({}, prepared, raw, { width: 480, height: 854 }, { finish: async () => { finishes++; throw new Error("Disk full"); } });
  assert.equal(finishes, 1); assert.equal(result.output, raw); assert.equal(result.details.restoredSource, false);
  assert.match(result.warning, /paid raw result was preserved/);
  const item = normalizeUtilityVideoGenerationResult({ modelName: "Video Outpaint", video: { localUrl: raw.publicPath }, videoOutpaint: result.details, warning: result.warning, cost: { amountUsd: null } }, 0);
  assert.equal(item.videoOutpaint.rawVideoUrl, raw.publicPath); assert.equal(item.cost.amountUsd, null); assert.equal(item.warning, result.warning);
});

test("requests retain framing and workflow context, single-run semantics and canonical MOV output URLs", () => {
  const node = { id: "outpaint", type: "utility", data: { title: "My Outpaint", utilityMode: "video", utilityVideoModel: "Video Outpaint", videoOutpaint: { model: "wan-vace", frame: { x: -0.1, y: 0, width: 1.2 } }, batchCount: 9, seed: 0 } };
  const body = buildUtilityVideoRequest({ node, model: "Video Outpaint", prompt: "Garden", referenceVideoUrls: [source], canvasVideoUrls: ["/uploads/canvas.mp4"], projectId: "project", projectName: "Garden" });
  assert.equal(body.videoOutpaint.model, "wan-vace"); assert.equal(body.videoOutpaint.frame.width, 1.2);
  assert.equal(body.canvasVideoUrl, "/uploads/canvas.mp4"); assert.equal(body.wanVaceInpainting.seed, 0);
  assert.equal(body.nodeId, "outpaint"); assert.equal(nodeBatchCount(node), 1);
  assert.equal(displayMediaUrl("/workflow-assets/p/outputs/final.mov"), "/api/video-preview?url=%2Fworkflow-assets%2Fp%2Foutputs%2Ffinal.mov");
  assert.equal(displayMediaUrl("/outputs/preview.mp4"), "/outputs/preview.mp4");
  assert.equal(displayMediaUrl("https://example.org/movie.mov"), "https://example.org/movie.mov");
});

test("prompt drafting supplies actual sampled pixels and reference images to the active vision provider", async () => {
  const routes = new Map(), records = []; let analyzed;
  const deps = { isLocalAssetUrl: local, resolveAsset: async () => ({ filePath: "canvas.mp4" }), probeVideo: async () => ({ duration: 4, fps: 24 }),
    createTarget: async () => ({ filePath: "sample.jpg", publicPath: "/outputs/sample.jpg" }), runFfmpeg: async () => {},
    analyze: async options => { analyzed = options; return { text: "Continue the garden into both sides.", provider: "atlas", model: "test", usages: [{ tokens: 10 }] }; },
    estimateCost: () => ({ amountUsd: null }), appendHistory: async h => records.push(h), projectFromBody: () => "Project", nodeFromBody: () => "Utility" };
  registerVideoOutpaintRoutes({ post: (route, handler) => routes.set(route, handler) }, deps);
  const res = response();
  await routes.get("/api/node/video-outpaint-prompt")({ body: { mode: "auto", sourceVideoUrl: prepared.videoUrl, maskImageUrl: prepared.maskImageUrl, preparedPlan: prepared.plan, outpaintModel: "seedance-2.5", referenceImageUrls: ["/uploads/look.png"] } }, res);
  assert.equal(res.statusCode, 200); assert.equal(analyzed.mediaType, "image"); assert.equal(analyzed.inputs.length, 7);
  assert.match(analyzed.prompt, /never claim every frame was inspected/);
  assert.equal(records.length, 1); assert.equal(records[0].provider, "atlas"); assert.equal(res.body.cost.amountUsd, null);
});

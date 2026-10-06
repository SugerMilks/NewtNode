import test from "node:test";
import assert from "node:assert/strict";
import { nodeApi } from "../src/api/newtApi.js";
import { runImageModelGeneration } from "../src/nodeRunners/mediaModels.js";
import { estimateImageRunCost, generationEstimate } from "../src/generationPricing.js";
import { myNewtSnapshot } from "../src/myNewt/contract.js";
import { myNewtRunInputDigest } from "../src/myNewt/runReuse.js";
import { resetCopiedNodeRuntime } from "../src/workflowState.js";

const model = "Ideogram 4.5";
const fixture = (patch = {}) => ({
  node: { id: "image-node", type: "imageModel", data: {
    title: "Lettered poster", model, resolution: "2K", aspectRatio: "16:9", quality: "medium",
    enablePromptExpansion: false, background: "auto", ...patch
  } },
  prompt: "A poster for a botanical garden", imagePromptItems: [], index: 0,
  workflowContext: { projectId: "fixture-project", projectName: "Posters", workflowPackageId: "fixture-package", workflowPackagePath: "/fixture/project" }
});
const response = (patch = {}) => ({ response: { ok: true }, data: { model, provider: "fal.ai", seed: 0,
  cost: { amountUsd: null, currency: "USD" }, image: { localUrl: "/outputs/poster.png", thumbnailUrl: "/outputs/poster-thumb.jpg" }, ...patch } });

test("Ideogram runner submits exact node settings/context and retains seed, unknown cost and History warning", async (t) => {
  const generate = t.mock.method(nodeApi, "generateImage", async () => response({ warning: "Image saved, but this run could not be added to History." }));
  const items = await runImageModelGeneration(fixture());
  const [request] = generate.mock.calls[0].arguments;
  assert.equal(generate.mock.callCount(), 1);
  assert.equal(request.model, model);
  assert.equal(request.quality, "medium");
  assert.equal(request.resolution, "2K");
  assert.equal(request.aspectRatio, "16:9");
  assert.equal(request.enablePromptExpansion, false);
  assert.equal(Object.hasOwn(request, "background"), false);
  assert.equal(Object.hasOwn(request, "editPrecision"), false);
  assert.deepEqual(request.imagePromptUrls, []);
  assert.equal(request.nodeId, "image-node");
  assert.equal(request.nodeTitle, "Lettered poster");
  assert.equal(request.workflowPackageId, "fixture-package");
  assert.equal(request.workflowPackagePath, "/fixture/project");
  assert.equal(items[0].url, "/outputs/poster.png");
  assert.equal(items[0].thumbnailUrl, "/outputs/poster-thumb.jpg");
  assert.equal(items[0].seed, 0);
  assert.equal(items[0].enablePromptExpansion, false);
  assert.equal(items[0].cost.amountUsd, null);
  assert.match(items[0].warning, /could not be added to History/);
});

test("Ideogram prompt expansion defaults true but other models receive no new setting", async (t) => {
  const generate = t.mock.method(nodeApi, "generateImage", async () => response());
  await runImageModelGeneration(fixture({ enablePromptExpansion: undefined }));
  assert.equal(generate.mock.calls[0].arguments[0].enablePromptExpansion, true);
  await runImageModelGeneration(fixture({ model: "OpenAI Image 2.5 Sunburst", quality: "xhigh", background: "transparent" }));
  const previous = generate.mock.calls[1].arguments[0];
  assert.equal(previous.quality, "xhigh");
  assert.equal(previous.background, "transparent");
  assert.equal(Object.hasOwn(previous, "enablePromptExpansion"), false);
});

test("Ideogram runner rejects invalid raw settings/references before invoking the API", async (t) => {
  const generate = t.mock.method(nodeApi, "generateImage", async () => assert.fail("No request expected"));
  for (const patch of [{ quality: "very_low" }, { quality: "xhigh" }, { resolution: "4K" }, { aspectRatio: "Auto" },
    { background: "transparent" }, { enablePromptExpansion: "false" }]) {
    await assert.rejects(runImageModelGeneration(fixture(patch)));
  }
  await assert.rejects(runImageModelGeneration({ ...fixture({ ideogramSourceUrl: "/uploads/disconnected.png" }), imagePromptItems: [{ url: "/uploads/reference.png", label: "Reference" }] }), /no longer connected/i);
  await assert.rejects(runImageModelGeneration({ ...fixture(), prompt: "x".repeat(10001) }), /10,000/);
  assert.equal(generate.mock.callCount(), 0);
});

test("reference runner preserves chosen source and labels, and omits text-only expansion", async (t) => {
  const sourceUrl = "/uploads/source.png";
  const generate = t.mock.method(nodeApi, "generateImage", async () => response({ image: {
    localUrl: "/outputs/edit.png", sourceUrl, imagePromptCount: 2, editPrecision: "regular"
  } }));
  const items = await runImageModelGeneration({ ...fixture({ ideogramSourceUrl: sourceUrl }), aspectRatio: "Auto",
    imagePromptItems: [{ url: "/uploads/guide.png", label: "Guide" }, { url: sourceUrl, label: "Source" }] });
  const request = generate.mock.calls[0].arguments[0];
  assert.equal(request.ideogramSourceUrl, sourceUrl);
  assert.deepEqual(request.imagePromptLabels, ["Guide", "Source"]);
  assert.equal(Object.hasOwn(request, "enablePromptExpansion"), false);
  assert.equal(Object.hasOwn(items[0], "enablePromptExpansion"), false);
  assert.equal(items[0].referenceSourceUrl, sourceUrl); assert.equal(items[0].sourceUrl, "/outputs/edit.png"); assert.equal(items[0].imagePromptCount, 2);
  const { node } = fixture({ ideogramSourceUrl: sourceUrl });
  assert.equal(resetCopiedNodeRuntime(node.data).ideogramSourceUrl, sourceUrl);
  const graph = { nodes: [node], edges: [], groups: [] };
  const digest = await myNewtRunInputDigest(myNewtSnapshot(graph), node.id);
  node.data.ideogramSourceUrl = "/uploads/guide.png";
  assert.notEqual(await myNewtRunInputDigest(myNewtSnapshot(graph), node.id), digest);
  assert.equal(generationEstimate({ kind: "image", model, referenceCount: 2, batchCount: 1 }).endpoint, "ideogram/v4.5/edit");
});

test("Ideogram runner reports uncertain, failed and empty responses without retrying", async (t) => {
  let attempt = 0;
  const generate = t.mock.method(nodeApi, "generateImage", async () => {
    attempt++;
    if (attempt === 1) throw new Error("Connection interrupted");
    if (attempt === 2) return { response: { ok: false }, data: { error: "Provider unavailable" } };
    return { response: { ok: true }, data: {} };
  });
  await assert.rejects(runImageModelGeneration(fixture()), /Connection interrupted/);
  assert.equal(generate.mock.callCount(), 1);
  await assert.rejects(runImageModelGeneration(fixture()), /Run 1: Provider unavailable/);
  assert.equal(generate.mock.callCount(), 2);
  await assert.rejects(runImageModelGeneration(fixture()), /no saved image.*Check History/);
  assert.equal(generate.mock.callCount(), 3);
});

test("Ideogram generation cost stays unknown across qualities/providers/batches", () => {
  for (const provider of ["fal", "krea", "atlas"]) {
    for (const quality of ["low", "medium", "high"]) {
      const settings = { kind: "image", model, provider, quality, resolution: "2K", aspectRatio: "16:9", batchCount: 4 };
      assert.equal(estimateImageRunCost(settings), null);
      const cost = generationEstimate(settings);
      assert.equal(cost.amountUsd, null);
      assert.equal(cost.units, 4);
      assert.equal(cost.pricingStatus, "unavailable");
      assert.match(cost.pricingBasis, /not.*verified|unverified|not.*available/i);
    }
  }
});

test("prompt expansion survives copy/save/snapshot and invalidates completed-run reuse", async () => {
  const { node } = fixture();
  const graph = { nodes: [node], edges: [], groups: [] };
  const saved = JSON.parse(JSON.stringify(graph));
  assert.equal(resetCopiedNodeRuntime(saved.nodes[0].data).enablePromptExpansion, false);
  const before = myNewtSnapshot(saved);
  assert.equal(before.nodes[0].data.enablePromptExpansion, false);
  const beforeDigest = await myNewtRunInputDigest(before, node.id);
  saved.nodes[0].data.enablePromptExpansion = true;
  assert.notEqual(await myNewtRunInputDigest(myNewtSnapshot(saved), node.id), beforeDigest);
});

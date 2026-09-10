import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nodeApi } from "../src/api/newtApi.js";
import { assertCharacterOutputReferences } from "../src/characterSheetLibrary.js";
import { coverageModelOptions, storyboardImageModelOptions, creativeImageDefaultModel } from "../src/modelOptions.js";
import { coverageShotsForMethod, coveragePreviewItems } from "../src/coveragePresets.js";
import { runCoverageGeneration, runCharacterSheetGeneration, runCharacterWardrobeEdit, runImageModelGeneration } from "../src/nodeRunners/mediaModels.js";
import { normalizeStoryboardImageModel, storyboardImageSettings } from "../src/storyboardImageModels.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const storyboardHandler = source.slice(source.indexOf("  async function generateStoryboardNode("), source.indexOf("  async function reviewStoryboardGeneratedFrame("));

test("specialized creative lists offer Sunburst first and exclude Flare", () => {
  for (const choices of [coverageModelOptions, storyboardImageModelOptions]) {
    assert.equal(choices[0], creativeImageDefaultModel);
    assert.ok(!choices.some((model) => model.includes("Flare")));
  }
});

for (const provider of ["fal", "krea", "atlas"]) {
  test(`${provider} Coverage sends nine Sunburst reference edits and keeps all full-resolution Preview outputs`, async (t) => {
    const generate = t.mock.method(nodeApi, "generateImage", async () => ({ response: { ok: true }, data: { image: { localUrl: `/outputs/frame-${generate.mock.callCount()}.png`, thumbnailUrl: "/thumb.jpg" } } }));
    const results = [];
    for (const [index, shot] of coverageShotsForMethod("Standard").entries()) {
      results.push(await runCoverageGeneration({ node: { id: "coverage", data: { model: creativeImageDefaultModel, quality: "high", resolution: "2K" } }, sourceImageUrl: "/original.png", aspectRatio: "21:9", shot, index, provider }));
    }
    assert.equal(generate.mock.callCount(), 9);
    for (const call of generate.mock.calls) {
      const body = call.arguments[0];
      assert.equal(body.model, creativeImageDefaultModel);
      assert.equal(body.quality, "high");
      assert.equal(body.resolution, provider !== "krea" ? "2K" : "1K");
      assert.equal(body.aspectRatio, provider !== "krea" ? "21:9" : "3:2");
      assert.deepEqual(body.imagePromptUrls, ["/original.png"]);
    }
    const preview = coveragePreviewItems(results);
    assert.equal(preview.length, 9);
    assert.equal(new Set(preview.map((item) => item.url)).size, 9);
    assert.ok(preview.every((item) => item.url.startsWith("/outputs/")));
  });

  test(`${provider} Storyboard character preparation uses Sunburst with supported dimensions`, async (t) => {
    const generate = t.mock.method(nodeApi, "generateImage", async () => ({ response: { ok: true }, data: { image: { localUrl: "/sheet.png" } } }));
    await runCharacterSheetGeneration({ node: { id: "board", type: "storyboard", data: { model: creativeImageDefaultModel } }, prompt: "Preserve storyboard line art", portrait: { localUrl: "/portrait.png" }, characterTag: "Emma", provider });
    const body = generate.mock.calls[0].arguments[0];
    assert.equal(body.model, creativeImageDefaultModel);
    assert.equal(body.quality, "high");
    assert.equal(body.resolution, provider !== "krea" ? "4K" : "1K");
    assert.equal(body.aspectRatio, provider !== "krea" ? "16:9" : "3:2");
    assert.deepEqual(body.imagePromptUrls, ["/portrait.png"]);
  });

  test(`${provider} real Storyboard generation and its QC retry keep Sunburst and frame references`, async (t) => {
    const node = { id: "board", type: "storyboard", data: { model: creativeImageDefaultModel, resolution: "1K", aspectRatio: "16:9", storyboardFrames: [{ id: "one", number: 1, prompt: "Walk to the door" }] } };
    const nodesRef = { current: [node] };
    const updateNode = (_id, patch) => { node.data = { ...node.data, ...patch }; };
    const generate = t.mock.method(nodeApi, "generateImage", async () => ({ response: { ok: true }, data: { image: { localUrl: "/frame.png" } } }));
    let reviews = 0;
    const deps = {
      nodesRef, edgesRef: { current: [] }, generationProvider: provider, storyboardImageSettings, normalizeStoryboardImageModel, runImageModelGeneration, assertCharacterOutputReferences,
      buildIncomingByNode: () => ({}), expandStoryboardDirectorIncoming: (incoming) => incoming,
      normalizedStoryboardFrames: (frames) => frames, storyboardSceneDescriptionForNode: () => "The character walks to the door", storyboardPlanIsCurrent: () => true,
      updateNode, workflowRequestContext: () => ({}), connectedDirectorPackageSource: () => null,
      ensureStoryboardCharactersReady: async () => node,
      storyboardNodeWithMostPreparedCharacters: (_prepared, state) => state,
      storyboardAspectRatioForNode: (current) => current.data.aspectRatio, storyboardResolutionForNode: (current) => current.data.resolution,
      patchStoryboardFrame: (_id, frameId, patch) => { node.data.storyboardFrames = node.data.storyboardFrames.map((frame) => frame.id === frameId ? { ...frame, ...patch } : frame); },
      storyboardContinuityReferenceItems: () => [{ url: "/previous.png", label: "PREVIOUS_FRAME.png" }],
      storyboardRequiredCharacterSourcesForFrame: () => [], storyboardCharacterSourcesForNode: () => [], storyboardSceneReferenceSources: () => [],
      storyboardRequiredLocationSourcesForFrame: () => [], storyboardPropReferenceSources: () => [], storyboardRequiredPropSourcesForFrame: () => [],
      storyboardImagePromptItems: () => [{ url: "/identity.png", label: "Emma" }], storyboardImagePromptItemsForFrame: (base, previous) => [...base, ...previous],
      storyboardMissingRequiredCharacterTags: () => [], buildStoryboardFramePrompt: () => "Draw the planned frame with the reference character",
      storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png",
      reviewStoryboardGeneratedFrame: async () => ({ pass: ++reviews > 1, shouldRetry: reviews === 1 }), storyboardQcRetryPrompt: (prompt) => `${prompt}. Correct the eyeline.`,
      exportStoryboardFrameResult: async () => ({ url: "/export.png" }), updateStoryboardNodeFrames: (_id, frames, patch) => updateNode("board", { storyboardFrames: frames, ...patch }), loadOutputHistory: () => {}
    };
    const run = new Function(...Object.keys(deps), `${storyboardHandler}\nreturn generateStoryboardNode;`)(...Object.values(deps));
    assert.equal((await run(node)).status, "complete");
    assert.equal(generate.mock.callCount(), 2);
    for (const call of generate.mock.calls) {
      const body = call.arguments[0];
      assert.equal(body.model, creativeImageDefaultModel);
      assert.equal(body.quality, "high");
      assert.equal(body.resolution, "1K");
      assert.equal(body.aspectRatio, provider !== "krea" ? "16:9" : "3:2");
      assert.deepEqual(body.imagePromptUrls, ["/identity.png", "/previous.png"]);
    }
    assert.equal(node.data.storyboardFrames[0].qcRetryCount, 1);
  });
}

test("unsupported Krea Character Sunburst never makes a paid base or wardrobe request", async (t) => {
  const generate = t.mock.method(nodeApi, "generateImage", async () => assert.fail("Paid request must not run"));
  const request = { node: { id: "character", type: "character", data: { characterSheetModel: creativeImageDefaultModel } }, provider: "krea", portrait: { url: "/portrait.png" }, baseSheet: { url: "/base.png" }, wardrobe: { url: "/outfit.png" }, editMaskDataUrl: "data:image/png;base64,AA==" };
  await assert.rejects(runCharacterSheetGeneration(request), /require Fal/);
  await assert.rejects(runCharacterWardrobeEdit(request), /require Fal/);
  assert.equal(generate.mock.callCount(), 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nodeApi } from "../src/api/newtApi.js";
import * as workflow from "../src/characterSheetWorkflow.js";
import * as library from "../src/characterSheetLibrary.js";
import { characterVideoSheetPrompt } from "../src/characterVideoSheets.js";
import { runCharacterSheetGeneration, runCharacterWardrobeEdit } from "../src/nodeRunners/mediaModels.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const handlers = source.slice(
  source.indexOf("  async function generateCharacterWardrobeVariant("),
  source.indexOf("  function unlockCharacterNode(")
);
const helperNames = [
  "activeCharacterWardrobe", "characterWardrobeVariantId", "characterPhysicalDetailsPrompt",
  "characterSheetVariantForWardrobeId", "characterVariantDisplayPatch"
];
const helpers = helperNames.map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}).join("\n");

function existingCharacter({ legacyCu = false } = {}) {
  const data = {
    title: "Character", characterName: "Emma", status: "ready",
    characterPortrait: { localUrl: "/uploads/portrait.png", thumbnailUrl: "/thumb.jpg" },
    characterSheetModel: "Nano Banana 2",
    characterPhysicalDetails: "Freckles",
    cinematicCharacterSheet: false, cuVideoGeneration: true,
    activeWardrobeId: "blue",
    characterWardrobes: ["blue", "red"].map((id) => ({ id, localUrl: `/uploads/${id}.png` })),
    characterCustomSheets: [{ id: "client", localUrl: "/uploads/custom.png" }],
    characterBaseSheet: { url: "/outputs/base.png" },
    characterBaseVideoSheet: { url: "/outputs/cu-base.png" }
  };
  data.characterBaseSignature = workflow.characterBaseGenerationSignature(data);
  data.characterBaseVideoSignature = legacyCu
    ? JSON.stringify({ version: 3, baseSignature: data.characterBaseSignature, baseUrl: data.characterBaseSheet.url })
    : workflow.characterBaseVideoGenerationSignature(data);
  data.characterSheetVariants = [
    workflow.characterBaseVariant({
      baseSheet: data.characterBaseSheet, baseVideoSheet: data.characterBaseVideoSheet,
      baseSignature: data.characterBaseSignature
    }),
    ...data.characterWardrobes.map((wardrobe) => ({
      wardrobeId: wardrobe.id, wardrobeUrl: wardrobe.localUrl,
      baseSignature: data.characterBaseSignature, baseVideoSignature: data.characterBaseVideoSignature,
      generated: { url: `/outputs/${wardrobe.id}.png` },
      videoGenerated: { url: `/outputs/${wardrobe.id}-cu.png` }
    }))
  ];
  return data;
}

function editor(t, data, { failAt = 0, error = "Provider rejected the request." } = {}) {
  let node = { id: "character", type: "character", data: structuredClone(data) };
  const nodesRef = { current: [node] };
  const progress = [];
  const generate = t.mock.method(nodeApi, "generateImage", async () => {
    const call = generate.mock.callCount() + 1;
    return call === failAt
      ? { response: { ok: false }, data: { error } }
      : { response: { ok: true }, data: { image: { localUrl: `/outputs/new-${call}.png` } } };
  });
  const deps = {
    generationProvider: "fal",
    ...workflow, ...library, characterVideoSheetPrompt,
    runCharacterSheetGeneration, runCharacterWardrobeEdit, nodesRef,
    characterSheetPrompt: "Regular base", cinematicCharacterSheetPrompt: "Cinematic regular base",
    characterVoicePrompt: "", characterTraitPrompt: () => "", activeCharacterVoice: () => null,
    characterTag: () => "Emma", workflowRequestContext: () => ({}), pushUndoSnapshot: () => {},
    createCharacterWardrobeEditMaskDataUrl: async () => "data:image/png;base64,dGVzdA==",
    updateNode: (_id, patch) => {
      if (patch.characterBatchProgress) progress.push(patch.characterBatchProgress);
      node = { ...node, data: { ...node.data, ...patch } };
      Object.assign(node.data, library.characterOutputState(node.data));
      nodesRef.current = [node];
    }
  };
  const api = new Function(...Object.keys(deps), `${helpers}\n${handlers}
    return { activateCharacterNode, regenerateCharacterWardrobe, autoGenerateCharacterWardrobes };`
  )(...Object.values(deps));
  return {
    activate: (options) => api.activateCharacterNode(node, options),
    regenerateWardrobe: (id) => api.regenerateCharacterWardrobe(node.id, id),
    addWardrobes: (wardrobes) => api.autoGenerateCharacterWardrobes(node.id, wardrobes),
    data: () => node.data, progress,
    requests: () => generate.mock.calls.map((call) => call.arguments[0])
  };
}

test("real Character lock upgrades legacy CU masters and wardrobes without regenerating regular sheets", async (t) => {
  const before = existingCharacter({ legacyCu: true });
  const app = editor(t, before);
  await app.activate();
  assert.equal(app.data().error, "");
  assert.equal(app.data().locked, true);
  assert.equal(app.data().characterBaseSheet.url, before.characterBaseSheet.url);
  assert.deepEqual(app.data().characterCustomSheets, before.characterCustomSheets);
  const requests = app.requests();
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].imagePromptUrls, ["/uploads/portrait.png"]);
  assert.match(requests[0].prompt, /Defining physical details requirement: Freckles/);
  assert.doesNotMatch(requests[0].prompt, /Base Identity Character Sheet/);
  assert.deepEqual(requests.slice(1).map((request) => request.imagePromptUrls), [
    ["/outputs/new-1.png", "/uploads/blue.png"],
    ["/outputs/new-1.png", "/uploads/red.png"]
  ]);
  assert.deepEqual(app.data().characterSheetVariants.slice(1).map((variant) => variant.generated.url), [
    "/outputs/blue.png", "/outputs/red.png"
  ]);
  assert.deepEqual(app.progress.at(-1), { completed: 3, total: 3 });
  await app.activate();
  assert.equal(app.requests().length, 3, "A second lock must reuse the newly saved CU results");
});

test("real Character lock regenerates only regular sheets when its Cinematic setting changes", async (t) => {
  const before = existingCharacter();
  const app = editor(t, { ...before, cinematicCharacterSheet: true });
  await app.activate();
  assert.equal(app.data().error, "");
  assert.equal(app.requests().length, 3);
  assert.equal(app.requests().every((request) => !request.nodeTitle.includes("CU Video")), true);
  assert.deepEqual(app.data().characterBaseVideoSheet, before.characterBaseVideoSheet);
  assert.deepEqual(app.data().characterSheetVariants.map((variant) => variant.videoGenerated.url),
    before.characterSheetVariants.map((variant) => variant.videoGenerated.url));
  assert.deepEqual(app.progress.at(-1), { completed: 3, total: 3 });
});

test("real Regenerate Base rebuilds both masters from the portrait and all wardrobes", async (t) => {
  const app = editor(t, existingCharacter());
  await app.activate({ forceRegenerateBase: true });
  assert.equal(app.data().error, "");
  const requests = app.requests();
  assert.equal(requests.length, 6);
  assert.deepEqual(requests.slice(0, 2).map((request) => request.imagePromptUrls), [
    ["/uploads/portrait.png"], ["/uploads/portrait.png"]
  ]);
  assert.deepEqual(requests.slice(2).map((request) => request.imagePromptUrls), [
    ["/outputs/new-1.png", "/uploads/blue.png"],
    ["/outputs/new-2.png", "/uploads/blue.png"],
    ["/outputs/new-1.png", "/uploads/red.png"],
    ["/outputs/new-2.png", "/uploads/red.png"]
  ]);
  assert.deepEqual(app.progress.at(-1), { completed: 6, total: 6 });
});

test("real wardrobe retry edits only its corresponding saved masters, including legacy CU masters", async (t) => {
  const before = existingCharacter({ legacyCu: true });
  const app = editor(t, before);
  await app.regenerateWardrobe("blue");
  assert.equal(app.data().error, "");
  assert.deepEqual(app.requests().map((request) => request.imagePromptUrls), [
    ["/outputs/base.png", "/uploads/blue.png"],
    ["/outputs/cu-base.png", "/uploads/blue.png"]
  ]);
  assert.deepEqual(app.data().characterBaseSheet, before.characterBaseSheet);
  assert.deepEqual(app.data().characterBaseVideoSheet, before.characterBaseVideoSheet);
  const variant = app.data().characterSheetVariants.find((item) => item.wardrobeId === "blue");
  assert.equal(variant.baseVideoSignature, before.characterBaseVideoSignature);
});

test("real Character lock preserves an explicitly selected custom sheet without any paid generation", async (t) => {
  const app = editor(t, {
    ...existingCharacter({ legacyCu: true }), activeCharacterSheetId: "custom:client"
  });
  await app.activate();
  assert.equal(app.data().error, "");
  assert.equal(app.data().locked, true);
  assert.equal(app.data().resultUrl, "/uploads/custom.png");
  assert.equal(app.requests().length, 0);
});

test("real automatic wardrobe addition reuses both independent bases and existing outfits", async (t) => {
  const before = existingCharacter();
  const app = editor(t, before);
  await app.addWardrobes([{ id: "green", localUrl: "/uploads/green.png" }]);
  assert.equal(app.data().error, "");
  assert.deepEqual(app.requests().map((request) => request.imagePromptUrls), [
    ["/outputs/base.png", "/uploads/green.png"],
    ["/outputs/cu-base.png", "/uploads/green.png"]
  ]);
  assert.deepEqual(app.data().characterSheetVariants.slice(0, 3), before.characterSheetVariants);
  assert.equal(app.data().characterSheetVariants[3].wardrobeId, "green");
  assert.deepEqual(app.progress.at(-1), { completed: 2, total: 2 });
});

for (const failAt of [1, 2]) {
  test(`Character lock stops at rejected base stage ${failAt} and preserves saved work`, async (t) => {
    const before = existingCharacter();
    const error = "prompt: The content could not be processed because it contained material flagged by a content checker.";
    const app = editor(t, before, { failAt, error });
    await app.activate({ forceRegenerateBase: true });
    assert.equal(app.requests().length, failAt, "No retry or subsequent wardrobe generation");
    assert.equal(app.data().status, "error");
    assert.equal(app.data().characterBatchProgress, null);
    assert.equal(app.data().error, `${failAt === 1 ? "Character sheet" : "CU video base sheet"}: ${error}`);
    assert.deepEqual(app.data().characterCustomSheets, before.characterCustomSheets);
    assert.equal(app.data().characterBaseSheet.url, failAt === 1 ? before.characterBaseSheet.url : "/outputs/new-1.png");
  });
}

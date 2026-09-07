import test from "node:test";
import assert from "node:assert/strict";

import { nodeApi } from "../src/api/newtApi.js";
import { characterSheetModelOptions } from "../src/characterSheetModels.js";
import {
  characterVideoWardrobeEditPrompt,
  characterVideoIdentityContinuityPrompt,
  characterVideoNeutralBaseWardrobePrompt,
  characterWardrobeEditPrompt,
  generateCharacterBaseSheets
} from "../src/characterSheetWorkflow.js";
import { characterVideoSheetPrompt } from "../src/characterVideoSheets.js";
import { runCharacterSheetGeneration, runCharacterWardrobeEdit } from "../src/nodeRunners/mediaModels.js";

function editOptions(model, sheetKind = "video") {
  return {
    node: { id: "character-1", data: { title: "Character", characterSheetModel: model } },
    prompt: sheetKind === "video" ? characterVideoWardrobeEditPrompt : characterWardrobeEditPrompt,
    baseSheet: { localUrl: "/outputs/cu-base.png", url: "https://provider.example/cu-base.png", thumbnailUrl: "/thumbnails/cu-base.jpg" },
    wardrobe: { localUrl: "/uploads/outfit.png", thumbnailUrl: "/thumbnails/outfit.jpg" },
    editMaskDataUrl: "data:image/png;base64,dGVzdA==",
    workflowContext: { projectId: "project-1", workflowPackagePath: "/projects/production" },
    characterTag: "Character",
    sheetKind
  };
}

function successfulResponse() {
  return {
    response: { ok: true },
    data: { image: { localUrl: "/outputs/dressed-cu.png", thumbnailUrl: "/thumbnails/dressed-cu.jpg", fileName: "dressed-cu.png" }, cost: { total: 0.2 } }
  };
}

for (const model of characterSheetModelOptions) {
  test(`${model} CU base generation sends only the original full-resolution portrait`, async (t) => {
    const generate = t.mock.method(nodeApi, "generateImage", async () => successfulResponse());
    const prompt = [
      characterVideoSheetPrompt,
      characterVideoNeutralBaseWardrobePrompt,
      characterVideoIdentityContinuityPrompt
    ].join("\n\n");
    const result = await runCharacterSheetGeneration({
      ...editOptions(model),
      prompt,
      portrait: {
        localUrl: "/uploads/original-portrait.png",
        url: "https://provider.example/portrait.png",
        thumbnailUrl: "/thumbnails/portrait.jpg"
      },
      baseSheet: { localUrl: "/outputs/regular-base.png" },
      additionalReferences: [{ url: "/outputs/dressed-sheet.png" }]
    });
    const request = generate.mock.calls[0].arguments[0];
    assert.equal(generate.mock.callCount(), 1);
    assert.deepEqual(request.imagePromptUrls, ["/uploads/original-portrait.png"]);
    assert.equal(request.imagePromptLabels.length, 1);
    assert.match(request.imagePromptLabels[0], /Original Character Portrait; sole identity reference/);
    assert.equal(request.prompt, prompt);
    assert.doesNotMatch(request.prompt, /Base Identity Character Sheet|layout conversion|supporting identity check/);
    assert.equal(request.model, model);
    assert.equal(request.resolution, "4K");
    assert.equal(request.aspectRatio, "16:9");
    assert.equal(request.workflowPackagePath, "/projects/production");
    assert.equal(request.nodeId, "character-1");
    if (model === "OpenAI Image 2") assert.equal(request.quality, "high");
    assert.equal(result.url, "/outputs/dressed-cu.png");
  });

  test(`${model} CU wardrobe edits send only the full-resolution CU base and selected outfit`, async (t) => {
    const generate = t.mock.method(nodeApi, "generateImage", async () => successfulResponse());
    const options = editOptions(model);
    const result = await runCharacterWardrobeEdit({
      ...options,
      consistencySheet: { localUrl: "/outputs/dressed-regular-sheet.png" },
      portrait: { localUrl: "/uploads/original-portrait.png" }
    });
    const request = generate.mock.calls[0].arguments[0];
    assert.equal(generate.mock.callCount(), 1);
    assert.deepEqual(request.imagePromptUrls, ["/outputs/cu-base.png", "/uploads/outfit.png"]);
    assert.equal(request.imagePromptLabels.length, 2);
    assert.match(request.imagePromptLabels[0], /Locked Base Identity CU Video Sheet/);
    assert.match(request.imagePromptLabels[1], /clothing only/);
    assert.equal(request.prompt, characterVideoWardrobeEditPrompt);
    assert.equal(request.model, model);
    assert.equal(request.resolution, "4K");
    assert.equal(request.aspectRatio, "16:9");
    assert.equal(request.editMaskDataUrl, options.editMaskDataUrl);
    assert.equal(request.workflowPackagePath, "/projects/production");
    assert.equal(request.nodeId, "character-1");
    assert.equal(result.url, "/outputs/dressed-cu.png");
    assert.equal(result.thumbnailUrl, "/thumbnails/dressed-cu.jpg");
    assert.deepEqual(result.cost, { total: 0.2 });
    assert.equal(options.baseSheet.localUrl, "/outputs/cu-base.png");
  });
}

test("CU generation without an original portrait fails before a paid request", async (t) => {
  const generate = t.mock.method(nodeApi, "generateImage", () => assert.fail("No generation should be submitted"));
  await assert.rejects(runCharacterSheetGeneration({
    ...editOptions(characterSheetModelOptions[0]),
    portrait: null,
    baseSheet: { url: "/outputs/regular-base.png" }
  }), /requires an identity reference/);
  assert.equal(generate.mock.callCount(), 0);
});

test("regular base generation still uses the portrait without changing quality settings", async (t) => {
  const generate = t.mock.method(nodeApi, "generateImage", async () => successfulResponse());
  await runCharacterSheetGeneration({
    ...editOptions(characterSheetModelOptions[0], "image"),
    prompt: "Regular base prompt",
    portrait: { localUrl: "/uploads/portrait.png" },
    wardrobe: null
  });
  const request = generate.mock.calls[0].arguments[0];
  assert.deepEqual(request.imagePromptUrls, ["/uploads/portrait.png"]);
  assert.equal(request.imagePromptLabels[0], "The Character portrait reference");
  assert.equal(request.prompt, "Regular base prompt");
  assert.equal(request.resolution, "4K");
});

test("regular wardrobe edits retain their existing two-reference workflow", async (t) => {
  const generate = t.mock.method(nodeApi, "generateImage", async () => successfulResponse());
  const options = editOptions(characterSheetModelOptions[0], "image");
  options.baseSheet = { url: "/outputs/regular-base.png" };
  await runCharacterWardrobeEdit(options);
  const request = generate.mock.calls[0].arguments[0];
  assert.deepEqual(request.imagePromptUrls, ["/outputs/regular-base.png", "/uploads/outfit.png"]);
  assert.equal(request.prompt, characterWardrobeEditPrompt);
  assert.equal(request.imagePromptLabels[0], "Locked Base Identity Character Sheet");
});

test("multiple CU wardrobe edits reuse the saved CU base without regenerating either base", async (t) => {
  const regularBase = { url: "/outputs/regular-base.png" };
  const cuBase = { localUrl: "/outputs/cu-base.png" };
  const generateBase = t.mock.fn(async () => { throw new Error("Unexpected base generation"); });
  const generate = t.mock.method(nodeApi, "generateImage", async () => successfulResponse());
  for (const outfit of ["blue", "red"]) {
    const bases = await generateCharacterBaseSheets({
      baseSheet: regularBase,
      baseVideoSheet: cuBase,
      includeVideo: true,
      generateBase,
      generateVideo: generateBase,
      onCheckpoint: () => assert.fail("Existing bases should not be replaced")
    });
    await runCharacterWardrobeEdit({
      ...editOptions(characterSheetModelOptions[0]),
      baseSheet: bases.baseVideoSheet,
      wardrobe: { localUrl: `/uploads/${outfit}.png` }
    });
  }
  assert.equal(generateBase.mock.callCount(), 0);
  assert.deepEqual(generate.mock.calls.map((call) => call.arguments[0].imagePromptUrls), [
    ["/outputs/cu-base.png", "/uploads/blue.png"],
    ["/outputs/cu-base.png", "/uploads/red.png"]
  ]);
});

test("wardrobe edit failures surface without replacing the saved base", async (t) => {
  const options = editOptions(characterSheetModelOptions[0]);
  const originalBase = { ...options.baseSheet };
  t.mock.method(nodeApi, "generateImage", async () => ({ response: { ok: false }, data: { error: "Provider unavailable" } }));
  await assert.rejects(runCharacterWardrobeEdit(options), /Provider unavailable/);
  assert.deepEqual(options.baseSheet, originalBase);
});

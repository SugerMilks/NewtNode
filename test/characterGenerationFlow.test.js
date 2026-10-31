import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nodeApi } from "../src/api/newtApi.js";
import * as workflow from "../src/characterSheetWorkflow.js";
import * as library from "../src/characterSheetLibrary.js";
import { characterVideoSheetPrompt } from "../src/characterVideoSheets.js";
import * as nonHumanPrompts from "../src/characterNonHuman.js";
import * as autoWardrobe from "../src/characterAutoWardrobe.js";
import { runCharacterSheetGeneration, runCharacterWardrobeEdit } from "../src/nodeRunners/mediaModels.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const sheetPrompts = new Function(`${source.slice(
  source.indexOf("const characterSheetPrompt ="),
  source.indexOf("const characterVoicePrompt =")
)}\nreturn { characterSheetPrompt, cinematicCharacterSheetPrompt };`)();
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

function existingCharacter({ legacyCu = false, cinematic = false, nonHuman = false } = {}) {
  const data = {
    title: "Character", characterName: "Emma", status: "ready",
    characterPortrait: { localUrl: "/uploads/portrait.png", thumbnailUrl: "/thumb.jpg" },
    characterSheetModel: "Nano Banana Pro",
    characterPhysicalDetails: "Freckles",
    cinematicCharacterSheet: cinematic, cuVideoGeneration: true,
    ...(nonHuman ? { nonHumanCharacter: true } : {}),
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
    ...workflow, ...library, ...nonHumanPrompts, ...autoWardrobe, characterVideoSheetPrompt,
    runCharacterSheetGeneration, runCharacterWardrobeEdit, nodesRef,
    ...sheetPrompts,
    characterVoicePrompt: "", characterTraitPrompt: () => "", activeCharacterVoice: () => null,
    characterTag: () => "Emma", workflowRequestContext: () => ({}), pushUndoSnapshot: () => {},
    createCharacterWardrobeEditMaskDataUrl: () => assert.fail("Character must not create static masks"),
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
  assert.match(app.requests()[0].prompt, /target sRGB color is RGB\(125, 125, 125\), HEX #7D7D7D/);
  assert.match(app.requests()[0].prompt, /uniform across all six panels/);
  assert.match(app.requests()[0].prompt, /no gradients, vignettes, texture, or color casts/);
  assert.match(app.requests()[0].prompt, /Keep the white spacing between panels white/);
  assert.equal(app.requests().every((request) => !request.nodeTitle.includes("CU Video")), true);
  assert.deepEqual(app.data().characterBaseVideoSheet, before.characterBaseVideoSheet);
  assert.deepEqual(app.data().characterSheetVariants.map((variant) => variant.videoGenerated.url),
    before.characterSheetVariants.map((variant) => variant.videoGenerated.url));
  assert.deepEqual(app.progress.at(-1), { completed: 3, total: 3 });
});

test("the cinematic background update preserves saved sheets until explicit base regeneration", async (t) => {
  const before = existingCharacter({ cinematic: true });
  const app = editor(t, before);
  await app.activate();
  assert.equal(app.requests().length, 0);
  assert.deepEqual(app.data().characterBaseSheet, before.characterBaseSheet);
  assert.deepEqual(app.data().characterBaseVideoSheet, before.characterBaseVideoSheet);
  assert.deepEqual(app.data().characterSheetVariants, before.characterSheetVariants);

  await app.activate({ forceRegenerateBase: true });
  assert.equal(app.data().error, "");
  assert.equal(app.requests().length, 6);
  assert.match(app.requests()[0].prompt, /RGB\(125, 125, 125\), HEX #7D7D7D/);
  assert.doesNotMatch(app.requests()[1].prompt, /#7D7D7D|RGB\(125, 125, 125\)/);
});

test("real Regenerate Base rebuilds both masters from the portrait and all wardrobes", async (t) => {
  const app = editor(t, existingCharacter());
  await app.activate({ forceRegenerateBase: true });
  assert.equal(app.data().error, "");
  const requests = app.requests();
  assert.equal(requests.length, 6);
  assert.match(requests[0].prompt, /clean white background/);
  assert.doesNotMatch(requests[0].prompt, /#7D7D7D|RGB\(125, 125, 125\)/);
  assert.deepEqual(requests.slice(0, 2).map((request) => request.imagePromptUrls), [
    ["/uploads/portrait.png"], ["/uploads/portrait.png"]
  ]);
  for (const request of requests.slice(0, 2)) {
    assert.match(request.prompt, /men's tight swim trunks with a matching opaque, form-fitting tank top/);
    assert.match(request.prompt, /fully covers the chest, abdomen, and back/);
    assert.match(request.prompt, /For a female character, use a one-piece swimsuit/);
    assert.doesNotMatch(request.prompt, /no top|shirtless|bare.chest/i);
  }
  assert.deepEqual(requests.slice(2).map((request) => request.imagePromptUrls), [
    ["/outputs/new-1.png", "/uploads/blue.png"],
    ["/outputs/new-2.png", "/uploads/blue.png"],
    ["/outputs/new-1.png", "/uploads/red.png"],
    ["/outputs/new-2.png", "/uploads/red.png"]
  ]);
  assert.deepEqual(app.progress.at(-1), { completed: 6, total: 6 });
});

test("the tank-top prompt change does not regenerate completed bases or wardrobes on lock", async (t) => {
  const before = existingCharacter();
  before.characterBaseSignature = JSON.stringify({ ...JSON.parse(before.characterBaseSignature), version: 2 });
  before.characterBaseVideoSignature = JSON.stringify({ ...JSON.parse(before.characterBaseVideoSignature), version: 5 });
  const app = editor(t, before);
  await app.activate();
  assert.equal(app.requests().length, 0);
  assert.deepEqual(app.data().characterBaseSheet, before.characterBaseSheet);
  assert.deepEqual(app.data().characterBaseVideoSheet, before.characterBaseVideoSheet);
  assert.deepEqual(app.data().characterSheetVariants, before.characterSheetVariants);
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

for (const cinematic of [false, true]) {
  test(`Non-Human replaces human base, CU and wardrobe prompts with Cinematic ${cinematic}`, async (t) => {
    const before = existingCharacter({ cinematic });
    const app = editor(t, { ...before, nonHumanCharacter: true, characterPhysicalDetails: "Four eyes and a feathered tail" });
    assert.equal(app.requests().length, 0, "changing an option alone must not generate");
    assert.deepEqual(app.data().characterSheetVariants, before.characterSheetVariants);
    await app.activate();
    assert.equal(app.data().error, "");
    const requests = app.requests();
    assert.equal(requests.length, 6);
    for (const request of requests) {
      assert.match(request.prompt, /Do not humanize the character/);
      assert.doesNotMatch(request.prompt, /person's identity|natural skin texture and natural skin tones|men's tight swim trunks|For a female character|underlying hair and skin/);
    }
    assert.match(requests[0].prompt, /exactly six panels/);
    assert.match(requests[1].prompt, /exactly three panels/);
    for (const request of requests.slice(0, 2)) {
      assert.deepEqual(request.imagePromptUrls, ["/uploads/portrait.png"]);
      assert.match(request.prompt, /Defining physical details requirement: Four eyes and a feathered tail/);
      assert.match(request.prompt, /do not force swimwear/);
    }
    assert.match(requests[0].prompt, cinematic ? /RGB\(125, 125, 125\), HEX #7D7D7D/ : /clean white background/);
    assert.deepEqual(requests.slice(2).map(request => request.imagePromptUrls), [
      ["/outputs/new-1.png", "/uploads/blue.png"], ["/outputs/new-2.png", "/uploads/blue.png"],
      ["/outputs/new-1.png", "/uploads/red.png"], ["/outputs/new-2.png", "/uploads/red.png"]
    ]);
    for (const request of requests.slice(2)) {
      assert.equal(request.characterWardrobeEdit, true);
      assert.match(request.prompt, /Adapt the referenced garments to the existing body/);
    }
    assert.deepEqual(app.data().characterCustomSheets, before.characterCustomSheets);
    await app.activate();
    assert.equal(app.requests().length, 6, "completed non-human sheets are reusable");
  });
}

test("Non-Human wardrobe retries and new outfits reuse the saved non-human masters", async (t) => {
  const before = existingCharacter({ nonHuman: true });
  const app = editor(t, before);
  await app.regenerateWardrobe("blue");
  await app.addWardrobes([{ id: "green", localUrl: "/uploads/green.png" }]);
  assert.equal(app.data().error, "");
  assert.equal(app.requests().length, 4);
  for (const request of app.requests()) {
    assert.match(request.prompt, /Do not humanize the character/);
    assert.match(request.prompt, /Omit an anatomically incompatible item/);
    assert.equal(request.characterWardrobeEdit, true);
    assert.ok(["/outputs/base.png", "/outputs/cu-base.png"].includes(request.imagePromptUrls[0]));
  }
  assert.deepEqual(app.data().characterBaseSheet, before.characterBaseSheet);
  assert.deepEqual(app.data().characterBaseVideoSheet, before.characterBaseVideoSheet);
});

test("disabling Non-Human restores human prompts on the next explicit build", async (t) => {
  const app = editor(t, { ...existingCharacter({ nonHuman: true }), nonHumanCharacter: false });
  await app.activate();
  assert.equal(app.data().error, "");
  assert.equal(app.requests().length, 6);
  assert.match(app.requests()[0].prompt, /men's tight swim trunks/);
  assert.match(app.requests()[1].prompt, /natural skin texture and natural skin tones/);
  assert.doesNotMatch(app.requests()[0].prompt, /Do not humanize the character/);
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

function autoWardrobeCharacter({ fresh = false, nonHuman = false, cu = true } = {}) {
  const data = { ...existingCharacter({ nonHuman }), autoWardrobe: true, cuVideoGeneration: cu,
    characterWardrobes: [], characterCustomSheets: [], activeWardrobeId: "" };
  data.characterSheetVariants = data.characterSheetVariants.slice(0, 1);
  if (fresh) {
    data.characterBaseSheet = null;
    data.characterBaseVideoSheet = null;
    data.characterBaseSignature = "";
    data.characterBaseVideoSignature = "";
    data.characterSheetVariants = [];
  }
  return data;
}

for (const nonHuman of [false, true]) {
  test(`Auto Wardrobe completes a portrait outfit and reuses it for CU (non-human=${nonHuman})`, async (t) => {
    const before = autoWardrobeCharacter({ nonHuman });
    const app = editor(t, before);
    await app.activate();
    assert.equal(app.data().error, "");
    assert.deepEqual(app.requests().map(request => request.imagePromptUrls), [
      ["/outputs/base.png", "/uploads/portrait.png"],
      ["/outputs/cu-base.png", "/outputs/new-1.png"]
    ]);
    assert.match(app.requests()[0].prompt, /otherwise infer footwear/);
    assert.match(app.requests()[0].imagePromptLabels[1], /Original portrait/);
    assert.match(app.requests()[1].imagePromptLabels[1], /Completed Auto Wardrobe/);
    assert.match(app.requests()[1].prompt, /Do not invent another outfit/);
    assert.equal(app.requests().every(request => request.characterWardrobeEdit === true), true);
    if (nonHuman) assert.match(app.requests()[0].prompt, /never invent human feet/);
    assert.deepEqual(app.data().characterBaseSheet, before.characterBaseSheet);
    assert.deepEqual(app.data().characterWardrobes, []);
    assert.equal(app.data().activeWardrobeId, autoWardrobe.characterAutoWardrobeId);
    assert.equal(app.data().resultUrl, "/outputs/new-1.png");
    assert.equal(library.characterOutputReference(app.data(), { video: true }).url, "/outputs/new-2.png");
    assert.deepEqual(library.characterSheetChoices(app.data()).map(choice => choice.tabLabel), ["Base", "Sheet 1"]);
    assert.deepEqual(app.progress.at(-1), { completed: 2, total: 2 });
    await app.activate();
    assert.equal(app.requests().length, 2, "completed outfits must not regenerate on a second lock");
  });
}

test("a fresh Auto Wardrobe character creates independent bases before applying its outfit", async (t) => {
  const app = editor(t, autoWardrobeCharacter({ fresh: true }));
  await app.activate();
  assert.equal(app.data().error, "");
  assert.deepEqual(app.requests().map(request => request.imagePromptUrls), [
    ["/uploads/portrait.png"], ["/uploads/portrait.png"],
    ["/outputs/new-1.png", "/uploads/portrait.png"],
    ["/outputs/new-2.png", "/outputs/new-3.png"]
  ]);
  assert.match(app.requests()[0].prompt, /Foundation wardrobe rule/);
  assert.deepEqual(app.progress.at(-1), { completed: 4, total: 4 });
});

test("Auto Wardrobe coexists with uploaded outfits and retains an explicit outfit selection", async (t) => {
  const before = { ...existingCharacter(), autoWardrobe: true };
  const app = editor(t, before);
  await app.activate();
  assert.equal(app.requests().length, 2);
  assert.deepEqual(app.data().characterSheetVariants.slice(2), before.characterSheetVariants.slice(1));
  assert.equal(app.data().activeWardrobeId, "blue");
  assert.equal(app.data().resultUrl, "/outputs/blue.png");
});

test("a failed Auto Wardrobe CU preserves the finished outfit and retries only the missing CU on lock", async (t) => {
  const app = editor(t, autoWardrobeCharacter(), { failAt: 2 });
  await app.activate();
  assert.equal(app.requests().length, 2);
  assert.equal(app.data().resultUrl, "/outputs/new-1.png");
  assert.match(app.data().characterVariantNotice, /1 CU video wardrobe sheet/);
  assert.equal(library.characterOutputReference(app.data(), { video: true }).url, "/outputs/new-1.png");
  await app.activate();
  assert.equal(app.requests().length, 3);
  assert.deepEqual(app.requests()[2].imagePromptUrls, ["/outputs/cu-base.png", "/outputs/new-1.png"]);
  assert.equal(app.data().characterVariantNotice, "");
  assert.equal(app.data().characterSheetVariants[1].autoWardrobeImageUrl, "/outputs/new-1.png");
});

test("failed Auto Wardrobe generation never sends a base as downstream output or silently retries", async (t) => {
  const app = editor(t, autoWardrobeCharacter(), { failAt: 1 });
  await app.activate();
  assert.equal(app.requests().length, 1);
  assert.equal(app.data().resultUrl, "");
  assert.equal(library.characterOutputReference(app.data()), null);
  assert.match(app.data().characterVariantNotice, /1 wardrobe sheet/);
});

test("changing regular cinematic treatment also refreshes the auto CU outfit without rebuilding its master", async (t) => {
  const app = editor(t, autoWardrobeCharacter());
  await app.activate();
  // Model an explicit build after changing the regular sheet's rendering.
  app.data().cinematicCharacterSheet = true;
  await app.activate();
  assert.equal(app.requests().length, 5);
  assert.deepEqual(app.requests().slice(2).map(request => request.imagePromptUrls), [
    ["/uploads/portrait.png"], ["/outputs/new-3.png", "/uploads/portrait.png"],
    ["/outputs/cu-base.png", "/outputs/new-4.png"]
  ]);
  assert.equal(app.data().characterBaseVideoSheet.url, "/outputs/cu-base.png");
  assert.deepEqual(app.progress.at(-1), { completed: 3, total: 3 });
});

test("Auto Wardrobe regeneration reuses both masters and keeps matching regular/CU outfits", async (t) => {
  const app = editor(t, autoWardrobeCharacter());
  await app.regenerateWardrobe(autoWardrobe.characterAutoWardrobeId);
  assert.deepEqual(app.requests().map(request => request.imagePromptUrls), [
    ["/outputs/base.png", "/uploads/portrait.png"], ["/outputs/cu-base.png", "/outputs/new-1.png"]
  ]);
  assert.equal(app.data().characterSheetVariants[1].autoWardrobeImageUrl, "/outputs/new-1.png");
});

test("turning Auto Wardrobe off retains uploads and stops requesting the portrait outfit", async (t) => {
  const before = { ...existingCharacter(), autoWardrobe: true };
  const app = editor(t, before);
  await app.activate();
  app.data().autoWardrobe = false;
  await app.activate();
  assert.equal(app.requests().length, 2);
  assert.deepEqual(app.data().characterSheetVariants, before.characterSheetVariants);
});

test("Auto Wardrobe without CU needs only one outfit generation", async (t) => {
  const app = editor(t, autoWardrobeCharacter({ cu: false }));
  await app.activate();
  assert.equal(app.requests().length, 1);
  assert.equal(app.data().characterSheetVariants[1].videoGenerated, undefined);
  assert.deepEqual(app.progress.at(-1), { completed: 1, total: 1 });
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

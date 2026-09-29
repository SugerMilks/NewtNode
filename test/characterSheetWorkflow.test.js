import test from "node:test";
import assert from "node:assert/strict";

import {
  characterBaseGenerationSignature,
  characterBaseVideoGenerationSignature,
  characterBaseVariant,
  characterNeutralBaseWardrobePrompt,
  characterVideoNeutralBaseWardrobePrompt,
  characterVideoWardrobeEditPrompt,
  characterWardrobeEditPrompt,
  characterWardrobeVariantIsCurrent,
  generateCharacterBaseSheets,
  upsertCharacterWardrobeVariant
} from "../src/characterSheetWorkflow.js";

test("the identity base uses a neutral reference garment instead of a designed wardrobe", () => {
  assert.match(characterNeutralBaseWardrobePrompt, /identity foundation/i);
  assert.match(characterNeutralBaseWardrobePrompt, /Do not add styling, branding, patterns/i);
  assert.match(characterNeutralBaseWardrobePrompt, /no nudity/i);
});

test("regular and CU foundations share men's swim trunks with a covered torso and women's one-piece instructions", () => {
  assert.equal(characterVideoNeutralBaseWardrobePrompt, characterNeutralBaseWardrobePrompt);
  assert.match(characterNeutralBaseWardrobePrompt, /For a male character, use men's tight swim trunks with a matching opaque, form-fitting tank top/);
  assert.match(characterNeutralBaseWardrobePrompt, /fully covers the chest, abdomen, and back/);
  assert.match(characterNeutralBaseWardrobePrompt, /Keep the same foundation clothing consistently across all views/);
  assert.doesNotMatch(characterNeutralBaseWardrobePrompt, /Speedo|swim briefs|no top|shirtless|bare.chest/i);
  assert.match(characterNeutralBaseWardrobePrompt, /For a female character, use a one-piece swimsuit/);
  assert.match(characterNeutralBaseWardrobePrompt, /plain matte charcoal swimwear/);
  assert.match(characterNeutralBaseWardrobePrompt, /do not reframe a close-up/);
  assert.doesNotMatch(characterNeutralBaseWardrobePrompt, /bodysuit/);
  for (const prompt of [characterWardrobeEditPrompt, characterVideoWardrobeEditPrompt]) {
    assert.match(prompt, /Replace the neutral foundation swimwear or existing reference garment/);
  }
});

test("wardrobe edits lock identity and composition to the base sheet", () => {
  assert.match(characterWardrobeEditPrompt, /locked master image/i);
  assert.match(characterWardrobeEditPrompt, /change only the character's clothing/i);
  assert.match(characterWardrobeEditPrompt, /sole authority for identity, anatomy, composition/i);
  assert.match(characterVideoWardrobeEditPrompt, /exact canvas dimensions, panel layout/i);
  assert.match(characterVideoWardrobeEditPrompt, /change only the character's clothing/i);
  assert.match(characterVideoWardrobeEditPrompt, /Keep the existing head crops unchanged/i);
  assert.match(characterVideoWardrobeEditPrompt, /sole authority for identity, anatomy, composition/i);
  assert.doesNotMatch(characterVideoWardrobeEditPrompt, /Matching Full Character Sheet|clavicles|approximately 15 degrees|Create one/i);
});

test("base signatures change only when identity-generation inputs change", () => {
  const data = {
    characterPortrait: { localUrl: "/uploads/person.png" },
    characterSheetModel: "Nano Banana 2",
    cinematicCharacterSheet: true,
    characterPhysicalDetails: "Scar above left eyebrow"
  };
  assert.equal(characterBaseGenerationSignature(data), characterBaseGenerationSignature({ ...data }));
  assert.notEqual(
    characterBaseGenerationSignature(data),
    characterBaseGenerationSignature({ ...data, cinematicCharacterSheet: false })
  );
  assert.notEqual(
    characterBaseGenerationSignature(data),
    characterBaseGenerationSignature({ ...data, characterPhysicalDetails: "No scar" })
  );
});

test("the swimwear update marks both older base prompt versions as stale", () => {
  const data = { characterPortrait: { localUrl: "/uploads/portrait.png" } };
  const regular = characterBaseGenerationSignature(data);
  const cu = characterBaseVideoGenerationSignature(data);
  assert.equal(JSON.parse(regular).version, 2);
  assert.equal(JSON.parse(cu).version, 5);
  assert.notEqual(regular, JSON.stringify({ ...JSON.parse(regular), version: 1 }));
  assert.notEqual(cu, JSON.stringify({ ...JSON.parse(cu), version: 4 }));
});

test("CU wardrobe variants track the CU base workflow signature", () => {
  const baseVideoSignature = characterBaseVideoGenerationSignature({ characterPortrait: { url: "/portrait.png" } });
  const wardrobe = { id: "blue", localUrl: "/uploads/blue.png" };
  const variant = {
    wardrobeId: "blue",
    wardrobeUrl: wardrobe.localUrl,
    baseSignature: "base-v1",
    baseVideoSignature,
    generated: { url: "/outputs/blue.png" },
    videoGenerated: { url: "/outputs/blue-video.png" }
  };
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "base-v1", { requireVideo: true, baseVideoSignature }), true);
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "base-v1", { requireVideo: true, baseVideoSignature: "stale" }), false);
});

test("the portrait-only CU update invalidates old CU sheets without invalidating regular wardrobe sheets", () => {
  const data = { characterPortrait: { url: "/portrait.png" } };
  const baseSignature = characterBaseGenerationSignature(data);
  const baseSheet = { url: "/outputs/base.png" };
  const oldVideoSignature = JSON.stringify({ version: 3, baseSignature, baseUrl: baseSheet.url });
  const newVideoSignature = characterBaseVideoGenerationSignature(data);
  const wardrobe = { id: "blue", url: "/wardrobe.png" };
  const variant = {
    wardrobeId: wardrobe.id,
    wardrobeUrl: wardrobe.url,
    baseSignature,
    baseVideoSignature: oldVideoSignature,
    generated: { url: "/outputs/regular.png" },
    videoGenerated: { url: "/outputs/old-cu.png" }
  };
  assert.notEqual(oldVideoSignature, newVideoSignature);
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, baseSignature), true);
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, baseSignature, {
    requireVideo: true, baseVideoSignature: newVideoSignature
  }), false);
});

test("wardrobe variants are reusable only for the same base and wardrobe asset", () => {
  const wardrobe = { id: "blue", localUrl: "/uploads/blue.png" };
  const variant = {
    wardrobeId: "blue",
    wardrobeUrl: "/uploads/blue.png",
    baseSignature: "base-v1",
    generated: { url: "/outputs/blue-sheet.png" },
    videoGenerated: { url: "/outputs/blue-video-sheet.png" }
  };
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "base-v1"), true);
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "base-v2"), false);
  assert.equal(characterWardrobeVariantIsCurrent({ ...variant, videoGenerated: null }, wardrobe, "base-v1", { requireVideo: true }), false);
});

test("locally restored wardrobe variants remain reusable", () => {
  const wardrobe = { id: "local", localUrl: "/uploads/local.png" };
  const variant = {
    wardrobeId: "local",
    wardrobeUrl: "/uploads/local.png",
    baseSignature: "base-v1",
    generated: { localUrl: "/outputs/local-sheet.png" },
    videoGenerated: { localUrl: "/outputs/local-video-sheet.png" }
  };
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "base-v1"), true);
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "base-v1", { requireVideo: true }), true);
});

test("the base variant remains first when a single wardrobe is retried", () => {
  const base = characterBaseVariant({
    baseSheet: { url: "/outputs/base.png" },
    baseSignature: "base-v1"
  });
  const red = { wardrobeId: "red", generated: { url: "/outputs/red.png" } };
  const blue = { wardrobeId: "blue", generated: { url: "/outputs/blue.png" } };
  const nextBlue = { wardrobeId: "blue", generated: { url: "/outputs/blue-retry.png" } };
  const variants = upsertCharacterWardrobeVariant([base, red, blue], nextBlue);
  assert.deepEqual(variants.map((variant) => variant.wardrobeId), ["__default-wardrobe__", "red", "blue"]);
  assert.equal(variants[2].generated.url, "/outputs/blue-retry.png");
});

test("a successful Character base survives CU failure and is reused on retry", async () => {
  const base = { url: "/outputs/base.png" };
  const video = { url: "/outputs/cu.png" };
  let saved = {};
  let baseCalls = 0;
  let completed = 0;
  const options = {
    baseSignature: "identity-v1",
    baseVideoSignature: "portrait-cu-v4",
    includeVideo: true,
    generateBase: async () => { baseCalls += 1; return base; },
    onCheckpoint: (patch) => { saved = patch; },
    onGenerationComplete: () => { completed += 1; }
  };
  await assert.rejects(generateCharacterBaseSheets({
    ...options,
    generateVideo: async () => { throw new Error("CU provider failed"); }
  }), /CU provider failed/);
  assert.equal(saved.characterBaseSheet, base);
  assert.equal(saved.characterBaseSignature, "identity-v1");
  assert.equal(saved.characterBaseVideoSheet, null);
  assert.equal(completed, 1);

  const result = await generateCharacterBaseSheets({
    ...options,
    baseSheet: saved.characterBaseSheet,
    generateVideo: async (...references) => { assert.deepEqual(references, []); return video; }
  });
  assert.equal(baseCalls, 1);
  assert.equal(completed, 2);
  assert.equal(saved.characterBaseVideoSheet, video);
  assert.equal(saved.characterBaseVideoSignature, result.baseVideoSignature);
  assert.equal(result.baseVideoSignature, "portrait-cu-v4");
});

test("CU signatures depend on portrait-generation inputs, not the regular sheet", () => {
  const data = {
    characterPortrait: { localUrl: "/uploads/portrait.png", thumbnailUrl: "/thumb.jpg" },
    characterSheetModel: "Nano Banana 2",
    characterPhysicalDetails: "Freckles",
    cinematicCharacterSheet: false,
    characterBaseSheet: { url: "/outputs/base.png" }
  };
  const signature = characterBaseVideoGenerationSignature(data);
  const parsed = JSON.parse(signature);
  assert.equal(parsed.version, 5);
  assert.equal(parsed.portraitUrl, "/uploads/portrait.png");
  assert.equal("baseUrl" in parsed, false);
  assert.equal("baseSignature" in parsed, false);
  for (const patch of [
    { cinematicCharacterSheet: true },
    { characterBaseSheet: { url: "/outputs/new-base.png" } },
    { characterWardrobes: [{ id: "new", url: "/new-outfit.png" }] },
    { characterName: "Renamed", characterTraits: ["Happy"] }
  ]) {
    assert.equal(characterBaseVideoGenerationSignature({ ...data, ...patch }), signature);
  }
  for (const patch of [
    { characterPortrait: { url: "/different-portrait.png" } },
    { characterSheetModel: "Nano Banana Pro" },
    { characterPhysicalDetails: "Scar" }
  ]) {
    assert.notEqual(characterBaseVideoGenerationSignature({ ...data, ...patch }), signature);
  }
});

test("CU wardrobe reuse is independent of a changed regular base signature", () => {
  const wardrobe = { id: "blue", localUrl: "/uploads/blue.png" };
  const variant = {
    wardrobeId: wardrobe.id,
    wardrobeUrl: wardrobe.localUrl,
    baseSignature: "old-regular",
    baseVideoSignature: "same-cu",
    generated: { url: "/outputs/old-regular-wardrobe.png" },
    videoGenerated: { url: "/outputs/cu-wardrobe.png" }
  };
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "new-regular"), false);
  assert.equal(characterWardrobeVariantIsCurrent(variant, wardrobe, "new-regular", {
    requireVideo: true, baseVideoSignature: "same-cu"
  }), true);
  assert.equal(characterWardrobeVariantIsCurrent(variant, { ...wardrobe, localUrl: "/new-outfit.png" }, "new-regular", {
    requireVideo: true, baseVideoSignature: "same-cu"
  }), false);
});

test("rebuilding the regular master preserves an independently valid CU master", async (t) => {
  const cu = { url: "/outputs/cu.png" };
  const generateVideo = t.mock.fn(() => assert.fail("CU must not be regenerated"));
  const checkpoints = [];
  const result = await generateCharacterBaseSheets({
    baseVideoSheet: cu,
    baseSignature: "new-regular",
    baseVideoSignature: "same-cu",
    includeVideo: true,
    generateBase: async () => ({ url: "/outputs/new-regular.png" }),
    generateVideo,
    onCheckpoint: (patch) => checkpoints.push(patch)
  });
  assert.equal(generateVideo.mock.callCount(), 0);
  assert.equal(result.baseVideoSheet, cu);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].characterBaseVideoSheet, cu);
  assert.equal(checkpoints[0].characterBaseVideoSignature, "same-cu");
});

test("an explicit fresh build generates both independent masters and checkpoints them", async () => {
  const calls = [];
  const result = await generateCharacterBaseSheets({
    baseSignature: "regular",
    baseVideoSignature: "cu",
    includeVideo: true,
    generateBase: async () => { calls.push("regular"); return { url: "/regular.png" }; },
    generateVideo: async (...args) => { assert.deepEqual(args, []); calls.push("cu"); return { url: "/cu.png" }; },
    onCheckpoint: () => calls.push("checkpoint")
  });
  assert.deepEqual(calls, ["regular", "checkpoint", "cu", "checkpoint"]);
  assert.equal(result.baseSheet.url, "/regular.png");
  assert.equal(result.baseVideoSheet.url, "/cu.png");
  assert.equal(result.baseVideoSignature, "cu");
});

test("wardrobe edits request a seamless complete layered outfit instead of partial patches", () => {
  for (const prompt of [characterWardrobeEditPrompt, characterVideoWardrobeEditPrompt]) {
    assert.match(prompt, /single layered outfit, not a menu/);
    assert.match(prompt, /If the reference includes a coat or jacket, keep it on in both body panels/);
    assert.match(prompt, /Do not invent garments or accessories absent from the reference/);
    assert.match(prompt, /complete, seamless sheet/);
    assert.match(prompt, /never an isolated edit patch or pasted face cutouts/);
  }
});

test("regular and CU wardrobe edits include referenced headwear and eyewear without requiring extra text", () => {
  for (const prompt of [characterWardrobeEditPrompt, characterVideoWardrobeEditPrompt]) {
    assert.match(prompt, /Accessories visible in that reference are explicitly requested even when no accompanying text names them/);
    assert.match(prompt, /Include hats, caps, glasses, sunglasses/);
    assert.match(prompt, /whether shown separately in a flat lay or worn by a person/);
    assert.match(prompt, /not the accessories they are wearing/);
    assert.match(prompt, /Headwear and eyewear are part of the outfit in every view where their wearing position is visible, including close-ups/);
    assert.match(prompt, /lens tint\/opacity consistently/);
    assert.match(prompt, /Do not omit eyewear, move it onto the forehead, or hold it in a hand just to uncover the base's eyes/);
    assert.match(prompt, /do not substitute clear lenses for referenced sunglasses/);
    assert.doesNotMatch(prompt, /clothing only|requested wearable accessories|Preserve the portrait's face, hair.*exactly/i);
  }
});

test("multiple accessories retain their own placement instead of merging into one piece of eyewear", () => {
  for (const prompt of [characterWardrobeEditPrompt, characterVideoWardrobeEditPrompt]) {
    assert.match(prompt, /unless the reference explicitly shows a different wearing position/);
    assert.match(prompt, /Keep distinct accessories separate: do not merge, hybridize, or substitute one for another/);
    assert.match(prompt, /keep the goggles mounted as shown and wear the separate eyewear over the eyes/);
  }
});

test("accessories can cover the head or face without weakening the identity and framing contract", () => {
  for (const prompt of [characterWardrobeEditPrompt, characterVideoWardrobeEditPrompt]) {
    assert.match(prompt, /local occlusion and contact shadows needed to wear them naturally/);
    assert.match(prompt, /Referenced headwear may naturally cover hair, and eyewear may naturally cover the eyes or parts of the face/);
    assert.match(prompt, /Preserve the underlying facial identity, anatomy, hairstyle, head angle, eyeline, and expression/);
    assert.match(prompt, /show only the portion of an accessory that falls within each crop, never zoom out or reposition the character/);
    assert.match(prompt, /Do not invent garments or accessories absent from the reference/);
  }
  assert.match(characterNeutralBaseWardrobePrompt, /Do not add styling, branding, patterns, accessories, jewelry, hats/);
});

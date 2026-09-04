import test from "node:test";
import assert from "node:assert/strict";

import {
  characterBaseGenerationSignature,
  characterBaseVideoGenerationSignature,
  characterBaseVariant,
  characterNeutralBaseWardrobePrompt,
  characterVideoWardrobeEditPrompt,
  characterWardrobeEditPrompt,
  characterWardrobeMaskRegions,
  characterWardrobeVariantIsCurrent,
  upsertCharacterWardrobeVariant
} from "../src/characterSheetWorkflow.js";

test("the identity base uses a neutral reference garment instead of a designed wardrobe", () => {
  assert.match(characterNeutralBaseWardrobePrompt, /identity foundation/i);
  assert.match(characterNeutralBaseWardrobePrompt, /no styling, branding, patterns/i);
  assert.match(characterNeutralBaseWardrobePrompt, /no nudity/i);
});

test("wardrobe edits lock identity and composition to the base sheet", () => {
  assert.match(characterWardrobeEditPrompt, /locked master image/i);
  assert.match(characterWardrobeEditPrompt, /change only the character's clothing/i);
  assert.match(characterWardrobeEditPrompt, /sole authority for identity, anatomy, composition/i);
  assert.match(characterVideoWardrobeEditPrompt, /exact canvas dimensions, three-panel layout/i);
  assert.match(characterVideoWardrobeEditPrompt, /hard crop lock/i);
  assert.match(characterVideoWardrobeEditPrompt, /only panel where the character's head or face may be visible/i);
  assert.match(characterVideoWardrobeEditPrompt, /not a layout, framing, crop, pose, or camera reference/i);
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

test("CU wardrobe variants track the CU base workflow signature", () => {
  const baseVideoSignature = characterBaseVideoGenerationSignature("base-v1", { url: "/outputs/base.png" });
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

test("wardrobe masks protect face regions while exposing clothing regions", () => {
  const imageRegions = characterWardrobeMaskRegions("image");
  const videoRegions = characterWardrobeMaskRegions("video");
  assert.equal(imageRegions[0].y > 0, true);
  assert.equal(imageRegions.some((region) => region.x > 0.45 && region.height < 0.2), true);
  assert.deepEqual(videoRegions[0], { x: 0, y: 0, width: 0.5, height: 1 });
});

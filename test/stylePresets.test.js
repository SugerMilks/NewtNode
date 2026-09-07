import test from "node:test";
import assert from "node:assert/strict";

import { normalizeStylePresetName, stylePresetNames, stylePresetPrompts } from "../src/modelOptions.js";
import { gradePresetNames, gradePresetPrompts, normalizeGradePresetName } from "../src/colorLook.js";

const addedStylePresetNames = [
  "Cinematic Indie",
  "Cinematic Standard",
  "Cinematic Commercial",
  "Vintage 8mm",
  "UGC Device",
  "Photography Color",
  "Photography B&W",
  "Photography Film",
  "Painterly 3D",
  "80s Animation",
  "90s Animation",
  "Pixel Art"
];

test("new Style Node presets are exposed in their intended order", () => {
  const startIndex = stylePresetNames.indexOf("Cinematic Indie");

  assert.notEqual(startIndex, -1);
  assert.deepEqual(stylePresetNames.slice(startIndex, startIndex + addedStylePresetNames.length), addedStylePresetNames);
});

test("new Style Node presets provide complete prompt suffixes", () => {
  for (const presetName of addedStylePresetNames) {
    assert.ok(stylePresetPrompts[presetName].length > 80, `${presetName} should have a complete prompt`);
    assert.match(stylePresetPrompts[presetName], /\.$/);
  }

  assert.match(stylePresetPrompts["UGC Device"], /No foreground phone seen\.$/);
  assert.match(stylePresetPrompts["Pixel Art"], /no anti-aliasing, no text, no watermark\.$/);
});

test("Vintage 8mm preserves the exact requested prompt and saved preset selection", () => {
  assert.equal(
    stylePresetPrompts["Vintage 8mm"],
    "Cinematic still frame from a vintage film, shot on 8mm film, soft lens. Slightly refurbished film. Any captured motion within the composition needs to have realistic motion blur based off of a hand cranked film camera. Must have dynamic framing, atmospheric cinematography, and halation. Realistic low contrast and muted color grade. Shallow depth of field, Lens bloom, heavy 8mm film grain. Realistic lens edge distortions, blurs, and vignetting. Atmospheric haze, imperfect real-camera texture, classic film look."
  );
  assert.equal(normalizeStylePresetName("Vintage 8mm"), "Vintage 8mm");
  assert.equal(stylePresetNames.filter((name) => name === "Vintage 8mm").length, 1);
});

test("legacy Commercial preset is no longer available", () => {
  assert.equal(stylePresetNames.includes("Commercial"), false);
  assert.equal(Object.hasOwn(stylePresetPrompts, "Commercial"), false);
  assert.equal(stylePresetNames.includes("Cinematic Commercial"), true);
});

test("legacy Cinematic preset is removed and migrates to Cinematic Standard", () => {
  assert.equal(stylePresetNames.includes("Cinematic"), false);
  assert.equal(Object.hasOwn(stylePresetPrompts, "Cinematic"), false);
  assert.equal(normalizeStylePresetName("Cinematic"), "Cinematic Standard");
});

test("Grade choices remain independent from Style choices", () => {
  assert.equal(stylePresetNames.includes("Custom Palette"), false);
  assert.deepEqual(gradePresetNames, [
    "None", "Cool", "Warm", "Refn Beauty", "Spiky Nike", "Vintage Son", "Dusty Brothers",
    "Moody Meadow", "Classy Kubric", "Coney Color", "Jaws of Life", "Custom"
  ]);
  assert.equal(stylePresetNames.includes("Jaws of Life"), false);
  assert.match(gradePresetPrompts.Cool, /COLOR PALETTE:/);
  assert.match(gradePresetPrompts.Warm, /COLOR PALETTE:/);
  assert.equal(normalizeGradePresetName("Unknown"), "None");
});

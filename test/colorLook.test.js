import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeColorLookPalette,
  buildColorGradePrompt,
  buildColorLookPreset,
  buildColorLookPrompt,
  colorLookPreservationInstruction,
  coolGradeDescription,
  coolGradePalette,
  gradePresetNames,
  gradePresetPrompts,
  normalizeHexColor,
  referenceGradePresets,
  warmGradeDescription,
  warmGradePalette
} from "../src/colorLook.js";

const samplePalette = [
  "#052432", "#063348", "#07415c", "#0b99ac", "#087d8f", "#09afca", "#07546d",
  "#065f84", "#041018", "#0fc7e5", "#edfcfc", "#0673aa", "#77e4f1", "#417b77"
];

test("normalizes valid short and long HEX colors", () => {
  assert.equal(normalizeHexColor("#abc"), "#AABBCC");
  assert.equal(normalizeHexColor("052432"), "#052432");
  assert.equal(normalizeHexColor("not-a-color"), "");
});

test("reduces a noisy palette into seven semantic color roles", () => {
  const analysis = analyzeColorLookPalette(samplePalette);

  assert.equal(analysis.colors.length, 7);
  assert.equal(analysis.shadows.length, 2);
  assert.equal(analysis.midtones.length, 2);
  assert.equal(analysis.highlights.length, 1);
  assert.equal(analysis.neutrals.length, 1);
  assert.equal(analysis.accents.length, 1);
  assert.equal(analysis.temperature, "Cool");
  assert.ok(analysis.colors.some((color) => color.hex === "#EDFCFC"));
  assert.ok(analysis.colors.some((color) => color.hex === "#0FC7E5"));
  assert.deepEqual(analysis.neutrals.map((color) => color.hex), ["#417B77"]);
});

test("builds a three-layer prompt with palette protection language", () => {
  const prompt = buildColorLookPrompt({
    visualLook: "A cool premium commercial grade",
    palette: samplePalette,
    userPrompt: "A scientist holds a red medical device"
  });

  assert.match(prompt, /^VISUAL LOOK:/);
  assert.match(prompt, /COLOR PALETTE:/);
  assert.match(prompt, /Shadows:/);
  assert.match(prompt, /Accents:/);
  assert.match(prompt, /USER PROMPT:/);
  assert.match(prompt, /red medical device/);
  assert.ok(prompt.includes(colorLookPreservationInstruction));
});

test("creates a reusable preset without requiring a user prompt", () => {
  const preset = buildColorLookPreset({
    name: "Cold Medical",
    palette: samplePalette,
    visualLook: "Cool premium commercial color grade"
  });

  assert.equal(preset.name, "Cold Medical");
  assert.equal(preset.palette.length, 7);
  assert.doesNotMatch(preset.hiddenPrompt, /USER PROMPT:/);
  assert.match(preset.hiddenPrompt, /Preserve natural skin tones/);
});

test("ships reusable Cool and Warm grade presets", () => {
  assert.deepEqual(gradePresetNames, [
    "None", "Cool", "Warm", "Refn Beauty", "Spiky Nike", "Vintage Son", "Dusty Brothers",
    "Moody Meadow", "Classy Kubric", "Coney Color", "Custom"
  ]);
  assert.equal(coolGradePalette.length, 14);
  assert.equal(warmGradePalette.length, 14);
  assert.match(gradePresetPrompts.Cool, new RegExp(coolGradeDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(gradePresetPrompts.Warm, new RegExp(warmGradeDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const hex of coolGradePalette) assert.ok(gradePresetPrompts.Cool.includes(hex));
  for (const hex of warmGradePalette) assert.ok(gradePresetPrompts.Warm.includes(hex));
  assert.ok(gradePresetPrompts.Cool.includes(colorLookPreservationInstruction));
  assert.ok(gradePresetPrompts.Warm.includes(colorLookPreservationInstruction));
});

test("ships named reference grades with complete palette direction", () => {
  assert.deepEqual(Object.keys(referenceGradePresets), [
    "Refn Beauty", "Spiky Nike", "Vintage Son", "Dusty Brothers", "Moody Meadow", "Classy Kubric", "Coney Color"
  ]);
  for (const [name, preset] of Object.entries(referenceGradePresets)) {
    assert.equal(preset.palette.length, 14, `${name} should preserve a full reference palette`);
    assert.ok(preset.description.length > 100, `${name} should describe its tonal behavior`);
    assert.match(gradePresetPrompts[name], /^COLOR GRADE:/);
    assert.ok(gradePresetPrompts[name].includes(colorLookPreservationInstruction));
    for (const hex of preset.palette) assert.ok(gradePresetPrompts[name].includes(hex));
  }
});

test("builds a semantic custom grade prompt from an extracted palette", () => {
  const prompt = buildColorGradePrompt({ palette: samplePalette });

  assert.match(prompt, /^COLOR GRADE:/);
  assert.match(prompt, /Shadows:/);
  assert.match(prompt, /Midtones:/);
  assert.match(prompt, /Highlights:/);
  assert.match(prompt, /Palette HEX values:/);
  assert.ok(prompt.includes(colorLookPreservationInstruction));
});

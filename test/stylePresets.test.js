import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("Painterly 3D combines painted surfaces with dimensional lighting without prescribing scene elements", () => {
  const prompt = stylePresetPrompts["Painterly 3D"];
  assert.match(prompt, /dimensional realism with expressive hand-painted artistry/);
  assert.match(prompt, /directional light that wraps around forms, soft bounced light, grounded contact shadows, material-sensitive highlights/);
  assert.match(prompt, /Preserve brushwork in both illuminated and shadowed areas/);
  assert.match(prompt, /controls rendering and visual treatment, not subject matter, setting, wardrobe, props, architecture, or historical era/);
  assert.match(prompt, /Do not introduce unrelated objects or decorative motifs/);
  assert.match(prompt, /Explicit camera, framing, lighting, and color-grade instructions take precedence/);
  assert.doesNotMatch(prompt, /steampunk|fantasy design|graphic 2D accents|Arcane|Demon Hunters/i);
  assert.equal(normalizeStylePresetName("Painterly 3D"), "Painterly 3D");
});

test("saved Style selections append the current preset and grade to the final image prompt unchanged", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function buildEffectiveImagePrompt(");
  const end = editor.indexOf("async function extractCustomPaletteFromFile(", start);
  assert.ok(start >= 0 && end > start);
  const deps = {
    stylePresetPrompts,
    isReframeNode: () => false,
    activeConnectedCharacterSources: () => [],
    resolveImageReferenceMentions: prompt => prompt,
    resolveImageCharacterMentions: prompt => prompt,
    composerCharacterMappingPromptPieces: () => [],
    extractAspectRatio: value => value,
    gradePromptPiece: data => gradePresetPrompts[data.gradePreset] || ""
  };
  const buildPrompt = new Function(...Object.keys(deps), `${editor.slice(start, end)}; return buildEffectiveImagePrompt;`)(...Object.values(deps));
  const brief = "A ceramic teapot on a plain wooden table, framed from above.";
  for (const stylePreset of stylePresetNames) {
    for (const gradePreset of ["None", "Warm"]) {
      const source = { type: "style", data: { stylePreset, gradePreset } };
      const before = structuredClone(source);
      const prompt = buildPrompt(brief, [{ source, edge: { from: { port: "styleOut" } } }], "16:9");
      assert.equal(prompt, [brief, stylePresetPrompts[stylePreset], gradePresetPrompts[gradePreset]].filter(Boolean).join("\n\n"));
      assert.deepEqual(source, before);
    }
  }
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

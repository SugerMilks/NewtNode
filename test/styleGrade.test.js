import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { preciseColorPickerGrade, styleGradePresetNames, styleGradePresetPrompts, normalizeStyleGradePresetName, styleGradePaletteData, migrateStyleGradeData } from "../src/styleGrade.js";
import { gradePresetPrompts } from "../src/colorLook.js";
import { exploreGrades } from "../src/explore.js";

const imageColors = [{ r: 10, g: 80, b: 140, percent: 100 }];
const pickedColors = [{ r: 230, g: 90, b: 70 }];

test("Style grades use the requested names and order, keeping None as the off option", () => {
  assert.deepEqual(styleGradePresetNames, ["None", "Warm Grade", "Cool Grade", "Bright Fashion", "Modern Vintage", "Precise Color", "Custom"]);
  assert.equal(normalizeStyleGradePresetName(preciseColorPickerGrade), preciseColorPickerGrade);
  assert.equal(normalizeStyleGradePresetName("Not a preset"), "None");
  assert.equal(exploreGrades.includes(preciseColorPickerGrade), false);
});

test("old hand-picked palettes move to the picker without replacing a different selected grade", () => {
  for (const gradePreset of ["Custom", "Warm Grade", "None"]) {
    const input = { gradePreset, customPaletteColors: pickedColors, customPalettePicker: "#e65a46", customPaletteRgbText: "", customPalettePreviewUrl: "" };
    const data = migrateStyleGradeData(input);
    assert.equal(data.gradePreset, gradePreset === "Custom" ? preciseColorPickerGrade : gradePreset);
    assert.deepEqual(data.precisePalette.colors, pickedColors); assert.equal(data.precisePalette.picker, "#e65a46");
    assert.deepEqual(data.customPaletteColors, []); assert.deepEqual(input.customPaletteColors, pickedColors);
    assert.deepEqual(migrateStyleGradeData(data), data, "Migration happens only once");
  }
  const legacy = migrateStyleGradeData({ stylePreset: "Custom Palette", customPaletteRgbText: "#abcdef" });
  assert.equal(legacy.gradePreset, preciseColorPickerGrade); assert.equal(legacy.precisePalette.rgbText, "#abcdef");
});

test("image grades, empty Custom slots and already separated palettes are preserved", () => {
  const image = migrateStyleGradeData({ gradePreset: "Custom", customPalettePreviewUrl: "/uploads/reference.png", customPaletteColors: imageColors });
  assert.equal(image.gradePreset, "Custom"); assert.deepEqual(image.customPaletteColors, imageColors);
  assert.equal(image.precisePalette, undefined);
  assert.equal(migrateStyleGradeData({ gradePreset: "Custom" }).gradePreset, "Custom");
  const data = { ...image, precisePalette: { colors: pickedColors }, gradePreset: preciseColorPickerGrade };
  assert.deepEqual(styleGradePaletteData(data).customPaletteColors, pickedColors);
  assert.equal(styleGradePaletteData(data).customPalettePreviewUrl, undefined);
  assert.deepEqual(styleGradePaletteData({ ...data, gradePreset: "Custom" }).customPaletteColors, imageColors);
});

const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${editor}\nexport { gradePromptPiece, styleOutputEnabled, styleGradeLabel, normalizeCurrentNode, normalizeEditorGraph };`,
  resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { gradePromptPiece, styleOutputEnabled, styleGradeLabel, normalizeCurrentNode, normalizeEditorGraph } = module.exports;

test("selected palette alone drives output, and clearing the picker leaves Custom intact", () => {
  const image = { stylePreset: "None", gradePreset: "Custom", customPaletteColors: imageColors, customPalettePreviewUrl: "/uploads/reference.png" };
  const data = { ...image, gradePreset: preciseColorPickerGrade, precisePalette: { colors: pickedColors } };
  assert.equal(styleOutputEnabled(data), true); assert.equal(styleGradeLabel(data), preciseColorPickerGrade);
  assert.notEqual(gradePromptPiece(data), gradePromptPiece(image));
  const cleared = { ...data, precisePalette: { colors: [] } };
  assert.equal(styleOutputEnabled(cleared), false); assert.equal(gradePromptPiece(cleared), "");
  assert.equal(gradePromptPiece({ ...cleared, gradePreset: "Custom" }), gradePromptPiece(image));
});

test("legacy palette generation, graph connections and save/reopen retain the same grade", () => {
  const original = { id: "style", type: "style", x: 0, y: 0, data: { stylePreset: "None", gradePreset: "Custom", customPaletteColors: pickedColors } };
  const node = normalizeCurrentNode(original);
  assert.equal(node.data.gradePreset, preciseColorPickerGrade);
  assert.equal(gradePromptPiece(node.data), gradePromptPiece(original.data));
  const restored = normalizeCurrentNode(JSON.parse(JSON.stringify(node)));
  assert.deepEqual(restored.data.precisePalette, node.data.precisePalette);
  const edge = { id: "wire", from: { nodeId: "style", port: "styleOut" }, to: { nodeId: "image", port: "styleIn" } };
  const graph = normalizeEditorGraph([node, { id: "image", type: "imageModel", x: 400, y: 0, data: { model: "Nano Banana Pro" } }], [edge], []);
  assert.equal(graph.edges.length, 1); assert.equal(graph.nodes[0].data.gradePreset, preciseColorPickerGrade);
});

test("renamed grades retain their exact prompts through node migration and reopen", () => {
  for (const [oldName, newName] of Object.entries({ "Dusty Brothers": "Warm Grade", "Moody Meadow": "Cool Grade", "Refn Beauty": "Bright Fashion", "Vintage Son": "Modern Vintage" })) {
    assert.equal(normalizeStyleGradePresetName(oldName), newName);
    assert.equal(styleGradePresetPrompts[newName], gradePresetPrompts[oldName]);
    const node = normalizeCurrentNode({ id: "style", type: "style", data: { stylePreset: "None", gradePreset: oldName } });
    assert.equal(node.data.gradePreset, newName);
    assert.equal(gradePromptPiece(node.data), gradePresetPrompts[oldName]);
    assert.equal(gradePromptPiece({ gradePreset: oldName }), gradePresetPrompts[oldName]);
    assert.equal(styleGradeLabel(node.data), newName);
    assert.equal(styleOutputEnabled(node.data), true);
    assert.equal(normalizeCurrentNode(JSON.parse(JSON.stringify(node))).data.gradePreset, newName);
  }
});

test("removed Style grades resolve to None without losing other settings, palettes or media", () => {
  for (const gradePreset of ["Cool", "Warm", "Spiky Nike", "Classy Kubric", "Coney Color", "Jaws of Life"]) {
    assert.equal(styleGradePresetNames.includes(gradePreset), false);
    assert.equal(normalizeStyleGradePresetName(gradePreset), "None");
    const data = { stylePreset: "Painterly 3D", gradePreset, resultUrl: "/outputs/existing.png", customPalettePreviewUrl: "/uploads/reference.png", customPaletteColors: imageColors, precisePalette: { colors: pickedColors } };
    const node = normalizeCurrentNode({ id: "style", type: "style", data });
    assert.equal(node.data.gradePreset, "None"); assert.equal(node.data.stylePreset, "Painterly 3D");
    assert.equal(node.data.resultUrl, data.resultUrl); assert.equal(node.data.customPalettePreviewUrl, data.customPalettePreviewUrl);
    assert.equal(node.data.customPaletteColors.length, 1); assert.equal(node.data.precisePalette.colors.length, 1);
    assert.equal(gradePromptPiece(data), ""); assert.equal(styleOutputEnabled(node.data), true);
    assert.equal(styleOutputEnabled({ gradePreset, stylePreset: "None" }), false);
  }
});

test("Precise Color Picker saves as Precise Color with identical manual colors and output", () => {
  const data = { stylePreset: "None", gradePreset: "Precise Color Picker", styleGradeVersion: 1, precisePalette: { colors: pickedColors, picker: "#e65a46" }, customPaletteColors: imageColors, customPalettePreviewUrl: "/uploads/reference.png" };
  const node = normalizeCurrentNode({ id: "style", type: "style", data });
  assert.equal(node.data.gradePreset, "Precise Color");
  assert.equal(node.data.precisePalette.picker, "#e65a46");
  assert.equal(gradePromptPiece(node.data), gradePromptPiece(data));
  assert.equal(node.data.customPalettePreviewUrl, data.customPalettePreviewUrl);
  assert.equal(styleGradeLabel(node.data), "Precise Color");
});

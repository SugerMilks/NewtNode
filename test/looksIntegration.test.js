import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { lookNodeData } from "../src/looks.js";

const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({
  stdin: { contents: `${editor}\nexport { promptPiecesForSource, styleOutputEnabled, styleGradeLabel, normalizeCurrentNode, normalizeEditorGraph };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" }
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { promptPiecesForSource, styleOutputEnabled, styleGradeLabel, normalizeCurrentNode, normalizeEditorGraph } = module.exports;
const look = { id: "paint", name: "Painted Light", prompt: "Fine brush strokes and directional soft light.", examples: [{ id: "one", localUrl: "/uploads/looks/example.png" }] };

test("Look snapshot reaches actual generation prompt and remains editable after save/load", () => {
  const source = { id: "style", type: "style", x: 20, y: 30, data: lookNodeData("style", look) };
  const restored = normalizeCurrentNode(JSON.parse(JSON.stringify(source)));
  assert.equal(styleOutputEnabled(restored.data), true);
  assert.equal(styleGradeLabel(restored.data), look.name);
  assert.match(promptPiecesForSource(restored).join("\n"), /Fine brush strokes/);
  assert.match(promptPiecesForSource(restored).join("\n"), /Do not import the reference subjects/);
  assert.equal(restored.data.libraryStyle.examples[0].localUrl, "/uploads/looks/example.png");
  restored.data.libraryStyle.prompt = "Changed style";
  assert.match(promptPiecesForSource(restored)[0], /Changed style/);
  restored.data.libraryStyle = null;
  assert.equal(styleOutputEnabled(restored.data), false);
  restored.data.stylePreset = "Painterly 3D";
  assert.equal(styleOutputEnabled(restored.data), true);
  assert.ok(promptPiecesForSource(restored).length > 0);
});

test("Mood Board imports preserve local images and existing compile/lock workflow", () => {
  const node = normalizeCurrentNode({ id: "board", type: "transfer", x: 10, y: 20, data: lookNodeData("transfer", look) });
  assert.equal(node.data.transferImages[0].localUrl, look.examples[0].localUrl);
  assert.equal(node.data.locked, false);
  assert.equal(node.data.activated, false);
  assert.deepEqual(promptPiecesForSource(node), []);
});

test("analyzed looks default to None plus first-image Custom Grade and combine with presets without losing the look", () => {
  const data = lookNodeData("style", { ...look, gradeColors: [{ r: 20, g: 80, b: 140, percent: 100 }] });
  assert.equal(data.stylePreset, "None"); assert.equal(data.gradePreset, "Custom");
  assert.equal(data.customPalettePreviewUrl, look.examples[0].localUrl);
  const node = normalizeCurrentNode({ id: "styled", type: "style", data: JSON.parse(JSON.stringify({ ...data, stylePreset: "Painterly 3D" })) });
  const pieces = promptPiecesForSource(node);
  assert.equal(pieces.length, 3);
  assert.match(pieces[0], /Fine brush strokes/); assert.match(pieces[0], /separately selected grade controls color/);
  assert.ok(pieces[1].length > 40); assert.ok(pieces[2].length > 40);
  assert.match(styleGradeLabel(node.data), /Painted Light \+ Painterly 3D \+ Custom Grade/);
  node.data.customPaletteColors = [{ r: 255, g: 0, b: 0, percent: 100 }];
  assert.equal(promptPiecesForSource(node)[0], pieces[0]); assert.notEqual(promptPiecesForSource(node)[2], pieces[2]);
});

test("the chosen reference feature reaches the final Style prompt ahead of supporting rendering", () => {
  const signatureFeature = "Use stepped angular planes with hard silhouette breaks to sculpt the subject as one bold geometric mass.";
  const data = lookNodeData("style", { ...look, styleAnalysis: { stylePrompt: look.prompt, signatureFeature, anchorReference: 3, referenceCount: 4 } });
  const node = normalizeCurrentNode({ id: "style", type: "style", data });
  const prompt = promptPiecesForSource(node).join("\n");
  assert.ok(prompt.includes(signatureFeature));
  assert.ok(prompt.indexOf(signatureFeature) < prompt.indexOf(look.prompt));
  assert.match(prompt, /not any color instructions/);
  assert.equal(node.data.stylePreset, "None");
});

test("catalog Style wires survive graph reload with current Image Model ports", () => {
  const style = { id: "style", type: "style", x: 0, y: 0, data: lookNodeData("style", look) };
  const image = { id: "image", type: "imageModel", x: 400, y: 0, data: { model: "Nano Banana Pro" } };
  const edge = { id: "edge", from: { nodeId: style.id, port: "styleOut" }, to: { nodeId: image.id, port: "styleIn" } };
  const graph = normalizeEditorGraph([style, image], [edge], []);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.nodes[0].data.libraryStyle.name, look.name);
});

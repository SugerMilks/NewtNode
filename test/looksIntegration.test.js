import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { lookNodeData } from "../src/looks.js";
import { filmStillGradePatch } from "../src/filmStillGrade.js";
import { nodeApi } from "../src/api/newtApi.js";
import { runImageModelGeneration } from "../src/nodeRunners/mediaModels.js";

const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({
  stdin: { contents: `${editor}\nexport { promptPiecesForSource, buildEffectiveImagePrompt, styleOutputEnabled, styleGradeLabel, normalizeCurrentNode, normalizeEditorGraph, connectedImagePromptItems, imageReferenceConnectionsForModel, storyboardImagePromptItems };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" }
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { promptPiecesForSource, buildEffectiveImagePrompt, styleOutputEnabled, styleGradeLabel, normalizeCurrentNode, normalizeEditorGraph } = module.exports;
const { connectedImagePromptItems, imageReferenceConnectionsForModel, storyboardImagePromptItems } = module.exports;
const look = { id: "paint", name: "Painted Light", prompt: "Fine brush strokes and directional soft light.", examples: [{ id: "one", localUrl: "/uploads/looks/example.png" }] };

test("Film Still colors and clean image reach generation together after reload, never monochrome storyboard mode", () => {
  const palette = { version: 1, colors: Array.from({ length: 10 }, (_, i) => `#${(i * 1234 + 300).toString(16).padStart(6, "0").toUpperCase()}`) };
  const example = { ...look.examples[0], filmStillPalette: palette };
  const source = normalizeCurrentNode({ id: "grade", type: "style", data: lookNodeData("grade", { ...look, examples: [example] }) });
  const prompt = promptPiecesForSource(source).join("\n");
  assert.ok(palette.colors.every(color => prompt.includes(color)));
  assert.match(prompt, /Never copy its actors, objects/);
  const incoming = { styleIn: [{ source, edge: { from: { port: "styleOut" }, to: { port: "styleIn" } } }] };
  const references = connectedImagePromptItems(imageReferenceConnectionsForModel("Nano Banana Pro", incoming));
  assert.equal(references.length, 1); assert.equal(references[0].url, example.localUrl);
  assert.match(references[0].label, /color and tone only/);
  assert.equal(storyboardImagePromptItems({ data: { useStoryboardStyle: true } }, incoming).length, 0);
  assert.equal(storyboardImagePromptItems({ data: { useStoryboardStyle: false } }, incoming)[0].url, example.localUrl);
  source.data.gradePreset = "None";
  assert.equal(connectedImagePromptItems(imageReferenceConnectionsForModel("Nano Banana Pro", incoming)).length, 0);
  source.data = { ...source.data, ...filmStillGradePatch({ ...example, localUrl: "/workflow-assets/test/inputs/new.png" }) };
  assert.equal(connectedImagePromptItems(imageReferenceConnectionsForModel("Nano Banana Pro", incoming))[0].url, "/workflow-assets/test/inputs/new.png");
});

test("Film Still generation sends non-rendered grading data, not instructions to illustrate the palette", async t => {
  const palette = { version: 1, colors: ["#530211", "#A83882", "#BF4D8B", "#D3867E", "#C37573", "#CD443C", "#965418", "#F1AF34", "#FDF03F", "#221205"] };
  const example = { ...look.examples[0], filmStillPalette: palette };
  const source = normalizeCurrentNode(JSON.parse(JSON.stringify({ id: "grade", type: "style", data: lookNodeData("grade", { ...look, examples: [example] }) })));
  const incoming = { styleIn: [{ source, edge: { from: { port: "styleOut" }, to: { port: "styleIn" } } }] };
  const brief = 'Dog with a hat. The hat has the word "HELLO" embroidered on it.';
  let submitted;
  t.mock.method(nodeApi, "generateImage", async payload => {
    submitted = payload;
    return { response: { ok: true }, data: { image: { localUrl: "/outputs/test.png" } } };
  });
  await runImageModelGeneration({
    node: { id: "image", data: { model: "Nano Banana Pro", aspectRatio: "16:9", resolution: "2K" } },
    prompt: buildEffectiveImagePrompt(brief, incoming.styleIn, "16:9"),
    imagePromptItems: connectedImagePromptItems(imageReferenceConnectionsForModel("Nano Banana Pro", incoming)),
    index: 0
  });
  assert.equal(nodeApi.generateImage.mock.callCount(), 1);
  assert.ok(submitted.prompt.startsWith(brief));
  assert.deepEqual(submitted.prompt.match(/#[A-F0-9]{6}/g), palette.colors);
  assert.match(submitted.prompt, /Non-rendered color-grading reference values/);
  assert.match(submitted.prompt, /does not need a separate visible area for every reference color/);
  assert.match(submitted.prompt, /do not add palette strips, color swatches, color charts, HEX\/RGB labels/);
  assert.match(submitted.prompt, /Do not print these reference values/);
  assert.match(submitted.prompt, /Text or graphics explicitly requested by the user remain allowed/);
  assert.doesNotMatch(submitted.prompt, /Use all ten|Do not reduce, replace or invent palette colors/);
  assert.deepEqual(submitted.imagePromptUrls, [example.localUrl]);
  assert.match(submitted.imagePromptLabels[0], /color and tone only, not content or composition/);
  assert.deepEqual(source.data.filmStillGrade.colors, palette.colors);
});

test("workflow packaging rewrites the clean image, active grade and thumbnail together without changing HEX colors", () => {
  const palette = { version: 1, colors: Array.from({ length: 10 }, (_, i) => `#${(i * 1234 + 300).toString(16).padStart(6, "0").toUpperCase()}`) };
  const example = { ...look.examples[0], filmStillPalette: palette };
  const graph = { nodes: [{ id: "grade", type: "style", data: lookNodeData("grade", { ...look, examples: [example] }) }] };
  const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const block = server.slice(server.indexOf("function collectWorkflowAssetUrls("), server.indexOf("function rewriteWorkflowPackageAssetReferences("));
  const { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls } = new Function("tryLocalPublicPath", `${block}; return { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls };`)(value => /^\/(uploads|outputs|workflow-assets)\//.test(value) ? value : "");
  assert.deepEqual([...collectWorkflowAssetUrls(graph)], [example.localUrl]);
  const packagedUrl = "/workflow-assets/shared/inputs/still.png";
  const restored = normalizeCurrentNode(rewriteWorkflowAssetUrls(graph, new Map([[example.localUrl, packagedUrl]])).nodes[0]);
  assert.equal(restored.data.filmStillGrade.imageUrl, packagedUrl);
  assert.equal(restored.data.customPalettePreviewUrl, packagedUrl);
  assert.equal(restored.data.libraryGrade.examples[0].localUrl, packagedUrl);
  assert.deepEqual(restored.data.libraryGrade.examples[0].filmStillPalette, palette);
  assert.ok(palette.colors.every(color => promptPiecesForSource(restored).join("\n").includes(color)));
});

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

test("Look descriptions remain ordinary Text nodes with prompt connections through graph reload", () => {
  const description = '  Hand-painted planes.\nKeep "LABEL", @Subject and --literal text.\n';
  const source = { id: "description", type: "plainText", canvasId: "canvas-b", x: 40, y: 50, data: lookNodeData("plainText", { ...look, prompt: description }) };
  const model = { id: "image", type: "imageModel", canvasId: "canvas-b", x: 400, y: 50, data: { model: "Nano Banana Pro" } };
  const edge = { id: "text-link", from: { nodeId: source.id, port: "promptOut" }, to: { nodeId: model.id, port: "promptIn" } };
  const graph = normalizeEditorGraph(JSON.parse(JSON.stringify([source, model])), [edge], []);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.nodes[0].type, "plainText"); assert.equal(graph.nodes[0].canvasId, "canvas-b");
  assert.equal(graph.nodes[0].data.text, description); assert.equal(graph.nodes[0].data.title, look.name);
  assert.equal(graph.nodes[0].data.libraryStyle, undefined);
  assert.equal(graph.nodes[0].data.transferImages, undefined);
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

test("Grade-only looks survive graph reload without transferring style text", () => {
  const data = lookNodeData("grade", { ...look, gradeColors: [{ r: 20, g: 80, b: 140, percent: 100 }] });
  const style = { id: "grade", type: "style", canvasId: "canvas-b", data };
  const model = { id: "image", type: "imageModel", canvasId: "canvas-b", data: { model: "Nano Banana Pro" } };
  const edge = { id: "grade-link", from: { nodeId: style.id, port: "styleOut" }, to: { nodeId: model.id, port: "styleIn" } };
  const graph = normalizeEditorGraph(JSON.parse(JSON.stringify([style, model])), [edge], []);
  const restored = graph.nodes[0];
  assert.equal(graph.edges.length, 1);
  assert.equal(restored.data.libraryStyle, null);
  assert.equal(restored.data.libraryGrade.prompt, "");
  assert.equal(restored.data.libraryGrade.examples[0].localUrl, look.examples[0].localUrl);
  assert.equal(restored.data.gradePreset, "Custom");
  assert.equal(styleOutputEnabled(restored.data), true);
  assert.equal(promptPiecesForSource(restored).length, 1);
  assert.doesNotMatch(promptPiecesForSource(restored).join("\n"), /Fine brush strokes|directional soft light/);
});

test("Unique Style can transfer independently of Custom Grade", () => {
  const data = lookNodeData("style", { ...look, includeGrade: false, gradeColors: [{ r: 20, g: 80, b: 140, percent: 100 }] });
  const restored = normalizeCurrentNode({ id: "style-only", type: "style", data: JSON.parse(JSON.stringify(data)) });
  assert.equal(restored.data.gradePreset, "None");
  assert.equal(styleOutputEnabled(restored.data), true);
  assert.match(promptPiecesForSource(restored).join("\n"), /Fine brush strokes/);
  assert.equal(promptPiecesForSource(restored).length, 1);
});

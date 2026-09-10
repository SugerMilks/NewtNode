import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { estimateImageRunCost, estimateVideoRunCost } from "../src/generationPricing.js";

const traverse = traverseModule.default;
const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
const trees = [editor, server].map((text) => parse(text, { sourceType: "module", plugins: ["jsx"] }));
function find(tree, type, match) {
  let result;
  traverse(tree, { [type](path) { if (match(path.node)) result = path.node; } });
  assert.ok(result, `Missing ${type}`);
  return result;
}
function evaluate(text, node, deps) {
  return new Function(...Object.keys(deps), `return (${text.slice(node.start, node.end)});`)(...Object.values(deps));
}

test("critical server and editor callbacks have their own runtime bindings", () => {
  const names = new Set(["sharp", "finiteNumber", "resolvedPromptText", "onStoryboardFrameImport"]);
  for (const tree of trees) traverse(tree, { ReferencedIdentifier(path) {
    if (names.has(path.node.name)) assert.ok(path.scope.hasBinding(path.node.name), `${path.node.name} at line ${path.node.loc.start.line} is unbound`);
  } });
  const card = find(trees[0], "FunctionDeclaration", (node) => node.id.name === "NodeCard");
  assert.match(editor.slice(card.start, card.end), /onStoryboardFrameImport=\{onStoryboardFrameImport\}/);
});

test("Newt can review connected image and video prompts without a runtime error", () => {
  const description = find(trees[0], "ObjectProperty", (node) => node.key.name === "describeRun").value;
  const connectedText = evaluate(editor, find(trees[0], "FunctionDeclaration", (node) => node.id.name === "connectedText"), {});
  const incoming = { promptIn: [{ source: { type: "plainText", data: { text: "Keep the connected scene." } } }] };
  const describeRun = evaluate(editor, description, {
    nodesRef: { current: [] }, edgesRef: { current: [] }, generationProvider: "fal",
    buildIncomingByNode: () => ({ test: incoming }), connectedText,
    connectedImagePromptItems: () => [], imageReferenceConnectionsForModel: () => [],
    imageInstructionSourcesForModel: () => [], buildEffectiveImagePrompt: (prompt) => prompt,
    isOpenAiImage25Model: () => false, estimateImageRunCost, estimateVideoRunCost,
    connectedDirectorPackageSource: () => null, connectedDirectorPackageText: () => "",
    expandVideoDirectorPackageIncoming: (value) => value, videoModelSupportsCharacterInput: () => true,
    uniqueAssetItems: (value) => value, connectedAssetItems: () => [], connectedCharacterReferences: () => [],
    normalizeVideoGenerateAudio: (value) => value !== false, buildEffectiveVideoPrompt: (prompt) => prompt
  });
  for (const type of ["imageModel", "videoModel"]) {
    const result = describeRun({ id: "test", type, data: {
      title: "Test", model: type === "imageModel" ? "Nano Banana 2" : "Seedance 2.0",
      prompt: "Old node text", batchCount: "2", duration: "8 seconds", resolution: type === "imageModel" ? "2K" : "720p", aspectRatio: "16:9"
    } }, "generate");
    assert.equal(result.prompt, "Keep the connected scene.");
    assert.equal(result.count, 2);
    assert.ok(result.estimatedCost > 0);
  }
});

test("Storyboard frame drops pass canvas images and local files to the import callback", () => {
  const drop = find(trees[0], "FunctionDeclaration", (node) => node.id.name === "handleFrameDrop");
  for (const fromCanvas of [true, false]) {
    const calls = [];
    const node = { id: "board" }, outputItem = { type: "image", url: "/outputs/full.png" }, file = { name: "local.png" };
    const run = evaluate(editor, drop, {
      storyboardLocked: false, node,
      outputItemFromDataTransfer: () => fromCanvas ? outputItem : null,
      firstAcceptedFile: () => file,
      onStoryboardFrameImport: (...args) => calls.push(args)
    });
    run({ preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => "", files: [file] } }, "frame-1");
    assert.deepEqual(calls, [[node, "frame-1", fromCanvas ? { outputItem } : { file }]]);
  }
});

test("Composer saved poses preserve finite signed coordinates and default invalid values", () => {
  const normalize = evaluate(server, find(trees[1], "FunctionDeclaration", (node) => node.id.name === "normalizeComposerPose"), {
    composerPoseFieldKeys: ["rotX", "rotY", "rotZ", "x", "y", "z"], safeComposerPoseFileName: (value) => value || ""
  });
  const result = normalize({ id: "saved", name: "Saved pose", rotX: -42, rotY: "90", rotZ: Infinity, x: "invalid", y: 0 });
  assert.deepEqual([result.rotX, result.rotY, result.rotZ, result.x, result.y, result.z], [-42, 90, 0, 0, 0, 0]);
  assert.equal(result.name, "Saved pose");
  assert.equal(normalize(null), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nodeTypeDefinitions, nodeTypeLabel } from "../src/nodeRegistry.js";
import { utilityImageModelNames, utilityModelDescriptions } from "../src/modelOptions.js";
import { myNewtDefaults } from "../src/myNewt/contract.js";
import { clearStaleRunningState } from "../src/workflowState.js";

test("Newt is first in the shared sidebar and context-menu catalog with its existing type", async () => {
  assert.deepEqual(nodeTypeDefinitions[0], { type: "myNewt", label: "Newt" });
  assert.equal(nodeTypeDefinitions.filter(({ type }) => type === "myNewt").length, 1);
  assert.equal(nodeTypeLabel("myNewt"), "Newt");
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  assert.match(editor, /const nodeCatalog = nodeTypeDefinitions\.map/);
  assert.match(editor, /nodeMenuEntries\(nodeCatalog, nodePreferences\)/);
  assert.equal(editor.match(/\{visibleNodeCatalog\.map\(\(item\) =>/g)?.length, 2);
});

test("new and saved Newt nodes use the new default without changing custom titles or task data", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const load = (name) => {
    const start = editor.indexOf(`function ${name}(`);
    assert.ok(start >= 0);
    const end = editor.indexOf("\nfunction ", start + 1);
    assert.ok(end > start);
    return new Function("nodeTypeLabel", "myNewtDefaults", "clearStaleRunningState", `${editor.slice(start, end)}\nreturn ${name};`)(nodeTypeLabel, myNewtDefaults, clearStaleRunningState);
  };
  const create = load("createDefaultNodeData"), normalize = load("normalizeCurrentNode");
  assert.deepEqual(create("myNewt", "My Newt", 1), { title: "Newt", ...myNewtDefaults });
  for (const title of [undefined, "", "My Newt", "Newt", "My Newt Assistant", "Studio Assistant"]) {
    const node = { id: "existing-agent", type: "myNewt", x: 123, y: 456, data: { title, budget: 12, jobId: "saved-task", myNewtSummary: { status: "paused" }, brief: "Original request" } };
    const original = structuredClone(node);
    const expectedTitle = !title || title === "My Newt" ? "Newt" : title;
    const result = normalize(node);
    assert.deepEqual(result, { ...node, data: { ...myNewtDefaults, ...node.data, title: expectedTitle } });
    assert.deepEqual(normalize(result), result);
    assert.deepEqual(node, original);
  }
});

test("Coverage appears directly beneath Storyboard in the node sidebar", () => {
  const storyboardIndex = nodeTypeDefinitions.findIndex(({ type }) => type === "storyboard");
  assert.notEqual(storyboardIndex, -1);
  assert.equal(nodeTypeDefinitions[storyboardIndex + 1]?.type, "coverage");
});

test("the Film Director node is presented as Director", () => {
  assert.equal(nodeTypeDefinitions.find(({ type }) => type === "skillDirector")?.label, "Director");
});

test("Auto Aspect lives inside Utility Image instead of the node catalog", () => {
  assert.equal(nodeTypeDefinitions.some(({ type }) => type === "autoAspect"), false);
  assert.equal(utilityImageModelNames.autoAspect, "Auto Aspect");
  assert.match(utilityModelDescriptions[utilityImageModelNames.autoAspect], /aspect ratios/i);
});

test("Frame It and 3D live inside Utility Image instead of the node catalog", () => {
  assert.equal(nodeTypeDefinitions.some(({ type }) => type === "frameIt"), false);
  assert.equal(nodeTypeDefinitions.some(({ type }) => type === "model3d"), false);
  assert.equal(utilityImageModelNames.frameIt, "Frame It");
  assert.equal(utilityImageModelNames.model3d, "3D");
  assert.match(utilityModelDescriptions[utilityImageModelNames.frameIt], /poseable/i);
  assert.match(utilityModelDescriptions[utilityImageModelNames.model3d], /GLB 3D model/i);
});

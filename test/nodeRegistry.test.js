import test from "node:test";
import assert from "node:assert/strict";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { utilityImageModelNames, utilityModelDescriptions } from "../src/modelOptions.js";

test("Coverage appears directly beneath Storyboard in the node sidebar", () => {
  const storyboardIndex = nodeTypeDefinitions.findIndex(({ type }) => type === "storyboard");
  assert.notEqual(storyboardIndex, -1);
  assert.equal(nodeTypeDefinitions[storyboardIndex + 1]?.type, "coverage");
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

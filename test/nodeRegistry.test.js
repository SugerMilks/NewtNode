import test from "node:test";
import assert from "node:assert/strict";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";

test("Coverage appears directly beneath Storyboard in the node sidebar", () => {
  const storyboardIndex = nodeTypeDefinitions.findIndex(({ type }) => type === "storyboard");
  assert.notEqual(storyboardIndex, -1);
  assert.equal(nodeTypeDefinitions[storyboardIndex + 1]?.type, "coverage");
});

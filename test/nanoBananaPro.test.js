import assert from "node:assert/strict";
import test from "node:test";

import { nanoBananaProFalThinkingMode, nanoBananaProThinkingConfig } from "../src/nanoBananaPro.js";

test("Nano Banana Pro requests high thinking without returning internal thoughts", () => {
  assert.deepEqual(nanoBananaProThinkingConfig, {
    thinkingLevel: "high",
    includeThoughts: false
  });
  assert.equal(nanoBananaProFalThinkingMode, "provider-default-high");
});

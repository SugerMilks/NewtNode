import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeminiOmniPrompt,
  normalizeGeminiOmniAspectRatio,
  normalizeGeminiOmniDuration,
  shouldFallbackGeminiOmniToFal,
  uniqueGeminiOmniReferences
} from "../src/geminiOmni.js";

test("Gemini Omni prompt maps named assets to ordered reference tags", () => {
  const prompt = buildGeminiOmniPrompt({
    prompt: "@Kim enters @Kitchen.",
    hasStartFrame: true,
    references: [
      { label: "Kim" },
      { label: "Kitchen" }
    ],
    generateAudio: false
  });

  assert.match(prompt, /\[# Sources <FIRST_FRAME>@Image1\]/);
  assert.match(prompt, /<IMAGE_REF_0>@Image2/);
  assert.match(prompt, /<IMAGE_REF_1>@Image3/);
  assert.match(prompt, /<IMAGE_REF_0> enters <IMAGE_REF_1>/);
  assert.match(prompt, /Output silent video/);
});

test("Gemini Omni limits preview controls and de-duplicates references", () => {
  assert.equal(normalizeGeminiOmniDuration("1 second"), 3);
  assert.equal(normalizeGeminiOmniDuration("15 seconds"), 10);
  assert.equal(normalizeGeminiOmniAspectRatio("9:16 (Portrait)"), "9:16");
  assert.deepEqual(uniqueGeminiOmniReferences([{ url: "a" }, { url: "a" }, { url: "b" }]), [{ url: "a" }, { url: "b" }]);
});

test("Gemini Omni never routes policy failures through fal fallback", () => {
  assert.equal(shouldFallbackGeminiOmniToFal({ status: 429, message: "Quota exceeded" }), true);
  assert.equal(shouldFallbackGeminiOmniToFal({ status: 503, message: "Unavailable" }), true);
  assert.equal(shouldFallbackGeminiOmniToFal({ status: 403, message: "Content policy blocked a recognizable person" }), false);
  assert.equal(shouldFallbackGeminiOmniToFal({ status: 400, message: "Invalid input" }), false);
});

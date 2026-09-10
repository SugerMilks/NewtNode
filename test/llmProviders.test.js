import test from "node:test";
import assert from "node:assert/strict";

import {
  llmProviderUnavailableMessage,
  normalizeLlmProvider,
  resolveLlmProvider
} from "../src/llmProviders.js";

test("LLM provider resolution follows the preferred enabled provider", () => {
  assert.equal(resolveLlmProvider({ preferredProvider: "fal", falKey: "fal", openAiKey: "openai" }), "fal");
  assert.equal(resolveLlmProvider({ preferredProvider: "OpenAI", openAiKey: "openai", falKey: "fal" }), "openai");
});

test("LLM provider resolution falls back at request time when the preferred key is disabled", () => {
  assert.equal(resolveLlmProvider({ preferredProvider: "fal", openAiKey: "openai" }), "openai");
  assert.equal(resolveLlmProvider({ preferredProvider: "google", falKey: "fal", googleKey: "google" }), "fal");
  assert.equal(resolveLlmProvider({ kreaKey: "krea" }), "");
  assert.equal(resolveLlmProvider({ atlasKey: "atlas" }), "atlas");
  assert.equal(resolveLlmProvider({ kreaKey: "krea", atlasKey: "atlas" }), "atlas");
  assert.equal(resolveLlmProvider({ preferredProvider: "krea", falKey: "fal", atlasKey: "atlas" }), "fal");
  assert.equal(resolveLlmProvider({ preferredProvider: "atlas", falKey: "fal", atlasKey: "atlas" }), "atlas");
  assert.equal(resolveLlmProvider({ falKey: "", atlasKey: " ", openAiKey: "" }), "");
});

test("LLM provider names normalize common settings labels", () => {
  assert.equal(normalizeLlmProvider("fal.ai"), "fal");
  assert.equal(normalizeLlmProvider("Gemini"), "");
  assert.equal(normalizeLlmProvider("Open AI"), "openai");
  assert.equal(normalizeLlmProvider("Atlas Cloud"), "atlas");
});

test("Krea-only LLM errors explain the companion-key requirement", () => {
  assert.match(llmProviderUnavailableMessage({ kreaKey: "configured" }), /Krea can remain enabled/);
  assert.match(llmProviderUnavailableMessage({ kreaKey: "configured" }), /Fal, Atlas Cloud, or OpenAI/);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSmartTextFalModel,
  resolveSmartTextOpenAiModel,
  smartTextFalDefaultModel,
  smartTextOpenAiDefaultModel
} from "../src/smartTextModel.js";

test("Smart Text defaults to the cheaper GPT-6 Sol for Fal and direct OpenAI", () => {
  assert.equal(smartTextFalDefaultModel, "openai/gpt-6-sol");
  assert.equal(smartTextOpenAiDefaultModel, "gpt-6-sol");
  assert.equal(resolveSmartTextFalModel(), smartTextFalDefaultModel);
  assert.equal(resolveSmartTextOpenAiModel(), smartTextOpenAiDefaultModel);
});

test("Smart Text supports dedicated model overrides", () => {
  assert.equal(
    resolveSmartTextFalModel({
      SMART_TEXT_FAL_MODEL: "openai/future-smart-text",
      FAL_TEXT_MODEL: "legacy/fallback"
    }),
    "openai/future-smart-text"
  );
  assert.equal(
    resolveSmartTextOpenAiModel({
      SMART_TEXT_OPENAI_MODEL: "future-smart-text",
      OPENAI_TEXT_MODEL: "legacy-fallback"
    }),
    "future-smart-text"
  );
});

test("Smart Text preserves legacy model overrides as fallbacks", () => {
  assert.equal(resolveSmartTextFalModel({ FAL_TEXT_MODEL: "legacy/fal-model" }), "legacy/fal-model");
  assert.equal(resolveSmartTextOpenAiModel({ OPENAI_TEXT_MODEL: "legacy-openai-model" }), "legacy-openai-model");
});

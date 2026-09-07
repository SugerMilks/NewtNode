import test from "node:test";
import assert from "node:assert/strict";

import { normalizeVideoGenerateAudio, videoAudioEnforcementMode } from "../src/videoAudio.js";

test("video audio normalization preserves booleans and legacy string values", () => {
  assert.equal(normalizeVideoGenerateAudio(true), true);
  assert.equal(normalizeVideoGenerateAudio(false), false);
  assert.equal(normalizeVideoGenerateAudio("true"), true);
  assert.equal(normalizeVideoGenerateAudio("false"), false);
  assert.equal(normalizeVideoGenerateAudio("off"), false);
  assert.equal(normalizeVideoGenerateAudio(undefined), true);
});

test("disabled generated audio is marked for deterministic local removal", () => {
  assert.equal(videoAudioEnforcementMode(true), "provider");
  assert.equal(videoAudioEnforcementMode(false), "local-track-removal");
});

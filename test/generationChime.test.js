import test from "node:test";
import assert from "node:assert/strict";
import { shouldNotifyNodeGenerationComplete } from "../src/generationChime.js";

function node(id, type, status) {
  return { id, type, data: { status } };
}

test("generation chime fires once when a media node batch completes", () => {
  assert.equal(shouldNotifyNodeGenerationComplete(node("image", "imageModel", "running"), node("image", "imageModel", "complete")), true);
  assert.equal(shouldNotifyNodeGenerationComplete(node("video", "videoModel", "running"), node("video", "videoModel", "complete")), true);
  assert.equal(shouldNotifyNodeGenerationComplete(node("coverage", "coverage", "running"), node("coverage", "coverage", "complete")), true);
  assert.equal(shouldNotifyNodeGenerationComplete(node("character", "character", "compiling"), node("character", "character", "ready")), true);
});

test("generation chime stays silent for individual progress, failures, and loaded results", () => {
  assert.equal(shouldNotifyNodeGenerationComplete(null, node("image", "imageModel", "complete")), false);
  assert.equal(shouldNotifyNodeGenerationComplete(node("image", "imageModel", "running"), node("image", "imageModel", "running")), false);
  assert.equal(shouldNotifyNodeGenerationComplete(node("image", "imageModel", "running"), node("image", "imageModel", "error")), false);
  assert.equal(shouldNotifyNodeGenerationComplete(node("text", "text", "running"), node("text", "text", "complete")), false);
  assert.equal(shouldNotifyNodeGenerationComplete(node("image", "imageModel", "complete"), node("image", "imageModel", "complete")), false);
});

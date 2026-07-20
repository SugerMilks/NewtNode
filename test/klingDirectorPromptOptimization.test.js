import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKlingDirectorOptimizationPrompt,
  clipKlingDirectorPrompt,
  klingDirectorPromptByteLength,
  parseKlingDirectorOptimizations,
  protectKlingDirectorPrompt,
  restoreKlingDirectorPrompt
} from "../src/klingDirectorPromptOptimization.js";

test("protects Kling reference tags, voice tokens, and spoken dialogue", () => {
  const source = '@Element1 crosses frame and says "we leave now" to @Image2 with <<<voice_1>>>.';
  const protectedPrompt = protectKlingDirectorPrompt(source);

  assert.equal(protectedPrompt.literals.length, 4);
  assert.equal(restoreKlingDirectorPrompt(protectedPrompt.prompt, protectedPrompt.literals), source);
});

test("builds one compact English optimization request for all Kling shots", () => {
  const prompts = [protectKlingDirectorPrompt("Wide shot of @Element1."), protectKlingDirectorPrompt("Close-up.")];
  const request = buildKlingDirectorOptimizationPrompt(prompts);

  assert.match(request, /natural English/);
  assert.match(request, /UTF-8 bytes/);
  assert.match(request, /"id":2/);
});

test("accepts optimized prompts when protected references change order", () => {
  const protectedPrompt = protectKlingDirectorPrompt("Track @Element1 toward @Image1.");
  const optimized = parseKlingDirectorOptimizations(
    '{"prompts":[{"id":1,"text":"Track __NN_LITERAL_1__ fast toward __NN_LITERAL_2__."}]}',
    [protectedPrompt]
  );

  assert.equal(
    restoreKlingDirectorPrompt(optimized[0], protectedPrompt.literals),
    "Track @Element1 fast toward @Image1."
  );
});

test("clips multilingual Kling prompts by UTF-8 bytes", () => {
  const clipped = clipKlingDirectorPrompt("紧凑电影镜头。".repeat(100));

  assert.ok(klingDirectorPromptByteLength(clipped) <= 500);
  assert.ok(clipped.length > 0);
});

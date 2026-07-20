import assert from "node:assert/strict";
import test from "node:test";

import {
  geminiOmniAspectRatioOptions,
  geminiOmniDurationOptions,
  geminiOmniResolutionOptions,
  klingO34kAspectRatioOptions,
  klingO34kDurationOptions,
  klingO34kResolutionOptions,
  klingO3ProAspectRatioOptions,
  klingO3ProDurationOptions,
  klingO3ProResolutionOptions,
  videoModelNames,
  videoModelOptions
} from "../src/modelOptions.js";
import { buildVideoGenerationRequest, videoModelSupportsFilmDirector } from "../src/nodeRunners/videoModels.js";

test("Kling O3 Pro and Kling O3 4K remain separate video models", () => {
  assert.ok(videoModelOptions.includes(videoModelNames.klingO3Pro));
  assert.ok(videoModelOptions.includes(videoModelNames.klingO34k));
  assert.deepEqual(klingO3ProResolutionOptions, ["1080p"]);
  assert.deepEqual(klingO34kResolutionOptions, ["4K"]);
  assert.deepEqual(klingO34kDurationOptions, klingO3ProDurationOptions);
  assert.deepEqual(klingO34kAspectRatioOptions, klingO3ProAspectRatioOptions);
});

test("Film Director support includes Gemini Omni while excluding unsupported video models", () => {
  assert.equal(videoModelSupportsFilmDirector("Seedance 2.0"), true);
  assert.equal(videoModelSupportsFilmDirector("Kling O3 Pro"), true);
  assert.equal(videoModelSupportsFilmDirector("Kling O3 4K"), true);
  assert.equal(videoModelSupportsFilmDirector("Gemini Omni Flash"), true);
  assert.equal(videoModelSupportsFilmDirector("Seedance 2.0 Fast"), false);
  assert.equal(videoModelSupportsFilmDirector("Wan 2.7 Reference-to-Video"), false);
  assert.equal(videoModelSupportsFilmDirector("Happy Horse"), false);
  assert.equal(videoModelSupportsFilmDirector("Luma Dream Machine"), false);
  assert.equal(videoModelSupportsFilmDirector("Creatify Aurora"), false);
});

test("Gemini Omni exposes only its supported preview controls", () => {
  assert.ok(videoModelOptions.includes(videoModelNames.geminiOmni));
  assert.deepEqual(geminiOmniResolutionOptions, ["720p"]);
  assert.deepEqual(geminiOmniAspectRatioOptions, ["16:9", "9:16"]);
  assert.equal(geminiOmniDurationOptions[0], "3 seconds");
  assert.equal(geminiOmniDurationOptions.at(-1), "10 seconds");
});

test("unsupported video models never serialize a Film Director package", () => {
  const filmDirector = { finalPrompt: "Director prompt" };
  const common = {
    prompt: "User prompt",
    workflowContext: {},
    projectId: "test",
    projectName: "Test",
    filmDirector
  };
  const unsupported = buildVideoGenerationRequest({
    ...common,
    node: { id: "fast", data: { model: "Seedance 2.0 Fast" } }
  });
  const supported = buildVideoGenerationRequest({
    ...common,
    node: { id: "kling", data: { model: "Kling O3 4K" } }
  });

  assert.equal(unsupported.filmDirector, null);
  assert.deepEqual(supported.filmDirector, filmDirector);
});

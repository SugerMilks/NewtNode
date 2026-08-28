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
  seedance25DurationOptions,
  seedance25ResolutionOptions,
  seedanceVideoDurationOptions,
  videoModelNames,
  videoModelOptions
} from "../src/modelOptions.js";
import {
  buildVideoGenerationRequest,
  filmDirectorVideoAspectRatio,
  filmDirectorVideoDuration,
  filmDirectorVideoResolution,
  videoModelSupportsFilmDirector
} from "../src/nodeRunners/videoModels.js";

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
  assert.equal(videoModelSupportsFilmDirector("Seedance 2.5"), true);
  assert.equal(videoModelSupportsFilmDirector("Kling O3 Pro"), true);
  assert.equal(videoModelSupportsFilmDirector("Kling O3 4K"), true);
  assert.equal(videoModelSupportsFilmDirector("Gemini Omni Flash"), true);
  assert.equal(videoModelSupportsFilmDirector("Wan 2.7 Reference-to-Video"), false);
  assert.equal(videoModelSupportsFilmDirector("Happy Horse"), false);
  assert.equal(videoModelSupportsFilmDirector("Creatify Aurora"), false);
});

test("Gemini Omni exposes only its supported preview controls", () => {
  assert.ok(videoModelOptions.includes(videoModelNames.geminiOmni));
  assert.deepEqual(geminiOmniResolutionOptions, ["720p"]);
  assert.deepEqual(geminiOmniAspectRatioOptions, ["16:9", "9:16"]);
  assert.equal(geminiOmniDurationOptions[0], "3 seconds");
  assert.equal(geminiOmniDurationOptions.at(-1), "10 seconds");
});

test("Seedance exposes every supported fixed duration from 4 through 15 seconds", () => {
  assert.deepEqual(
    seedanceVideoDurationOptions,
    Array.from({ length: 12 }, (_value, index) => `${index + 4} seconds`)
  );
});

test("Seedance 2.5 exposes auto and every fixed duration from 4 through 30 seconds", () => {
  assert.deepEqual(seedance25DurationOptions, [
    "Auto",
    ...Array.from({ length: 27 }, (_value, index) => `${index + 4} seconds`)
  ]);
  assert.deepEqual(seedance25ResolutionOptions, ["720p", "1080p", "480p"]);
  assert.ok(videoModelOptions.includes(videoModelNames.seedance25));
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
    node: { id: "wan", data: { model: "Wan 2.7 Reference-to-Video" } }
  });
  const supported = buildVideoGenerationRequest({
    ...common,
    node: { id: "kling", data: { model: "Kling O3 4K" } }
  });

  assert.equal(unsupported.filmDirector, null);
  assert.deepEqual(supported.filmDirector, filmDirector);
});

test("Film Director timing controls connected video generation requests", () => {
  const common = {
    prompt: "Director prompt",
    workflowContext: {},
    projectId: "test",
    projectName: "Test"
  };
  const revised = buildVideoGenerationRequest({
    ...common,
    node: { id: "seedance", data: { model: "Seedance 2.0", duration: "10 seconds" } },
    filmDirector: { durationSeconds: "5", finalPrompt: "Director prompt" }
  });
  const manual = buildVideoGenerationRequest({
    ...common,
    node: { id: "seedance-manual", data: { model: "Seedance 2.0", duration: "10 seconds" } }
  });

  assert.equal(revised.duration, "5 seconds");
  assert.equal(manual.duration, "10 seconds");
});

test("Film Director resolution controls connected video generation requests", () => {
  const request = buildVideoGenerationRequest({
    node: {
      id: "seedance",
      data: { model: "Seedance 2.0", duration: "10 seconds", resolution: "720p" }
    },
    prompt: "Director prompt",
    workflowContext: {},
    projectId: "test",
    projectName: "Test",
    filmDirector: { durationSeconds: "10", resolution: "1080p", finalPrompt: "Director prompt" }
  });

  assert.equal(request.resolution, "1080p");
});

test("Film Director aspect ratio controls connected video generation requests", () => {
  const request = buildVideoGenerationRequest({
    node: {
      id: "seedance",
      data: { model: "Seedance 2.0", duration: "10 seconds", resolution: "720p", aspectRatio: "16:9 (Landscape)" }
    },
    prompt: "Director prompt",
    workflowContext: {},
    projectId: "test",
    projectName: "Test",
    filmDirector: { durationSeconds: "10", resolution: "720p", aspectRatio: "9:16", finalPrompt: "Director prompt" }
  });

  assert.equal(request.aspectRatio, "9:16 (Portrait)");
});

test("Film Director aspect ratio respects each connected model's supported choices", () => {
  assert.equal(filmDirectorVideoAspectRatio("Seedance 2.0", "21:9", "16:9 (Landscape)"), "21:9");
  assert.equal(filmDirectorVideoAspectRatio("Seedance 2.5", "4:3", "16:9 (Landscape)"), "4:3");
  assert.equal(filmDirectorVideoAspectRatio("Kling O3 Pro", "1:1", "16:9"), "1:1");
  assert.equal(filmDirectorVideoAspectRatio("Kling O3 Pro", "4:3", "16:9"), "16:9");
  assert.equal(filmDirectorVideoAspectRatio("Gemini Omni Flash", "9:16", "16:9"), "9:16");
});

test("Film Director resolution respects fixed-resolution video models", () => {
  assert.equal(filmDirectorVideoResolution("Seedance 2.0", "4K", "720p"), "4k");
  assert.equal(filmDirectorVideoResolution("Gemini Omni Flash", "1080p", "720p"), "720p");
  assert.equal(filmDirectorVideoResolution("Kling O3 Pro", "480p", "1080p"), "1080p");
  assert.equal(filmDirectorVideoResolution("Kling O3 4K", "720p", "4K"), "4K");
});

test("Film Director timing respects each connected model's duration limits", () => {
  assert.equal(filmDirectorVideoDuration("Seedance 2.0", "20", "10 seconds"), "15 seconds");
  assert.equal(filmDirectorVideoDuration("Seedance 2.5", "30", "10 seconds"), "30 seconds");
  assert.equal(filmDirectorVideoDuration("Gemini Omni Flash", "15", "8 seconds"), "10 seconds");
  assert.equal(filmDirectorVideoDuration("Kling O3 Pro", "3", "10 seconds"), "3 seconds");
});

test("Film Director resolution never presents unsupported Seedance 2.5 output sizes", () => {
  assert.equal(filmDirectorVideoResolution("Seedance 2.5", "4K", "720p"), "720p");
  assert.equal(filmDirectorVideoResolution("Seedance 2.5", "1080p", "720p"), "1080p");
  assert.equal(filmDirectorVideoResolution("Seedance 2.5", "480p", "720p"), "480p");
});

test("removed video models are no longer selectable", () => {
  assert.equal(videoModelOptions.includes("Seedance 2.0 Fast"), false);
});

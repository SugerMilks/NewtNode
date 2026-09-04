import assert from "node:assert/strict";
import test from "node:test";

import {
  imageModelOptions,
  klingO34kAspectRatioOptions,
  klingO34kDurationOptions,
  klingO34kResolutionOptions,
  klingO3ProAspectRatioOptions,
  klingO3ProDurationOptions,
  klingO3ProResolutionOptions,
  seedance25DurationOptions,
  seedance25ResolutionOptions,
  seedanceVideoDurationOptions,
  minimaxH3AspectRatioOptions,
  minimaxH3DurationOptions,
  minimaxH3ResolutionOptions,
  videoModelNames,
  videoModelOptions
} from "../src/modelOptions.js";
import {
  buildVideoGenerationRequest,
  filmDirectorVideoAspectRatio,
  filmDirectorVideoDuration,
  filmDirectorVideoGenerateAudio,
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

test("Film Director support includes the remaining director-capable video models", () => {
  assert.equal(videoModelSupportsFilmDirector("Seedance 2.0"), true);
  assert.equal(videoModelSupportsFilmDirector("Seedance 2.5"), true);
  assert.equal(videoModelSupportsFilmDirector("Kling O3 Pro"), true);
  assert.equal(videoModelSupportsFilmDirector("Kling O3 4K"), true);
  assert.equal(videoModelSupportsFilmDirector("MiniMax H3"), true);
  assert.equal(videoModelSupportsFilmDirector("Wan Fun Control"), false);
});

test("MiniMax H3 exposes the verified Fal video controls", () => {
  assert.ok(videoModelOptions.includes(videoModelNames.minimaxH3));
  assert.deepEqual(minimaxH3DurationOptions, Array.from({ length: 11 }, (_value, index) => `${index + 5} seconds`));
  assert.deepEqual(minimaxH3ResolutionOptions, ["2K", "768P", "480P", "4K"]);
  assert.deepEqual(minimaxH3AspectRatioOptions, ["16:9", "21:9", "9:16", "1:1", "4:3", "3:4", "Adaptive"]);
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
    node: { id: "wan", data: { model: "Wan Fun Control" } }
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

test("Film Director model selection controls connected video generation requests", () => {
  const request = buildVideoGenerationRequest({
    node: {
      id: "video",
      data: { model: "Seedance 2.0", duration: "10 seconds", resolution: "720p", aspectRatio: "16:9 (Landscape)" }
    },
    prompt: "Director prompt",
    workflowContext: {},
    projectId: "test",
    projectName: "Test",
    filmDirector: {
      videoModel: "Kling O3 4K",
      durationSeconds: "8",
      resolution: "720p",
      aspectRatio: "16:9",
      finalPrompt: "Director prompt"
    }
  });

  assert.equal(request.model, "Kling O3 4K");
  assert.equal(request.duration, "8 seconds");
  assert.equal(request.resolution, "4K");
  assert.equal(request.aspectRatio, "16:9");
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

test("Film Director audio mode controls connected video generation requests", () => {
  const silent = buildVideoGenerationRequest({
    node: { id: "seedance", data: { model: "Seedance 2.5", generateAudio: true } },
    prompt: "Director prompt",
    workflowContext: {},
    projectId: "test",
    projectName: "Test",
    filmDirector: { audioMode: "silent", finalPrompt: "Director prompt" }
  });
  const production = buildVideoGenerationRequest({
    node: { id: "seedance", data: { model: "Seedance 2.5", generateAudio: false } },
    prompt: "Director prompt",
    workflowContext: {},
    projectId: "test",
    projectName: "Test",
    filmDirector: { audioMode: "production", finalPrompt: "Director prompt" }
  });

  assert.equal(silent.generateAudio, false);
  assert.equal(production.generateAudio, true);
  assert.equal(filmDirectorVideoGenerateAudio("silent", true), false);
  assert.equal(filmDirectorVideoGenerateAudio("full", false), true);
});

test("Film Director aspect ratio respects each connected model's supported choices", () => {
  assert.equal(filmDirectorVideoAspectRatio("Seedance 2.0", "21:9", "16:9 (Landscape)"), "21:9");
  assert.equal(filmDirectorVideoAspectRatio("Seedance 2.5", "4:3", "16:9 (Landscape)"), "4:3");
  assert.equal(filmDirectorVideoAspectRatio("Kling O3 Pro", "1:1", "16:9"), "1:1");
  assert.equal(filmDirectorVideoAspectRatio("Kling O3 Pro", "4:3", "16:9"), "16:9");
  assert.equal(filmDirectorVideoAspectRatio("MiniMax H3", "4:3", "16:9"), "4:3");
});

test("Film Director resolution respects fixed-resolution video models", () => {
  assert.equal(filmDirectorVideoResolution("Seedance 2.0", "4K", "720p"), "4k");
  assert.equal(filmDirectorVideoResolution("Kling O3 Pro", "480p", "1080p"), "1080p");
  assert.equal(filmDirectorVideoResolution("Kling O3 4K", "720p", "4K"), "4K");
  assert.equal(filmDirectorVideoResolution("MiniMax H3", "4K", "2K"), "4K");
});

test("Film Director timing respects each connected model's duration limits", () => {
  assert.equal(filmDirectorVideoDuration("Seedance 2.0", "20", "10 seconds"), "15 seconds");
  assert.equal(filmDirectorVideoDuration("Seedance 2.5", "30", "10 seconds"), "30 seconds");
  assert.equal(filmDirectorVideoDuration("Kling O3 Pro", "3", "10 seconds"), "3 seconds");
  assert.equal(filmDirectorVideoDuration("MiniMax H3", "20", "10 seconds"), "15 seconds");
});

test("Film Director resolution never presents unsupported Seedance 2.5 output sizes", () => {
  assert.equal(filmDirectorVideoResolution("Seedance 2.5", "4K", "720p"), "720p");
  assert.equal(filmDirectorVideoResolution("Seedance 2.5", "1080p", "720p"), "1080p");
  assert.equal(filmDirectorVideoResolution("Seedance 2.5", "480p", "720p"), "480p");
});

test("removed video models are no longer selectable", () => {
  assert.deepEqual(videoModelOptions, [
    videoModelNames.seedance,
    videoModelNames.seedance25,
    videoModelNames.klingO3Pro,
    videoModelNames.klingO34k,
    videoModelNames.minimaxH3
  ]);
  assert.equal(imageModelOptions.length, 5);
});

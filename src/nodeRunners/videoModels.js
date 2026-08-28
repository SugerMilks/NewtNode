import { workflowContextPayload } from "../workflowContext.js";
import { isGeminiOmniModel } from "../geminiOmni.js";
import {
  geminiOmniDurationOptions,
  geminiOmniAspectRatioOptions,
  geminiOmniResolutionOptions,
  klingO3ProAspectRatioOptions,
  klingO3ProDurationOptions,
  klingO34kResolutionOptions,
  klingO3ProResolutionOptions,
  seedance25DurationOptions,
  seedance25AspectRatioOptions,
  seedance25ResolutionOptions,
  seedanceVideoAspectRatioOptions,
  seedanceVideoDurationOptions,
  seedanceVideoResolutionOptions
} from "../modelOptions.js";
import { isSeedance25Model } from "../seedance25.js";

export function videoModelSupportsFilmDirector(model) {
  const normalized = String(model || "").toLowerCase();
  const isSeedance = normalized.includes("seedance");
  const isKlingO3 = normalized.includes("kling") && (normalized.includes("o3") || normalized.includes("03"));
  return isSeedance || isKlingO3 || isGeminiOmniModel(model);
}

export function filmDirectorVideoDuration(model, durationSeconds, fallback = "") {
  const normalizedModel = String(model || "").toLowerCase();
  const options = isGeminiOmniModel(model)
    ? geminiOmniDurationOptions
    : isSeedance25Model(model)
      ? seedance25DurationOptions.filter((option) => option !== "Auto")
    : normalizedModel.includes("kling") && (normalizedModel.includes("o3") || normalizedModel.includes("03"))
      ? klingO3ProDurationOptions
      : normalizedModel.includes("seedance")
        ? seedanceVideoDurationOptions
        : [];
  if (!options.length) return fallback;

  const requestedSeconds = Number.parseInt(String(durationSeconds || "").match(/\d+/)?.[0] || "", 10);
  if (!Number.isFinite(requestedSeconds)) return options.includes(fallback) ? fallback : options[0];

  const requestedLabel = `${requestedSeconds} seconds`;
  if (options.includes(requestedLabel)) return requestedLabel;

  return options.reduce((closest, option) => {
    const optionSeconds = Number.parseInt(option, 10);
    const closestSeconds = Number.parseInt(closest, 10);
    const optionDistance = Math.abs(optionSeconds - requestedSeconds);
    const closestDistance = Math.abs(closestSeconds - requestedSeconds);
    return optionDistance < closestDistance || (optionDistance === closestDistance && optionSeconds < closestSeconds)
      ? option
      : closest;
  }, options[0]);
}

export function filmDirectorVideoResolution(model, resolution, fallback = "") {
  const normalizedModel = String(model || "").toLowerCase();
  const options = isGeminiOmniModel(model)
    ? geminiOmniResolutionOptions
    : isSeedance25Model(model)
      ? seedance25ResolutionOptions
    : normalizedModel.includes("kling") && (normalizedModel.includes("o3") || normalizedModel.includes("03"))
      ? normalizedModel.includes("4k") ? klingO34kResolutionOptions : klingO3ProResolutionOptions
      : normalizedModel.includes("seedance")
        ? seedanceVideoResolutionOptions
        : [];
  if (!options.length) return fallback;

  const requested = String(resolution || "").trim().toLowerCase();
  const exact = options.find((option) => option.toLowerCase() === requested);
  if (exact) return exact;

  const normalizedFallback = String(fallback || "").trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === normalizedFallback) || options[0];
}

export function filmDirectorVideoAspectRatio(model, aspectRatio, fallback = "") {
  const normalizedModel = String(model || "").toLowerCase();
  const options = isGeminiOmniModel(model)
    ? geminiOmniAspectRatioOptions
    : isSeedance25Model(model)
      ? seedance25AspectRatioOptions.filter((option) => option !== "Auto")
      : normalizedModel.includes("kling") && (normalizedModel.includes("o3") || normalizedModel.includes("03"))
        ? klingO3ProAspectRatioOptions
        : normalizedModel.includes("seedance")
          ? seedanceVideoAspectRatioOptions
          : [];
  if (!options.length) return fallback;

  const ratioFor = (value) => String(value || "").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "";
  const requested = ratioFor(aspectRatio);
  const exact = options.find((option) => ratioFor(option) === requested);
  if (exact) return exact;

  const normalizedFallback = ratioFor(fallback);
  return options.find((option) => ratioFor(option) === normalizedFallback) || options[0];
}

export function buildVideoGenerationRequest({
  node,
  prompt,
  workflowContext,
  projectId,
  projectName,
  startFrameUrls = [],
  endFrameUrls = [],
  referenceImageUrls = [],
  referenceImageLabels = [],
  characterReferenceUrls = [],
  characterReferenceLabels = [],
  referenceVideoUrls = [],
  referenceVideoLabels = [],
  referenceAudioUrls = [],
  filmDirector = null
}) {
  const activeFilmDirector = videoModelSupportsFilmDirector(node.data.model) ? filmDirector : null;
  return {
    prompt,
    model: node.data.model,
    duration: activeFilmDirector
      ? filmDirectorVideoDuration(node.data.model, activeFilmDirector.durationSeconds, node.data.duration)
      : node.data.duration,
    resolution: activeFilmDirector
      ? filmDirectorVideoResolution(node.data.model, activeFilmDirector.resolution, node.data.resolution)
      : node.data.resolution,
    aspectRatio: activeFilmDirector
      ? filmDirectorVideoAspectRatio(node.data.model, activeFilmDirector.aspectRatio, node.data.aspectRatio)
      : node.data.aspectRatio,
    generateAudio: node.data.generateAudio,
    klingCfgScale: node.data.klingCfgScale ?? 0.5,
    negativePrompt: node.data.negativePrompt || "",
    seed: node.data.seed || "",
    enableSafetyChecker: node.data.enableSafetyChecker !== false,
    startFrameUrls,
    endFrameUrls,
    referenceImageUrls,
    referenceImageLabels,
    characterReferenceUrls,
    characterReferenceLabels,
    referenceVideoUrls,
    referenceVideoLabels,
    referenceAudioUrls,
    filmDirector: activeFilmDirector,
    wan27Reference: {
      negativePrompt: node.data.negativePrompt || "",
      multiShots: Boolean(node.data.multiShots)
    },
    wanFunControl: {
      preprocessVideo: node.data.preprocessVideo !== false,
      preprocessType: node.data.preprocessType || "depth",
      matchInputNumFrames: node.data.matchInputNumFrames !== false,
      numFrames: node.data.numFrames || 81,
      matchInputFps: node.data.matchInputFps !== false,
      fps: node.data.fps || 16,
      numInferenceSteps: node.data.numInferenceSteps || 27,
      guidanceScale: node.data.guidanceScale || 6,
      shift: node.data.shift || 5,
      seed: node.data.seed || ""
    },
    ...workflowContextPayload(workflowContext, projectId, projectName),
    nodeId: node.id,
    nodeTitle: node.data.title
  };
}

export function normalizeVideoGenerationResult(data, index) {
  return {
    url: data.video.localUrl,
    type: "video",
    label: `Video ${index + 1}`,
    seed: data.seed,
    cost: data.cost
  };
}

export function buildUtilityVideoRequest({
  node,
  prompt,
  model,
  workflowContext,
  projectId,
  projectName,
  referenceImageUrls = [],
  referenceVideoUrls = [],
  maskVideoUrls = [],
  colorIdMatte,
  compositeVideo,
  voidNumFrames
}) {
  return {
    prompt,
    model,
    referenceImageUrls,
    referenceVideoUrls,
    maskVideoUrls,
    extractFrame: {
      frameTime: node.data.extractFrameTime ?? 0,
      format: node.data.extractFrameFormat || "png"
    },
    wanFunControl: {
      preprocessVideo: node.data.preprocessVideo !== false,
      preprocessType: node.data.preprocessType || "depth",
      matchInputNumFrames: node.data.matchInputNumFrames !== false,
      numFrames: node.data.numFrames || 81,
      matchInputFps: node.data.matchInputFps !== false,
      fps: node.data.fps || 16,
      numInferenceSteps: node.data.numInferenceSteps || 27,
      guidanceScale: node.data.guidanceScale || 6,
      shift: node.data.shift || 5,
      seed: node.data.seed || ""
    },
    sam3Video: {
      detectionThreshold: node.data.sam3VideoDetectionThreshold ?? 0.5
    },
    colorIdMatte,
    compositeVideo,
    wanVaceMaskToVideo: {
      negativePrompt: node.data.wanVaceNegativePrompt || "",
      matchInputNumFrames: node.data.wanVaceMatchInputNumFrames !== false,
      numFrames: node.data.wanVaceNumFrames || 81,
      matchInputFps: node.data.wanVaceMatchInputFps !== false,
      fps: node.data.wanVaceFps || 16,
      resolution: node.data.wanVaceResolution || "720p",
      aspectRatio: node.data.wanVaceAspectRatio || "auto",
      numInferenceSteps: node.data.wanVaceNumInferenceSteps || 30,
      guidanceScale: node.data.wanVaceGuidanceScale || 5,
      sampler: node.data.wanVaceSampler || "unipc",
      shift: node.data.wanVaceShift || 5,
      enableSafetyChecker: node.data.wanVaceEnableSafetyChecker !== false,
      enablePromptExpansion: Boolean(node.data.wanVaceEnablePromptExpansion),
      preprocess: Boolean(node.data.wanVacePreprocess),
      acceleration: node.data.wanVaceAcceleration || "regular",
      videoQuality: node.data.wanVaceVideoQuality || "high",
      videoWriteMode: node.data.wanVaceVideoWriteMode || "balanced",
      numInterpolatedFrames: node.data.wanVaceNumInterpolatedFrames || 0
    },
    wanVaceInpainting: {
      negativePrompt: node.data.wanVaceNegativePrompt || "",
      matchInputNumFrames: node.data.wanVaceMatchInputNumFrames !== false,
      numFrames: node.data.wanVaceNumFrames || 81,
      matchInputFps: node.data.wanVaceMatchInputFps !== false,
      fps: node.data.wanVaceFps || 16,
      resolution: node.data.wanVaceResolution || "720p",
      aspectRatio: node.data.wanVaceAspectRatio || "auto",
      numInferenceSteps: node.data.wanVaceNumInferenceSteps || 30,
      guidanceScale: node.data.wanVaceGuidanceScale || 5,
      sampler: node.data.wanVaceSampler || "unipc",
      shift: node.data.wanVaceShift || 5,
      enableSafetyChecker: node.data.wanVaceEnableSafetyChecker !== false,
      enablePromptExpansion: Boolean(node.data.wanVaceEnablePromptExpansion),
      preprocess: Boolean(node.data.wanVacePreprocess),
      acceleration: node.data.wanVaceAcceleration || "regular",
      videoQuality: node.data.wanVaceVideoQuality || "high",
      videoWriteMode: node.data.wanVaceVideoWriteMode || "balanced",
      numInterpolatedFrames: node.data.wanVaceNumInterpolatedFrames || 0
    },
    voidVideoInpainting: {
      maskPrompt: node.data.voidMaskPrompt || "",
      enablePass2Refinement: Boolean(node.data.voidPass2Refinement),
      negativePrompt: node.data.voidNegativePrompt || "",
      numInferenceSteps: node.data.voidNumInferenceSteps || 30,
      guidanceScale: node.data.voidGuidanceScale || 1,
      strength: node.data.voidStrength || 1,
      numFrames: voidNumFrames,
      enableSafetyChecker: node.data.voidEnableSafetyChecker !== false,
      seed: node.data.voidSeed || ""
    },
    rifeVideo: {
      numFrames: node.data.rifeNumFrames || 1,
      useSceneDetection: node.data.rifeUseSceneDetection !== false,
      useCalculatedFps: node.data.rifeUseCalculatedFps !== false,
      fps: node.data.rifeFps || 24,
      loop: Boolean(node.data.rifeLoop)
    },
    bytedanceVideoUpscaler: {
      targetResolution: node.data.bytedanceUpscalerTargetResolution || "1080p",
      targetFps: node.data.bytedanceUpscalerTargetFps || "30fps",
      enhancementPreset: node.data.bytedanceUpscalerPreset || "general",
      enhancementTier: node.data.bytedanceUpscalerTier || "standard",
      fidelity: node.data.bytedanceUpscalerFidelity || "high",
      scaleRatio: node.data.bytedanceUpscalerScaleRatio || ""
    },
    topazVideoUpscaler: {
      model: node.data.topazUpscalerModel || "Proteus",
      upscaleFactor: node.data.topazUpscalerFactor || 2,
      targetFps: node.data.topazUpscalerTargetFps === "source" ? "" : node.data.topazUpscalerTargetFps || "",
      billingResolutionTier: node.data.topazUpscalerBillingTier || "auto",
      h264Output: Boolean(node.data.topazUpscalerH264Output),
      compression: node.data.topazUpscalerCompression ?? "",
      noise: node.data.topazUpscalerNoise ?? "",
      halo: node.data.topazUpscalerHalo ?? "",
      grain: node.data.topazUpscalerGrain ?? "",
      recoverDetail: node.data.topazUpscalerRecoverDetail ?? ""
    },
    birefnet: {
      model: node.data.birefnetModel || "General Use (Light)",
      operatingResolution: node.data.birefnetOperatingResolution || "1024x1024",
      outputMask: Boolean(node.data.birefnetOutputMask),
      refineForeground: node.data.birefnetRefineForeground !== false,
      outputFormat: node.data.birefnetOutputFormat || "png",
      maskOnly: Boolean(node.data.birefnetMaskOnly),
      videoOutputType: node.data.birefnetVideoOutputType || "X264 (.mp4)",
      videoQuality: node.data.birefnetVideoQuality || "high",
      videoWriteMode: node.data.birefnetVideoWriteMode || "balanced"
    },
    ...workflowContextPayload(workflowContext, projectId, projectName),
    nodeId: node.id,
    nodeTitle: node.data.title
  };
}

export function normalizeUtilityVideoGenerationResult(data, index) {
  if (data.image?.localUrl) {
    return {
      url: data.image.localUrl,
      type: "image",
      label: data.image.label || data.modelName || `Frame ${index + 1}`,
      text: data.text || "",
      cost: data.cost
    };
  }

  if (Array.isArray(data.videos) && data.videos.length) {
    return data.videos
      .filter((video) => video?.localUrl)
      .map((video, itemIndex) => ({
        url: video.localUrl,
        type: "video",
        label: video.label || `${data.modelName || "Video"} ${itemIndex + 1}`,
        seed: data.seed,
        cost: itemIndex === 0 ? data.cost : null
      }));
  }

  return {
    url: data.video.localUrl,
    type: "video",
    label: data.modelName || `Video ${index + 1}`,
    seed: data.seed,
    cost: data.cost
  };
}

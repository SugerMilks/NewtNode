import "dotenv/config";

import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { File } from "node:buffer";
import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fal } from "@fal-ai/client";
import ffmpegStaticPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { directoryStats, fileMetadata, readJsonFile, writeJsonAtomic } from "./json-store.js";
import { registerComposerPoseRoutes } from "./routes/composerPoses.js";
import { registerCoreRoutes } from "./routes/core.js";
import "./restart-marker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(rootDir, "uploads");
const outputsDir = path.join(rootDir, "outputs");
const savedWorkflowsDir = path.join(rootDir, "saved_workflows");
const workflowAssetsPrefix = "/workflow-assets";
const workflowPackageInputDirName = "inputs";
const workflowPackageOutputDirName = "outputs";
const workflowPackageDependencyDirName = "dependencies";
const workflowPackageMetadataDirName = ".newtnode";
const workflowPackageManifestFileName = "manifest.json";
const composerPosesDir = path.join(rootDir, "public", "models", "poses");
const dataDir = path.join(__dirname, "data");
const historyPath = path.join(dataDir, "history.json");
const falDebugLogPath = path.join(dataDir, "fal-debug.log");
const nodeProjectsPath = path.join(dataDir, "node-projects.json");
const historyIndexPath = path.join(dataDir, "history-index.json");
const workflowIndexPath = path.join(dataDir, "workflow-index.json");
const recentWorkflowsPath = path.join(dataDir, "recent-workflows.json");
const legacyHiddenWorkflowsPath = path.join(dataDir, "hidden-workflows.json");
const runtimeSettingsPath = path.join(dataDir, "runtime-settings.json");
const envFilePath = path.join(rootDir, ".env");
const moodBoardOutputFileName = "MOOD_BOARD.png";
const maxHistoryItems = 500;
let historyWriteQueue = Promise.resolve();
let updatePromise = null;
let restartRequested = false;
const execFile = promisify(execFileCallback);
const updateRepositoryEnvKey = "NEWTNODE_UPDATE_REPOSITORY";
const runtimeConfigSources = {
  FAL_KEY: process.env.FAL_KEY ? "runtime" : "",
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? "runtime" : "",
  [updateRepositoryEnvKey]: process.env[updateRepositoryEnvKey] ? "runtime" : ""
};
const ffmpegBinaryPath = process.env.FFMPEG_PATH || ffmpegStaticPath || "ffmpeg";
const ffprobeBinaryPath = process.env.FFPROBE_PATH || ffprobeStatic?.path || "ffprobe";
const port = Number(process.env.PORT || 3336);
const seedanceStandardCostPerSecond = Number(process.env.SEEDANCE_STANDARD_COST_PER_SECOND || 0.3034);
const seedanceFastCostPerSecond = Number(process.env.SEEDANCE_FAST_COST_PER_SECOND || 0.2419);
const happyHorse720pCostPerSecond = Number(process.env.HAPPY_HORSE_720P_COST_PER_SECOND || 0.14);
const happyHorse1080pCostPerSecond = Number(process.env.HAPPY_HORSE_1080P_COST_PER_SECOND || 0.28);
const seedanceBillingFps = Number(process.env.SEEDANCE_BILLING_FPS || 24);
const seedanceStandardCostPerThousandTokens = Number(process.env.SEEDANCE_STANDARD_COST_PER_1000_TOKENS || 0.014);
const seedanceFastCostPerThousandTokens = Number(process.env.SEEDANCE_FAST_COST_PER_1000_TOKENS || (seedanceFastCostPerSecond / 21.6));
const nanoBananaCost1K2K = Number(process.env.NANO_BANANA_IMAGE_COST_1K_2K || 0.15);
const nanoBananaCost4K = Number(process.env.NANO_BANANA_IMAGE_COST_4K || 0.3);
const zImageCostPerMegapixel = Number(process.env.Z_IMAGE_COST_PER_MEGAPIXEL || 0.005);
const openAiImage2MediumCost = Number(process.env.OPENAI_IMAGE_2_MEDIUM_COST || 0.053);
const lumaPhotonCostPerMegapixel = Number(process.env.LUMA_PHOTON_COST_PER_MEGAPIXEL || 0.019);
const lumaRay2BaseCostPerFiveSeconds = Number(process.env.LUMA_RAY2_COST_PER_5_SECONDS || 0.5);
const hunyuan3DProBaseCost = Number(process.env.HUNYUAN_3D_PRO_BASE_COST || 0.375);
const hunyuan3DProAddOnCost = Number(process.env.HUNYUAN_3D_PRO_ADD_ON_COST || 0.15);
const nanoImageAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"];
const openAiImageAspectRatios = nanoImageAspectRatios;
const lumaImageAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "9:21"];
const lumaVideoAspectRatios = ["16:9", "9:16", "4:3", "3:4", "21:9", "9:21"];
const imageModelNames = {
  zImage: "Z-Image",
  nanoBananaPro: "Nano Banana Pro",
  openAiImage2: "OpenAI Image 2",
  lumaDreamMachine: "Luma Dream Machine"
};
const imageModelOptions = [
  imageModelNames.zImage,
  imageModelNames.nanoBananaPro,
  imageModelNames.openAiImage2,
  imageModelNames.lumaDreamMachine
];
const videoModelNames = {
  seedance: "Seedance 2.0",
  seedanceFast: "Seedance 2.0 Fast",
  wan27Reference: "Wan 2.7 Reference-to-Video",
  happyHorse: "Happy Horse",
  lumaDreamMachine: "Luma Dream Machine",
  aurora: "Creatify Aurora"
};
const videoModelOptions = [
  videoModelNames.seedance,
  videoModelNames.seedanceFast,
  videoModelNames.wan27Reference,
  videoModelNames.happyHorse,
  videoModelNames.lumaDreamMachine,
  videoModelNames.aurora
];
const defaultModelPreferences = {
  image: Object.fromEntries(imageModelOptions.map((model) => [model, model === imageModelNames.zImage])),
  video: Object.fromEntries(videoModelOptions.map((model) => [model, true]))
};
const falNanoBananaProEndpoint = process.env.FAL_NANO_BANANA_PRO_ENDPOINT || "fal-ai/nano-banana-pro";
const falZImageEndpoint = process.env.FAL_Z_IMAGE_ENDPOINT || "fal-ai/z-image/turbo";
const falLumaPhotonEndpoint = process.env.FAL_LUMA_PHOTON_ENDPOINT || "fal-ai/luma-photon";
const falLumaRay2Endpoint = process.env.FAL_LUMA_RAY2_ENDPOINT || "fal-ai/luma-dream-machine/ray-2";
const falTextRequestCost = Number(process.env.FAL_TEXT_REQUEST_COST || 0.001);
const falVisionTextUnitCost = Number(process.env.FAL_VISION_TEXT_UNIT_COST || 0.01);
const falVideoTextUnitCost = Number(process.env.FAL_VIDEO_TEXT_UNIT_COST || 0.01);
const wanFunControlCostPerSecond = 0.1;
const wan27ReferenceVideoCostPerSecond = Number(process.env.WAN_2_7_REFERENCE_VIDEO_COST_PER_SECOND || 0.1);
const wanVaceCostPerSecond = {
  "480p": 0.04,
  "580p": 0.06,
  "720p": 0.08
};
const voidVideoInpaintingBaseCost = 0.05;
const voidVideoInpaintingPass2Cost = 0.05;
const voidVideoInpaintingSam3QuadMaskCost = 0.05;
const sam3ImageCostPerRequest = 0.005;
const sam3VideoCostPer16Frames = 0.005;
const aurora480pCostPerSecond = 0.07;
const aurora720pCostPerSecond = 0.14;
const bytedanceUpscalerCostPerSecond = {
  "1080p": 0.0072,
  "2k": 0.0144,
  "4k": 0.0288
};
const topazUpscalerCostPerSecond = {
  "up-to-720p": 0.01,
  "720p-1080p": 0.02,
  "above-1080p": 0.08
};
const dwposeCostPerComputeSecond = 0.0006;
const patinaBaseCost = 0.01;
const patinaMapCostPerMegapixel = 0.01;
const falUtilityImageTimeoutMs = Math.max(30000, Number(process.env.FAL_UTILITY_IMAGE_TIMEOUT_MS) || 180000);
const openAiTextModel = process.env.OPENAI_TEXT_MODEL || "gpt-5.5";
const openAiTextApiKey = process.env.OPENAI_TEXT_API_KEY || process.env.OPENAI_API_KEY;
const textLlmProvider = String(process.env.TEXT_LLM_PROVIDER || "fal").toLowerCase();
const falTextModel = process.env.FAL_TEXT_MODEL || "openai/gpt-4o";
const falVisionTextModel = process.env.FAL_VISION_TEXT_MODEL || "google/gemini-2.5-flash";
const falVisionTextFallbackModel = process.env.FAL_VISION_TEXT_FALLBACK_MODEL || "google/gemini-2.5-flash";
const falVideoTextModel = process.env.FAL_VIDEO_TEXT_MODEL || "google/gemini-2.5-flash";
const sam3SegmentationModelsEnabled = false; // Flip back to true when revisiting SAM 3 segmentation.
const birefnetModelOptions = ["General Use (Light)", "General Use (Light 2K)", "General Use (Heavy)", "Matting", "Portrait", "General Use (Dynamic)"];
const birefnetResolutionOptions = ["1024x1024", "2048x2048", "2304x2304"];
const voidVideoFrameOptions = [69, 77, 85, 93, 101, 109, 117, 125, 133, 141, 149, 157, 165, 173, 181, 189, 197];
const bytedanceUpscalerResolutionOptions = ["1080p", "2k", "4k"];
const bytedanceUpscalerFpsOptions = ["30fps", "60fps"];
const bytedanceUpscalerPresetOptions = ["general", "ugc", "short_series", "aigc", "old_film"];
const bytedanceUpscalerTierOptions = ["fast", "standard", "pro"];
const bytedanceUpscalerFidelityOptions = ["high", "medium"];
const topazUpscalerModelOptions = [
  "Proteus",
  "Artemis HQ",
  "Artemis MQ",
  "Artemis LQ",
  "Nyx",
  "Nyx Fast",
  "Nyx XL",
  "Nyx HF",
  "Gaia HQ",
  "Gaia CG",
  "Gaia 2",
  "Starlight Precise 1",
  "Starlight Precise 2",
  "Starlight Precise 2.5",
  "Starlight HQ",
  "Starlight Mini",
  "Starlight Sharp",
  "Starlight Fast 1",
  "Starlight Fast 2"
];
const topazUpscalerBillingTierOptions = ["auto", "up-to-720p", "720p-1080p", "above-1080p"];
const composerPoseFieldKeys = [
  "leftUpperArm",
  "leftUpperArmX",
  "leftUpperArmY",
  "leftUpperArmZ",
  "leftLowerArm",
  "leftLowerArmX",
  "leftLowerArmY",
  "leftLowerArmZ",
  "rightUpperArm",
  "rightUpperArmX",
  "rightUpperArmY",
  "rightUpperArmZ",
  "rightLowerArm",
  "rightLowerArmX",
  "rightLowerArmY",
  "rightLowerArmZ",
  "leftUpperLeg",
  "leftUpperLegX",
  "leftUpperLegY",
  "leftUpperLegZ",
  "leftLowerLeg",
  "leftLowerLegX",
  "leftLowerLegY",
  "leftLowerLegZ",
  "rightUpperLeg",
  "rightUpperLegX",
  "rightUpperLegY",
  "rightUpperLegZ",
  "rightLowerLeg",
  "rightLowerLegX",
  "rightLowerLegY",
  "rightLowerLegZ",
  "leftHandRotX",
  "leftHandRotY",
  "leftHandRotZ",
  "rightHandRotX",
  "rightHandRotY",
  "rightHandRotZ",
  "headRotX",
  "headRotY",
  "headRotZ",
  "upperBodyRotX",
  "upperBodyRotY",
  "upperBodyRotZ",
  "lean"
];

const app = express();

await Promise.all([
  mkdir(uploadsDir, { recursive: true }),
  mkdir(outputsDir, { recursive: true }),
  mkdir(savedWorkflowsDir, { recursive: true }),
  mkdir(composerPosesDir, { recursive: true }),
  mkdir(dataDir, { recursive: true })
]);

await refreshRuntimeConfigFromEnvFile();

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadsDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "upload";
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${basename}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
    files: 11
  }
});

app.use(cors());
app.use(express.json({ limit: "16mb" }));
app.use("/uploads", express.static(uploadsDir));
app.use("/outputs", express.static(outputsDir));
app.use("/api", async (_req, _res, next) => {
  try {
    await refreshRuntimeConfigFromEnvFile();
    next();
  } catch (error) {
    next(error);
  }
});
registerCoreRoutes(app, {
  safeRelativeAssetPath,
  resolveLocalAssetPath,
  workflowPackagePublicPath,
  selectFolderWithDialog,
  selectWorkflowFileWithDialog,
  readWorkflowFromFilePath,
  buildHealthPayload,
  timedApi,
  buildStorageDiagnostics,
  readRuntimeSettings,
  saveRuntimeSettings,
  pullRuntimeUpdate,
  requestServerRestart
});

registerComposerPoseRoutes(app, {
  composerPosesDir,
  readComposerPoses,
  normalizeComposerPose,
  safeComposerPoseFileName,
  uniqueComposerPoseFileName
});

function buildHealthPayload() {
  const apiKeysFound = Boolean(process.env.FAL_KEY || process.env.GOOGLE_API_KEY);
  return {
    ok: true,
    routes: {
      utilityImage: true,
      utilityVideo: true,
      colorIdMatte: true,
      colorIdVideoMatte: true,
      compositeVideo: true,
      wanVaceMaskToVideo: true,
      wanVaceInpainting: true,
      composerFrame: true,
      composerPoses: true,
      apiJsonErrors: true,
      voidFrameValidation: true,
      sam3VideoMaskOutput: true,
      extractVideoFrame: true,
      generate3d: true,
      settings: true
    },
    ffmpeg: {
      configured: Boolean(ffmpegBinaryPath),
      bundled: Boolean(ffmpegStaticPath),
      binary: ffmpegBinaryPath ? path.basename(ffmpegBinaryPath) : "",
      ffprobeConfigured: Boolean(ffprobeBinaryPath),
      ffprobeBundled: Boolean(ffprobeStatic?.path)
    },
    falKeyConfigured: Boolean(process.env.FAL_KEY),
    googleApiKeyConfigured: Boolean(process.env.GOOGLE_API_KEY),
    apiKeysFound,
    apiKeyStatus: apiKeysFound ? "API keys configured" : "No API keys found",
    googleImageModelsUseGoogleDirect: Boolean(process.env.GOOGLE_API_KEY),
    falZImageEndpoint,
    falNanoBananaProEndpoint,
    falLumaPhotonEndpoint,
    falLumaRay2Endpoint,
    openAiKeyConfigured: Boolean(process.env.OPENAI_API_KEY || openAiTextApiKey),
    openAiTextKeyConfigured: Boolean(openAiTextApiKey),
    openAiImage2ViaFalConfigured: Boolean(process.env.FAL_KEY),
    textLlmProvider,
    falTextModel,
    falVisionTextModel,
    falVideoTextModel,
    outputDirectory: outputsDir
  };
}

async function readRuntimeSettings({ includeSecrets = false } = {}) {
  const [repository, branch, settingsValues] = await Promise.all([
    resolveUpdateRepository(),
    currentGitBranch(),
    readRuntimeSettingsStore()
  ]);
  const branchStatus = await resolveBranchStatus(repository, branch);
  const apiKeysFound = Boolean(process.env.FAL_KEY || process.env.GOOGLE_API_KEY);

  const payload = {
    falKeyConfigured: Boolean(process.env.FAL_KEY),
    googleApiKeyConfigured: Boolean(process.env.GOOGLE_API_KEY),
    apiKeysFound,
    apiKeyStatus: apiKeysFound ? "API keys configured" : "No API keys found",
    keySources: {
      fal: runtimeConfigSources.FAL_KEY || "",
      google: runtimeConfigSources.GOOGLE_API_KEY || ""
    },
    repository,
    branch,
    branchStatus,
    modelPreferences: normalizeModelPreferences(settingsValues.modelPreferences),
    updateInProgress: Boolean(updatePromise),
    restartRequested
  };

  if (includeSecrets) {
    payload.secrets = {
      falKey: settingsValues.falKey || "",
      googleApiKey: settingsValues.googleApiKey || ""
    };
  }

  return payload;
}

async function saveRuntimeSettings(body = {}) {
  const falKey = submittedRuntimeSetting(body.falKey);
  const googleApiKey = submittedRuntimeSetting(body.googleApiKey);
  const repository = normalizeUpdateRepository(body.repository);
  const updates = {};

  if (falKey !== undefined) updates.falKey = falKey;
  if (googleApiKey !== undefined) updates.googleApiKey = googleApiKey;
  if (repository) updates.repository = repository;
  if (body.modelPreferences !== undefined) updates.modelPreferences = normalizeModelPreferences(body.modelPreferences);

  if (Object.keys(updates).length) {
    await writeRuntimeSettingsStore(updates);
  }

  await refreshRuntimeConfigFromEnvFile();
  return readRuntimeSettings();
}

async function pullRuntimeUpdate(body = {}) {
  if (updatePromise) {
    const error = new Error("An update is already running.");
    error.status = 409;
    throw error;
  }

  const repository = normalizeUpdateRepository(body.repository) || await resolveUpdateRepository();
  if (!repository) {
    const error = new Error("Enter a repository URL before updating.");
    error.status = 400;
    throw error;
  }

  if (normalizeUpdateRepository(body.repository)) {
    await writeRuntimeSettingsStore({ repository });
    await refreshRuntimeConfigFromEnvFile();
  }

  const branch = await currentGitBranch() || "main";
  const startedAt = new Date().toISOString();
  updatePromise = execFile("git", ["pull", "--ff-only", repository, branch], {
    cwd: rootDir,
    timeout: 300000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });

  try {
    const { stdout = "", stderr = "" } = await updatePromise;
    return {
      ok: true,
      repository,
      branch,
      branchStatus: await resolveBranchStatus(repository, branch),
      startedAt,
      finishedAt: new Date().toISOString(),
      stdout: String(stdout).trim(),
      stderr: String(stderr).trim()
    };
  } catch (error) {
    error.status = error.status || 500;
    throw error;
  } finally {
    updatePromise = null;
  }
}

async function requestServerRestart() {
  if (!restartRequested) {
    restartRequested = true;
    const restartDelayMs = 650;
    const timer = setTimeout(() => {
      console.log("NewtNode server restart requested from settings panel.");
      writeRestartMarker().catch((error) => {
        console.error("Failed to write restart marker.", error);
        restartRequested = false;
      });
    }, restartDelayMs);
    timer.unref?.();

    return {
      ok: true,
      scheduled: true,
      delayMs: restartDelayMs
    };
  }

  return {
    ok: true,
    scheduled: true,
    delayMs: 0
  };
}

async function refreshRuntimeConfigFromEnvFile() {
  const [envValues, settingsValues] = await Promise.all([
    readEnvFileValues(["FAL_KEY", "GOOGLE_API_KEY", updateRepositoryEnvKey]),
    readRuntimeSettingsStore()
  ]);

  applyRuntimeConfigValue("FAL_KEY", envValues.FAL_KEY, settingsValues.falKey, { preferSettings: true });
  applyRuntimeConfigValue("GOOGLE_API_KEY", envValues.GOOGLE_API_KEY, settingsValues.googleApiKey, { preferSettings: true });
  applyRuntimeConfigValue(updateRepositoryEnvKey, envValues[updateRepositoryEnvKey], settingsValues.repository);

  if (process.env.FAL_KEY) {
    fal.config({ credentials: process.env.FAL_KEY });
  }
}

async function readRuntimeSettingsStore() {
  const data = await readJsonFile(runtimeSettingsPath, {});
  return {
    falKey: optionalRuntimeSetting(data?.falKey) || "",
    googleApiKey: optionalRuntimeSetting(data?.googleApiKey) || "",
    repository: normalizeUpdateRepository(data?.repository),
    modelPreferences: normalizeModelPreferences(data?.modelPreferences)
  };
}

async function writeRuntimeSettingsStore(patch) {
  const current = await readJsonFile(runtimeSettingsPath, {});
  const next = {
    ...(current && typeof current === "object" ? current : {}),
    updatedAt: new Date().toISOString()
  };
  if (patch.falKey !== undefined) next.falKey = String(patch.falKey || "");
  if (patch.googleApiKey !== undefined) next.googleApiKey = String(patch.googleApiKey || "");
  if (patch.repository !== undefined) next.repository = normalizeUpdateRepository(patch.repository);
  if (patch.modelPreferences !== undefined) next.modelPreferences = normalizeModelPreferences(patch.modelPreferences);
  await writeJsonAtomic(runtimeSettingsPath, next);
}

function normalizeModelPreferences(value = {}) {
  const incomingImage = value?.image && typeof value.image === "object" ? value.image : {};
  const incomingVideo = value?.video && typeof value.video === "object" ? value.video : {};
  const image = Object.fromEntries(imageModelOptions.map((model) => [model, Boolean(incomingImage[model] ?? defaultModelPreferences.image[model])]));
  const video = Object.fromEntries(videoModelOptions.map((model) => [model, Boolean(incomingVideo[model] ?? defaultModelPreferences.video[model])]));

  if (!Object.values(image).some(Boolean)) image[imageModelNames.zImage] = true;
  if (!Object.values(video).some(Boolean)) video[videoModelNames.seedance] = true;

  return { image, video };
}

async function readEnvFileValues(keys) {
  if (!existsSync(envFilePath)) return {};
  const text = await readFile(envFilePath, "utf8");
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || !keys.includes(match[1])) continue;
    values[match[1]] = parseEnvValue(match[2]);
  }
  return values;
}

function parseEnvValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  return text;
}

function applyRuntimeConfigValue(key, envValue, settingsValue, { preferSettings = false } = {}) {
  const settingsText = optionalRuntimeSetting(settingsValue);
  if (preferSettings && settingsText !== null) {
    process.env[key] = settingsText;
    runtimeConfigSources[key] = "settings";
    return;
  }

  const envText = optionalRuntimeSetting(envValue);
  if (envText !== null) {
    process.env[key] = envText;
    runtimeConfigSources[key] = "env";
    return;
  }

  if (!preferSettings && settingsText !== null) {
    process.env[key] = settingsText;
    runtimeConfigSources[key] = "settings";
    return;
  }

  if (runtimeConfigSources[key] === "env" || runtimeConfigSources[key] === "settings") {
    delete process.env[key];
    runtimeConfigSources[key] = "";
  }
}

async function writeRestartMarker() {
  const timestamp = new Date().toISOString();
  await writeFile(
    path.join(__dirname, "restart-marker.js"),
    `export const restartMarker = ${JSON.stringify(timestamp)};\n`,
    "utf8"
  );
}

async function resolveUpdateRepository() {
  const envRepository = normalizeUpdateRepository(process.env[updateRepositoryEnvKey]);
  if (envRepository) return envRepository;
  return gitRemoteOriginUrl();
}

async function resolveBranchStatus(repository, branch) {
  const cleanRepository = normalizeUpdateRepository(repository);
  const cleanBranch = String(branch || "").trim();
  if (!cleanRepository || !cleanBranch) {
    return {
      state: "unknown",
      label: "Unknown",
      detail: "Repository or branch unavailable"
    };
  }

  try {
    const [localHead, remoteHead] = await Promise.all([
      currentGitHead(),
      remoteBranchHead(cleanRepository, cleanBranch)
    ]);

    if (!localHead || !remoteHead) {
      return {
        state: "unknown",
        label: "Unknown",
        detail: "Could not compare branch"
      };
    }

    if (localHead === remoteHead) {
      return {
        state: "up-to-date",
        label: "Up-to-date",
        detail: cleanBranch,
        localHead: shortCommit(localHead),
        remoteHead: shortCommit(remoteHead)
      };
    }

    return {
      state: "update-available",
      label: "Update available",
      detail: cleanBranch,
      localHead: shortCommit(localHead),
      remoteHead: shortCommit(remoteHead)
    };
  } catch (error) {
    return {
      state: "unknown",
      label: "Could not check",
      detail: "Repository status unavailable"
    };
  }
}

async function currentGitHead() {
  try {
    const { stdout = "" } = await execFile("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      timeout: 10000,
      windowsHide: true
    });
    return String(stdout).trim();
  } catch {
    return "";
  }
}

async function remoteBranchHead(repository, branch) {
  const { stdout = "" } = await execFile("git", ["ls-remote", repository, `refs/heads/${branch}`], {
    cwd: rootDir,
    timeout: 15000,
    maxBuffer: 256 * 1024,
    windowsHide: true
  });
  const [hash = ""] = String(stdout).trim().split(/\s+/);
  return /^[a-f0-9]{40}$/i.test(hash) ? hash : "";
}

function shortCommit(value) {
  return String(value || "").slice(0, 7);
}

async function currentGitBranch() {
  try {
    const { stdout = "" } = await execFile("git", ["branch", "--show-current"], {
      cwd: rootDir,
      timeout: 10000,
      windowsHide: true
    });
    return String(stdout).trim();
  } catch {
    return "";
  }
}

async function gitRemoteOriginUrl() {
  try {
    const { stdout = "" } = await execFile("git", ["remote", "get-url", "origin"], {
      cwd: rootDir,
      timeout: 10000,
      windowsHide: true
    });
    return normalizeUpdateRepository(stdout);
  } catch {
    return "";
  }
}

function optionalRuntimeSetting(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function submittedRuntimeSetting(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function normalizeUpdateRepository(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 500 || /[\0\r\n]/.test(text)) {
    const error = new Error("Repository must be a single valid URL or path.");
    error.status = 400;
    throw error;
  }
  return text;
}

async function updateEnvFileValues(updates) {
  const keys = Object.keys(updates).filter((key) => /^[A-Z0-9_]+$/.test(key));
  if (!keys.length) return;

  let text = "";
  if (existsSync(envFilePath)) {
    text = await readFile(envFilePath, "utf8");
  }

  const usedKeys = new Set();
  const lines = text ? text.split(/\r?\n/) : [];
  const nextLines = lines.map((line) => {
    for (const key of keys) {
      if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
        usedKeys.add(key);
        return `${key}=${formatEnvValue(updates[key])}`;
      }
    }
    return line;
  });

  for (const key of keys) {
    if (!usedKeys.has(key)) nextLines.push(`${key}=${formatEnvValue(updates[key])}`);
  }

  await writeFile(envFilePath, `${trimTrailingBlankLines(nextLines).join("\n")}\n`, "utf8");
}

function formatEnvValue(value) {
  const text = String(value || "");
  if (/^[A-Za-z0-9_./:@+=-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function trimTrailingBlankLines(lines) {
  const nextLines = [...lines];
  while (nextLines.length && nextLines[nextLines.length - 1] === "") nextLines.pop();
  return nextLines;
}

app.get("/api/history", async (req, res) => {
  await timedApi("history:list", async () => {
    if (wantsSummary(req)) {
      return res.json(pageHistorySummaries(await readHistorySummaries(), req));
    }

    res.json(await readHistory());
  });
});

app.get("/api/stats", async (_req, res) => {
  await timedApi("stats", async () => {
    res.json({
      history: await readHistory(),
      projects: await readNodeProjects(),
      pricing: {
      seedance: {
        standardCostPerSecond: seedanceStandardCostPerSecond,
        fastCostPerSecond: seedanceFastCostPerSecond,
        standardCostPerThousandTokens: seedanceStandardCostPerThousandTokens,
        fastCostPerThousandTokens: seedanceFastCostPerThousandTokens,
        billingFps: seedanceBillingFps,
        currency: "USD"
      },
      happyHorse: {
        costPerSecond720p: happyHorse720pCostPerSecond,
        costPerSecond1080p: happyHorse1080pCostPerSecond,
        currency: "USD"
      },
      nanoBananaPro: {
        cost1K2K: nanoBananaCost1K2K,
        cost4K: nanoBananaCost4K,
        currency: "USD"
      },
      zImage: {
        costPerMegapixel: zImageCostPerMegapixel,
        currency: "USD"
      },
      luma: {
        photonCostPerMegapixel: lumaPhotonCostPerMegapixel,
        ray2CostPerFiveSeconds540p: lumaRay2BaseCostPerFiveSeconds,
        currency: "USD"
      },
      openAiImage2: {
        mediumCost: openAiImage2MediumCost,
        currency: "USD"
      },
      hunyuan3DPro: {
        baseCost: hunyuan3DProBaseCost,
        addOnCost: hunyuan3DProAddOnCost,
        currency: "USD"
      },
      textProcessing: {
        falRequestCost: falTextRequestCost,
        falVisionUnitCost: falVisionTextUnitCost,
        falVideoUnitCost: falVideoTextUnitCost,
        currency: "USD"
      },
      utility: {
        wanFunControl: {
          costPerSecond: wanFunControlCostPerSecond,
          currency: "USD"
        },
        wanVaceMaskToVideo: {
          costPerSecond480p: wanVaceCostPerSecond["480p"],
          costPerSecond580p: wanVaceCostPerSecond["580p"],
          costPerSecond720p: wanVaceCostPerSecond["720p"],
          billingFps: 16,
          currency: "USD"
        },
        wanVaceInpainting: {
          costPerSecond480p: wanVaceCostPerSecond["480p"],
          costPerSecond580p: wanVaceCostPerSecond["580p"],
          costPerSecond720p: wanVaceCostPerSecond["720p"],
          billingFps: 16,
          currency: "USD"
        },
        voidVideoInpainting: {
          baseCost: voidVideoInpaintingBaseCost,
          pass2Cost: voidVideoInpaintingPass2Cost,
          sam3QuadMaskCost: voidVideoInpaintingSam3QuadMaskCost,
          currency: "USD"
        },
        sam3Image: {
          costPerRequest: sam3ImageCostPerRequest,
          currency: "USD"
        },
        sam3Video: {
          costPer16Frames: sam3VideoCostPer16Frames,
          currency: "USD"
        },
        aurora: {
          costPerSecond480p: aurora480pCostPerSecond,
          costPerSecond720p: aurora720pCostPerSecond,
          currency: "USD"
        },
        bytedanceUpscaler: {
          costPerSecond1080p: bytedanceUpscalerCostPerSecond["1080p"],
          costPerSecond2K: bytedanceUpscalerCostPerSecond["2k"],
          costPerSecond4K: bytedanceUpscalerCostPerSecond["4k"],
          proMultiplier: 10,
          fps60Multiplier: 2,
          currency: "USD"
        },
        topazUpscaler: {
          costPerSecondUpTo720p: topazUpscalerCostPerSecond["up-to-720p"],
          costPerSecond720pTo1080p: topazUpscalerCostPerSecond["720p-1080p"],
          costPerSecondAbove1080p: topazUpscalerCostPerSecond["above-1080p"],
          fps60Multiplier: 2,
          gaia2Multiplier: 0.5,
          currency: "USD"
        },
        dwpose: {
          costPerComputeSecond: dwposeCostPerComputeSecond,
          currency: "USD"
        },
        depthAnything: {
          costPerComputeSecond: 0,
          currency: "USD"
        },
        birefnet: {
          costPerComputeSecond: 0,
          currency: "USD"
        },
        patina: {
          baseCost: patinaBaseCost,
          mapCostPerMegapixel: patinaMapCostPerMegapixel,
          currency: "USD"
        }
      }
      }
    });
  });
});

app.get("/api/node-projects", async (_req, res) => {
  const projects = await readNodeProjects();
  res.json(projects.map(({ graph, ...project }) => project));
});

app.get("/api/saved-workflows", async (req, res) => {
  await timedApi("workflows:list", async () => {
    if (wantsSummary(req)) {
      return res.json(await readSavedWorkflowSummaries());
    }

    const workflows = await readSavedWorkflows();
    res.json(workflows.map(({ graph, ...workflow }) => workflow));
  });
});

app.get("/api/saved-workflows/:fileName", async (req, res) => {
  await timedApi("workflows:open", async () => {
    const fileName = safeWorkflowFileName(req.params.fileName);
    if (!fileName) {
      return res.status(400).json({ error: "Invalid workflow file name." });
    }
    const workflows = await readSavedWorkflows();
    const workflow = workflows.find((item) => item.fileName === fileName || item.registryFileName === fileName);

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found." });
    }

    res.json(workflow);
  });
});

app.post("/api/saved-workflows", async (req, res) => {
  await timedApi("workflows:save", async () => {
    try {
      const workflows = await readSavedWorkflows({ includeAll: true });
      const now = new Date().toISOString();
      const id = String(req.body.id || randomUUID()).trim();
      const name = String(req.body.name || "Untitled node project").trim() || "Untitled node project";
      const existing = workflows.find((item) => item.id === id);
      const packagePath = workflowPackagePathFromSaveRequest(req.body, existing, name);
      const fileName = existing?.fileName || uniqueWorkflowFileName(name, workflows);
      const workflow = {
        id,
        name,
        fileName,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        app: "NewtNode",
        version: 1,
        packagePath: packagePath || "",
        graph: {
          nodes: Array.isArray(req.body.nodes) ? req.body.nodes : [],
          edges: Array.isArray(req.body.edges) ? req.body.edges : [],
          groups: Array.isArray(req.body.groups) ? req.body.groups : [],
          viewport: req.body.viewport || { x: 0, y: 0, scale: 1 }
        }
      };

      const savedWorkflow = packagePath ? await writeWorkflowPackage(workflow, packagePath) : workflow;
      const registeredWorkflow = await writeWorkflowFile(savedWorkflow);
      res.json(registeredWorkflow);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message || "Could not save workflow." });
    }
  });
});

app.post("/api/saved-workflows/register-package", async (req, res) => {
  try {
    const workflow = normalizeWorkflowPackageRegistration(req.body.workflow || req.body);
    const registered = await writeWorkflowFile(workflow);
    await rebuildWorkflowIndex().catch(() => {});
    res.json(registered);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Could not register workflow package." });
  }
});

app.delete("/api/saved-workflows/:fileName", async (req, res) => {
  const fileName = safeWorkflowFileName(req.params.fileName);
  if (!fileName) {
    return res.status(400).json({ error: "Invalid workflow file name." });
  }

  await removeRecentWorkflowFileName(fileName);
  await rebuildWorkflowIndex().catch(() => {});
  res.json(await readSavedWorkflowSummaries());
});

app.get("/api/node-projects/:id", async (req, res) => {
  const project = (await readNodeProjects()).find((item) => item.id === req.params.id);

  if (!project) {
    return res.status(404).json({ error: "Project not found." });
  }

  res.json(project);
});

app.post("/api/node-projects", async (req, res) => {
  const projects = await readNodeProjects();
  const now = new Date().toISOString();
  const id = req.body.id || randomUUID();
  const name = String(req.body.name || "Untitled project").trim() || "Untitled project";
  const project = {
    id,
    name,
    createdAt: projects.find((item) => item.id === id)?.createdAt || now,
    updatedAt: now,
    graph: {
      nodes: Array.isArray(req.body.nodes) ? req.body.nodes : [],
      edges: Array.isArray(req.body.edges) ? req.body.edges : [],
      groups: Array.isArray(req.body.groups) ? req.body.groups : [],
      viewport: req.body.viewport || { x: 0, y: 0, scale: 1 }
    }
  };

  const nextProjects = [project, ...projects.filter((item) => item.id !== id)];
  await writeNodeProjects(nextProjects);
  res.json(project);
});

app.delete("/api/node-projects/:id", async (req, res) => {
  const projects = await readNodeProjects();
  const nextProjects = projects.filter((item) => item.id !== req.params.id);

  if (nextProjects.length === projects.length) {
    return res.status(404).json({ error: "Project not found." });
  }

  await writeNodeProjects(nextProjects);
  res.json(nextProjects.map(({ graph, ...project }) => project));
});

app.delete("/api/history/:id", async (req, res) => {
  const history = await readHistory();
  const nextHistory = history.filter((item) => item.id !== req.params.id);

  if (nextHistory.length === history.length) {
    return res.status(404).json({ error: "History item not found." });
  }

  await writeHistory(nextHistory);
  res.json(nextHistory);
});

app.post("/api/node/upload-asset", upload.single("asset"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No asset uploaded." });
  }
  try {
    const extensionMimeType = mimeForExtension(path.extname(req.file.originalname).toLowerCase());
    const mimeType = req.file.mimetype && req.file.mimetype !== "application/octet-stream" ? req.file.mimetype : extensionMimeType;
    const target = await createManagedAssetTarget(req, req.file.filename, "", workflowPackageInputDirName);
    await moveUploadedFile(req.file.path, target.filePath);

    res.json({
      asset: {
        localUrl: target.publicPath,
        fileName: req.file.originalname,
        storedFileName: target.relativePath,
        mimeType,
        size: req.file.size,
        mediaType: mediaTypeForMime(mimeType)
      }
    });
  } catch (error) {
    if (req.file?.path) await rm(req.file.path, { force: true }).catch(() => {});
    console.error(error);
    res.status(500).json({ error: error.message || "Upload failed." });
  }
});

app.post("/api/node/composer-frame", async (req, res) => {
  try {
    const imageDataUrl = String(req.body.imageDataUrl || "");
    const match = imageDataUrl.match(/^data:image\/png;base64,([a-z0-9+/=]+)$/i);
    if (!match) {
      return res.status(400).json({ error: "Composer frame must be a PNG data URL." });
    }

    const bytes = Buffer.from(match[1], "base64");
    if (!bytes.length) {
      return res.status(400).json({ error: "Composer frame was empty." });
    }

    const output = await createManagedAssetTarget(req, "composer-frame", ".png", workflowPackageOutputDirName);
    await writeFile(output.filePath, bytes);
    const localUrl = output.publicPath;
    const title = String(req.body.nodeTitle || "Composer").trim() || "Composer";
    const cost = {
      amountUsd: 0,
      currency: "USD",
      unitRateUsd: 0,
      units: 1,
      unit: "local capture",
      mediaType: "image",
      pricingBasis: "Local Composer viewport capture",
      pricingSource: "local-composer"
    };

    await appendHistory({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "image",
      provider: "local",
      modelName: "Composer",
      endpoint: "local/composer-frame",
      mode: "Composer frame capture",
      prompt: title,
      submittedPrompt: title,
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        maquetteCount: Number(req.body.maquetteCount || 0),
        propCount: Number(req.body.propCount || 0),
        imagePlaneCount: Number(req.body.imagePlaneCount || 0),
        aspectRatio: req.body.aspectRatio || "16:9"
      },
      cost,
      localImage: localUrl,
      outputFileName: output.fileName,
      outputBytes: bytes.length,
      text: "Composer frame capture."
    });

    res.json({
      image: {
        localUrl,
        fileName: output.fileName,
        mimeType: "image/png"
      },
      cost
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Composer capture failed." });
  }
});

app.post("/api/node/upload-style-collage", upload.single("asset"), async (req, res) => {
  return handleTransferCollageUpload(req, res);
});

app.post("/api/node/upload-transfer-collage", upload.single("asset"), async (req, res) => {
  return handleTransferCollageUpload(req, res);
});

app.post("/api/node/color-id-matte", upload.single("asset"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No Color ID matte uploaded." });
    }

    const output = await createManagedAssetTarget(req, "color-id-matte", ".png", workflowPackageOutputDirName);
    await moveUploadedFile(req.file.path, output.filePath);

    const selectedColor = String(req.body.selectedColor || "").slice(0, 16);
    const tolerance = clampInteger(req.body.tolerance, 0, 96, 0);
    const sampleRadius = clampInteger(req.body.sampleRadius, 0, 3, 0);
    const invert = String(req.body.invert || "").toLowerCase() === "true";
    const width = positiveNumber(req.body.width);
    const height = positiveNumber(req.body.height);
    const matchedPixels = positiveNumber(req.body.matchedPixels);
    const text = `Color ID matte${selectedColor ? ` for ${selectedColor}` : ""}.`;
    const cost = {
      amountUsd: 0,
      currency: "USD",
      unitRateUsd: 0,
      units: 1,
      unit: "local mask",
      mediaType: "image",
      pricingBasis: "Local Color ID matte generation",
      pricingSource: "local-color-id-matte"
    };

    await appendHistory({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "image",
      provider: "local",
      modelName: "Color ID Matte",
      endpoint: "local/color-id-matte",
      mode: "Color ID matte",
      prompt: text,
      submittedPrompt: text,
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        model: "Color ID Matte",
        sourceImageUrl: req.body.sourceImageUrl || "",
        selectedColor,
        tolerance,
        sampleRadius,
        invert,
        width,
        height,
        matchedPixels
      },
      cost,
      localImage: output.publicPath,
      outputFileName: output.fileName,
      outputBytes: req.file.size,
      text
    });

    res.json({
      modelName: "Color ID Matte",
      text,
      cost,
      image: {
        label: "Color ID Matte",
        localUrl: output.publicPath,
        fileName: output.fileName,
        mimeType: "image/png"
      }
    });
  } catch (error) {
    if (req.file?.path) await rm(req.file.path, { force: true }).catch(() => {});
    console.error(error);
    sendApiError(res, error, "Color ID matte failed.");
  }
});

app.post("/api/node/extract-video-frame", async (req, res) => {
  try {
    const sourceVideoUrl = String(req.body.sourceVideoUrl || "").trim();
    if (!sourceVideoUrl) {
      return res.status(400).json({ error: "Connect a video to extract a frame." });
    }

    res.json(await createExtractFrameResult({ body: req.body, sourceVideoUrl }));
  } catch (error) {
    console.error(error);
    sendApiError(res, error, "Extract frame failed.");
  }
});

app.post("/api/node/process-text", async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    const textInputs = normalizedTextInputs(req.body.textInputs);
    const imageInputs = normalizedMediaInputs(req.body.imageInputs, "image");
    const videoInputs = normalizedMediaInputs(req.body.videoInputs, "video");
    if (!text && !textInputs.length && !imageInputs.length && !videoInputs.length) {
      return res.status(400).json({ error: "Text is required." });
    }

    const result = textLlmProvider === "openai" ? await processTextWithOpenAi({ text, textInputs, imageInputs, videoInputs }) : await processTextWithFal({ text, textInputs, imageInputs, videoInputs });
    const cost = estimateTextProcessingCost({ provider: result.provider, usage: result.usage, helperUsages: result.helperUsages, imageInputs, videoInputs });
    const usageRecord = result.usage || result.helperUsages?.length ? { request: result.usage || null, helpers: result.helperUsages || [] } : null;

    await appendHistory({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "text",
      provider: result.provider,
      modelName: result.model,
      endpoint: result.endpoint,
      mode: "Text processing",
      prompt: text || textInputs.map((item) => item.text).join("\n\n"),
      submittedPrompt: result.submittedPrompt || text,
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        model: result.model,
        provider: result.provider,
        textInputCount: textInputs.length,
        imageInputCount: imageInputs.length,
        videoInputCount: videoInputs.length
      },
      cost,
      text: result.text,
      usage: usageRecord
    });

    res.json({
      text: result.text,
      model: result.model,
      provider: result.provider,
      cost,
      usage: usageRecord
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Text processing failed." });
  }
});

async function handleTransferCollageUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No mood board collage uploaded." });
  }

  try {
    const nodeId = safePathSegment(req.body.nodeId || "mood-board");
    const target = await createManagedAssetTarget(req, `${nodeId}-${moodBoardOutputFileName}`, "", workflowPackageDependencyDirName);
    await moveUploadedFile(req.file.path, target.filePath);

    res.json({
      asset: {
        localUrl: target.publicPath,
        fileName: moodBoardOutputFileName,
        storedFileName: target.relativePath,
        mimeType: "image/png",
        size: req.file.size,
        mediaType: "image"
      }
    });
  } catch (error) {
    if (req.file?.path) await rm(req.file.path, { force: true }).catch(() => {});
    throw error;
  }
}

app.post("/api/node/generate-image", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const selectedModel = resolveImageModel(req.body.model);
    const imagePromptUrls = Array.isArray(req.body.imagePromptUrls) ? req.body.imagePromptUrls.filter(isLocalAssetUrl) : [];
    const imagePromptLabels = Array.isArray(req.body.imagePromptLabels) ? req.body.imagePromptLabels : [];
    const cleanReferenceLabels = imagePromptUrls.map((_, index) => cleanImagePromptLabel(imagePromptLabels[index])).filter(Boolean);

    if (selectedModel.provider === "disabled") {
      return res.status(400).json({ error: `${selectedModel.displayName} is temporarily disabled.` });
    }

    if (selectedModel.provider === "fal-sam3-image") {
      return runSam3ImageSegmentation(req, res, {
        prompt,
        imagePromptUrls,
        imagePromptLabels
      });
    }

    const requestedAspectRatio = req.body.requestedAspectRatio || req.body.aspectRatio;
    const aspectRatio = await resolveImageGenerationAspectRatio({
      value: req.body.aspectRatio,
      imagePromptUrls,
      provider: selectedModel.provider
    });

    if (selectedModel.provider === "fal-z-image") {
      if (!process.env.FAL_KEY) {
        return res.status(400).json({ error: "Missing FAL_KEY in .env." });
      }

      const zImage = await generateFalZImage({
        prompt,
        imagePromptUrls,
        imagePromptLabels,
        aspectRatio,
        resolution: req.body.resolution
      });
      const output = await downloadImage(req, zImage.remoteImage.url, "z-image", zImage.remoteImage.content_type || zImage.remoteImage.mimeType);
      const cost = estimateZImageCost({ endpoint: zImage.endpoint, resolution: zImage.resolution, imageSize: zImage.imageSize });

      await appendHistory({
        id: zImage.requestId || randomUUID(),
        createdAt: new Date().toISOString(),
        mediaType: "image",
        provider: "fal.ai",
        modelName: selectedModel.displayName,
        endpoint: zImage.endpoint,
        mode: imagePromptUrls.length ? "Z-Image generation with reference" : "Z-Image generation",
        prompt,
        submittedPrompt: zImage.submittedPrompt,
        project: projectFromBody(req.body),
        node: nodeFromBody(req.body),
        settings: {
          model: req.body.model || selectedModel.displayName,
          aspectRatio,
          requestedAspectRatio: requestedAspectRatio || aspectRatio,
          resolution: zImage.resolution,
          imageSize: zImage.imageSize,
          imagePromptCount: imagePromptUrls.length,
          imagePromptLabels: cleanReferenceLabels
        },
        cost,
        remoteImage: zImage.remoteImage,
        localImage: output.publicPath,
        outputFileName: output.fileName,
        outputBytes: output.bytes,
        text: zImage.resultText || ""
      });

      return res.json({
        text: zImage.resultText || "",
        cost,
        image: {
          ...zImage.remoteImage,
          localUrl: output.publicPath,
          fileName: output.fileName,
          mimeType: output.mimeType
        }
      });
    }

    if (selectedModel.provider === "fal-openai-image-2") {
      if (!process.env.FAL_KEY) {
        return res.status(400).json({ error: "Missing FAL_KEY in .env." });
      }

      const openAiImage = await generateFalOpenAiImage2({
        prompt,
        imagePromptUrls,
        imagePromptLabels,
        aspectRatio,
        resolution: req.body.resolution
      });
      const output = await downloadImage(req, openAiImage.remoteImage.url, "openai-image-2", openAiImage.remoteImage.content_type || openAiImage.remoteImage.mimeType);

      const cost = estimateOpenAiImage2Cost({
        resolution: req.body.resolution,
        size: openAiImage.size,
        quality: openAiImage.quality
      });
      await appendHistory({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        mediaType: "image",
        provider: "fal.ai",
        modelName: selectedModel.displayName,
        endpoint: openAiImage.endpoint,
        mode: imagePromptUrls.length ? "Image edit with references" : "Image generation",
        prompt,
        submittedPrompt: openAiImage.submittedPrompt,
        project: projectFromBody(req.body),
        node: nodeFromBody(req.body),
        settings: {
          model: req.body.model || selectedModel.displayName,
          aspectRatio,
          requestedAspectRatio: requestedAspectRatio || aspectRatio,
          resolution: req.body.resolution || "2K",
          imageSize: openAiImage.size,
          quality: openAiImage.quality,
          imagePromptCount: imagePromptUrls.length,
          imagePromptLabels: cleanReferenceLabels
        },
        cost,
        remoteImage: openAiImage.remoteImage,
        localImage: output.publicPath,
        outputFileName: output.fileName,
        outputBytes: output.bytes,
        text: openAiImage.resultText || ""
      });

      return res.json({
        text: openAiImage.resultText || "",
        cost,
        image: {
          ...openAiImage.remoteImage,
          localUrl: output.publicPath,
          fileName: output.fileName,
          mimeType: output.mimeType
        }
      });
    }

    if (selectedModel.provider === "fal-luma-photon") {
      if (!process.env.FAL_KEY) {
        return res.status(400).json({ error: "Missing FAL_KEY in .env." });
      }

      const lumaImage = await generateFalLumaPhoton({
        prompt,
        imagePromptUrls,
        imagePromptLabels,
        aspectRatio
      });
      const output = await downloadImage(req, lumaImage.remoteImage.url, "luma-photon", lumaImage.remoteImage.content_type || lumaImage.remoteImage.mimeType);
      const cost = estimateLumaPhotonCost({ aspectRatio, remoteImage: lumaImage.remoteImage, endpoint: lumaImage.endpoint });

      await appendHistory({
        id: lumaImage.requestId || randomUUID(),
        createdAt: new Date().toISOString(),
        mediaType: "image",
        provider: "fal.ai",
        modelName: selectedModel.displayName,
        endpoint: lumaImage.endpoint,
        mode: imagePromptUrls.length ? "Luma image edit" : "Luma image generation",
        prompt,
        submittedPrompt: lumaImage.submittedPrompt,
        project: projectFromBody(req.body),
        node: nodeFromBody(req.body),
        settings: {
          model: req.body.model || selectedModel.displayName,
          aspectRatio,
          requestedAspectRatio: requestedAspectRatio || aspectRatio,
          resolution: req.body.resolution || "",
          imagePromptCount: imagePromptUrls.length,
          imagePromptLabels: cleanReferenceLabels
        },
        cost,
        remoteImage: lumaImage.remoteImage,
        localImage: output.publicPath,
        outputFileName: output.fileName,
        outputBytes: output.bytes,
        text: lumaImage.resultText || ""
      });

      return res.json({
        text: lumaImage.resultText || "",
        cost,
        image: {
          ...lumaImage.remoteImage,
          localUrl: output.publicPath,
          fileName: output.fileName,
          mimeType: output.mimeType
        }
      });
    }

    if (selectedModel.provider === "fal-nano-banana-pro") {
      if (!process.env.FAL_KEY) {
        return res.status(400).json({ error: "Missing FAL_KEY in .env." });
      }

      const falImage = await generateFalNanoBananaPro({
        prompt,
        imagePromptUrls,
        imagePromptLabels,
        aspectRatio,
        resolution: req.body.resolution
      });
      const output = await downloadImage(req, falImage.remoteImage.url, "nano-banana-pro", falImage.remoteImage.content_type || falImage.remoteImage.mimeType);
      const cost = estimateImageCost({ resolution: req.body.resolution });

      await appendHistory({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        mediaType: "image",
        provider: "fal.ai",
        modelName: selectedModel.displayName,
        endpoint: falImage.endpoint,
        mode: imagePromptUrls.length ? "Image edit with references" : "Image generation",
        prompt,
        submittedPrompt: falImage.submittedPrompt,
        project: projectFromBody(req.body),
        node: nodeFromBody(req.body),
        settings: {
          model: req.body.model || selectedModel.displayName,
          aspectRatio,
          requestedAspectRatio: requestedAspectRatio || aspectRatio,
          resolution: falImage.resolution,
          imagePromptCount: imagePromptUrls.length,
          imagePromptLabels: cleanReferenceLabels
        },
        cost,
        remoteImage: falImage.remoteImage,
        localImage: output.publicPath,
        outputFileName: output.fileName,
        outputBytes: output.bytes,
        text: falImage.description || ""
      });

      return res.json({
        text: falImage.description || "",
        cost,
        image: {
          ...falImage.remoteImage,
          localUrl: output.publicPath,
          fileName: output.fileName,
          mimeType: output.mimeType
        }
      });
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(400).json({ error: "Missing GOOGLE_API_KEY in .env." });
    }

    const model = selectedModel.id;
    const imageConfig = {
      aspectRatio: normalizeGeminiImageAspectRatio(aspectRatio),
      imageSize: normalizeGeminiImageSize(req.body.resolution)
    };
    const parts = [{ text: prompt }];

    for (const [index, imagePromptUrl] of imagePromptUrls.entries()) {
      const asset = await readLocalAsset(imagePromptUrl);
      if (!asset.mimeType.startsWith("image/")) continue;
      const label = cleanImagePromptLabel(imagePromptLabels[index]);
      if (label) {
        parts.push({ text: imageReferenceLabelPrompt(label) });
      }
      parts.push({
        inlineData: {
          mimeType: asset.mimeType,
          data: asset.buffer.toString("base64")
        }
      });
    }

    const { text, inlineData, attempts } = await generateGeminiImageWithRetries({
      model,
      parts,
      imageConfig
    });

    const mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
    const extension = extensionForMime(mimeType);
    const output = await createManagedAssetTarget(req, "nano-banana-pro", extension, workflowPackageOutputDirName);
    const imageBytes = Buffer.from(inlineData.data, "base64");
    await writeFile(output.filePath, imageBytes);

    const cost = estimateImageCost({ resolution: req.body.resolution });
    await appendHistory({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "image",
      provider: "Google",
      modelName: selectedModel.displayName,
      endpoint: model,
      mode: imagePromptUrls.length ? "Image generation with references" : "Image generation",
      prompt,
      submittedPrompt: prompt,
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        model: req.body.model || selectedModel.displayName,
        aspectRatio,
        requestedAspectRatio: requestedAspectRatio || aspectRatio,
        resolution: req.body.resolution || "2K",
        imageConfig,
        attempts,
        imagePromptCount: imagePromptUrls.length,
        imagePromptLabels: cleanReferenceLabels
      },
      cost,
      localImage: output.publicPath,
      outputFileName: output.fileName,
      outputBytes: imageBytes.length,
      text
    });

    res.json({
      text,
      cost,
      image: {
        localUrl: output.publicPath,
        fileName: output.fileName,
        mimeType
      }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message || "Image generation failed.", text: error.text || "", raw: error.raw });
    }

    console.error(error);
    res.status(500).json({ error: error.message || "Image generation failed." });
  }
});

async function runSam3ImageSegmentation(req, res, { prompt, imagePromptUrls, imagePromptLabels }) {
  if (!process.env.FAL_KEY) {
    return res.status(400).json({ error: "Missing FAL_KEY in .env." });
  }

  const imageUrl = firstLocalOutput(imagePromptUrls);
  if (!imageUrl) {
    return res.status(400).json({ error: "SAM 3 Image requires a connected image." });
  }

  const endpoint = "fal-ai/sam-3/image";
  const input = {
    image_url: await uploadLocalOutputToFal(imageUrl),
    prompt,
    apply_mask: true,
    output_format: "png",
    return_multiple_masks: true,
    max_masks: 3,
    include_scores: true,
    include_boxes: true
  };

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteImage = firstFalImageResult(result?.data);

  if (!remoteImage?.url && Array.isArray(result?.data?.masks) && !result.data.masks.length) {
    return res.status(422).json({
      error: "SAM 3 Image did not find a matching segment. Try naming a visible object in the image, like helmet, face, person, or robot.",
      raw: result?.data
    });
  }

  if (!remoteImage?.url) {
    return res.status(502).json({ error: "Fal returned no segmentation image URL.", raw: result?.data });
  }

  const output = await downloadImage(req, remoteImage.url, "sam-3-image-segmentation", remoteImage.content_type || remoteImage.mimeType);
  const returnedMaskCount = Array.isArray(result?.data?.masks) ? result.data.masks.length : 0;
  const maskCount = returnedMaskCount || 1;
  const text = `Segmented ${maskCount} ${maskCount === 1 ? "mask" : "masks"}.`;
  const cost = estimateSam3ImageCost({ endpoint });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "image",
    provider: "fal.ai",
    modelName: "SAM 3 Image",
    endpoint,
    mode: "SAM 3 image segmentation",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: req.body.model || "SAM 3 Image",
      imageCount: 1,
      imagePromptLabel: cleanImagePromptLabel(imagePromptLabels[0]),
      applyMask: input.apply_mask,
      outputFormat: input.output_format,
      includeScores: input.include_scores,
      includeBoxes: input.include_boxes,
      maskCount
    },
    cost,
    remoteImage,
    remoteMasks: result?.data?.masks || [],
    metadata: result?.data?.metadata || [],
    scores: result?.data?.scores || [],
    boxes: result?.data?.boxes || [],
    localImage: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes,
    text
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: "SAM 3 Image",
    text,
    cost,
    image: {
      ...remoteImage,
      label: "SAM 3 Image",
      localUrl: output.publicPath,
      fileName: output.fileName,
      mimeType: output.mimeType
    }
  });
}

app.post("/api/node/utility-image", async (req, res) => {
  try {
    const selectedModel = resolveUtilityImageModel(req.body.model);
    if (selectedModel.provider === "local-color-id-matte") {
      return res.status(400).json({ error: "Color ID Matte is generated locally from the picker." });
    }

    if (!process.env.FAL_KEY) {
      return res.status(400).json({ error: "Missing FAL_KEY in .env." });
    }

    const imageUrl = firstLocalOutput(req.body.imageUrls);
    if (!imageUrl) {
      return res.status(400).json({ error: `${selectedModel.displayName} requires a connected image.` });
    }

    if (selectedModel.provider === "fal-dwpose") {
      return runDwposeUtilityImage(req, res, { imageUrl, selectedModel });
    }

    if (selectedModel.provider === "fal-depth-anything") {
      return runDepthAnythingUtilityImage(req, res, { imageUrl, selectedModel });
    }

    if (selectedModel.provider === "fal-patina") {
      return runPatinaUtilityImage(req, res, { imageUrl, selectedModel });
    }

    if (selectedModel.provider === "fal-birefnet-image") {
      return runBirefnetUtilityImage(req, res, { imageUrl, selectedModel });
    }

    if (selectedModel.provider === "fal-sam3-image") {
      const prompt = String(req.body.prompt || "").trim();
      if (!prompt) {
        return res.status(400).json({ error: "SAM 3 Image requires a segmentation prompt." });
      }

      return runSam3ImageSegmentation(req, res, {
        prompt,
        imagePromptUrls: [imageUrl],
        imagePromptLabels: ["Utility image"]
      });
    }

    return res.status(400).json({ error: "Unsupported Utility image model." });
  } catch (error) {
    console.error(error);
    sendApiError(res, error, "Utility image failed.");
  }
});

async function subscribeToFalWithTimeout(endpoint, input, label, timeoutMs = falUtilityImageTimeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      subscribeFal(endpoint, { input, logs: true }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error(`${label} timed out waiting for Fal. Try again in a moment.`);
          error.statusCode = 504;
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runDwposeUtilityImage(req, res, { imageUrl, selectedModel }) {
  const endpoint = selectedModel.id;
  const drawMode = normalizeChoice(req.body.dwposeDrawMode, ["full-pose", "body-pose", "face-pose", "hand-pose", "face-hand-mask", "face-mask", "hand-mask"], "body-pose");
  const input = {
    image_url: await uploadLocalOutputToFal(imageUrl),
    draw_mode: drawMode
  };

  const result = await subscribeToFalWithTimeout(endpoint, input, selectedModel.displayName);
  const remoteImage = firstFalImageResult(result?.data);

  if (!remoteImage?.url) {
    return res.status(502).json({ error: "Fal returned no DWPose image URL.", raw: result?.data });
  }

  const output = await downloadImage(req, remoteImage.url, "dwpose", remoteImage.content_type || remoteImage.mimeType);
  const cost = estimateFalImageUtilityCost({
    endpoint,
    mediaType: "image",
    amountUsd: costFromTiming(result, dwposeCostPerComputeSecond),
    unitRateUsd: dwposeCostPerComputeSecond,
    units: falTimingSeconds(result),
    unit: "compute second",
    pricingBasis: "DWPose fal.ai image utility estimate at $0.0006 per compute second"
  });
  const text = `DWPose ${drawMode.replace(/-/g, " ")} map.`;

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "image",
    provider: "fal.ai",
    modelName: selectedModel.displayName,
    endpoint,
    mode: "DWPose image pose preprocessor",
    prompt: text,
    submittedPrompt: text,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedModel.displayName,
      drawMode,
      sourceImageCount: 1
    },
    cost,
    remoteImage,
    localImage: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes,
    text
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedModel.displayName,
    text,
    cost,
    image: {
      ...remoteImage,
      label: selectedModel.displayName,
      localUrl: output.publicPath,
      fileName: output.fileName,
      mimeType: output.mimeType
    },
    images: [
      {
        ...remoteImage,
        label: selectedModel.displayName,
        localUrl: output.publicPath,
        fileName: output.fileName,
        mimeType: output.mimeType
      }
    ]
  });
}

async function runDepthAnythingUtilityImage(req, res, { imageUrl, selectedModel }) {
  const endpoint = selectedModel.id;
  const input = {
    image_url: await uploadLocalOutputToFal(imageUrl)
  };

  const result = await subscribeToFalWithTimeout(endpoint, input, selectedModel.displayName);
  const remoteImage = firstFalImageResult(result?.data);

  if (!remoteImage?.url) {
    return res.status(502).json({ error: "Fal returned no Depth Anything image URL.", raw: result?.data });
  }

  const output = await downloadImage(req, remoteImage.url, "depth-anything", remoteImage.content_type || remoteImage.mimeType);
  const cost = estimateFalImageUtilityCost({
    endpoint,
    mediaType: "image",
    amountUsd: 0,
    unitRateUsd: 0,
    units: falTimingSeconds(result) || 0,
    unit: "compute second",
    pricingBasis: "Depth Anything v2 fal.ai image preprocessor listed at $0 per compute second"
  });
  const text = "Depth Anything v2 map.";

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "image",
    provider: "fal.ai",
    modelName: selectedModel.displayName,
    endpoint,
    mode: "Depth Anything image depth preprocessor",
    prompt: text,
    submittedPrompt: text,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedModel.displayName,
      sourceImageCount: 1
    },
    cost,
    remoteImage,
    localImage: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes,
    text
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedModel.displayName,
    text,
    cost,
    image: {
      ...remoteImage,
      label: selectedModel.displayName,
      localUrl: output.publicPath,
      fileName: output.fileName,
      mimeType: output.mimeType
    },
    images: [
      {
        ...remoteImage,
        label: selectedModel.displayName,
        localUrl: output.publicPath,
        fileName: output.fileName,
        mimeType: output.mimeType
      }
    ]
  });
}

async function runPatinaUtilityImage(req, res, { imageUrl, selectedModel }) {
  const endpoint = selectedModel.id;
  const maps = normalizePatinaMaps(req.body.patinaMaps);
  const input = {
    image_url: await uploadLocalOutputToFal(imageUrl),
    maps,
    enable_safety_checker: true,
    output_format: normalizeChoice(req.body.patinaOutputFormat, ["jpeg", "png", "webp"], "png")
  };
  const seed = optionalInteger(req.body.patinaSeed);
  if (seed !== undefined) input.seed = seed;

  const result = await subscribeToFalWithTimeout(endpoint, input, selectedModel.displayName);
  const remoteImages = falImageResults(result?.data);

  if (!remoteImages.length) {
    return res.status(502).json({ error: "Fal returned no Patina map image URLs.", raw: result?.data });
  }

  const outputs = [];
  for (const [index, remoteImage] of remoteImages.entries()) {
    const mapType = normalizePatinaMapId(remoteImage.map_type || maps[index]) || `map-${index + 1}`;
    const output = await downloadImage(req, remoteImage.url, `patina-${mapType}`, remoteImage.content_type || remoteImage.mimeType);
    outputs.push({
      remoteImage,
      output,
      mapType,
      label: `Patina ${formatPatinaMapLabel(mapType)}`
    });
  }

  const cost = estimatePatinaCost({ endpoint, maps, image: remoteImages[0] });
  const text = `Patina ${outputs.map((item) => formatPatinaMapLabel(item.mapType)).join(", ")} maps.`;
  const outputBytes = outputs.reduce((sum, item) => sum + item.output.bytes, 0);

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "image",
    provider: "fal.ai",
    modelName: selectedModel.displayName,
    endpoint,
    mode: "Patina image PBR map preprocessor",
    prompt: text,
    submittedPrompt: text,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedModel.displayName,
      maps,
      outputFormat: input.output_format,
      seed: result?.data?.seed ?? input.seed ?? null,
      sourceImageCount: 1
    },
    cost,
    remoteImage: remoteImages[0],
    remoteImages,
    localImage: outputs[0].output.publicPath,
    localImages: outputs.map((item) => item.output.publicPath),
    outputFileName: outputs[0].output.fileName,
    outputBytes,
    text
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedModel.displayName,
    text,
    seed: result?.data?.seed ?? input.seed,
    cost,
    image: {
      ...outputs[0].remoteImage,
      label: outputs[0].label,
      localUrl: outputs[0].output.publicPath,
      fileName: outputs[0].output.fileName,
      mimeType: outputs[0].output.mimeType
    },
    images: outputs.map(({ remoteImage, output, label, mapType }) => ({
      ...remoteImage,
      label,
      mapType,
      localUrl: output.publicPath,
      fileName: output.fileName,
      mimeType: output.mimeType
    }))
  });
}

async function runBirefnetUtilityImage(req, res, { imageUrl, selectedModel }) {
  const endpoint = selectedModel.id;
  const options = req.body.birefnet || {};
  const input = {
    image_url: await uploadLocalOutputToFal(imageUrl),
    model: normalizeChoice(options.model, birefnetModelOptions, "General Use (Light)"),
    operating_resolution: normalizeChoice(options.operatingResolution, birefnetResolutionOptions, "1024x1024"),
    output_mask: Boolean(options.outputMask),
    refine_foreground: options.refineForeground !== false,
    output_format: normalizeChoice(options.outputFormat, ["webp", "png", "gif"], "png"),
    mask_only: Boolean(options.maskOnly)
  };

  const result = await subscribeToFalWithTimeout(endpoint, input, selectedModel.displayName);
  const remoteImage = firstFalImageResult(result?.data);
  const remoteMask = normalizeFalFile(result?.data?.mask_image);

  if (!remoteImage?.url) {
    return res.status(502).json({ error: "Fal returned no BiRefNet image URL.", raw: result?.data });
  }

  const output = await downloadImage(req, remoteImage.url, "birefnet-image", remoteImage.content_type || remoteImage.mimeType);
  const images = [
    {
      remoteImage,
      output,
      label: input.mask_only ? "BiRefNet Mask" : "BiRefNet Image"
    }
  ];

  if (input.output_mask && remoteMask?.url && remoteMask.url !== remoteImage.url) {
    const maskOutput = await downloadImage(req, remoteMask.url, "birefnet-mask", remoteMask.content_type || remoteMask.mimeType);
    images.push({
      remoteImage: remoteMask,
      output: maskOutput,
      label: "BiRefNet Mask"
    });
  }

  const cost = estimateFalImageUtilityCost({
    endpoint,
    mediaType: "image",
    amountUsd: 0,
    unitRateUsd: 0,
    units: falTimingSeconds(result) || 0,
    unit: "compute second",
    pricingBasis: "BiRefNet v2 fal.ai image background removal listed at $0 per compute second"
  });
  const text = input.mask_only ? "BiRefNet segmentation mask." : "BiRefNet background removed image.";
  const outputBytes = images.reduce((sum, item) => sum + item.output.bytes, 0);

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "image",
    provider: "fal.ai",
    modelName: selectedModel.displayName,
    endpoint,
    mode: "BiRefNet image background removal",
    prompt: text,
    submittedPrompt: text,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: input.model,
      operatingResolution: input.operating_resolution,
      outputMask: input.output_mask,
      refineForeground: input.refine_foreground,
      outputFormat: input.output_format,
      maskOnly: input.mask_only,
      sourceImageCount: 1
    },
    cost,
    remoteImage,
    localImage: output.publicPath,
    outputFileName: output.fileName,
    outputBytes,
    text
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedModel.displayName,
    text,
    cost,
    image: {
      ...remoteImage,
      label: images[0].label,
      localUrl: output.publicPath,
      fileName: output.fileName,
      mimeType: output.mimeType
    },
    images: images.map(({ remoteImage, output, label }) => ({
      ...remoteImage,
      label,
      localUrl: output.publicPath,
      fileName: output.fileName,
      mimeType: output.mimeType
    }))
  });
}

app.post("/api/node/utility-video", async (req, res) => {
  try {
    const selectedVideoModel = resolveUtilityVideoModel(req.body.model);
    const prompt = String(req.body.prompt || "").trim();
    const referenceImageUrls = Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [];
    const referenceVideoUrls = Array.isArray(req.body.referenceVideoUrls) ? req.body.referenceVideoUrls.filter(isLocalAssetUrl) : [];
    const maskVideoUrls = Array.isArray(req.body.maskVideoUrls) ? req.body.maskVideoUrls.filter(isLocalAssetUrl) : [];

    if (selectedVideoModel.provider === "local-extract-frame") {
      return runExtractFrameUtilityVideo(req, res, {
        referenceVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "local-color-id-video-matte") {
      return runColorIdMatteUtilityVideo(req, res, {
        referenceVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "local-composite-video") {
      return runCompositeUtilityVideo(req, res, {
        referenceVideoUrls,
        maskVideoUrls,
        selectedVideoModel
      });
    }

    if (!process.env.FAL_KEY) {
      return res.status(400).json({ error: "Missing FAL_KEY in .env." });
    }

    if (!prompt && selectedVideoModel.requiresPrompt) {
      return res.status(400).json({ error: `${selectedVideoModel.displayName} requires a prompt.` });
    }

    if (selectedVideoModel.provider === "fal-sam3-video") {
      return runSam3VideoSegmentation(req, res, {
        prompt,
        referenceVideoUrls
      });
    }

    if (selectedVideoModel.provider === "fal-void-video-inpainting") {
      return runVoidVideoInpaintingUtility(req, res, {
        prompt,
        referenceVideoUrls,
        maskVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-wan-vace-mask-to-video") {
      return runWanVaceMaskToVideoUtility(req, res, {
        prompt,
        referenceImageUrls,
        referenceVideoUrls,
        maskVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-wan-vace-inpainting") {
      return runWanVaceInpaintingUtility(req, res, {
        prompt,
        referenceImageUrls,
        referenceVideoUrls,
        maskVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-birefnet-video") {
      return runBirefnetUtilityVideo(req, res, {
        referenceVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-rife-video") {
      return runRifeVideoInterpolation(req, res, {
        referenceVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-bytedance-video-upscaler") {
      return runBytedanceVideoUpscaler(req, res, {
        referenceVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-topaz-video-upscaler") {
      return runTopazVideoUpscaler(req, res, {
        referenceVideoUrls,
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-wan-fun-control") {
      return runWanFunControlVideo(req, res, {
        prompt,
        referenceImageUrls,
        referenceVideoUrls
      });
    }

    return res.status(400).json({ error: "Unsupported Utility video model." });
  } catch (error) {
    console.error(error);
    sendApiError(res, error, "Utility video failed.");
  }
});

app.post("/api/node/qwen-camera-edit", async (req, res) => {
  try {
    if (!process.env.FAL_KEY) {
      return res.status(400).json({ error: "Missing FAL_KEY in .env." });
    }

    const imageUrl = firstLocalOutput(req.body.imageUrls);
    if (!imageUrl) {
      return res.status(400).json({ error: "Qwen Camera Edit requires a connected image." });
    }

    const endpoint = "fal-ai/qwen-image-edit-2511-multiple-angles";
    const input = {
      image_urls: [await uploadLocalOutputToFal(imageUrl)],
      horizontal_angle: clampNumber(req.body.horizontalAngle, 0, 360, 90),
      vertical_angle: clampNumber(req.body.verticalAngle, -30, 90, 0),
      zoom: clampNumber(req.body.zoom, 0, 10, 5),
      additional_prompt: String(req.body.additionalPrompt || "").trim(),
      lora_scale: clampNumber(req.body.loraScale, 0, 2, 1),
      guidance_scale: clampNumber(req.body.guidanceScale, 1, 12, 4.5),
      num_inference_steps: clampInteger(req.body.numInferenceSteps, 1, 60, 28),
      acceleration: "regular",
      output_format: "png",
      num_images: 1,
      enable_safety_checker: true
    };

    const result = await subscribeFal(endpoint, { input, logs: true });
    const remoteImage = firstFalImageResult(result?.data);

    if (!remoteImage?.url) {
      return res.status(502).json({ error: "Fal returned no Qwen camera image URL.", raw: result?.data });
    }

    const output = await downloadImage(req, remoteImage.url, "qwen-camera-edit", remoteImage.content_type || remoteImage.mimeType);
    const prompt = result?.data?.prompt || qwenCameraPromptLabel(input);
    const cost = estimateQwenCameraEditCost({ endpoint, image: remoteImage });

    await appendHistory({
      id: result.requestId || randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "image",
      provider: "fal.ai",
      modelName: "Qwen Image Edit 2511 Multiple Angles",
      endpoint,
      mode: "3D camera angle image edit",
      prompt,
      submittedPrompt: prompt,
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        horizontalAngle: input.horizontal_angle,
        verticalAngle: input.vertical_angle,
        zoom: input.zoom,
        additionalPrompt: input.additional_prompt,
        loraScale: input.lora_scale,
        guidanceScale: input.guidance_scale,
        numInferenceSteps: input.num_inference_steps,
        acceleration: input.acceleration,
        outputFormat: input.output_format,
        sourceImageCount: 1,
        seed: result?.data?.seed ?? null
      },
      cost,
      remoteImage,
      localImage: output.publicPath,
      outputFileName: output.fileName,
      outputBytes: output.bytes,
      text: prompt
    });

    return res.json({
      requestId: result.requestId,
      endpoint,
      prompt,
      seed: result?.data?.seed,
      cost,
      image: {
        ...remoteImage,
        localUrl: output.publicPath,
        fileName: output.fileName,
        mimeType: output.mimeType
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Qwen camera edit failed." });
  }
});

async function runExtractFrameUtilityVideo(req, res, { referenceVideoUrls }) {
  const sourceVideoUrl = referenceVideoUrls.at(-1);
  if (!sourceVideoUrl) {
    return res.status(400).json({ error: "Extract Frame requires a connected video." });
  }

  return res.json(await createExtractFrameResult({ body: req.body, sourceVideoUrl }));
}

async function runColorIdMatteUtilityVideo(req, res, { referenceVideoUrls }) {
  const sourceVideoUrl = referenceVideoUrls.at(-1);
  if (!sourceVideoUrl) {
    return res.status(400).json({ error: "Color ID Matte requires a connected video." });
  }

  return res.json(await createColorIdMatteVideoResult({ body: req.body, sourceVideoUrl }));
}

async function runCompositeUtilityVideo(req, res, { referenceVideoUrls, maskVideoUrls }) {
  if (referenceVideoUrls.length < 2) {
    return res.status(400).json({ error: "Composite Video requires a base video and a layer video connected to Video." });
  }

  const maskVideoUrl = firstLocalOutput(maskVideoUrls);
  if (!maskVideoUrl) {
    return res.status(400).json({ error: "Composite Video requires a connected mask video." });
  }

  return res.json(
    await createCompositeVideoResult({
      body: req.body,
      baseVideoUrl: firstLocalOutput(referenceVideoUrls),
      layerVideoUrl: firstLocalOutput(referenceVideoUrls.slice(-1)),
      maskVideoUrl
    })
  );
}

app.post("/api/node/generate-video", async (req, res) => {
  try {
    if (!process.env.FAL_KEY) {
      return res.status(400).json({ error: "Missing FAL_KEY in .env." });
    }

    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const selectedVideoModel = resolveVideoModel(req.body.model);

    if (selectedVideoModel.provider === "disabled") {
      return res.status(400).json({ error: `${selectedVideoModel.displayName} is temporarily disabled.` });
    }

    if (selectedVideoModel.provider === "fal-wan-fun-control") {
      return runWanFunControlVideo(req, res, {
        prompt,
        referenceImageUrls: Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [],
        referenceVideoUrls: Array.isArray(req.body.referenceVideoUrls) ? req.body.referenceVideoUrls.filter(isLocalAssetUrl) : []
      });
    }

    if (selectedVideoModel.provider === "fal-wan-2-7-reference-to-video") {
      return runWan27ReferenceVideo(req, res, {
        prompt,
        referenceImageUrls: Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [],
        referenceVideoUrls: Array.isArray(req.body.referenceVideoUrls) ? req.body.referenceVideoUrls.filter(isLocalAssetUrl) : [],
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-aurora") {
      return runAuroraVideo(req, res, {
        prompt,
        referenceImageUrls: Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [],
        referenceAudioUrls: Array.isArray(req.body.referenceAudioUrls) ? req.body.referenceAudioUrls.filter(isLocalAssetUrl) : []
      });
    }

    if (selectedVideoModel.provider === "fal-sam3-video") {
      return runSam3VideoSegmentation(req, res, {
        prompt,
        referenceVideoUrls: Array.isArray(req.body.referenceVideoUrls) ? req.body.referenceVideoUrls.filter(isLocalAssetUrl) : []
      });
    }

    if (selectedVideoModel.provider === "fal-happy-horse") {
      return runHappyHorseReferenceVideo(req, res, {
        prompt,
        referenceImageUrls: Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [],
        selectedVideoModel
      });
    }

    if (selectedVideoModel.provider === "fal-luma-ray2") {
      return runLumaRay2Video(req, res, {
        prompt,
        startFrameUrls: Array.isArray(req.body.startFrameUrls) ? req.body.startFrameUrls.filter(isLocalAssetUrl) : [],
        endFrameUrls: Array.isArray(req.body.endFrameUrls) ? req.body.endFrameUrls.filter(isLocalAssetUrl) : [],
        referenceImageUrls: Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [],
        selectedVideoModel
      });
    }

    const speed = selectedVideoModel.speed;
    const speedPrefix = speed === "fast" ? "fast/" : "";
    const startFrameUrl = firstLocalOutput(req.body.startFrameUrls);
    const endFrameUrl = firstLocalOutput(req.body.endFrameUrls);
    const rawReferenceImageUrls = Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls : [];
    const rawReferenceImageLabels = Array.isArray(req.body.referenceImageLabels) ? req.body.referenceImageLabels : [];
    const referenceImages = rawReferenceImageUrls
      .map((url, index) => ({ url, label: rawReferenceImageLabels[index] }))
      .filter(({ url }) => isLocalAssetUrl(url));
    const referenceImageUrls = referenceImages.map(({ url }) => url);
    const referenceImageNames = normalizeReferenceNames(referenceImages.map(({ label }) => label), referenceImageUrls.length);
    const rawReferenceVideoUrls = Array.isArray(req.body.referenceVideoUrls) ? req.body.referenceVideoUrls : [];
    const rawReferenceVideoLabels = Array.isArray(req.body.referenceVideoLabels) ? req.body.referenceVideoLabels : [];
    const referenceVideos = rawReferenceVideoUrls
      .map((url, index) => ({ url, label: rawReferenceVideoLabels[index] }))
      .filter(({ url }) => isLocalAssetUrl(url));
    const referenceVideoUrls = referenceVideos.map(({ url }) => url);
    const referenceVideoNames = normalizeReferenceNames(referenceVideos.map(({ label }) => label), referenceVideoUrls.length, "Video");
    const referenceAudioUrls = Array.isArray(req.body.referenceAudioUrls) ? req.body.referenceAudioUrls.filter(isLocalAssetUrl) : [];
    const resolution = normalizeChoice(req.body.resolution, ["480p", "720p", "1080p"], "720p");
    const duration = normalizeDuration(req.body.duration);
    const aspectRatio = normalizeAspectRatio(req.body.aspectRatio);
    const generateAudio = Boolean(req.body.generateAudio);

    let routeKind = "text-to-video";
    if (startFrameUrl) {
      routeKind = "image-to-video";
    } else if (referenceImageUrls.length || referenceVideoUrls.length || referenceAudioUrls.length) {
      routeKind = "reference-to-video";
    }

    const submittedPrompt =
      routeKind === "reference-to-video"
        ? rewriteReferenceMentions(prompt, {
            imageNames: referenceImageNames,
            videoNames: referenceVideoNames
          })
        : prompt;
    const input = {
      prompt: submittedPrompt,
      resolution,
      duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio
    };

    if (routeKind === "image-to-video") {
      input.image_url = await uploadLocalOutputToFal(startFrameUrl);
      if (endFrameUrl) {
        input.end_image_url = await uploadLocalOutputToFal(endFrameUrl);
      }
    }

    if (routeKind === "reference-to-video") {
      if (referenceImageUrls.length) {
        input.image_urls = await Promise.all(referenceImageUrls.map(uploadLocalOutputToFal));
      }
      if (referenceVideoUrls.length) {
        input.video_urls = await Promise.all(referenceVideoUrls.map(uploadLocalOutputToFal));
      }
      if (referenceAudioUrls.length) {
        input.audio_urls = await Promise.all(referenceAudioUrls.slice(0, 3).map(uploadLocalOutputToFal));
      }
    }

    const endpoint = `bytedance/seedance-2.0/${speedPrefix}${routeKind}`;
    const result = await subscribeFal(endpoint, { input, logs: true });
    const remoteVideo = result?.data?.video;

    if (!remoteVideo?.url) {
      return res.status(502).json({ error: "Fal returned no video URL.", raw: result?.data });
    }

    const output = await downloadVideo(req, remoteVideo.url, routeKind);
    const cost = estimateSeedanceCost({
      speed,
      duration,
      resolution,
      aspectRatio,
      endpoint,
      routeKind
    });
    await appendHistory({
      id: result.requestId || randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "video",
      provider: "fal.ai",
      modelName: speed === "fast" ? "Seedance 2.0 Fast" : "Seedance 2.0",
      endpoint,
      mode: routeKindLabel(routeKind, speed),
      prompt,
      submittedPrompt,
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        speed,
        resolution,
        duration,
        aspectRatio,
        generateAudio,
        startFrameCount: startFrameUrl ? 1 : 0,
        endFrameCount: endFrameUrl ? 1 : 0,
        referenceImageCount: referenceImageUrls.length,
        referenceImageNames,
        referenceVideoCount: referenceVideoUrls.length,
        referenceVideoNames,
        referenceAudioCount: referenceAudioUrls.length,
        seed: result?.data?.seed ?? null
      },
      cost,
      remoteVideo,
      localVideo: output.publicPath,
      outputFileName: output.fileName,
      outputBytes: output.bytes
    });

    res.json({
      requestId: result.requestId,
      seed: result?.data?.seed,
      endpoint,
      modelName: speed === "fast" ? "Seedance 2.0 Fast" : "Seedance 2.0",
      submittedPrompt,
      cost,
      video: {
        ...remoteVideo,
        localUrl: output.publicPath,
        fileName: output.fileName
      }
    });
  } catch (error) {
    console.error(error);
    sendApiError(res, error, "Video generation failed.");
  }
});

app.post("/api/node/generate-3d", async (req, res) => {
  try {
    if (!process.env.FAL_KEY) {
      return res.status(400).json({ error: "Missing FAL_KEY in .env." });
    }

    const imageViewUrls = normalizeHunyuan3DImageViewUrls(req.body);
    if (!imageViewUrls.front) {
      return res.status(400).json({ error: "Connect a front image to the 3D node." });
    }

    const endpoint = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";
    const generateType = normalizeChoice(req.body.generateType, ["Normal", "Geometry"], "Normal");
    const enablePbr = Boolean(req.body.enablePbr) && generateType !== "Geometry";
    const faceCount = clampInteger(req.body.faceCount, 40000, 1500000, 500000);
    const uploadedViewUrls = Object.fromEntries(
      await Promise.all(Object.entries(imageViewUrls).map(async ([view, url]) => [view, await localAssetToFalUrl(url)]))
    );
    const input = {
      input_image_url: uploadedViewUrls.front,
      generate_type: generateType,
      enable_pbr: enablePbr,
      face_count: faceCount
    };
    const viewFields = {
      back: "back_image_url",
      left: "left_image_url",
      right: "right_image_url",
      top: "top_image_url",
      bottom: "bottom_image_url",
      leftFront: "left_front_image_url",
      rightFront: "right_front_image_url"
    };

    Object.entries(viewFields).forEach(([view, field]) => {
      if (uploadedViewUrls[view]) input[field] = uploadedViewUrls[view];
    });

    const result = await subscribeFal(endpoint, { input, logs: true }, { route: "generate-3d", node: req.body.nodeId });
    const data = result?.data || {};
    const remoteModel =
      normalizeFalFile(data.model_glb) ||
      normalizeFalFile(data.model_urls?.glb) ||
      findFalMediaFile(data, "model/");

    if (!remoteModel?.url) {
      return res.status(502).json({ error: "Hunyuan 3D returned no GLB model.", raw: data });
    }

    const output = await downloadModelFile(req, remoteModel.url, "hunyuan-3d-pro", remoteModel.content_type || remoteModel.mimeType || remoteModel.mime_type);
    const remoteThumbnail = normalizeFalFile(data.thumbnail) || normalizeFalFile(data.thumbnail_url) || firstFalImageResult(data);
    let thumbnailOutput = null;
    if (remoteThumbnail?.url) {
      try {
        thumbnailOutput = await downloadImage(req, remoteThumbnail.url, "hunyuan-3d-thumbnail", remoteThumbnail.content_type || remoteThumbnail.mimeType || remoteThumbnail.mime_type);
      } catch (error) {
        console.warn("Could not download 3D thumbnail:", error.message);
      }
    }

    const cost = estimateHunyuan3DProCost({
      generateType,
      enablePbr,
      faceCount,
      inputImageCount: Object.keys(imageViewUrls).length,
      endpoint
    });

    await appendHistory({
      id: result.requestId || randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "model3d",
      provider: "fal.ai",
      modelName: "Hunyuan 3D 3.1 Pro",
      endpoint,
      mode: "Image to 3D",
      prompt: "Image to 3D",
      submittedPrompt: "Image to 3D",
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        model: req.body.model || "Hunyuan 3D 3.1 Pro",
        generateType,
        enablePbr,
        faceCount,
        imageViews: Object.keys(imageViewUrls),
        inputImageCount: Object.keys(imageViewUrls).length
      },
      cost,
      remoteModel,
      remoteThumbnail,
      modelUrls: data.model_urls || null,
      seed: data.seed ?? null,
      localModel: output.publicPath,
      localImage: thumbnailOutput?.publicPath || "",
      outputFileName: output.fileName,
      outputBytes: output.bytes
    });

    res.json({
      requestId: result.requestId,
      endpoint,
      modelName: "Hunyuan 3D 3.1 Pro",
      seed: data.seed,
      text: "Hunyuan 3D model generated.",
      cost,
      model: {
        ...remoteModel,
        label: "Hunyuan 3D model",
        localUrl: output.publicPath,
        fileName: output.fileName,
        mimeType: output.mimeType
      },
      thumbnail: thumbnailOutput
        ? {
            ...remoteThumbnail,
            localUrl: thumbnailOutput.publicPath,
            fileName: thumbnailOutput.fileName,
            mimeType: thumbnailOutput.mimeType
          }
        : null
    });
  } catch (error) {
    console.error(error);
    sendApiError(res, error, "3D generation failed.");
  }
});

async function runSam3VideoSegmentation(req, res, { prompt, referenceVideoUrls }) {
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  if (!videoUrl) {
    return res.status(400).json({ error: "SAM 3 Video requires a connected video." });
  }

  const endpoint = "fal-ai/sam-3/video";
  const options = req.body.sam3Video || {};
  const input = {
    video_url: await uploadLocalOutputToFal(videoUrl),
    prompt,
    apply_mask: false,
    video_output_type: "X264 (.mp4)",
    detection_threshold: clampNumber(options.detectionThreshold, 0, 1, 0.5)
  };

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no segmentation video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "sam-3-video-mask");
  const cost = estimateSam3VideoCost({ endpoint, frames: videoFrameCount(remoteVideo, result?.data) });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: "SAM 3 Video",
    endpoint,
    mode: "SAM 3 video mask",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: req.body.model || "SAM 3 Video",
      videoCount: 1,
      applyMask: input.apply_mask,
      outputType: input.video_output_type,
      detectionThreshold: input.detection_threshold
    },
    cost,
    remoteVideo,
    boundingboxFramesZip: normalizeFalFile(result?.data?.boundingbox_frames_zip),
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: "SAM 3 Video",
    cost,
    video: {
      ...remoteVideo,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runAuroraVideo(req, res, { prompt, referenceImageUrls, referenceAudioUrls }) {
  const imageUrl = firstLocalOutput(referenceImageUrls);
  if (!imageUrl) {
    return res.status(400).json({ error: "Creatify Aurora requires a connected image." });
  }

  const audioUrl = firstLocalOutput(referenceAudioUrls);
  if (!audioUrl) {
    return res.status(400).json({ error: "Creatify Aurora requires a connected audio file." });
  }

  const endpoint = "fal-ai/creatify/aurora";
  const resolution = normalizeChoice(req.body.resolution, ["480p", "720p"], "720p");
  const input = {
    image_url: await uploadLocalOutputToFal(imageUrl),
    audio_url: await uploadLocalOutputToFal(audioUrl),
    prompt,
    resolution
  };

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = result?.data?.video;

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "creatify-aurora");
  const cost = estimateAuroraCost({ endpoint, resolution, duration: remoteVideo.duration });
  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: "Creatify Aurora",
    endpoint,
    mode: "Aurora lipsync image and audio to video",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      resolution,
      imageCount: 1,
      audioCount: 1
    },
    cost,
    remoteVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    cost,
    video: {
      ...remoteVideo,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runHappyHorseReferenceVideo(req, res, { prompt, referenceImageUrls, selectedVideoModel }) {
  const imageUrls = referenceImageUrls.slice(0, 9);
  if (!imageUrls.length) {
    return res.status(400).json({ error: "Happy Horse requires at least one connected reference image." });
  }

  const endpoint = selectedVideoModel.id;
  const resolution = normalizeHappyHorseResolution(req.body.resolution);
  const duration = normalizeHappyHorseDuration(req.body.duration);
  const aspectRatio = normalizeHappyHorseAspectRatio(req.body.aspectRatio);
  const seed = optionalInteger(req.body.seed);
  const input = {
    prompt,
    image_urls: await Promise.all(imageUrls.map(uploadLocalOutputToFal)),
    aspect_ratio: aspectRatio,
    resolution,
    duration,
    enable_safety_checker: req.body.enableSafetyChecker !== false
  };
  if (seed !== undefined) input.seed = Math.min(2147483647, Math.max(0, seed));

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no Happy Horse video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "happy-horse-reference-to-video");
  const cost = estimateHappyHorseCost({ endpoint, resolution, duration });
  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "Happy Horse reference to video",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      resolution,
      duration,
      aspectRatio,
      referenceImageCount: imageUrls.length,
      enableSafetyChecker: input.enable_safety_checker,
      seed: result?.data?.seed ?? input.seed ?? null
    },
    cost,
    remoteVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    seed: result?.data?.seed ?? input.seed,
    endpoint,
    modelName: selectedVideoModel.displayName,
    cost,
    video: {
      ...remoteVideo,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runLumaRay2Video(req, res, { prompt, startFrameUrls, endFrameUrls, referenceImageUrls, selectedVideoModel }) {
  const startFrameUrl = firstLocalOutput(startFrameUrls) || firstLocalOutput(referenceImageUrls);
  const endFrameUrl = firstLocalOutput(endFrameUrls);
  if (endFrameUrl && !startFrameUrl) {
    return res.status(400).json({ error: "Luma Dream Machine end frame requires a start frame." });
  }

  const routeKind = startFrameUrl ? "image-to-video" : "text-to-video";
  const endpoint = routeKind === "image-to-video" ? `${selectedVideoModel.id.replace(/\/image-to-video$/i, "")}/image-to-video` : selectedVideoModel.id.replace(/\/image-to-video$/i, "");
  const resolution = normalizeLumaVideoResolution(req.body.resolution);
  const duration = normalizeLumaVideoDuration(req.body.duration);
  const aspectRatio = normalizeLumaVideoAspectRatio(req.body.aspectRatio);
  const input = {
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    duration,
    loop: Boolean(req.body.loop)
  };

  if (startFrameUrl) {
    input.image_url = await uploadLocalOutputToFal(startFrameUrl);
    if (endFrameUrl) input.end_image_url = await uploadLocalOutputToFal(endFrameUrl);
  }

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no Luma Dream Machine video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "luma-dream-machine");
  const outputVideo = enrichVideoMetadata(remoteVideo, await probeVideoFile(output.filePath));
  const cost = estimateLumaRay2Cost({ endpoint, resolution, duration, routeKind });
  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: routeKind === "image-to-video" ? "Luma Ray2 image to video" : "Luma Ray2 text to video",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedVideoModel.displayName,
      duration,
      resolution,
      aspectRatio,
      loop: input.loop,
      startFrameCount: startFrameUrl ? 1 : 0,
      endFrameCount: endFrameUrl ? 1 : 0,
      referenceImageCount: referenceImageUrls.length
    },
    cost,
    remoteVideo: outputVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    cost,
    video: {
      ...outputVideo,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runWanFunControlVideo(req, res, { prompt, referenceImageUrls, referenceVideoUrls }) {
  const controlVideoUrl = firstLocalOutput(referenceVideoUrls);
  if (!controlVideoUrl) {
    return res.status(400).json({ error: "Wan Fun Control requires a connected control video." });
  }

  const options = req.body.wanFunControl || {};
  const endpoint = "fal-ai/wan-fun-control";
  const matchInputNumFrames = options.matchInputNumFrames !== false;
  const matchInputFps = options.matchInputFps !== false;
  const preprocessVideo = options.preprocessVideo !== false;
  const input = {
    prompt,
    control_video_url: await uploadLocalOutputToFal(controlVideoUrl),
    preprocess_video: preprocessVideo,
    preprocess_type: normalizeChoice(options.preprocessType, ["depth", "pose"], "depth"),
    match_input_num_frames: matchInputNumFrames,
    match_input_fps: matchInputFps,
    num_inference_steps: clampInteger(options.numInferenceSteps, 1, 60, 27),
    guidance_scale: clampNumber(options.guidanceScale, 0, 20, 6),
    shift: clampNumber(options.shift, 0, 20, 5)
  };
  const seed = optionalInteger(options.seed);
  const referenceImageUrl = firstLocalOutput(referenceImageUrls);

  if (!matchInputNumFrames) input.num_frames = clampInteger(options.numFrames, 1, 241, 81);
  if (!matchInputFps) input.fps = clampInteger(options.fps, 1, 60, 16);
  if (seed !== undefined) input.seed = seed;
  if (referenceImageUrl) input.reference_image_url = await uploadLocalOutputToFal(referenceImageUrl);

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = result?.data?.video;

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "wan-fun-control");
  const cost = estimateWanFunControlCost({
    endpoint,
    matchInputNumFrames,
    numFrames: input.num_frames,
    matchInputFps,
    fps: input.fps
  });
  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: "Wan Fun Control",
    endpoint,
    mode: "Wan Fun Control video to video",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      preprocessVideo,
      preprocessType: input.preprocess_type,
      matchInputNumFrames,
      numFrames: input.num_frames || null,
      matchInputFps,
      fps: input.fps || null,
      numInferenceSteps: input.num_inference_steps,
      guidanceScale: input.guidance_scale,
      shift: input.shift,
      controlVideoCount: 1,
      referenceImageCount: referenceImageUrl ? 1 : 0,
      seed: result?.data?.seed ?? input.seed ?? null
    },
    cost,
    remoteVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    seed: result?.data?.seed ?? input.seed,
    endpoint,
    modelName: "Wan Fun Control",
    cost,
    video: {
      ...remoteVideo,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runWan27ReferenceVideo(req, res, { prompt, referenceImageUrls, referenceVideoUrls, selectedVideoModel }) {
  const options = req.body.wan27Reference || {};
  const endpoint = selectedVideoModel.id;
  const duration = normalizeWan27ReferenceDuration(req.body.duration);
  const resolution = normalizeChoice(req.body.resolution, ["720p", "1080p"], "1080p");
  const aspectRatio = normalizeWan27ReferenceAspectRatio(req.body.aspectRatio);
  const negativePrompt = String(options.negativePrompt || req.body.negativePrompt || "").slice(0, 500);
  const seed = optionalInteger(req.body.seed);
  const input = {
    prompt,
    negative_prompt: negativePrompt,
    aspect_ratio: aspectRatio,
    resolution,
    duration,
    multi_shots: Boolean(options.multiShots),
    enable_safety_checker: req.body.enableSafetyChecker !== false
  };

  if (seed !== undefined) input.seed = Math.min(2147483647, Math.max(0, seed));
  if (referenceImageUrls.length) input.reference_image_urls = await Promise.all(referenceImageUrls.map(uploadLocalOutputToFal));
  if (referenceVideoUrls.length) input.reference_video_urls = await Promise.all(referenceVideoUrls.map(uploadLocalOutputToFal));

  const referenceVideoDurations = await localVideoDurations(referenceVideoUrls);
  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = result?.data?.video;

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no Wan 2.7 video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "wan-2-7-reference-to-video");
  const outputVideo = enrichVideoMetadata(remoteVideo, await probeVideoFile(output.filePath));
  const cost = estimateWan27ReferenceVideoCost({
    endpoint,
    duration,
    outputVideo,
    referenceVideoDurations,
    resolution,
    aspectRatio
  });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "Wan 2.7 reference-to-video",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedVideoModel.displayName,
      negativePrompt,
      duration,
      resolution,
      aspectRatio,
      multiShots: input.multi_shots,
      enableSafetyChecker: input.enable_safety_checker,
      referenceImageCount: referenceImageUrls.length,
      referenceVideoCount: referenceVideoUrls.length,
      referenceVideoDurations,
      actualPrompt: result?.data?.actual_prompt || null,
      seed: result?.data?.seed ?? input.seed ?? null
    },
    cost,
    remoteVideo: outputVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    seed: result?.data?.seed ?? input.seed,
    endpoint,
    modelName: selectedVideoModel.displayName,
    actualPrompt: result?.data?.actual_prompt || "",
    cost,
    video: {
      ...outputVideo,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runVoidVideoInpaintingUtility(req, res, { prompt, referenceVideoUrls, maskVideoUrls, selectedVideoModel }) {
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  if (!videoUrl) {
    return res.status(400).json({ error: "VOID Video Inpainting requires a connected source video." });
  }

  const options = req.body.voidVideoInpainting || {};
  const maskPrompt = String(options.maskPrompt || "").trim();
  const maskVideoUrl = firstLocalOutput(maskVideoUrls);
  if (!maskVideoUrl && !maskPrompt) {
    return res.status(400).json({ error: "VOID Video Inpainting requires either a Mask Prompt or a connected mask video." });
  }

  const endpoint = selectedVideoModel.id;
  const input = {
    video_url: await uploadLocalOutputToFal(videoUrl),
    prompt,
    mask_prompt: maskPrompt,
    enable_pass2_refinement: Boolean(options.enablePass2Refinement),
    negative_prompt: String(options.negativePrompt || ""),
    num_inference_steps: clampInteger(options.numInferenceSteps, 1, 80, 30),
    guidance_scale: clampNumber(options.guidanceScale, 0, 20, 1),
    strength: clampNumber(options.strength, 0, 1, 1),
    num_frames: normalizeVoidVideoFrameCount(options.numFrames),
    enable_safety_checker: options.enableSafetyChecker !== false
  };
  const seed = optionalInteger(options.seed);
  if (seed !== undefined) input.seed = seed;
  if (maskVideoUrl) input.quad_mask_video_url = await uploadLocalOutputToFal(maskVideoUrl);

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no VOID video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "void-video-inpainting");
  const cost = estimateVoidVideoInpaintingCost({
    endpoint,
    enablePass2Refinement: input.enable_pass2_refinement,
    hasMaskVideo: Boolean(maskVideoUrl)
  });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "VOID video inpainting",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedVideoModel.displayName,
      maskPrompt: input.mask_prompt,
      maskVideoCount: maskVideoUrl ? 1 : 0,
      enablePass2Refinement: input.enable_pass2_refinement,
      numInferenceSteps: input.num_inference_steps,
      guidanceScale: input.guidance_scale,
      strength: input.strength,
      numFrames: input.num_frames,
      enableSafetyChecker: input.enable_safety_checker,
      seed: result?.data?.seed ?? input.seed ?? null,
      sourceVideoCount: 1
    },
    cost,
    remoteVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    seed: result?.data?.seed ?? input.seed,
    cost,
    video: {
      ...remoteVideo,
      label: "SAM 3 Mask",
      localUrl: output.publicPath,
      fileName: output.fileName
    },
    videos: [
      {
        ...remoteVideo,
        label: "SAM 3 Mask",
        localUrl: output.publicPath,
        fileName: output.fileName
      }
    ]
  });
}

async function runWanVaceMaskToVideoUtility(req, res, { prompt, referenceImageUrls, referenceVideoUrls, maskVideoUrls, selectedVideoModel }) {
  const maskVideoUrl = firstLocalOutput(maskVideoUrls);
  if (!maskVideoUrl) {
    return res.status(400).json({ error: "Wan VACE Mask-to-Video requires a connected mask video." });
  }

  if (!referenceImageUrls.length) {
    return res.status(400).json({ error: "Wan VACE Mask-to-Video requires a connected reference image." });
  }

  const endpoint = selectedVideoModel.id;
  const options = req.body.wanVaceMaskToVideo || req.body.wanVaceInpainting || {};
  const resolution = normalizeChoice(options.resolution, ["480p", "580p", "720p"], "720p");
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  const aspectRatio = await resolveWanVaceMaskToVideoAspectRatio({
    value: options.aspectRatio,
    videoUrl,
    maskVideoUrl
  });
  const preparedMedia = await prepareWanVaceMaskToVideoMedia({
    body: req.body,
    videoUrl,
    maskVideoUrl,
    referenceImageUrls: referenceImageUrls.slice(0, 4),
    aspectRatio
  });
  const refImageUrls = await Promise.all(preparedMedia.referenceImageUrls.map((url) => uploadLocalOutputToFal(url)));
  const input = {
    prompt,
    negative_prompt: String(options.negativePrompt || ""),
    task: "inpainting",
    num_frames: clampInteger(options.numFrames, 81, 100, 81),
    frames_per_second: clampInteger(options.fps, 5, 24, 16),
    shift: clampNumber(options.shift, 0, 20, 5),
    resolution,
    aspect_ratio: aspectRatio,
    num_inference_steps: clampInteger(options.numInferenceSteps, 1, 60, 30),
    mask_video_url: await uploadLocalOutputToFal(preparedMedia.maskVideoUrl),
    ref_image_urls: refImageUrls,
    enable_safety_checker: options.enableSafetyChecker !== false,
    enable_prompt_expansion: Boolean(options.enablePromptExpansion),
    preprocess: Boolean(options.preprocess)
  };
  const seed = optionalInteger(options.seed);
  if (preparedMedia.videoUrl) input.video_url = await uploadLocalOutputToFal(preparedMedia.videoUrl);
  if (seed !== undefined) input.seed = seed;

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);
  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no Wan VACE Mask-to-Video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "wan-vace-mask-to-video");
  const outputVideo = enrichVideoMetadata(remoteVideo, await probeVideoFile(output.filePath));
  const cost = estimateWanVaceInpaintingCost({
    endpoint,
    resolution,
    outputVideo,
    matchInputNumFrames: true,
    numFrames: input.num_frames,
    matchInputFps: true,
    fps: input.frames_per_second
  });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "Wan VACE mask-to-video",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      task: input.task,
      resolution,
      aspectRatio,
      numFrames: input.num_frames,
      fps: input.frames_per_second,
      numInferenceSteps: input.num_inference_steps,
      shift: input.shift,
      sourceVideoCount: preparedMedia.videoUrl ? 1 : 0,
      maskVideoCount: 1,
      referenceImageCount: refImageUrls.length,
      paddedMedia: preparedMedia.paddedMedia,
      enableSafetyChecker: input.enable_safety_checker,
      enablePromptExpansion: input.enable_prompt_expansion,
      preprocess: input.preprocess,
      seed: result?.data?.seed ?? input.seed ?? null
    },
    cost,
    remoteVideo: outputVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    seed: result?.data?.seed ?? input.seed,
    cost,
    video: {
      ...outputVideo,
      label: "Wan VACE Mask-to-Video",
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runWanVaceInpaintingUtility(req, res, { prompt, referenceImageUrls, referenceVideoUrls, maskVideoUrls, selectedVideoModel }) {
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  if (!videoUrl) {
    return res.status(400).json({ error: "Wan VACE Inpainting requires a connected source video." });
  }

  const maskVideoUrl = firstLocalOutput(maskVideoUrls);
  if (!maskVideoUrl) {
    return res.status(400).json({ error: "Wan VACE Inpainting requires a connected mask video." });
  }

  const endpoint = selectedVideoModel.id;
  const options = req.body.wanVaceInpainting || {};
  const matchInputNumFrames = options.matchInputNumFrames !== false;
  const matchInputFps = options.matchInputFps !== false;
  const resolution = normalizeChoice(options.resolution, ["auto", "240p", "360p", "480p", "580p", "720p"], "auto");
  const aspectRatio = normalizeChoice(options.aspectRatio, ["auto", "16:9", "1:1", "9:16"], "auto");
  const refImageUrls = await Promise.all(referenceImageUrls.slice(0, 4).map((url) => uploadLocalOutputToFal(url)));
  const input = {
    prompt,
    negative_prompt: String(options.negativePrompt || ""),
    match_input_num_frames: matchInputNumFrames,
    match_input_frames_per_second: matchInputFps,
    resolution,
    aspect_ratio: aspectRatio,
    num_inference_steps: clampInteger(options.numInferenceSteps, 1, 60, 30),
    guidance_scale: clampNumber(options.guidanceScale, 0, 20, 5),
    sampler: normalizeChoice(options.sampler, ["unipc", "dpm++", "euler"], "unipc"),
    shift: clampNumber(options.shift, 0, 20, 5),
    video_url: await uploadLocalOutputToFal(videoUrl),
    mask_video_url: await uploadLocalOutputToFal(maskVideoUrl),
    enable_safety_checker: options.enableSafetyChecker !== false,
    enable_prompt_expansion: Boolean(options.enablePromptExpansion),
    preprocess: Boolean(options.preprocess),
    acceleration: normalizeChoice(options.acceleration, ["none", "low", "regular"], "regular"),
    video_quality: normalizeChoice(options.videoQuality, ["low", "medium", "high", "maximum"], "high"),
    video_write_mode: normalizeChoice(options.videoWriteMode, ["fast", "balanced", "small"], "balanced"),
    num_interpolated_frames: Math.max(0, Math.round(Number(options.numInterpolatedFrames || 0))),
    sync_mode: false,
    return_frames_zip: false
  };
  if (refImageUrls.length) input.ref_image_urls = refImageUrls;
  const seed = optionalInteger(options.seed);
  if (!matchInputNumFrames) input.num_frames = clampInteger(options.numFrames, 81, 241, 81);
  if (!matchInputFps) input.frames_per_second = clampInteger(options.fps, 5, 30, 16);
  if (seed !== undefined) input.seed = seed;

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);
  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no Wan VACE video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "wan-vace-inpainting");
  const outputVideo = enrichVideoMetadata(remoteVideo, await probeVideoFile(output.filePath));
  const cost = estimateWanVaceInpaintingCost({
    endpoint,
    resolution,
    outputVideo,
    matchInputNumFrames,
    numFrames: input.num_frames,
    matchInputFps,
    fps: input.frames_per_second
  });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "Wan VACE inpainting",
    prompt,
    submittedPrompt: prompt,
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      matchInputNumFrames,
      numFrames: input.num_frames || null,
      matchInputFps,
      fps: input.frames_per_second || null,
      resolution,
      aspectRatio,
      numInferenceSteps: input.num_inference_steps,
      guidanceScale: input.guidance_scale,
      sampler: input.sampler,
      shift: input.shift,
      referenceImageCount: refImageUrls.length,
      maskVideoCount: 1,
      enableSafetyChecker: input.enable_safety_checker,
      enablePromptExpansion: input.enable_prompt_expansion,
      preprocess: input.preprocess,
      acceleration: input.acceleration,
      videoQuality: input.video_quality,
      videoWriteMode: input.video_write_mode,
      numInterpolatedFrames: input.num_interpolated_frames,
      seed: result?.data?.seed ?? input.seed ?? null
    },
    cost,
    remoteVideo: outputVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    seed: result?.data?.seed ?? input.seed,
    cost,
    video: {
      ...outputVideo,
      label: "Wan VACE",
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runBirefnetUtilityVideo(req, res, { referenceVideoUrls, selectedVideoModel }) {
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  if (!videoUrl) {
    return res.status(400).json({ error: "BiRefNet Video requires a connected video." });
  }

  const endpoint = selectedVideoModel.id;
  const options = req.body.birefnet || {};
  const input = {
    video_url: await uploadLocalOutputToFal(videoUrl),
    model: normalizeChoice(options.model, birefnetModelOptions, "General Use (Light)"),
    operating_resolution: normalizeChoice(options.operatingResolution, birefnetResolutionOptions, "1024x1024"),
    output_mask: Boolean(options.outputMask),
    refine_foreground: options.refineForeground !== false,
    video_output_type: normalizeChoice(options.videoOutputType, ["X264 (.mp4)", "VP9 (.webm)", "PRORES4444 (.mov)", "GIF (.gif)"], "X264 (.mp4)"),
    video_quality: normalizeChoice(options.videoQuality, ["low", "medium", "high", "maximum"], "high"),
    video_write_mode: normalizeChoice(options.videoWriteMode, ["fast", "balanced", "small"], "balanced")
  };
  if (input.operating_resolution === "2304x2304" && input.model !== "General Use (Dynamic)") {
    input.operating_resolution = "2048x2048";
  }

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video) || findFalMediaFile(result?.data, "video/");
  const remoteMaskVideo = normalizeFalFile(result?.data?.mask_video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no BiRefNet video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "birefnet-video");
  const videos = [
    {
      remoteVideo,
      output,
      label: "BiRefNet RGB"
    }
  ];

  if (input.output_mask && remoteMaskVideo?.url && remoteMaskVideo.url !== remoteVideo.url) {
    const maskOutput = await downloadVideo(req, remoteMaskVideo.url, "birefnet-mask-video");
    videos.push({
      remoteVideo: remoteMaskVideo,
      output: maskOutput,
      label: "BiRefNet Mask"
    });
  }

  const cost = estimateFalVideoUtilityCost({
    endpoint,
    amountUsd: 0,
    unitRateUsd: 0,
    units: falTimingSeconds(result) || 0,
    unit: "compute second",
    pricingBasis: "BiRefNet v2 fal.ai video background removal listed at $0 per compute second"
  });
  const outputBytes = videos.reduce((sum, item) => sum + item.output.bytes, 0);

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "BiRefNet video background removal",
    prompt: "BiRefNet video background removal.",
    submittedPrompt: "BiRefNet video background removal.",
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: input.model,
      operatingResolution: input.operating_resolution,
      outputMask: input.output_mask,
      refineForeground: input.refine_foreground,
      videoOutputType: input.video_output_type,
      videoQuality: input.video_quality,
      videoWriteMode: input.video_write_mode,
      sourceVideoCount: 1
    },
    cost,
    remoteVideo,
    remoteMaskVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    cost,
    video: {
      ...remoteVideo,
      label: videos[0].label,
      localUrl: output.publicPath,
      fileName: output.fileName
    },
    videos: videos.map(({ remoteVideo, output, label }) => ({
      ...remoteVideo,
      label,
      localUrl: output.publicPath,
      fileName: output.fileName
    }))
  });
}

async function runRifeVideoInterpolation(req, res, { referenceVideoUrls, selectedVideoModel }) {
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  if (!videoUrl) {
    return res.status(400).json({ error: "RIFE Video requires a connected video." });
  }

  const endpoint = selectedVideoModel.id;
  const options = req.body.rifeVideo || {};
  const useCalculatedFps = options.useCalculatedFps !== false;
  const input = {
    video_url: await uploadLocalOutputToFal(videoUrl),
    num_frames: clampInteger(options.numFrames, 1, 8, 1),
    use_scene_detection: options.useSceneDetection !== false,
    use_calculated_fps: useCalculatedFps,
    loop: Boolean(options.loop)
  };
  if (!useCalculatedFps) input.fps = clampInteger(options.fps, 1, 120, 24);

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no RIFE video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "rife-video-interpolation");
  const cost = estimateFalVideoUtilityCost({
    endpoint,
    pricingBasis: "RIFE video interpolation fal.ai request; local price estimate not configured"
  });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "RIFE video frame interpolation",
    prompt: `RIFE interpolation: ${input.num_frames} in-between frame${input.num_frames === 1 ? "" : "s"}.`,
    submittedPrompt: "",
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedVideoModel.displayName,
      numFrames: input.num_frames,
      useSceneDetection: input.use_scene_detection,
      useCalculatedFps: input.use_calculated_fps,
      fps: input.fps || null,
      loop: input.loop,
      sourceVideoCount: 1
    },
    cost,
    remoteVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    cost,
    video: {
      ...remoteVideo,
      label: selectedVideoModel.displayName,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runBytedanceVideoUpscaler(req, res, { referenceVideoUrls, selectedVideoModel }) {
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  if (!videoUrl) {
    return res.status(400).json({ error: "Bytedance Video Upscaler requires a connected video." });
  }

  const endpoint = selectedVideoModel.id;
  const options = req.body.bytedanceVideoUpscaler || {};
  const scaleRatio = optionalNumber(options.scaleRatio);
  const input = {
    video_url: await uploadLocalOutputToFal(videoUrl),
    target_resolution: normalizeChoice(options.targetResolution, bytedanceUpscalerResolutionOptions, "1080p"),
    target_fps: normalizeChoice(options.targetFps, bytedanceUpscalerFpsOptions, "30fps"),
    enhancement_preset: normalizeChoice(options.enhancementPreset, bytedanceUpscalerPresetOptions, "general"),
    enhancement_tier: normalizeChoice(options.enhancementTier, bytedanceUpscalerTierOptions, "standard"),
    fidelity: normalizeChoice(options.fidelity, bytedanceUpscalerFidelityOptions, "high")
  };
  if (scaleRatio !== undefined) input.scale_ratio = Math.min(10, Math.max(1.1, scaleRatio));

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no Bytedance upscaled video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "bytedance-video-upscaler");
  const outputVideo = enrichVideoMetadata(remoteVideo, await probeVideoFile(output.filePath));
  const cost = estimateBytedanceVideoUpscalerCost({
    endpoint,
    targetResolution: input.target_resolution,
    targetFps: input.target_fps,
    enhancementTier: input.enhancement_tier,
    duration: result?.data?.duration ?? outputVideo.duration
  });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "Bytedance video upscale",
    prompt: bytedanceUpscalerPromptLabel(input),
    submittedPrompt: "",
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: selectedVideoModel.displayName,
      targetResolution: input.target_resolution,
      targetFps: input.target_fps,
      enhancementPreset: input.enhancement_preset,
      enhancementTier: input.enhancement_tier,
      fidelity: input.fidelity,
      scaleRatio: input.scale_ratio || null,
      durationSeconds: cost.durationSeconds || null,
      sourceVideoCount: 1
    },
    cost,
    remoteVideo: outputVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    cost,
    video: {
      ...outputVideo,
      label: selectedVideoModel.displayName,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

async function runTopazVideoUpscaler(req, res, { referenceVideoUrls, selectedVideoModel }) {
  const videoUrl = firstLocalOutput(referenceVideoUrls);
  if (!videoUrl) {
    return res.status(400).json({ error: "Topaz Video Upscale requires a connected video." });
  }

  const endpoint = selectedVideoModel.id;
  const options = req.body.topazVideoUpscaler || {};
  const targetFps = optionalInteger(options.targetFps);
  const input = {
    video_url: await uploadLocalOutputToFal(videoUrl),
    model: normalizeChoice(options.model, topazUpscalerModelOptions, "Proteus"),
    upscale_factor: clampNumber(options.upscaleFactor, 1, 8, 2),
    H264_output: Boolean(options.h264Output)
  };
  if (targetFps !== undefined) input.target_fps = Math.min(120, Math.max(16, targetFps));
  addOptionalRangeInput(input, "compression", options.compression, 0, 1);
  addOptionalRangeInput(input, "noise", options.noise, 0, 1);
  addOptionalRangeInput(input, "halo", options.halo, 0, 1);
  addOptionalRangeInput(input, "grain", options.grain, 0, 0.1);
  addOptionalRangeInput(input, "recover_detail", options.recoverDetail, 0, 1);

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no Topaz upscaled video URL.", raw: result?.data });
  }

  const output = await downloadVideo(req, remoteVideo.url, "topaz-video-upscale");
  const outputVideo = enrichVideoMetadata(remoteVideo, await probeVideoFile(output.filePath));
  const billingTier = normalizeChoice(options.billingResolutionTier, topazUpscalerBillingTierOptions, "auto");
  const cost = estimateTopazVideoUpscalerCost({
    endpoint,
    model: input.model,
    targetFps: input.target_fps,
    billingResolutionTier: billingTier,
    remoteVideo: outputVideo,
    duration: result?.data?.duration ?? outputVideo.duration
  });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: selectedVideoModel.displayName,
    endpoint,
    mode: "Topaz video upscale",
    prompt: topazUpscalerPromptLabel(input, billingTier),
    submittedPrompt: "",
    project: projectFromBody(req.body),
    node: nodeFromBody(req.body),
    settings: {
      model: input.model,
      upscaleFactor: input.upscale_factor,
      targetFps: input.target_fps || "source",
      h264Output: input.H264_output,
      billingResolutionTier: cost.billingResolutionTier || billingTier,
      compression: input.compression ?? null,
      noise: input.noise ?? null,
      halo: input.halo ?? null,
      grain: input.grain ?? null,
      recoverDetail: input.recover_detail ?? null,
      durationSeconds: cost.durationSeconds || null,
      sourceVideoCount: 1
    },
    cost,
    remoteVideo: outputVideo,
    localVideo: output.publicPath,
    outputFileName: output.fileName,
    outputBytes: output.bytes
  });

  return res.json({
    requestId: result.requestId,
    endpoint,
    modelName: selectedVideoModel.displayName,
    cost,
    video: {
      ...outputVideo,
      label: selectedVideoModel.displayName,
      localUrl: output.publicPath,
      fileName: output.fileName
    }
  });
}

app.post(
  "/api/generate",
  upload.fields([
    { name: "startFrame", maxCount: 1 },
    { name: "endFrame", maxCount: 1 },
    { name: "references", maxCount: 9 }
  ]),
  async (req, res) => {
    try {
      if (!process.env.FAL_KEY) {
        return res.status(400).json({ error: "Missing FAL_KEY in .env. Add your Fal API key, then restart the server." });
      }

      const prompt = String(req.body.prompt || "").trim();
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required." });
      }

      const startFrame = req.files?.startFrame?.[0];
      const endFrame = req.files?.endFrame?.[0];
      const references = req.files?.references || [];
      const referenceNames = parseReferenceNames(req.body.referenceNames, references.length);

      if (endFrame && !startFrame) {
        return res.status(400).json({ error: "End frame requires a start frame." });
      }

      const speed = normalizeChoice(req.body.speed, ["standard", "fast"], "standard");
      const resolution = normalizeChoice(req.body.resolution, ["480p", "720p", "1080p"], "720p");
      const duration = normalizeChoice(req.body.duration, ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], "15");
      const aspectRatio = normalizeChoice(req.body.aspectRatio, ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "21:9");
      const generateAudio = String(req.body.generateAudio ?? "true") === "true";
      const seed = req.body.seed ? Number(req.body.seed) : undefined;

      const route = resolveRoute({ startFrame, references, speed });
      const promptForFal = route.kind === "reference-to-video" ? rewriteReferenceMentions(prompt, referenceNames) : prompt;
      const input = {
        prompt: promptForFal,
        resolution,
        duration,
        aspect_ratio: aspectRatio,
        generate_audio: generateAudio
      };

      if (Number.isInteger(seed)) {
        input.seed = seed;
      }

      const uploadedFiles = [];

      if (route.kind === "image-to-video") {
        const imageUrl = await uploadToFal(startFrame);
        uploadedFiles.push({ role: "startFrame", local: startFrame.filename, url: imageUrl });
        input.image_url = imageUrl;

        if (endFrame) {
          const endImageUrl = await uploadToFal(endFrame);
          uploadedFiles.push({ role: "endFrame", local: endFrame.filename, url: endImageUrl });
          input.end_image_url = endImageUrl;
        }
      }

      if (route.kind === "reference-to-video") {
        const imageUrls = [];
        for (const reference of references) {
          const referenceUrl = await uploadToFal(reference);
          imageUrls.push(referenceUrl);
          uploadedFiles.push({ role: "reference", name: referenceNames[imageUrls.length - 1], local: reference.filename, url: referenceUrl });
        }
        input.image_urls = imageUrls;
      }

      const result = await subscribeFal(route.endpoint, {
        input,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            for (const log of update.logs || []) {
              console.log(`[fal] ${log.message}`);
            }
          }
        }
      });

      const remoteVideo = result?.data?.video;
      if (!remoteVideo?.url) {
        return res.status(502).json({ error: "Fal returned no video URL.", raw: result?.data });
      }

      const output = await downloadVideo(req, remoteVideo.url, route.kind);
      const cost = estimateSeedanceCost({
        speed,
        duration,
        resolution,
        aspectRatio,
        endpoint: route.endpoint,
        routeKind: route.kind
      });
      const historyItem = {
        id: result.requestId || randomUUID(),
        createdAt: new Date().toISOString(),
        mediaType: "video",
        provider: "fal.ai",
        modelName: speed === "fast" ? "Seedance 2.0 Fast" : "Seedance 2.0",
        prompt,
        submittedPrompt: promptForFal,
        endpoint: route.endpoint,
        mode: route.label,
        project: {
          id: "video",
          name: "Video"
        },
        referenceNames,
        settings: {
          speed,
          resolution,
          duration,
          aspectRatio,
          generateAudio,
          seed: result?.data?.seed ?? seed ?? null
        },
        cost,
        uploadedFiles,
        remoteVideo,
        localVideo: output.publicPath,
        outputFileName: output.fileName,
        outputBytes: output.bytes
      };

      await appendHistory(historyItem);

      res.json({
        requestId: result.requestId,
        seed: result?.data?.seed,
        endpoint: route.endpoint,
        mode: route.label,
        cost,
        video: {
          ...remoteVideo,
          localUrl: output.publicPath,
          fileName: output.fileName
        }
      });
    } catch (error) {
      console.error(error);
      sendApiError(res, error, "Generation failed.");
    }
  }
);

app.use("/api", (error, _req, res, _next) => {
  console.error(error);
  sendApiError(res, error, "API request failed.");
});

const httpServer = app.listen(port, "127.0.0.1", () => {
  console.log(`NewtNode server running on http://127.0.0.1:${port}`);
});

httpServer.on("error", (error) => {
  console.error("NewtNode server failed to start.", error);
});

function resolveRoute({ startFrame, references, speed }) {
  const speedPrefix = speed === "fast" ? "fast/" : "";

  if (startFrame) {
    return {
      kind: "image-to-video",
      label: speed === "fast" ? "Fast image to video" : "Image to video",
      endpoint: `bytedance/seedance-2.0/${speedPrefix}image-to-video`
    };
  }

  if (references?.length) {
    return {
      kind: "reference-to-video",
      label: speed === "fast" ? "Fast reference to video" : "Reference to video",
      endpoint: `bytedance/seedance-2.0/${speedPrefix}reference-to-video`
    };
  }

  return {
    kind: "text-to-video",
    label: speed === "fast" ? "Fast text to video" : "Text to video",
    endpoint: `bytedance/seedance-2.0/${speedPrefix}text-to-video`
  };
}

function normalizeChoice(value, choices, fallback) {
  const normalized = String(value || fallback);
  return choices.includes(normalized) ? normalized : fallback;
}

function normalizeHunyuan3DImageViewUrls(body = {}) {
  const viewOrder = ["front", "back", "left", "right", "top", "bottom", "leftFront", "rightFront"];
  const viewUrls = body.imageViewUrls && typeof body.imageViewUrls === "object" && !Array.isArray(body.imageViewUrls) ? body.imageViewUrls : {};
  const normalized = {};

  viewOrder.forEach((view) => {
    const url = String(viewUrls[view] || "").trim();
    if (isLocalAssetUrl(url)) normalized[view] = url;
  });

  const legacyUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(isLocalAssetUrl).slice(0, viewOrder.length) : [];
  legacyUrls.forEach((url, index) => {
    const view = viewOrder[index];
    if (!normalized[view]) normalized[view] = url;
  });

  return normalized;
}

function parseReferenceNames(rawValue, count) {
  let names = [];

  try {
    names = JSON.parse(rawValue || "[]");
  } catch {
    names = [];
  }

  return normalizeReferenceNames(names, count);
}

function normalizeReferenceNames(names, count, fallbackPrefix = "Image") {
  const usedNames = new Set();
  return Array.from({ length: count }, (_value, index) => {
    const fallback = `${fallbackPrefix}${index + 1}`;
    const baseName = cleanReferenceName(Array.isArray(names) ? names[index] : "") || fallback;
    return uniqueReferenceName(baseName, usedNames);
  });
}

function rewriteReferenceMentions(prompt, referenceNames) {
  if (Array.isArray(referenceNames)) {
    return rewriteReferenceMentions(prompt, { imageNames: referenceNames });
  }

  const mentionMap = new Map();
  const imageNames = referenceNames?.imageNames || [];
  const videoNames = referenceNames?.videoNames || [];

  imageNames.forEach((name, index) => {
    mentionMap.set(name.toLowerCase(), `@Image${index + 1}`);
  });
  videoNames.forEach((name, index) => {
    mentionMap.set(name.toLowerCase(), `@Video${index + 1}`);
  });

  return prompt.replace(/@([A-Za-z0-9_-]+)/g, (fullMatch, name) => mentionMap.get(name.toLowerCase()) || fullMatch);
}

function cleanReferenceName(value) {
  return String(value || "")
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 28);
}

function cleanImagePromptLabel(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_. -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function imageReferenceLabelPrompt(label) {
  const cleanLabel = cleanImagePromptLabel(label);
  if (!cleanLabel) return "";
  if (/composer/i.test(cleanLabel)) {
    return `Reference image label: ${cleanLabel}. This is a Composer frame for composition and blocking control. Use its camera angle, framing, horizon, subject silhouette, pose direction, object placement, scale relationships, and negative space as the layout guide. Do not copy viewport guide lines, grid lines, blue material, or primitive geometry as final image details.`;
  }

  return `Reference image label: ${cleanLabel}`;
}

function safePathSegment(value) {
  return String(value || "mood-board")
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 80) || "mood-board";
}

function safeWorkflowFileName(value) {
  const fileName = path.basename(String(value || ""));
  if (!fileName.toLowerCase().endsWith(".json")) return "";
  return fileName.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
}

function workflowFileNameForName(name) {
  return `${safePathSegment(name || "workflow")}.json`;
}

function uniqueWorkflowFileName(name, workflows) {
  const usedNames = new Set(workflows.map((workflow) => workflow.fileName.toLowerCase()));
  const baseName = safePathSegment(name || "workflow") || "workflow";
  let fileName = workflowFileNameForName(baseName);
  let suffix = 2;

  while (usedNames.has(fileName.toLowerCase())) {
    fileName = `${baseName}-${suffix}.json`;
    suffix += 1;
  }

  return fileName;
}

function safeRelativeAssetPath(value) {
  const normalized = path.normalize(String(value || "").replace(/^[/\\]+/, ""));
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith("..")) return "";
  return normalized;
}

function safePackageFileName(value, fallback = "asset") {
  const extension = path.extname(String(value || ""));
  const base = path
    .basename(String(value || fallback), extension)
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || fallback;
  const safeExtension = extension.replace(/[^A-Za-z0-9.]+/g, "").slice(0, 16);
  return `${base}${safeExtension || ""}`;
}

function workflowPackagePublicPath(workflowId, relativePath) {
  return `${workflowAssetsPrefix}/${encodeURIComponent(workflowId)}/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function workflowPackagePathFromSaveRequest(body, existing, name) {
  const explicitPackagePath = normalizeWorkflowPackagePath(body.packagePath || body.workflowPackagePath);
  if (explicitPackagePath) return explicitPackagePath;

  const existingPackagePath = normalizeWorkflowPackagePath(existing?.packagePath || existing?.package?.rootPath);
  if (existingPackagePath && !body.packageParentPath) return existingPackagePath;

  const parentPath = normalizeWorkflowPackagePath(body.packageParentPath);
  if (!parentPath) return "";
  return path.join(parentPath, safePathSegment(name || "workflow"));
}

function normalizeWorkflowPackagePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.resolve(raw);
}

function workflowPackageContextFromBody(body = {}) {
  const packagePath = normalizeWorkflowPackagePath(body.workflowPackagePath || body.packagePath);
  if (!packagePath) return null;

  return {
    id: String(body.workflowPackageId || body.projectId || body.id || randomUUID()).trim(),
    packagePath
  };
}

async function ensureWorkflowPackageDirs(packagePath) {
  const metadataDir = path.join(packagePath, workflowPackageMetadataDirName);
  await Promise.all([
    mkdir(packagePath, { recursive: true }),
    mkdir(path.join(packagePath, workflowPackageInputDirName), { recursive: true }),
    mkdir(path.join(packagePath, workflowPackageOutputDirName), { recursive: true }),
    mkdir(path.join(packagePath, workflowPackageDependencyDirName), { recursive: true }),
    mkdir(metadataDir, { recursive: true })
  ]);
  await hideWorkflowPackageMetadataDir(metadataDir);
}

async function hideWorkflowPackageMetadataDir(metadataDir) {
  if (process.platform !== "win32") return;
  try {
    await execFile("attrib.exe", ["+h", metadataDir], { windowsHide: true, timeout: 5000 });
  } catch {
    // Hiding package metadata is cosmetic; package loading should not depend on it.
  }
}

async function createManagedAssetTarget(requestLike, kind, extension = "", assetGroup = workflowPackageOutputDirName) {
  const body = requestLike?.body || {};
  const packageContext = workflowPackageContextFromBody(body);
  const inputExtension = extension || path.extname(String(kind || ""));
  const fileName = inputExtension ? uniqueOutputFileName(kind, inputExtension) : safePackageFileName(kind || "asset");

  if (packageContext?.packagePath) {
    await ensureWorkflowPackageDirs(packageContext.packagePath);
    const relativePath = path.join(assetGroup, fileName);
    return {
      fileName,
      relativePath: relativePath.split(path.sep).join("/"),
      filePath: path.join(packageContext.packagePath, relativePath),
      publicPath: workflowPackagePublicPath(packageContext.id, relativePath)
    };
  }

  const workflowDir = localWorkflowAssetDirName(body);
  const root = assetGroup === workflowPackageInputDirName ? uploadsDir : outputsDir;
  const relativeRoot = assetGroup === workflowPackageInputDirName ? workflowDir : path.join(workflowDir, assetGroup === workflowPackageOutputDirName ? "" : assetGroup);
  const targetDir = path.join(root, relativeRoot);
  await mkdir(targetDir, { recursive: true });

  const relativePath = path.join(relativeRoot, fileName);
  return {
    fileName,
    relativePath: relativePath.split(path.sep).join("/"),
    filePath: path.join(root, relativePath),
    publicPath: `/${assetGroup === workflowPackageInputDirName ? "uploads" : "outputs"}/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`
  };
}

function localWorkflowAssetDirName(body = {}) {
  return safePathSegment(body.workflowName || body.projectName || body.workflowFileName || body.projectId || "Untitled-node-project");
}

async function moveUploadedFile(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await rm(targetPath, { force: true }).catch(() => {});
  await rename(sourcePath, targetPath);
}

async function hydrateWorkflowPackage(workflow) {
  const packagePath = normalizeWorkflowPackagePath(workflow.packagePath || workflow.package?.rootPath);
  if (!packagePath) return workflow;

  const workflowFileName = safeWorkflowFileName(workflow.package?.workflowFileName || workflow.fileName) || workflowFileNameForName(workflow.name || "workflow");
  const packageWorkflowPath = path.join(packagePath, workflowFileName);
  try {
    const packagedWorkflow = JSON.parse(await readFile(packageWorkflowPath, "utf8"));
    const workflowId = workflow.id || packagedWorkflow.id;
    return {
      ...workflow,
      ...packagedWorkflow,
      id: workflowId,
      updatedAt: workflow.updatedAt || packagedWorkflow.updatedAt,
      packagePath,
      fileName: workflow.fileName || packagedWorkflow.fileName || workflowFileName,
      package: {
        ...(packagedWorkflow.package || {}),
        ...(workflow.package || {}),
        rootPath: packagePath,
        workflowFileName
      },
      graph: rewriteWorkflowPackageAssetReferences(packagedWorkflow.graph || workflow.graph, workflowId, packagePath)
    };
  } catch {
    return { ...workflow, packagePath };
  }
}

async function findRegisteredWorkflowPackage(workflowId) {
  const workflows = await readSavedWorkflows({ includeAll: true });
  return workflows.find((workflow) => String(workflow.id || "") === String(workflowId || "") && workflow.packagePath);
}

function normalizeWorkflowPackageRegistration(value) {
  const id = String(value?.id || randomUUID()).trim();
  const name = String(value?.name || "Untitled node project").trim() || "Untitled node project";
  const packagePath = normalizeWorkflowPackagePath(value?.packagePath || value?.package?.rootPath);
  if (!packagePath) throw new Error("Workflow package is missing its package path.");
  if (!existsSync(packagePath)) throw new Error(`Workflow package path is not accessible: ${packagePath}`);
  const fileName = safeWorkflowFileName(value?.fileName || value?.package?.workflowFileName) || workflowFileNameForName(name);
  const now = new Date().toISOString();

  return {
    ...value,
    id,
    name,
    fileName,
    createdAt: value?.createdAt || now,
    updatedAt: now,
    packagePath,
    package: {
      ...(value.package || {}),
      rootPath: packagePath,
      workflowFileName: fileName,
      assetBaseUrl: `${workflowAssetsPrefix}/${encodeURIComponent(id)}`
    },
    graph: {
      nodes: Array.isArray(value?.graph?.nodes) ? value.graph.nodes : [],
      edges: Array.isArray(value?.graph?.edges) ? value.graph.edges : [],
      groups: Array.isArray(value?.graph?.groups) ? value.graph.groups : [],
      viewport: value?.graph?.viewport || { x: 0, y: 0, scale: 1 }
    }
  };
}

async function writeWorkflowPackage(workflow, packagePath) {
  await ensureWorkflowPackageDirs(packagePath);
  const workflowFileName = workflowFileNameForName(workflow.name || "workflow");
  const assets = await copyWorkflowAssetsToPackage(workflow.graph, workflow.id, packagePath);
  const graph = rewriteWorkflowAssetUrls(workflow.graph, assets.urlMap);
  const updatedAt = new Date().toISOString();
  const packagedWorkflow = {
    ...workflow,
    fileName: workflow.fileName || workflowFileName,
    updatedAt,
    packagePath,
    package: {
      id: workflow.id,
      name: workflow.name,
      rootPath: packagePath,
      workflowFileName,
      assetBaseUrl: `${workflowAssetsPrefix}/${encodeURIComponent(workflow.id)}`,
      savedAt: updatedAt
    },
    graph
  };
  const manifest = {
    app: "NewtNode",
    version: 1,
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowFileName,
    updatedAt,
    assets: assets.manifest
  };

  await writeJsonAtomic(path.join(packagePath, workflowFileName), packagedWorkflow);
  await writeJsonAtomic(workflowPackageManifestPath(packagePath), manifest);
  await rm(legacyWorkflowPackageManifestPath(packagePath), { force: true }).catch(() => {});
  return packagedWorkflow;
}

function workflowPackageManifestPath(packagePath) {
  return path.join(packagePath, workflowPackageMetadataDirName, workflowPackageManifestFileName);
}

function legacyWorkflowPackageManifestPath(packagePath) {
  return path.join(packagePath, workflowPackageManifestFileName);
}

async function copyWorkflowAssetsToPackage(graph, workflowId, packagePath) {
  const urls = collectWorkflowAssetUrls(graph);
  const urlMap = new Map();
  const manifest = [];
  const usedTargets = new Set();

  for (const publicPath of urls) {
    try {
      const source = await resolveLocalAssetPath(publicPath);
      const assetGroup = workflowPackageAssetGroup(publicPath);
      const existingPackagePath = workflowPackageRelativePath(publicPath, workflowId);
      if (existingPackagePath && path.resolve(source.filePath) === path.resolve(packagePath, existingPackagePath)) {
        urlMap.set(publicPath, publicPath);
        manifest.push({
          source: publicPath,
          url: publicPath,
          relativePath: existingPackagePath.split(path.sep).join("/"),
          group: assetGroup,
          fileName: path.basename(existingPackagePath)
        });
        continue;
      }

      const targetName = uniquePackageAssetName(source.fileName, usedTargets);
      const relativePath = path.join(assetGroup, targetName);
      const targetPath = path.join(packagePath, relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      if (path.resolve(source.filePath) !== path.resolve(targetPath)) await copyFile(source.filePath, targetPath);
      const packagedUrl = workflowPackagePublicPath(workflowId, relativePath);
      urlMap.set(publicPath, packagedUrl);
      manifest.push({
        source: publicPath,
        url: packagedUrl,
        relativePath: relativePath.split(path.sep).join("/"),
        group: assetGroup,
        fileName: targetName
      });
    } catch (error) {
      manifest.push({
        source: publicPath,
        missing: true,
        error: error.message || "Asset could not be copied."
      });
    }
  }

  return { urlMap, manifest };
}

function collectWorkflowAssetUrls(value, urls = new Set()) {
  if (typeof value === "string") {
    const publicPath = tryLocalPublicPath(value);
    if (publicPath) urls.add(publicPath);
    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectWorkflowAssetUrls(item, urls));
    return urls;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectWorkflowAssetUrls(item, urls));
  }

  return urls;
}

function rewriteWorkflowAssetUrls(value, urlMap) {
  if (typeof value === "string") {
    const publicPath = tryLocalPublicPath(value);
    return publicPath && urlMap.has(publicPath) ? urlMap.get(publicPath) : value;
  }

  if (Array.isArray(value)) return value.map((item) => rewriteWorkflowAssetUrls(item, urlMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteWorkflowAssetUrls(item, urlMap)]));
  }

  return value;
}

function rewriteWorkflowPackageAssetReferences(value, workflowId, packagePath) {
  if (typeof value === "string") {
    return workflowPackageAssetReferenceForOpenedPath(value, workflowId, packagePath);
  }

  if (Array.isArray(value)) return value.map((item) => rewriteWorkflowPackageAssetReferences(item, workflowId, packagePath));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteWorkflowPackageAssetReferences(item, workflowId, packagePath)]));
  }

  return value;
}

function workflowPackageAssetReferenceForOpenedPath(value, workflowId, packagePath) {
  const publicPath = tryLocalPublicPath(value);
  if (!publicPath || !workflowId || !packagePath) return value;

  if (publicPath.startsWith(`${workflowAssetsPrefix}/`)) {
    const relativePath = workflowPackageRelativePath(publicPath);
    if (relativePath && existsSync(path.join(packagePath, relativePath))) {
      return workflowPackagePublicPath(workflowId, relativePath);
    }
    return value;
  }

  const candidatePaths = workflowPackageAssetCandidatesForLocalPath(publicPath);
  const matchingPath = candidatePaths.find((relativePath) => existsSync(path.join(packagePath, relativePath)));
  return matchingPath ? workflowPackagePublicPath(workflowId, matchingPath) : value;
}

function workflowPackageAssetCandidatesForLocalPath(publicPath) {
  const decodedPath = decodeURIComponent(String(publicPath || ""));
  const isUpload = decodedPath.startsWith("/uploads/");
  const prefix = isUpload ? "/uploads/" : "/outputs/";
  if (!decodedPath.startsWith(prefix)) return [];

  const relativePath = safeRelativeAssetPath(decodedPath.slice(prefix.length));
  if (!relativePath) return [];

  const fileName = path.basename(relativePath);
  const group = isUpload ? workflowPackageInputDirName : workflowPackageOutputDirName;
  return [
    path.join(group, relativePath),
    path.join(group, fileName),
    ...(isUpload ? [] : [path.join(workflowPackageDependencyDirName, relativePath), path.join(workflowPackageDependencyDirName, fileName)])
  ];
}

function tryLocalPublicPath(value) {
  try {
    return localPublicPathFromUrl(value);
  } catch {
    return "";
  }
}

function workflowPackageAssetGroup(publicPath) {
  if (String(publicPath || "").startsWith("/uploads/")) return workflowPackageInputDirName;
  const packagePath = workflowPackageRelativePath(publicPath);
  const firstSegment = packagePath ? packagePath.split(/[\\/]/)[0] : "";
  if ([workflowPackageInputDirName, workflowPackageOutputDirName, workflowPackageDependencyDirName].includes(firstSegment)) return firstSegment;
  return workflowPackageOutputDirName;
}

function workflowPackageRelativePath(publicPath, workflowId = "") {
  const match = String(publicPath || "").match(/^\/workflow-assets\/([^/]+)\/(.+)$/);
  if (!match) return "";
  if (workflowId && decodeURIComponent(match[1]) !== String(workflowId)) return "";
  return safeRelativeAssetPath(decodeURIComponent(match[2] || ""));
}

function uniquePackageAssetName(fileName, usedTargets) {
  const safeName = safePackageFileName(fileName || "asset");
  const extension = path.extname(safeName);
  const base = path.basename(safeName, extension);
  let nextName = safeName;
  let index = 2;

  while (usedTargets.has(nextName.toLowerCase())) {
    nextName = `${base}-${index}${extension}`;
    index += 1;
  }

  usedTargets.add(nextName.toLowerCase());
  return nextName;
}

async function selectFolderWithDialog({ title = "Choose folder", defaultPath = "" } = {}) {
  if (process.platform === "win32") {
    return selectFolderWithWindowsDialog({ title, defaultPath });
  }

  if (process.platform === "darwin") {
    return selectFolderWithMacDialog({ title, defaultPath });
  }

  return selectFolderWithLinuxDialog({ title, defaultPath });
}

async function selectWorkflowFileWithDialog({ title = "Open NewtNode workflow", defaultPath = "" } = {}) {
  if (process.platform === "win32") {
    return selectWorkflowFileWithWindowsDialog({ title, defaultPath });
  }

  if (process.platform === "darwin") {
    return selectWorkflowFileWithMacDialog({ title, defaultPath });
  }

  return selectWorkflowFileWithLinuxDialog({ title, defaultPath });
}

async function readWorkflowFromFilePath(filePath) {
  const workflowFilePath = normalizeWorkflowPackagePath(filePath);
  if (!workflowFilePath || !existsSync(workflowFilePath)) {
    throw new Error("Workflow file is not accessible.");
  }

  const workflow = JSON.parse(await readFile(workflowFilePath, "utf8"));
  if (!workflow?.graph || !Array.isArray(workflow.graph.nodes) || !Array.isArray(workflow.graph.edges)) {
    throw new Error("That JSON file is not a NewtNode workflow.");
  }

  const workflowFileName = path.basename(workflowFilePath);
  const packagePath = path.dirname(workflowFilePath);
  const openedWorkflow = {
    ...workflow,
    id: workflow.id || null,
    name: workflow.name || path.basename(workflowFileName, ".json") || "Untitled node project",
    fileName: workflowFileName,
    filePath: workflowFilePath
  };

  if (!workflowShouldRegisterOpenedPackage(openedWorkflow, packagePath)) {
    return openedWorkflow;
  }

  const registeredWorkflowId = openedWorkflow.id || randomUUID();
  return writeWorkflowFile(
    normalizeWorkflowPackageRegistration({
      ...openedWorkflow,
      id: registeredWorkflowId,
      packagePath,
      package: {
        ...(openedWorkflow.package || {}),
        rootPath: packagePath,
        workflowFileName
      },
      graph: rewriteWorkflowPackageAssetReferences(openedWorkflow.graph, registeredWorkflowId, packagePath)
    })
  );
}

function workflowShouldRegisterOpenedPackage(workflow, packagePath) {
  if (!packagePath) return false;
  if (workflow.packagePath || workflow.package?.rootPath || workflow.package?.workflowFileName) return true;
  if ([...collectWorkflowAssetUrls(workflow.graph)].some((url) => String(url || "").startsWith(`${workflowAssetsPrefix}/`))) return true;
  if (existsSync(workflowPackageManifestPath(packagePath)) || existsSync(legacyWorkflowPackageManifestPath(packagePath))) return true;
  return [workflowPackageInputDirName, workflowPackageOutputDirName, workflowPackageDependencyDirName].some((directoryName) =>
    existsSync(path.join(packagePath, directoryName))
  );
}

async function selectFolderWithWindowsDialog({ title, defaultPath }) {
  const selectedPath = normalizeWorkflowPackagePath(defaultPath);
  const script = `
$ErrorActionPreference = 'Stop'
$typeDefinition = @"
using System;
using System.Runtime.InteropServices;

[ComImport]
[Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
internal class FileOpenDialogRCW
{
}

[ComImport]
[Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IFileOpenDialog
{
  [PreserveSig]
  int Show(IntPtr parent);
  void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
  void SetFileTypeIndex(uint iFileType);
  void GetFileTypeIndex(out uint piFileType);
  void Advise(IntPtr pfde, out uint pdwCookie);
  void Unadvise(uint dwCookie);
  void SetOptions(uint fos);
  void GetOptions(out uint pfos);
  void SetDefaultFolder(IShellItem psi);
  void SetFolder(IShellItem psi);
  void GetFolder(out IShellItem ppsi);
  void GetCurrentSelection(out IShellItem ppsi);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
  void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
  void GetResult(out IShellItem ppsi);
  void AddPlace(IShellItem psi, int fdap);
  void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
  void Close(int hr);
  void SetClientGuid(ref Guid guid);
  void ClearClientData();
  void SetFilter(IntPtr pFilter);
  void GetResults(out IntPtr ppenum);
  void GetSelectedItems(out IntPtr ppsai);
}

[ComImport]
[Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellItem
{
  void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
  void GetParent(out IShellItem ppsi);
  void GetDisplayName(uint sigdnName, out IntPtr ppszName);
  void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
  void Compare(IShellItem psi, uint hint, out int piOrder);
}

public static class NativeFolderPicker
{
  private const uint FOS_PICKFOLDERS = 0x00000020;
  private const uint FOS_FORCEFILESYSTEM = 0x00000040;
  private const uint FOS_PATHMUSTEXIST = 0x00000800;
  private const uint SIGDN_FILESYSPATH = 0x80058000;
  private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
  private static extern int SHCreateItemFromParsingName(
    [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
    IntPtr pbc,
    ref Guid riid,
    [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

  [DllImport("ole32.dll")]
  private static extern void CoTaskMemFree(IntPtr pv);

  public static string PickFolder(string title, string defaultPath)
  {
    object dialogObject = new FileOpenDialogRCW();
    IFileOpenDialog dialog = (IFileOpenDialog)dialogObject;
    IShellItem defaultFolder = null;
    IShellItem result = null;

    try
    {
      uint options;
      dialog.GetOptions(out options);
      dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
      if (!String.IsNullOrWhiteSpace(title))
      {
        dialog.SetTitle(title);
      }
      dialog.SetOkButtonLabel("Select Folder");

      if (!String.IsNullOrWhiteSpace(defaultPath) && System.IO.Directory.Exists(defaultPath))
      {
        Guid shellItemGuid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
        if (SHCreateItemFromParsingName(defaultPath, IntPtr.Zero, ref shellItemGuid, out defaultFolder) == 0)
        {
          dialog.SetFolder(defaultFolder);
        }
      }

      int hr = dialog.Show(IntPtr.Zero);
      if (hr == ERROR_CANCELLED)
      {
        return null;
      }
      if (hr != 0)
      {
        Marshal.ThrowExceptionForHR(hr);
      }

      dialog.GetResult(out result);
      IntPtr pathPointer;
      result.GetDisplayName(SIGDN_FILESYSPATH, out pathPointer);
      try
      {
        return Marshal.PtrToStringUni(pathPointer);
      }
      finally
      {
        CoTaskMemFree(pathPointer);
      }
    }
    finally
    {
      if (result != null) Marshal.ReleaseComObject(result);
      if (defaultFolder != null) Marshal.ReleaseComObject(defaultFolder);
      Marshal.ReleaseComObject(dialogObject);
    }
  }
}
"@

$selectedPath = ${powershellStringLiteral(selectedPath)}
$title = ${powershellStringLiteral(title)}

try {
  Add-Type -TypeDefinition $typeDefinition
  $path = [NativeFolderPicker]::PickFolder($title, $selectedPath)
  if ($path) {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
    Write-Output $path
    exit 0
  }
  exit 2
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $title
  $dialog.ShowNewFolderButton = $true
  if ($selectedPath -and (Test-Path -LiteralPath $selectedPath)) {
    $dialog.SelectedPath = $selectedPath
  }
  $result = $dialog.ShowDialog()
  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
    Write-Output $dialog.SelectedPath
    exit 0
  }
  exit 2
}
`;

  return runFolderDialogCommand("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script]);
}

async function selectWorkflowFileWithWindowsDialog({ title, defaultPath }) {
  const selectedPath = normalizeWorkflowPackagePath(defaultPath);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = ${powershellStringLiteral(title)}
$dialog.Filter = 'NewtNode workflow JSON (*.json)|*.json|JSON files (*.json)|*.json|All files (*.*)|*.*'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$selectedPath = ${powershellStringLiteral(selectedPath)}

if ($selectedPath) {
  if (Test-Path -LiteralPath $selectedPath -PathType Leaf) {
    $dialog.InitialDirectory = [System.IO.Path]::GetDirectoryName($selectedPath)
    $dialog.FileName = [System.IO.Path]::GetFileName($selectedPath)
  } elseif (Test-Path -LiteralPath $selectedPath -PathType Container) {
    $dialog.InitialDirectory = $selectedPath
  }
}

$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
  Write-Output $dialog.FileName
  exit 0
}
exit 2
`;

  return runFileDialogCommand("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script]);
}

function powershellStringLiteral(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

async function selectFolderWithMacDialog({ title, defaultPath }) {
  const selectedPath = existingDirectoryPath(defaultPath);
  const script = selectedPath
    ? `POSIX path of (choose folder with prompt ${JSON.stringify(title)} default location POSIX file ${JSON.stringify(selectedPath)})`
    : `POSIX path of (choose folder with prompt ${JSON.stringify(title)})`;
  return runFolderDialogCommand("osascript", ["-e", script]);
}

async function selectFolderWithLinuxDialog({ title, defaultPath }) {
  const selectedPath = existingDirectoryPath(defaultPath);
  try {
    const args = ["--file-selection", "--directory", `--title=${title}`];
    if (selectedPath) args.push(`--filename=${selectedPath}${path.sep}`);
    return await runFolderDialogCommand("zenity", args);
  } catch (error) {
    if (error.code === "DIALOG_CANCELED") throw error;
    return runFolderDialogCommand("kdialog", ["--getexistingdirectory", selectedPath || rootDir]);
  }
}

async function selectWorkflowFileWithMacDialog({ title, defaultPath }) {
  const selectedFile = existingFilePath(defaultPath);
  const selectedDirectory = selectedFile ? path.dirname(selectedFile) : existingDirectoryPath(defaultPath);
  const script = selectedDirectory
    ? `POSIX path of (choose file with prompt ${JSON.stringify(title)} of type {"json"} default location POSIX file ${JSON.stringify(selectedDirectory)})`
    : `POSIX path of (choose file with prompt ${JSON.stringify(title)} of type {"json"})`;
  return runFileDialogCommand("osascript", ["-e", script]);
}

async function selectWorkflowFileWithLinuxDialog({ title, defaultPath }) {
  const selectedFile = existingFilePath(defaultPath);
  const selectedDirectory = selectedFile ? path.dirname(selectedFile) : existingDirectoryPath(defaultPath);
  try {
    const args = ["--file-selection", `--title=${title}`, "--file-filter=NewtNode workflows | *.json", "--file-filter=All files | *"];
    if (selectedFile) {
      args.push(`--filename=${selectedFile}`);
    } else if (selectedDirectory) {
      args.push(`--filename=${selectedDirectory}${path.sep}`);
    }
    return await runFileDialogCommand("zenity", args);
  } catch (error) {
    if (error.code === "DIALOG_CANCELED") throw error;
    return runFileDialogCommand("kdialog", ["--getopenfilename", selectedDirectory || rootDir, "*.json|JSON files"]);
  }
}

function existingFilePath(value) {
  const selectedPath = normalizeWorkflowPackagePath(value);
  if (!selectedPath || !existsSync(selectedPath)) return "";
  try {
    return statSync(selectedPath).isFile() ? selectedPath : "";
  } catch {
    return "";
  }
}

function existingDirectoryPath(value) {
  const selectedPath = normalizeWorkflowPackagePath(value);
  if (!selectedPath || !existsSync(selectedPath)) return "";
  try {
    return statSync(selectedPath).isDirectory() ? selectedPath : "";
  } catch {
    return "";
  }
}

async function runFolderDialogCommand(command, args) {
  try {
    const { stdout } = await execFile(command, args, { windowsHide: false, timeout: 120000 });
    const selectedPath = String(stdout || "").trim();
    if (!selectedPath) {
      const error = new Error("Folder selection canceled.");
      error.code = "DIALOG_CANCELED";
      throw error;
    }
    return selectedPath;
  } catch (error) {
    if (error.code === "DIALOG_CANCELED" || error.code === 2) {
      const canceled = new Error("Folder selection canceled.");
      canceled.code = "DIALOG_CANCELED";
      throw canceled;
    }
    throw error;
  }
}

async function runFileDialogCommand(command, args) {
  try {
    const { stdout } = await execFile(command, args, { windowsHide: false, timeout: 120000 });
    const selectedPath = String(stdout || "").trim();
    if (!selectedPath) {
      const error = new Error("File selection canceled.");
      error.code = "DIALOG_CANCELED";
      throw error;
    }
    return selectedPath;
  } catch (error) {
    if (error.code === "DIALOG_CANCELED" || error.code === 2) {
      const canceled = new Error("File selection canceled.");
      canceled.code = "DIALOG_CANCELED";
      throw canceled;
    }
    throw error;
  }
}

function safeComposerPoseFileName(value) {
  const fileName = path.basename(String(value || ""));
  if (!fileName.toLowerCase().endsWith(".json")) return "";
  return fileName.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
}

function uniqueComposerPoseFileName(name, poses) {
  const usedNames = new Set(poses.map((pose) => String(pose.fileName || "").toLowerCase()).filter(Boolean));
  const baseName = safePathSegment(name || "pose") || "pose";
  let fileName = `${baseName}.json`;
  let suffix = 2;

  while (usedNames.has(fileName.toLowerCase())) {
    fileName = `${baseName}-${suffix}.json`;
    suffix += 1;
  }

  return fileName;
}

function normalizeComposerPose(pose, index = 0) {
  if (!pose || typeof pose !== "object") return null;
  const fallbackId = `pose-${index + 1}`;
  const id = String(pose.id || pose.fileName || fallbackId).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96) || fallbackId;
  const name = String(pose.name || `Pose ${index + 1}`).trim() || `Pose ${index + 1}`;
  const normalized = {
    id,
    name,
    fileName: safeComposerPoseFileName(pose.fileName),
    pose: String(pose.pose || id)
  };

  composerPoseFieldKeys.forEach((key) => {
    normalized[key] = finiteNumber(pose[key], 0);
  });

  return normalized;
}

async function readComposerPoses() {
  await mkdir(composerPosesDir, { recursive: true });
  const entries = await readdir(composerPosesDir, { withFileTypes: true });
  const poses = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;

    try {
      const pose = JSON.parse(await readFile(path.join(composerPosesDir, entry.name), "utf8"));
      const normalized = normalizeComposerPose({ ...pose, fileName: entry.name }, poses.length);
      if (normalized) poses.push(normalized);
    } catch (error) {
      console.warn(`Skipping unreadable Composer pose ${entry.name}:`, error.message);
    }
  }

  return poses.sort((first, second) => first.name.localeCompare(second.name));
}

async function readSavedWorkflows({ includeAll = false } = {}) {
  await mkdir(savedWorkflowsDir, { recursive: true });
  await migrateLegacyNodeProjectsToSavedWorkflows();
  const workflowFileNames = includeAll ? null : await readRecentWorkflowFileNames();
  const workflows = await readSavedWorkflowFiles({ fileNames: workflowFileNames });
  return includeAll ? workflows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))) : workflows;
}

async function migrateLegacyNodeProjectsToSavedWorkflows() {
  const legacyProjects = await readNodeProjects();
  if (!legacyProjects.length) return false;

  const workflows = await readSavedWorkflowSummaryFiles();
  const existingIds = new Set(workflows.map((workflow) => String(workflow.id || "")));
  let migratedLegacyProject = false;

  for (const project of legacyProjects) {
    if (!project?.id || existingIds.has(String(project.id))) continue;

    const workflow = {
      id: project.id,
      name: project.name || "Untitled node project",
      fileName: uniqueWorkflowFileName(project.name || "legacy-workflow", workflows),
      createdAt: project.createdAt || project.updatedAt || new Date().toISOString(),
      updatedAt: project.updatedAt || project.createdAt || new Date().toISOString(),
      app: "NewtNode",
      version: 1,
      migratedFrom: "server/data/node-projects.json",
      graph: {
        nodes: Array.isArray(project.graph?.nodes) ? project.graph.nodes : [],
        edges: Array.isArray(project.graph?.edges) ? project.graph.edges : [],
        groups: Array.isArray(project.graph?.groups) ? project.graph.groups : [],
        viewport: project.graph?.viewport || { x: 0, y: 0, scale: 1 }
      }
    };

    workflows.push(workflow);
    existingIds.add(String(workflow.id));
    migratedLegacyProject = true;
    await writeWorkflowFile(workflow);
  }

  return migratedLegacyProject;
}

async function readSavedWorkflowSummaries() {
  await mkdir(savedWorkflowsDir, { recursive: true });
  await migrateLegacyNodeProjectsToSavedWorkflows();

  const source = await workflowIndexSource();
  const cached = await readJsonFile(workflowIndexPath, null);
  if (cached?.version === 1 && workflowIndexSourceMatches(cached.source, source) && Array.isArray(cached.items)) {
    return cached.items;
  }

  return rebuildWorkflowIndex(source);
}

async function rebuildWorkflowIndex(_source = null) {
  const items = await readRecentWorkflowSummaries();
  const nextSource = await workflowIndexSource();
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: nextSource,
    items
  };
  await writeJsonAtomic(workflowIndexPath, index);
  return items;
}

async function readRecentWorkflowSummaries() {
  const recentFileNames = await readRecentWorkflowFileNames();
  const summaries = await readSavedWorkflowSummaryFiles({ fileNames: recentFileNames });
  const foundKeys = new Set(summaries.map((summary) => workflowFileKey(summary.registryFileName || summary.fileName)));
  const prunedFileNames = recentFileNames.filter((fileName) => foundKeys.has(workflowFileKey(fileName)));

  if (prunedFileNames.length !== recentFileNames.length) {
    await writeRecentWorkflowFileNames(prunedFileNames);
  }

  return summaries;
}

async function readSavedWorkflowSummaryFiles({ fileNames = null } = {}) {
  await mkdir(savedWorkflowsDir, { recursive: true });
  const registryFileNames = Array.isArray(fileNames) ? normalizeWorkflowFileNameList(fileNames) : await savedWorkflowRegistryFileNames();
  const summaries = [];

  for (const registryFileName of registryFileNames) {
    const filePath = path.join(savedWorkflowsDir, registryFileName);
    try {
      const [registryWorkflow, metadata] = await Promise.all([
        readJsonFile(filePath, null),
        fileMetadata(filePath)
      ]);
      if (!registryWorkflow) continue;
      summaries.push(workflowMetadataSummary(registryWorkflow, registryFileName, metadata));
    } catch {
      // Ignore malformed workflow files instead of blocking the whole loader.
    }
  }

  return Array.isArray(fileNames) ? summaries : summaries.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function readSavedWorkflowFiles({ fileNames = null } = {}) {
  await mkdir(savedWorkflowsDir, { recursive: true });
  const registryFileNames = Array.isArray(fileNames) ? normalizeWorkflowFileNameList(fileNames) : await savedWorkflowRegistryFileNames();
  const workflows = [];

  for (const registryFileName of registryFileNames) {
    try {
      const registryWorkflowPath = path.join(savedWorkflowsDir, registryFileName);
      const registryWorkflow = JSON.parse(await readFile(registryWorkflowPath, "utf8"));
      const workflow = await hydrateWorkflowPackage(registryWorkflow);
      workflows.push({
        ...workflow,
        id: workflow.id || registryFileName,
        name: workflow.name || path.basename(registryFileName, ".json"),
        fileName: registryWorkflow.fileName || registryFileName,
        filePath: workflowFilePathForDisplay(workflow, registryFileName),
        registryFileName,
        graph: {
          nodes: Array.isArray(workflow.graph?.nodes) ? workflow.graph.nodes : [],
          edges: Array.isArray(workflow.graph?.edges) ? workflow.graph.edges : [],
          groups: Array.isArray(workflow.graph?.groups) ? workflow.graph.groups : [],
          viewport: workflow.graph?.viewport || { x: 0, y: 0, scale: 1 }
        }
      });
    } catch {
      // Ignore malformed workflow files instead of blocking the whole loader.
    }
  }

  return workflows;
}

async function savedWorkflowRegistryFileNames() {
  const entries = await readdir(savedWorkflowsDir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).filter((name) => safeWorkflowFileName(name));
}

async function readRecentWorkflowFileNames() {
  const recent = await readJsonFile(recentWorkflowsPath, null);
  const recentFileNames = normalizeWorkflowFileNameList(Array.isArray(recent) ? recent : recent?.fileNames);
  if (recent || recentFileNames.length) return recentFileNames;

  const legacyHiddenKeys = await readLegacyHiddenWorkflowFileKeys();
  const summaries = await readSavedWorkflowSummaryFiles();
  const initialFileNames = summaries
    .map((summary) => summary.registryFileName || summary.fileName)
    .filter((fileName) => !legacyHiddenKeys.has(workflowFileKey(fileName)));
  await writeRecentWorkflowFileNames(initialFileNames);
  return initialFileNames;
}

async function writeRecentWorkflowFileNames(fileNames) {
  await writeJsonAtomic(recentWorkflowsPath, {
    version: 1,
    updatedAt: new Date().toISOString(),
    fileNames: normalizeWorkflowFileNameList(fileNames).slice(0, 100)
  });
}

async function addRecentWorkflowFileName(fileName) {
  const safeFileName = safeWorkflowFileName(fileName);
  if (!safeFileName) return;
  const currentFileNames = await readRecentWorkflowFileNames();
  const key = workflowFileKey(safeFileName);
  await writeRecentWorkflowFileNames([safeFileName, ...currentFileNames.filter((item) => workflowFileKey(item) !== key)]);
}

async function removeRecentWorkflowFileName(fileName) {
  const key = workflowFileKey(fileName);
  if (!key) return;
  const currentFileNames = await readRecentWorkflowFileNames();
  await writeRecentWorkflowFileNames(currentFileNames.filter((item) => workflowFileKey(item) !== key));
}

async function readLegacyHiddenWorkflowFileKeys() {
  const hidden = await readJsonFile(legacyHiddenWorkflowsPath, null);
  const fileNames = Array.isArray(hidden) ? hidden : Array.isArray(hidden?.fileNames) ? hidden.fileNames : [];
  return new Set(fileNames.map(workflowFileKey).filter(Boolean));
}

function normalizeWorkflowFileNameList(fileNames = []) {
  const seen = new Set();
  const normalized = [];

  for (const value of Array.isArray(fileNames) ? fileNames : []) {
    const fileName = safeWorkflowFileName(value);
    const key = workflowFileKey(fileName);
    if (!fileName || seen.has(key)) continue;
    seen.add(key);
    normalized.push(fileName);
  }

  return normalized;
}

function workflowFileKey(fileName) {
  return safeWorkflowFileName(fileName).toLowerCase();
}

async function writeWorkflowFile(workflow) {
  await mkdir(savedWorkflowsDir, { recursive: true });
  const workflowData = { ...workflow };
  delete workflowData.filePath;
  delete workflowData.workflowFilePath;
  delete workflowData.fullPath;
  delete workflowData.path;
  const registryWorkflow = {
    ...workflowData,
    fileName: safeWorkflowFileName(workflowData.fileName) || workflowFileNameForName(workflowData.name || "workflow")
  };
  await writeJsonAtomic(path.join(savedWorkflowsDir, registryWorkflow.fileName), registryWorkflow);
  await addRecentWorkflowFileName(registryWorkflow.fileName);
  await rebuildWorkflowIndex().catch(() => {});
  return {
    ...registryWorkflow,
    filePath: workflowFilePathForDisplay(registryWorkflow, registryWorkflow.fileName)
  };
}

async function workflowIndexSource() {
  const recentFileNames = await readRecentWorkflowFileNames();
  const recentMetadata = await fileMetadata(recentWorkflowsPath);
  const files = [];

  for (const fileName of recentFileNames) {
    const filePath = path.join(savedWorkflowsDir, fileName);
    const metadata = await fileMetadata(filePath);
    files.push({
      fileName,
      exists: metadata.exists,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs
    });
  }

  return {
    directory: savedWorkflowsDir,
    recentWorkflows: {
      exists: recentMetadata.exists,
      size: recentMetadata.size,
      mtimeMs: recentMetadata.mtimeMs
    },
    files
  };
}

function workflowIndexSourceMatches(cachedSource, currentSource) {
  if (!cachedSource || !currentSource) return false;
  const cachedRecent = cachedSource.recentWorkflows || {};
  const currentRecent = currentSource.recentWorkflows || {};
  if (
    Boolean(cachedRecent.exists) !== Boolean(currentRecent.exists) ||
    (cachedRecent.size || 0) !== (currentRecent.size || 0) ||
    (cachedRecent.mtimeMs || 0) !== (currentRecent.mtimeMs || 0)
  ) {
    return false;
  }

  const cachedFiles = Array.isArray(cachedSource.files) ? cachedSource.files : [];
  const currentFiles = Array.isArray(currentSource.files) ? currentSource.files : [];
  if (cachedFiles.length !== currentFiles.length) return false;

  return currentFiles.every((file, index) => {
    const cached = cachedFiles[index];
    return cached?.fileName === file.fileName && Boolean(cached.exists) === Boolean(file.exists) && cached.size === file.size && cached.mtimeMs === file.mtimeMs;
  });
}

function workflowMetadataSummary(workflow, registryFileName, metadata = {}) {
  const graph = workflow.graph || {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const groups = Array.isArray(graph.groups) ? graph.groups : [];
  const fileName = safeWorkflowFileName(workflow.fileName) || registryFileName;

  return {
    id: workflow.id || registryFileName,
    name: workflow.name || path.basename(registryFileName, ".json"),
    fileName,
    filePath: workflowFilePathForDisplay(workflow, registryFileName),
    registryFileName,
    createdAt: workflow.createdAt || "",
    updatedAt: workflow.updatedAt || "",
    app: workflow.app || "NewtNode",
    version: workflow.version || 1,
    packagePath: workflow.packagePath || workflow.package?.rootPath || "",
    package: workflow.package
      ? {
          id: workflow.package.id || workflow.id || "",
          name: workflow.package.name || workflow.name || "",
          rootPath: workflow.package.rootPath || workflow.packagePath || "",
          workflowFileName: workflow.package.workflowFileName || fileName,
          assetBaseUrl: workflow.package.assetBaseUrl || "",
          savedAt: workflow.package.savedAt || workflow.updatedAt || ""
        }
      : null,
    graphStats: {
      nodes: nodes.length,
      edges: edges.length,
      groups: groups.length
    },
    file: {
      size: metadata.size || 0,
      mtimeMs: metadata.mtimeMs || 0
    }
  };
}

function workflowFilePathForDisplay(workflow = {}, registryFileName = "") {
  const packageRoot = normalizeWorkflowPackagePath(workflow.packagePath || workflow.package?.rootPath);
  const workflowFileName =
    safeWorkflowFileName(workflow.package?.workflowFileName || workflow.fileName) ||
    safeWorkflowFileName(registryFileName) ||
    workflowFileNameForName(workflow.name || "workflow");
  if (packageRoot) return path.join(packageRoot, workflowFileName);

  const registryName = safeWorkflowFileName(registryFileName || workflow.fileName) || workflowFileName;
  return path.join(savedWorkflowsDir, registryName);
}

function uniqueReferenceName(value, usedNames) {
  const fallback = cleanReferenceName(value) || "Image";
  let name = fallback;
  let suffix = 2;

  while (usedNames.has(name.toLowerCase())) {
    name = `${fallback}${suffix}`;
    suffix += 1;
  }

  usedNames.add(name.toLowerCase());
  return name;
}

async function uploadToFal(file) {
  const buffer = await readFile(file.path);
  const falFile = new File([buffer], file.originalname, {
    type: file.mimetype || "application/octet-stream"
  });

  return fal.storage.upload(falFile);
}

async function downloadVideo(req, url, kind) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated video: ${response.status} ${response.statusText}`);
  }

  const extension = path.extname(new URL(url).pathname) || ".mp4";
  const output = await createManagedAssetTarget(req, kind, extension, workflowPackageOutputDirName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(output.filePath, bytes);

  return {
    fileName: output.fileName,
    publicPath: output.publicPath,
    filePath: output.filePath,
    bytes: bytes.length
  };
}

async function probeVideoFile(filePath) {
  if (!filePath) return {};

  try {
    const { stdout } = await execFile(
      ffprobeBinaryPath,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate,r_frame_rate,duration,nb_frames:format=duration",
        "-of",
        "json",
        filePath
      ],
      { windowsHide: true, timeout: 10000 }
    );
    const data = JSON.parse(stdout || "{}");
    const stream = Array.isArray(data.streams) ? data.streams[0] || {} : {};
    const metadata = {
      width: positiveNumber(stream.width),
      height: positiveNumber(stream.height),
      duration: positiveNumber(stream.duration) || positiveNumber(data.format?.duration),
      fps: frameRateFromRatio(stream.avg_frame_rate || stream.r_frame_rate),
      num_frames: positiveNumber(stream.nb_frames)
    };
    return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== null));
  } catch {
    return {};
  }
}

async function localVideoDurations(urls = []) {
  const durations = [];
  for (const url of urls) {
    try {
      const source = await resolveLocalAssetPathFromUrl(url);
      const metadata = await probeVideoFile(source.filePath);
      durations.push(positiveNumber(metadata.duration) || 0);
    } catch {
      durations.push(0);
    }
  }

  return durations;
}

async function resolveWanVaceMaskToVideoAspectRatio({ value, videoUrl, maskVideoUrl }) {
  const requested = normalizeChoice(value, ["auto", "16:9", "9:16"], "auto");
  if (requested !== "auto") return requested;

  for (const sourceUrl of [videoUrl, maskVideoUrl]) {
    if (!sourceUrl) continue;
    try {
      const source = await resolveLocalAssetPathFromUrl(sourceUrl);
      const metadata = await probeVideoFile(source.filePath);
      const width = positiveNumber(metadata.width);
      const height = positiveNumber(metadata.height);
      if (width && height) return wanVaceAspectRatioFromDimensions(width, height);
    } catch {
      // Try the next source, then fall back to landscape.
    }
  }

  return "16:9";
}

function wanVaceAspectRatioFromDimensions(width, height) {
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (w <= 0 || h <= 0) return "16:9";
  if (Math.abs(w - h) / Math.max(w, h) <= 0.04) return "16:9";
  return w > h ? "16:9" : "9:16";
}

async function prepareWanVaceMaskToVideoMedia({ body, videoUrl, maskVideoUrl, referenceImageUrls = [], aspectRatio }) {
  const paddedMedia = [];
  const preparedMask = await prepareLocalMediaForWanVaceAspect({
    body,
    publicPath: maskVideoUrl,
    aspectRatio,
    kind: "wan-vace-mask-video",
    mediaType: "video"
  });
  const preparedSource = videoUrl
    ? await prepareLocalMediaForWanVaceAspect({
        body,
        publicPath: videoUrl,
        aspectRatio,
        kind: "wan-vace-source-video",
        mediaType: "video"
      })
    : null;
  const preparedReferences = [];

  for (const referenceImageUrl of referenceImageUrls) {
    preparedReferences.push(
      await prepareLocalMediaForWanVaceAspect({
        body,
        publicPath: referenceImageUrl,
        aspectRatio,
        kind: "wan-vace-reference-image",
        mediaType: "image"
      })
    );
  }

  for (const item of [preparedMask, preparedSource, ...preparedReferences]) {
    if (item?.wasPadded) paddedMedia.push(item.summary);
  }

  return {
    maskVideoUrl: preparedMask.publicPath,
    videoUrl: preparedSource?.publicPath || "",
    referenceImageUrls: preparedReferences.map((item) => item.publicPath),
    paddedMedia
  };
}

async function prepareLocalMediaForWanVaceAspect({ body, publicPath, aspectRatio, kind, mediaType }) {
  const asset = await resolveLocalAssetPathFromUrl(publicPath);
  const metadata = mediaType === "video" ? await probeVideoFile(asset.filePath) : await probeLocalImageFile(asset.filePath, asset.fileName);
  const width = positiveNumber(metadata.width);
  const height = positiveNumber(metadata.height);

  if (!width || !height) {
    return {
      publicPath,
      wasPadded: false,
      summary: null
    };
  }

  const target = paddedDimensionsForAspect({ width, height, aspectRatio });
  if (!target.needsPadding) {
    return {
      publicPath,
      wasPadded: false,
      summary: null
    };
  }

  const extension = mediaType === "video" ? ".mp4" : ".png";
  const output = await createManagedAssetTarget({ body }, `${kind}-padded-${aspectRatio.replace(":", "x")}`, extension, workflowPackageDependencyDirName);

  if (mediaType === "video") {
    await padVideoWithFfmpeg({
      sourcePath: asset.filePath,
      outputPath: output.filePath,
      targetWidth: target.width,
      targetHeight: target.height
    });
  } else {
    await padImageWithFfmpeg({
      sourcePath: asset.filePath,
      outputPath: output.filePath,
      targetWidth: target.width,
      targetHeight: target.height
    });
  }

  return {
    publicPath: output.publicPath,
    wasPadded: true,
    summary: {
      kind,
      sourceUrl: localPublicPathFromUrl(publicPath),
      paddedUrl: output.publicPath,
      originalWidth: width,
      originalHeight: height,
      paddedWidth: target.width,
      paddedHeight: target.height,
      aspectRatio
    }
  };
}

async function probeLocalImageFile(filePath, fileName = "") {
  try {
    const buffer = await readFile(filePath);
    return imageDimensionsFromBuffer(buffer, mimeForExtension(path.extname(fileName).toLowerCase())) || {};
  } catch {
    return {};
  }
}

function paddedDimensionsForAspect({ width, height, aspectRatio }) {
  const sourceWidth = Math.max(1, Math.round(Number(width || 0)));
  const sourceHeight = Math.max(1, Math.round(Number(height || 0)));
  const targetRatio = aspectRatioNumber(aspectRatio === "9:16" ? "9:16" : "16:9");
  const currentRatio = sourceWidth / sourceHeight;
  const tolerance = Math.log(1.04);

  if (Math.abs(Math.log(currentRatio / targetRatio)) <= tolerance) {
    return {
      width: ensureEven(sourceWidth),
      height: ensureEven(sourceHeight),
      needsPadding: false
    };
  }

  if (currentRatio < targetRatio) {
    return {
      width: ensureEven(Math.ceil(sourceHeight * targetRatio)),
      height: ensureEven(sourceHeight),
      needsPadding: true
    };
  }

  return {
    width: ensureEven(sourceWidth),
    height: ensureEven(Math.ceil(sourceWidth / targetRatio)),
    needsPadding: true
  };
}

function ensureEven(value) {
  const number = Math.max(2, Math.ceil(Number(value || 2)));
  return number % 2 === 0 ? number : number + 1;
}

async function createExtractFrameResult({ body, sourceVideoUrl }) {
  let outputPath = "";
  try {
    const sourceVideo = await resolveLocalAssetPathFromUrl(sourceVideoUrl);
    const metadata = await probeVideoFile(sourceVideo.filePath);
    const options = body.extractFrame && typeof body.extractFrame === "object" ? body.extractFrame : body;
    const format = normalizeExtractFrameFormat(options.format);
    const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
    const extension = format === "jpeg" ? ".jpg" : ".png";
    const frameTime = extractFrameTime(options.frameTime, metadata.duration);
    const output = await createManagedAssetTarget({ body }, "video-frame", extension, workflowPackageOutputDirName);
    outputPath = output.filePath;

    await extractVideoFrameWithFfmpeg({
      sourcePath: sourceVideo.filePath,
      outputPath,
      frameTime,
      format
    });

    const outputStats = await stat(outputPath);
    const localUrl = output.publicPath;
    const text = `Video frame at ${formatFrameTimeLabel(frameTime)}.`;
    const cost = {
      amountUsd: 0,
      currency: "USD",
      unitRateUsd: 0,
      units: 1,
      unit: "local frame",
      mediaType: "image",
      pricingBasis: "Local ffmpeg frame extraction",
      pricingSource: "local-ffmpeg"
    };

    await appendHistory({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "image",
      provider: "local",
      modelName: "Extract Frame",
      endpoint: "local/extract-video-frame",
      mode: "Video frame extraction",
      prompt: text,
      submittedPrompt: text,
      project: projectFromBody(body),
      node: nodeFromBody(body),
      settings: {
        model: "Extract Frame",
        sourceVideoUrl,
        frameTime,
        requestedFrameTime: Number(options.frameTime || 0),
        duration: metadata.duration || null,
        width: metadata.width || null,
        height: metadata.height || null,
        fps: metadata.fps || null,
        format,
        ffmpeg: path.basename(ffmpegBinaryPath)
      },
      cost,
      localImage: localUrl,
      outputFileName: output.fileName,
      outputBytes: outputStats.size,
      text
    });

    return {
      modelName: "Extract Frame",
      text,
      cost,
      image: {
        label: "Video Frame",
        localUrl,
        fileName: output.fileName,
        mimeType
      }
    };
  } catch (error) {
    if (outputPath) await rm(outputPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function createColorIdMatteVideoResult({ body, sourceVideoUrl }) {
  const outputPaths = [];
  try {
    const sourceVideo = await resolveLocalAssetPathFromUrl(sourceVideoUrl);
    const metadata = await probeVideoFile(sourceVideo.filePath);
    const options = body.colorIdMatte && typeof body.colorIdMatte === "object" ? body.colorIdMatte : body;
    const mattes = normalizedColorIdVideoMattes(options);
    if (!mattes.length) {
      const error = new Error("Pick a color in the Utility node.");
      error.status = 400;
      throw error;
    }

    const tolerance = clampInteger(options.tolerance, 0, 96, 0);
    const sampleRadius = clampInteger(options.sampleRadius, 0, 3, 0);
    const invert = Boolean(options.invert);
    const blur = clampNumber(options.blur, 0, 24, 0);
    const expand = clampInteger(options.expand, -12, 12, 0);
    const startTime = optionalNumber(options.startTime);
    const endTime = optionalNumber(options.endTime);
    const outputFormat = normalizeVideoOutputFormat(options.outputFormat);
    const text = mattes.length === 1 ? `Color ID video matte for ${mattes[0].color}.` : `${mattes.length} Color ID video mattes.`;
    const cost = {
      amountUsd: 0,
      currency: "USD",
      unitRateUsd: 0,
      units: mattes.length,
      unit: "local video mask",
      mediaType: "video",
      pricingBasis: "Local ffmpeg Color ID video matte generation",
      pricingSource: "local-color-id-video-matte"
    };
    const videos = [];

    for (const matte of mattes) {
      const extension = videoOutputExtension(outputFormat);
      const output = await createManagedAssetTarget({ body }, safeOutputKind(`color-id-video-matte-${matte.name}`), extension, workflowPackageOutputDirName);
      const outputPath = output.filePath;
      outputPaths.push(outputPath);

      await createColorIdMatteVideoWithFfmpeg({
        sourcePath: sourceVideo.filePath,
        outputPath,
        selectedColor: matte.color,
        tolerance,
        invert,
        blur,
        expand,
        startTime,
        endTime,
        outputFormat
      });

      const outputStats = await stat(outputPath);
      const outputMetadata = await probeVideoFile(outputPath);
      videos.push({
        label: matte.name,
        localUrl: output.publicPath,
        fileName: output.fileName,
        mimeType: videoOutputMimeType(outputFormat),
        bytes: outputStats.size,
        metadata: outputMetadata,
        color: matte.color
      });
    }
    const outputBytes = videos.reduce((sum, item) => sum + item.bytes, 0);

    await appendHistory({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "video",
      provider: "local",
      modelName: "Color ID Matte",
      endpoint: "local/color-id-video-matte",
      mode: "Color ID video matte",
      prompt: text,
      submittedPrompt: text,
      project: projectFromBody(body),
      node: nodeFromBody(body),
      settings: {
        model: "Color ID Matte",
        sourceVideoUrl,
        mattes: mattes.map((matte) => ({ name: matte.name, selectedColor: matte.color })),
        tolerance,
        sampleRadius,
        invert,
        blur,
        expand,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        outputFormat,
        width: metadata.width || null,
        height: metadata.height || null,
        fps: metadata.fps || null,
        duration: metadata.duration || null,
        frames: metadata.num_frames || null,
        ffmpeg: path.basename(ffmpegBinaryPath)
      },
      cost,
      localVideo: videos[0]?.localUrl,
      outputFileName: videos[0]?.fileName,
      outputBytes,
      text
    });

    return {
      modelName: "Color ID Matte",
      text,
      cost,
      video: enrichVideoMetadata(videos[0], videos[0]?.metadata),
      videos: videos.map((video) => enrichVideoMetadata(video, video.metadata))
    };
  } catch (error) {
    await Promise.all(outputPaths.map((outputPath) => rm(outputPath, { force: true }).catch(() => {})));
    throw error;
  }
}

async function createCompositeVideoResult({ body, baseVideoUrl, layerVideoUrl, maskVideoUrl }) {
  let outputPath = "";
  try {
    const baseVideo = await resolveLocalAssetPathFromUrl(baseVideoUrl);
    const layerVideo = await resolveLocalAssetPathFromUrl(layerVideoUrl);
    const maskVideo = await resolveLocalAssetPathFromUrl(maskVideoUrl);
    const baseMetadata = await probeVideoFile(baseVideo.filePath);
    const options = body.compositeVideo && typeof body.compositeVideo === "object" ? body.compositeVideo : {};
    const outputFormat = normalizeVideoOutputFormat(options.outputFormat);
    const output = await createManagedAssetTarget({ body }, "composite-video", videoOutputExtension(outputFormat), workflowPackageOutputDirName);
    outputPath = output.filePath;
    const invertMask = Boolean(options.invertMask);
    const maskBlur = clampNumber(options.maskBlur, 0, 24, 0);
    const maskExpand = clampInteger(options.maskExpand, -12, 12, 0);

    await compositeVideoWithFfmpeg({
      basePath: baseVideo.filePath,
      layerPath: layerVideo.filePath,
      maskPath: maskVideo.filePath,
      outputPath,
      baseMetadata,
      invertMask,
      maskBlur,
      maskExpand,
      outputFormat
    });

    const outputStats = await stat(outputPath);
    const outputMetadata = await probeVideoFile(outputPath);
    const localUrl = output.publicPath;
    const text = "Composite video.";
    const cost = {
      amountUsd: 0,
      currency: "USD",
      unitRateUsd: 0,
      units: 1,
      unit: "local composite",
      mediaType: "video",
      pricingBasis: "Local ffmpeg masked video composite",
      pricingSource: "local-composite-video"
    };

    await appendHistory({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mediaType: "video",
      provider: "local",
      modelName: "Composite Video",
      endpoint: "local/composite-video",
      mode: "Masked video composite",
      prompt: text,
      submittedPrompt: text,
      project: projectFromBody(body),
      node: nodeFromBody(body),
      settings: {
        model: "Composite Video",
        baseVideoUrl,
        layerVideoUrl,
        maskVideoUrl,
        invertMask,
        maskBlur,
        maskExpand,
        outputFormat,
        width: outputMetadata.width || baseMetadata.width || null,
        height: outputMetadata.height || baseMetadata.height || null,
        fps: outputMetadata.fps || baseMetadata.fps || null,
        duration: outputMetadata.duration || null,
        ffmpeg: path.basename(ffmpegBinaryPath)
      },
      cost,
      localVideo: localUrl,
      outputFileName: output.fileName,
      outputBytes: outputStats.size,
      text
    });

    return {
      modelName: "Composite Video",
      text,
      cost,
      video: enrichVideoMetadata(
        {
          label: "Composite Video",
          localUrl,
          fileName: output.fileName,
          mimeType: videoOutputMimeType(outputFormat)
        },
        outputMetadata
      )
    };
  } catch (error) {
    if (outputPath) await rm(outputPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function extractVideoFrameWithFfmpeg({ sourcePath, outputPath, frameTime, format }) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    formatFfmpegSeconds(frameTime),
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-an"
  ];

  if (format === "jpeg") {
    args.push("-q:v", "2");
  } else {
    args.push("-compression_level", "3");
  }

  args.push(outputPath);
  await runFfmpeg(args, "Extract frame");
}

async function createColorIdMatteVideoWithFfmpeg({ sourcePath, outputPath, selectedColor, tolerance, invert, blur, expand, startTime, endTime, outputFormat }) {
  const filter = colorIdVideoMatteFilter({ selectedColor, tolerance, invert, blur, expand, startTime, endTime });
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-vf",
    filter,
    "-an"
  ];

  addVideoEncoderArgs(args, outputFormat);
  args.push(outputPath);
  await runFfmpeg(args, "Color ID video matte", 600000);
}

async function compositeVideoWithFfmpeg({ basePath, layerPath, maskPath, outputPath, baseMetadata, invertMask, maskBlur, maskExpand, outputFormat }) {
  const width = Math.max(2, Math.round(Number(baseMetadata.width || 0)) || 1280);
  const height = Math.max(2, Math.round(Number(baseMetadata.height || 0)) || 720);
  const maskFilters = ["setpts=PTS-STARTPTS", `scale=${width}:${height}:flags=bicubic`, "format=gray"];
  if (invertMask) maskFilters.push("negate");
  maskFilters.push(...matteCleanupFilterParts({ blur: maskBlur, expand: maskExpand }));

  const filter = [
    `[0:v]setpts=PTS-STARTPTS,format=rgba[base]`,
    `[1:v]setpts=PTS-STARTPTS,scale=${width}:${height}:flags=bicubic,format=rgb24[layer]`,
    `[2:v]${maskFilters.join(",")}[mask]`,
    "[layer][mask]alphamerge[layer_alpha]",
    "[base][layer_alpha]overlay=shortest=1:format=auto,format=yuv420p[out]"
  ].join(";");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    basePath,
    "-i",
    layerPath,
    "-i",
    maskPath,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-map",
    "0:a?",
    "-shortest"
  ];

  addVideoEncoderArgs(args, outputFormat);
  args.push("-c:a", "aac", outputPath);
  await runFfmpeg(args, "Composite video", 600000);
}

async function padVideoWithFfmpeg({ sourcePath, outputPath, targetWidth, targetHeight }) {
  const filter = `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-vf",
    filter,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "14",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ];

  await runFfmpeg(args, "Pad video", 600000);
}

async function padImageWithFfmpeg({ sourcePath, outputPath, targetWidth, targetHeight }) {
  const filter = `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,format=rgb24`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    sourcePath,
    "-vf",
    filter,
    "-frames:v",
    "1",
    outputPath
  ];

  await runFfmpeg(args, "Pad image");
}

function colorIdVideoMatteFilter({ selectedColor, tolerance, invert, blur, expand, startTime, endTime }) {
  const color = selectedColor.replace("#", "0x");
  const similarity = colorIdVideoSimilarity(tolerance);
  const filters = ["format=rgba", `colorkey=${color}:${similarity.toFixed(4)}:0.0`, "alphaextract"];
  if (!invert) filters.push("negate");
  filters.push(...matteCleanupFilterParts({ blur, expand }));
  const trim = videoTrimFilterPart(startTime, endTime);
  if (trim) filters.push(trim, "setpts=PTS-STARTPTS");
  filters.push("format=yuv420p");
  return filters.join(",");
}

function matteCleanupFilterParts({ blur = 0, expand = 0 } = {}) {
  const filters = [];
  const expandCount = clampInteger(expand, -12, 12, 0);
  for (let index = 0; index < Math.abs(expandCount); index += 1) {
    filters.push(expandCount > 0 ? "dilation" : "erosion");
  }
  const blurRadius = clampNumber(blur, 0, 24, 0);
  if (blurRadius > 0) filters.push(`boxblur=${blurRadius}:1`);
  return filters;
}

function videoTrimFilterPart(startTime, endTime) {
  const start = optionalNumber(startTime);
  const end = optionalNumber(endTime);
  const parts = [];
  if (start !== undefined && start >= 0) parts.push(`start=${formatFfmpegSeconds(start)}`);
  if (end !== undefined && end > 0 && (start === undefined || end > start)) parts.push(`end=${formatFfmpegSeconds(end)}`);
  return parts.length ? `trim=${parts.join(":")}` : "";
}

function colorIdVideoSimilarity(tolerance) {
  const normalizedTolerance = clampInteger(tolerance, 0, 96, 0);
  return Math.min(1, Math.max(0.01, normalizedTolerance / 255));
}

function normalizedColorIdVideoMattes(options = {}) {
  const rawMattes = Array.isArray(options.mattes) ? options.mattes : [];
  const mattes = rawMattes
    .map((item, index) => {
      const color = normalizeColorIdHex(item?.selectedColor || item?.color);
      if (!color) return null;
      const name = String(item?.name || `Matte ${index + 1}`).trim() || `Matte ${index + 1}`;
      return { name, color };
    })
    .filter(Boolean)
    .slice(0, 16);

  if (mattes.length) return mattes;

  const selectedColor = normalizeColorIdHex(options.selectedColor || options.colorIdMatteColor || options.selected_color);
  if (!selectedColor) return [];
  return [
    {
      name: String(options.matteName || "Color ID Matte").trim() || "Color ID Matte",
      color: selectedColor
    }
  ];
}

function normalizeVideoOutputFormat(value) {
  const normalized = String(value || "mp4").toLowerCase();
  if (normalized === "webm") return "webm";
  if (normalized === "mov" || normalized.includes("prores")) return "mov";
  return "mp4";
}

function videoOutputExtension(format) {
  const normalized = normalizeVideoOutputFormat(format);
  if (normalized === "webm") return ".webm";
  if (normalized === "mov") return ".mov";
  return ".mp4";
}

function videoOutputMimeType(format) {
  const normalized = normalizeVideoOutputFormat(format);
  if (normalized === "webm") return "video/webm";
  if (normalized === "mov") return "video/quicktime";
  return "video/mp4";
}

function safeOutputKind(value) {
  return String(value || "output").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "output";
}

function addVideoEncoderArgs(args, outputFormat) {
  const format = normalizeVideoOutputFormat(outputFormat);
  if (format === "webm") {
    args.push("-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0", "-pix_fmt", "yuv420p");
    return;
  }
  if (format === "mov") {
    args.push("-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le");
    return;
  }
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p");
}

async function runFfmpeg(args, label, timeoutMs = 120000) {
  if (!ffmpegBinaryPath) {
    const error = new Error("Bundled ffmpeg is not available for this platform.");
    error.status = 503;
    throw error;
  }

  try {
    return await execFile(ffmpegBinaryPath, args, { windowsHide: true, timeout: timeoutMs });
  } catch (error) {
    const detail = String(error.stderr || error.message || "").trim();
    const message = detail ? `${label} failed: ${tailText(detail, 900)}` : `${label} failed.`;
    const nextError = new Error(message);
    nextError.status = 500;
    nextError.cause = error;
    throw nextError;
  }
}

function tailText(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

function extractFrameTime(value, duration) {
  const requested = Math.max(0, Number(value) || 0);
  const safeDuration = positiveNumber(duration);
  if (!safeDuration) return requested;
  return Math.min(requested, Math.max(0, safeDuration - 0.001));
}

function normalizeExtractFrameFormat(value) {
  return String(value || "").toLowerCase() === "jpeg" ? "jpeg" : "png";
}

function formatFfmpegSeconds(value) {
  return Math.max(0, Number(value) || 0).toFixed(3);
}

function formatFrameTimeLabel(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  if (minutes > 0) return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
  return `${remainder.toFixed(2)}s`;
}

function enrichVideoMetadata(video, metadata = {}) {
  const next = { ...(video || {}) };
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== null && value !== undefined && (next[key] === undefined || next[key] === null || next[key] === "")) {
      next[key] = value;
    }
  }
  return next;
}

async function downloadImage(req, url, kind, mimeTypeHint = "") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated image: ${response.status} ${response.statusText}`);
  }

  const mimeType = normalizeMimeType(mimeTypeHint || response.headers.get("content-type") || "image/png");
  const extension = imageExtensionForUrl(url, mimeType);
  const output = await createManagedAssetTarget(req, kind, extension, workflowPackageOutputDirName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(output.filePath, bytes);

  return {
    fileName: output.fileName,
    publicPath: output.publicPath,
    bytes: bytes.length,
    mimeType
  };
}

async function downloadModelFile(req, url, kind, mimeTypeHint = "") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated 3D model: ${response.status} ${response.statusText}`);
  }

  const mimeType = normalizeMimeType(mimeTypeHint || response.headers.get("content-type") || "model/gltf-binary", "model/gltf-binary");
  const extension = modelExtensionForUrl(url, mimeType);
  const output = await createManagedAssetTarget(req, kind, extension, workflowPackageOutputDirName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(output.filePath, bytes);

  return {
    fileName: output.fileName,
    publicPath: output.publicPath,
    bytes: bytes.length,
    mimeType
  };
}

function uniqueOutputFileName(kind, extension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeKind = String(kind || "output").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "output";
  const safeExtension = String(extension || "").startsWith(".") ? extension : `.${extension || "bin"}`;
  return `${timestamp}-${safeKind}-${randomUUID().slice(0, 8)}${safeExtension}`;
}

function imageExtensionForUrl(url, mimeType) {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) return extension;
  return extensionForMime(mimeType);
}

function modelExtensionForUrl(url, mimeType) {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  if ([".glb", ".gltf", ".obj"].includes(extension)) return extension;
  const normalizedMime = normalizeMimeType(mimeType, "model/gltf-binary");
  if (normalizedMime === "application/octet-stream") return ".glb";
  const inferred = extensionForMime(normalizedMime);
  return inferred === ".png" ? ".glb" : inferred;
}

function normalizeMimeType(value, fallback = "image/png") {
  return String(value || fallback).split(";")[0].trim().toLowerCase() || fallback;
}

function normalizeFalFile(value) {
  if (!value) return null;
  if (typeof value === "string") return { url: value };
  if (typeof value.url === "string") return value;
  if (typeof value.file_url === "string") return { ...value, url: value.file_url };
  if (typeof value.image_url === "string") return { ...value, url: value.image_url };
  if (typeof value.download_url === "string") return { ...value, url: value.download_url };
  if (typeof value.public_url === "string") return { ...value, url: value.public_url };
  return null;
}

function firstFalImageResult(data) {
  const knownResult =
    normalizeFalFile(data?.image) ||
    normalizeFalFile(data?.output_image) ||
    normalizeFalFile(data?.segmented_image) ||
    normalizeFalFile(data?.masked_image) ||
    normalizeFalFile(data?.mask_image) ||
    normalizeFalFile(data?.masks?.[0]) ||
    normalizeFalFile(data?.mask) ||
    normalizeFalFile(data?.images?.[0]) ||
    normalizeFalFile(data?.outputs?.[0]) ||
    normalizeFalFile(data?.result);

  return knownResult || findFalMediaFile(data, "image/");
}

function falImageResults(data) {
  const candidates = [];
  if (Array.isArray(data?.images)) candidates.push(...data.images);
  if (Array.isArray(data?.outputs)) candidates.push(...data.outputs);
  if (data?.image) candidates.push(data.image);
  if (data?.output_image) candidates.push(data.output_image);

  const normalized = candidates.map(normalizeFalFile).filter((file) => file?.url);
  if (normalized.length) return normalized;

  const fallback = firstFalImageResult(data);
  return fallback?.url ? [fallback] : [];
}

function findFalMediaFile(value, mimePrefix, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  const file = normalizeFalFile(value);
  if (file && falFileMatchesMedia(file, mimePrefix)) return file;

  for (const child of Object.values(value)) {
    const found = findFalMediaFile(child, mimePrefix, seen);
    if (found) return found;
  }

  return null;
}

function falFileMatchesMedia(file, mimePrefix) {
  const contentType = String(file.content_type || file.mimeType || file.mime_type || "").toLowerCase();
  if (contentType.startsWith(mimePrefix)) return true;

  if (mimePrefix === "image/") {
    const fileName = String(file.file_name || file.fileName || file.name || file.url || "").toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp"].some((extension) => fileName.includes(extension));
  }

  if (mimePrefix === "video/") {
    const fileName = String(file.file_name || file.fileName || file.name || file.url || "").toLowerCase();
    return [".mp4", ".mov", ".webm", ".gif"].some((extension) => fileName.includes(extension));
  }

  if (mimePrefix === "model/") {
    const fileName = String(file.file_name || file.fileName || file.name || file.url || "").toLowerCase();
    return [".glb", ".gltf", ".obj"].some((extension) => fileName.includes(extension));
  }

  return false;
}

async function readHistory() {
  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    return JSON.parse(await readFile(historyPath, "utf8"));
  } catch {
    await rm(historyPath, { force: true });
    await rm(historyIndexPath, { force: true }).catch(() => {});
    return [];
  }
}

async function readHistorySummaries() {
  const source = await fileMetadata(historyPath);
  if (!source.exists) return [];

  const cached = await readJsonFile(historyIndexPath, null);
  if (
    cached?.version === 1 &&
    cached.source?.size === source.size &&
    cached.source?.mtimeMs === source.mtimeMs &&
    Array.isArray(cached.items)
  ) {
    return cached.items;
  }

  const history = await readHistory();
  const items = summarizeHistoryItems(history);
  await writeHistoryIndex(items, source);
  return items;
}

async function writeHistoryIndex(items, source = null) {
  const nextSource = source || await fileMetadata(historyPath);
  await writeJsonAtomic(historyIndexPath, {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: nextSource,
    items
  });
}

function summarizeHistoryItems(history = []) {
  return history.map(historyMetadataSummary);
}

function historyMetadataSummary(item = {}) {
  return {
    id: item.id || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    mediaType: item.mediaType || "",
    prompt: item.prompt || item.text || "",
    mode: item.mode || "",
    modelName: item.modelName || "",
    routeKind: item.routeKind || "",
    project: item.project || null,
    node: item.node ? { id: item.node.id || "", title: item.node.title || "", type: item.node.type || "" } : null,
    localImage: item.localImage || "",
    localImages: Array.isArray(item.localImages) ? item.localImages : [],
    localVideo: item.localVideo || "",
    localVideos: Array.isArray(item.localVideos) ? item.localVideos : [],
    localAudio: item.localAudio || "",
    localAudios: Array.isArray(item.localAudios) ? item.localAudios : [],
    localModel: item.localModel || "",
    localModels: Array.isArray(item.localModels) ? item.localModels : [],
    outputFileName: item.outputFileName || "",
    cost: item.cost || null,
    duration: item.duration || item.durationSeconds || "",
    seed: item.seed || ""
  };
}

function pageHistorySummaries(items, req) {
  let paged = Array.isArray(items) ? items : [];
  const cursor = String(req.query.cursor || "").trim();
  const limit = boundedInteger(req.query.limit, 50, 1, maxHistoryItems);

  if (cursor) {
    const cursorIndex = paged.findIndex((item) => item.id === cursor);
    if (cursorIndex >= 0) {
      paged = paged.slice(cursorIndex + 1);
    } else {
      const cursorTime = Date.parse(cursor);
      if (Number.isFinite(cursorTime)) {
        paged = paged.filter((item) => {
          const itemTime = Date.parse(item.createdAt || item.updatedAt || "");
          return Number.isFinite(itemTime) && itemTime < cursorTime;
        });
      }
    }
  }

  return paged.slice(0, limit);
}

async function subscribeFal(endpoint, options = {}, context = {}) {
  const startedAt = Date.now();
  const inputSummary = summarizeFalValue(options.input, "input");
  const originalOnEnqueue = options.onEnqueue;
  const originalOnQueueUpdate = options.onQueueUpdate;
  const seenLogKeys = new Set();
  let requestId = "";
  let lastStatus = "";
  let lastQueuePosition = "";

  writeFalDebugLog({
    event: "submit",
    endpoint,
    context,
    input: inputSummary
  });

  try {
    const result = await fal.subscribe(endpoint, {
      ...options,
      logs: options.logs ?? true,
      onEnqueue: (nextRequestId) => {
        requestId = nextRequestId || requestId;
        writeFalDebugLog({
          event: "enqueued",
          endpoint,
          requestId,
          context
        });
        originalOnEnqueue?.(nextRequestId);
      },
      onQueueUpdate: (update) => {
        requestId = update?.request_id || requestId;
        const status = update?.status || "UNKNOWN";
        const queuePosition = update?.queue_position ?? update?.position ?? null;
        const positionKey = queuePosition === null || queuePosition === undefined ? "" : String(queuePosition);

        if (status !== lastStatus || positionKey !== lastQueuePosition) {
          lastStatus = status;
          lastQueuePosition = positionKey;
          writeFalDebugLog({
            event: "queue",
            endpoint,
            requestId,
            status,
            queuePosition,
            elapsedMs: Date.now() - startedAt,
            context
          });
        }

        for (const log of update?.logs || []) {
          const message = String(log?.message || "").trim();
          if (!message) continue;
          const logKey = `${log?.timestamp || ""}:${log?.level || ""}:${message}`;
          if (seenLogKeys.has(logKey)) continue;
          seenLogKeys.add(logKey);
          writeFalDebugLog({
            event: "log",
            endpoint,
            requestId,
            level: log?.level || "",
            source: log?.source || "",
            timestamp: log?.timestamp || "",
            message: truncateString(message, 1000),
            elapsedMs: Date.now() - startedAt,
            context
          });
        }

        originalOnQueueUpdate?.(update);
      }
    });

    writeFalDebugLog({
      event: "completed",
      endpoint,
      requestId: result?.requestId || requestId,
      elapsedMs: Date.now() - startedAt,
      output: summarizeFalValue(result?.data, "output"),
      context
    });
    return result;
  } catch (error) {
    writeFalDebugLog({
      event: "failed",
      endpoint,
      requestId,
      elapsedMs: Date.now() - startedAt,
      error: summarizeFalError(error),
      context
    });
    throw error;
  }
}

function writeFalDebugLog(entry) {
  const line = JSON.stringify({
    createdAt: new Date().toISOString(),
    ...entry
  });
  const consoleMessage = formatFalDebugConsoleLine(entry);
  if (consoleMessage) console.log(consoleMessage);

  void (async () => {
    await mkdir(dataDir, { recursive: true });
    await appendFile(falDebugLogPath, `${line}\n`);
  })().catch((error) => {
    console.warn("Fal debug log write failed:", error.message);
  });
}

function formatFalDebugConsoleLine(entry) {
  const request = entry.requestId ? ` ${entry.requestId}` : "";
  if (entry.event === "log") return `[fal:${entry.endpoint}${request}] ${entry.message}`;
  if (entry.event === "queue") {
    const position = entry.queuePosition === null || entry.queuePosition === undefined ? "" : ` position=${entry.queuePosition}`;
    return `[fal:${entry.endpoint}${request}] ${entry.status}${position}`;
  }
  if (entry.event === "failed") return `[fal:${entry.endpoint}${request}] failed: ${entry.error?.message || "unknown error"}`;
  if (entry.event === "completed") return `[fal:${entry.endpoint}${request}] completed in ${Math.round((entry.elapsedMs || 0) / 1000)}s`;
  if (entry.event === "enqueued") return `[fal:${entry.endpoint}${request}] enqueued`;
  if (entry.event === "submit") return `[fal:${entry.endpoint}] submit`;
  return "";
}

function summarizeFalError(error) {
  return {
    name: error?.name || "",
    message: truncateString(publicErrorMessage(error, error?.message || "Fal request failed."), 1000),
    status: errorStatusCode(error),
    requestId: error?.requestId || error?.body?.request_id || error?.data?.request_id || "",
    body: summarizeFalValue(error?.body || error?.data || error?.response?.data || null, "error")
  };
}

function summarizeFalValue(value, key = "", depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;

  const normalizedKey = String(key || "").toLowerCase();
  if (typeof value === "string") {
    if (normalizedKey.includes("key") || normalizedKey.includes("token") || normalizedKey.includes("authorization")) {
      return "[redacted]";
    }
    if (normalizedKey.includes("url") || /^https?:\/\//i.test(value) || isLocalAssetUrl(value)) {
      return summarizeFalUrl(value);
    }
    if (normalizedKey.includes("prompt") || normalizedKey.includes("text") || value.length > 160) {
      return {
        type: "string",
        length: value.length,
        preview: truncateString(value.replace(/\s+/g, " ").trim(), 180)
      };
    }
    return value;
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((item, index) => summarizeFalValue(item, `${key}[${index}]`, depth + 1));
    if (value.length > items.length) items.push({ omitted: value.length - items.length });
    return items;
  }

  if (typeof value === "object") {
    if (depth >= 4) {
      return {
        type: "object",
        keys: Object.keys(value).slice(0, 20)
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([nextKey, nextValue]) => [nextKey, summarizeFalValue(nextValue, nextKey, depth + 1)])
    );
  }

  return String(value);
}

function summarizeFalUrl(value) {
  if (isLocalAssetUrl(value)) {
    return {
      type: "local-url",
      path: value.replace(/^\/(outputs|uploads|workflow-assets)\//, "/$1/.../")
    };
  }

  try {
    const parsed = new URL(value);
    return {
      type: "remote-url",
      host: parsed.hostname,
      file: path.basename(parsed.pathname) || ""
    };
  } catch {
    return {
      type: "url",
      length: value.length,
      preview: truncateString(value, 120)
    };
  }
}

function truncateString(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

async function appendHistory(item) {
  const write = historyWriteQueue.then(async () => {
    const history = await readHistory();
    history.unshift(item);
    await writeHistory(history.slice(0, maxHistoryItems));
  });
  historyWriteQueue = write.catch(() => {});
  return write;
}

async function writeHistory(history) {
  await writeJsonAtomic(historyPath, history);
  await writeHistoryIndex(summarizeHistoryItems(history)).catch(() => {});
}

function errorStatusCode(error) {
  const status = Number(error?.statusCode || error?.status || error?.response?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function sendApiError(res, error, fallback) {
  const status = errorStatusCode(error);
  let message = fallback;
  try {
    message = publicErrorMessage(error, fallback) || fallback;
  } catch (formatError) {
    console.error("Failed to format API error.", formatError);
    message = error?.message || fallback;
  }

  if (!res.headersSent) {
    res.status(status).json({
      error: message,
      status
    });
  }
}

function publicErrorMessage(error, fallback) {
  const validationMessage = validationErrorMessage(error);
  if (validationMessage) return validationMessage;

  const candidates = [
    error?.message,
    error?.body?.detail,
    error?.body?.message,
    error?.body?.error,
    error?.data?.detail,
    error?.data?.message,
    error?.data?.error,
    error?.response?.data?.detail,
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.cause?.message,
    typeof error === "string" ? error : ""
  ];

  for (const candidate of candidates) {
    const message = publicErrorDetail(candidate);
    if (message) return message;
  }

  return fallback;
}

function validationErrorMessage(error) {
  const status = errorStatusCode(error);
  if (status !== 422 && error?.name !== "ValidationError") return "";
  return publicErrorDetail(safeValidationFieldErrors(error) || error?.body?.detail || error?.data?.detail || error?.response?.data?.detail);
}

function safeValidationFieldErrors(error) {
  try {
    return error?.fieldErrors;
  } catch {
    return null;
  }
}

function publicErrorDetail(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(publicErrorDetail).filter(Boolean).join(" ");
  if (typeof value === "object") {
    if (value.msg || value.message) {
      const location = Array.isArray(value.loc) ? value.loc.filter((item) => item !== "body").join(".") : "";
      const message = publicErrorDetail(value.msg || value.message);
      return location ? `${location}: ${message}` : message;
    }

    const direct = publicErrorDetail(value.msg || value.message || value.detail || value.error);
    if (direct) return direct;

    try {
      return JSON.stringify(value).slice(0, 700);
    } catch {
      return "";
    }
  }

  return String(value).trim();
}

function normalizeVoidVideoFrameCount(value) {
  const numeric = optionalInteger(value) ?? 85;
  return voidVideoFrameOptions.reduce((nearest, option) => (Math.abs(option - numeric) < Math.abs(nearest - numeric) ? option : nearest), 85);
}

const seedanceResolutionDimensions = {
  "480p": {
    "21:9": [992, 432],
    "16:9": [864, 496],
    "4:3": [752, 560],
    "1:1": [640, 640],
    "3:4": [560, 752],
    "9:16": [496, 864]
  },
  "720p": {
    "21:9": [1470, 630],
    "16:9": [1280, 720],
    "4:3": [1112, 834],
    "1:1": [960, 960],
    "3:4": [834, 1112],
    "9:16": [720, 1280]
  },
  "1080p": {
    // Fal's usage ledger bills 1080p Seedance close to 2K token dimensions,
    // even when the downloaded MP4 is 1920x1080 or 1080x1920.
    "21:9": [2352, 1008],
    "16:9": [2048, 1152],
    "4:3": [1792, 1344],
    "1:1": [1536, 1536],
    "3:4": [1344, 1792],
    "9:16": [1152, 2048]
  }
};

function estimateSeedanceCost({ speed, duration, resolution, aspectRatio, endpoint, routeKind }) {
  const seconds = durationToSeconds(duration);
  const isFast = speed === "fast" || String(endpoint || "").includes("/fast/");
  const unitRateUsd = isFast ? seedanceFastCostPerThousandTokens : seedanceStandardCostPerThousandTokens;
  const dimensions = seedanceBillingDimensions(resolution, aspectRatio);
  const billableUnits = (dimensions.width * dimensions.height * seconds * seedanceBillingFps) / 1024 / 1000;
  const amountUsd = roundCurrency(billableUnits * unitRateUsd);

  return {
    amountUsd,
    currency: "USD",
    unitRateUsd,
    units: roundUsageUnits(billableUnits),
    unit: "1K Seedance tokens",
    mediaType: "video",
    resolution,
    aspectRatio,
    billingWidth: dimensions.width,
    billingHeight: dimensions.height,
    durationSeconds: seconds,
    billingFps: seedanceBillingFps,
    pricingBasis: "Seedance 2.0 fal.ai token estimate: width * height * duration * 24 / 1024, billed per 1K tokens",
    pricingSource: "fal-model-page-2026-05-18",
    routeKind
  };
}

function estimateHappyHorseCost({ duration, resolution, endpoint }) {
  const seconds = Math.max(3, Math.min(15, Number(duration) || 5));
  const unitRateUsd = resolution === "720p" ? happyHorse720pCostPerSecond : happyHorse1080pCostPerSecond;

  return {
    amountUsd: roundCurrency(seconds * unitRateUsd),
    currency: "USD",
    unitRateUsd,
    units: seconds,
    unit: "second",
    mediaType: "video",
    resolution,
    pricingBasis: "Happy Horse fal.ai per-second pricing estimate",
    pricingSource: "fal-model-page-2026-05-16",
    endpoint,
    routeKind: "reference-to-video"
  };
}

function estimateWan27ReferenceVideoCost({ endpoint, duration, outputVideo, referenceVideoDurations = [], resolution, aspectRatio }) {
  const outputSeconds = positiveNumber(outputVideo?.duration) || positiveNumber(duration) || 5;
  const inputVideoSeconds = referenceVideoDurations.reduce((total, seconds) => total + (positiveNumber(seconds) || 0), 0);
  const billableSeconds = outputSeconds + inputVideoSeconds;

  return {
    amountUsd: roundCurrency(billableSeconds * wan27ReferenceVideoCostPerSecond),
    currency: "USD",
    unitRateUsd: wan27ReferenceVideoCostPerSecond,
    units: roundUsageUnits(billableSeconds),
    unit: "video second",
    mediaType: "video",
    resolution,
    aspectRatio,
    outputDurationSeconds: outputSeconds,
    referenceVideoDurationSeconds: roundUsageUnits(inputVideoSeconds),
    pricingBasis: "Wan 2.7 Reference-to-Video fal.ai estimate at $0.10 per output second plus connected reference video seconds",
    pricingSource: "fal-model-page-2026-05-25",
    endpoint,
    routeKind: "reference-to-video"
  };
}

function seedanceBillingDimensions(resolution, aspectRatio) {
  const normalizedResolution = normalizeChoice(resolution, ["480p", "720p", "1080p"], "720p");
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  const [width, height] =
    seedanceResolutionDimensions[normalizedResolution]?.[normalizedAspectRatio] ||
    seedanceResolutionDimensions[normalizedResolution]?.["16:9"] ||
    seedanceResolutionDimensions["720p"]["16:9"];
  return { width, height };
}

function roundUsageUnits(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function estimateWanFunControlCost({ endpoint, matchInputNumFrames, numFrames, matchInputFps, fps }) {
  const billingFrames = matchInputNumFrames ? 81 : numFrames;
  const seconds = billingFrames / 16;
  const unitRateUsd = wanFunControlCostPerSecond;

  return {
    amountUsd: roundCurrency(seconds * unitRateUsd),
    currency: "USD",
    unitRateUsd,
    units: seconds,
    unit: "video second",
    mediaType: "video",
    pricingBasis: "fal.ai Wan Fun Control per-video-second pricing estimate at 16 fps",
    pricingSource: "fal-model-page-2026-05-11",
    endpoint,
    matchInputNumFrames,
    billingFrames,
    numFrames: numFrames || null,
    matchInputFps,
    fps: fps || null
  };
}

function estimateWanVaceInpaintingCost({ endpoint, resolution, outputVideo, matchInputNumFrames, numFrames, matchInputFps, fps }) {
  const billingResolution = resolveWanVaceBillingResolution(resolution, outputVideo);
  const unitRateUsd = wanVaceCostPerSecond[billingResolution] || wanVaceCostPerSecond["480p"];
  const frameCount = wanVaceBillingFrames(outputVideo, numFrames);
  const billingFps = 16;
  const seconds = frameCount ? frameCount / billingFps : positiveNumber(outputVideo?.duration);

  return {
    amountUsd: seconds ? roundCurrency(seconds * unitRateUsd) : null,
    currency: "USD",
    unitRateUsd,
    units: seconds ? roundUsageUnits(seconds) : null,
    unit: "video second",
    mediaType: "video",
    resolution,
    billingResolution,
    durationSeconds: positiveNumber(outputVideo?.duration),
    billingFrames: frameCount || null,
    billingFps,
    matchInputNumFrames,
    numFrames: numFrames || null,
    matchInputFps,
    fps: fps || null,
    pricingBasis: seconds
      ? "Wan VACE fal.ai per-video-second estimate; video seconds are calculated at 16 frames per second"
      : "Wan VACE fal.ai per-video-second estimate; local duration/frame count unavailable",
    pricingSource: "fal-model-page-2026-05-25",
    endpoint
  };
}

function resolveWanVaceBillingResolution(resolution, outputVideo = {}) {
  const configured = normalizeChoice(resolution, ["auto", "240p", "360p", "480p", "580p", "720p"], "auto");
  if (wanVaceCostPerSecond[configured]) return configured;

  const width = Number(outputVideo.width || outputVideo.metadata?.width || 0);
  const height = Number(outputVideo.height || outputVideo.metadata?.height || 0);
  const shortSide = width > 0 && height > 0 ? Math.min(width, height) : 0;
  if (shortSide >= 700) return "720p";
  if (shortSide >= 560) return "580p";
  return "480p";
}

function wanVaceBillingFrames(outputVideo = {}, fallbackFrames) {
  const metadataFrames = positiveNumber(outputVideo.num_frames || outputVideo.frames || outputVideo.frame_count || outputVideo.frameCount);
  if (metadataFrames) return Math.round(metadataFrames);
  const configuredFrames = positiveNumber(fallbackFrames);
  if (configuredFrames) return Math.round(configuredFrames);
  const duration = positiveNumber(outputVideo.duration);
  const fps = positiveNumber(outputVideo.fps);
  if (duration && fps) return Math.round(duration * fps);
  return null;
}

function estimateAuroraCost({ endpoint, resolution, duration }) {
  const seconds = Number(duration) > 0 ? Math.ceil(Number(duration)) : null;
  const unitRateUsd = resolution === "480p" ? aurora480pCostPerSecond : aurora720pCostPerSecond;

  return {
    amountUsd: seconds ? roundCurrency(seconds * unitRateUsd) : null,
    currency: "USD",
    unitRateUsd,
    units: seconds,
    unit: "video second",
    mediaType: "video",
    resolution,
    pricingBasis: "Creatify Aurora fal.ai rounded per-video-second pricing estimate",
    pricingSource: "fal-model-page-2026-05-12",
    endpoint
  };
}

function estimateSam3ImageCost({ endpoint }) {
  return {
    amountUsd: sam3ImageCostPerRequest,
    currency: "USD",
    unitRateUsd: sam3ImageCostPerRequest,
    units: 1,
    unit: "request",
    mediaType: "image",
    pricingBasis: "SAM 3 image segmentation fal.ai per-request pricing estimate",
    pricingSource: "fal-model-page-2026-05-12",
    endpoint
  };
}

function estimateSam3VideoCost({ endpoint, frames }) {
  const frameCount = Number(frames || 0);
  const billedUnits = frameCount > 0 ? Math.ceil(frameCount / 16) : null;

  return {
    amountUsd: billedUnits ? roundCurrency(billedUnits * sam3VideoCostPer16Frames) : null,
    currency: "USD",
    unitRateUsd: sam3VideoCostPer16Frames,
    units: billedUnits,
    unit: "16 frames",
    mediaType: "video",
    pricingBasis: billedUnits
      ? "SAM 3 video segmentation fal.ai pricing estimate at $0.005 per 16 frames"
      : "SAM 3 video segmentation fal.ai pricing estimate at $0.005 per 16 frames; local frame count unavailable",
    pricingSource: "fal-model-page-2026-05-12",
    endpoint,
    frames: frameCount || null
  };
}

function estimateFalImageUtilityCost({ endpoint, mediaType, pricingBasis, amountUsd = null, unitRateUsd = null, units = 1, unit = "request", pricingSource = "fal-model-page-2026-05-13" }) {
  return {
    amountUsd,
    currency: "USD",
    unitRateUsd,
    units,
    unit,
    mediaType,
    pricingBasis,
    pricingSource,
    endpoint
  };
}

function estimateFalVideoUtilityCost({ endpoint, pricingBasis, amountUsd = null, unitRateUsd = null, units = 1, unit = "request", pricingSource = "fal-model-page-2026-05-15" }) {
  return {
    amountUsd,
    currency: "USD",
    unitRateUsd,
    units,
    unit,
    mediaType: "video",
    pricingBasis,
    pricingSource,
    endpoint
  };
}

function estimateBytedanceVideoUpscalerCost({ endpoint, targetResolution, targetFps, enhancementTier, duration }) {
  const resolution = normalizeChoice(targetResolution, bytedanceUpscalerResolutionOptions, "1080p");
  const seconds = positiveNumber(duration);
  const baseRate = bytedanceUpscalerCostPerSecond[resolution] || bytedanceUpscalerCostPerSecond["1080p"];
  const fpsMultiplier = targetFps === "60fps" ? 2 : 1;
  const tierMultiplier = enhancementTier === "pro" ? 10 : 1;
  const unitRateUsd = baseRate * fpsMultiplier * tierMultiplier;

  return {
    amountUsd: seconds ? roundCurrency(seconds * unitRateUsd) : null,
    currency: "USD",
    unitRateUsd,
    units: seconds,
    unit: "video second",
    mediaType: "video",
    targetResolution: resolution,
    targetFps,
    enhancementTier,
    durationSeconds: seconds,
    pricingBasis: seconds
      ? "Bytedance Video Upscaler fal.ai per-second estimate by output resolution, FPS, and tier"
      : "Bytedance Video Upscaler fal.ai per-second estimate; duration unavailable",
    pricingSource: "fal-model-page-2026-05-18",
    endpoint
  };
}

function estimateTopazVideoUpscalerCost({ endpoint, model, targetFps, billingResolutionTier, remoteVideo, duration }) {
  const resolvedTier = resolveTopazBillingTier(billingResolutionTier, remoteVideo);
  const seconds = positiveNumber(duration || remoteVideo?.duration);
  const baseRate = topazUpscalerCostPerSecond[resolvedTier] || topazUpscalerCostPerSecond["above-1080p"];
  const fpsMultiplier = Number(targetFps || 0) >= 60 ? 2 : 1;
  const modelMultiplier = model === "Gaia 2" ? 0.5 : 1;
  const unitRateUsd = baseRate * fpsMultiplier * modelMultiplier;

  return {
    amountUsd: seconds ? roundCurrency(seconds * unitRateUsd) : null,
    currency: "USD",
    unitRateUsd,
    units: seconds,
    unit: "video second",
    mediaType: "video",
    billingResolutionTier: resolvedTier,
    model,
    targetFps: targetFps || null,
    durationSeconds: seconds,
    pricingBasis: seconds
      ? "Topaz Video Upscale fal.ai per-second estimate by output resolution tier and FPS"
      : "Topaz Video Upscale fal.ai per-second estimate; duration unavailable",
    pricingSource: "fal-model-page-2026-05-18",
    endpoint
  };
}

function resolveTopazBillingTier(billingResolutionTier, remoteVideo) {
  const configuredTier = normalizeChoice(billingResolutionTier, topazUpscalerBillingTierOptions, "auto");
  if (configuredTier !== "auto") return configuredTier;

  const width = Number(remoteVideo?.width || remoteVideo?.metadata?.width || 0);
  const height = Number(remoteVideo?.height || remoteVideo?.metadata?.height || 0);
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (longSide > 0 && shortSide > 0) {
    if (longSide <= 1280 && shortSide <= 720) return "up-to-720p";
    if (longSide <= 1920 && shortSide <= 1080) return "720p-1080p";
  }

  return "above-1080p";
}

function estimatePatinaCost({ endpoint, maps, image }) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  const mapCount = Math.max(1, Array.isArray(maps) ? maps.length : 1);
  const megapixels = width > 0 && height > 0 ? (width * height) / 1000000 : null;
  const amountUsd = megapixels ? roundCurrency(patinaBaseCost + megapixels * mapCount * patinaMapCostPerMegapixel) : null;

  return estimateFalImageUtilityCost({
    endpoint,
    mediaType: "image",
    amountUsd,
    unitRateUsd: patinaMapCostPerMegapixel,
    units: megapixels ? roundCurrency(megapixels * mapCount) : null,
    unit: "map megapixel",
    pricingBasis: "Patina fal.ai estimate at $0.01 base plus $0.01 per megapixel per output map",
    pricingSource: "fal-model-page-2026-05-15"
  });
}

function estimateVoidVideoInpaintingCost({ endpoint, enablePass2Refinement, hasMaskVideo }) {
  const operationCount = 1 + (enablePass2Refinement ? 1 : 0) + (hasMaskVideo ? 0 : 1);
  return estimateFalVideoUtilityCost({
    endpoint,
    amountUsd: roundCurrency(operationCount * voidVideoInpaintingBaseCost),
    unitRateUsd: voidVideoInpaintingBaseCost,
    units: operationCount,
    unit: "video operation",
    pricingBasis: "VOID fal.ai estimate at $0.05 per video, +$0.05 for Pass2, +$0.05 when SAM 3 quad mask generation is needed",
    pricingSource: "fal-model-page-2026-05-15"
  });
}

function estimateQwenCameraEditCost({ endpoint, image }) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  const megapixels = width > 0 && height > 0 ? (width * height) / 1000000 : null;
  const unitRateUsd = 0.035;

  return {
    amountUsd: megapixels ? roundCurrency(megapixels * unitRateUsd) : null,
    currency: "USD",
    unitRateUsd,
    units: megapixels ? roundCurrency(megapixels) : null,
    unit: "megapixel",
    mediaType: "image",
    pricingBasis: "Qwen Image Edit 2511 Multiple Angles fal.ai per-megapixel estimate",
    pricingSource: "fal-model-page-2026-05-12",
    endpoint
  };
}

function estimateImageCost({ resolution }) {
  const normalized = String(resolution || "2K").toUpperCase();
  const amountUsd = normalized.includes("4K") ? nanoBananaCost4K : nanoBananaCost1K2K;

  return {
    amountUsd: roundCurrency(amountUsd),
    currency: "USD",
    unitRateUsd: amountUsd,
    units: 1,
    unit: "image",
    mediaType: "image",
    resolution,
    pricingBasis: "Nano Banana Pro fal.ai per-image estimate",
    pricingSource: "fal-model-page-2026-05-15"
  };
}

function estimateZImageCost({ endpoint, resolution, imageSize }) {
  const width = Number(imageSize?.width || 0);
  const height = Number(imageSize?.height || 0);
  const megapixels = width > 0 && height > 0 ? (width * height) / 1000000 : null;
  return {
    amountUsd: megapixels ? roundCurrency(megapixels * zImageCostPerMegapixel) : null,
    currency: "USD",
    unitRateUsd: zImageCostPerMegapixel,
    units: megapixels ? roundUsageUnits(megapixels) : null,
    unit: "megapixel",
    mediaType: "image",
    resolution,
    imageSize,
    pricingBasis: "Z-Image Turbo fal.ai per-megapixel estimate at $0.005/MP",
    pricingSource: "fal-model-page-2026-06-04",
    endpoint
  };
}

function estimateLumaRay2Cost({ endpoint, duration, resolution, routeKind }) {
  const seconds = durationToSeconds(duration);
  const durationMultiplier = seconds > 5 ? 2 : 1;
  const resolutionMultiplier = resolution === "1080p" ? 4 : resolution === "720p" ? 2 : 1;
  const amountUsd = roundCurrency(lumaRay2BaseCostPerFiveSeconds * durationMultiplier * resolutionMultiplier);

  return {
    amountUsd,
    currency: "USD",
    unitRateUsd: lumaRay2BaseCostPerFiveSeconds,
    units: durationMultiplier * resolutionMultiplier,
    unit: "5s 540p Ray2 equivalent",
    mediaType: "video",
    resolution,
    durationSeconds: seconds,
    pricingBasis: "Luma Ray2 fal.ai estimate: $0.50 per 5-second 540p clip; 9s costs 2x, 720p costs 2x, 1080p costs 4x",
    pricingSource: "fal-model-page-2026-05-31",
    endpoint,
    routeKind
  };
}

function estimateLumaPhotonCost({ aspectRatio, remoteImage = {}, endpoint }) {
  const width = Number(remoteImage.width || remoteImage.metadata?.width || 0);
  const height = Number(remoteImage.height || remoteImage.metadata?.height || 0);
  const megapixels = width > 0 && height > 0 ? (width * height) / 1000000 : 1;

  return {
    amountUsd: roundCurrency(megapixels * lumaPhotonCostPerMegapixel),
    currency: "USD",
    unitRateUsd: lumaPhotonCostPerMegapixel,
    units: roundUsageUnits(megapixels),
    unit: "megapixel",
    mediaType: "image",
    aspectRatio,
    pricingBasis: "Luma Photon fal.ai per-megapixel estimate",
    pricingSource: "fal-model-page-2026-05-31",
    endpoint
  };
}

function estimateHunyuan3DProCost({ generateType, enablePbr, faceCount, inputImageCount = 1, endpoint }) {
  const customFaceCount = Number(faceCount) !== 500000;
  const multiView = Number(inputImageCount) > 1;
  const addOnCount = (enablePbr && generateType !== "Geometry" ? 1 : 0) + (customFaceCount ? 1 : 0) + (multiView ? 1 : 0);
  const amountUsd = hunyuan3DProBaseCost + addOnCount * hunyuan3DProAddOnCost;

  return {
    amountUsd: roundCurrency(amountUsd),
    currency: "USD",
    unitRateUsd: hunyuan3DProBaseCost,
    units: 1,
    unit: "3D generation",
    mediaType: "model3d",
    generateType,
    enablePbr,
    faceCount,
    inputImageCount,
    pricingBasis: "Hunyuan 3D Pro fal.ai estimate: base generation plus PBR, multi-view, and custom face-count add-ons",
    pricingSource: "fal-model-page-2026-05-23",
    endpoint
  };
}

function estimateOpenAiImage2Cost({ resolution, size, quality }) {
  return {
    amountUsd: roundCurrency(openAiImage2MediumCost),
    currency: "USD",
    unitRateUsd: openAiImage2MediumCost,
    units: 1,
    unit: "image",
    mediaType: "image",
    resolution,
    size,
    quality,
    pricingBasis: "OpenAI GPT Image 2 medium image output estimate"
  };
}

function estimateTextProcessingCost({ provider, usage = null, helperUsages = [], imageInputs = [], videoInputs = [] }) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const requestUsageCost = usageCost(usage);
  const helperUsageCosts = (Array.isArray(helperUsages) ? helperUsages : []).map(usageCost).filter((amount) => amount !== null);

  if (normalizedProvider === "fal" && (requestUsageCost !== null || helperUsageCosts.length)) {
    const fallbackRequestCost = requestUsageCost === null ? falTextRequestCost : 0;
    const amountUsd = roundCurrency((requestUsageCost || 0) + fallbackRequestCost + helperUsageCosts.reduce((sum, amount) => sum + amount, 0));

    return {
      amountUsd,
      currency: "USD",
      unitRateUsd: null,
      units: 1 + helperUsageCosts.length,
      unit: "reported request",
      mediaType: "text",
      pricingBasis: "fal.ai reported OpenRouter token usage plus any-llm base request fallback when needed",
      pricingSource: "fal-usage-response"
    };
  }

  if (normalizedProvider !== "fal") {
    return {
      amountUsd: null,
      currency: "USD",
      unitRateUsd: null,
      units: 1,
      unit: "request",
      mediaType: "text",
      pricingBasis: "OpenAI text usage recorded, but local token-to-price estimate is not configured",
      pricingSource: "usage-no-local-pricing"
    };
  }

  const textRequestCost = falTextRequestCost;
  const imageHelperCost = imageInputs.length ? falVisionTextUnitCost : 0;
  const videoHelperCost = videoInputs.length ? falVideoTextUnitCost : 0;
  const amountUsd = roundCurrency(textRequestCost + imageHelperCost + videoHelperCost);

  return {
    amountUsd,
    currency: "USD",
    unitRateUsd: textRequestCost,
    units: 1,
    unit: "request",
    mediaType: "text",
    pricingBasis: normalizedProvider === "fal" ? "fal.ai any-llm request estimate plus media helper calls" : "No local token estimate for OpenAI text",
    pricingSource: "configured-pricing-v1"
  };
}

function usageCost(usage) {
  if (!usage) return null;

  if (Array.isArray(usage)) {
    const amounts = usage.map(usageCost).filter((amount) => amount !== null);
    return amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
  }

  if (typeof usage === "object") {
    const nestedAmounts = [usage.request, ...(Array.isArray(usage.helpers) ? usage.helpers : [])].map(usageCost).filter((amount) => amount !== null);
    if (nestedAmounts.length) return nestedAmounts.reduce((sum, amount) => sum + amount, 0);

    for (const key of ["cost", "amountUsd", "amount_usd", "totalCost", "total_cost"]) {
      const amount = Number(usage[key]);
      if (usage[key] !== null && usage[key] !== undefined && Number.isFinite(amount)) return amount;
    }
  }

  return null;
}

function falTimingSeconds(result) {
  const timings = result?.data?.timings || result?.timings;
  if (!timings || typeof timings !== "object") return null;

  for (const key of ["total", "inference", "compute", "execution"]) {
    const amount = Number(timings[key]);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }

  const values = Object.values(timings).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function costFromTiming(result, unitRateUsd) {
  const seconds = falTimingSeconds(result);
  return seconds ? roundCurrency(seconds * unitRateUsd) : null;
}

function videoFrameCount(...candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    for (const key of ["num_frames", "numFrames", "frames", "frame_count", "frameCount"]) {
      const frames = Number(candidate[key]);
      if (Number.isFinite(frames) && frames > 0) return frames;
    }
  }

  return null;
}

function durationToSeconds(duration) {
  if (duration === "auto") return 15;
  const match = String(duration || "15").match(/\d+/);
  return Math.max(1, Number(match?.[0] || 15));
}

function normalizeWan27ReferenceDuration(value) {
  const match = String(value || "5").match(/\d+/);
  return Math.min(10, Math.max(2, Number(match?.[0] || 5)));
}

function normalizeWan27ReferenceAspectRatio(value) {
  const ratio = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return normalizeChoice(ratio, ["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9");
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function frameRateFromRatio(value) {
  const [numerator, denominator = "1"] = String(value || "").split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : null;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function projectFromBody(body) {
  const id = String(body.projectId || "").trim();
  const name = String(body.projectName || body.workflowName || "").trim();
  return {
    id: id || "node-workspace",
    name: name || "Node workspace"
  };
}

function nodeFromBody(body) {
  const id = String(body.nodeId || "").trim();
  const title = String(body.nodeTitle || "").trim();
  if (!id && !title) return undefined;
  return { id, title };
}

function normalizedTextInputs(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      label: String(item?.label || "Text input").trim(),
      text: String(item?.text || "").trim()
    }))
    .filter((item) => item.text)
    .slice(0, 8);
}

function normalizedMediaInputs(items, mediaType) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      label: String(item?.label || `${mediaType} input`).trim(),
      url: String(item?.url || "").trim(),
      type: mediaType
    }))
    .filter((item) => isLocalAssetUrl(item.url))
    .slice(0, 6);
}

function textInputContext(textInputs) {
  return textInputs.map((item, index) => `Text input ${index + 1} (${item.label}):\n${item.text}`).join("\n\n");
}

function buildTextProcessingPrompt({ text, textInputs, imageDescriptions = [], videoDescriptions = [] }) {
  return [
    textProcessingInstructions(),
    text ? `Original prompt:\n${text}` : "",
    textInputContext(textInputs),
    imageDescriptions.length ? `Image context:\n${imageDescriptions.join("\n\n")}` : "",
    videoDescriptions.length ? `Video context:\n${videoDescriptions.join("\n\n")}` : "",
    "Return only the final processed prompt text."
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function processTextWithFal({ text, textInputs, imageInputs, videoInputs }) {
  if (!process.env.FAL_KEY) {
    throw new Error("Missing FAL_KEY in .env.");
  }

  const model = falTextModel;
  const imageContext = await describeImageInputs(imageInputs);
  const videoContext = await describeVideoInputs(videoInputs);
  const prompt = buildTextProcessingPrompt({ text, textInputs, imageDescriptions: imageContext.descriptions, videoDescriptions: videoContext.descriptions });
  const data = await subscribeFal("fal-ai/any-llm", {
    input: {
      model,
      prompt
    },
    logs: true
  });
  const outputText = extractFalText(data).trim();

  if (!outputText) {
    throw new Error("fal returned no text.");
  }

  return {
    text: outputText,
    model,
    provider: "fal",
    endpoint: "fal-ai/any-llm",
    submittedPrompt: prompt,
    usage: falResultUsage(data),
    helperUsages: [...imageContext.usages, ...videoContext.usages]
  };
}

async function processTextWithOpenAi({ text, textInputs, imageInputs, videoInputs }) {
  if (!openAiTextApiKey) {
    throw new Error("Missing OPENAI_TEXT_API_KEY in .env.");
  }

  const model = openAiTextModel;
  const prompt = buildTextProcessingPrompt({
    text,
    textInputs,
    imageDescriptions: imageInputs.map((item, index) => `Image ${index + 1} (${item.label}): ${item.url}`),
    videoDescriptions: videoInputs.map((item, index) => `Video ${index + 1} (${item.label}): ${item.url}`)
  });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiTextApiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: textProcessingInstructions(),
      input: prompt
    })
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Text processing failed.");
  }

  const outputText = extractOpenAiResponseText(data).trim();
  if (!outputText) {
    throw new Error("OpenAI returned no text.");
  }

  return {
    text: outputText,
    model,
    provider: "OpenAI",
    endpoint: model,
    submittedPrompt: prompt,
    usage: data.usage || null,
    helperUsages: []
  };
}

function textProcessingInstructions() {
  return "Process the available text, image, and video context for use in a creative node workflow. Improve clarity, specificity, and usefulness while preserving the user's intent.";
}

async function describeImageInputs(imageInputs) {
  if (!imageInputs.length) return { descriptions: [], usages: [] };

  const imageUrls = await Promise.all(imageInputs.map((item) => localAssetToFalUrl(item.url)));
  const data = await describeImagesWithFalVision(imageUrls, falVisionTextModel);
  const description = extractFalText(data).trim();
  return {
    descriptions: description ? [`Connected images: ${description}`] : [],
    usages: [falResultUsage(data)].filter(Boolean)
  };
}

async function describeImagesWithFalVision(imageUrls, model) {
  const input = {
    image_urls: imageUrls,
    prompt: "Describe these images as concise visual prompt context. Focus on subject, setting, composition, camera, lighting, palette, mood, materials, and any important details.",
    system_prompt: "Return only useful prompt context. Do not use markdown.",
    model
  };

  try {
    return await subscribeFal("openrouter/router/vision", { input, logs: true });
  } catch (error) {
    if (!falVisionTextFallbackModel || falVisionTextFallbackModel === model) throw error;
    console.warn(`Fal vision model ${model} failed; retrying with ${falVisionTextFallbackModel}.`, error?.message || error);
    return subscribeFal("openrouter/router/vision", {
      input: {
        ...input,
        model: falVisionTextFallbackModel
      },
      logs: true
    });
  }
}

async function describeVideoInputs(videoInputs) {
  if (!videoInputs.length) return { descriptions: [], usages: [] };

  const videoUrls = await Promise.all(videoInputs.map((item) => localAssetToFalUrl(item.url)));
  const data = await subscribeFal("openrouter/router/video", {
    input: {
      video_urls: videoUrls,
      prompt: "Describe these videos as concise visual prompt context. Focus on subjects, actions, setting, camera movement, lighting, style, mood, and any useful continuity details.",
      system_prompt: "Return only useful prompt context. Do not use markdown.",
      model: falVideoTextModel
    },
    logs: true
  });
  const description = extractFalText(data).trim();
  return {
    descriptions: description ? [`Connected videos: ${description}`] : [],
    usages: [falResultUsage(data)].filter(Boolean)
  };
}

async function localAssetToFalUrl(publicPath) {
  const asset = await readLocalAsset(publicPath);
  return fal.storage.upload(
    new File([asset.buffer], asset.fileName, {
      type: asset.mimeType || "application/octet-stream"
    })
  );
}

function extractOpenAiResponseText(response) {
  if (typeof response?.output_text === "string") return response.output_text;

  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .map((content) => content?.text || "")
    .filter(Boolean)
    .join("\n");
}

function extractFalText(data) {
  if (typeof data === "string") return data;
  if (typeof data?.data?.output === "string") return data.data.output;
  if (typeof data?.data?.text === "string") return data.data.text;
  if (typeof data?.data?.response === "string") return data.data.response;
  if (typeof data?.data?.content === "string") return data.data.content;
  if (typeof data?.data?.message?.content === "string") return data.data.message.content;
  if (typeof data?.data?.choices?.[0]?.message?.content === "string") return data.data.choices[0].message.content;
  if (typeof data?.data?.choices?.[0]?.text === "string") return data.data.choices[0].text;
  if (typeof data?.output === "string") return data.output;
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.response === "string") return data.response;
  if (typeof data?.content === "string") return data.content;
  if (typeof data?.message?.content === "string") return data.message.content;
  if (typeof data?.choices?.[0]?.message?.content === "string") return data.choices[0].message.content;
  if (typeof data?.choices?.[0]?.text === "string") return data.choices[0].text;

  const content = data?.output?.[0]?.content?.[0];
  if (typeof content?.text === "string") return content.text;

  const nestedContent = data?.data?.output?.[0]?.content?.[0];
  if (typeof nestedContent?.text === "string") return nestedContent.text;

  return "";
}

function falResultUsage(result) {
  return result?.data?.usage || result?.usage || result?.data?.metrics || result?.metrics || null;
}

function routeKindLabel(routeKind, speed) {
  const prefix = speed === "fast" ? "Fast " : "";
  if (routeKind === "image-to-video") return `${prefix}image to video`;
  if (routeKind === "reference-to-video") return `${prefix}reference to video`;
  return `${prefix}text to video`;
}

function wantsSummary(req) {
  return ["1", "true", "yes"].includes(String(req.query.summary || "").toLowerCase());
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

async function timedApi(operation, callback) {
  const startedAt = Date.now();
  try {
    const result = await callback();
    console.log(JSON.stringify({
      event: "api_timing",
      operation,
      ok: true,
      elapsedMs: Date.now() - startedAt
    }));
    return result;
  } catch (error) {
    console.log(JSON.stringify({
      event: "api_timing",
      operation,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || "unknown error"
    }));
    throw error;
  }
}

async function buildStorageDiagnostics() {
  const [historySource, workflowSource, historySummaries, workflowSummaries, uploads, outputs, savedWorkflows] = await Promise.all([
    fileMetadata(historyPath),
    workflowIndexSource(),
    readHistorySummaries(),
    readSavedWorkflowSummaries(),
    directoryStats(uploadsDir),
    directoryStats(outputsDir),
    directoryStats(savedWorkflowsDir)
  ]);
  const [historyIndex, workflowIndex] = await Promise.all([
    readJsonFile(historyIndexPath, null),
    readJsonFile(workflowIndexPath, null)
  ]);
  const historyIndexFresh = Boolean(
    historyIndex?.version === 1 &&
    historyIndex.source?.size === historySource.size &&
    historyIndex.source?.mtimeMs === historySource.mtimeMs
  );
  const workflowIndexFresh = Boolean(workflowIndex?.version === 1 && workflowIndexSourceMatches(workflowIndex.source, workflowSource));

  return {
    generatedAt: new Date().toISOString(),
    history: {
      items: historySummaries.length,
      file: historySource,
      index: {
        path: historyIndexPath,
        fresh: historyIndexFresh,
        generatedAt: historyIndex?.generatedAt || ""
      }
    },
    workflows: {
      items: workflowSummaries.length,
      directory: savedWorkflows,
      index: {
        path: workflowIndexPath,
        fresh: workflowIndexFresh,
        generatedAt: workflowIndex?.generatedAt || ""
      }
    },
    assets: {
      uploads,
      outputs
    },
    warnings: [
      historySummaries.length >= maxHistoryItems ? `History is at the ${maxHistoryItems} item retention limit.` : "",
      savedWorkflows.bytes > 50 * 1024 * 1024 ? "Saved workflow registry is larger than 50 MB." : "",
      outputs.bytes > 2 * 1024 * 1024 * 1024 ? "Outputs folder is larger than 2 GB." : ""
    ].filter(Boolean)
  };
}

async function readNodeProjects() {
  if (!existsSync(nodeProjectsPath)) {
    return [];
  }

  try {
    return JSON.parse(await readFile(nodeProjectsPath, "utf8"));
  } catch {
    await rm(nodeProjectsPath, { force: true });
    return [];
  }
}

async function writeNodeProjects(projects) {
  await writeJsonAtomic(nodeProjectsPath, projects);
}

async function removeLegacyNodeProject(projectId) {
  const projects = await readNodeProjects();
  const nextProjects = projects.filter((project) => project.id !== projectId);
  if (nextProjects.length !== projects.length) {
    await writeNodeProjects(nextProjects);
  }
}

function resolveImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("sam") && normalized.includes("image")) {
    if (!sam3SegmentationModelsEnabled) {
      return {
        provider: "disabled",
        displayName: "SAM 3 Image",
        id: "fal-ai/sam-3/image"
      };
    }

    return {
      provider: "fal-sam3-image",
      displayName: "SAM 3 Image",
      id: "fal-ai/sam-3/image"
    };
  }

  if (normalized.includes("z-image") || normalized.includes("z image") || normalized.includes("zimage")) {
    return {
      provider: "fal-z-image",
      displayName: imageModelNames.zImage,
      id: falZImageEndpoint
    };
  }

  if (normalized.includes("openai") || normalized.includes("gpt-image-2") || normalized.includes("image 2")) {
    return {
      provider: "fal-openai-image-2",
      displayName: "OpenAI Image 2",
      id: "openai/gpt-image-2"
    };
  }

  if (normalized.includes("luma") || normalized.includes("photon")) {
    return {
      provider: "fal-luma-photon",
      displayName: "Luma Dream Machine",
      id: falLumaPhotonEndpoint
    };
  }

  const useGoogleDirect = Boolean(process.env.GOOGLE_API_KEY);
  return {
    provider: useGoogleDirect ? "google" : "fal-nano-banana-pro",
    displayName: "Nano Banana Pro",
    id: useGoogleDirect ? "gemini-3-pro-image-preview" : falNanoBananaProEndpoint
  };
}

function resolveUtilityImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("color") && normalized.includes("matte")) {
    return {
      provider: "local-color-id-matte",
      displayName: "Color ID Matte",
      id: "local/color-id-matte"
    };
  }

  if (normalized.includes("sam") && normalized.includes("image")) {
    return {
      provider: "fal-sam3-image",
      displayName: "SAM 3 Image",
      id: "fal-ai/sam-3/image"
    };
  }

  if (normalized.includes("depth") || normalized.includes("anything")) {
    return {
      provider: "fal-depth-anything",
      displayName: "Depth Anything",
      id: "fal-ai/image-preprocessors/depth-anything/v2"
    };
  }

  if (normalized.includes("patina")) {
    return {
      provider: "fal-patina",
      displayName: "Patina",
      id: "fal-ai/patina"
    };
  }

  if (normalized.includes("birefnet")) {
    return {
      provider: "fal-birefnet-image",
      displayName: "BiRefNet Image",
      id: "fal-ai/birefnet/v2"
    };
  }

  return {
    provider: "fal-dwpose",
    displayName: "DWPose",
    id: "fal-ai/dwpose"
  };
}

function resolveUtilityVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("color") && normalized.includes("matte")) {
    return {
      provider: "local-color-id-video-matte",
      displayName: "Color ID Matte",
      id: "local/color-id-video-matte",
      requiresPrompt: false
    };
  }

  if (normalized.includes("composite")) {
    return {
      provider: "local-composite-video",
      displayName: "Composite Video",
      id: "local/composite-video",
      requiresPrompt: false
    };
  }

  if (normalized.includes("extract") || normalized.includes("current frame") || normalized.includes("video frame")) {
    return {
      provider: "local-extract-frame",
      displayName: "Extract Frame",
      id: "local/extract-video-frame",
      requiresPrompt: false
    };
  }

  if (normalized.includes("sam") && normalized.includes("video")) {
    return {
      provider: "fal-sam3-video",
      displayName: "SAM 3 Video",
      id: "fal-ai/sam-3/video",
      requiresPrompt: true
    };
  }

  if (normalized.includes("birefnet")) {
    return {
      provider: "fal-birefnet-video",
      displayName: "BiRefNet Video",
      id: "fal-ai/birefnet/v2/video",
      requiresPrompt: false
    };
  }

  if (normalized.includes("rife")) {
    return {
      provider: "fal-rife-video",
      displayName: "RIFE Video",
      id: "fal-ai/rife/video",
      requiresPrompt: false
    };
  }

  if (normalized.includes("bytedance") && normalized.includes("upscal")) {
    return {
      provider: "fal-bytedance-video-upscaler",
      displayName: "Bytedance Video Upscaler",
      id: "fal-ai/bytedance-upscaler/upscale/video",
      requiresPrompt: false
    };
  }

  if (normalized.includes("topaz") || (normalized.includes("video") && normalized.includes("upscale"))) {
    return {
      provider: "fal-topaz-video-upscaler",
      displayName: "Topaz Video Upscale",
      id: "fal-ai/topaz/upscale/video",
      requiresPrompt: false
    };
  }

  if (normalized.includes("vace") && normalized.includes("inpainting") && !normalized.includes("mask")) {
    return {
      provider: "fal-wan-vace-inpainting",
      displayName: "Wan VACE 14B Inpainting",
      id: "fal-ai/wan-vace-14b/inpainting",
      requiresPrompt: true
    };
  }

  if (normalized.includes("vace") || (normalized.includes("wan") && (normalized.includes("mask") || normalized.includes("inpaint")))) {
    return {
      provider: "fal-wan-vace-mask-to-video",
      displayName: "Wan VACE Mask-to-Video",
      id: "fal-ai/wan-vace",
      requiresPrompt: true
    };
  }

  if (normalized.includes("void") || normalized.includes("inpaint")) {
    return {
      provider: "fal-void-video-inpainting",
      displayName: "VOID Video Inpainting",
      id: "fal-ai/void-video-inpainting",
      requiresPrompt: true
    };
  }

  return {
    provider: "fal-wan-fun-control",
    displayName: "Wan Fun Control",
    id: "fal-ai/wan-fun-control",
    speed: "wan",
    requiresPrompt: true
  };
}

function resolveVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("sam") && normalized.includes("video")) {
    if (!sam3SegmentationModelsEnabled) {
      return {
        provider: "disabled",
        displayName: "SAM 3 Video",
        id: "fal-ai/sam-3/video",
        speed: "sam3"
      };
    }

    return {
      provider: "fal-sam3-video",
      displayName: "SAM 3 Video",
      id: "fal-ai/sam-3/video",
      speed: "sam3"
    };
  }

  if (normalized.includes("aurora") || normalized.includes("creatify")) {
    return {
      provider: "fal-aurora",
      displayName: "Creatify Aurora",
      id: "fal-ai/creatify/aurora",
      speed: "aurora"
    };
  }

  if (normalized.includes("happy") || normalized.includes("horse") || normalized.includes("alibaba")) {
    return {
      provider: "fal-happy-horse",
      displayName: "Happy Horse",
      id: "alibaba/happy-horse/reference-to-video",
      speed: "happy-horse"
    };
  }

  if (normalized.includes("luma") || normalized.includes("dream") || normalized.includes("ray2") || normalized.includes("ray 2")) {
    return {
      provider: "fal-luma-ray2",
      displayName: "Luma Dream Machine",
      id: falLumaRay2Endpoint,
      speed: "luma-ray2"
    };
  }

  if (normalized.includes("wan 2.7") || normalized.includes("wan2.7") || normalized.includes("reference-to-video")) {
    return {
      provider: "fal-wan-2-7-reference-to-video",
      displayName: "Wan 2.7 Reference-to-Video",
      id: "fal-ai/wan/v2.7/reference-to-video",
      speed: "wan-2.7"
    };
  }

  if (normalized.includes("wan")) {
    return {
      provider: "fal-wan-fun-control",
      displayName: "Wan Fun Control",
      id: "fal-ai/wan-fun-control",
      speed: "wan"
    };
  }

  const speed = normalized.includes("fast") ? "fast" : "standard";
  return {
    provider: "fal-seedance",
    displayName: speed === "fast" ? "Seedance 2.0 Fast" : "Seedance 2.0",
    id: `bytedance/seedance-2.0/${speed === "fast" ? "fast/" : ""}`,
    speed
  };
}

async function resolveImageGenerationAspectRatio({ value, imagePromptUrls, provider }) {
  if (!isAutoImageAspectRatio(value)) {
    return normalizeImageAspectRatioForProvider(value, provider);
  }

  const dimensions = await firstImageDimensions(imagePromptUrls);
  if (!dimensions) {
    throw httpError(400, "Auto aspect ratio needs a connected image.");
  }

  return closestAspectRatio(dimensions.width / Math.max(1, dimensions.height), imageAspectRatiosForProvider(provider));
}

function normalizeImageAspectRatioForProvider(value, provider) {
  const ratio = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return normalizeChoice(ratio, imageAspectRatiosForProvider(provider), "16:9");
}

function imageAspectRatiosForProvider(provider) {
  if (provider === "fal-luma-photon") return lumaImageAspectRatios;
  return provider === "fal-openai-image-2" ? openAiImageAspectRatios : nanoImageAspectRatios;
}

function isAutoImageAspectRatio(value) {
  return String(value || "").toLowerCase() === "auto";
}

async function firstImageDimensions(imagePromptUrls = []) {
  for (const imagePromptUrl of imagePromptUrls) {
    try {
      const asset = await readLocalAsset(imagePromptUrl);
      if (!asset.mimeType.startsWith("image/")) continue;
      const dimensions = imageDimensionsFromBuffer(asset.buffer, asset.mimeType);
      if (dimensions) return dimensions;
    } catch {
      // Try the next reference; the caller reports a clear Auto failure if none work.
    }
  }

  return null;
}

function imageDimensionsFromBuffer(buffer, mimeType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  const normalizedMime = String(mimeType || "").toLowerCase();

  if (normalizedMime.includes("png") || buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  if (normalizedMime.includes("jpeg") || normalizedMime.includes("jpg") || (buffer[0] === 0xff && buffer[1] === 0xd8)) {
    return jpegDimensionsFromBuffer(buffer);
  }

  if (normalizedMime.includes("webp") || (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")) {
    return webpDimensionsFromBuffer(buffer);
  }

  return null;
}

function jpegDimensionsFromBuffer(buffer) {
  let offset = 2;

  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isStartOfFrame && offset + 7 <= buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }

    if (length < 2) break;
    offset += length;
  }

  return null;
}

function webpDimensionsFromBuffer(buffer) {
  const chunkType = buffer.toString("ascii", 12, 16);

  if (chunkType === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }

  return null;
}

function closestAspectRatio(ratio, options = []) {
  const normalizedRatio = Number(ratio);
  const fallback = options.includes("16:9") ? "16:9" : options[0] || "16:9";
  if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) return fallback;

  return options.reduce((closest, option) => {
    const optionRatio = aspectRatioNumber(option);
    const closestRatio = aspectRatioNumber(closest);
    return Math.abs(Math.log(optionRatio / normalizedRatio)) < Math.abs(Math.log(closestRatio / normalizedRatio)) ? option : closest;
  }, fallback);
}

function aspectRatioNumber(value) {
  const [width = 16, height = 9] = String(value || "").match(/\d+:\d+/)?.[0]?.split(":").map(Number) || [];
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

function normalizeGeminiImageAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return normalizeChoice(normalized, ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], "16:9");
}

function normalizeGeminiImageSize(value) {
  const normalized = String(value || "2K").toUpperCase();
  return normalizeChoice(normalized, ["1K", "2K", "4K"], "2K");
}

async function generateGeminiImageWithRetries({ model, parts, imageConfig }) {
  const maxAttempts = 3;
  let lastText = "";
  let lastRaw = null;
  let lastFinishReason = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GOOGLE_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts
          }
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw httpError(response.status, data?.error?.message || "Image generation failed.", { raw: data });
    }

    const parsed = extractGeminiImageData(data);
    if (parsed.inlineData?.data) {
      return {
        ...parsed,
        attempts: attempt
      };
    }

    lastText = parsed.text;
    lastRaw = data;
    lastFinishReason = parsed.finishReason;

    if (attempt < maxAttempts) {
      await delay(900 * attempt);
    }
  }

  const finishReason = lastFinishReason ? ` Finish reason: ${lastFinishReason}.` : "";
  throw httpError(502, `Gemini returned no image data after ${maxAttempts} attempts.${finishReason}`, {
    text: lastText,
    raw: lastRaw
  });
}

function extractGeminiImageData(data) {
  const candidate = data?.candidates?.[0] || {};
  const responseParts = candidate?.content?.parts || [];
  const text = responseParts.find((part) => part.text)?.text || "";
  const imagePart = responseParts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;

  return {
    text,
    inlineData,
    finishReason: candidate.finishReason || candidate.finish_reason || "",
    raw: data
  };
}

async function generateFalNanoBananaPro({ prompt, imagePromptUrls, imagePromptLabels, aspectRatio, resolution }) {
  const imageInputs = [];

  for (const [index, imagePromptUrl] of imagePromptUrls.entries()) {
    const asset = await readLocalAsset(imagePromptUrl);
    if (!asset.mimeType.startsWith("image/")) continue;
    imageInputs.push({
      ...asset,
      label: cleanImagePromptLabel(imagePromptLabels[index])
    });
  }

  const baseEndpoint = falNanoBananaProEndpoint.replace(/\/edit$/i, "");
  const endpoint = imageInputs.length ? `${baseEndpoint}/edit` : baseEndpoint;
  const normalizedResolution = normalizeGeminiImageSize(resolution);
  const input = {
    prompt: promptWithReferenceLabels(prompt, imageInputs),
    num_images: 1,
    aspect_ratio: normalizeImageAspectRatioForProvider(aspectRatio, "fal-nano-banana-pro"),
    output_format: "png",
    resolution: normalizedResolution,
    sync_mode: false
  };

  if (imageInputs.length) {
    input.image_urls = await Promise.all(imageInputs.slice(0, 14).map(uploadImageInputToFal));
  }

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteImage = firstFalImageResult(result?.data);

  if (!remoteImage?.url) {
    throw new Error("Fal returned no Nano Banana Pro image URL.");
  }

  return {
    endpoint,
    remoteImage,
    resolution: normalizedResolution,
    submittedPrompt: input.prompt,
    description: result?.data?.description || result?.data?.text || ""
  };
}

async function generateFalZImage({ prompt, imagePromptUrls, imagePromptLabels, aspectRatio, resolution }) {
  const imageInputs = [];

  for (const [index, imagePromptUrl] of imagePromptUrls.entries()) {
    const asset = await readLocalAsset(imagePromptUrl);
    if (!asset.mimeType.startsWith("image/")) continue;
    imageInputs.push({
      ...asset,
      label: cleanImagePromptLabel(imagePromptLabels[index])
    });
  }

  const normalizedResolution = normalizeGeminiImageSize(resolution);
  const imageSize = imageSizeForResolutionAndAspectRatio({ resolution: normalizedResolution, aspectRatio });
  const submittedPrompt = promptWithReferenceLabels(prompt, imageInputs.slice(0, 1));
  const input = {
    prompt: submittedPrompt,
    image_size: imageSize,
    num_images: 1,
    enable_safety_checker: true,
    output_format: "png",
    sync_mode: false
  };

  if (imageInputs.length) {
    input.image_url = await uploadImageInputToFal(imageInputs[0], 0);
  }

  const result = await subscribeFal(falZImageEndpoint, { input, logs: true });
  const remoteImage = firstFalImageResult(result?.data);

  if (!remoteImage?.url) {
    throw new Error("Fal returned no Z-Image URL.");
  }

  return {
    endpoint: falZImageEndpoint,
    requestId: result.requestId,
    remoteImage,
    resolution: normalizedResolution,
    imageSize,
    submittedPrompt,
    resultText: result?.data?.description || result?.data?.text || ""
  };
}

async function generateFalLumaPhoton({ prompt, imagePromptUrls, imagePromptLabels, aspectRatio }) {
  const imageInputs = [];

  for (const [index, imagePromptUrl] of imagePromptUrls.entries()) {
    const asset = await readLocalAsset(imagePromptUrl);
    if (!asset.mimeType.startsWith("image/")) continue;
    imageInputs.push({
      ...asset,
      label: cleanImagePromptLabel(imagePromptLabels[index])
    });
  }

  const baseEndpoint = falLumaPhotonEndpoint.replace(/\/modify$/i, "");
  const endpoint = imageInputs.length ? `${baseEndpoint}/modify` : baseEndpoint;
  const submittedPrompt = promptWithReferenceLabels(prompt, imageInputs.slice(0, 1));
  const input = {
    prompt: submittedPrompt,
    aspect_ratio: normalizeImageAspectRatioForProvider(aspectRatio, "fal-luma-photon")
  };

  if (imageInputs.length) {
    input.image_url = await uploadImageInputToFal(imageInputs[0], 0);
    input.strength = clampNumber(process.env.LUMA_PHOTON_MODIFY_STRENGTH || 0.8, 0, 1, 0.8);
  }

  const result = await subscribeFal(endpoint, { input, logs: true });
  const remoteImage = firstFalImageResult(result?.data);

  if (!remoteImage?.url) {
    throw new Error("Fal returned no Luma Photon image URL.");
  }

  return {
    endpoint,
    requestId: result.requestId,
    remoteImage,
    submittedPrompt,
    resultText: result?.data?.description || result?.data?.text || ""
  };
}

function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), {
    status,
    ...extra
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateFalOpenAiImage2({ prompt, imagePromptUrls, imagePromptLabels, aspectRatio, resolution }) {
  const imageInputs = [];

  for (const [index, imagePromptUrl] of imagePromptUrls.entries()) {
    const asset = await readLocalAsset(imagePromptUrl);
    if (!asset.mimeType.startsWith("image/")) continue;
    imageInputs.push({
      ...asset,
      label: cleanImagePromptLabel(imagePromptLabels[index])
    });
  }

  const size = normalizeOpenAiImageSize({ aspectRatio, resolution });
  const quality = normalizeOpenAiImageQuality(process.env.FAL_OPENAI_IMAGE_2_QUALITY || process.env.OPENAI_IMAGE_2_QUALITY || "medium");
  const submittedPrompt = promptWithReferenceLabels(prompt, imageInputs);
  const endpoint = imageInputs.length ? "openai/gpt-image-2/edit" : "openai/gpt-image-2";
  const input = {
    prompt: submittedPrompt,
    image_size: openAiSizeToFalImageSize(size),
    quality,
    num_images: 1,
    output_format: "png",
    sync_mode: false
  };

  if (imageInputs.length) {
    input.image_urls = await Promise.all(imageInputs.slice(0, 16).map(uploadImageInputToFal));
  }

  const result = await fal.subscribe(endpoint, { input, logs: true });
  const remoteImage = firstFalImageResult(result?.data);

  if (!remoteImage?.url) {
    throw new Error("Fal returned no OpenAI Image 2 image URL.");
  }

  return {
    endpoint,
    remoteImage,
    size,
    quality,
    submittedPrompt,
    resultText: result?.data?.revised_prompt || result?.data?.prompt || ""
  };
}

function openAiSizeToFalImageSize(size) {
  const [width, height] = String(size || "").split("x").map((value) => Number(value));
  if (!width || !height) return "landscape_16_9";
  return { width, height };
}

function uploadImageInputToFal(image, index) {
  const extension = extensionForMime(image.mimeType);
  const fallbackName = path.basename(image.fileName || "", path.extname(image.fileName || "")) || `reference-${index + 1}`;
  const safeName = String(image.label || fallbackName)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `reference-${index + 1}`;
  return fal.storage.upload(new File([image.buffer], `${safeName}${extension}`, { type: image.mimeType }));
}

function promptWithReferenceLabels(prompt, imageInputs) {
  const labels = imageInputs.map((image, index) => image.label || `Reference ${index + 1}`).filter(Boolean);
  if (!labels.length) return prompt;
  return `${prompt}\n\nReference image labels: ${labels.join(", ")}`;
}

function normalizeOpenAiImageQuality(value) {
  return normalizeChoice(String(value || "medium").toLowerCase(), ["low", "medium", "high", "auto"], "medium");
}

function normalizeOpenAiImageSize({ aspectRatio, resolution }) {
  const ratio = String(aspectRatio || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  const normalizedResolution = String(resolution || "2K").toUpperCase();
  const sizeMap = {
    "1K": {
      "21:9": "1344x576",
      "16:9": "1280x720",
      "1:1": "1024x1024",
      "9:16": "720x1280"
    },
    "2K": {
      "21:9": "2048x880",
      "16:9": "2048x1152",
      "1:1": "2048x2048",
      "9:16": "1152x2048"
    },
    "4K": {
      "21:9": "3840x1648",
      "16:9": "3840x2160",
      "1:1": "2880x2880",
      "9:16": "2160x3840"
    }
  };

  return sizeMap[normalizedResolution]?.[ratio] || openAiImageSizeForAspectRatio(ratio, normalizedResolution);
}

function openAiImageSizeForAspectRatio(aspectRatio, resolution) {
  const ratio = aspectRatioNumber(aspectRatio);
  const normalizedResolution = ["1K", "2K", "4K"].includes(resolution) ? resolution : "2K";
  const longSideMap = { "1K": 1280, "2K": 2048, "4K": 3840 };
  const squareSideMap = { "1K": 1024, "2K": 2048, "4K": 2880 };
  const maxPixelsMap = { "1K": 1024 * 1024, "2K": 2048 * 2048, "4K": 3840 * 2160 };

  if (Math.abs(ratio - 1) < 0.01) {
    const side = squareSideMap[normalizedResolution];
    return `${side}x${side}`;
  }

  const longSide = longSideMap[normalizedResolution];
  let width = ratio >= 1 ? longSide : longSide * ratio;
  let height = ratio >= 1 ? longSide / ratio : longSide;
  const maxPixels = maxPixelsMap[normalizedResolution];

  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width *= scale;
    height *= scale;
  }

  return `${roundOpenAiImageDimension(width)}x${roundOpenAiImageDimension(height)}`;
}

function imageSizeForResolutionAndAspectRatio({ resolution, aspectRatio }) {
  const ratioText = String(aspectRatio || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  const [ratioWidth = 16, ratioHeight = 9] = ratioText.split(":").map(Number);
  const ratio = ratioWidth > 0 && ratioHeight > 0 ? ratioWidth / ratioHeight : 16 / 9;
  const normalizedResolution = ["1K", "2K", "4K"].includes(resolution) ? resolution : "2K";
  const longSideMap = { "1K": 1280, "2K": 2048, "4K": 3840 };
  const maxPixelsMap = { "1K": 1280 * 1280, "2K": 2048 * 2048, "4K": 3840 * 2160 };
  const longSide = longSideMap[normalizedResolution];
  let width = ratio >= 1 ? longSide : longSide * ratio;
  let height = ratio >= 1 ? longSide / ratio : longSide;
  const maxPixels = maxPixelsMap[normalizedResolution];

  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width *= scale;
    height *= scale;
  }

  return {
    width: roundOpenAiImageDimension(width),
    height: roundOpenAiImageDimension(height)
  };
}

function roundOpenAiImageDimension(value) {
  return Math.max(256, Math.floor(Number(value || 0) / 16) * 16);
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "model/gltf-binary") return ".glb";
  if (mimeType === "model/gltf+json") return ".gltf";
  if (mimeType === "model/obj") return ".obj";
  return ".png";
}

function normalizeDuration(value) {
  const match = String(value || "15").match(/\d+/);
  return normalizeChoice(match?.[0], ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], "15");
}

function normalizeHappyHorseDuration(value) {
  const match = String(value || "5").match(/\d+/);
  return clampInteger(match?.[0], 3, 15, 5);
}

function normalizeHappyHorseResolution(value) {
  return normalizeChoice(String(value || "1080p"), ["720p", "1080p"], "1080p");
}

function normalizeHappyHorseAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return normalizeChoice(normalized, ["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9");
}

function normalizeLumaVideoDuration(value) {
  const seconds = String(value || "5").match(/\d+/)?.[0] || "5";
  return `${normalizeChoice(seconds, ["5", "9"], "5")}s`;
}

function normalizeLumaVideoResolution(value) {
  return normalizeChoice(String(value || "540p"), ["540p", "720p", "1080p"], "540p");
}

function normalizeLumaVideoAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return normalizeChoice(normalized, lumaVideoAspectRatios, "16:9");
}

function normalizeAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return normalizeChoice(normalized, ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "16:9");
}

function qwenCameraPromptLabel(input) {
  return [
    `azimuth ${Math.round(input.horizontal_angle)} degrees`,
    `elevation ${Math.round(input.vertical_angle)} degrees`,
    `zoom ${Math.round(input.zoom * 10) / 10}`,
    input.additional_prompt
  ]
    .filter(Boolean)
    .join(", ");
}

function bytedanceUpscalerPromptLabel(input) {
  return [
    "Bytedance video upscale",
    input.target_resolution,
    input.target_fps,
    input.enhancement_preset,
    input.enhancement_tier,
    input.fidelity,
    input.scale_ratio ? `${input.scale_ratio}x scale` : ""
  ]
    .filter(Boolean)
    .join(", ");
}

function topazUpscalerPromptLabel(input, billingTier) {
  return [
    "Topaz video upscale",
    input.model,
    `${input.upscale_factor}x`,
    input.target_fps ? `${input.target_fps}fps` : "source fps",
    input.H264_output ? "H264" : "H265/default",
    billingTier && billingTier !== "auto" ? `billing ${billingTier}` : "auto billing tier"
  ]
    .filter(Boolean)
    .join(", ");
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeColorIdHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : "";
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function optionalInteger(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : undefined;
}

function addOptionalRangeInput(target, key, value, min, max) {
  const number = optionalNumber(value);
  if (number === undefined) return;
  target[key] = Math.min(max, Math.max(min, number));
}

function normalizePatinaMaps(value) {
  const values = Array.isArray(value) ? value : [];
  const maps = [...new Set(values.map(normalizePatinaMapId).filter(Boolean))];
  return maps.length ? maps : ["basecolor", "normal", "roughness", "metalness", "height"];
}

function normalizePatinaMapId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["basecolor", "normal", "roughness", "metalness", "height"].includes(normalized) ? normalized : "";
}

function formatPatinaMapLabel(value) {
  if (value === "basecolor") return "Basecolor";
  return String(value || "Map").replace(/^\w/, (letter) => letter.toUpperCase());
}

function firstLocalOutput(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.find(isLocalAssetUrl);
}

function isLocalOutputUrl(value) {
  return typeof value === "string" && (value.startsWith("/outputs/") || value.startsWith(`${workflowAssetsPrefix}/`));
}

function isLocalAssetUrl(value) {
  return typeof value === "string" && (value.startsWith("/outputs/") || value.startsWith("/uploads/") || value.startsWith(`${workflowAssetsPrefix}/`));
}

async function uploadLocalOutputToFal(publicPath) {
  const { fileName, buffer } = await readLocalAsset(publicPath);
  const falFile = new File([buffer], fileName, {
    type: mimeForExtension(path.extname(fileName))
  });

  return fal.storage.upload(falFile);
}

async function readLocalAsset(publicPath) {
  const { fileName, filePath } = await resolveLocalAssetPath(publicPath);
  const buffer = await readFile(filePath);

  return {
    fileName,
    buffer,
    mimeType: mimeForExtension(path.extname(fileName).toLowerCase())
  };
}

async function resolveLocalAssetPathFromUrl(value) {
  return resolveLocalAssetPath(localPublicPathFromUrl(value));
}

function localPublicPathFromUrl(value) {
  const raw = String(value || "").trim();
  if (isLocalAssetUrl(raw)) return raw;

  try {
    const parsed = new URL(raw, "http://localhost");
    const publicPath = decodeURIComponent(parsed.pathname || "");
    if (isLocalAssetUrl(publicPath)) return publicPath;
  } catch {
    // Fall through to the clear validation error below.
  }

  throw new Error("This action can only read local NewtNode assets from uploads, outputs, or workflow packages.");
}

async function resolveLocalAssetPath(publicPath) {
  const packageMatch = String(publicPath || "").match(/^\/workflow-assets\/([^/]+)\/(.+)$/);
  if (packageMatch) {
    const workflowId = decodeURIComponent(packageMatch[1] || "");
    const relativePath = safeRelativeAssetPath(decodeURIComponent(packageMatch[2] || ""));
    const workflow = await findRegisteredWorkflowPackage(workflowId);
    if (!relativePath) throw new Error("Workflow package asset is not registered.");

    const packageFilePath = workflow?.packagePath ? path.join(workflow.packagePath, relativePath) : "";
    if (packageFilePath && existsSync(packageFilePath)) {
      return {
        fileName: path.basename(relativePath),
        filePath: packageFilePath
      };
    }

    const fallbackFilePath = await workflowAssetFallbackFilePath(relativePath);
    if (fallbackFilePath) {
      return {
        fileName: path.basename(fallbackFilePath),
        filePath: fallbackFilePath
      };
    }

    throw new Error("Workflow package asset is not registered.");
  }

  const localPath = localAssetFilePath(publicPath);
  if (!localPath) {
    throw new Error("Invalid local asset path.");
  }

  return {
    fileName: path.basename(localPath),
    filePath: localPath
  };
}

function localAssetFilePath(publicPath) {
  const isUpload = String(publicPath || "").startsWith("/uploads/");
  const isOutput = String(publicPath || "").startsWith("/outputs/");
  if (!isUpload && !isOutput) return "";

  const prefix = isUpload ? "/uploads/" : "/outputs/";
  const root = isUpload ? uploadsDir : outputsDir;
  const relativePath = safeRelativeAssetPath(decodeURIComponent(String(publicPath || "").slice(prefix.length)));
  return relativePath ? path.join(root, relativePath) : "";
}

async function workflowAssetFallbackFilePath(relativePath) {
  const cleanPath = safeRelativeAssetPath(relativePath);
  if (!cleanPath) return "";

  const normalized = cleanPath.split(path.sep).join("/");
  const [assetGroup, ...restParts] = normalized.split("/");
  const rest = safeRelativeAssetPath(restParts.join("/"));
  const fileName = path.basename(rest || normalized);
  const root = assetGroup === workflowPackageInputDirName ? uploadsDir : outputsDir;
  const candidates = [
    rest ? path.join(root, rest) : "",
    fileName ? path.join(root, fileName) : ""
  ].filter(Boolean);

  const directMatch = candidates.find((candidate) => existsSync(candidate));
  if (directMatch || !fileName) return directMatch || "";

  return findLocalAssetByFileName(root, fileName);
}

async function findLocalAssetByFileName(root, fileName, depth = 3) {
  if (!root || !fileName || depth < 0) return "";

  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return "";
  }

  const expectedName = fileName.toLowerCase();
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === expectedName) return entryPath;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nestedMatch = await findLocalAssetByFileName(path.join(root, entry.name), fileName, depth - 1);
    if (nestedMatch) return nestedMatch;
  }

  return "";
}

function mimeForExtension(extension) {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".glb") return "model/gltf-binary";
  if (extension === ".gltf") return "model/gltf+json";
  if (extension === ".obj") return "model/obj";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov" || extension === ".qt") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".m4a") return "audio/mp4";
  return "image/png";
}

function mediaTypeForMime(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("model/")) return "model3d";
  return "file";
}

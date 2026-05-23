import "dotenv/config";

import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { File } from "node:buffer";
import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fal } from "@fal-ai/client";
import ffmpegStaticPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(rootDir, "uploads");
const outputsDir = path.join(rootDir, "outputs");
const savedWorkflowsDir = path.join(rootDir, "saved_workflows");
const composerPosesDir = path.join(rootDir, "public", "models", "poses");
const dataDir = path.join(__dirname, "data");
const historyPath = path.join(dataDir, "history.json");
const falDebugLogPath = path.join(dataDir, "fal-debug.log");
const nodeProjectsPath = path.join(dataDir, "node-projects.json");
let historyWriteQueue = Promise.resolve();
const execFile = promisify(execFileCallback);
const ffmpegBinaryPath = process.env.FFMPEG_PATH || ffmpegStaticPath || "ffmpeg";
const ffprobeBinaryPath = process.env.FFPROBE_PATH || ffprobeStatic?.path || "ffprobe";
const port = Number(process.env.PORT || 3333);
const seedanceStandardCostPerSecond = Number(process.env.SEEDANCE_STANDARD_COST_PER_SECOND || 0.3034);
const seedanceFastCostPerSecond = Number(process.env.SEEDANCE_FAST_COST_PER_SECOND || 0.2419);
const happyHorse720pCostPerSecond = Number(process.env.HAPPY_HORSE_720P_COST_PER_SECOND || 0.14);
const happyHorse1080pCostPerSecond = Number(process.env.HAPPY_HORSE_1080P_COST_PER_SECOND || 0.28);
const seedanceBillingFps = Number(process.env.SEEDANCE_BILLING_FPS || 24);
const seedanceStandardCostPerThousandTokens = Number(process.env.SEEDANCE_STANDARD_COST_PER_1000_TOKENS || 0.014);
const seedanceFastCostPerThousandTokens = Number(process.env.SEEDANCE_FAST_COST_PER_1000_TOKENS || (seedanceFastCostPerSecond / 21.6));
const nanoBananaCost1K2K = Number(process.env.NANO_BANANA_IMAGE_COST_1K_2K || 0.15);
const nanoBananaCost4K = Number(process.env.NANO_BANANA_IMAGE_COST_4K || 0.3);
const openAiImage2MediumCost = Number(process.env.OPENAI_IMAGE_2_MEDIUM_COST || 0.053);
const hunyuan3DProBaseCost = Number(process.env.HUNYUAN_3D_PRO_BASE_COST || 0.375);
const hunyuan3DProAddOnCost = Number(process.env.HUNYUAN_3D_PRO_ADD_ON_COST || 0.15);
const nanoImageAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"];
const openAiImageAspectRatios = nanoImageAspectRatios;
const falTextRequestCost = Number(process.env.FAL_TEXT_REQUEST_COST || 0.001);
const falVisionTextUnitCost = Number(process.env.FAL_VISION_TEXT_UNIT_COST || 0.01);
const falVideoTextUnitCost = Number(process.env.FAL_VIDEO_TEXT_UNIT_COST || 0.01);
const wanFunControlCostPerSecond = 0.1;
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
const openAiImageApiKey = process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
const textLlmProvider = String(process.env.TEXT_LLM_PROVIDER || "fal").toLowerCase();
const falTextModel = process.env.FAL_TEXT_MODEL || "openai/gpt-4o";
const falVisionTextModel = process.env.FAL_VISION_TEXT_MODEL || falTextModel;
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

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    routes: {
      utilityImage: true,
      utilityVideo: true,
      colorIdMatte: true,
      composerFrame: true,
      composerPoses: true,
      apiJsonErrors: true,
      voidFrameValidation: true,
      sam3VideoMaskOutput: true,
      extractVideoFrame: true,
      generate3d: true
    },
    ffmpeg: {
      configured: Boolean(ffmpegBinaryPath),
      bundled: Boolean(ffmpegStaticPath),
      binary: ffmpegBinaryPath ? path.basename(ffmpegBinaryPath) : "",
      ffprobeConfigured: Boolean(ffprobeBinaryPath),
      ffprobeBundled: Boolean(ffprobeStatic?.path)
    },
    falKeyConfigured: Boolean(process.env.FAL_KEY),
    openAiKeyConfigured: Boolean(process.env.OPENAI_API_KEY || openAiTextApiKey || openAiImageApiKey),
    openAiTextKeyConfigured: Boolean(openAiTextApiKey),
    openAiImageKeyConfigured: Boolean(openAiImageApiKey),
    textLlmProvider,
    falTextModel,
    falVisionTextModel,
    falVideoTextModel,
    outputDirectory: outputsDir
  });
});

app.get("/api/history", async (_req, res) => {
  res.json(await readHistory());
});

app.get("/api/stats", async (_req, res) => {
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

app.get("/api/node-projects", async (_req, res) => {
  const projects = await readNodeProjects();
  res.json(projects.map(({ graph, ...project }) => project));
});

app.get("/api/saved-workflows", async (_req, res) => {
  const workflows = await readSavedWorkflows();
  res.json(workflows.map(({ graph, ...workflow }) => workflow));
});

app.get("/api/saved-workflows/:fileName", async (req, res) => {
  const fileName = safeWorkflowFileName(req.params.fileName);
  if (!fileName) {
    return res.status(400).json({ error: "Invalid workflow file name." });
  }
  const workflows = await readSavedWorkflows();
  const workflow = workflows.find((item) => item.fileName === fileName);

  if (!workflow) {
    return res.status(404).json({ error: "Workflow not found." });
  }

  res.json(workflow);
});

app.post("/api/saved-workflows", async (req, res) => {
  const workflows = await readSavedWorkflows();
  const now = new Date().toISOString();
  const id = String(req.body.id || randomUUID()).trim();
  const name = String(req.body.name || "Untitled node project").trim() || "Untitled node project";
  const existing = workflows.find((item) => item.id === id);
  const fileName = existing?.fileName || uniqueWorkflowFileName(name, workflows);
  const workflow = {
    id,
    name,
    fileName,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    app: "NewtNode",
    version: 1,
    graph: {
      nodes: Array.isArray(req.body.nodes) ? req.body.nodes : [],
      edges: Array.isArray(req.body.edges) ? req.body.edges : [],
      groups: Array.isArray(req.body.groups) ? req.body.groups : [],
      viewport: req.body.viewport || { x: 0, y: 0, scale: 1 }
    }
  };

  await writeWorkflowFile(workflow);
  res.json(workflow);
});

app.delete("/api/saved-workflows/:fileName", async (req, res) => {
  const fileName = safeWorkflowFileName(req.params.fileName);
  if (!fileName) {
    return res.status(400).json({ error: "Invalid workflow file name." });
  }
  const filePath = path.join(savedWorkflowsDir, fileName);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Workflow not found." });
  }

  await rm(filePath, { force: true });
  const workflows = await readSavedWorkflows();
  res.json(workflows.map(({ graph, ...workflow }) => workflow));
});

app.get("/api/composer-poses", async (_req, res) => {
  res.json({ poses: await readComposerPoses() });
});

app.post("/api/composer-poses", async (req, res) => {
  const pose = normalizeComposerPose(req.body.pose || req.body);
  if (!pose) {
    return res.status(400).json({ error: "Invalid pose." });
  }

  const existing = await readComposerPoses();
  const fileName = pose.fileName && safeComposerPoseFileName(pose.fileName) ? safeComposerPoseFileName(pose.fileName) : uniqueComposerPoseFileName(pose.name, existing);
  const savedPose = {
    ...pose,
    fileName,
    savedAt: new Date().toISOString()
  };

  await mkdir(composerPosesDir, { recursive: true });
  await writeFile(path.join(composerPosesDir, fileName), JSON.stringify(savedPose, null, 2));
  res.json({ pose: savedPose, poses: await readComposerPoses() });
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

  res.json({
    asset: {
      localUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype || "application/octet-stream",
      size: req.file.size,
      mediaType: mediaTypeForMime(req.file.mimetype)
    }
  });
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

    const fileName = uniqueOutputFileName("composer-frame", ".png");
    await writeFile(path.join(outputsDir, fileName), bytes);
    const localUrl = `/outputs/${fileName}`;
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
      outputFileName: fileName,
      outputBytes: bytes.length,
      text: "Composer frame capture."
    });

    res.json({
      image: {
        localUrl,
        fileName,
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

    const fileName = uniqueOutputFileName("color-id-matte", ".png");
    const outputPath = path.join(outputsDir, fileName);
    await rename(req.file.path, outputPath);

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
      localImage: `/outputs/${fileName}`,
      outputFileName: fileName,
      outputBytes: req.file.size,
      text
    });

    res.json({
      modelName: "Color ID Matte",
      text,
      cost,
      image: {
        label: "Color ID Matte",
        localUrl: `/outputs/${fileName}`,
        fileName,
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
    return res.status(400).json({ error: "No transfer collage uploaded." });
  }

  const nodeId = safePathSegment(req.body.nodeId || "transfer");
  const transferDir = path.join(uploadsDir, "transfers", nodeId);
  const storedFileName = path.join("transfers", nodeId, "TRANSFER.png");
  const targetPath = path.join(transferDir, "TRANSFER.png");

  await mkdir(transferDir, { recursive: true });
  await rm(targetPath, { force: true });
  await rename(req.file.path, targetPath);

  res.json({
    asset: {
      localUrl: `/uploads/${storedFileName.split(path.sep).join("/")}`,
      fileName: "TRANSFER.png",
      storedFileName: storedFileName.split(path.sep).join("/"),
      mimeType: "image/png",
      size: req.file.size,
      mediaType: "image"
    }
  });
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

    if (selectedModel.provider === "openai") {
      if (!openAiImageApiKey) {
        return res.status(400).json({ error: "Missing OPENAI_IMAGE_API_KEY in .env." });
      }

      const openAiImage = await generateOpenAiImage({
        prompt,
        imagePromptUrls,
        imagePromptLabels,
        aspectRatio,
        resolution: req.body.resolution
      });
      const extension = extensionForMime(openAiImage.mimeType);
      const fileName = uniqueOutputFileName("openai-image-2", extension);
      await writeFile(path.join(outputsDir, fileName), openAiImage.bytes);

      const cost = estimateOpenAiImage2Cost({
        resolution: req.body.resolution,
        size: openAiImage.size,
        quality: openAiImage.quality
      });
      await appendHistory({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        mediaType: "image",
        provider: "OpenAI",
        modelName: selectedModel.displayName,
        endpoint: selectedModel.id,
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
        localImage: `/outputs/${fileName}`,
        outputFileName: fileName,
        outputBytes: openAiImage.bytes.length,
        text: openAiImage.revisedPrompt || ""
      });

      return res.json({
        text: openAiImage.revisedPrompt || "",
        cost,
        image: {
          localUrl: `/outputs/${fileName}`,
          fileName,
          mimeType: openAiImage.mimeType
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
    const fileName = uniqueOutputFileName("nano-banana-pro", extension);
    const imageBytes = Buffer.from(inlineData.data, "base64");
    await writeFile(path.join(outputsDir, fileName), imageBytes);

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
      localImage: `/outputs/${fileName}`,
      outputFileName: fileName,
      outputBytes: imageBytes.length,
      text
    });

    res.json({
      text,
      cost,
      image: {
        localUrl: `/outputs/${fileName}`,
        fileName,
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

  const output = await downloadImage(remoteImage.url, "sam-3-image-segmentation", remoteImage.content_type || remoteImage.mimeType);
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

  const output = await downloadImage(remoteImage.url, "dwpose", remoteImage.content_type || remoteImage.mimeType);
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

  const output = await downloadImage(remoteImage.url, "depth-anything", remoteImage.content_type || remoteImage.mimeType);
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
    const output = await downloadImage(remoteImage.url, `patina-${mapType}`, remoteImage.content_type || remoteImage.mimeType);
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

  const output = await downloadImage(remoteImage.url, "birefnet-image", remoteImage.content_type || remoteImage.mimeType);
  const images = [
    {
      remoteImage,
      output,
      label: input.mask_only ? "BiRefNet Mask" : "BiRefNet Image"
    }
  ];

  if (input.output_mask && remoteMask?.url && remoteMask.url !== remoteImage.url) {
    const maskOutput = await downloadImage(remoteMask.url, "birefnet-mask", remoteMask.content_type || remoteMask.mimeType);
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

    const output = await downloadImage(remoteImage.url, "qwen-camera-edit", remoteImage.content_type || remoteImage.mimeType);
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

    const speed = selectedVideoModel.speed;
    const speedPrefix = speed === "fast" ? "fast/" : "";
    const startFrameUrl = firstLocalOutput(req.body.startFrameUrls);
    const endFrameUrl = firstLocalOutput(req.body.endFrameUrls);
    const referenceImageUrls = Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [];
    const referenceVideoUrls = Array.isArray(req.body.referenceVideoUrls) ? req.body.referenceVideoUrls.filter(isLocalAssetUrl) : [];
    const referenceAudioUrls = Array.isArray(req.body.referenceAudioUrls) ? req.body.referenceAudioUrls.filter(isLocalAssetUrl) : [];
    const resolution = normalizeChoice(req.body.resolution, ["480p", "720p", "1080p"], "720p");
    const duration = normalizeDuration(req.body.duration);
    const aspectRatio = normalizeAspectRatio(req.body.aspectRatio);
    const generateAudio = Boolean(req.body.generateAudio);

    let routeKind = "text-to-video";
    if (startFrameUrl) {
      routeKind = "image-to-video";
    } else if (referenceImageUrls.length) {
      routeKind = "reference-to-video";
    }

    const input = {
      prompt,
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
      input.image_urls = await Promise.all(referenceImageUrls.map(uploadLocalOutputToFal));
    }

    const endpoint = `bytedance/seedance-2.0/${speedPrefix}${routeKind}`;
    const result = await subscribeFal(endpoint, { input, logs: true });
    const remoteVideo = result?.data?.video;

    if (!remoteVideo?.url) {
      return res.status(502).json({ error: "Fal returned no video URL.", raw: result?.data });
    }

    const output = await downloadVideo(remoteVideo.url, routeKind);
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
      submittedPrompt: prompt,
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
        referenceVideoCount: referenceVideoUrls.length,
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
      cost,
      video: {
        ...remoteVideo,
        localUrl: output.publicPath,
        fileName: output.fileName
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Video generation failed." });
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

    const output = await downloadModelFile(remoteModel.url, "hunyuan-3d-pro", remoteModel.content_type || remoteModel.mimeType || remoteModel.mime_type);
    const remoteThumbnail = normalizeFalFile(data.thumbnail) || normalizeFalFile(data.thumbnail_url) || firstFalImageResult(data);
    let thumbnailOutput = null;
    if (remoteThumbnail?.url) {
      try {
        thumbnailOutput = await downloadImage(remoteThumbnail.url, "hunyuan-3d-thumbnail", remoteThumbnail.content_type || remoteThumbnail.mimeType || remoteThumbnail.mime_type);
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

  const output = await downloadVideo(remoteVideo.url, "sam-3-video-mask");
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

  const output = await downloadVideo(remoteVideo.url, "creatify-aurora");
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

  const output = await downloadVideo(remoteVideo.url, "happy-horse-reference-to-video");
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

  const output = await downloadVideo(remoteVideo.url, "wan-fun-control");
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

  const output = await downloadVideo(remoteVideo.url, "void-video-inpainting");
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

  const output = await downloadVideo(remoteVideo.url, "birefnet-video");
  const videos = [
    {
      remoteVideo,
      output,
      label: "BiRefNet RGB"
    }
  ];

  if (input.output_mask && remoteMaskVideo?.url && remoteMaskVideo.url !== remoteVideo.url) {
    const maskOutput = await downloadVideo(remoteMaskVideo.url, "birefnet-mask-video");
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

  const output = await downloadVideo(remoteVideo.url, "rife-video-interpolation");
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

  const output = await downloadVideo(remoteVideo.url, "bytedance-video-upscaler");
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

  const output = await downloadVideo(remoteVideo.url, "topaz-video-upscale");
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

      const output = await downloadVideo(remoteVideo.url, route.kind);
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
      res.status(500).json({ error: error.message || "Generation failed." });
    }
  }
);

app.use("/api", (error, _req, res, _next) => {
  console.error(error);
  sendApiError(res, error, "API request failed.");
});

app.listen(port, "127.0.0.1", () => {
  console.log(`NewtNode server running on http://127.0.0.1:${port}`);
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

  const usedNames = new Set();
  return Array.from({ length: count }, (_value, index) => {
    const fallback = `Image${index + 1}`;
    const baseName = cleanReferenceName(names[index]) || fallback;
    return uniqueReferenceName(baseName, usedNames);
  });
}

function rewriteReferenceMentions(prompt, referenceNames) {
  const mentionMap = new Map();

  referenceNames.forEach((name, index) => {
    mentionMap.set(name.toLowerCase(), `@Image${index + 1}`);
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
  return String(value || "transfer")
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 80) || "transfer";
}

function safeWorkflowFileName(value) {
  const fileName = path.basename(String(value || ""));
  if (!fileName.toLowerCase().endsWith(".json")) return "";
  return fileName.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
}

function uniqueWorkflowFileName(name, workflows) {
  const usedNames = new Set(workflows.map((workflow) => workflow.fileName.toLowerCase()));
  const baseName = safePathSegment(name || "workflow") || "workflow";
  let fileName = `${baseName}.json`;
  let suffix = 2;

  while (usedNames.has(fileName.toLowerCase())) {
    fileName = `${baseName}-${suffix}.json`;
    suffix += 1;
  }

  return fileName;
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

async function readSavedWorkflows() {
  await mkdir(savedWorkflowsDir, { recursive: true });
  const entries = await readdir(savedWorkflowsDir, { withFileTypes: true });
  const workflows = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;

    try {
      const workflow = JSON.parse(await readFile(path.join(savedWorkflowsDir, entry.name), "utf8"));
      workflows.push({
        ...workflow,
        id: workflow.id || entry.name,
        name: workflow.name || path.basename(entry.name, ".json"),
        fileName: entry.name,
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

  return workflows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function writeWorkflowFile(workflow) {
  await mkdir(savedWorkflowsDir, { recursive: true });
  await writeFile(path.join(savedWorkflowsDir, workflow.fileName), JSON.stringify(workflow, null, 2));
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

async function downloadVideo(url, kind) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated video: ${response.status} ${response.statusText}`);
  }

  const extension = path.extname(new URL(url).pathname) || ".mp4";
  const fileName = uniqueOutputFileName(kind, extension);
  const outputPath = path.join(outputsDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);

  return {
    fileName,
    publicPath: `/outputs/${fileName}`,
    filePath: outputPath,
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

async function createExtractFrameResult({ body, sourceVideoUrl }) {
  let outputPath = "";
  try {
    const sourceVideo = resolveLocalAssetPathFromUrl(sourceVideoUrl);
    const metadata = await probeVideoFile(sourceVideo.filePath);
    const options = body.extractFrame && typeof body.extractFrame === "object" ? body.extractFrame : body;
    const format = normalizeExtractFrameFormat(options.format);
    const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
    const extension = format === "jpeg" ? ".jpg" : ".png";
    const frameTime = extractFrameTime(options.frameTime, metadata.duration);
    const fileName = uniqueOutputFileName("video-frame", extension);
    outputPath = path.join(outputsDir, fileName);

    await extractVideoFrameWithFfmpeg({
      sourcePath: sourceVideo.filePath,
      outputPath,
      frameTime,
      format
    });

    const outputStats = await stat(outputPath);
    const localUrl = `/outputs/${fileName}`;
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
      outputFileName: fileName,
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
        fileName,
        mimeType
      }
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

async function downloadImage(url, kind, mimeTypeHint = "") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated image: ${response.status} ${response.statusText}`);
  }

  const mimeType = normalizeMimeType(mimeTypeHint || response.headers.get("content-type") || "image/png");
  const extension = imageExtensionForUrl(url, mimeType);
  const fileName = uniqueOutputFileName(kind, extension);
  const outputPath = path.join(outputsDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);

  return {
    fileName,
    publicPath: `/outputs/${fileName}`,
    bytes: bytes.length,
    mimeType
  };
}

async function downloadModelFile(url, kind, mimeTypeHint = "") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated 3D model: ${response.status} ${response.statusText}`);
  }

  const mimeType = normalizeMimeType(mimeTypeHint || response.headers.get("content-type") || "model/gltf-binary", "model/gltf-binary");
  const extension = modelExtensionForUrl(url, mimeType);
  const fileName = uniqueOutputFileName(kind, extension);
  const outputPath = path.join(outputsDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);

  return {
    fileName,
    publicPath: `/outputs/${fileName}`,
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
    return [];
  }
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
    if (normalizedKey.includes("url") || /^https?:\/\//i.test(value) || value.startsWith("/outputs/") || value.startsWith("/uploads/")) {
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
  if (value.startsWith("/outputs/") || value.startsWith("/uploads/")) {
    return {
      type: "local-url",
      path: value.replace(/^\/(outputs|uploads)\//, "/$1/.../")
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
    await writeHistory(history.slice(0, 500));
  });
  historyWriteQueue = write.catch(() => {});
  return write;
}

async function writeHistory(history) {
  await writeFile(historyPath, JSON.stringify(history, null, 2));
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
  const name = String(body.projectName || "").trim();
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
  const data = await subscribeFal("openrouter/router/vision", {
    input: {
      image_urls: imageUrls,
      prompt: "Describe these images as concise visual prompt context. Focus on subject, setting, composition, camera, lighting, palette, mood, materials, and any important details.",
      system_prompt: "Return only useful prompt context. Do not use markdown.",
      model: falVisionTextModel
    },
    logs: true
  });
  const description = extractFalText(data).trim();
  return {
    descriptions: description ? [`Connected images: ${description}`] : [],
    usages: [falResultUsage(data)].filter(Boolean)
  };
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
  await writeFile(nodeProjectsPath, JSON.stringify(projects, null, 2));
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

  if (normalized.includes("openai") || normalized.includes("gpt-image-2") || normalized.includes("image 2")) {
    return {
      provider: "openai",
      displayName: "OpenAI Image 2",
      id: "gpt-image-2"
    };
  }

  return {
    provider: "google",
    displayName: "Nano Banana Pro",
    id: "gemini-3-pro-image-preview"
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
  const ratio = String(value || "21:9").match(/\d+:\d+/)?.[0] || "21:9";
  return normalizeChoice(ratio, imageAspectRatiosForProvider(provider), "21:9");
}

function imageAspectRatiosForProvider(provider) {
  return provider === "openai" ? openAiImageAspectRatios : nanoImageAspectRatios;
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
  if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) return options[0] || "21:9";

  return options.reduce((closest, option) => {
    const optionRatio = aspectRatioNumber(option);
    const closestRatio = aspectRatioNumber(closest);
    return Math.abs(Math.log(optionRatio / normalizedRatio)) < Math.abs(Math.log(closestRatio / normalizedRatio)) ? option : closest;
  }, options[0] || "21:9");
}

function aspectRatioNumber(value) {
  const [width = 21, height = 9] = String(value || "").match(/\d+:\d+/)?.[0]?.split(":").map(Number) || [];
  return width > 0 && height > 0 ? width / height : 21 / 9;
}

function normalizeGeminiImageAspectRatio(value) {
  const normalized = String(value || "21:9").match(/\d+:\d+/)?.[0] || "21:9";
  return normalizeChoice(normalized, ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], "21:9");
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

function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), {
    status,
    ...extra
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateOpenAiImage({ prompt, imagePromptUrls, imagePromptLabels, aspectRatio, resolution }) {
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
  const quality = normalizeOpenAiImageQuality(process.env.OPENAI_IMAGE_2_QUALITY || "medium");
  const submittedPrompt = promptWithReferenceLabels(prompt, imageInputs);
  const endpoint = imageInputs.length ? "https://api.openai.com/v1/images/edits" : "https://api.openai.com/v1/images/generations";
  const requestOptions = imageInputs.length
    ? openAiImageEditRequest({ prompt: submittedPrompt, imageInputs, size, quality })
    : openAiImageGenerationRequest({ prompt: submittedPrompt, size, quality });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiImageApiKey}`,
      ...requestOptions.headers
    },
    body: requestOptions.body
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI image generation failed.");
  }

  const image = data?.data?.[0];
  const base64Image = image?.b64_json || image?.b64;
  if (!base64Image) {
    throw new Error("OpenAI returned no image data.");
  }

  return {
    bytes: Buffer.from(base64Image, "base64"),
    mimeType: mimeForOpenAiOutputFormat("png"),
    size,
    quality,
    submittedPrompt,
    revisedPrompt: image?.revised_prompt || ""
  };
}

function openAiImageGenerationRequest({ prompt, size, quality }) {
  return {
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size,
      quality,
      output_format: "png"
    })
  };
}

function openAiImageEditRequest({ prompt, imageInputs, size, quality }) {
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", "png");

  imageInputs.slice(0, 16).forEach((image, index) => {
    const extension = extensionForMime(image.mimeType);
    const fileName = `${image.label || `reference-${index + 1}`}${extension}`;
    form.append("image[]", new File([image.buffer], fileName, { type: image.mimeType }));
  });

  return {
    headers: {},
    body: form
  };
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
  const ratio = String(aspectRatio || "21:9").match(/\d+:\d+/)?.[0] || "21:9";
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

function roundOpenAiImageDimension(value) {
  return Math.max(256, Math.floor(Number(value || 0) / 16) * 16);
}

function mimeForOpenAiOutputFormat(format) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
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
  return typeof value === "string" && value.startsWith("/outputs/");
}

function isLocalAssetUrl(value) {
  return typeof value === "string" && (value.startsWith("/outputs/") || value.startsWith("/uploads/"));
}

async function uploadLocalOutputToFal(publicPath) {
  const { fileName, buffer } = await readLocalAsset(publicPath);
  const falFile = new File([buffer], fileName, {
    type: mimeForExtension(path.extname(fileName))
  });

  return fal.storage.upload(falFile);
}

async function readLocalAsset(publicPath) {
  const { fileName, filePath } = resolveLocalAssetPath(publicPath);
  const buffer = await readFile(filePath);

  return {
    fileName,
    buffer,
    mimeType: mimeForExtension(path.extname(fileName).toLowerCase())
  };
}

function resolveLocalAssetPathFromUrl(value) {
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

  throw new Error("Extract Frame can only read local Newt Node videos from uploads or outputs.");
}

function resolveLocalAssetPath(publicPath) {
  const isUpload = publicPath.startsWith("/uploads/");
  const prefix = isUpload ? "/uploads/" : "/outputs/";
  const root = isUpload ? uploadsDir : outputsDir;
  const relativePath = path.normalize(decodeURIComponent(publicPath.slice(prefix.length)));

  if (path.isAbsolute(relativePath) || relativePath.startsWith("..")) {
    throw new Error("Invalid local asset path.");
  }

  return {
    fileName: path.basename(relativePath),
    filePath: path.join(root, relativePath)
  };
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

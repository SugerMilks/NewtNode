import "dotenv/config";

import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { File } from "node:buffer";
import { randomUUID } from "node:crypto";
import { fal } from "@fal-ai/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(rootDir, "uploads");
const outputsDir = path.join(rootDir, "outputs");
const savedWorkflowsDir = path.join(rootDir, "saved_workflows");
const dataDir = path.join(__dirname, "data");
const historyPath = path.join(dataDir, "history.json");
const nodeProjectsPath = path.join(dataDir, "node-projects.json");
const moodBoardOutputFileName = "MOOD_BOARD.png";
let historyWriteQueue = Promise.resolve();
const port = Number(process.env.PORT || 3333);
const seedanceStandardCostPerSecond = Number(process.env.SEEDANCE_STANDARD_COST_PER_SECOND || 0.014);
const seedanceFastCostPerSecond = Number(process.env.SEEDANCE_FAST_COST_PER_SECOND || 0.0112);
const nanoBananaCost1K2K = Number(process.env.NANO_BANANA_IMAGE_COST_1K_2K || 0.134);
const nanoBananaCost4K = Number(process.env.NANO_BANANA_IMAGE_COST_4K || 0.24);
const openAiImage2MediumCost = Number(process.env.OPENAI_IMAGE_2_MEDIUM_COST || 0.053);
const falUtilityImageTimeoutMs = Math.max(30000, Number(process.env.FAL_UTILITY_IMAGE_TIMEOUT_MS) || 180000);
const sam3SegmentationModelsEnabled = false; // Flip back to true when revisiting SAM 3 segmentation.
const birefnetModelOptions = ["General Use (Light)", "General Use (Light 2K)", "General Use (Heavy)", "Matting", "Portrait", "General Use (Dynamic)"];
const birefnetResolutionOptions = ["1024x1024", "2048x2048", "2304x2304"];

const app = express();

await Promise.all([mkdir(uploadsDir, { recursive: true }), mkdir(outputsDir, { recursive: true }), mkdir(savedWorkflowsDir, { recursive: true }), mkdir(dataDir, { recursive: true })]);

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
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));
app.use("/outputs", express.static(outputsDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    routes: {
      utilityImage: true,
      utilityVideo: true
    },
    falKeyConfigured: Boolean(process.env.FAL_KEY),
    openAiImage2ViaFalConfigured: Boolean(process.env.FAL_KEY),
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

  let deletedWorkflow = null;
  try {
    deletedWorkflow = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    deletedWorkflow = null;
  }

  await rm(filePath, { force: true });
  if (deletedWorkflow?.id) {
    await removeLegacyNodeProject(deletedWorkflow.id);
  }
  const workflows = await readSavedWorkflows();
  res.json(workflows.map(({ graph, ...workflow }) => workflow));
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

app.post("/api/node/upload-style-collage", upload.single("asset"), async (req, res) => {
  return handleTransferCollageUpload(req, res);
});

app.post("/api/node/upload-transfer-collage", upload.single("asset"), async (req, res) => {
  return handleTransferCollageUpload(req, res);
});

async function handleTransferCollageUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No mood board collage uploaded." });
  }

  const nodeId = safePathSegment(req.body.nodeId || "mood-board");
  const transferDir = path.join(uploadsDir, "transfers", nodeId);
  const storedFileName = path.join("transfers", nodeId, moodBoardOutputFileName);
  const targetPath = path.join(transferDir, moodBoardOutputFileName);

  await mkdir(transferDir, { recursive: true });
  await rm(targetPath, { force: true });
  await rename(req.file.path, targetPath);

  res.json({
    asset: {
      localUrl: `/uploads/${storedFileName.split(path.sep).join("/")}`,
      fileName: moodBoardOutputFileName,
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

    if (selectedModel.provider === "fal-openai-image-2") {
      if (!process.env.FAL_KEY) {
        return res.status(400).json({ error: "Missing FAL_KEY in .env." });
      }

      const openAiImage = await generateFalOpenAiImage2({
        prompt,
        imagePromptUrls,
        imagePromptLabels,
        aspectRatio: req.body.aspectRatio,
        resolution: req.body.resolution
      });
      const output = await downloadImage(openAiImage.remoteImage.url, "openai-image-2", openAiImage.remoteImage.content_type || openAiImage.remoteImage.mimeType);

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
          aspectRatio: req.body.aspectRatio || "21:9",
          resolution: req.body.resolution || "2K",
          imageSize: openAiImage.size,
          quality: openAiImage.quality,
          imagePromptCount: imagePromptUrls.length
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

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(400).json({ error: "Missing GOOGLE_API_KEY in .env." });
    }

    const model = selectedModel.id;
    const imageConfig = {
      aspectRatio: normalizeGeminiImageAspectRatio(req.body.aspectRatio),
      imageSize: normalizeGeminiImageSize(req.body.resolution)
    };
    const parts = [{ text: prompt }];

    for (const [index, imagePromptUrl] of imagePromptUrls.entries()) {
      const asset = await readLocalAsset(imagePromptUrl);
      if (!asset.mimeType.startsWith("image/")) continue;
      const label = cleanImagePromptLabel(imagePromptLabels[index]);
      if (label) {
        parts.push({ text: `Reference image label: ${label}` });
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
      mode: "Image generation",
      prompt,
      submittedPrompt: prompt,
      project: projectFromBody(req.body),
      node: nodeFromBody(req.body),
      settings: {
        model: req.body.model || selectedModel.displayName,
        aspectRatio: req.body.aspectRatio || "21:9",
        resolution: req.body.resolution || "2K",
        imageConfig,
        attempts,
        imagePromptCount: imagePromptUrls.length
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

  const result = await fal.subscribe(endpoint, { input, logs: true });
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
    if (!process.env.FAL_KEY) {
      return res.status(400).json({ error: "Missing FAL_KEY in .env." });
    }

    const selectedModel = resolveUtilityImageModel(req.body.model);
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
    res.status(errorStatusCode(error)).json({ error: publicErrorMessage(error, "Utility image failed.") });
  }
});

async function subscribeToFalWithTimeout(endpoint, input, label, timeoutMs = falUtilityImageTimeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      fal.subscribe(endpoint, { input, logs: true }),
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
    pricingBasis: "DWPose fal.ai image utility request; local price estimate not configured"
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
    pricingBasis: "Depth Anything v2 fal.ai image preprocessor request; local price estimate not configured"
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

  const cost = estimateFalImageUtilityCost({
    endpoint,
    mediaType: "image",
    pricingBasis: "Patina fal.ai image-to-PBR-maps request; local price estimate not configured"
  });
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
    pricingBasis: "BiRefNet v2 fal.ai image background removal request; local price estimate not configured"
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
    if (!process.env.FAL_KEY) {
      return res.status(400).json({ error: "Missing FAL_KEY in .env." });
    }

    const selectedVideoModel = resolveUtilityVideoModel(req.body.model);
    const prompt = String(req.body.prompt || "").trim();
    const referenceImageUrls = Array.isArray(req.body.referenceImageUrls) ? req.body.referenceImageUrls.filter(isLocalAssetUrl) : [];
    const referenceVideoUrls = Array.isArray(req.body.referenceVideoUrls) ? req.body.referenceVideoUrls.filter(isLocalAssetUrl) : [];
    const maskVideoUrls = Array.isArray(req.body.maskVideoUrls) ? req.body.maskVideoUrls.filter(isLocalAssetUrl) : [];

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
    res.status(errorStatusCode(error)).json({ error: publicErrorMessage(error, "Utility video failed.") });
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

    const result = await fal.subscribe(endpoint, { input, logs: true });
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
    const result = await fal.subscribe(endpoint, { input, logs: true });
    const remoteVideo = result?.data?.video;

    if (!remoteVideo?.url) {
      return res.status(502).json({ error: "Fal returned no video URL.", raw: result?.data });
    }

    const output = await downloadVideo(remoteVideo.url, routeKind);
    const cost = estimateSeedanceCost({
      speed,
      duration,
      resolution,
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
    res.status(500).json({ error: error.message || "Video generation failed." });
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
    apply_mask: true,
    video_output_type: "X264 (.mp4)",
    detection_threshold: clampNumber(options.detectionThreshold, 0, 1, 0.5)
  };

  const result = await fal.subscribe(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no segmentation video URL.", raw: result?.data });
  }

  const output = await downloadVideo(remoteVideo.url, "sam-3-video-segmentation");
  const cost = estimateSam3VideoCost({ endpoint });

  await appendHistory({
    id: result.requestId || randomUUID(),
    createdAt: new Date().toISOString(),
    mediaType: "video",
    provider: "fal.ai",
    modelName: "SAM 3 Video",
    endpoint,
    mode: "SAM 3 video segmentation",
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

  const result = await fal.subscribe(endpoint, { input, logs: true });
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

  const result = await fal.subscribe(endpoint, { input, logs: true });
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
  const endpoint = selectedVideoModel.id;
  const input = {
    video_url: await uploadLocalOutputToFal(videoUrl),
    prompt,
    mask_prompt: String(options.maskPrompt || "").trim(),
    enable_pass2_refinement: Boolean(options.enablePass2Refinement),
    negative_prompt: String(options.negativePrompt || ""),
    num_inference_steps: clampInteger(options.numInferenceSteps, 1, 80, 30),
    guidance_scale: clampNumber(options.guidanceScale, 0, 20, 1),
    strength: clampNumber(options.strength, 0, 1, 1),
    num_frames: clampInteger(options.numFrames, 69, 197, 85),
    enable_safety_checker: options.enableSafetyChecker !== false
  };
  const seed = optionalInteger(options.seed);
  const maskVideoUrl = firstLocalOutput(maskVideoUrls);
  if (seed !== undefined) input.seed = seed;
  if (maskVideoUrl) input.quad_mask_video_url = await uploadLocalOutputToFal(maskVideoUrl);

  const result = await fal.subscribe(endpoint, { input, logs: true });
  const remoteVideo = normalizeFalFile(result?.data?.video);

  if (!remoteVideo?.url) {
    return res.status(502).json({ error: "Fal returned no VOID video URL.", raw: result?.data });
  }

  const output = await downloadVideo(remoteVideo.url, "void-video-inpainting");
  const cost = estimateFalVideoUtilityCost({
    endpoint,
    pricingBasis: "VOID video inpainting fal.ai request; local price estimate not configured"
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

  const result = await fal.subscribe(endpoint, { input, logs: true });
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
    pricingBasis: "BiRefNet v2 fal.ai video background removal request; local price estimate not configured"
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

      const result = await fal.subscribe(route.endpoint, {
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

async function readSavedWorkflows() {
  await mkdir(savedWorkflowsDir, { recursive: true });
  const workflows = await readSavedWorkflowFiles();
  const legacyProjects = await readNodeProjects();
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

  return (migratedLegacyProject ? await readSavedWorkflowFiles() : workflows).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function readSavedWorkflowFiles() {
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

  return workflows;
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
    bytes: bytes.length
  };
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

function normalizeMimeType(value) {
  return String(value || "image/png").split(";")[0].trim().toLowerCase() || "image/png";
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

function publicErrorMessage(error, fallback) {
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

function publicErrorDetail(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(publicErrorDetail).filter(Boolean).join(" ");
  if (typeof value === "object") {
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

function estimateSeedanceCost({ speed, duration, resolution, endpoint, routeKind }) {
  const seconds = durationToSeconds(duration);
  const isFast = speed === "fast" || String(endpoint || "").includes("/fast/");
  const unitRateUsd = isFast ? seedanceFastCostPerSecond : seedanceStandardCostPerSecond;
  const amountUsd = roundCurrency(seconds * unitRateUsd);

  return {
    amountUsd,
    currency: "USD",
    unitRateUsd,
    units: seconds,
    unit: "second",
    mediaType: "video",
    resolution,
    pricingBasis: "Seedance 2.0 per-second fal.ai pricing estimate",
    pricingSource: "configured-pricing-v1",
    routeKind
  };
}

function estimateWanFunControlCost({ endpoint, matchInputNumFrames, numFrames, matchInputFps, fps }) {
  const billingFrames = matchInputNumFrames ? 81 : numFrames;
  const seconds = billingFrames / 16;
  const unitRateUsd = 0.1;

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
  return {
    amountUsd: null,
    currency: "USD",
    unitRateUsd: null,
    units: duration || null,
    unit: "request",
    mediaType: "video",
    resolution,
    pricingBasis: "Creatify Aurora fal.ai request; local price estimate not configured",
    pricingSource: "fal-model-page-2026-05-12",
    endpoint
  };
}

function estimateSam3ImageCost({ endpoint }) {
  return {
    amountUsd: null,
    currency: "USD",
    unitRateUsd: null,
    units: 1,
    unit: "request",
    mediaType: "image",
    pricingBasis: "SAM 3 image segmentation fal.ai request; local price estimate not configured",
    pricingSource: "fal-model-page-2026-05-12",
    endpoint
  };
}

function estimateSam3VideoCost({ endpoint }) {
  return {
    amountUsd: null,
    currency: "USD",
    unitRateUsd: 0.005,
    units: null,
    unit: "16 frames",
    mediaType: "video",
    pricingBasis: "SAM 3 video segmentation fal.ai pricing estimate at $0.005 per 16 frames; local frame count unavailable",
    pricingSource: "fal-model-page-2026-05-12",
    endpoint
  };
}

function estimateFalImageUtilityCost({ endpoint, mediaType, pricingBasis }) {
  return {
    amountUsd: null,
    currency: "USD",
    unitRateUsd: null,
    units: 1,
    unit: "request",
    mediaType,
    pricingBasis,
    pricingSource: "fal-model-page-2026-05-13",
    endpoint
  };
}

function estimateFalVideoUtilityCost({ endpoint, pricingBasis }) {
  return {
    amountUsd: null,
    currency: "USD",
    unitRateUsd: null,
    units: 1,
    unit: "request",
    mediaType: "video",
    pricingBasis,
    pricingSource: "fal-model-page-2026-05-15",
    endpoint
  };
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
    pricingBasis: "Gemini 3 Pro Image Preview output image estimate"
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

function durationToSeconds(duration) {
  if (duration === "auto") return 15;
  const match = String(duration || "15").match(/\d+/);
  return Math.max(1, Number(match?.[0] || 15));
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

  if (normalized.includes("openai") || normalized.includes("gpt-image-2") || normalized.includes("image 2")) {
    return {
      provider: "fal-openai-image-2",
      displayName: "OpenAI Image 2",
      id: "openai/gpt-image-2"
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

  return sizeMap[normalizedResolution]?.[ratio] || sizeMap["2K"]["21:9"];
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function normalizeDuration(value) {
  const match = String(value || "15").match(/\d+/);
  return normalizeChoice(match?.[0], ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], "15");
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

function optionalInteger(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : undefined;
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
  return "file";
}

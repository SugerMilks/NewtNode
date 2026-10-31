import multer from "multer";
import { buildImageEditPrompt, imageEditModels } from "../../src/imageEdit.js";
import { ideogramImageEditModel, ideogramImageEditCost, validateIdeogramImageEditRequest } from "../../src/ideogramImageEdit.js";
import { createHash, randomUUID } from "node:crypto";
import { prepareImageEdit, finishImageEdit } from "../image-edit.js";
import { openAiImage25Cost, openAiImage25Models, openAiImage25QualityOptions } from "../../src/openAiImage25.js";
import { nanoBanana21ModelName, nanoBanana21Cost, nanoBanana21ResolutionOptions, nanoBanana21ThinkingLevel } from "../../src/nanoBanana21.js";

export function registerImageEditRoutes(app, { limiter, hasFal, getProvider, readSource, generate, readGenerated = readImageEditResult, save, recordHistory, sendError }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 24 * 1024 * 1024, files: 2, fields: 16, fieldSize: 100000 } });
  const jobs = new Map();
  app.post("/api/node/edit-image", limiter, upload.fields([{ name: "drawing", maxCount: 1 }, { name: "selection", maxCount: 1 }]), async (req, res) => {
    try {
      const { sourceUrl, requestId, prompt = "", mode = "edit", quality = "high", model = openAiImage25Models.sunburst, editPrecision = "regular", resolution = "2K" } = req.body;
      const ideogram = model === ideogramImageEditModel;
      const nano = model === nanoBanana21ModelName;
      if (!imageEditModels.includes(model)) throw Object.assign(new Error("Choose Ideogram 4.5, Nano Banana 2.1 or Image 2.5 Sunburst for image editing."), { status: 400 });
      // getProvider applies global precedence; an unsupported selected provider returns "".
      const provider = getProvider ? getProvider() : hasFal?.() ? "fal" : "";
      if (ideogram && provider !== "fal") throw Object.assign(new Error("Enable Fal in Settings for Ideogram 4.5 image editing. This model is not supported through Krea or Atlas Cloud in the editor."), { status: 400 });
      if (nano && provider !== "fal") throw Object.assign(new Error("Enable Fal in Settings for Nano Banana 2.1 in Draw and Edit. Krea and Atlas Cloud are not supported in this editor."), { status: 400 });
      if (!["fal", "atlas"].includes(provider)) throw Object.assign(new Error("Enable Fal, or disable Krea and enable Atlas Cloud in Settings for Image 2.5 drawing and masked edits."), { status: 400 });
      if (!/^[a-z0-9-]{16,80}$/i.test(requestId || "")) throw Object.assign(new Error("An edit request ID is required."), { status: 400 });
      if (ideogram) {
        const submittedPrompt = (() => {
          try { return buildImageEditPrompt({ prompt, mode, model, blank: req.body.blank === "true", hasDrawing: Boolean(req.files?.drawing?.[0]), hasSelection: Boolean(req.files?.selection?.[0]) }); }
          catch (error) { throw Object.assign(error, { status: 400 }); }
        })();
        validateIdeogramImageEditRequest({ prompt: submittedPrompt, quality, editPrecision });
      }
      if (nano && !nanoBanana21ResolutionOptions.includes(resolution)) throw Object.assign(new Error("Nano Banana 2.1 supports 1K, 2K, or 4K resolution."), { status: 400 });
      if (!ideogram && !nano && !openAiImage25QualityOptions.includes(quality)) throw Object.assign(new Error("Choose a valid image quality."), { status: 400 });
      const key = `${req.body.projectId || ""}:${requestId}`;
      const hash = createHash("sha256").update(JSON.stringify(Object.entries(req.body).sort(([a], [b]) => a.localeCompare(b))));
      for (const name of ["drawing", "selection"]) hash.update(name).update(req.files?.[name]?.[0]?.buffer || "");
      const fingerprint = hash.digest("hex");
      for (const [id, job] of jobs) if (job.finished && Date.now() - job.finished > 3600000) jobs.delete(id);
      if (!jobs.has(key)) {
        if (jobs.size >= 100) throw Object.assign(new Error("The image editor is busy. Try again later."), { status: 429 });
        const job = { fingerprint };
        job.promise = run(req, { sourceUrl, prompt, mode, quality, provider, model, editPrecision, resolution }).finally(() => { job.finished = Date.now(); });
        jobs.set(key, job);
      }
      if (jobs.get(key).fingerprint !== fingerprint) throw Object.assign(new Error("This edit request ID has already been used for a different edit."), { status: 409 });
      res.json(await jobs.get(key).promise);
    } catch (error) { sendError(res, error, "Image edit failed."); }
  });

  async function run(req, { sourceUrl, prompt, mode, quality, provider, model, editPrecision, resolution }) {
    const nano = model === nanoBanana21ModelName;
    const source = await readSource(sourceUrl);
    const prepared = await prepareImageEdit({ source: source.buffer, drawing: req.files?.drawing?.[0]?.buffer,
      selection: req.files?.selection?.[0]?.buffer, prompt, mode, model, blank: req.body.blank === "true" })
      .catch((error) => { throw Object.assign(error, { status: 400 }); });
    let generation;
    let generationProvider = provider === "atlas" ? "Atlas Cloud" : "fal.ai";
    try {
      generation = await generate({ provider, model, ...(nano ? { resolution } : { quality }), ...(model === ideogramImageEditModel ? { editPrecision } : {}), size: `${prepared.size.width}x${prepared.size.height}`, prompt: prepared.submittedPrompt,
        images: prepared.images, mask: prepared.mask });
      generationProvider = generation.provider || generationProvider;
      const bytes = await finishImageEdit(prepared, await readGenerated(generation.remoteImage.url));
      const output = await save(req, bytes);
      const costOptions = { model, provider: generationProvider, endpoint: generation.endpoint, quality, editPrecision, size: `${prepared.size.width}x${prepared.size.height}` };
      const cost = generation.cost ?? (nano ? { ...nanoBanana21Cost({ resolution, referenceCount: prepared.images.length }), provider: generationProvider }
        : model === ideogramImageEditModel ? ideogramImageEditCost(costOptions) : openAiImage25Cost(costOptions));
      const modelSettings = nano ? { resolution, thinkingLevel: nanoBanana21ThinkingLevel } : model === ideogramImageEditModel ? { editPrecision, ...(Number.isInteger(generation.seed) ? { seed: generation.seed } : {}) } : {};
      const item = { url: output.url, thumbnailUrl: output.thumbnailUrl, fileName: output.fileName, type: "image", mimeType: "image/png",
        label: "Image Edit", model, ...modelSettings, provider: generationProvider, sourceUrl, width: prepared.width, height: prepared.height, cost };
      let warning = "";
      try {
        await recordHistory({ id: randomUUID(), createdAt: new Date().toISOString(), mediaType: "image", provider: generationProvider, modelName: model,
          endpoint: generation.endpoint, mode: `Image Edit: ${mode}`, prompt, submittedPrompt: prepared.submittedPrompt,
          project: { id: req.body.projectId || "node-workspace", name: req.body.projectName || "Node workspace" },
          node: { id: req.body.nodeId, title: req.body.nodeTitle || "Image Edit" },
          settings: { ...(!nano ? { quality } : {}), ...modelSettings, sourceUrl, maskedEdit: Boolean(prepared.selection), blank: req.body.blank === "true", imageSize: `${prepared.size.width}x${prepared.size.height}` },
          localImage: item.url, localThumbnail: item.thumbnailUrl, outputFileName: item.fileName, cost });
      } catch { warning = "Image saved, but this run could not be added to History."; }
      return { item, warning };
    } catch (error) {
      if (generation) throw Object.assign(new Error(`The model completed the edit, but NewtNode could not save it. Check ${generationProvider === "fal.ai" ? "Fal" : generationProvider} history before rerunning. ${error.message}`), { status: 502 });
      throw error;
    }
  }
}

async function readImageEditResult(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok || !response.body) throw new Error("Could not download the generated edit.");
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 48 * 1024 * 1024) throw new Error("The generated edit exceeds the download size limit.");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

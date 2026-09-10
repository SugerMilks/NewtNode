import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import { prepareImageEdit, finishImageEdit } from "../image-edit.js";
import { openAiImage25Cost, openAiImage25Models, openAiImage25QualityOptions } from "../../src/openAiImage25.js";

export function registerImageEditRoutes(app, { limiter, hasFal, getProvider, readSource, generate, readGenerated = readImageEditResult, save, recordHistory, sendError }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 24 * 1024 * 1024, files: 2, fields: 16, fieldSize: 100000 } });
  const jobs = new Map();
  app.post("/api/node/edit-image", limiter, upload.fields([{ name: "drawing", maxCount: 1 }, { name: "selection", maxCount: 1 }]), async (req, res) => {
    try {
      // getProvider applies global precedence; an unsupported selected provider returns "".
      const provider = getProvider ? getProvider() : hasFal?.() ? "fal" : "";
      if (!["fal", "atlas"].includes(provider)) throw Object.assign(new Error("Enable Fal, or disable Krea and enable Atlas Cloud in Settings for Image 2.5 drawing and masked edits."), { status: 400 });
      const { sourceUrl, requestId, prompt = "", mode = "edit", quality = "high" } = req.body;
      if (!/^[a-z0-9-]{16,80}$/i.test(requestId || "")) throw Object.assign(new Error("An edit request ID is required."), { status: 400 });
      if (!openAiImage25QualityOptions.includes(quality)) throw Object.assign(new Error("Choose a valid image quality."), { status: 400 });
      const key = `${req.body.projectId || ""}:${requestId}`;
      const hash = createHash("sha256").update(JSON.stringify(Object.entries(req.body).sort(([a], [b]) => a.localeCompare(b))));
      for (const name of ["drawing", "selection"]) hash.update(name).update(req.files?.[name]?.[0]?.buffer || "");
      const fingerprint = hash.digest("hex");
      for (const [id, job] of jobs) if (job.finished && Date.now() - job.finished > 3600000) jobs.delete(id);
      if (!jobs.has(key)) {
        if (jobs.size >= 100) throw Object.assign(new Error("The image editor is busy. Try again later."), { status: 429 });
        const job = { fingerprint };
        job.promise = run(req, { sourceUrl, prompt, mode, quality, provider }).finally(() => { job.finished = Date.now(); });
        jobs.set(key, job);
      }
      if (jobs.get(key).fingerprint !== fingerprint) throw Object.assign(new Error("This edit request ID has already been used for a different edit."), { status: 409 });
      res.json(await jobs.get(key).promise);
    } catch (error) { sendError(res, error, "Image edit failed."); }
  });

  async function run(req, { sourceUrl, prompt, mode, quality, provider }) {
    const source = await readSource(sourceUrl);
    const prepared = await prepareImageEdit({ source: source.buffer, drawing: req.files?.drawing?.[0]?.buffer,
      selection: req.files?.selection?.[0]?.buffer, prompt, mode, blank: req.body.blank === "true" })
      .catch((error) => { throw Object.assign(error, { status: 400 }); });
    const model = openAiImage25Models.sunburst;
    let generation;
    let generationProvider = provider === "atlas" ? "Atlas Cloud" : "fal.ai";
    try {
      generation = await generate({ provider, model, quality, size: `${prepared.size.width}x${prepared.size.height}`, prompt: prepared.submittedPrompt,
        images: prepared.images, mask: prepared.mask });
      generationProvider = generation.provider || generationProvider;
      const bytes = await finishImageEdit(prepared, await readGenerated(generation.remoteImage.url));
      const output = await save(req, bytes);
      const cost = generation.cost ?? openAiImage25Cost({ model, provider: generationProvider, endpoint: generation.endpoint, quality, size: `${prepared.size.width}x${prepared.size.height}` });
      const item = { url: output.url, thumbnailUrl: output.thumbnailUrl, fileName: output.fileName, type: "image", mimeType: "image/png",
        label: "Image Edit", provider: generationProvider, sourceUrl, width: prepared.width, height: prepared.height, cost };
      let warning = "";
      try {
        await recordHistory({ id: randomUUID(), createdAt: new Date().toISOString(), mediaType: "image", provider: generationProvider, modelName: model,
          endpoint: generation.endpoint, mode: `Image Edit: ${mode}`, prompt, submittedPrompt: prepared.submittedPrompt,
          project: { id: req.body.projectId || "node-workspace", name: req.body.projectName || "Node workspace" },
          node: { id: req.body.nodeId, title: req.body.nodeTitle || "Image Edit" },
          settings: { quality, sourceUrl, maskedEdit: Boolean(prepared.mask), blank: req.body.blank === "true", imageSize: `${prepared.size.width}x${prepared.size.height}` },
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

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { editVectorDocument } from "./vector-layers.js";
import { vectorBackgroundSetup } from "./vector-background.js";
import { vectorAutomaticGroupOperation } from "../src/vectorLayerOrganization.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = buffer => createHash("sha256").update(buffer).digest("hex");

export function createVectorLayerService({ readSource, saveAssets, recordHistory, describeLayers }) {
  let active = 0;
  const saves = new Map();
  const naming = new Map();
  async function document(body) {
    if (typeof body?.svgUrl !== "string" || !/^\/(outputs|uploads|workflow-assets)\/[^?#]+\.svg$/i.test(body.svgUrl)) throw fail("Choose a saved SVG from this NewtNode project.");
    const source = await readSource(body.svgUrl);
    const sourceHash = digest(source);
    if (body.sourceHash && body.sourceHash !== sourceHash) throw fail("The original artwork changed. Reopen Layers before saving edits.", 409);
    const edited = editVectorDocument(source, { operations: body.operations, backgroundKeys: body.backgroundKeys, lockedKeys: body.lockedKeys, isolate: body.isolate });
    return { ...edited, sourceHash };
  }
  async function inspect(body) {
    if (active >= 2) throw fail("Vector editing is busy. Try again when the current local export finishes.", 429);
    active++;
    try {
      const doc = await document(body);
      const budget = Math.min(100, 500 - (body.operations || []).reduce((count, op) => count + (op.type === "batch" ? op.operations.length : 1), 0));
      let current = doc;
      const operations = [];
      const apply = operation => {
        if (!operation) return;
        current = editVectorDocument(current.svg, { operations: [operation], backgroundKeys: current.backgroundKeys, lockedKeys: current.lockedKeys });
        operations.push(...operation.operations);
      };
      if (body.prepareBackground === true && !body.operations?.length && budget >= 3) apply(await vectorBackgroundSetup(doc));
      if (body.prepareGroups === true) apply(vectorAutomaticGroupOperation(current.layers, randomUUID, budget - operations.length));
      if (body.fitCanvasPadding != null) {
        const padding = body.fitCanvasPadding;
        if (!Number.isInteger(padding) || padding < 0 || padding > 1024) throw fail("Canvas padding must be 0-1,024 pixels.");
        if (budget - operations.length < 1) throw fail("Save a version before fitting the canvas.");
        const { data, info } = await sharp(Buffer.from(current.svg), { density: 72, limitInputPixels: 64000000 }).ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
        let left = info.width, top = info.height, right = -1, bottom = -1;
        for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x]) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
        if (right < 0) throw fail("There is no visible artwork to fit. Show a layer first.");
        apply({ type: "batch", operations: [{ type: "canvas", id: `newt-group-${randomUUID()}`, x: left - padding, y: top - padding, width: right - left + 1 + 2 * padding, height: bottom - top + 1 + 2 * padding }] });
      }
      return operations.length ? { ...current, sourceHash: doc.sourceHash, initialOperation: { type: "batch", operations } } : doc;
    } finally { active--; }
  }
  async function save(body) {
    if (typeof body?.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(body.requestId) || !/^[a-f0-9]{64}$/.test(body.sourceHash || "")) throw fail("Reopen Layers before saving this artwork.");
    const signature = digest(JSON.stringify(body));
    const previous = saves.get(body.requestId);
    if (previous) {
      if (previous.signature !== signature) throw fail("This save identifier belongs to a different edit.", 409);
      return previous.promise;
    }
    if (active >= 2) throw fail("Vector editing is busy. Try again when the current local export finishes.", 429);
    const action = async () => {
      active++;
      try {
        const edited = await document(body);
        const { data: png, info } = await sharp(Buffer.from(edited.svg), { density: 72, limitInputPixels: 64000000, failOn: "error" }).ensureAlpha().png().toBuffer({ resolveWithObject: true });
        const alpha = await sharp(png).extractChannel("alpha").png().toBuffer();
        const output = await saveAssets(body, { svg: edited.svg, png, alpha });
        const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 120) : "Edited vector";
        const cost = { amountUsd: 0, currency: "USD", estimated: false, pricingBasis: "Local vector editing; no provider request." };
        const item = { ...output, type: "image", mimeType: "image/png", width: info.width, height: info.height, label,
          vectorWidth: edited.width, vectorHeight: edited.height, shapeCount: edited.shapeCount,
          model: "Vector Layers", provider: "local", vectorSourceSvgUrl: body.svgUrl, vectorLayersPrepared: true, vectorGroupsPrepared: body.groupsPrepared === true, vectorBackgroundKeys: edited.backgroundKeys, vectorLockedKeys: edited.lockedKeys,
          cost, createdAt: new Date().toISOString() };
        let warning = "";
        try {
          await recordHistory({ id: body.requestId, timestamp: item.createdAt, mediaType: "image", provider: "local", model: "Vector Layers", modelName: "Vector Layers",
            endpoint: "/api/node/vector-layers/save", mode: body.isolate?.length ? "vector-layer-export" : "vector-edit", status: "completed", cost,
            localImage: item.url, localSvg: item.svgUrl, localAlpha: item.alphaUrl, localThumbnail: item.thumbnailUrl,
            projectId: body.projectId, projectName: body.projectName, workflowName: body.workflowName, workflowPackageId: body.workflowPackageId,
            node: { id: body.nodeId, title: body.nodeTitle || "Vector" }, settings: { sourceSvgUrl: body.svgUrl, operations: body.operations || [], isolate: body.isolate || [] } });
        } catch { warning = "The files were saved, but History could not be updated."; }
        return { item, warning };
      } finally { active--; }
    };
    const promise = action(); saves.set(body.requestId, { signature, promise });
    try { const result = await promise; while (saves.size > 100) saves.delete(saves.keys().next().value); return result; }
    catch (error) { saves.delete(body.requestId); throw error; }
  }
  async function autoName(body) {
    if (!describeLayers) throw fail("Automatic layer naming is unavailable.", 503);
    if (!/^[a-f0-9-]{36}$/.test(body?.requestId || "")) throw fail("Reopen Layers before naming artwork.");
    const signature = digest(JSON.stringify(body)), previous = naming.get(body.requestId);
    if (previous) {
      if (previous.signature !== signature) throw fail("This naming request belongs to different artwork.", 409);
      return previous.promise;
    }
    if (active >= 2) throw fail("Vector editing is busy. Wait for the current operation to finish.", 429);
    const action = async () => {
      active++;
      try {
        const edited = await document(body);
        if (!Array.isArray(body.keys) || !body.keys.length || body.keys.length > 32 || new Set(body.keys).size !== body.keys.length) throw fail("Select between 1 and 32 layers to name.");
        const layers = body.keys.map(key => edited.layers.find(layer => layer.key === key));
        if (layers.some(layer => !layer || layer.locked || layer.parentLocked)) throw fail("Choose unlocked layers to name.");
        return await describeLayers(body, edited, layers);
      } finally { active--; }
    };
    const promise = action(); naming.set(body.requestId, { signature, promise });
    try { return await promise; } finally { while (naming.size > 100) naming.delete(naming.keys().next().value); }
  }
  return { inspect, save, autoName };
}

export function registerVectorLayerRoutes(app, { service, limiter = (_req, _res, next) => next(), sendError }) {
  app.post("/api/node/vector-layers/inspect", limiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await service.inspect(req.body)); } catch (error) { sendError(res, error, "Could not open vector layers."); }
  });
  app.post("/api/node/vector-layers/save", limiter, async (req, res) => {
    try { res.json(await service.save(req.body)); } catch (error) { sendError(res, error, "Could not save vector layers."); }
  });
  app.post("/api/node/vector-layers/name", limiter, async (req, res) => {
    try { res.json(await service.autoName(req.body)); } catch (error) { sendError(res, error, "Could not name vector layers."); }
  });
}

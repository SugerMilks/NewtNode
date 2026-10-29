import { normalizedResultItems } from "./mediaResults.js";
import { appendedNodeResultState } from "./nodeRunner.js";
import { normalizeVectorGuide, vectorReferences, vectorReferenceInstructions } from "./vectorGuidance.js";

export const ideogramVectorModel = "Ideogram Vector";
export const vectorBatchOptions = Object.freeze(["1", "2", "3", "4", "5", "6"]);

function vectorBatchCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(1, Math.min(6, Math.trunc(count))) : 1;
}
export const vectorAspectRatios = Object.freeze(["auto", "1:1", "1:4", "1:3", "1:2", "9:16", "10:16", "2:3", "3:4", "4:5", "5:4", "4:3", "3:2", "16:10", "16:9", "2:1", "3:1", "4:1"]);
export const vectorDesignPresets = Object.freeze([
  { value: "custom", label: "Custom", prompt: "" },
  { value: "logo", label: "Logo", prompt: "Design a distinctive logo with a clear silhouette, balanced negative space and shapes that remain legible at small sizes. Present the artwork itself, without a product mockup." },
  { value: "icon", label: "Icon", prompt: "Design a single graphic icon with a clear silhouette, consistent visual weight and simple shapes that remain legible at small sizes." },
  { value: "sticker", label: "Sticker", prompt: "Design a standalone sticker graphic with a unified outer silhouette and a clean, generous border around the artwork. Present the artwork itself, without a product mockup." },
  { value: "illustration", label: "Illustration", prompt: "Design a graphic illustration with deliberate shapes, a balanced composition and clear visual hierarchy." },
  { value: "typography", label: "Typography", prompt: "Design an expressive typographic composition with carefully shaped lettering, consistent spacing and strong readability. Present the artwork itself, without a product mockup." }
]);

export const ideogramVectorRates = Object.freeze({ low: 0.13, medium: 0.16, high: 0.20, highReference: 0.32, vectorize: 0.10 });

export function normalizeVectorRates(rates = {}) {
  return Object.fromEntries(Object.keys(ideogramVectorRates).map(key => [key, typeof rates?.[key] === "number" && Number.isFinite(rates[key]) && rates[key] >= 0 ? rates[key] : null]));
}

export function vectorDefaults() {
  return { vectorMode: "generate", prompt: "", designPreset: "custom", lettering: "", palette: "", quality: "medium", aspectRatio: "1:1", seed: "", batchCount: "1", vectorizeMode: "default",
    fontReference: null, layoutReference: null, vectorSavedMoodBoards: [],
    previewBackground: "checker", vectorLayersOpen: false, vectorLayerDrafts: [], resultType: "image", resultItems: [], resultUrl: "", selectedResultIndex: 0, vectorJob: null, status: "idle", error: "" };
}

export function normalizeVectorData(value = {}, { restore = false } = {}) {
  const data = { ...vectorDefaults(), ...value };
  const resultItems = normalizedResultItems(data.resultItems, data.resultUrl, "image");
  const selectedResultIndex = Math.max(0, Math.min(resultItems.length - 1, Math.trunc(Number(data.selectedResultIndex) || 0)));
  let vectorJob = data.vectorJob && typeof data.vectorJob.requestId === "string" ? { ...data.vectorJob } : null;
  if (restore && vectorJob && ["submitting", "running"].includes(vectorJob.status)) vectorJob = { ...vectorJob, status: "uncertain", error: "The request was interrupted. Check its result or History before generating again." };
  return { ...data, resultItems, selectedResultIndex, resultUrl: resultItems[selectedResultIndex]?.url || "", resultType: "image", vectorJob,
    title: typeof data.title !== "string" || !data.title.trim() ? "Vector Node"
      : /^Vector(?: \d+)?(?: Copy)*$/.test(data.title) ? data.title.replace(/^Vector/, "Vector Node") : data.title,
    fontReference: normalizeVectorGuide(data.fontReference, "font"), layoutReference: normalizeVectorGuide(data.layoutReference, "layout"),
    vectorSavedMoodBoards: (Array.isArray(data.vectorSavedMoodBoards) ? data.vectorSavedMoodBoards : []).slice(0, 5).filter(item => typeof item?.url === "string" && /^\/(uploads|outputs|workflow-assets)\//.test(item.url)).map(item => ({ url: item.url, label: String(item.label || "Mood Board").slice(0, 200) })),
    vectorLayersOpen: data.vectorLayersOpen === true,
    vectorLayerDrafts: (Array.isArray(data.vectorLayerDrafts) ? data.vectorLayerDrafts : []).filter(draft => resultItems.some(item => item.svgUrl === draft?.svgUrl) && Array.isArray(draft.operations)),
    vectorMode: data.vectorMode === "vectorize" ? "vectorize" : "generate",
    designPreset: vectorDesignPresets.some(p => p.value === data.designPreset) ? data.designPreset : "custom",
    prompt: String(data.prompt || ""), lettering: String(data.lettering || ""), palette: String(data.palette || ""),
    quality: ["low", "medium", "high"].includes(data.quality) ? data.quality : "medium",
    batchCount: String(vectorBatchCount(data.batchCount)),
    aspectRatio: vectorAspectRatios.includes(data.aspectRatio) ? data.aspectRatio : "1:1",
    seed: data.seed == null ? "" : String(data.seed), vectorizeMode: data.vectorizeMode === "simple" ? "simple" : "default",
    previewBackground: ["checker", "light", "dark"].includes(data.previewBackground) ? data.previewBackground : "checker",
    ...(restore && data.status === "running" ? { status: vectorJob ? "error" : resultItems.length ? "complete" : "idle" } : {}) };
}

function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }

// Strict request validation is shared by the browser and backend; normalization is only for saved UI data.
export function validateIdeogramVectorRequest(body = {}) {
  const mode = body.mode ?? "generate";
  if (!["generate", "vectorize"].includes(mode)) invalid("Choose Text to vector or Vectorize image.");
  const images = body.images ?? [];
  if (!Array.isArray(images)) invalid("Vector image references must be an array.");
  if (mode === "vectorize" && images.length !== 1) invalid("Vectorize image needs exactly one connected image.");
  if (mode === "generate" && images.length > 5) invalid("Text to vector accepts up to five image references. Disconnect extra references before generating.");
  const normalizedImages = images.map(image => {
    if (!image || typeof image.url !== "string" || !/^\/(?:uploads|outputs|workflow-assets|saved_workflows)\//.test(image.url)) invalid("Connect a saved local image before generating a vector.");
    return { url: image.url, label: String(image.label || "Image") };
  });
  if (mode === "vectorize") {
    const vectorizeMode = body.vectorizeMode ?? "default";
    if (!["default", "simple"].includes(vectorizeMode)) invalid("Choose Standard or Simple conversion detail.");
    return { mode, vectorizeMode, images: normalizedImages };
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) invalid("Add a design brief before generating a vector.");
  if ([...prompt].length > 9500) invalid("The complete vector prompt, including design direction, lettering and palette, must be at most 9,500 characters.");
  const quality = body.quality ?? "medium", aspectRatio = body.aspectRatio ?? "1:1";
  if (!["low", "medium", "high"].includes(quality)) invalid("Choose Low, Medium or High vector quality.");
  if (!vectorAspectRatios.includes(aspectRatio)) invalid("Choose a supported vector aspect ratio.");
  const hasSeed = body.seed !== "" && body.seed != null;
  if (hasSeed && (!["number", "string"].includes(typeof body.seed) || !String(body.seed).trim() || !Number.isInteger(Number(body.seed)) || Number(body.seed) < 0 || Number(body.seed) > 2147483647)) invalid("Seed must be a whole number from 0 to 2147483647, or blank for random.");
  return { mode, prompt, quality, aspectRatio, images: normalizedImages, ...(hasSeed ? { seed: Number(body.seed) } : {}) };
}

export function buildVectorRequest(data, { prompt = data.prompt, images = [], moodBoards = [] } = {}) {
  const references = vectorReferences(data, images, moodBoards);
  const referenceDirection = data.vectorMode === "vectorize" ? "" : vectorReferenceInstructions(references);
  const design = vectorDesignPresets.find(p => p.value === data.designPreset)?.prompt || "";
  const composed = [String(prompt || "").trim(), design,
    data.lettering?.trim() ? `Include exactly this lettering: ${JSON.stringify(data.lettering.trim())}.` : "",
    data.palette?.trim() ? `Color direction: ${data.palette.trim()}.` : "", referenceDirection].filter(Boolean).join("\n\n");
  // A preset alone is not an authored brief. Vectorize deliberately ignores every text-only control.
  if (data.vectorMode !== "vectorize" && !String(prompt || "").trim()) invalid("Add a design brief before generating a vector.");
  return validateIdeogramVectorRequest({ mode: data.vectorMode, prompt: composed, images: references, quality: data.quality,
    aspectRatio: data.aspectRatio, seed: data.seed, vectorizeMode: data.vectorizeMode });
}

export function buildVectorBatchRequests(data, inputs) {
  const request = buildVectorRequest(data, inputs);
  return Array.from({ length: vectorBatchCount(data.batchCount) }, (_, index) => ({
    ...request, images: request.images.map(image => ({ ...image })),
    ...(request.seed != null ? { seed: (request.seed + index) % 2147483648 } : {})
  }));
}

export function ideogramVectorCost(options = {}, rates = ideogramVectorRates) {
  const references = options.referenceCount ?? options.images?.length ?? 0;
  const key = options.mode === "vectorize" ? "vectorize" : options.quality === "high" && references > 0 ? "highReference" : options.quality || "medium";
  const rate = rates[key];
  const count = vectorBatchCount(options.batchCount), quantity = count === 1 ? "One SVG" : `${count} SVGs`;
  const overridden = Number.isFinite(rate) && rate !== ideogramVectorRates[key];
  return { amountUsd: Number.isFinite(rate) && rate >= 0 ? rate * count : null, currency: "USD", estimated: true,
    pricingSource: overridden ? "local-configuration" : `https://fal.ai/models/ideogram/vector/${options.mode === "vectorize" ? "image-to-vector" : "text-to-vector"}`,
    pricingBasis: overridden ? `${quantity}; configured local estimate override. Account pricing may differ.` : `${quantity}; published Fal API estimate. Account pricing may differ.`,
    source: overridden ? "Configured estimate" : "Fal API estimate", checkedAt: "2026-10-26" };
}

export function appendVectorResult(data, item, { selectNew = true } = {}) {
  if (!item?.url || !item?.svgUrl) throw new Error("The vector request returned no saved SVG and PNG pair. Check History before generating again.");
  const current = normalizeVectorData(data);
  const existing = current.resultItems.findIndex(result => result.url === item.url || result.svgUrl === item.svgUrl);
  const { resultItems, firstNewIndex } = existing >= 0 ? { resultItems: current.resultItems, firstNewIndex: existing }
    : appendedNodeResultState(current.resultItems, [{ ...item, type: "image", label: item.label || `Vector ${current.resultItems.length + 1}` }], "image");
  const selectedResultIndex = selectNew || !current.resultItems.length ? firstNewIndex : current.selectedResultIndex;
  return { resultItems, selectedResultIndex, resultUrl: resultItems[selectedResultIndex]?.url || "", resultType: "image", status: "complete", vectorJob: null, error: "" };
}

export function removeVectorResult(data, url) {
  const current = normalizeVectorData(data);
  const index = current.resultItems.findIndex(item => item.url === url);
  if (index < 0) return null;
  const selectedUrl = current.resultItems[current.selectedResultIndex]?.url;
  const resultItems = current.resultItems.filter((_, position) => position !== index);
  const selectedResultIndex = selectedUrl === url ? Math.min(index, Math.max(0, resultItems.length - 1))
    : Math.max(0, resultItems.findIndex(item => item.url === selectedUrl));
  return { resultItems, selectedResultIndex, resultUrl: resultItems[selectedResultIndex]?.url || "",
    vectorLayerDrafts: current.vectorLayerDrafts.filter(draft => resultItems.some(item => item.svgUrl === draft.svgUrl)),
    ...(!resultItems.length && !current.vectorJob && current.status === "complete" ? { status: "idle" } : {}) };
}

export function appendVectorLayerResult(data, item, { sourceSvgUrl, operations, selectionOnly = false } = {}) {
  const current = normalizeVectorData(data), selected = current.resultItems[current.selectedResultIndex];
  const draft = current.vectorLayerDrafts.find(entry => entry.svgUrl === sourceSvgUrl);
  const unchanged = JSON.stringify(draft?.operations || []) === JSON.stringify(operations || []);
  const { resultItems, resultUrl, selectedResultIndex, resultType } = appendVectorResult(current, item, { selectNew: selected?.svgUrl === sourceSvgUrl && unchanged });
  return { resultItems, resultUrl, selectedResultIndex, resultType,
    vectorLayerDrafts: unchanged && !selectionOnly ? current.vectorLayerDrafts.filter(entry => entry.svgUrl !== sourceSvgUrl) : current.vectorLayerDrafts };
}

import { storyboardCameraChoices } from "./storyboardCinematography.js";
import { tagStoryboardReferences } from "./storyboardReferenceTags.js";

export const scriptPageWarning = 30;
export const scriptPageLimit = 50;
export const scriptDocumentPageLimit = 200;
export const scriptFileByteLimit = 40 * 1024 * 1024;

export function parseScriptPages(value, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > scriptDocumentPageLimit) throw new Error("Invalid PDF page count.");
  if (typeof value !== "string" || !value.trim() || value.length > 1500) throw new Error("Choose PDF pages, for example 3-8, 12.");
  const pages = new Set();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers or ranges, for example 3-8, 12.");
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > pageCount) throw new Error(`Choose pages between 1 and ${pageCount}.`);
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function scriptPagesLabel(pages = []) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b), groups = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    groups.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
  }
  return groups.join(", ");
}

export function validateScriptSelection(pages, pageCount, confirmed = false) {
  if (!Array.isArray(pages) || !pages.length || pages.some(page => !Number.isInteger(page) || page < 1 || page > pageCount) || new Set(pages).size !== pages.length) throw new Error("Choose valid, unique PDF pages.");
  if (pages.length > scriptPageLimit) throw new Error("This script exceeds the 50-page limit. Upload a shorter script or scene instead.");
  if (pages.length > scriptPageWarning && confirmed !== true) throw new Error("More than 30 script pages may take longer and cost more. Confirm this selection before planning.");
  return [...pages].sort((a, b) => a - b);
}

export function safeScriptUrl(url) {
  return typeof url === "string" && /^\/(uploads|workflow-assets)\/[^?#]+$/i.test(url) && !/%(?:2e|2f|5c)|\.\.|\\/i.test(url);
}

export function scriptImportBuildRequest(document, candidate, confirmed = false) {
  if (!candidate) throw new Error("Choose a script first.");
  const pages = validateScriptSelection(candidate.pages, document.pageCount, confirmed);
  return {
    url: document.url, digest: document.digest, pages,
    selection: `${candidate.title}${candidate.version ? ` (${candidate.version})` : ""}. All scenes in this script. ${candidate.summary}`,
    maxShots: 35, allowPaidAnalysis: true, confirmLongScript: confirmed === true,
    includeContext: false, contextPages: []
  };
}

const text = (maxLength = 2000) => ({ type: "string", maxLength });
const requiredText = (maxLength = 2000) => ({ ...text(maxLength), minLength: 1, pattern: "\\S" });
const list = (items, maxItems = 200, minItems = 0) => ({ type: "array", items, minItems, maxItems });
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const page = { type: "integer", minimum: 1, maximum: scriptDocumentPageLimit };
const pages = list(page, 200, 1);
export const scriptCatalogSchema = object({
  warnings: list(requiredText(600), 12),
  scripts: list(object({ title: requiredText(200), format: { type: "string", enum: ["Screenplay", "Broadcast / AV", "Brief", "Treatment script", "Other"] },
    version: text(160), duration: text(120), summary: requiredText(1200), excerpt: requiredText(1500), pages,
    contextPages: list(page, 10), scenes: list(object({ title: requiredText(200), summary: text(500), pages }), 60) }), 30)
});
export const scriptOcrSchema = object({ pages: list(object({ page, text: requiredText(18000), uncertain: { type: "boolean" } }), 6, 1) });
export const scriptShotsSchema = object({
  title: requiredText(200), summary: requiredText(3000), warnings: list(requiredText(800), 16), needsNarrowing: { type: "boolean" },
  shots: list(object({ number: { type: "integer", minimum: 1, maximum: 35 }, scene: requiredText(200), pages: list(page, 50, 1),
    description: requiredText(1400), dialogue: text(3000), voiceover: text(3000), onScreenText: text(1500), timing: text(200), productionNotes: text(1200),
    shot: { type: "string", enum: storyboardCameraChoices.shot },
    lens: { type: "string", enum: storyboardCameraChoices.lens },
    angle: { type: "string", enum: storyboardCameraChoices.angle }
  }), 35)
});

export function validateScriptCatalog(value, analyzedPages) {
  const allowed = new Set(analyzedPages);
  for (const script of value.scripts) {
    for (const numbers of [script.pages, script.contextPages, ...script.scenes.map(scene => scene.pages)]) {
      if (new Set(numbers).size !== numbers.length || numbers.some(page => !allowed.has(page))) throw new Error("Script detection returned invalid source pages. Select pages manually or analyze again.");
    }
    if (script.scenes.some(scene => scene.pages.some(page => !script.pages.includes(page)))) throw new Error("A detected scene falls outside its script.");
  }
  return value;
}

export function validateScriptShots(value, selectedPages, maxShots = 35) {
  if (value.needsNarrowing) {
    if (value.shots.length) throw new Error("A script requiring a smaller selection cannot also return partial shots.");
    return value;
  }
  if (!value.shots.length || value.shots.length > maxShots) throw new Error(`Choose a shorter scene selection; this import has room for ${maxShots} shots.`);
  value.shots.forEach((shot, index) => {
    if (shot.number !== index + 1 || new Set(shot.pages).size !== shot.pages.length || shot.pages.some(page => !selectedPages.includes(page))) throw new Error("The shot list has mismatched numbering or source pages. Existing shots were not changed.");
  });
  return value;
}

export function scriptImportFrames(draft, document, selection, createId) {
  return draft.shots.map((shot, index) => ({ id: createId(), number: index + 1, shotDescription: shot.description, shot: shot.shot, lens: shot.lens, angle: shot.angle,
    prompt: "", shotPlanSource: "", sourceScript: { url: document.url, fileName: document.fileName, title: draft.title, scene: shot.scene, pages: shot.pages,
      selection, dialogue: shot.dialogue, voiceover: shot.voiceover, onScreenText: shot.onScreenText, timing: shot.timing, productionNotes: shot.productionNotes } }));
}

export function mergeImportedScriptFrames(existing, imported, mode, confirmed) {
  if (!["append", "replace"].includes(mode)) throw new Error("Choose append or replace for the imported shots.");
  const hasWork = existing.some(frame => frame.shotDescription?.trim() || frame.prompt?.trim() || frame.resultUrl || frame.exportUrl || frame.versions?.length || frame.protected);
  if (mode === "replace" && existing.some(frame => frame.protected)) throw new Error("Unprotect existing shots before replacing the shot list, or append instead.");
  if (mode === "replace" && hasWork && confirmed !== true) throw new Error("Confirm replacement of the existing shot list first.");
  const frames = mode === "append" && hasWork ? [...existing, ...imported] : imported;
  if (!frames.length || frames.length > 35) throw new Error("A Storyboard can contain up to 35 shots. Import into a new Storyboard or select fewer scenes.");
  return frames.map((frame, index) => ({ ...frame, number: index + 1 }));
}

export function tagImportedScriptFrames(existing, merged, references) {
  const existingIds = new Set(existing.map(frame => frame.id));
  return merged.map(frame => existingIds.has(frame.id) ? frame : {
    ...frame, shotDescription: tagStoryboardReferences(frame.shotDescription ?? frame.prompt ?? "", references)
  });
}

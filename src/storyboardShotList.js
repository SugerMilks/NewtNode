import { storyboardFrameDirection } from "./storyboardWorkflow.js";
import { storyboardCameraChoices } from "./storyboardCinematography.js";

const cameraChoices = storyboardCameraChoices;
export const storyboardShotCameraChoices = cameraChoices;
export const storyboardShotListMode = data => data?.storyboardApproach === "Shot List";
export const storyboardShotDescription = frame => String(frame.shotDescription ?? frame.prompt ?? "");
export function storyboardShotRows(frames = []) {
  return frames.map((frame, index) => ({ id: frame.id, number: index + 1, description: storyboardShotDescription(frame),
    shot: frame.shot || "None", lens: frame.lens || "None", angle: frame.angle || "None",
    ...(frame.sourceScript ? { scriptContext: Object.fromEntries(["scene", "dialogue", "voiceover", "onScreenText", "timing", "productionNotes"].map(key => [key, String(frame.sourceScript[key] || "")])) } : {}) }));
}
export function validateStoryboardShots(shots) {
  if (!Array.isArray(shots) || !shots.length || shots.length > 35) throw new Error("Add between 1 and 35 shots.");
  const ids = new Set();
  for (const [index, row] of shots.entries()) {
    if (!row || typeof row.id !== "string" || !row.id.trim() || row.id.length > 160 || ids.has(row.id) || row.number !== index + 1) throw new Error("Shot rows need unique IDs and consecutive numbering.");
    ids.add(row.id);
    if (typeof row.description !== "string" || !row.description.trim() || row.description.length > 1400) throw new Error(`Add a description of up to 1,400 characters for shot ${index + 1}.`);
    for (const [key, choices] of Object.entries(cameraChoices)) if (!choices.includes(row[key])) throw new Error(`Choose a valid ${key} for shot ${index + 1}.`);
    if (row.scriptContext && (typeof row.scriptContext !== "object" || Object.values(row.scriptContext).some(value => typeof value !== "string" || value.length > 3000))) throw new Error("Imported script context is too long or invalid.");
  }
  return shots.map(({ id, number, description, shot, lens, angle, scriptContext }) => ({ id, number, description: description.trim(), shot, lens, angle, ...(scriptContext ? { scriptContext } : {}) }));
}
export function storyboardShotListError(frames) {
  try { validateStoryboardShots(storyboardShotRows(frames)); return ""; } catch (error) { return error.message; }
}
export function storyboardShotSource(frame) {
  return JSON.stringify({ description: storyboardShotDescription(frame).trim(), shot: frame.shot || "None", lens: frame.lens || "None", angle: frame.angle || "None" });
}
export function storyboardShotNeedsPlan(frame) {
  return !String(frame.prompt || "").trim() || (Object.hasOwn(frame, "shotDescription") && frame.shotPlanSource !== storyboardShotSource(frame));
}
export function storyboardShotGalleryPatch(frame, patch) {
  const next = { ...patch, shotDescription: patch.prompt ?? storyboardShotDescription(frame) };
  // Camera-only gallery edits cannot approve an unplanned description from Setup.
  return { ...next, shotPlanSource: Object.hasOwn(patch, "prompt") || !storyboardShotNeedsPlan(frame) ? storyboardShotSource({ ...frame, ...next }) : "" };
}
export function storyboardShotListContext(data, context = "") {
  if (!storyboardShotListMode(data)) return context;
  const rows = storyboardShotRows(data.storyboardFrames || []);
  return [context.trim(), ...rows.filter(row => row.description.trim()).map(row => `Shot ${row.number} (${row.shot}, ${row.lens}, ${row.angle}): ${row.description}`)].filter(Boolean).join("\n\n");
}
export function storyboardShotPlanIssues(frames, shots) {
  const issues = [];
  if (!Array.isArray(frames) || frames.length !== shots.length) return ["Return exactly one panel per authored shot."];
  for (const [index, row] of shots.entries()) {
    const frame = frames[index];
    if (frame.id !== row.id || frame.number !== row.number) issues.push(`Keep shot ${row.number}'s ID and ordering.`);
    if (frame.phase !== "single" || frames.some((other, i) => i !== index && other.shotId === frame.shotId)) issues.push(`Shot ${row.number} must remain one independent panel, not expanded keyframes.`);
    for (const key of Object.keys(cameraChoices)) if (row[key] !== "None" && frame[key] !== row[key]) issues.push(`Keep shot ${row.number}'s selected ${key}: ${row[key]}.`);
  }
  return issues;
}
export function mergeStoryboardShotPlan(originals, planned) {
  const rows = validateStoryboardShots(storyboardShotRows(originals));
  const issues = storyboardShotPlanIssues(planned, rows);
  if (issues.length) throw new Error(issues.join(" "));
  return planned.map((direction, index) => {
    const original = originals[index];
    // Planning changes directions, never the existing image, its versions or protection.
    const frame = { ...original, ...direction, shotDescription: storyboardShotDescription(original),
      resultUrl: original.resultUrl || "", exportUrl: original.exportUrl || "", resultFallbackUrl: original.resultFallbackUrl || "",
      fileName: original.fileName || "", resultVersion: original.resultVersion || 0, versions: original.versions || [], protected: original.protected === true,
      generatedDirection: original.generatedDirection || (original.resultUrl || original.exportUrl ? { ...storyboardFrameDirection(original), castSource: original.castSource, shotDescription: original.shotDescription, shotPlanSource: original.shotPlanSource } : undefined),
      qcPassed: null, qcReviewStatus: "unreviewed", qcWarning: "", qcSummary: "", qcIssues: [], status: original.resultUrl || original.exportUrl ? "complete" : "", error: "" };
    return { ...frame, shotPlanSource: storyboardShotSource(frame) };
  });
}

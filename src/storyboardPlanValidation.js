import { storyboardDirectorFramePlan } from "./storyboardShotExpansion.js";

export function storyboardPlanIssues(plan, directorShotList = "") {
  const frames = Array.isArray(plan?.frames) ? plan.frames : [];
  if (!frames.length || frames.length > 35) return ["Return between 1 and 35 complete storyboard frames."];
  const issues = [];
  if (frames.some((frame, index) => frame.number !== index + 1)) issues.push("Number all frames consecutively from 1.");
  if (frames.some((frame) => !String(frame.prompt || "").trim())) issues.push("Every frame needs a self-contained image prompt.");
  const prompts = frames.map((frame) => String(frame.prompt || "").replace(/\s+/g, " ").trim().toLowerCase());
  if (new Set(prompts).size !== prompts.length) issues.push("Duplicate frame prompts must be replaced with distinct required visual states.");
  const expected = storyboardDirectorFramePlan(directorShotList);
  if (!expected.cutCount) return issues;
  const counts = new Map();
  const order = [];
  for (const frame of frames) {
    const cut = Number(String(frame.notes || "").match(/^\s*CUT\s+(\d+)\b/i)?.[1]);
    if (!cut) { issues.push(`Frame ${frame.number} must identify its source CUT in notes.`); continue; }
    counts.set(cut, (counts.get(cut) || 0) + 1);
    if (order.at(-1) !== cut) order.push(cut);
  }
  if (JSON.stringify(order) !== JSON.stringify(expected.cuts.map((cut) => cut.number))) {
    issues.push("Preserve every Director CUT in its original order, with all keyframes of each CUT together and no invented CUTS.");
  }
  for (const cut of expected.cuts) {
    if ((counts.get(cut.number) || 0) < cut.frameCount) issues.push(`CUT ${cut.number} requires at least ${cut.frameCount} keyframes to show its visual progression.`);
  }
  return issues;
}

export function storyboardQcUnavailable(summary = "Storyboard QC could not run.") {
  return { pass: false, shouldRetry: false, severity: "unreviewed", summary, issues: [], correctionPrompt: "" };
}

export function requireStoryboardPlanResponse(response, data) {
  if (!response.ok || !Array.isArray(data?.plan?.frames) || !data.plan.frames.length) {
    throw new Error(data?.error || "Storyboard planning failed. Existing frames have been preserved.");
  }
  return data.plan;
}

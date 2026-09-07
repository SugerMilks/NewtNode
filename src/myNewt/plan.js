import { estimateImageRunCost, estimateVideoRunCost } from "../generationPricing.js";
import { snapshotAssetUrls } from "./contract.js";

export function normalizeMyNewtPlan(value = {}, provider = "fal") {
  if (!String(value.summary || "").trim()) throw new Error("A plan needs a short summary.");
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 30) throw new Error("A plan needs 1 to 30 steps.");
  if (!Array.isArray(value.deliverables) || !value.deliverables.length || value.deliverables.length > 30) throw new Error("Describe the expected deliverables before working.");
  const seen = new Set();
  const steps = value.steps.map((step, index) => {
    const id = String(step.id || `step-${index + 1}`).slice(0, 80);
    if (seen.has(id) || !String(step.title || "").trim()) throw new Error("Plan steps need unique IDs and titles.");
    seen.add(id);
    return { id, title: String(step.title).slice(0, 240), status: "pending" };
  });
  const deliverables = value.deliverables.map((item) => {
    if (!["image", "video", "text", "workflow", "answer"].includes(item.kind)) throw new Error("Choose image, video, text, workflow, or answer deliverables.");
    const settings = Object.fromEntries(Object.entries(item.settings || {}).filter(([key, val]) => ["resolution", "aspectRatio", "duration", "model"].includes(key) && ["string", "number"].includes(typeof val)));
    return { kind: item.kind, label: String(item.label || item.kind).slice(0, 240), nodeId: String(item.nodeId || ""), nodeTitle: String(item.nodeTitle || "").slice(0, 160), count: Math.max(1, Math.min(100, Math.round(Number(item.count) || 1))), fresh: item.fresh !== false, settings, referenceIds: Array.isArray(item.referenceIds) ? item.referenceIds.filter((id) => typeof id === "string").slice(0, 60) : [] };
  });
  const runs = (Array.isArray(value.runs) ? value.runs : []).slice(0, 60).map((run) => {
    const settings = { ...run, provider };
    const amount = run.kind === "image" ? estimateImageRunCost(settings) : run.kind === "video" && !/auto/i.test(String(run.duration)) ? estimateVideoRunCost(settings) : null;
    return { kind: run.kind, model: String(run.model || ""), count: Math.max(1, Math.min(100, Number(run.batchCount) || 1)), estimatedCost: amount };
  });
  return { summary: String(value.summary).slice(0, 2000), steps, deliverables, runs, estimatedGenerationCost: runs.some((run) => run.estimatedCost == null) ? null : runs.reduce((sum, run) => sum + run.estimatedCost, 0), approved: false };
}

export function myNewtOutputItems(node) {
  const d = node.data || {};
  const items = [
    ...(Array.isArray(d.resultItems) ? d.resultItems : []),
    ...(Array.isArray(d.storyboardFrames) ? d.storyboardFrames.filter((frame) => frame.status !== "error").map((frame) => ({ ...frame, type: "image" })) : []),
    ...(d.resultUrl ? [{ url: d.resultUrl, type: node.type === "videoModel" ? "video" : "image" }] : [])
  ];
  const seen = new Set();
  return items.flatMap((item) => {
    const url = item.localUrl || item.resultUrl || item.url || item.image?.localUrl || item.generated?.localUrl;
    if (!url || seen.has(url) || /thumbnail/i.test(url)) return [];
    seen.add(url); return [{ url, type: item.type || "image", label: item.label || d.title || node.type, nodeId: node.id }];
  });
}

export function verifyMyNewtPlan(snapshot, plan, { baselineUrls = [], message = "" } = {}) {
  const problems = [], outputs = [], baseline = new Set(baselineUrls);
  if (!plan?.approved) return { ok: false, problems: ["The current plan has not been approved."], outputs };
  for (const item of plan.deliverables) {
    if (item.kind === "answer") { if (!message.trim()) problems.push(`Missing answer: ${item.label}`); continue; }
    const candidates = snapshot.nodes.filter((node) => node.type !== "myNewt" && (!item.nodeId || node.id === item.nodeId) && (!item.nodeTitle || node.data?.title === item.nodeTitle));
    let count = 0;
    for (const node of candidates) {
      const data = node.data || {};
      if (["running", "planning", "compiling", "uploading", "error"].includes(data.status) || data.error) continue;
      if (Object.entries(item.settings).some(([key, value]) => String(data[key] ?? "") !== String(value))) continue;
      const ancestors = new Set([node.id]);
      let size = -1;
      while (size !== ancestors.size) { size = ancestors.size; for (const edge of snapshot.edges) if (ancestors.has(edge.to.nodeId)) ancestors.add(edge.from.nodeId); }
      if (item.referenceIds.some((id) => !ancestors.has(id))) continue;
      if (item.kind === "workflow") { count++; outputs.push({ nodeId: node.id, label: data.title || node.type, type: "workflow" }); }
      else if (item.kind === "text") { if (String(data.resultText || data.text || "").trim()) { count++; outputs.push({ nodeId: node.id, label: data.title || node.type, type: "text" }); } }
      else {
        const media = myNewtOutputItems(node).filter((output) => output.type === item.kind && (!item.fresh || !baseline.has(output.url)));
        count += media.length; outputs.push(...media);
      }
    }
    if (count < item.count) problems.push(`${item.label}: expected ${item.count} ${item.kind} deliverable(s), found ${count} matching completed output(s).`);
  }
  return { ok: !problems.length, problems, outputs: outputs.filter((item, index, all) => all.findIndex((other) => other.nodeId === item.nodeId && other.url === item.url) === index) };
}

export function myNewtBaselineUrls(snapshot) { return [...snapshotAssetUrls(snapshot)]; }

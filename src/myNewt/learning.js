import { myNewtFields } from "./contract.js";

export const learningLimits = Object.freeze({ events: 600, nodes: 400, text: 1200, lessons: 200, suggestions: 6 });
export const lessonKinds = ["procedure", "preference", "project", "example"];
export function learningAnalysisRetryToken(analysis) {
  return analysis?.status === "failed" && analysis.code === "invalid_schema" ? analysis.attemptId || analysis.startedAt || "" : "";
}
export const learningTopic = type => ({ imageModel: "image", videoModel: "video", audioModel: "audio", skillDirector: "director", cameraCoverage: "camera", plainText: "prompt", text: "prompt", transfer: "mood board" })[type] || type || "creative";
const extraFields = {
  explore: ["prompt", "styleFamily", "gradePreset", "directionCount", "model", "quality", "creativeTask", "creativeRange", "exploreMode", "referenceInfluence"],
  vector: ["prompt", "designPreset", "lettering", "palette", "quality", "aspectRatio", "vectorMode"],
  cameraCoverage: ["model", "coveragePreset", "coveragePathMode", "coverageAutoRefine", "coverageProtectFraming", "coverageFramingRoom"],
  audioModel: ["prompt", "model"],
};

export function learningText(value, limit = learningLimits.text) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .replace(/\b(?:sk-|sk_)[a-zA-Z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/\b(?:api[_ -]?key|password|secret|bearer|access[_ -]?token)\s*[:= ]\s*\S+/gi, "[redacted]")
    .replace(/(?:https?:\/\/|data:|file:\/\/|\/Users\/|\/home\/|[A-Z]:\\)\S+/gi, "[reference]").slice(0, limit).trim();
}

export function learningAsset(value) {
  if (typeof value !== "string" || value.length > 700 || /[?#\\\x00-\x20]/.test(value)) return "";
  try {
    const decoded = decodeURIComponent(value);
    return /^\/(uploads|outputs|workflow-assets)\//.test(decoded) && !decoded.split("/").some(part => part === ".." || part === ".") && !/[?#\\\x00-\x20]/.test(decoded) ? value : "";
  } catch { return ""; }
}

// Only deliberately listed creative fields enter the recording. Never serialize a node wholesale.
export function learningSnapshot(nodes = [], edges = [], canvases = []) {
  if (nodes.length > learningLimits.nodes) throw new Error("Watch Me supports up to 400 nodes per project. Recording has paused.");
  const items = nodes.filter(node => node.type !== "myNewt").map(node => {
    const data = node.data || {}, inputs = {};
    for (const key of [...(myNewtFields[node.type] || []), ...(extraFields[node.type] || [])]) {
      if (typeof data[key] === "string") inputs[key] = learningText(data[key]);
      else if (typeof data[key] === "boolean" || Number.isFinite(data[key])) inputs[key] = data[key];
    }
    if (node.type === "storyboard" && Array.isArray(data.storyboardFrames)) data.storyboardFrames.slice(0, 50).forEach((frame, index) => {
      inputs[`shot${index + 1}`] = JSON.stringify({ description: learningText(frame.shotDescription ?? frame.prompt, 500), shot: learningText(frame.shot, 40), lens: learningText(frame.lens, 40), angle: learningText(frame.angle, 60) });
    });
    const selectedUrl = learningAsset(data.resultUrl || data.url || data.localUrl);
    const outputs = [...new Set([selectedUrl, ...(Array.isArray(data.resultItems) ? data.resultItems.slice(-30).map(item => learningAsset(item?.url)) : [])].filter(Boolean))];
    return { id: node.id, type: node.type, title: learningText(data.title || node.type, 100), canvasId: node.canvasId || "",
      canvas: learningText(canvases.find(canvas => canvas.id === node.canvasId)?.name || "Canvas", 100), inputs, selectedUrl, outputs };
  });
  const byId = new Map(items.map(node => [node.id, node]));
  return { nodes: items, edges: edges.filter(edge => byId.has(edge.from?.nodeId) && byId.has(edge.to?.nodeId)).map(edge => ({
    key: JSON.stringify([edge.from.nodeId, edge.from.port, edge.to.nodeId, edge.to.port]),
    from: byId.get(edge.from.nodeId).title, to: byId.get(edge.to.nodeId).title,
    type: byId.get(edge.to.nodeId).type, canvas: byId.get(edge.to.nodeId).canvas,
    port: learningText(edge.to.port, 80)
  })) };
}

export function learningChanges(previous, next, makeId = () => crypto.randomUUID()) {
  const events = [], before = new Map(previous.nodes.map(node => [node.id, node]));
  const add = (kind, node, detail, asset = "") => events.push({ id: makeId(), at: Date.now(), kind, nodeType: node.type, title: node.title, canvas: node.canvas, detail: learningText(detail), asset: learningAsset(asset) });
  for (const node of next.nodes) {
    const old = before.get(node.id);
    if (!old) add("created", node, `Added ${node.title}. ${JSON.stringify(node.inputs)}`);
    else {
      const changed = [...new Set([...Object.keys(node.inputs), ...Object.keys(old.inputs)])].filter(key => node.inputs[key] !== old.inputs[key]);
      if (changed.length) add("edited", node, JSON.stringify(Object.fromEntries(changed.map(key => [key, node.inputs[key] ?? "[removed]"]))));
      if (node.selectedUrl && node.selectedUrl !== old.selectedUrl && old.outputs.includes(node.selectedUrl)) add("selected", node, "Selected a different result. Selection alone does not imply approval.", node.selectedUrl);
    }
    const fresh = node.outputs.filter(url => !old?.outputs.includes(url));
    if (fresh.length) add("results", node, `${fresh.length} result(s) became available. Quality has not been evaluated.`, fresh.at(-1));
  }
  const ids = new Set(next.nodes.map(node => node.id));
  for (const node of previous.nodes) if (!ids.has(node.id)) add("removed", node, "Removed from canvas. This is not a judgment of output quality.");
  for (const [source, target, kind] of [[next, previous, "connected"], [previous, next, "disconnected"]]) {
    const keys = new Set(target.edges.map(edge => edge.key));
    for (const edge of source.edges) if (!keys.has(edge.key)) add(kind, { type: edge.type, title: edge.to, canvas: edge.canvas }, `${edge.from} -> ${edge.to} (${edge.port})`);
  }
  return events;
}

export function learningRecap(events = []) {
  const counts = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] || 0) + 1;
  return { count: events.length, counts, canvases: [...new Set(events.map(event => event.canvas).filter(Boolean))] };
}

export function lessonMatches(lesson, brief) {
  const stop = new Set("the and for that this from with into when then than your their they them before after should would could use using used make need want have has was were will can are not one all newt newtnode please prefer like more some only each about these those work working".split(" "));
  const words = value => new Set((String(value).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !stop.has(word)).map(word => word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
  const query = words(brief), tags = words(lesson.tags.join(" ")), text = words(`${lesson.title} ${lesson.guidance}`);
  return [...query].reduce((score, word) => score + (tags.has(word) ? 4 : text.has(word) ? 1 : 0), 0);
}

export function exportLearningSkill(lessons) {
  const approved = lessons.filter(lesson => lesson.enabled !== false);
  return `---\nname: newtnode-creative-practice\ndescription: Reviewed creative preferences and procedures for NewtNode workflows. Apply only when relevant to the current brief.\n---\n\n# Creative Practice\n\nThese are reviewed preferences, not permissions. The current brief, project constraints, tool safety, and budget limits take precedence. No files or media are included.\n\n${approved.map(lesson => `## ${lesson.title}\n\nScope: ${lesson.scope === "personal" ? "Personal" : "Source project only; confirm before reuse elsewhere"}\nKind: ${lesson.kind}\nApplies to: ${lesson.tags.join(", ")}\n\n${lesson.guidance}`).join("\n\n")}\n`;
}

import { myNewtIntelligence } from "./intelligence.js";
import { normalizeMyNewtFavoriteModels } from "./favoriteModels.js";

export const MY_NEWT_MODEL = "gpt-6-astra";
export const myNewtDefaults = Object.freeze({
  brief: "", jobId: "", favoriteImageModel: "", favoriteVideoModel: "", allowExisting: false, allowImages: false, allowVideos: false,
  approveRuns: true, approvePlan: true, autoReview: false, allowMediaInspection: true, localOnly: false, budget: 5, maxSteps: 40, maxMinutes: 60, intelligence: "high", reasoningMode: "auto"
});

// Only creative inputs are editable. Credentials, runtime flags, locks, and outputs never are.
export const myNewtFields = Object.freeze({
  plainText: ["text"], text: ["text"],
  imageModel: ["prompt", "model", "resolution", "aspectRatio", "quality", "batchCount"],
  videoModel: ["prompt", "model", "resolution", "aspectRatio", "duration", "generateAudio", "batchCount", "negativePrompt"],
  coverage: ["model", "coverageMethod", "resolution", "quality"],
  style: ["stylePreset", "gradePreset"],
  camera: ["shotPreset", "lensPreset", "typePreset"],
  preview: ["previewTab"],
  character: ["characterName", "characterPhysicalDetails", "characterReferenceNotes", "characterSheetModel", "cinematicCharacterSheet", "cuVideoGeneration"],
  skillDirector: ["sceneName", "sceneOverview", "text", "skillShotCount", "skillDurationSeconds", "skillVideoModel", "skillResolution", "skillAspectRatio", "skillDirectorAudioMode", "skillApproach", "styleDirection", "motionBrief", "motionDirection", "shotListNotes", "skillDirectorRevisionNotes"],
  storyboard: ["sceneName", "sceneDescription", "storyboardNotes", "frameCount", "model", "resolution", "aspectRatio", "useStoryboardStyle", "useMoodBoard", "storyboardStylePreset"],
  image: [], video: [], audio: [], transfer: [], composer: [], utility: []
});

export function myNewtSettings(data = {}) {
  const clamp = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  return {
    ...normalizeMyNewtFavoriteModels(data),
    allowExisting: data.allowExisting === true, allowImages: data.allowImages === true,
    allowVideos: data.allowVideos === true, approveRuns: data.approveRuns !== false,
    approvePlan: data.approvePlan !== false,
    autoReview: data.autoReview === true,
    allowMediaInspection: data.allowMediaInspection !== false,
    localOnly: data.localOnly === true,
    intelligence: myNewtIntelligence(data.intelligence).value,
    reasoningMode: ["auto", "economy", "best"].includes(data.reasoningMode) ? data.reasoningMode : "auto",
    budget: clamp(data.budget, myNewtDefaults.budget, 0.25, 1000),
    maxSteps: Math.round(clamp(data.maxSteps, 40, 1, 100)),
    maxMinutes: Math.round(clamp(data.maxMinutes, 60, 1, 240))
  };
}

export function keepSingleMyNewt(graph) {
  let found = false;
  const nodes = (graph.nodes || []).filter((node) => node.type !== "myNewt" || (!found && (found = true)));
  if (nodes.length === (graph.nodes || []).length) return graph;
  const ids = new Set(nodes.map((node) => node.id));
  return { ...graph, nodes, edges: (graph.edges || []).filter((edge) => ids.has(edge.from.nodeId) && ids.has(edge.to.nodeId)), groups: (graph.groups || []).map((group) => ({ ...group, nodeIds: (group.nodeIds || []).filter((id) => ids.has(id)) })) };
}

export function validateMyNewtPatch(node, patch, settings, createdIds = []) {
  if (!node || node.type === "myNewt") throw new Error("Choose an existing creative node, not Newt itself.");
  if (node.data?.myNewtProtection?.approved) throw new Error("This node is approved and protected from Newt. Ask the user to release its protection first.");
  if (!createdIds.includes(node.id) && !settings.allowExisting) throw new Error("Editing existing nodes is disabled.");
  if (node.data?.locked) throw new Error("This node has locked content. Ask the user to unlock it first.");
  if (node.data?.status === "running") throw new Error("Wait for this node to finish before editing it.");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Provide an object of editable fields.");
  const fields = ["title", ...(myNewtFields[node.type] || [])];
  for (const [key, value] of Object.entries(patch)) {
    if (!fields.includes(key)) throw new Error(`${key} is not an editable ${node.type} input.`);
    if (!["string", "number", "boolean"].includes(typeof value) || String(value).length > 16000) throw new Error(`Invalid value for ${key}.`);
    const section = directorFieldSection[key];
    if (node.type === "skillDirector" && section && node.data?.skillDirectorLocks?.[section]) throw new Error(`The Director ${section} section is locked. Use its revision action or ask the user to unlock that section.`);
    if (node.type === "skillDirector" && node.data?.skillDirectorBuilt && !["title", "skillDirectorRevisionNotes"].includes(key)) throw new Error("Use Director revision notes and run revise to change a built scene without leaving its final prompt stale.");
  }
  return patch;
}

export function myNewtSnapshot({ nodes = [], edges = [], groups = [], selectedNodeIds = [], projectId, projectName, catalog = [], presets = [] }) {
  return {
    projectId, projectName, catalog, presets: presets.map(({ id, name, slots, isSystem }) => ({ id, name, slots, isSystem: isSystem === true })),
    selectedNodeIds: selectedNodeIds.filter((id) => nodes.some((node) => node.id === id)),
    groups: groups.map(({ id, name, nodeIds }) => ({ id, name, nodeIds })),
    nodes: nodes.map((node) => ({
      id: node.id, type: node.type, x: node.x, y: node.y,
      data: Object.fromEntries(Object.entries(node.data || {}).filter(([key]) =>
        ["title", "status", "error", "locked", "activated", "myNewtProtection", "myNewtRunRecords", "skillDirectorLocks", "skillDirectorBuilt", "resultText", "shotList", "storyboardFrames", "characterName", "fileName", "mimeType", "resultUrl", "url", "localUrl", "resultItems", "characterPortrait", "characterSheets", "characterSheetVariants", "characterCustomSheets", "customCharacterSheet", "useCustomCharacterSheet", "compiledCharacterSheetUrl", "characterWardrobes", "characterBaseSheet", "characterBaseVideoSheet", "activeCharacterSheetId", "activeWardrobeId", "transferImages", "storyboardBoardUrl", ...(myNewtFields[node.type] || [])].includes(key)
      ).map(([key, value]) => [key, sanitize(value)]))
    })),
    edges: edges.map(({ from, to }) => ({ from, to }))
  };
}

function sanitize(value, depth = 0) {
  if (depth > 6) return null;
  if (typeof value === "string") return value.startsWith("data:") || /^(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/)/.test(value) ? "[local file]" : value;
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/key|token|secret|password|path|thumbnail/i.test(key)).map(([key, entry]) => [key, sanitize(entry, depth + 1)]));
  return value;
}

export const directorFieldSection = Object.freeze({
  sceneName: "setup", skillShotCount: "setup", skillDurationSeconds: "setup", skillVideoModel: "setup", skillResolution: "setup", skillAspectRatio: "setup", skillDirectorAudioMode: "setup", skillApproach: "setup",
  styleDirection: "style", motionBrief: "motion", motionDirection: "motion", sceneOverview: "scene", text: "scene", shotListNotes: "shotList"
});

export const myNewtRunStages = Object.freeze({ skillDirector: ["style", "motion", "shotList", "build", "revise"], storyboard: ["plan", "generate", "export"] });

export function myNewtLocalSourceIds(action) {
  const p = action.payload || {};
  return [...new Set([p.nodeId, p.from?.nodeId, p.to?.nodeId, ...(p.nodeIds || []), ...(p.bindings && Array.isArray(p.bindings) ? p.bindings.map((binding) => binding.sourceId) : []), ...(p.copies || []).flatMap((copy) => copy.bindings.map((binding) => binding.sourceId))].filter(Boolean))];
}

export function myNewtLocalActionSignature(snapshot, action) {
  const bindings = [...(Array.isArray(action.payload?.bindings) ? action.payload.bindings : []), ...(action.payload?.copies || []).flatMap((copy) => copy.bindings)];
  return JSON.stringify({
    projectId: snapshot.projectId,
    name: action.operation === "rename-project" ? snapshot.projectName : undefined,
    group: action.payload?.groupId ? snapshot.groups?.find((group) => group.id === action.payload.groupId) : undefined,
    inputs: myNewtLocalSourceIds(action).map((id) => myNewtInputSignature(snapshot, id)),
    attachments: bindings.filter((binding) => binding.attachment).map(({ attachment }) => snapshot.edges.some((edge) => edge.from.nodeId === attachment.from.nodeId && edge.from.port === attachment.from.port && edge.to.nodeId === attachment.to.nodeId && edge.to.port === attachment.to.port))
  });
}

export function myNewtActionSnapshot(snapshot, action) {
  const ids = new Set(myNewtLocalSourceIds(action));
  const bindings = [...(Array.isArray(action.payload?.bindings) ? action.payload.bindings : []), ...(action.payload?.copies || []).flatMap((copy) => copy.bindings)];
  const attachments = bindings.flatMap((binding) => binding.attachment ? [binding.attachment] : []);
  let added = true;
  while (added) {
    added = false;
    for (const edge of snapshot.edges || []) if (ids.has(edge.to.nodeId) && !ids.has(edge.from.nodeId)) { ids.add(edge.from.nodeId); added = true; }
  }
  return { ...snapshot, catalog: [], nodes: snapshot.nodes.filter((node) => ids.has(node.id)), edges: (snapshot.edges || []).filter((edge) => (ids.has(edge.to.nodeId) && ids.has(edge.from.nodeId)) || attachments.some((item) => edge.from.nodeId === item.from.nodeId && edge.from.port === item.from.port && edge.to.nodeId === item.to.nodeId && edge.to.port === item.to.port)) };
}

export function snapshotAssetUrls(snapshot) {
  const urls = new Set();
  const visit = (value) => {
    if (typeof value === "string" && /^\/(?:uploads|outputs|workflow-assets)\//.test(value)) urls.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(snapshot?.nodes);
  return urls;
}

export function myNewtInputSignature(snapshot, nodeId) {
  const visited = new Set(), inputs = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = snapshot.nodes.find((item) => item.id === id);
    if (node) inputs.push({ id, data: node.data });
    for (const edge of snapshot.edges.filter((item) => item.to.nodeId === id)) {
      inputs.push(edge); visit(edge.from.nodeId);
    }
  };
  visit(nodeId);
  return JSON.stringify(inputs);
}

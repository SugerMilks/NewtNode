import { myNewtSettings, validateMyNewtPatch } from "./contract.js";
import { myNewtBackgroundCommand } from "./localCommands.js";
import { newtPresetDisplayName } from "./presets.js";
import { assertMyNewtProtection, myNewtProtectionCommand } from "./workProtection.js";

export const myNewtLocalWorkflows = Object.freeze([
  { id: "image", label: "Image workflow", types: ["plainText", "imageModel", "preview"], inputs: ["promptIn", "sourceIn"] },
  { id: "video", label: "Video workflow", types: ["plainText", "videoModel", "preview"], inputs: ["promptIn", "sourceIn"] },
  { id: "coverage", label: "Coverage workflow", types: ["image", "coverage", "preview"], inputs: ["imageIn", "sourceIn"] },
  { id: "director", label: "Director workflow", types: ["skillDirector", "videoModel", "preview"], inputs: ["directorIn", "sourceIn"] },
  { id: "storyboard", label: "Storyboard workflow", types: ["plainText", "storyboard", "preview"], inputs: ["sceneDescriptionIn", "sourceIn"] },
  { id: "image-edit", label: "Image edit workflow", types: ["imageModel", "preview"], inputs: ["sourceIn"] },
  { id: "music-video", label: "Music video workflow", types: ["skillDirector", "videoModel", "preview"], inputs: ["directorIn", "sourceIn"] },
  { id: "director-storyboard", label: "Director storyboard workflow", types: ["skillDirector", "storyboard", "preview"], inputs: ["directorIn", "sourceIn"] },
  { id: "asset-preview", label: "Asset preview workflow", types: ["preview"], inputs: [] }
]);

const fieldNames = {
  model: "model", audio: "generateAudio", "aspect ratio": "aspectRatio", resolution: "resolution", duration: "duration", quality: "quality",
  "batch count": "batchCount", "preview tab": "previewTab", method: "coverageMethod",
  style: "stylePreset", grade: "gradePreset", lens: "lensPreset", shot: "shotPreset", angle: "typePreset"
};
const normalized = (value) => String(value || "").trim().toLowerCase();
const blocked = (error) => ({ route: "blocked", error });
const local = (summary, operation, payload) => ({ route: "local", summary, action: { operation, payload } });
const unique = (items, name, label) => {
  const matches = items.filter((item) => normalized(item.name || item.data?.title) === normalized(name) || (label === "preset" && normalized(newtPresetDisplayName(item)) === normalized(name)));
  if (matches.length !== 1) throw new Error(matches.length ? `More than one ${label} is named "${name}". Use a unique name.` : `No ${label} named "${name}" was found.`);
  return matches[0];
};

// Full-command matching only: never partially execute a creative or multi-action brief.
export function myNewtLocalAction(brief, snapshot = {}, settings = {}, createdIds = []) {
  const text = String(brief || "").trim().replace(/[\u201c\u201d]/g, '"').replace(/^(?:(?:can|could|would) you )?(?:please )?/i, "").replace(/[.!]$/, "");
  const catalog = snapshot.catalog || [], nodes = snapshot.nodes || [];
  const permissions = myNewtSettings(settings);
  try {
    const protection = myNewtProtectionCommand(text, snapshot);
    if (protection) return protection;
    const background = myNewtBackgroundCommand(text, snapshot, myNewtLocalWorkflows);
    if (background) return background;
    let match = text.match(/^(?:set up|setup|build|create|add|insert) (?:an? |the )?(image edit|music video|director storyboard|asset preview|image|video|coverage|director|storyboard) workflow$/i);
    if (match) {
      const workflow = myNewtLocalWorkflows.find((item) => item.id === normalized(match[1]).replace(/ /g, "-"));
      if (workflow.id === "music-video") throw new Error("Attach a music track and ask to set up a Music Video workflow using attached assets.");
      if (workflow.types.some((type) => !catalog.some((entry) => entry.type === type))) throw new Error("This workflow is unavailable in the current node catalog.");
      return local(`Set up ${workflow.label}: ${workflow.types.map((type) => catalog.find((entry) => entry.type === type).label).join(" > ")}. No generation.`, "workflow", { workflowId: workflow.id });
    }
    match = text.match(/^(?:insert|apply|load|use) (?:the )?(?:saved )?preset "([^"\n]+)"$/i);
    if (match) {
      const preset = unique(snapshot.presets || [], match[1], "preset");
      return local(`Insert preset "${preset.name}" with its saved assets and settings. No generation.`, "preset", { presetId: preset.id, bindings: {} });
    }
    match = text.match(/^(?:add|create) (?:an? )?([a-z ]+?) node$/i);
    if (match) {
      const entry = unique(catalog.filter((item) => item.type !== "myNewt").map((item) => ({ ...item, name: item.label })), match[1], "node type");
      return local(`Add ${entry.label}. No generation.`, "create", { type: entry.type });
    }
    match = text.match(/^rename "([^"\n]+)" to "([^"\n]+)"$/i);
    if (match) {
      const node = unique(nodes, match[1], "node");
      const patch = { title: match[2].trim() };
      if (!patch.title || patch.title.length > 160) throw new Error("Use a node name between 1 and 160 characters.");
      validateLocalUpdate(node, patch, snapshot, permissions, createdIds);
      return local(`Rename "${node.data.title}" to "${patch.title}".`, "update", { nodeId: node.id, patch });
    }
    match = text.match(/^connect "([^"\n]+)" to "([^"\n]+)"$/i);
    if (match) {
      const source = unique(nodes, match[1], "node"), target = unique(nodes, match[2], "node");
      if (target.type !== "preview" || !["image", "video", "imageModel", "videoModel", "coverage", "storyboard", "composer"].includes(source.type)) throw new Error("Local connections support an image, video, or image-producing node connected to a Preview. Use an AI task for other wiring.");
      validateLocalUpdate(target, {}, snapshot, permissions, createdIds);
      const port = catalog.find((entry) => entry.type === source.type)?.ports.output[0]?.id;
      if (!port) throw new Error("The source output is unavailable.");
      return local(`Connect "${source.data.title}" to "${target.data.title}". No generation.`, "connect", { from: { nodeId: source.id, port }, to: { nodeId: target.id, port: "sourceIn" } });
    }
    match = text.match(/^set "([^"\n]+)" (text|prompt|negative prompt|scene name|character name) to "([^"\n]*)"$/i);
    if (match) {
      const node = unique(nodes, match[1], "node");
      const key = ({ text: "text", prompt: "prompt", "negative prompt": "negativePrompt", "scene name": "sceneName", "character name": "characterName" })[normalized(match[2])];
      const patch = { [key]: match[3] };
      validateLocalUpdate(node, patch, snapshot, permissions, createdIds);
      return local(`Update "${node.data.title}" ${match[2].toLowerCase()} exactly as provided. No generation.`, "update", { nodeId: node.id, patch });
    }
    match = text.match(/^set "([^"\n]+)" (model|audio|aspect ratio|resolution|duration|quality|batch count|preview tab|method|style|grade|lens|shot|angle) to (?:"([^"\n]+)"|([^"\n]+))$/i);
    if (match) {
      const node = unique(nodes, match[1], "node"), field = fieldNames[normalized(match[2])];
      const entry = catalog.find((item) => item.type === node.type);
      const options = field === "generateAudio" && node.type === "videoModel" ? [true, false] : entry?.modelControls?.[node.data?.model]?.[field] || entry?.options?.[field];
      if (!options?.length) throw new Error(`That ${match[2]} is not available as a local setting for this node.`);
      let wanted = normalized(match[3] || match[4]);
      if (field === "generateAudio") wanted = ({ on: "true", off: "false" })[wanted] || wanted;
      const value = options.find((option) => String(option).toLowerCase() === wanted || (field === "duration" && normalized(option).replace(/s$/, "") === wanted.replace(/\s*(?:s|seconds?)$/, "")));
      if (value === undefined) throw new Error(`Choose a supported ${match[2]}: ${options.join(", ")}.`);
      const patch = { [field]: value };
      validateLocalUpdate(node, patch, snapshot, permissions, createdIds);
      return local(`Set "${node.data.title}" ${match[2].toLowerCase()} to ${value}. No generation.`, "update", { nodeId: node.id, patch });
    }
    return permissions.localOnly ? blocked("No exact local shortcut matched. Rephrase as a single setup or project command, or turn off Local actions only for creative AI tasks.") : { route: "ai" };
  } catch (error) { return blocked(error.message); }
}

export function validateLocalUpdate(node, patch, snapshot, settings, createdIds = []) {
  assertMyNewtProtection(snapshot, { operation: "update", payload: { nodeId: node.id, patch } });
  validateMyNewtPatch(node, patch, settings, createdIds);
  if (["running", "planning", "compiling", "uploading", "generating"].includes(node.data?.status)) throw new Error("Wait for this node to finish before editing it.");
  if (node.type === "videoModel" && Object.keys(patch).some((key) => key !== "title") && snapshot.edges?.some((edge) => edge.to.nodeId === node.id && edge.to.port === "directorIn")) throw new Error("This Video Model is controlled by a Director. Change the setting in the Director instead.");
}

export function localWorkflowShape(id, bindings = []) {
  const workflow = myNewtLocalWorkflows.find((item) => item.id === id);
  return id === "coverage" && bindings.length ? { ...workflow, types: ["coverage", "preview"], inputs: ["sourceIn"] } : workflow;
}

export function buildMyNewtLocalWorkflow(id, { catalog, createData, nodeWidth, bindings = [], sourceNodes = [], copies }) {
  if (copies) {
    if (!copies.length || copies.length > 10) throw new Error("Choose up to 10 workflow copies.");
    const combined = { nodes: [], edges: [], groups: [], externalEdges: [] }; let x = 0;
    copies.forEach((copy, index) => {
      const graph = buildMyNewtLocalWorkflow(id, { catalog, createData, nodeWidth, bindings: copy.bindings, sourceNodes: [...sourceNodes, ...combined.nodes] });
      const remap = (value) => `copy-${index}-${value}`;
      combined.nodes.push(...graph.nodes.map((node) => ({ ...node, id: remap(node.id), x: node.x + x })));
      combined.edges.push(...graph.edges.map((edge) => ({ ...edge, from: { ...edge.from, nodeId: remap(edge.from.nodeId) }, to: { ...edge.to, nodeId: remap(edge.to.nodeId) } })));
      combined.externalEdges.push(...graph.externalEdges.map((edge) => ({ ...edge, to: { ...edge.to, nodeId: remap(edge.to.nodeId) } })));
      x += Math.max(...graph.nodes.map((node) => node.x + nodeWidth(node))) + 150;
    });
    return combined;
  }
  const workflow = localWorkflowShape(id, bindings);
  if (!workflow) throw new Error("Unknown local workflow.");
  const usedNames = new Set(sourceNodes.map((node) => normalized(node.data?.title)));
  let x = 0;
  const nodes = workflow.types.map((type, index) => {
    const entry = catalog.find((item) => item.type === type);
    if (!entry) throw new Error("A required node type is unavailable.");
    const node = { id: `local-${index}`, type, x, y: 0, data: createData(type, entry.label), };
    const name = node.data.title || entry.label; let suffix = 2;
    while (usedNames.has(normalized(node.data.title))) node.data.title = `${name} ${suffix++}`;
    usedNames.add(normalized(node.data.title));
    if (type === "preview") node.data.previewTab = "layout";
    if (type === "skillDirector" && id === "music-video") { node.data.skillApproach = "music-video"; node.data.skillDirectorAudioMode = "full"; }
    x += nodeWidth(node) + 100;
    return node;
  });
  const edges = nodes.slice(1).map((node, index) => {
    const source = nodes[index], sourcePort = catalog.find((item) => item.type === source.type).ports.output[0];
    const targetPort = workflow.inputs[index];
    if (!sourcePort || !catalog.find((item) => item.type === node.type).ports.input.some((port) => port.id === targetPort)) throw new Error("Workflow ports changed. No nodes were inserted.");
    return { id: `local-edge-${index}`, from: { nodeId: source.id, port: sourcePort.id }, to: { nodeId: node.id, port: targetPort }, color: sourcePort.color };
  });
  const externalEdges = bindings.map(({ sourceId, targetIndex, port, sourcePort }) => {
    const source = sourceNodes.find((node) => node.id === sourceId), target = nodes[targetIndex];
    const primaryOutput = catalog.find((entry) => entry.type === source?.type)?.ports.output[0];
    const output = sourcePort ? { ...primaryOutput, id: sourcePort } : primaryOutput;
    if (!source || !output || !target || !catalog.find((entry) => entry.type === target.type)?.ports.input.some((input) => input.id === port)) throw new Error("A reference or workflow port is no longer available.");
    return { from: { nodeId: sourceId, port: output.id }, to: { nodeId: target.id, port }, color: output.color };
  });
  return { nodes, edges, groups: [], externalEdges };
}

export function verifyMyNewtLocalResult(action, result, snapshot, expected) {
  if (!result || result.error) throw new Error(result?.error || "The local action returned no result.");
  const nodes = snapshot.nodes || [];
  if (["protect", "release-protection"].includes(action.operation)) {
    const approved = action.operation === "protect";
    const targets = action.payload.nodeIds.map((id) => nodes.find((node) => node.id === id));
    if (targets.some((node) => !node || (node.data?.myNewtProtection?.approved === true) !== approved)) throw new Error("The requested approval change was not applied.");
    return targets;
  }
  if (action.operation === "save-project") {
    if (result.saved !== true || snapshot.projectId !== expected.projectId) throw new Error("The project save did not complete.");
    return [];
  }
  if (action.operation === "rename-project") {
    if (snapshot.projectName !== action.payload.name || snapshot.projectId !== expected.projectId) throw new Error("The project name was not updated.");
    return [];
  }
  if (action.operation === "report") {
    if (result.reported !== true) throw new Error("The requested information was not returned.");
    return [];
  }
  if (action.operation === "connect") {
    const { from, to } = action.payload;
    if (!snapshot.edges.some((edge) => edge.from.nodeId === from.nodeId && edge.from.port === from.port && edge.to.nodeId === to.nodeId && edge.to.port === to.port)) throw new Error("The requested connection was not applied.");
    const target = nodes.find((node) => node.id === to.nodeId);
    if (!target) throw new Error("The target node is missing.");
    return [target];
  }
  if (action.operation === "update") {
    const node = nodes.find((item) => item.id === action.payload.nodeId);
    if (!node || Object.entries(action.payload.patch).some(([key, value]) => node.data?.[key] !== value)) throw new Error("The requested setting was not applied. No action will be repeated automatically.");
    return [node];
  }
  const ids = result.createdIds || (result.createdId ? [result.createdId] : []);
  const created = ids.map((id) => nodes.find((node) => node.id === id));
  if (!ids.length || new Set(ids).size !== ids.length || created.some((node) => !node || expected.nodes.some((old) => old.id === node.id))) throw new Error("Could not verify the newly inserted nodes. Check the canvas before retrying.");
  if (action.operation === "create" && (created.length !== 1 || created[0].type !== action.payload.type)) throw new Error("The requested node was not created.");
  if (action.operation === "workflow") {
    const copies = action.payload.copies || [{ bindings: action.payload.bindings || [] }]; let offset = 0;
    for (const { bindings } of copies) {
      const workflow = localWorkflowShape(action.payload.workflowId, bindings);
      const part = created.slice(offset, offset + workflow.types.length); offset += part.length;
      if (part.length !== workflow.types.length || part.some((node, index) => node.type !== workflow.types[index])) throw new Error("The workflow is incomplete.");
      for (let index = 1; index < part.length; index++) {
        const source = part[index - 1], port = expected.catalog.find((entry) => entry.type === source.type)?.ports.output[0]?.id;
        if (!snapshot.edges.some((edge) => edge.from.nodeId === source.id && edge.from.port === port && edge.to.nodeId === part[index].id && edge.to.port === workflow.inputs[index - 1])) throw new Error("A workflow connection is missing.");
      }
      for (const binding of bindings) if (!snapshot.edges.some((edge) => edge.from.nodeId === binding.sourceId && (!binding.sourcePort || edge.from.port === binding.sourcePort) && edge.to.nodeId === part[binding.targetIndex]?.id && edge.to.port === binding.port)) throw new Error("An attached reference was not connected.");
      if (part.at(-1).data.previewTab !== "layout") throw new Error("The Preview layout was not selected.");
    }
    if (offset !== created.length) throw new Error("The workflow contains unexpected nodes.");
  }
  if (action.operation === "duplicate") {
    const originals = expected.nodes.filter((node) => action.payload.nodeIds.includes(node.id));
    if (created.length !== originals.length * action.payload.count) throw new Error("The requested copies are incomplete.");
    for (let copy = 0; copy < action.payload.count; copy++) {
      const part = created.slice(copy * originals.length, (copy + 1) * originals.length);
      const remap = new Map(originals.map((node, index) => [node.id, part[index].id]));
      if (part.some((node, index) => node.type !== originals[index].type)) throw new Error("A copied node is missing.");
      for (const edge of expected.edges.filter((edge) => remap.has(edge.to.nodeId))) {
        if (!snapshot.edges.some((item) => item.from.nodeId === (remap.get(edge.from.nodeId) || edge.from.nodeId) && item.from.port === edge.from.port && item.to.nodeId === remap.get(edge.to.nodeId) && item.to.port === edge.to.port)) throw new Error("A copied connection is missing.");
      }
    }
  }
  return created;
}

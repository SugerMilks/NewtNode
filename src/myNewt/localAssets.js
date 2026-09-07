import { cleanReferenceTag } from "../referenceTags.js";

export const normalizeLocalName = (value) => String(value || "").trim().toLowerCase();
export function localNamedNode(snapshot, name) {
  const raw = String(name).trim(), tag = raw.startsWith("@");
  const wanted = normalizeLocalName(tag ? raw.slice(1) : raw.replace(/^"|"$/g, ""));
  const matches = (snapshot.nodes || []).filter((node) => node.type !== "myNewt" && (tag
    ? [node.data?.title, node.data?.characterName].some((value) => normalizeLocalName(cleanReferenceTag(value)) === wanted)
    : normalizeLocalName(node.data?.title) === wanted));
  if (matches.length !== 1) throw new Error(matches.length ? `More than one node matches ${raw}. Use a unique node name.` : `No node named ${raw} was found.`);
  return matches[0];
}

export function localAttachedNodes(snapshot, kind = "assets") {
  const newt = snapshot.nodes?.find((node) => node.type === "myNewt");
  const ids = new Set((snapshot.edges || []).filter((edge) => edge.to.nodeId === newt?.id).map((edge) => edge.from.nodeId));
  const types = { images: ["image", "imageModel", "coverage", "storyboard", "composer"], videos: ["video", "videoModel"], characters: ["character"], "mood boards": ["transfer"], audio: ["audio"] };
  return (snapshot.nodes || []).filter((node) => ids.has(node.id) && (kind === "assets" || types[kind]?.includes(node.type)));
}

const defaultRole = (node) => node.type === "character" ? "character" : node.type === "transfer" ? "mood board" : ["video", "videoModel"].includes(node.type) ? "video" : node.type === "audio" ? "audio" : "image";
export function localAssetChoices(snapshot, text) {
  const attached = text.match(/^(?:the |my )?attached (assets|images?|videos?|characters?|mood boards?|audio)$/i);
  if (attached) {
    let kind = normalizeLocalName(attached[1]);
    if (["image", "video", "character", "mood board"].includes(kind)) kind += "s";
    const nodes = localAttachedNodes(snapshot, kind);
    if (!nodes.length) throw new Error(`Attach ${kind} to My Newt first.`);
    const newt = snapshot.nodes.find((node) => node.type === "myNewt");
    return (snapshot.edges || []).filter((edge) => edge.to.nodeId === newt.id && nodes.some((node) => node.id === edge.from.nodeId))
      .map((edge) => ({ node: nodes.find((node) => node.id === edge.from.nodeId), role: defaultRole(nodes.find((node) => node.id === edge.from.nodeId)), sourcePort: edge.from.port, attachment: { from: edge.from, to: edge.to } }));
  }
  // Split only outside quoted names, so names such as "Black and White" remain intact.
  if ((text.match(/"/g) || []).length % 2) throw new Error("Close the quotes around each asset name.");
  const entries = text.split(/(?:,\s*(?:and\s+)?|\s+and\s+)(?=(?:[^"]*"[^"]*")*[^"]*$)/i).map((part) => part.trim());
  const choices = entries.map((entry) => {
    const match = entry.match(/^(@[\w-]+|"[^"\n]+")(?:(?: as| for) (?:a |the )?(image|character|location|prop|mood board|video|audio|music))?$/i);
    if (!match) throw new Error('Name each reference explicitly, for example @Emma as character, @Park as location, @Book as prop.');
    const node = localNamedNode(snapshot, match[1]), role = normalizeLocalName(match[2]) || defaultRole(node);
    const base = defaultRole(node);
    if ((["location", "prop"].includes(role) ? "image" : role === "music" ? "audio" : role) !== base) throw new Error(`${match[1]} is not a ${role} source.`);
    return { node, role };
  });
  if (!choices.length) throw new Error("Choose at least one reference.");
  if (new Set(choices.map(({ node }) => node.id)).size !== choices.length) throw new Error("Use each reference only once in this command.");
  return choices;
}

export function localWorkflowBindings(workflowId, choices, targetIndex) {
  const maps = {
    image: { image: "imagePromptIn", location: "imagePromptIn", prop: "imagePromptIn", character: "characterIn", "mood board": "transferIn" },
    video: { image: "referenceImageIn", location: "referenceImageIn", prop: "referenceImageIn", video: "referenceVideoIn", audio: "referenceAudioIn", character: "characterIn" },
    director: { character: "characterIn", location: "locationIn", prop: "imageIn", "mood board": "styleIn", video: "referenceVideoIn" },
    storyboard: { character: "characterIn", location: "sceneReferenceIn", prop: "propsIn", "mood board": "transferIn" },
    coverage: { image: "imageIn", location: "imageIn", prop: "imageIn" },
    "image-edit": { image: "imagePromptIn", location: "imagePromptIn", prop: "imagePromptIn", character: "characterIn", "mood board": "transferIn" },
    "music-video": { character: "characterIn", location: "locationIn", prop: "imageIn", "mood board": "styleIn", video: "referenceVideoIn", audio: "musicIn", music: "musicIn" },
    "asset-preview": { image: "sourceIn", location: "sourceIn", prop: "sourceIn", character: "sourceIn", "mood board": "sourceIn", video: "sourceIn" }
  };
  const bindings = choices.map(({ node, role, sourcePort, attachment }) => {
    const port = maps[workflowId]?.[role];
    if (!port) throw new Error(`${node.data?.title || role} needs a compatible role for this workflow. For Director/Storyboard images, specify "as location" or "as prop".`);
    if (["running", "planning", "compiling", "uploading", "generating"].includes(node.data?.status)) throw new Error(`Wait for ${node.data?.title || "the reference"} to finish first.`);
    return { sourceId: node.id, targetIndex, port, ...(sourcePort ? { sourcePort } : {}), ...(attachment ? { attachment } : {}) };
  });
  if (workflowId === "coverage" && bindings.length !== 1) throw new Error("Coverage takes one image. Name one reference, or ask for Coverage for each attached image.");
  if (workflowId === "music-video" && bindings.filter((item) => item.port === "musicIn").length !== 1) throw new Error("A Music Video workflow requires exactly one connected music track.");
  return bindings;
}

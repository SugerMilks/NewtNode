import { nodeApi } from "../api/newtApi.js";
import { filmDirectorUsesReference } from "../filmDirectorScenes.js";
import { workflowContextPayload } from "../workflowContext.js";

export async function runSkillDirectorNode({
  node,
  incoming,
  skill,
  workflowContext,
  sourceLabel
}) {
  const action = node.data.skillDirectorAction || "build";
  const characterInputs = connectedCharacterInputItems(incoming.characterIn, sourceLabel, node.data.skillReferenceNotes || {});
  const locationInputs = connectedMediaInputItems(incoming.locationIn, "location", sourceLabel, node.data.skillReferenceNotes || {});
  const elementInputs = connectedMediaInputItems(incoming.imageIn, "element", sourceLabel, node.data.skillReferenceNotes || {});
  const activeCharacterInputs = activeSceneReferenceItems(characterInputs, node.data, action, "character");
  const activeLocationInputs = activeSceneReferenceItems(locationInputs, node.data, action, "location");
  const activeElementInputs = activeSceneReferenceItems(elementInputs, node.data, action, "element");
  const { response, data } = await nodeApi.runSkillDirector({
    action,
    sceneName: node.data.sceneName,
    sceneOverview: node.data.sceneOverview ?? node.data.text,
    motionBrief: node.data.motionBrief || node.data.motionDirection,
    styleDirection: node.data.styleDirection,
    motionDirection: node.data.motionDirection,
    shotList: node.data.shotList,
    shotListNotes: node.data.shotListNotes,
    revisionNotes: node.data.skillDirectorRevisionNotes,
    currentFinalPrompt: node.data.resultText,
    characterInputs: activeCharacterInputs,
    locationInputs: activeLocationInputs,
    elementInputs: activeElementInputs,
    styleInputs: connectedMediaInputItems(incoming.styleIn, "style", sourceLabel, node.data.skillReferenceNotes || {}),
    videoInputs: [],
    shotCount: node.data.skillShotCount || node.data.skillSceneCount || node.data.shotCount || "3",
    durationSeconds: node.data.skillDurationSeconds || node.data.durationSeconds || "15",
    resolution: node.data.skillResolution || "720p",
    aspectRatio: node.data.skillAspectRatio || "16:9",
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: node.data.title
  });
  if (!response.ok) throw new Error(data.error || "Film Director failed.");

  return {
    action: data.action || node.data.skillDirectorAction || "build",
    text: data.text || "",
    model: data.model || "",
    skillName: data.skill?.name || skill?.name || "",
    skill: data.skill || skill || null,
    shotCount: data.shotCount || "",
    resolvedShotCount: data.resolvedShotCount || data.actualShotCount || 0,
    durationSeconds: data.durationSeconds || node.data.skillDurationSeconds || node.data.durationSeconds || "15",
    resolution: data.resolution || node.data.skillResolution || "720p",
    aspectRatio: data.aspectRatio || node.data.skillAspectRatio || "16:9",
    actualShotCount: data.actualShotCount || 0,
    sceneName: Object.prototype.hasOwnProperty.call(data, "sceneName") ? data.sceneName : node.data.sceneName || "",
    referenceSetup: data.referenceSetup || "",
    styleDirection: data.styleDirection || "",
    motionDirection: data.motionDirection || "",
    shotList: data.shotList || "",
    shotListNotes: data.shotListNotes || "",
    sceneOverview: data.sceneOverview || node.data.sceneOverview || "",
    revisionSummary: data.revisionSummary || "",
    referenceTags: action === "style"
      ? undefined
      : Array.isArray(data.referenceTags)
        ? data.referenceTags
        : [...activeCharacterInputs, ...activeLocationInputs, ...activeElementInputs].map((item) => item.tag).filter(Boolean)
  };
}

function activeSceneReferenceItems(items = [], data = {}, action = "build", type = "image") {
  if (action === "style") return [];
  return items.filter((item) => filmDirectorUsesReference(data, {
    tag: item.tag,
    label: item.label,
    type,
    categoryCount: items.length,
    useSavedTags: ["build", "revise"].includes(action)
  }));
}

function connectedCharacterInputItems(items = [], sourceLabel, referenceNotes = {}) {
  return items
    .map(({ source }) => {
      if (!source.data.locked || !source.data.activated || !source.data.resultUrl) return null;
      const label = source.data.characterName || source.data.title || sourceLabel(source);
      const referenceKey = `${source.id}:${source.data.resultUrl || source.data.fileName || ""}`;
      return {
        url: source.data.resultUrl,
        label,
        tag: skillDirectorReferenceTag(label),
        description: referenceNotes[referenceKey] || skillDirectorCharacterDescription(source),
        type: "character"
      };
    })
    .filter(Boolean);
}

function connectedMediaInputItems(items = [], mediaType, sourceLabel, referenceNotes = {}) {
  return items
    .map(({ source }) => {
      if (!source.data.resultUrl) return null;
      const label = source.data.title || sourceLabel(source);
      const referenceKey = `${source.id}:${source.data.resultUrl || source.data.fileName || ""}`;
      return {
        url: source.data.resultUrl,
        label,
        tag: skillDirectorReferenceTag(label),
        description: referenceNotes[referenceKey] || "",
        type: mediaType
      };
    })
    .filter(Boolean);
}

function skillDirectorCharacterDescription(source) {
  const tag = skillDirectorReferenceTag(source?.data?.characterName || source?.data?.title || "Character").slice(1);
  const details = String(source?.data?.characterPhysicalDetails || "").trim().replace(/[.!?]+$/, "");
  const traits = [
    ...(Array.isArray(source?.data?.characterTraits) ? source.data.characterTraits : []),
    ...String(source?.data?.customCharacterTraits || "")
      .split(",")
      .map((trait) => trait.trim())
      .filter(Boolean)
  ];
  return [
    `The ${tag} character identity sheet. Use this character's face, body proportions, selected wardrobe, and recognizable details consistently.`,
    details ? `The character has ${details.charAt(0).toLowerCase()}${details.slice(1)}.` : "",
    traits.length ? `Character traits: ${[...new Set(traits)].join(", ")}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function skillDirectorReferenceTag(label) {
  const cleaned = String(label || "Reference")
    .replace(/^@+/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim();
  const compact = cleaned
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
  return `@${compact || "Reference"}`;
}

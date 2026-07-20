import { nodeApi } from "../api/newtApi.js";
import { workflowContextPayload } from "../workflowContext.js";

export async function runSkillDirectorNode({
  node,
  incoming,
  skill,
  workflowContext,
  sourceLabel
}) {
  const { response, data } = await nodeApi.runSkillDirector({
    action: node.data.skillDirectorAction || "build",
    sceneName: node.data.sceneName,
    sceneOverview: node.data.sceneOverview ?? node.data.text,
    motionBrief: node.data.motionBrief || node.data.motionDirection,
    styleDirection: node.data.styleDirection,
    motionDirection: node.data.motionDirection,
    shotList: node.data.shotList,
    shotListNotes: node.data.shotListNotes,
    revisionNotes: node.data.skillDirectorRevisionNotes,
    currentFinalPrompt: node.data.resultText,
    characterInputs: connectedCharacterInputItems(incoming.characterIn, sourceLabel, node.data.skillReferenceNotes || {}),
    locationInputs: connectedMediaInputItems(incoming.locationIn, "location", sourceLabel, node.data.skillReferenceNotes || {}),
    elementInputs: connectedMediaInputItems(incoming.imageIn, "element", sourceLabel, node.data.skillReferenceNotes || {}),
    styleInputs: connectedMediaInputItems(incoming.styleIn, "style", sourceLabel, node.data.skillReferenceNotes || {}),
    videoInputs: [],
    shotCount: node.data.skillShotCount || node.data.skillSceneCount || node.data.shotCount || "3",
    durationSeconds: node.data.skillDurationSeconds || node.data.durationSeconds || "15",
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
    actualShotCount: data.actualShotCount || 0,
    referenceSetup: data.referenceSetup || "",
    styleDirection: data.styleDirection || "",
    motionDirection: data.motionDirection || "",
    shotList: data.shotList || "",
    shotListNotes: data.shotListNotes || "",
    sceneOverview: data.sceneOverview || node.data.sceneOverview || "",
    revisionSummary: data.revisionSummary || ""
  };
}

function connectedCharacterInputItems(items = [], sourceLabel, referenceNotes = {}) {
  return items
    .map(({ source }) => {
      if (!source.data.locked || !source.data.activated || !source.data.resultUrl) return null;
      const label = sourceLabel(source);
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

import { normalizeFilmDirectorApproach } from "./filmDirectorApproaches.js";

export const filmDirectorSceneLimit = 24;

export const filmDirectorNewSceneSetup = Object.freeze({
  skillApproach: "cinematic",
  skillDurationSeconds: "30",
  skillVideoModel: "Seedance 2.5",
  skillResolution: "1080p",
  skillAspectRatio: "21:9",
  skillShotCount: "Auto",
  skillDirectorAudioMode: "production"
});

const sceneSetupInputPorts = new Set(["characterIn", "locationIn", "imageIn", "styleIn", "referenceVideoIn", "musicIn"]);

const defaultReferenceVideoOptions = {
  extend: false,
  camera: false,
  reference: false
};

export const filmDirectorReferenceVideoModes = ["extend", "camera", "reference"];

export function normalizeFilmDirectorReferenceVideoOptions(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const activeMode = filmDirectorReferenceVideoModes.find((mode) => Boolean(source[mode])) || "";
  return {
    extend: activeMode === "extend",
    camera: activeMode === "camera",
    reference: activeMode === "reference"
  };
}

export function filmDirectorReferenceVideoMode(value = {}) {
  const options = normalizeFilmDirectorReferenceVideoOptions(value);
  return filmDirectorReferenceVideoModes.find((mode) => options[mode]) || "";
}

export function selectFilmDirectorReferenceVideoMode(current = {}, mode = "", enabled = true) {
  const normalizedMode = filmDirectorReferenceVideoModes.includes(mode) ? mode : "";
  const activeMode = enabled ? normalizedMode : "";
  return Object.fromEntries(filmDirectorReferenceVideoModes.map((key) => [key, key === activeMode]));
}

export const filmDirectorExtendInstruction = "Use the provided reference video as the authoritative context and seamlessly continue the scene from its exact final visual and temporal state. Preserve character identity, wardrobe, location, lighting, color, atmosphere, screen direction, blocking, camera position, lens character, motion, performance, and continuity. Do not restart, recap, reinterpret, or recreate the existing footage. Begin the continuation with the additional shots below.";

export function filmDirectorExtendInstructionForApproach(approach = "cinematic") {
  if (normalizeFilmDirectorApproach(approach) === "cinematic") return filmDirectorExtendInstruction;
  return "Use the provided reference video as the authoritative story and continuity context. Continue from its exact ending action, subject positions and temporal state. Preserve recognizable character identity, wardrobe, location, screen direction, blocking, camera framing and motion, performance and continuity. Apply the selected approach and Style Direction to the capture medium, rendering, color treatment, texture and visual frame cadence; these override conflicting source-video visual treatment. Do not restart, recap or recreate the existing events. Begin the continuation with the additional shots below.";
}

export const filmDirectorCameraInstruction = "Use the provided reference video solely as the authoritative camera and editing blueprint. Match its shot boundaries, shot order, framing progression, camera positions, movement paths, movement speed, and transitions while depicting only the scene, assets, performances, location, lighting, and visual style described in this prompt. Do not copy or introduce people, wardrobe, objects, setting, action, dialogue, story content, lighting, color treatment, or visual style from the reference video.";

export const filmDirectorReferenceInstruction = "Use the provided reference video as the authoritative temporal performance, blocking, camera, composition, edit, and sound-timing blueprint. Re-stage its shot boundaries, shot order, framing, camera movement, body movement, gestures, expressions, eyelines, interactions, dialogue timing, pauses, and performance cadence with only the characters, wardrobe, props, location, lighting, and visual style described in this prompt. Replace every source-video identity and visual appearance with the connected scene assets and requested look. Do not copy the source video's people, wardrobe, objects, setting, lighting, color treatment, rendering style, branding, or other visual identity. The Style Direction is authoritative: when it requests animation, illustration, stylization, or another non-live-action treatment, that requested look supersedes the live-action language in the general Scene rules while performance and physics remain coherent. When reference audio is available and generated audio is enabled, preserve its speech timing and natural performance cadence without importing music.";

export function filmDirectorReferenceVideoCacheKey(mode = "", url = "") {
  const normalizedMode = filmDirectorReferenceVideoModes.includes(mode) ? mode : "";
  const normalizedUrl = String(url || "").trim();
  return normalizedMode && normalizedUrl ? `${normalizedMode}:${normalizedUrl}` : "";
}

export function normalizeFilmDirectorReferenceVideoBlueprint(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const mode = filmDirectorReferenceVideoModes.includes(source.mode) ? source.mode : "";
  const sourceDurationSeconds = Math.max(0, Number(source.sourceDurationSeconds) || 0);
  const requestedDuration = Number.parseInt(String(source.durationSeconds || ""), 10);
  const durationSeconds = Number.isInteger(requestedDuration)
    ? String(Math.max(4, Math.min(30, requestedDuration)))
    : "";
  const cutTimes = [...new Set((Array.isArray(source.cutTimes) ? source.cutTimes : [])
    .map((time) => Number(time))
    .filter((time) => Number.isFinite(time) && time > 0 && (!sourceDurationSeconds || time < sourceDurationSeconds))
    .map((time) => Number(time.toFixed(3))))]
    .sort((a, b) => a - b)
    .slice(0, 24);
  const shots = (Array.isArray(source.shots) ? source.shots : [])
    .filter((shot) => shot && typeof shot === "object")
    .slice(0, 25)
    .map((shot, index) => ({
      number: index + 1,
      startSeconds: Math.max(0, Number(shot.startSeconds) || 0),
      endSeconds: Math.max(0, Number(shot.endSeconds) || 0),
      durationSeconds: Math.max(0, Number(shot.durationSeconds) || 0),
      description: String(shot.description || "").trim()
    }));
  const requestedShotCount = Number.parseInt(String(source.shotCount || ""), 10);
  const shotCount = Math.max(0, Math.min(25,
    Number.isInteger(requestedShotCount) && requestedShotCount > 0
      ? requestedShotCount
      : shots.length || (cutTimes.length ? cutTimes.length + 1 : 0)
  ));

  return {
    mode,
    sourceDurationSeconds,
    durationSeconds,
    shotCount,
    cutTimes,
    shots,
    audioDetected: Boolean(source.audioDetected),
    audioTranscript: String(source.audioTranscript || "").trim().slice(0, 8000),
    audioSummary: String(source.audioSummary || "").trim().slice(0, 2000)
  };
}

export function filmDirectorSetupInputIsLocked(locks = {}, portId = "") {
  return Boolean(locks?.setup && sceneSetupInputPorts.has(String(portId || "")));
}

export function isFilmDirectorSceneTransitionPatch(patch = {}) {
  return Boolean(
    patch
    && typeof patch === "object"
    && Object.prototype.hasOwnProperty.call(patch, "skillDirectorActiveSceneId")
  );
}

const sceneStateKeys = [
  "sceneName",
  "sceneOverview",
  "text",
  "skillShotCount",
  "shotCount",
  "skillDurationSeconds",
  "durationSeconds",
  "skillVideoModel",
  "skillResolution",
  "skillAspectRatio",
  "skillDirectorAudioMode",
  "skillApproach",
  "skillDirectorLockedApproach",
  "skillDirectorLockedMusicSignature",
  "skillDirectorReferenceVideoOptions",
  "skillDirectorReferenceVideoAnalysis",
  "skillDirectorReferenceVideoAnalysisSource",
  "skillDirectorReferenceVideoBlueprint",
  "skillDirectorLockedReferenceVideoSignature",
  "styleDirection",
  "motionBrief",
  "motionDirection",
  "shotList",
  "shotListNotes",
  "skillDirectorShotListSourceSignature",
  "skillDirectorLockedStyleInputSignature",
  "skillDirectorLockedAssetInputSignature",
  "skillDirectorLockedInputManifest",
  "skillDirectorLockedInputManifestInitialized",
  "resultText",
  "skillDirectorOutputStale",
  "skillDirectorLocks",
  "skillDirectorStaleStages",
  "skillDirectorCollapsed",
  "skillDirectorBuilt",
  "skillDirectorRebuildAfterShotList",
  "skillDirectorRebuildAfterStyle",
  "skillDirectorRefreshAfterStyle",
  "skillDirectorRefreshShotListAfterMotion",
  "skillPreviewOpen",
  "skillDirectorRevisionOpen",
  "skillDirectorRevisionNotes",
  "skillDirectorLastRevisionSummary",
  "skillDirectorRevisionHistory",
  "skillDirectorRevisionSelectedId",
  "lastRunModel",
  "lastRunSkillName",
  "lastRunShotCount",
  "lastRunDurationSeconds",
  "lastRunActualShotCount",
  "lastRunReferenceSetup",
  "lastRunReferenceTags"
];

const defaultLocks = {
  setup: false,
  style: false,
  motion: false,
  scene: false,
  shotList: false
};

const defaultCollapsed = {
  setup: false,
  style: false,
  motion: false,
  scene: false,
  shotList: false
};

function cloneValue(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function sceneDefaults(sceneName = "") {
  // Keep legacy snapshot fallbacks separate from defaults for newly created scenes.
  return {
    sceneName,
    sceneOverview: "",
    text: "",
    skillShotCount: "3",
    shotCount: "3",
    skillDurationSeconds: "15",
    durationSeconds: "15",
    skillVideoModel: "",
    skillResolution: "720p",
    skillAspectRatio: "16:9",
    skillDirectorAudioMode: "production",
    skillApproach: "cinematic",
    skillDirectorLockedApproach: "cinematic",
    skillDirectorLockedMusicSignature: "",
    skillDirectorReferenceVideoOptions: { ...defaultReferenceVideoOptions },
    skillDirectorReferenceVideoAnalysis: "",
    skillDirectorReferenceVideoAnalysisSource: "",
    skillDirectorReferenceVideoBlueprint: normalizeFilmDirectorReferenceVideoBlueprint(),
    skillDirectorLockedReferenceVideoSignature: "",
    styleDirection: "",
    motionBrief: "",
    motionDirection: "",
    shotList: "",
    shotListNotes: "",
    skillDirectorShotListSourceSignature: "",
    skillDirectorLockedStyleInputSignature: "",
    skillDirectorLockedAssetInputSignature: "",
    skillDirectorLockedInputManifest: [],
    skillDirectorLockedInputManifestInitialized: false,
    resultText: "",
    skillDirectorOutputStale: false,
    skillDirectorLocks: { ...defaultLocks },
    skillDirectorStaleStages: {},
    skillDirectorCollapsed: { ...defaultCollapsed },
    skillDirectorBuilt: false,
    skillDirectorRebuildAfterShotList: false,
    skillDirectorRebuildAfterStyle: false,
    skillDirectorRefreshAfterStyle: "",
    skillDirectorRefreshShotListAfterMotion: false,
    skillPreviewOpen: false,
    skillDirectorRevisionOpen: false,
    skillDirectorRevisionNotes: "",
    skillDirectorLastRevisionSummary: "",
    skillDirectorRevisionHistory: [],
    skillDirectorRevisionSelectedId: "",
    lastRunModel: "",
    lastRunSkillName: "",
    lastRunShotCount: "",
    lastRunDurationSeconds: "",
    lastRunActualShotCount: 0,
    lastRunReferenceSetup: "",
    lastRunReferenceTags: []
  };
}

export function filmDirectorSceneSnapshot(data = {}, fallbackName = "") {
  const defaults = sceneDefaults(fallbackName);
  const snapshot = {};
  sceneStateKeys.forEach((key) => {
    snapshot[key] = cloneValue(Object.prototype.hasOwnProperty.call(data, key) ? data[key] : defaults[key]);
  });
  snapshot.sceneName = String(snapshot.sceneName || fallbackName || "");
  snapshot.skillApproach = normalizeFilmDirectorApproach(snapshot.skillApproach);
  snapshot.skillDirectorLockedApproach = normalizeFilmDirectorApproach(snapshot.skillDirectorLockedApproach);
  snapshot.skillDirectorLocks = { ...defaultLocks, ...(snapshot.skillDirectorLocks || {}) };
  snapshot.skillDirectorStaleStages = { ...(snapshot.skillDirectorStaleStages || {}) };
  snapshot.skillDirectorCollapsed = { ...defaultCollapsed, ...(snapshot.skillDirectorCollapsed || {}) };
  snapshot.skillDirectorReferenceVideoOptions = normalizeFilmDirectorReferenceVideoOptions(snapshot.skillDirectorReferenceVideoOptions);
  snapshot.skillDirectorReferenceVideoBlueprint = normalizeFilmDirectorReferenceVideoBlueprint(snapshot.skillDirectorReferenceVideoBlueprint);
  snapshot.skillDirectorRevisionHistory = Array.isArray(snapshot.skillDirectorRevisionHistory)
    ? snapshot.skillDirectorRevisionHistory
    : [];
  return snapshot;
}

function nextSceneId(scenes = []) {
  const used = new Set(scenes.map((scene) => String(scene?.id || "")));
  let index = scenes.length + 1;
  while (used.has(`scene-${index}`)) index += 1;
  return `scene-${index}`;
}

function normalizedSceneRecord(scene, index) {
  const fallbackName = `Scene ${index + 1}`;
  const sourceState = scene?.state && typeof scene.state === "object" ? scene.state : scene || {};
  return {
    id: String(scene?.id || `scene-${index + 1}`),
    state: filmDirectorSceneSnapshot(sourceState, fallbackName)
  };
}

export function normalizeFilmDirectorScenes(data = {}) {
  let scenes = Array.isArray(data.skillDirectorScenes)
    ? data.skillDirectorScenes.filter(Boolean).slice(0, filmDirectorSceneLimit).map(normalizedSceneRecord)
    : [];
  if (!scenes.length) {
    scenes = [{ id: "scene-1", state: filmDirectorSceneSnapshot(data, data.sceneName || "Scene 1") }];
  }

  const requestedActiveId = String(data.skillDirectorActiveSceneId || "");
  const activeId = scenes.some((scene) => scene.id === requestedActiveId) ? requestedActiveId : scenes[0].id;
  scenes = scenes.map((scene) => (
    scene.id === activeId
      ? { ...scene, state: filmDirectorSceneSnapshot(data, scene.state.sceneName || "") }
      : scene
  ));
  return { scenes, activeId };
}

export function filmDirectorSceneTabs(data = {}) {
  const { scenes, activeId } = normalizeFilmDirectorScenes(data);
  return scenes.map((scene, index) => ({
    id: scene.id,
    label: scene.id === activeId
      ? String(data.sceneName || scene.state.sceneName || `Scene ${index + 1}`)
      : String(scene.state.sceneName || `Scene ${index + 1}`),
    active: scene.id === activeId,
    built: scene.id === activeId ? Boolean(data.skillDirectorBuilt && data.resultText) : Boolean(scene.state.skillDirectorBuilt && scene.state.resultText)
  }));
}

function sceneRuntimeReset() {
  return {
    status: "idle",
    error: "",
    skillDirectorAction: "",
    skillDirectorQueuedAction: "",
    skillDirectorQueueId: ""
  };
}

export function switchFilmDirectorScene(data = {}, targetId = "") {
  const { scenes, activeId } = normalizeFilmDirectorScenes(data);
  const target = scenes.find((scene) => scene.id === targetId);
  if (!target || target.id === activeId) {
    return { skillDirectorScenes: scenes, skillDirectorActiveSceneId: activeId };
  }
  return {
    ...filmDirectorSceneSnapshot(target.state),
    ...sceneRuntimeReset(),
    skillDirectorScenes: scenes,
    skillDirectorActiveSceneId: target.id
  };
}

export function addFilmDirectorScene(data = {}) {
  const { scenes } = normalizeFilmDirectorScenes(data);
  if (scenes.length >= filmDirectorSceneLimit) {
    return { skillDirectorScenes: scenes, skillDirectorActiveSceneId: data.skillDirectorActiveSceneId || scenes[0].id };
  }
  const id = nextSceneId(scenes);
  const nextScene = {
    id,
    state: filmDirectorSceneSnapshot({
      ...filmDirectorNewSceneSetup,
      shotCount: filmDirectorNewSceneSetup.skillShotCount,
      durationSeconds: filmDirectorNewSceneSetup.skillDurationSeconds
    }, `Scene ${scenes.length + 1}`)
  };
  return {
    ...nextScene.state,
    ...sceneRuntimeReset(),
    skillDirectorScenes: [...scenes, nextScene],
    skillDirectorActiveSceneId: id
  };
}

export function removeFilmDirectorScene(data = {}, sceneId = "") {
  const { scenes, activeId } = normalizeFilmDirectorScenes(data);
  if (scenes.length <= 1) return { skillDirectorScenes: scenes, skillDirectorActiveSceneId: activeId };
  const removeIndex = scenes.findIndex((scene) => scene.id === sceneId);
  if (removeIndex < 0) return { skillDirectorScenes: scenes, skillDirectorActiveSceneId: activeId };
  const remaining = scenes.filter((scene) => scene.id !== sceneId);
  if (sceneId !== activeId) {
    return { skillDirectorScenes: remaining, skillDirectorActiveSceneId: activeId };
  }
  const target = remaining[Math.min(removeIndex, remaining.length - 1)];
  return {
    ...filmDirectorSceneSnapshot(target.state),
    ...sceneRuntimeReset(),
    skillDirectorScenes: remaining,
    skillDirectorActiveSceneId: target.id
  };
}

export function filmDirectorReferencedTags(data = {}) {
  const source = [
    data.sceneOverview,
    data.text,
    data.motionDirection,
    data.motionBrief,
    data.shotList,
    data.shotListNotes,
    data.resultText,
    data.skillDirectorRevisionNotes
  ]
    .filter(Boolean)
    .join("\n");
  const tags = new Set();
  for (const match of source.matchAll(/@([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
    tags.add(match[1].toLowerCase());
  }
  return tags;
}

export function filmDirectorUsesReferenceTag(data = {}, tag = "") {
  const normalized = String(tag || "").replace(/^@+/, "").trim().toLowerCase();
  return Boolean(normalized && filmDirectorReferencedTags(data).has(normalized));
}

export function filmDirectorOutputReferencedTags(dataOrPrompt = {}) {
  const source = typeof dataOrPrompt === "string"
    ? dataOrPrompt
    : String(dataOrPrompt?.resultText || "");
  const tags = new Set();
  for (const match of source.matchAll(/@([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
    tags.add(match[1].toLowerCase());
  }
  return tags;
}

export function filmDirectorOutputUsesReferenceTag(dataOrPrompt = {}, tag = "") {
  const normalized = normalizedReferenceTag(tag);
  return Boolean(normalized && filmDirectorOutputReferencedTags(dataOrPrompt).has(normalized));
}

export function filterFilmDirectorReferencesForOutput(references = [], dataOrPrompt = {}) {
  return (Array.isArray(references) ? references : []).filter((reference) => (
    filmDirectorOutputUsesReferenceTag(dataOrPrompt, reference?.tag)
  ));
}

function filmDirectorReferenceText(data = {}) {
  return [
    data.sceneOverview,
    data.text,
    data.motionDirection,
    data.motionBrief,
    data.shotList,
    data.shotListNotes,
    data.resultText,
    data.skillDirectorRevisionNotes
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function normalizedReferenceTag(value = "") {
  return String(value || "").replace(/^@+/, "").trim().toLowerCase();
}

function textContainsReferenceName(text = "", value = "") {
  const normalized = normalizedReferenceTag(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
}

export function filmDirectorUsesReference(data = {}, {
  tag = "",
  label = "",
  type = "image",
  categoryCount = 0,
  useSavedTags = true
} = {}) {
  const normalizedTag = normalizedReferenceTag(tag);
  if (!normalizedTag) return false;

  const savedTags = new Set(
    (Array.isArray(data.lastRunReferenceTags) ? data.lastRunReferenceTags : [])
      .map(normalizedReferenceTag)
      .filter(Boolean)
  );
  if (useSavedTags && savedTags.has(normalizedTag)) return true;
  if (filmDirectorUsesReferenceTag(data, normalizedTag)) return true;

  const text = filmDirectorReferenceText(data);
  if (textContainsReferenceName(text, normalizedTag) || textContainsReferenceName(text, label)) return true;

  if (type === "character" && Number(categoryCount) === 1) {
    return /\b(character|person|subject|actor|patient|doctor|nurse|ceo|man|woman|boy|girl|child|kid|he|she|him|her|they|them)\b/i.test(text);
  }
  return false;
}

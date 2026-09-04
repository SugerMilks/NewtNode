export const filmDirectorSceneLimit = 24;

const persistentAssetInputPorts = new Set(["characterIn", "locationIn", "imageIn"]);

export function filmDirectorCanAddAssetWhileSetupLocked(portId = "") {
  return persistentAssetInputPorts.has(String(portId || ""));
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
  snapshot.skillDirectorLocks = { ...defaultLocks, ...(snapshot.skillDirectorLocks || {}) };
  snapshot.skillDirectorStaleStages = { ...(snapshot.skillDirectorStaleStages || {}) };
  snapshot.skillDirectorCollapsed = { ...defaultCollapsed, ...(snapshot.skillDirectorCollapsed || {}) };
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
    state: filmDirectorSceneSnapshot({}, `Scene ${scenes.length + 1}`)
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

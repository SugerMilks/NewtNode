import {
  filmDirectorShotDescriptionExample,
  filmDirectorShotDetailDirective
} from "./filmDirectorShotDetail.js";

export const filmDirectorRevisionHistoryLimit = 25;
const filmDirectorRevisionDurations = new Set(["5", "10", "15", "20", "30"]);
const filmDirectorRevisionSnapshotKeys = [
  "sceneName",
  "skillDurationSeconds",
  "durationSeconds",
  "skillShotCount",
  "shotCount",
  "skillReferenceNotes",
  "styleDirection",
  "motionDirection",
  "motionBrief",
  "sceneOverview",
  "text",
  "shotList",
  "shotListNotes",
  "resultText",
  "skillDirectorLocks",
  "skillDirectorCollapsed",
  "skillDirectorBuilt",
  "skillPreviewOpen",
  "lastRunModel",
  "lastRunSkillName",
  "lastRunShotCount",
  "lastRunDurationSeconds",
  "lastRunActualShotCount",
  "lastRunReferenceSetup"
];

export function buildFilmDirectorRevisionPrompt({
  revisionNotes = "",
  durationLabel = "15-second",
  durationSeconds = "15",
  currentCutCount = 0,
  sceneName = "",
  referenceSetup = "",
  styleDirection = "",
  cameraDirection = "",
  sceneOverview = "",
  shotListNotes = "",
  shotList = "",
  finalPrompt = "",
  shotLogic = ""
} = {}) {
  const notes = String(revisionNotes || "").trim();
  if (!notes) return "";

  return [
    `Revise this completed Film Director package for one ${durationLabel} AI video scene.`,
    "The user's revision notes are the authority for this pass. Apply them precisely, including removals, wording changes, shot adjustments, dialogue changes, or continuity corrections.",
    "Apply every requested change in one pass. Update every dependent field needed to keep the package internally consistent, while preserving unaffected material verbatim whenever practical.",
    "Examples: removing or adding a shot must update recommendedShotCount, renumber every CUT, and revise continuity; tighter framing or camera movement must update both cameraDirection and the affected CUT fields; a style note must update styleDirection and any dependent scene language.",
    "Scene name and duration may change only when the user explicitly requests them. If duration changes, rebalance pacing and CUT count for the new duration.",
    "durationSeconds must be one of 5, 10, 15, 20, or 30. Otherwise preserve the current duration.",
    "Keep all connected @tags exactly as written. Do not rename, remove, or invent a tagged asset unless the user explicitly requests its removal from the scene.",
    currentCutCount
      ? `Preserve the current ${currentCutCount} CUT sections unless the user explicitly asks to add, remove, combine, or restructure shots.`
      : "Preserve the current shot structure unless the user explicitly asks to change it.",
    "Return strict JSON only with this exact shape:",
    `{"changeSummary":"one short sentence","sceneName":"complete revised scene name","durationSeconds":"15","styleDirection":"complete revised style direction","cameraDirection":"complete revised camera direction","sceneOverview":"complete revised scene overview","recommendedShotCount":3,"continuityLedger":"one compact line","mustHaveActions":"one compact line","cuts":[{"number":1,"shotFrame":"WS","cameraMovement":"Static","shotType":"Over-the-Shoulder","description":"${filmDirectorShotDescriptionExample(currentCutCount, durationSeconds)}"}]}`,
    shotLogic,
    filmDirectorShotDetailDirective(currentCutCount || "Auto", durationSeconds),
    "Do not return a partial patch. Return the complete revised values so NewtNode can replace the finished package safely. Do not use markdown or add keys outside the schema.",
    `USER REVISION NOTES:\n${notes}`,
    sceneName ? `Scene name:\n${sceneName}` : "",
    referenceSetup ? `Locked reference setup:\n${referenceSetup}` : "",
    styleDirection ? `Current Style Direction:\n${styleDirection}` : "",
    cameraDirection ? `Current Camera Direction:\n${cameraDirection}` : "",
    sceneOverview ? `Current Scene Overview:\n${sceneOverview}` : "",
    shotListNotes ? `Current continuity and required-action notes:\n${shotListNotes}` : "",
    shotList ? `Current Shot List:\n${shotList}` : "",
    finalPrompt ? `Current final output:\n${finalPrompt}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function revisionString(result, key, fallback = "") {
  return Object.prototype.hasOwnProperty.call(result || {}, key)
    ? String(result[key] ?? "").trim()
    : String(fallback || "").trim();
}

export function filmDirectorRevisionStatePatch(current = {}, result = {}) {
  const resolvedShotCount = Number.parseInt(
    String(result.resolvedShotCount || result.actualShotCount || result.shotCount || ""),
    10
  );
  const currentShotCount = String(current.skillShotCount || current.shotCount || "Auto");
  const nextShotCount = Number.isInteger(resolvedShotCount) && resolvedShotCount > 0
    ? String(resolvedShotCount)
    : currentShotCount;
  const requestedDuration = String(result.durationSeconds || current.skillDurationSeconds || current.durationSeconds || "15");
  const nextDuration = filmDirectorRevisionDurations.has(requestedDuration) ? requestedDuration : "15";
  const finalPrompt = revisionString(result, "text", current.resultText);
  const sceneOverview = revisionString(result, "sceneOverview", current.sceneOverview ?? current.text);
  const cameraDirection = revisionString(result, "motionDirection", current.motionDirection ?? current.motionBrief);

  return {
    sceneName: revisionString(result, "sceneName", current.sceneName),
    skillDurationSeconds: nextDuration,
    durationSeconds: nextDuration,
    skillShotCount: nextShotCount,
    shotCount: nextShotCount,
    styleDirection: revisionString(result, "styleDirection", current.styleDirection),
    motionDirection: cameraDirection,
    motionBrief: cameraDirection,
    sceneOverview,
    text: sceneOverview,
    shotList: revisionString(result, "shotList", current.shotList),
    shotListNotes: revisionString(result, "shotListNotes", current.shotListNotes),
    resultText: finalPrompt,
    skillDirectorLocks: { setup: true, style: true, motion: true, scene: true, shotList: true },
    skillDirectorBuilt: Boolean(finalPrompt),
    skillPreviewOpen: Boolean(finalPrompt)
  };
}

function cloneRevisionValue(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

export function createFilmDirectorRevisionSnapshot(data = {}) {
  return Object.fromEntries(
    filmDirectorRevisionSnapshotKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(data || {}, key))
      .map((key) => [key, cloneRevisionValue(data[key])])
  );
}

export function trimFilmDirectorRevisionHistory(history = [], limit = filmDirectorRevisionHistoryLimit) {
  const entries = Array.isArray(history) ? history.filter(Boolean) : [];
  const safeLimit = Math.max(2, Number.parseInt(String(limit || filmDirectorRevisionHistoryLimit), 10) || filmDirectorRevisionHistoryLimit);
  if (entries.length <= safeLimit) return entries;
  const original = entries.find((entry) => entry?.kind === "original" && entry?.snapshot);
  const remainder = entries.filter((entry) => entry !== original).slice(-(safeLimit - (original ? 1 : 0)));
  return original ? [original, ...remainder] : remainder;
}

export function updateFilmDirectorRevisionVersionSnapshot(history = [], versionId = "", data = {}) {
  const targetId = String(versionId || "");
  if (!targetId) return Array.isArray(history) ? history : [];
  return (Array.isArray(history) ? history : []).map((entry) => (
    String(entry?.id || "") === targetId && entry?.snapshot
      ? { ...entry, snapshot: createFilmDirectorRevisionSnapshot(data) }
      : entry
  ));
}

export function appendFilmDirectorRevisionVersionHistory(history = [], {
  current = {},
  revised = {},
  notes = "",
  summary = "",
  selectedId = "",
  createdAt = new Date().toISOString()
} = {}) {
  let next = updateFilmDirectorRevisionVersionSnapshot(history, selectedId, current);
  const restorableVersions = next.filter((entry) => entry?.snapshot);
  if (!restorableVersions.length) {
    next = [
      ...next,
      {
        id: `${createdAt}-original`,
        kind: "original",
        label: "Original Setup",
        notes: "",
        summary: "Before revisions",
        createdAt,
        snapshot: createFilmDirectorRevisionSnapshot(current)
      }
    ];
  }

  const revisionNumber = next.filter((entry) => entry?.kind === "revision" && entry?.snapshot).length + 1;
  const revisionEntry = {
    id: `${createdAt}-revision-${revisionNumber}`,
    kind: "revision",
    label: `Revision ${revisionNumber}`,
    notes: String(notes || "").trim(),
    summary: String(summary || "").trim() || "Revision applied",
    createdAt,
    snapshot: createFilmDirectorRevisionSnapshot(revised)
  };
  return {
    history: trimFilmDirectorRevisionHistory([...next, revisionEntry]),
    selectedId: revisionEntry.id
  };
}

export function appendFilmDirectorRevisionHistory(history = [], entry = {}, limit = 8) {
  const nextEntry = {
    notes: String(entry.notes || "").trim(),
    summary: String(entry.summary || "").trim(),
    createdAt: String(entry.createdAt || new Date().toISOString())
  };
  if (!nextEntry.notes) return Array.isArray(history) ? history.slice(-limit) : [];
  return [...(Array.isArray(history) ? history : []), nextEntry].slice(-Math.max(1, limit));
}

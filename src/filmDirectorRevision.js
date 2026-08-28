import {
  filmDirectorShotDescriptionExample,
  filmDirectorShotDetailDirective
} from "./filmDirectorShotDetail.js";
import {
  filmDirectorDurationPromptList,
  normalizeFilmDirectorDuration
} from "./filmDirectorDurations.js";
import {
  filmDirectorAspectRatioPromptList,
  normalizeFilmDirectorAspectRatio
} from "./filmDirectorAspectRatios.js";
import { filmDirectorResolutionOptions, normalizeFilmDirectorResolution } from "./filmDirectorResolutions.js";
import { filmDirectorStyleDirectionDirective } from "./filmDirectorStyle.js";

export const filmDirectorRevisionHistoryLimit = 25;
const filmDirectorRevisionReferenceKeys = ["activeReferenceTags", "active_reference_tags"];
const filmDirectorRevisionSnapshotKeys = [
  "sceneName",
  "skillDurationSeconds",
  "durationSeconds",
  "skillResolution",
  "skillAspectRatio",
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
  "lastRunReferenceSetup",
  "lastRunReferenceTags"
];

export function buildFilmDirectorRevisionPrompt({
  revisionNotes = "",
  durationLabel = "15-second",
  durationSeconds = "15",
  resolution = "720p",
  aspectRatio = "16:9",
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
    "Examples: removing or adding a shot must update recommendedShotCount, renumber every CUT, and revise continuity; tighter framing or camera movement must update both cameraDirection and the affected CUT fields; a style note must update only the visual appearance in styleDirection and any directly dependent visual language.",
    "Keep each section inside its job: styleDirection owns the visible cinematic treatment, emotional tone, and performance texture; cameraDirection owns camera behavior and framing strategy; sceneOverview owns story and action; cuts own shot-specific execution. Never copy camera movement, blocking, action choreography, plot summary, or poetic non-literal story language into styleDirection.",
    filmDirectorStyleDirectionDirective(),
    "Scene name, duration, resolution, and aspect ratio may change only when the user explicitly requests them. If duration changes, rebalance pacing and CUT count for the new duration.",
    `durationSeconds must be one of ${filmDirectorDurationPromptList()}. Otherwise preserve the current duration.`,
    `resolution must be one of ${filmDirectorResolutionOptions.join(", ")}. Otherwise preserve the current resolution.`,
    `aspectRatio must be one of ${filmDirectorAspectRatioPromptList()}. Otherwise preserve the current aspect ratio.`,
    "Keep every still-active connected @tag exactly as written. Do not rename or invent tagged assets. When the user removes an asset from the scene, remove that tag from every revised field and from activeReferenceTags.",
    "activeReferenceTags must contain exactly the connected @tags still used by the revised scene. Omit unused or removed assets, even if they remain physically connected. Return an empty array when the revised scene uses no connected assets.",
    currentCutCount
      ? `Preserve the current ${currentCutCount} CUT sections unless the user explicitly asks to add, remove, combine, or restructure shots.`
      : "Preserve the current shot structure unless the user explicitly asks to change it.",
    "Return strict JSON only with this exact shape:",
    `{"changeSummary":"one short sentence","sceneName":"complete revised scene name","durationSeconds":"15","resolution":"720p","aspectRatio":"16:9","activeReferenceTags":["@ExactConnectedTag"],"styleDirection":"concise literal visual treatment only","cameraDirection":"complete revised camera direction","sceneOverview":"complete revised scene overview","recommendedShotCount":3,"continuityLedger":"one compact line","mustHaveActions":"one compact line","cuts":[{"number":1,"shotFrame":"WS","cameraMovement":"Static","shotType":"Over-the-Shoulder","description":"${filmDirectorShotDescriptionExample(currentCutCount, durationSeconds)}"}]}`,
    shotLogic,
    filmDirectorShotDetailDirective(currentCutCount || "Auto", durationSeconds),
    "Do not return a partial patch. Return the complete revised values so NewtNode can replace the finished package safely. Do not use markdown or add keys outside the schema.",
    `USER REVISION NOTES:\n${notes}`,
    sceneName ? `Scene name:\n${sceneName}` : "",
    `Current resolution:\n${normalizeFilmDirectorResolution(resolution)}`,
    `Current aspect ratio:\n${normalizeFilmDirectorAspectRatio(aspectRatio)}`,
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

function normalizedFilmDirectorReferenceTag(value = "") {
  const normalized = String(value || "").replace(/^@+/, "").trim().toLowerCase();
  return normalized ? `@${normalized}` : "";
}

function filmDirectorReferenceTagsInText(value = "") {
  return [...String(value || "").matchAll(/@([A-Za-z0-9][A-Za-z0-9_-]*)/g)]
    .map((match) => normalizedFilmDirectorReferenceTag(match[1]))
    .filter(Boolean);
}

export function filmDirectorRevisionActiveReferenceTags(result = {}, availableTags = [], revisedText = "") {
  const available = new Map(
    (Array.isArray(availableTags) ? availableTags : [])
      .map((tag) => [
        normalizedFilmDirectorReferenceTag(tag),
        String(tag || "").startsWith("@") ? String(tag) : `@${tag}`
      ])
      .filter(([key]) => key)
  );
  const manifestKey = filmDirectorRevisionReferenceKeys.find((key) => Object.prototype.hasOwnProperty.call(result || {}, key));
  const manifest = manifestKey
    ? (Array.isArray(result[manifestKey]) ? result[manifestKey] : [])
    : filmDirectorReferenceTagsInText(revisedText);
  const requested = new Set(manifest.map(normalizedFilmDirectorReferenceTag).filter(Boolean));
  return [...available.entries()]
    .filter(([key]) => requested.has(key))
    .map(([, original]) => original);
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
  const currentDuration = current.skillDurationSeconds || current.durationSeconds || "15";
  const nextDuration = normalizeFilmDirectorDuration(result.durationSeconds, currentDuration);
  const nextResolution = normalizeFilmDirectorResolution(result.resolution, current.skillResolution || "720p");
  const nextAspectRatio = normalizeFilmDirectorAspectRatio(result.aspectRatio, current.skillAspectRatio || "16:9");
  const finalPrompt = revisionString(result, "text", current.resultText);
  const sceneOverview = revisionString(result, "sceneOverview", current.sceneOverview ?? current.text);
  const cameraDirection = revisionString(result, "motionDirection", current.motionDirection ?? current.motionBrief);

  return {
    sceneName: revisionString(result, "sceneName", current.sceneName),
    skillDurationSeconds: nextDuration,
    durationSeconds: nextDuration,
    skillResolution: nextResolution,
    skillAspectRatio: nextAspectRatio,
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

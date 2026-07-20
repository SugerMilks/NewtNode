export const filmDirectorRevisionHistoryLimit = 8;

export function buildFilmDirectorRevisionPrompt({
  revisionNotes = "",
  durationLabel = "15-second",
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
    "Make the smallest coherent revision. Preserve every unaffected field verbatim whenever practical, and make only the additional continuity changes required by the requested edit.",
    "Keep all connected @tags exactly as written. Do not rename, remove, or invent a tagged asset unless the user explicitly requests its removal from the scene.",
    currentCutCount
      ? `Preserve the current ${currentCutCount} CUT sections unless the user explicitly asks to add, remove, combine, or restructure shots.`
      : "Preserve the current shot structure unless the user explicitly asks to change it.",
    "Return strict JSON only with this exact shape:",
    '{"changeSummary":"one short sentence","styleDirection":"complete revised style direction","cameraDirection":"complete revised camera direction","sceneOverview":"complete revised scene overview","recommendedShotCount":3,"continuityLedger":"one compact line","mustHaveActions":"one compact line","cuts":[{"number":1,"shotFrame":"WS","cameraMovement":"Static","shotType":"Over-the-Shoulder","description":"one concise playable shot under 30 words"}]}',
    shotLogic,
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

export function appendFilmDirectorRevisionHistory(history = [], entry = {}, limit = filmDirectorRevisionHistoryLimit) {
  const nextEntry = {
    notes: String(entry.notes || "").trim(),
    summary: String(entry.summary || "").trim(),
    createdAt: String(entry.createdAt || new Date().toISOString())
  };
  if (!nextEntry.notes) return Array.isArray(history) ? history.slice(-limit) : [];
  return [...(Array.isArray(history) ? history : []), nextEntry].slice(-Math.max(1, limit));
}

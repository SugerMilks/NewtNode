export const filmDirectorStageKeys = ["setup", "style", "motion", "scene", "shotList"];

export function updateFilmDirectorStageLock(locks = {}, stage = "", locked = false) {
  if (!filmDirectorStageKeys.includes(stage)) return { ...(locks || {}) };
  return {
    ...(locks || {}),
    [stage]: Boolean(locked)
  };
}

export function unlockFilmDirectorStages(locks = {}, stages = []) {
  const affected = new Set((Array.isArray(stages) ? stages : []).filter((stage) => filmDirectorStageKeys.includes(stage)));
  return Object.fromEntries(
    Object.entries(locks || {}).map(([stage, locked]) => [stage, affected.has(stage) ? false : locked])
  );
}

export function filmDirectorStageNeedsDraft(stage = "", data = {}) {
  if (stage === "style") return !String(data.styleDirection || "").trim();
  if (stage === "shotList") return !String(data.shotList || "").trim();
  return false;
}

function normalizeShotCount(value) {
  const count = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

function normalizeDurationSeconds(value) {
  const duration = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(duration) && duration > 0 ? duration : 15;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function scaledWordRange(shotCount, durationSeconds) {
  const durationScale = clamp(Math.sqrt(normalizeDurationSeconds(durationSeconds) / 15), 0.78, 1.35);
  const baseRange = shotCount === 1
    ? [52, 76]
    : shotCount === 2
      ? [36, 54]
      : [30, 44];
  return baseRange.map((value) => Math.round(value * durationScale));
}

export function filmDirectorShotDetailProfile(shotCount = "Auto", durationSeconds = "15") {
  const count = normalizeShotCount(shotCount);

  if (!count) {
    return {
      mode: "auto",
      exampleDescription: "playable description whose information density follows the chosen CUT count",
      minimumWords: 0,
      maxCharsPerCut: 900,
      directive: [
        "After choosing recommendedShotCount, scale the information density of each CUT to that count.",
        "For 1 CUT, write one sustained master take that carries the full scene: include the opening composition and geography, ordered blocking and performance beats, motivated camera or framing evolution, important prop or environment interaction, and the ending composition or final hold.",
        "For 2 CUTS, give each shot a complete beginning, development, and clean handoff to the other shot.",
        "For 3 CUTS, give each shot a clear internal action progression and editorial handoff.",
        "For 4 or more CUTS, write one compact playable sentence of about 32-42 words that identifies the active subject, readable action, useful spatial or environment context, motivated camera behavior, and the ending state or handoff."
      ].join(" ")
    };
  }

  if (count === 1) {
    const [minimum, maximum] = scaledWordRange(count, durationSeconds);
    return {
      mode: "single",
      exampleDescription: "complete sustained take with opening composition, evolving blocking and camera, key action beats, and a final hold",
      minimumWords: Math.max(30, Math.round(minimum * 0.72)),
      maxCharsPerCut: 900,
      directive: [
        "Because exactly 1 CUT is requested, treat CUT 1 as a sustained master take that carries the complete scene, not a brief coverage fragment.",
        `In one cohesive playable paragraph of about ${minimum}-${maximum} words, describe the opening composition and spatial geography; the ordered subject blocking, performance, and prop or action beats; any motivated camera or framing evolution; and the ending composition or final hold.`,
        "Keep it one continuous shot with no hidden cuts, montage language, or alternate coverage."
      ].join(" ")
    };
  }

  if (count <= 3) {
    const [minimum, maximum] = scaledWordRange(count, durationSeconds);
    return {
      mode: "short",
      exampleDescription: "full playable beat with opening action, internal progression, and a clean editorial handoff",
      minimumWords: Math.max(18, Math.round(minimum * 0.72)),
      maxCharsPerCut: count === 2 ? 700 : 560,
      directive: [
        `Because only ${count} CUTS are requested, each shot must carry more of the scene than a normal coverage fragment.`,
        `Write about ${minimum}-${maximum} words per CUT, giving each shot a clear opening state, ordered blocking or performance progression, motivated camera behavior, and an ending state with a clean editorial handoff into the next shot.`,
        "Keep each CUT cohesive and playable; do not pad it with alternate coverage or actions that cannot fit the scene duration."
      ].join(" ")
    };
  }

  return {
    mode: "coverage",
    exampleDescription: "one compact playable shot with subject action, spatial context, camera behavior, and a clear ending handoff",
    minimumWords: 24,
    maxCharsPerCut: 520,
    directive: [
      "Write each CUT as one compact playable sentence of about 32-42 words.",
      "Include the active subject and readable action, one useful spatial or environment cue, motivated camera behavior, and the ending state or editorial handoff.",
      "Preserve connected asset tags and concrete continuity details, but do not repeat general style language or pad the shot with redundant adjectives."
    ].join(" ")
  };
}

export function filmDirectorShotDetailDirective(shotCount = "Auto", durationSeconds = "15") {
  return filmDirectorShotDetailProfile(shotCount, durationSeconds).directive;
}

export function filmDirectorShotDescriptionExample(shotCount = "Auto", durationSeconds = "15") {
  return filmDirectorShotDetailProfile(shotCount, durationSeconds).exampleDescription;
}

export function filmDirectorShotMinimumWords(shotCount = "Auto", durationSeconds = "15") {
  return filmDirectorShotDetailProfile(shotCount, durationSeconds).minimumWords;
}

export function filmDirectorShotMaxCharsPerCut(shotCount = "Auto", durationSeconds = "15") {
  return filmDirectorShotDetailProfile(shotCount, durationSeconds).maxCharsPerCut;
}

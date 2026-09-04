export const filmDirectorAudioModeValues = {
  production: "production",
  full: "full",
  silent: "silent"
};

export const filmDirectorAudioModeOptions = [
  { value: filmDirectorAudioModeValues.production, label: "Production Sound" },
  { value: filmDirectorAudioModeValues.full, label: "Full Audio" },
  { value: filmDirectorAudioModeValues.silent, label: "Silent" }
];

export const filmDirectorVisualSceneRules =
  "Scene rules: Cinematic naturalism, premium live-action realism, motivated light, cine lens language, grounded acting, real physics, no subtitles, continuity, 24fps smooth motion.";

export function normalizeFilmDirectorAudioMode(value = "", fallback = filmDirectorAudioModeValues.production) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (["production", "production sound", "diegetic", "diegetic only"].includes(normalized)) {
    return filmDirectorAudioModeValues.production;
  }
  if (["full", "full audio", "native audio"].includes(normalized)) return filmDirectorAudioModeValues.full;
  if (["silent", "silence", "no audio", "mute", "muted"].includes(normalized)) return filmDirectorAudioModeValues.silent;
  return Object.values(filmDirectorAudioModeValues).includes(fallback)
    ? fallback
    : filmDirectorAudioModeValues.production;
}

export function filmDirectorAudioModeLabel(value = "") {
  const normalized = normalizeFilmDirectorAudioMode(value);
  return filmDirectorAudioModeOptions.find((option) => option.value === normalized)?.label || "Production Sound";
}

export function filmDirectorAudioPolicyPrompt(value = "") {
  const mode = normalizeFilmDirectorAudioMode(value);
  if (mode === filmDirectorAudioModeValues.silent) {
    return "Audio policy: Silent output. Generate no dialogue, voices, ambience, room tone, sound effects, music, or soundtrack.";
  }
  if (mode === filmDirectorAudioModeValues.full) {
    return "Audio policy: Full native synchronized audio. Dialogue, diegetic sound, ambience, sound effects, and music are allowed when motivated by the scene.";
  }
  return "Audio policy: Production sound only. Allowed audio is natural spoken dialogue and quiet, continuous location room tone only. Background music: NONE. No BGM, score, soundtrack, instruments, melody, rhythm, tonal pad, drone, swell, sting, audio logo, transition cue, intro cue, or outro cue. From 0:00 through the final frame, maintain the same neutral room tone. Do not begin or end with musical or designed-audio punctuation.";
}

export function filmDirectorGenerateAudio(value = "") {
  return normalizeFilmDirectorAudioMode(value) !== filmDirectorAudioModeValues.silent;
}

export function applyFilmDirectorAudioPolicyToPrompt(prompt = "", value = "") {
  const source = String(prompt || "").trim();
  if (!source) return source;
  const replacement = `${filmDirectorVisualSceneRules}\n\n${filmDirectorAudioPolicyPrompt(value)}`;
  const withoutAudioPolicy = source
    .replace(/^Audio policy:[^\n]*(?:\n|$)/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (/^Scene rules:[^\n]*/im.test(withoutAudioPolicy)) {
    return withoutAudioPolicy
      .replace(/^Scene rules:[^\n]*/im, replacement)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const lines = withoutAudioPolicy.split("\n");
  let insertAt = 0;
  while (insertAt < lines.length && /^@[A-Za-z0-9][A-Za-z0-9_-]*\s*=/.test(lines[insertAt].trim())) insertAt += 1;
  lines.splice(insertAt, 0, ...(insertAt ? [""] : []), replacement, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeVideoGenerateAudio(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "on", "yes", "enabled"].includes(normalized)) return true;
  if (["false", "0", "off", "no", "disabled", "silent", "mute", "muted"].includes(normalized)) return false;
  return fallback !== false;
}

export function videoAudioEnforcementMode(generateAudio) {
  return normalizeVideoGenerateAudio(generateAudio) ? "provider" : "local-track-removal";
}

export const MY_NEWT_VOICE_MODEL = "gpt-transcribe";
export const MY_NEWT_VOICE_MAX_SECONDS = 120;
export const MY_NEWT_VOICE_MAX_BYTES = 8 * 1024 * 1024;
export const MY_NEWT_VOICE_SILENCE_MS = 3000;
export const MY_NEWT_VOICE_INITIAL_SILENCE_MS = 8000;
// https://developers.openai.com/api/docs/pricing (verified September 4, 2026).
export const MY_NEWT_VOICE_COST_PER_MINUTE = 0.0045;

export function myNewtVoiceCost(durationSeconds) {
  return Math.max(0, Number(durationSeconds) || 0) / 60 * MY_NEWT_VOICE_COST_PER_MINUTE;
}

export function appendDictation(current, transcript) {
  const text = String(transcript || "").trim();
  if (!text) return current || "";
  return `${current || ""}${current && !/\s$/.test(current) ? " " : ""}${text}`;
}

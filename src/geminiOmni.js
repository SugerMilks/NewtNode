export const geminiOmniDisplayName = "Gemini Omni Flash";
export const geminiOmniGoogleModel = "gemini-omni-flash-preview";
export const geminiOmniFalTextEndpoint = "google/gemini-omni-flash";
export const geminiOmniFalReferenceEndpoint = "google/gemini-omni-flash/reference-to-video";

export function isGeminiOmniModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("gemini") && normalized.includes("omni");
}

export function normalizeGeminiOmniDuration(value) {
  const seconds = Number.parseInt(String(value || "8").match(/\d+/)?.[0] || "8", 10);
  return Math.min(10, Math.max(3, Number.isFinite(seconds) ? seconds : 8));
}

export function normalizeGeminiOmniAspectRatio(value) {
  return String(value || "16:9").includes("9:16") ? "9:16" : "16:9";
}

export function uniqueGeminiOmniReferences(items = [], limit = 6) {
  const seen = new Set();
  return items
    .filter((item) => {
      const url = String(item?.url || "").trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, limit);
}

export function buildGeminiOmniPrompt({ prompt, hasStartFrame = false, references = [], generateAudio = true }) {
  const declarations = [];
  const tagMap = new Map();
  let imagePosition = 1;

  if (hasStartFrame) {
    declarations.push(`[# Sources <FIRST_FRAME>@Image${imagePosition}]`);
    imagePosition += 1;
  }

  references.forEach((reference, index) => {
    const token = `<IMAGE_REF_${index}>`;
    declarations.push(`[# References ${token}@Image${imagePosition}]`);
    imagePosition += 1;

    const label = cleanGeminiOmniTag(reference?.label || reference?.tag);
    if (label) tagMap.set(label.toLowerCase(), token);
  });

  let rewrittenPrompt = String(prompt || "").trim();
  rewrittenPrompt = rewrittenPrompt.replace(/@([A-Za-z0-9_-]+)/g, (match, name) => tagMap.get(name.toLowerCase()) || match);

  const guidance = [];
  if (hasStartFrame) guidance.push("Use the first image as the starting frame.");
  if (references.length) guidance.push("Use the remaining images as visual references, not literal initial frames.");
  guidance.push(generateAudio ? "Generate synchronized natural audio as directed by the scene." : "No dialogue, music, ambience, or sound effects. Output silent video.");

  return [declarations.join(" "), rewrittenPrompt, guidance.join(" ")].filter(Boolean).join("\n\n");
}

export function shouldFallbackGeminiOmniToFal(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  if (/safety|policy|blocked|recognizable|likeness|person|copyright|prohibited/.test(message)) return false;
  return status === 403 || status === 404 || status === 429 || status >= 500;
}

function cleanGeminiOmniTag(value) {
  return String(value || "")
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .slice(0, 64);
}

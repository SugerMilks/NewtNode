import { seedanceOutpaintPrompt } from "./videoOutpaint.js";

export const outpaintSubmissionByteLimit = 3900;
const bytes = text => new TextEncoder().encode(text).length;

export function outpaintEditablePromptBudget(plan, settings = {}, referenceImageCount = 0) {
  const overlap = settings.restoreSource === false ? 0 : settings.feather ?? 32;
  const reserved = bytes(seedanceOutpaintPrompt("", false, [], overlap, plan, referenceImageCount));
  return Math.max(0, Math.min(1100, outpaintSubmissionByteLimit - reserved - 16));
}

function clipWords(text, budget) {
  let result = "", length = 0;
  for (const character of text) {
    const size = bytes(character);
    if (length + size > budget) break;
    result += character; length += size;
  }
  // Prefer complete words; never split a Unicode code point.
  if (result.length < text.length && /\s/u.test(result)) result = result.replace(/\s+\S*$/u, "");
  return result.trim();
}

// Shared by drafting and submission, so stale drafts, pasted text and connected
// prompts also fit. The concise edit/preservation wrapper is never compacted.
export function fitOutpaintPrompt(value, maxBytes) {
  const text = String(value || "").trim();
  const budget = Math.max(0, Math.floor(maxBytes));
  if (bytes(text) <= budget) return text;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/u).map(s => s.trim()).filter(Boolean);
  const ranked = sentences.map((sentence, index) => ({ sentence, index,
    priority: (index === 0 ? 3 : 0) + (/\b(?:before|after|until|only when|enter|enters|exit|exits|absent|occlu\w*|frame|time|never|must not|do not|no new)\b|\d+(?:\.\d+)?\s*(?:s\b|seconds?)/i.test(sentence) ? 4 : 0)
  })).sort((a, b) => b.priority - a.priority || a.index - b.index);
  const chosen = [];
  let used = 0;
  for (const item of ranked) {
    const room = budget - used - (chosen.length ? 1 : 0);
    if (room <= 0) break;
    const fitted = bytes(item.sentence) <= room ? item.sentence : !chosen.length ? clipWords(item.sentence, room) : "";
    if (!fitted) continue;
    chosen.push({ ...item, sentence: fitted }); used += bytes(fitted) + (chosen.length > 1 ? 1 : 0);
  }
  return chosen.sort((a, b) => a.index - b.index).map(item => item.sentence).join(" ");
}

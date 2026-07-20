export const klingDirectorPromptMaxBytes = 500;
export const klingDirectorPromptTargetBytes = 440;

const protectedLiteralPattern = /<<<voice_\d+>>>|@[A-Za-z0-9_-]+|["“][^"”\n]+["”]/g;
const protectedTokenPattern = /__NN_LITERAL_\d+__/g;
const textEncoder = new TextEncoder();

export function klingDirectorPromptByteLength(text = "") {
  return textEncoder.encode(String(text || "")).length;
}

export function protectKlingDirectorPrompt(text = "") {
  const literals = [];
  const prompt = String(text || "").replace(protectedLiteralPattern, (literal) => {
    const token = `__NN_LITERAL_${literals.length + 1}__`;
    literals.push({ token, literal });
    return token;
  });
  return { prompt, literals };
}

export function restoreKlingDirectorPrompt(text = "", literals = []) {
  let prompt = String(text || "");
  literals.forEach(({ token, literal }) => {
    prompt = prompt.replaceAll(token, literal);
  });
  return prompt.trim();
}

export function klingDirectorOptimizationSystemPrompt() {
  return [
    "You compress production-ready AI video direction into concise English for Kling video models.",
    "Preserve shot order, action, blocking, camera direction, continuity, essential style, reference tags, and spoken dialogue.",
    "Prioritize the specific shot action over repeated global direction.",
    "Keep every __NN_LITERAL_N__ placeholder exactly unchanged.",
    "Do not add commentary or creative alternatives. Return only valid JSON matching the requested schema."
  ].join(" ");
}

export function buildKlingDirectorOptimizationPrompt(protectedPrompts = []) {
  const shots = protectedPrompts.map((item, index) => ({
    id: index + 1,
    text: String(item?.prompt || "")
  }));
  return [
    "Rewrite each shot as dense, natural English optimized for Kling multi-shot generation.",
    "Keep every __NN_LITERAL_N__ placeholder unchanged. Use concise camera abbreviations and remove repetition.",
    `Target no more than ${klingDirectorPromptTargetBytes} UTF-8 bytes per text. Never exceed ${klingDirectorPromptMaxBytes} UTF-8 bytes.`,
    'Return exactly this JSON shape: {"prompts":[{"id":1,"text":"..."}]}.',
    `Shots:\n${JSON.stringify(shots)}`
  ].join("\n\n");
}

function parseOptimizationJson(value = "") {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function hasSameProtectedTokens(source = "", optimized = "") {
  const sourceTokens = (String(source || "").match(protectedTokenPattern) || []).sort();
  const optimizedTokens = (String(optimized || "").match(protectedTokenPattern) || []).sort();
  return sourceTokens.length === optimizedTokens.length
    && sourceTokens.every((token, index) => token === optimizedTokens[index]);
}

export function parseKlingDirectorOptimizations(responseText = "", protectedPrompts = []) {
  const parsed = parseOptimizationJson(responseText);
  const entries = Array.isArray(parsed?.prompts) ? parsed.prompts : [];
  const byId = new Map(entries.map((entry) => [Number(entry?.id), String(entry?.text || "").trim()]));

  return protectedPrompts.map((source, index) => {
    const fallback = String(source?.prompt || "").trim();
    const optimized = byId.get(index + 1) || "";
    return optimized && hasSameProtectedTokens(fallback, optimized) ? optimized : fallback;
  });
}

export function clipKlingDirectorPrompt(text = "", maxBytes = klingDirectorPromptMaxBytes) {
  const prompt = String(text || "").replace(/\s+/g, " ").trim();
  if (klingDirectorPromptByteLength(prompt) <= maxBytes) return prompt;

  let candidate = "";
  for (const character of prompt) {
    if (klingDirectorPromptByteLength(candidate + character) > maxBytes) break;
    candidate += character;
  }
  const punctuation = Math.max(
    candidate.lastIndexOf("。"),
    candidate.lastIndexOf("！"),
    candidate.lastIndexOf("？"),
    candidate.lastIndexOf(";"),
    candidate.lastIndexOf("；"),
    candidate.lastIndexOf(".")
  );
  const boundary = punctuation >= Math.floor(candidate.length * 0.65)
    ? punctuation + 1
    : candidate.lastIndexOf(" ");
  return candidate.slice(0, boundary > 0 ? boundary : candidate.length).trim();
}

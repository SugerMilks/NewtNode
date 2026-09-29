import { lexer } from "marked";
import { parse } from "parse5";

export const KREA_PRICING_URL = "https://api.krea.ai/openapi.json";
export const OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing.md";
export const GOOGLE_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";

export const kreaPricingModels = [
  ["/generate/image/bytedance/seedream-5-pro", ["resolutionTier", "referenceImageCount"]],
  ["/generate/image/google/nano-banana-2", ["resolution"]],
  ["/generate/image/google/nano-banana-pro", ["resolution"]],
  ["/generate/video/bytedance/seedance-2", ["resolution", "hasVideoReference", "duration"]],
  ["/generate/video/bytedance/seedance-2-5", ["resolution", "hasVideoReference", "duration"]],
  ["/generate/video/kling/kling-3.0", ["mode", "generateAudio", "duration"]],
  ["/generate/video/minimax/hailuo-3", ["billableSeconds", "referenceImageCount"]],
  ["/generate/image/openai/gpt-image-2", null],
  ["/generate/image/openai/gpt-image-2.5-sunburst", null],
  ["/generate/image/openai/gpt-image-2.5-flare", null],
  ["/generate/3d/tencent/hunyuan3d-3.1-pro", null]
];

const money = (text) => /^\$\d+(?:\.\d+)?$/.test(text.trim()) ? Number(text.trim().slice(1)) : NaN;
export const pointKey = (point) => JSON.stringify(Object.entries(point.dimensions).sort(([a], [b]) => a.localeCompare(b)));

export function validatePricingEntry(entry, previous = null) {
  if (entry?.currency !== "USD" || !["request", "image", "million tokens", "minute"].includes(entry.unit)
    || !Array.isArray(entry.points) || !entry.points.length || entry.points.length > 2000) throw new Error("Unsupported currency, unit, or empty price table.");
  const keys = new Set();
  for (const point of entry.points) {
    if (typeof point.amount !== "number" || !Number.isFinite(point.amount) || point.amount <= 0 || point.amount > 250
      || !point.dimensions || Array.isArray(point.dimensions)
      || Object.values(point.dimensions).some((value) => !["string", "boolean", "number"].includes(typeof value))) throw new Error("Invalid or unusual price; review required.");
    const key = pointKey(point);
    if (keys.has(key)) throw new Error("Duplicate pricing dimensions.");
    keys.add(key);
    const old = previous?.points?.find((item) => pointKey(item) === key)?.amount;
    if (old > 0 && (point.amount > old * 2 || point.amount < old / 2)) throw new Error("Price changed by more than 2x; review required.");
  }
  if (previous && (previous.unit !== entry.unit || previous.points.some((point) => !keys.has(pointKey(point))))) throw new Error("Billing unit or supported settings changed; review required.");
  return entry;
}

export function parseKreaPricing(schema) {
  if (!schema?.openapi?.startsWith("3.") || !schema.paths) throw new Error("Krea did not return an OpenAPI price catalog.");
  return kreaPricingModels.map(([endpoint, dimensions]) => {
    const pricing = schema.paths[endpoint]?.post?.["x-krea-pricing"];
    const result = { id: `krea:${endpoint}`, label: endpoint.split("/").slice(3).join("/"), source: KREA_PRICING_URL };
    if (!dimensions || !pricing) return { ...result, issue: "No supported published price table. Existing estimate retained." };
    if (pricing.type !== "fixed" || pricing.unit !== "request") return { ...result, issue: "Billing rules changed; existing estimate retained." };
    try {
      const entry = { currency: pricing.currency, unit: "request", source: KREA_PRICING_URL,
        points: pricing.price_points?.map((point) => ({ amount: point.amount, dimensions: point.dimensions })) };
      if (entry.points?.some((point) => Object.keys(point.dimensions || {}).sort().join() !== [...dimensions].sort().join())) throw new Error("Pricing dimensions changed; review required.");
      for (const point of entry.points || []) for (const [key, value] of Object.entries(point.dimensions)) {
        if (["duration", "billableSeconds", "referenceImageCount"].includes(key) && (!Number.isInteger(value) || value < 0 || value > 30)) throw new Error("Numeric billing dimensions changed; review required.");
        if (["hasVideoReference", "generateAudio"].includes(key) && typeof value !== "boolean") throw new Error("Audio/reference billing dimensions changed; review required.");
        if (["resolution", "resolutionTier", "mode"].includes(key) && (typeof value !== "string" || value.length > 40)) throw new Error("Invalid pricing dimension.");
      }
      return { ...result, entry: validatePricingEntry(entry) };
    } catch (error) { return { ...result, issue: error.message }; }
  });
}

export function parseOpenAiPricing(markdown) {
  const tokens = lexer(markdown);
  const heading = tokens.findIndex((token) => token.type === "heading" && token.text === "Standard pricing data");
  if (heading < 0 || !/Prices per 1M tokens\./.test(markdown.slice(0, markdown.indexOf("### Standard pricing data")))) throw new Error("OpenAI Standard pricing table unavailable.");
  const table = tokens[heading + 1]?.type === "table" ? tokens[heading + 1] : tokens.slice(heading + 1).find((token) => token.type !== "space");
  const headers = ["Model", ...["Short", "Long"].flatMap((context) => ["input", "cached input", "cache writes", "output"].map((metric) => `${context} context ${metric}`))];
  if (table?.type !== "table" || JSON.stringify(table.header.map((cell) => cell.text)) !== JSON.stringify(headers)) throw new Error("OpenAI pricing columns changed; review required.");
  const results = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-6-astra"].map((model) => {
    const rows = table.rows.filter((row) => row[0].text === model);
    const result = { id: `openai:${model}`, label: model, source: OPENAI_PRICING_URL };
    if (rows.length !== 1) return { ...result, issue: "Model missing from Standard price table." };
    const points = ["short", "long"].flatMap((context, index) => ["input", "cached", "writes", "output"].map((metric, column) =>
      ({ dimensions: { context, metric }, amount: money(rows[0][1 + index * 4 + column].text) })));
    return { ...result, entry: { currency: "USD", unit: "million tokens", source: OPENAI_PRICING_URL, points } };
  });
  const voiceRows = tokens.filter((token) => token.type === "table").flatMap((table) => table.rows).filter((row) => row[0]?.text === "gpt-transcribe");
  const voicePrices = voiceRows.flatMap((row) => row.map((cell) => cell.text).filter((text) => /^\$\d+(?:\.\d+)? \/ minute$/.test(text)));
  results.push(voicePrices.length === 1
    ? { id: "openai:gpt-transcribe", label: "Voice transcription", entry: { currency: "USD", unit: "minute", source: OPENAI_PRICING_URL,
      points: [{ dimensions: {}, amount: money(voicePrices[0].replace(" / minute", "")) }] } }
    : { id: "openai:gpt-transcribe", label: "Voice transcription", issue: "Transcription price unavailable or ambiguous.", source: OPENAI_PRICING_URL });
  return results;
}

export function googlePricingTables(html) {
  const tables = [];
  const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join(" ");
  const walk = (node) => {
    if (node.tagName === "table") tables.push(text(node).replace(/\s+/g, " ").trim());
    for (const child of node.childNodes || []) walk(child);
  };
  walk(parse(html));
  if (!tables.length || !tables.some((table) => /Paid Tier|Paid tier|Price/.test(table))) throw new Error("Google pricing tables unavailable.");
  return tables;
}

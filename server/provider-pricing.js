import { createHash } from "node:crypto";
import { buildAtlasImageRequest } from "../src/atlasImages.js";
import { buildAtlasVideoRequest } from "../src/atlasVideos.js";
import { atlasPricingEndpoints } from "../src/atlasPricing.js";
import { generationEstimate } from "../src/generationPricing.js";
import { generationQuoteSettings, QUOTE_TTL_MS } from "../src/pricingTrust.js";

export const ATLAS_CALCULATE_URL = "https://api.atlascloud.ai/api/v1/model/calculate";
export const FAL_BILLING_URL = "https://api.fal.ai/v1/models/billing-events";
const amount = value => (typeof value === "number" || typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))
  && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

async function jsonRequest(fetchImpl, url, key, body, timeout = 8000) {
  const response = await fetchImpl(url, { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(timeout),
    headers: { Authorization: `${String(url).startsWith("https://api.fal.ai/") ? "Key" : "Bearer"} ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Price service HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 2e6) throw new Error("Invalid pricing response"); chunks.push(chunk); }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (Number(data?.code) >= 400) throw new Error("Provider estimate unavailable");
  return data;
}

export function parseAtlasQuote(data, now = Date.now()) {
  const value = data?.data;
  const price = amount(value?.price);
  if (!value || price === null || (value.currency != null && value.currency !== "USD")
    || (value.estimated != null && typeof value.estimated !== "boolean")) return null;
  return { amountUsd: price, currency: "USD", estimated: true, pricingStatus: "estimated", pricingSource: ATLAS_CALCULATE_URL,
    pricingCheckedAt: new Date(now).toISOString(), pricingBasis: value.estimated
      ? "Atlas account estimate; final token usage may differ." : "Atlas account quote for the submitted settings; not a settled charge." };
}

export function parseFalBilling(data, requestId, endpoint) {
  if (!Array.isArray(data?.billing_events) || data.has_more) return null;
  const rows = data.billing_events.filter(row => row.request_id === requestId && row.endpoint_id === endpoint);
  if (rows.length !== 1 || amount(rows[0].cost_total) === null || (rows[0].currency != null && rows[0].currency !== "USD")) return null;
  return { amountUsd: amount(rows[0].cost_total), currency: "USD", estimated: false, pricingStatus: "actual",
    pricingSource: FAL_BILLING_URL, pricingBasis: "Provider-reported charge for this request, including account discount." };
}

export class ProviderPricing {
  constructor({ pricing, getKey, fetchImpl = fetch, now = Date.now }) {
    Object.assign(this, { pricing, getKey, fetchImpl, now });
    this.cache = new Map(); this.pending = new Map();
  }

  async atlasInput(input, key) {
    if (!key || !atlasPricingEndpoints.includes(input?.model)) return null;
    try { return parseAtlasQuote(await jsonRequest(this.fetchImpl, ATLAS_CALCULATE_URL, key, input), this.now()); }
    catch { return null; } // Price lookup failure must never cancel or replay a generation.
  }

  async falCharge(requestId, endpoint, key) {
    if (!key || typeof requestId !== "string" || !requestId || typeof endpoint !== "string") return null;
    const url = new URL(FAL_BILLING_URL);
    url.searchParams.set("request_id", requestId); url.searchParams.set("endpoint_id", endpoint); url.searchParams.set("limit", "2");
    try { return parseFalBilling(await jsonRequest(this.fetchImpl, url, key, null, 2500), requestId, endpoint); }
    catch { return null; }
  }

  quote(raw) {
    const options = generationQuoteSettings(raw);
    if (!["image", "video"].includes(options.kind) || !["atlas", "fal", "krea", "google"].includes(options.provider)
      || typeof options.model !== "string" || options.model.length > 120 || options.batchCount > 100
      || Object.values(options).some(value => typeof value === "string" && value.length > 120)
      || [options.referenceCount, options.referenceImageCount, options.startFrameCount, options.endFrameCount, options.audioReferenceCount].some(value => !Number.isInteger(value) || value < 0 || value > 100))
      throw new Error("Invalid pricing settings.");
    const accountRevision = this.pricing.accounts();
    const id = createHash("sha256").update(JSON.stringify([accountRevision, this.pricing.catalog().revision, options])).digest("hex");
    const cached = this.cache.get(id);
    if (cached && this.now() - Date.parse(cached.checkedAt) < QUOTE_TTL_MS) return Promise.resolve(cached);
    if (this.pending.has(id)) return this.pending.get(id);
    // Bound both completed and in-flight requests; no unbounded provider fan-out.
    if (this.pending.size >= 4) return Promise.resolve(this.fallback(options, accountRevision));
    const work = this.resolve(options, accountRevision).then(result => {
      if (accountRevision !== this.pricing.accounts()) return this.fallback(options, this.pricing.accounts());
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(id, result); return result;
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, work); return work;
  }

  fallback(options, accountRevision) {
    const enabled = this.pricing.getEnabledProviders()[options.provider];
    const local = enabled ? generationEstimate(options) : { amountUsd: null, pricingStatus: "unavailable", pricingBasis: "Provider disabled." };
    return { ...local, currency: "USD", estimated: true,
      checkedAt: new Date(this.now()).toISOString(), accountRevision };
  }

  async resolve(options, accountRevision) {
    this.pricing.ensureFresh().catch(() => {});
    const fallback = this.fallback(options, accountRevision);
    if (options.seedanceTask === "edit" || options.seedanceDraft) return fallback;
    const key = this.getKey(options.provider);
    if (!key || !this.pricing.getEnabledProviders()[options.provider]) return fallback;
    let quote = null;
    try {
      if (options.provider === "atlas") {
        // Display quotes never upload assets or fabricate reference URLs. Reference and
        // token-image requests retain their local estimate until the real run is prepared.
        const references = options.referenceCount + options.referenceImageCount + options.startFrameCount + options.endFrameCount + options.audioReferenceCount;
        if (references || options.hasVideoReference || /OpenAI/.test(options.model) || /auto/i.test(options.duration)) return fallback;
        const input = options.kind === "image" ? buildAtlasImageRequest({ model: options.model, prompt: "Price estimate", resolution: options.resolution, aspectRatio: options.aspectRatio })
          : buildAtlasVideoRequest({ model: options.model, prompt: "Price estimate", duration: options.duration, resolution: options.resolution,
            aspectRatio: options.aspectRatio, generateAudio: options.model === "MiniMax H3" || options.generateAudio });
        quote = await this.atlasInput(input, key);
      }
    } catch { return fallback; }
    return quote ? { ...quote, amountUsd: Math.round(quote.amountUsd * options.batchCount * 1e6) / 1e6,
      checkedAt: new Date(this.now()).toISOString(), accountRevision } : fallback;
  }
}

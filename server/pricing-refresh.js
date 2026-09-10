import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "./json-store.js";
import { ATLAS_PRICING_URL, parseAtlasPricing } from "./atlas-pricing.js";
import {
  FAL_PRICING_URL, GOOGLE_PRICING_URL, KREA_PRICING_URL, OPENAI_PRICING_URL,
  falFixedPricing, falPricingEndpoints, googlePricingTables, parseFalPricing, parseKreaPricing,
  parseOpenAiPricing, pointKey, validatePricingEntry
} from "./pricing-sources.js";

const HOUR = 3600000;
const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23" });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const iso = (value) => new Date(value).toISOString();
const blank = () => ({ version: 1, enabled: true, revision: "bundled", entries: {}, sources: {}, changes: [], lastCheckAt: null, lastScheduledSlot: null });

export function latestPricingSlot(now) {
  for (let time = Math.floor(now / HOUR) * HOUR, n = 0; n < 170; n++, time -= HOUR) {
    const parts = Object.fromEntries(eastern.formatToParts(time).map((part) => [part.type, part.value]));
    if (parts.weekday === "Mon" && parts.hour === "04") return time;
  }
  throw new Error("Could not resolve weekly Eastern pricing schedule.");
}

export function nextPricingSlot(now) {
  let time = Math.floor(now / HOUR) * HOUR + HOUR;
  for (let n = 0; n < 170; n++, time += HOUR) {
    const parts = Object.fromEntries(eastern.formatToParts(time).map((part) => [part.type, part.value]));
    if (parts.weekday === "Mon" && parts.hour === "04") return time;
  }
  throw new Error("Could not resolve next pricing schedule.");
}

export class PricingRefresh {
  constructor({ filePath, getFalKey = () => "", refreshKeys = async () => {}, fetchImpl = fetch, now = Date.now, write = writeJsonAtomic, enableAtlasPricing = false }) {
    Object.assign(this, { filePath, getFalKey, refreshKeys, fetchImpl, now, write, enableAtlasPricing });
    this.state = blank(); this.running = null; this.timer = null; this.error = ""; this.lastFailureAt = -Infinity;
    this.settingsQueue = Promise.resolve();
    this.ready = this.load();
  }

  async load() {
    try {
      const state = JSON.parse(await readFile(this.filePath, "utf8"));
      const record = (value) => value && typeof value === "object" && !Array.isArray(value);
      if (state?.version !== 1 || typeof state.enabled !== "boolean" || typeof state.revision !== "string"
        || !record(state.entries) || !record(state.sources) || !Array.isArray(state.changes)
        || state.changes.some((change) => !record(change))
        || Object.values(state.sources).some((source) => !record(source) || (source.reviews && !Array.isArray(source.reviews)))
        || [state.lastCheckAt, state.lastScheduledSlot, state.retryAt].some((value) => value != null && !Number.isFinite(Date.parse(value)))) {
        throw new Error("Invalid stored pricing catalog.");
      }
      for (const [id, entry] of Object.entries(state.entries)) {
        if (!/^(fal|krea|openai|atlas):/.test(id)) throw new Error("Invalid stored pricing provider.");
        validatePricingEntry(entry);
      }
      this.state = { ...blank(), ...state };
    } catch (error) {
      if (error.code !== "ENOENT") this.error = "Saved pricing could not be read. Bundled estimates are in use until a successful refresh.";
    }
  }

  account() { const key = this.getFalKey(); return key ? hash(`newtnode-pricing:${key}`) : null; }

  catalog() {
    const account = this.account();
    const entries = Object.fromEntries(Object.entries(this.state.entries).filter(([id]) => !id.startsWith("fal:") || (account && account === this.state.falAccount)));
    return { version: 1, revision: `${this.state.revision}:${account ? (account === this.state.falAccount ? "fal" : "new-account") : "no-fal"}`, entries };
  }

  status() {
    const sources = structuredClone(this.state.sources);
    if (!this.account() || this.account() !== this.state.falAccount) sources.fal = {
      status: "unavailable", message: this.account() ? "This Fal key has not been checked. Using bundled estimates." : "Fal is disabled or has no active key. Using bundled estimates.",
      checkedAt: null, applied: 0, reviews: []
    };
    return {
      enabled: this.state.enabled, running: Boolean(this.running), schedule: "Monday, 4:00 AM Eastern", timeZone: "America/New_York",
      nextCheckAt: this.state.retryAt || iso(nextPricingSlot(this.now())), lastCheckAt: this.state.lastCheckAt, error: this.error,
      sources, changes: this.state.changes, catalog: this.catalog()
    };
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), 60000);
    this.timer.unref?.();
    this.tick().catch(() => {});
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  async tick() {
    await this.ready;
    if (!this.state.enabled || this.running || this.now() - this.lastFailureAt < HOUR) return;
    if (this.state.lastScheduledSlot !== iso(latestPricingSlot(this.now())) || (this.state.retryAt && Date.parse(this.state.retryAt) <= this.now())) await this.refresh();
  }

  setEnabled(enabled) {
    const running = this.running;
    const task = this.settingsQueue.catch(() => {}).then(async () => {
      if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false.");
      await this.ready;
      if (running) await running.catch(() => {});
      const next = { ...this.state, enabled };
      await this.write(this.filePath, next, { mode: 0o600 }); this.state = next;
      return this.status();
    });
    this.settingsQueue = task;
    task.then(() => { if (enabled) this.tick().catch(() => {}); }).catch(() => {});
    return task;
  }

  async read(url, headers = {}) {
    const response = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.ok) throw new Error(`Pricing source returned HTTP ${response.status}. Existing rates retained.`);
    if (Number(response.headers.get("content-length")) > 12000000) throw new Error("Pricing response is too large.");
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 12000000) throw new Error("Pricing response is too large.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  async falResults(key) {
    const prices = [];
    const url = new URL(FAL_PRICING_URL);
    for (const endpoint of falPricingEndpoints) url.searchParams.append("endpoint_id", endpoint);
    const seen = new Set();
    for (let page = 0; page < 5; page++) {
      const result = JSON.parse(await this.read(url, { Authorization: `Key ${key}` }));
      if (!Array.isArray(result.prices)) throw new Error("Invalid Fal price response.");
      prices.push(...result.prices);
      if (!result.has_more) return parseFalPricing({ prices });
      if (!result.next_cursor || seen.has(result.next_cursor)) throw new Error("Invalid Fal pagination.");
      seen.add(result.next_cursor); url.searchParams.set("cursor", result.next_cursor);
    }
    throw new Error("Fal pricing pagination exceeded its limit.");
  }

  refresh() {
    if (this.running) return this.running;
    this.running = this.settingsQueue.catch(() => {}).then(() => this.performRefresh()).catch((error) => {
      this.lastFailureAt = this.now(); this.error = "Pricing refresh could not be saved or completed. Existing rates retained.";
      throw error;
    }).finally(() => { this.running = null; });
    return this.running;
  }

  async performRefresh() {
    await this.ready; await this.refreshKeys();
    const started = this.now(), checkedAt = iso(started), key = this.getFalKey(), account = this.account();
    const next = structuredClone(this.state), changes = [];
    if (next.falAccount !== account) {
      for (const id of Object.keys(next.entries)) if (id.startsWith("fal:")) delete next.entries[id];
      next.falAccount = account;
    }
    const tasks = [
      ...(this.enableAtlasPricing ? [["atlas", async () => parseAtlasPricing(JSON.parse(await this.read(ATLAS_PRICING_URL)))]] : []),
      ["krea", async () => parseKreaPricing(JSON.parse(await this.read(KREA_PRICING_URL)))],
      ["openai", async () => parseOpenAiPricing(await this.read(OPENAI_PRICING_URL))],
      ["fal", async () => key ? this.falResults(key) : null],
      ["google", async () => {
        const digest = hash(JSON.stringify(googlePricingTables(await this.read(GOOGLE_PRICING_URL))));
        const changed = next.sources.google?.digest && next.sources.google.digest !== digest;
        return [{ id: "google:direct-images", label: "Direct Google image pricing", digest, source: GOOGLE_PRICING_URL,
          issue: changed ? "Published pricing tables changed. Direct Google billing needs review; existing estimates retained."
            : "Published pricing tables checked. Token-based image billing needs review before automatic updates." }];
      }]
    ];
    for (const [provider, read] of tasks) {
      try {
        const results = await read();
        if (!results) { next.sources[provider] = { status: "unavailable", message: "No enabled API key.", checkedAt: null, applied: 0, reviews: [] }; continue; }
        const reviews = []; let applied = 0;
        for (const result of results) {
          const previous = next.entries[result.id];
          if (result.observed) {
            const old = next.sources[provider]?.observations?.[result.id];
            if (old && JSON.stringify(old) !== JSON.stringify(result.observed)) changes.push({ at: checkedAt, model: result.label, provider, action: "Review required", previous: old, current: result.observed });
          }
          try {
            if (result.issue) throw new Error(result.issue);
            const baseline = falFixedPricing[result.id.slice(4)];
            const comparison = previous || (provider === "fal" && baseline ? { unit: baseline.unit, points: [{ dimensions: {}, amount: baseline.baseline }] } : null);
            const entry = validatePricingEntry(result.entry, comparison);
            const altered = entry.points.filter((point) => previous?.points.find((old) => pointKey(old) === pointKey(point))?.amount !== point.amount).length;
            if (altered) changes.push({ at: checkedAt, model: result.label, provider, action: previous ? "Updated" : "Verified", pricePoints: altered });
            next.entries[result.id] = { ...entry, checkedAt };
            applied++;
          } catch (error) { reviews.push({ model: result.label, message: error.message, source: result.source }); }
        }
        next.sources[provider] = { status: reviews.length ? "partial" : "current", checkedAt, applied, reviews,
          observations: Object.fromEntries(results.filter((item) => item.observed).map((item) => [item.id, item.observed])),
          ...(results[0]?.digest ? { digest: results[0].digest } : {}) };
      } catch (error) {
        next.sources[provider] = { ...next.sources[provider], status: "error", attemptedAt: checkedAt,
          message: error.message.startsWith("Pricing source") ? error.message : "Could not verify the published prices. Existing rates retained." };
      }
    }
    // Never publish a quote fetched for a key that was replaced during this check.
    if (account !== this.account()) {
      for (const id of Object.keys(next.entries)) if (id.startsWith("fal:")) delete next.entries[id];
      next.falAccount = null;
    }
    next.revision = `${checkedAt}:${hash(JSON.stringify(next.entries)).slice(0, 12)}`;
    next.lastCheckAt = checkedAt; next.lastScheduledSlot = iso(latestPricingSlot(started));
    const retryCount = this.state.lastScheduledSlot === next.lastScheduledSlot ? (this.state.retryCount || 0) : 0;
    const failed = Object.values(next.sources).some((source) => source.status === "error");
    next.retryCount = failed ? retryCount + 1 : 0;
    next.retryAt = failed && next.retryCount <= 3 ? iso(this.now() + HOUR) : null;
    next.changes = [...changes, ...next.changes].slice(0, 100);
    await this.write(this.filePath, next, { mode: 0o600 });
    this.state = next; this.error = "";
    return this.status();
  }
}

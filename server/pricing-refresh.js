import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "./json-store.js";
import { ATLAS_PRICING_URL, parseAtlasPricing } from "./atlas-pricing.js";
import { atlasPricingSpecs, atlasSeedanceEstimateEndpoints, atlasPricingEndpoints } from "../src/atlasPricing.js";
import { priceState, PRICE_REFRESH_MS } from "../src/pricingTrust.js";
import {
  KREA_PRICING_URL, OPENAI_PRICING_URL,
  kreaPricingModels, parseKreaPricing,
  parseOpenAiPricing, pointKey, validatePricingEntry
} from "./pricing-sources.js";

const HOUR = 3600000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const iso = (value) => new Date(value).toISOString();
const autoRefreshPreferenceVersion = 1;
const blank = () => ({ version: 1, enabled: false, autoRefreshPreferenceVersion, revision: "bundled", entries: {}, sources: {}, changes: [], lastCheckAt: null, lastScheduledSlot: null });

const supportedPricingEntry = (id) => id.startsWith("openai:")
  || kreaPricingModels.some(([endpoint]) => id === `krea:${endpoint}`)
  || [...atlasPricingEndpoints, "openai/gpt-6-astra", "openai/gpt-6-sol", "openai/gpt-5.6-luna"].some(endpoint => id === `atlas:${endpoint}`);

export class PricingRefresh {
  constructor({ filePath, getFalKey = () => "", getProviderKey = () => "", getEnabledProviders, refreshKeys = async () => {}, fetchImpl = fetch, now = Date.now, write = writeJsonAtomic, enableAtlasPricing = false }) {
    Object.assign(this, { filePath, getFalKey, getProviderKey, refreshKeys, fetchImpl, now, write, enableAtlasPricing });
    this.getEnabledProviders = getEnabledProviders || (() => ({ krea: true, openai: true, atlas: enableAtlasPricing, fal: Boolean(getFalKey()) }));
    this.accountRevision = randomUUID(); this.credentialSignature = ""; this.progress = null;
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
      state.entries = Object.fromEntries(Object.entries(state.entries).filter(([id]) => supportedPricingEntry(id)));
      for (const [id, entry] of Object.entries(state.entries)) {
        if (!/^(fal|krea|openai|atlas):/.test(id)) throw new Error("Invalid stored pricing provider.");
        validatePricingEntry(entry);
      }
      for (const [provider, source] of Object.entries(state.sources)) {
        if (provider === "fal") { delete state.sources[provider]; continue; }
        if (["krea", "atlas"].includes(provider) && source.reviews) {
          source.reviews = source.reviews.filter(review => provider === "krea"
            ? kreaPricingModels.some(([endpoint]) => endpoint.split("/").slice(3).join("/") === review.model)
            : supportedPricingEntry(`atlas:${review.model}`));
        }
        if (source.observations) source.observations = Object.fromEntries(Object.entries(source.observations).filter(([id]) => supportedPricingEntry(id)));
      }
      this.state = { ...blank(), ...state };
      // Apply the opt-in default once on upgrade, then retain the user's choice.
      if (state.autoRefreshPreferenceVersion !== autoRefreshPreferenceVersion) {
        this.state = { ...this.state, enabled: false, autoRefreshPreferenceVersion, retryAt: null, retryCount: 0 };
        try { await this.write(this.filePath, this.state, { mode: 0o600 }); }
        catch { this.error = "Auto refresh is off, but the preference could not be saved."; }
      }
    } catch (error) {
      if (error.code !== "ENOENT") this.error = "Saved pricing could not be read. Bundled estimates are in use until a successful refresh.";
    }
  }


  accounts() {
    const enabled = this.getEnabledProviders();
    const signature = hash(JSON.stringify([enabled, this.getFalKey(), this.getProviderKey("atlas")]));
    if (signature !== this.credentialSignature) { this.credentialSignature = signature; this.accountRevision = randomUUID(); }
    return this.accountRevision;
  }

  catalog() {
    const enabled = this.getEnabledProviders(), accountRevision = this.accounts();
    const entries = Object.fromEntries(Object.entries(this.state.entries).filter(([id]) => supportedPricingEntry(id) && enabled[id.split(":")[0]]));
    return { version: 1, policyVersion: 2, accountRevision,
      revision: `${this.state.revision}:${accountRevision}:${Math.floor(this.now() / HOUR)}`, entries };
  }

  snapshot() { return { ...this.catalog(), capturedAt: iso(this.now()) }; }

  status() {
    const sources = structuredClone(this.progress || this.state.sources);
    const enabled = this.getEnabledProviders();
    for (const provider of ["krea", "atlas", "fal", "openai", "google"]) {
      if (!enabled[provider]) { sources[provider] = { status: "disabled", applied: 0, reviews: [] }; continue; }
      if (provider === "google" || provider === "fal") { sources[provider] = { status: "bundled", applied: 0, reviews: [] }; continue; }
      const source = sources[provider] ||= { status: "pending", applied: 0, reviews: [] };
      const entries = Object.entries(this.catalog().entries).filter(([id]) => id.startsWith(`${provider}:`)).map(([, value]) => value);
      source.current = entries.filter(entry => priceState(entry, this.now()) === "current").length;
      source.stale = entries.filter(entry => priceState(entry, this.now()) === "stale").length;
      source.unavailable = entries.filter(entry => ["expired", "unavailable"].includes(priceState(entry, this.now()))).length;
      if (source.status === "current" && (source.stale || source.unavailable)) source.status = "stale";
    }
    return {
      enabled: this.state.enabled, running: Boolean(this.running), schedule: "Daily freshness check",
      nextCheckAt: this.state.enabled ? this.state.retryAt || (this.state.lastCheckAt ? iso(Date.parse(this.state.lastCheckAt) + PRICE_REFRESH_MS) : null) : null, lastCheckAt: this.state.lastCheckAt, error: this.error,
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
    const due = !this.state.lastCheckAt || this.now() - Date.parse(this.state.lastCheckAt) >= PRICE_REFRESH_MS;
    if (due || (this.state.retryAt && Date.parse(this.state.retryAt) <= this.now())) await this.refresh();
  }

  async ensureFresh() {
    await this.ready;
    if (!this.state.enabled) return;
    const enabled = this.getEnabledProviders();
    const unchecked = ["krea", "atlas", "openai"].some(provider => enabled[provider]
      && (!this.state.sources[provider]?.checkedAt && !this.state.sources[provider]?.attemptedAt));
    if (unchecked && (!this.state.lastCheckAt || this.now() - Date.parse(this.state.lastCheckAt) >= HOUR)) return this.refresh();
    return this.tick();
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

  refresh() {
    if (this.running) return this.running;
    this.running = this.settingsQueue.catch(() => {}).then(() => this.performRefresh()).catch((error) => {
      this.lastFailureAt = this.now(); this.error = "Pricing refresh could not be saved or completed. Existing rates retained.";
      throw error;
    }).finally(() => { this.running = null; this.progress = null; });
    return this.running;
  }

  async performRefresh() {
    await this.ready; await this.refreshKeys();
    const started = this.now(), checkedAt = iso(started);
    const next = structuredClone(this.state), changes = [], enabled = this.getEnabledProviders();
    this.progress = {};
    const tasks = [
      ...(this.enableAtlasPricing ? [["atlas", async () => parseAtlasPricing(JSON.parse(await this.read(ATLAS_PRICING_URL))).filter(result => {
        const endpoint = result.id.slice(6);
        return atlasPricingSpecs[endpoint] || atlasSeedanceEstimateEndpoints.includes(endpoint) || ["openai/gpt-6-astra", "openai/gpt-6-sol", "openai/gpt-5.6-luna"].includes(endpoint);
      })]] : []),
      ["krea", async () => parseKreaPricing(JSON.parse(await this.read(KREA_PRICING_URL))).filter(result => kreaPricingModels.find(([endpoint]) => `krea:${endpoint}` === result.id)?.[1])],
      ["openai", async () => parseOpenAiPricing(await this.read(OPENAI_PRICING_URL))]
    ];
    for (const [provider, read] of tasks) {
      if (!enabled[provider]) { next.sources[provider] = { status: "disabled", applied: 0, reviews: [] }; this.progress[provider] = next.sources[provider]; continue; }
      this.progress[provider] = { status: "checking", applied: 0, reviews: [] };
      try {
        const results = await read();
        const reviews = []; let applied = 0;
        for (const result of results) {
          const previous = next.entries[result.id];
          if (result.observed) {
            const old = next.sources[provider]?.observations?.[result.id];
            if (old && JSON.stringify(old) !== JSON.stringify(result.observed)) changes.push({ at: checkedAt, model: result.label, provider, action: "Review required", previous: old, current: result.observed });
          }
          try {
            if (result.issue) throw new Error(result.issue);
            const entry = validatePricingEntry(result.entry, previous);
            const altered = entry.points.filter((point) => previous?.points.find((old) => pointKey(old) === pointKey(point))?.amount !== point.amount).length;
            if (altered) changes.push({ at: checkedAt, model: result.label, provider, action: previous ? "Updated" : "Verified", pricePoints: altered });
            next.entries[result.id] = { ...entry, checkedAt };
            applied++;
          } catch (error) {
            reviews.push({ model: result.label, message: error.message, source: result.source });
            if (previous) next.entries[result.id] = { ...previous, invalidatedAt: checkedAt };
          }
        }
        next.sources[provider] = { status: reviews.length ? "partial" : "current", checkedAt, applied, reviews,
          observations: Object.fromEntries(results.filter((item) => item.observed).map((item) => [item.id, item.observed])),
          ...(results[0]?.digest ? { digest: results[0].digest } : {}) };
      } catch (error) {
        for (const [id, entry] of Object.entries(next.entries)) if (id.startsWith(`${provider}:`)) next.entries[id] = { ...entry, verificationFailed: true };
        next.sources[provider] = { status: "error", checkedAt: next.sources[provider]?.checkedAt, applied: 0, reviews: [], attemptedAt: checkedAt,
          message: error.message.startsWith("Pricing source") ? error.message : "Could not verify prices. Older estimates expire after seven days." };
      }
      this.progress[provider] = next.sources[provider];
    }
    next.revision = `${checkedAt}:${hash(JSON.stringify(next.entries)).slice(0, 12)}`;
    next.lastCheckAt = checkedAt;
    const retryCount = this.state.lastCheckAt && started - Date.parse(this.state.lastCheckAt) < PRICE_REFRESH_MS ? (this.state.retryCount || 0) : 0;
    const failed = Object.values(next.sources).some((source) => source.status === "error");
    next.retryCount = failed ? retryCount + 1 : 0;
    next.retryAt = failed && next.retryCount <= 3 ? iso(this.now() + HOUR) : null;
    next.changes = [...changes, ...next.changes].slice(0, 100);
    await this.write(this.filePath, next, { mode: 0o600 });
    this.state = next; this.error = "";
    return this.status();
  }
}

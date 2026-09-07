import { createHash } from "node:crypto";

export function creativeAnalysisKey({ provider, model, credential, instructions, assets }) {
  const hash = createHash("sha256").update(JSON.stringify({ provider, model, credential, instructions }));
  for (const asset of assets) {
    hash.update(JSON.stringify({ tag: asset.tag, type: asset.type, mimeType: asset.mimeType }));
    hash.update(createHash("sha256").update(asset.buffer).digest());
  }
  return hash.digest("hex");
}

// Cache successful analysis only. Concurrent consumers share work, but only its owner is billed.
export function createCreativeAnalysisCache({ limit = 40, ttlMs = 30 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map();
  return async function reuseAnalysis(key, generate) {
    const previous = entries.get(key);
    if (previous && previous.expires > now()) {
      try {
        const result = await previous.promise;
        return { ...structuredClone(result), usages: [], cacheHit: true };
      } catch (error) {
        // The initiating request owns any provider charge, including rejected output.
        const sharedFailure = new Error(error.message);
        sharedFailure.cost = { amountUsd: 0, currency: "USD" };
        throw sharedFailure;
      }
    }
    if (previous) entries.delete(key);
    while (entries.size >= limit) entries.delete(entries.keys().next().value);
    const entry = { expires: now() + ttlMs, promise: Promise.resolve().then(generate) };
    entries.set(key, entry);
    try { return structuredClone(await entry.promise); }
    catch (error) { if (entries.get(key) === entry) entries.delete(key); throw error; }
  };
}

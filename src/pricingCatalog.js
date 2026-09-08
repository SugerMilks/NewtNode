let catalog = { version: 1, revision: "bundled", entries: {} };
let reader = () => catalog;
const listeners = new Set();

export function setPricingCatalog(value) {
  if (value?.version !== 1 || !value.entries || typeof value.entries !== "object") return;
  if (catalog.revision === value.revision) return;
  catalog = value;
  for (const listener of listeners) listener();
}

export function configurePricingReader(read) { reader = read; }
export function getPricingCatalog() { return reader(); }
export function subscribePricing(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function pricingRevision() { return catalog.revision; }

export function recordedCostAmount(cost) {
  // Historical spend must not be reconstructed with today's price catalog.
  if (!cost || cost.amountUsd === null || cost.amountUsd === undefined || cost.amountUsd === "") return null;
  const amount = Number(cost.amountUsd);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function pricingQuote(provider, endpoint, dimensions = {}, quantity = 1, snapshot = reader()) {
  const entry = snapshot?.entries?.[`${provider}:${endpoint}`];
  if (!entry || entry.currency !== "USD" || !Array.isArray(entry.points)) return null;
  // Exact dimensions only: never infer a new billing tier or interpolate provider prices.
  const matches = entry.points.filter((point) => Object.keys(point.dimensions).length === Object.keys(dimensions).length
    && Object.entries(point.dimensions).every(([key, value]) => dimensions[key] === value));
  if (matches.length !== 1 || !Number.isFinite(matches[0].amount) || matches[0].amount < 0 || !Number.isFinite(quantity) || quantity < 0) return null;
  return {
    amountUsd: Math.round(matches[0].amount * quantity * 1e6) / 1e6,
    currency: "USD", estimated: true,
    pricingSource: entry.source, pricingCheckedAt: entry.checkedAt, pricingVersion: snapshot.revision
  };
}

export function applyPricingQuote(cost, provider, endpoint, dimensions = {}, quantity = 1) {
  const quote = pricingQuote(provider, endpoint, dimensions, quantity);
  return quote ? { ...cost, ...quote, unitRateUsd: cost.units > 0 ? quote.amountUsd / cost.units : quote.amountUsd,
    pricingBasis: `${provider === "krea" ? "Krea" : "Fal"} verified API price for the selected billing settings` } : cost;
}

export function currentOpenAiRates(bundled, snapshot = reader()) {
  return Object.fromEntries(Object.entries(bundled).map(([model, base]) => {
    const rate = { ...base };
    for (const context of ["short", "long"]) {
      const resolved = Object.fromEntries(["input", "cached", "writes", "output"].map((metric) =>
        [metric, pricingQuote("openai", model, { context, metric }, 1, snapshot)?.amountUsd]));
      if (Object.values(resolved).every(Number.isFinite)) {
        if (context === "short") Object.assign(rate, resolved);
        else rate.long = resolved;
      }
    }
    return [model, rate];
  }));
}

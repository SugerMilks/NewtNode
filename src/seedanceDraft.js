import { isSeedance25Model } from "./seedance25.js";

export const seedanceDraftCompletionEndpoint = "bytedance/seedance-2.5/draft/complete";
export const seedanceDraftLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export function validateSeedanceDraft({ model, seedanceDraft, provider } = {}) {
  if (seedanceDraft !== undefined && typeof seedanceDraft !== "boolean") {
    throw Object.assign(new Error("Draft mode must be on or off."), { status: 400 });
  }
  if (!seedanceDraft) return false;
  if (!isSeedance25Model(model) || provider !== "fal") {
    throw Object.assign(new Error("Seedance 2.5 Draft mode currently requires Fal. Enable Fal in Settings or turn Draft off."), { status: 400 });
  }
  return true;
}

export function seedanceDraftCost(stage = "preview") {
  return { amountUsd: null, currency: "USD", estimated: true, mediaType: "video", pricingStatus: "unavailable",
    pricingBasis: `Seedance draft ${stage} is billed separately by Fal; no verified estimate is available.` };
}

export function selectedSeedanceDraft(data = {}) {
  const items = data.resultItems || [];
  const item = items[data.selectedResultIndex || 0];
  return item?.seedanceDraft?.receiptId ? item : null;
}

export function finishedSeedanceDraftState(data, receiptId, item) {
  const items = [...(data.resultItems || [])];
  let index = items.findIndex(result => result.seedanceDraftSource === receiptId);
  if (index < 0) { index = items.length; items.push(item); }
  return { resultItems: items, resultUrl: items[index].url, selectedResultIndex: index, resultType: "video" };
}

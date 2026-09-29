import sharp from "sharp";
import { createCreativeAnalysisCache, creativeAnalysisKey } from "./creative-analysis-cache.js";
import { storyboardQcCharacterInputs } from "../src/storyboardCast.js";
import { storyboardQcUnavailable } from "../src/storyboardPlanValidation.js";

export const storyboardQcPolicyVersion = "balanced-v2";
export const storyboardQcFailureTypes = ["none", "polish", "identity", "missing_cast", "spatial", "action", "prop", "physical", "rendering"];
const essentialFailures = new Set(storyboardQcFailureTypes.slice(2));
const totalCost = costs => ({ amountUsd: costs.every(cost => Number.isFinite(cost?.amountUsd)) ? costs.reduce((sum, cost) => sum + cost.amountUsd, 0) : null, currency: "USD", source: "Storyboard QC usage", estimated: true });

export function storyboardQcInputs(input) {
  return [
    { url: input.sourceUrl, label: "Generated frame to review" },
    ...storyboardQcCharacterInputs(input.characterReferences || []),
    input.previousFrameUrl ? { url: input.previousFrameUrl, label: "Previous approved frame for continuity" } : null,
    input.spatialAnchorUrl && input.spatialAnchorUrl !== input.previousFrameUrl ? { url: input.spatialAnchorUrl, label: "Spatial anchor frame for room geography" } : null
  ].filter(Boolean);
}

export async function storyboardQcImage(asset, maxDimension) {
  // Review copies only: never crop, overwrite or resize the generation references on disk.
  const buffer = await sharp(asset.buffer).rotate().resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).png().toBuffer();
  return { buffer, mimeType: "image/png", fileName: "storyboard-qc.png" };
}

function needsConfirmation(qc) {
  return !qc.pass || qc.severity === "major" || essentialFailures.has(qc.failureType) || qc.confidence !== "high" || qc.needsDetail !== false;
}

export function storyboardQcDecision(qc) {
  if (qc.confidence !== "high" || qc.needsDetail !== false) return storyboardQcUnavailable(qc.summary || "QC could not confidently verify this frame.");
  if (qc.severity === "major" && qc.pass === false && essentialFailures.has(qc.failureType)) {
    return { ...qc, shouldRetry: qc.shouldRetry === true };
  }
  if (essentialFailures.has(qc.failureType) || (qc.severity === "major" && qc.failureType !== "polish")) {
    return storyboardQcUnavailable("QC returned an inconsistent verdict. The image was preserved without an automatic retry.");
  }
  const minor = qc.failureType === "polish" || qc.severity === "minor";
  return { ...qc, pass: true, shouldRetry: false, severity: minor ? "minor" : "ok", correctionPrompt: "" };
}

export function createStoryboardQc({ readLocalAsset, review, cache = createCreativeAnalysisCache() }) {
  return async function reviewFrame(input, { connection, model, policy, recordUsage = async () => {} }) {
    const mode = input.qcMode === "deep" ? "deep" : "balanced";
    const inputs = storyboardQcInputs(input);
    const assets = [];
    const byUrl = new Map();
    for (const item of inputs) {
      if (!byUrl.has(item.url)) byUrl.set(item.url, await readLocalAsset(item.url));
      assets.push({ ...byUrl.get(item.url), tag: item.label });
    }
    const key = creativeAnalysisKey({ provider: connection.provider, credential: connection.key, model,
      instructions: { version: storyboardQcPolicyVersion, policy, mode, input, labels: inputs.map(item => item.label) }, assets });
    const result = await cache(key, async () => {
      const costs = [];
      const call = async tier => {
        const prepared = [];
        for (let i = 0; i < inputs.length; i += 1) {
          const limit = tier === "routine" ? (/continuity|geography/.test(inputs[i].label) ? 1024 : 1536) : 2048;
          prepared.push({ ...inputs[i], asset: mode === "deep" ? assets[i] : await storyboardQcImage(assets[i], limit) });
        }
        let reviewed;
        try {
          reviewed = await review({ ...input, qcMode: mode, preparedInputs: prepared, adaptiveQc: true, connection,
            reasoningEffort: tier === "routine" ? "low" : "high" });
        } catch (error) {
          costs.push(error.cost || { amountUsd: null });
          if (error.llmResult) await recordUsage({ result: error.llmResult, cost: error.cost }, `${mode}/${tier} (invalid response)`);
          error.cost = totalCost(costs);
          throw error;
        }
        costs.push(reviewed.cost);
        await recordUsage(reviewed, `${mode}/${tier}`);
        return reviewed.qc;
      };
      try {
        let qc = await call(mode === "deep" ? "deep" : "routine");
        const escalated = mode === "balanced" && needsConfirmation(qc);
        // One independent confirmation at most; never replay provider or schema failures.
        if (escalated) qc = await call("confirmation");
        qc = { ...storyboardQcDecision(qc), mode, escalated };
        if (qc.severity === "unreviewed") throw new Error(qc.summary); // Never cache an uncertain approval.
        return { qc, cost: totalCost(costs) };
      } catch (error) {
        error.cost = totalCost(costs);
        throw error;
      }
    });
    return { ...result, cost: result.cacheHit ? totalCost([]) : result.cost, qc: { ...result.qc, cacheHit: Boolean(result.cacheHit) } };
  };
}

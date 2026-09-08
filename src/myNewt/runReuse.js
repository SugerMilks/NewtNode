import { myNewtFields } from "./contract.js";
import { myNewtOutputItems } from "./plan.js";
import { smartTextGenerationContext, smartTextPromptVersion } from "../smartTextPrompt.js";

const version = 1;
const reusableTypes = new Set(["imageModel", "videoModel", "coverage", "text"]);
const transient = /^(?:status|error|locked|activated|myNewtProtection|myNewtRunRecords|thumbnail.*|.*Thumbnail.*|resultVersion|updatedAt|createdAt|selectedResultIndex)$/;

export function myNewtStableValue(value) {
  if (Array.isArray(value)) return value.map(myNewtStableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, myNewtStableValue(value[key])]));
  return value;
}

export async function myNewtDigest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(myNewtStableValue(value)));
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableData(value) {
  if (Array.isArray(value)) return value.map(stableData);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !transient.test(key)).map(([key, entry]) => [key, stableData(entry)]));
  return value;
}

export async function myNewtRunInputDigest(snapshot, nodeId, stage, preview = {}) {
  const node = snapshot.nodes.find((item) => item.id === nodeId);
  if (!node || !reusableTypes.has(node.type)) return null;
  const inputs = Object.fromEntries((myNewtFields[node.type] || []).map((key) => [key, node.data?.[key]]));
  // Media previews contain resolved prompts, settings and the actual selected references.
  // Text has no equivalent preview, so include its complete upstream dependency graph.
  const ancestors = [], edges = [], visited = new Set([nodeId]);
  const visit = (id) => {
    for (const edge of snapshot.edges || []) {
      if (edge.to.nodeId !== id) continue;
      edges.push(edge);
      if (visited.has(edge.from.nodeId)) continue;
      visited.add(edge.from.nodeId);
      const source = snapshot.nodes.find((item) => item.id === edge.from.nodeId);
      if (source) ancestors.push({ id: source.id, type: source.type, data: stableData(source.data) });
      visit(edge.from.nodeId);
    }
  };
  if (node.type === "text") visit(nodeId);
  const { estimatedCost, upperBound, additionalUsage, title, reuse, inputDigest, ...resolved } = preview;
  if (node.type === "text") Object.assign(resolved, {
    smartTextPromptVersion,
    generationContext: smartTextGenerationContext(nodeId, snapshot.nodes, snapshot.edges)
  });
  return myNewtDigest({ version, type: node.type, stage: stage || "generate", inputs, resolved: stableData(resolved), ancestors: ancestors.sort((a, b) => a.id.localeCompare(b.id)), edges: edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
}

export async function myNewtRunOutputDigest(node) {
  if (!node || !reusableTypes.has(node.type) || node.data?.error || ["running", "planning", "compiling", "uploading", "generating", "error"].includes(node.data?.status)) return null;
  if (node.type === "text") return node.data?.resultText?.trim() ? myNewtDigest({ text: node.data.resultText }) : null;
  const outputs = myNewtOutputItems(node);
  const expectedCount = node.type === "coverage" ? 9 : Math.max(1, Number(node.data?.batchCount) || 1);
  return outputs.length >= expectedCount ? myNewtDigest(outputs.map(({ url, type }) => ({ url, type }))) : null;
}

export async function myNewtReusableRun(snapshot, nodeId, stage, preview) {
  const node = snapshot.nodes.find((item) => item.id === nodeId);
  const inputDigest = await myNewtRunInputDigest(snapshot, nodeId, stage, preview);
  const outputDigest = await myNewtRunOutputDigest(node);
  const records = Array.isArray(node?.data?.myNewtRunRecords) ? node.data.myNewtRunRecords : [];
  const record = records.find((item) => item?.version === version && item.stage === (stage || "generate") && item.inputDigest === inputDigest && item.outputDigest === outputDigest);
  return { inputDigest, reusable: !!(inputDigest && outputDigest && record), completedAt: record?.completedAt };
}

export async function myNewtCompletedRunRecord(before, after, nodeId, stage, beforePreview, afterPreview) {
  const inputDigest = await myNewtRunInputDigest(before, nodeId, stage, beforePreview);
  if (!inputDigest || inputDigest !== await myNewtRunInputDigest(after, nodeId, stage, afterPreview)) return null;
  const outputDigest = await myNewtRunOutputDigest(after.nodes.find((node) => node.id === nodeId));
  return outputDigest ? { version, stage: stage || "generate", inputDigest, outputDigest, completedAt: new Date().toISOString() } : null;
}

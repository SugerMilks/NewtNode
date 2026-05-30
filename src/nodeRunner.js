export function nodeBatchCount(node) {
  const count = Number(node.data.batchCount || 1);
  return Math.min(4, Math.max(1, Number.isFinite(count) ? count : 1));
}

export function formatNodeBatchCount(value) {
  const count = Number(value) || 1;
  return `${count} gen${count === 1 ? "" : "s"}`;
}

export function nodeBatchStatusMessage(mediaType, total, completed, failures) {
  const label = mediaType === "image" ? "image" : "video";
  const firstError = failures[0]?.reason?.message || "";
  return `${completed} of ${total} ${label} generations complete.${firstError ? ` ${firstError}` : ""}`;
}

export function nodeRunIndexes(count) {
  return Array.from({ length: count }, (_, index) => index);
}

export function fulfilledRunValues(settledResults, { flatten = false } = {}) {
  const values = settledResults.filter((item) => item.status === "fulfilled").map((item) => item.value);
  return flatten ? values.flatMap((value) => (Array.isArray(value) ? value : [value])) : values;
}

export function rejectedRunResults(settledResults) {
  return settledResults.filter((item) => item.status === "rejected");
}

export function firstNewResultIndex(resultItems, newItems) {
  return Math.max(0, resultItems.length - newItems.length);
}

export function isRunnableNode(node) {
  return ["text", "imageModel", "videoModel", "utility", "model3d"].includes(node.type) || (node.type === "camera" && node.data.qwenCameraOpen);
}

export function buildSelectedRunnableDependencies(nodes, edges) {
  const runnableIds = new Set(nodes.map((node) => node.id));
  const dependencies = new Map(nodes.map((node) => [node.id, []]));

  edges.forEach((edge) => {
    if (!runnableIds.has(edge.from.nodeId) || !runnableIds.has(edge.to.nodeId)) return;
    dependencies.get(edge.to.nodeId)?.push(edge.from.nodeId);
  });

  return dependencies;
}

export function nodeRunPriority(node) {
  if (node?.type === "text") return 0;
  if (node?.type === "camera") return 1;
  if (node?.type === "imageModel") return 2;
  if (node?.type === "model3d") return 3;
  if (node?.type === "utility") return 4;
  if (node?.type === "videoModel") return 4;
  return 3;
}

export function runStageLabel(type) {
  if (type === "text") return "text model";
  if (type === "camera") return "camera";
  if (type === "imageModel") return "image";
  if (type === "model3d") return "3D";
  if (type === "utility") return "utility";
  if (type === "videoModel") return "video";
  return "selected";
}

export function nodeTitle(node) {
  return node?.data?.title || node?.type || "a dependency";
}

export async function settleSequential(items, run, delayMs = 0) {
  const results = [];

  for (const [index, item] of items.entries()) {
    if (index > 0 && delayMs > 0) await wait(delayMs);

    try {
      results.push({ status: "fulfilled", value: await run(item, index) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }

  return results;
}

export function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

import { appendResultItems } from "./mediaResults.js";

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

export function appendedNodeResultState(existingItems, newItems, mediaType) {
  const normalizedNewItems = Array.isArray(newItems) ? newItems : [newItems];
  const resultItems = appendResultItems(existingItems, normalizedNewItems, mediaType);
  return {
    resultItems,
    firstNewIndex: firstNewResultIndex(resultItems, normalizedNewItems)
  };
}

export function resultTextFromItems(items = []) {
  return items.map((item) => item.text).filter(Boolean).join("\n\n");
}

export function batchRunError(mediaType, total, successes, failures) {
  return failures.length ? nodeBatchStatusMessage(mediaType, total, successes.length, failures) : "";
}

export function ensureRunSuccesses(successes, failures, fallbackMessage) {
  if (!successes.length) throw new Error(failures[0]?.reason?.message || fallbackMessage);
  return successes;
}

export function isRunnableNode(node) {
  return ["text", "imageModel", "videoModel", "utility", "model3d", "storyboard"].includes(node.type);
}

export function buildSelectedRunnableDependencies(nodes, edges) {
  const runnableIds = new Set(nodes.map((node) => node.id));
  const dependencies = new Map(nodes.map((node) => [node.id, []]));

  (edges || []).forEach((edge) => {
    if (!runnableIds.has(edge.from.nodeId) || !runnableIds.has(edge.to.nodeId)) return;
    dependencies.get(edge.to.nodeId)?.push(edge.from.nodeId);
  });

  return dependencies;
}

export function nodeRunPriority(node) {
  if (node?.type === "imageModel") return 2;
  if (node?.type === "storyboard") return 2;
  if (node?.type === "model3d") return 3;
  if (node?.type === "utility") return 4;
  if (node?.type === "videoModel") return 4;
  return 3;
}

export function runStageLabel(type) {
  if (type === "text") return "text model";
  if (type === "plainText") return "text";
  if (type === "imageModel") return "image";
  if (type === "storyboard") return "storyboard";
  if (type === "model3d") return "3D";
  if (type === "utility") return "utility";
  if (type === "videoModel") return "video";
  return "selected";
}

export function nodeTitle(node) {
  return node?.data?.title || node?.type || "a dependency";
}

export async function runRunnableNodesByDependencyOrder(
  runnableNodes,
  edges,
  { runNode, onStatus, onNodeSkipped, delayMs = 0 } = {}
) {
  if (typeof runNode !== "function") {
    throw new Error("runRunnableNodesByDependencyOrder requires a runNode callback.");
  }

  const nodeMap = new Map(runnableNodes.map((node) => [node.id, node]));
  const pending = new Set(nodeMap.keys());
  const completed = new Set();
  const failed = new Map();
  const skipped = new Map();
  const dependencies = buildSelectedRunnableDependencies(runnableNodes, edges);

  while (pending.size) {
    const blocked = [...pending].filter((nodeId) =>
      (dependencies.get(nodeId) || []).some((dependencyId) => failed.has(dependencyId) || skipped.has(dependencyId))
    );

    blocked.forEach((nodeId) => {
      const failedDependencyId = (dependencies.get(nodeId) || []).find((dependencyId) => failed.has(dependencyId) || skipped.has(dependencyId));
      const message = `Skipped because ${nodeTitle(nodeMap.get(failedDependencyId))} did not complete.`;
      pending.delete(nodeId);
      skipped.set(nodeId, message);
      onNodeSkipped?.(nodeId, message);
    });

    const ready = [...pending].filter((nodeId) => (dependencies.get(nodeId) || []).every((dependencyId) => completed.has(dependencyId)));

    if (!ready.length) {
      [...pending].forEach((nodeId) => {
        const message = "Skipped because selected node dependencies could not be resolved.";
        pending.delete(nodeId);
        skipped.set(nodeId, message);
        onNodeSkipped?.(nodeId, message);
      });
      break;
    }

    const nextPriority = Math.min(...ready.map((nodeId) => nodeRunPriority(nodeMap.get(nodeId))));
    const batchIds = ready.filter((nodeId) => nodeRunPriority(nodeMap.get(nodeId)) === nextPriority);
    const batchNodes = batchIds.map((nodeId) => nodeMap.get(nodeId));
    onStatus?.(`Running ${batchNodes.length} ${runStageLabel(batchNodes[0]?.type)} node${batchNodes.length === 1 ? "" : "s"}...`);

    const results = await Promise.all(batchNodes.map((node) => runNode(node)));
    results.forEach((result, index) => {
      const nodeId = batchIds[index];
      pending.delete(nodeId);

      if (result?.status === "error") {
        failed.set(nodeId, result.error || new Error("Node failed."));
        return;
      }

      completed.add(nodeId);
    });

    await wait(delayMs);
  }

  return {
    completed: completed.size,
    failed: failed.size,
    skipped: skipped.size
  };
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
  const timer = globalThis.window?.setTimeout || globalThis.setTimeout;
  return new Promise((resolve) => timer(resolve, ms));
}

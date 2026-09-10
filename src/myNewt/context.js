import { myNewtActionSnapshot } from "./contract.js";

export function myNewtGraphContext(snapshot, { nodeId, createdIds = [], brief = "", focusIds = [], offset = 0 } = {}) {
  const nodes = snapshot?.nodes || [], edges = snapshot?.edges || [];
  const explicit = new Set([nodeId, ...createdIds.slice(-12), ...focusIds]);
  for (const node of nodes) {
    const name = node.data?.characterName || node.data?.title;
    if (name?.length >= 3 && brief.toLowerCase().includes(name.toLowerCase())) explicit.add(node.id);
  }
  const selected = new Set();
  for (const id of explicit) for (const node of myNewtActionSnapshot(snapshot, { payload: { nodeId: id } }).nodes) selected.add(node.id);
  const details = nodes.filter((node) => selected.has(node.id));
  let remaining = 80000;
  const included = [];
  for (const node of [...details.filter((n) => focusIds.includes(n.id)), ...details.filter((n) => !focusIds.includes(n.id))]) {
    const compact = compactValue(node, 10000);
    const size = JSON.stringify(compact).length;
    if (remaining < size) continue;
    included.push(compact); remaining -= size;
  }
  const includedIds = new Set(included.map((node) => node.id));
  return {
    projectId: snapshot.projectId, projectName: snapshot.projectName,
    protectedNodes: nodes.filter((node) => node.data?.myNewtProtection?.approved).map((node) => ({ id: node.id, title: node.data.title, scope: "Entire node and its upstream dependencies. May be used as a reference." })),
    totalNodes: nodes.length, indexOffset: offset, nextOffset: offset + 80 < nodes.length ? offset + 80 : null,
    index: nodes.slice(offset, offset + 80).map(({ id, type, data }) => ({ id, type, title: data?.title, status: data?.status, approved: data?.myNewtProtection?.approved === true, trackedRuns: Array.isArray(data?.myNewtRunRecords) ? data.myNewtRunRecords.filter(Boolean).map((item) => ({ stage: item.stage, completedAt: item.completedAt })) : [] })),
    nodes: included,
    edges: edges.filter((edge) => includedIds.has(edge.from.nodeId) || includedIds.has(edge.to.nodeId)),
    omittedDetailIds: details.filter((node) => !includedIds.has(node.id)).map((node) => node.id),
    catalog: snapshot.catalog, presets: snapshot.presets,
    retrieval: "Index and details are paged, not the full project. Use read {nodeIds:[...]} for other nodes, read {offset:N} for the next index page, or read {nodeIds:[id],field:fieldName,itemOffset:N} for array details. Truncated strings have an explicit omittedCharacters count."
  };
}

function compactValue(value, limit) {
  if (typeof value === "string") return value.length <= limit ? value : { text: value.slice(0, limit), omittedCharacters: value.length - limit };
  if (Array.isArray(value)) return value.length <= 6 ? value.map((entry) => compactValue(entry, 1800)) : { items: value.slice(0, 6).map((entry) => compactValue(entry, 1800)), totalItems: value.length, nextItemOffset: 6 };
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, compactValue(entry, Math.min(limit, 5000))]));
  return value;
}

export function myNewtReadDetails(snapshot, { nodeIds = [], field, itemOffset = 0, offset = 0 } = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length > 8) throw new Error("Read up to eight node IDs at a time.");
  if (!nodeIds.length) return myNewtGraphContext(snapshot, { offset: Math.max(0, Number(offset) || 0) });
  return nodeIds.map((id) => {
    const node = snapshot.nodes.find((entry) => entry.id === id);
    if (!node) return { id, error: "Node not found" };
    if (!field) return compactValue(node, 12000);
    const value = node.data?.[field], start = Math.max(0, Number(itemOffset) || 0);
    if (typeof value === "string") return { id, field, offset: start, text: value.slice(start, start + 16000), nextOffset: start + 16000 < value.length ? start + 16000 : null };
    if (Array.isArray(value)) return { id, field, offset: start, items: value.slice(start, start + 8).map((entry) => compactValue(entry, 4000)), totalItems: value.length, nextOffset: start + 8 < value.length ? start + 8 : null };
    return { id, field, value: compactValue(value, 12000) };
  });
}

export function myNewtConversation(messages = [], { maxCharacters = 70000, modelChanged = false } = {}) {
  // Keep recent complete call/result pairs. Current plan and graph carry durable task state.
  const groups = [];
  for (const item of messages) {
    if (item.type === "function_call_output" && groups.length) groups.at(-1).push(item);
    else groups.push([item]);
  }
  const kept = [];
  let characters = 0;
  for (const group of groups.reverse()) {
    const filtered = group.filter((item) => item.type !== "reasoning" || (!modelChanged && characters < 20000)).map((item) => {
      if (!modelChanged) return item;
      const { id, ...portable } = item;
      return portable;
    });
    if (filtered.some((item) => item.type === "function_call") && !filtered.some((item) => item.type === "function_call_output")) continue;
    const size = JSON.stringify(filtered).length;
    if (characters + size > maxCharacters) break;
    kept.unshift(...filtered); characters += size;
  }
  return kept;
}

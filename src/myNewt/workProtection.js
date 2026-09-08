const busyStates = new Set(["running", "planning", "compiling", "uploading", "generating"]);

export function myNewtProtectedNodes(snapshot = {}) {
  return (snapshot.nodes || []).filter((node) => node.type !== "myNewt" && node.data?.myNewtProtection?.approved === true);
}

export function myNewtProtectionTargets(snapshot, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 250 || new Set(ids).size !== ids.length) throw new Error("Choose between 1 and 250 distinct nodes to protect.");
  return ids.map((id) => {
    const node = snapshot.nodes.find((item) => item.id === id);
    if (!node || node.type === "myNewt") throw new Error("Choose existing creative nodes, not Newt itself.");
    if (busyStates.has(node.data?.status)) throw new Error(`Wait for "${node.data.title || node.type}" to finish before changing its approval.`);
    return node;
  });
}

// Editing an upstream input can indirectly change an approved node's output.
export function myNewtProtectionError(snapshot, action) {
  if (!["update", "connect", "assign", "run"].includes(action.operation)) return "";
  const p = action.payload || {}, target = p.to?.nodeId || p.nodeId;
  if (!target) return "";
  const affected = new Set([target]);
  let size = -1;
  while (size !== affected.size) {
    size = affected.size;
    for (const edge of snapshot.edges || []) if (affected.has(edge.from.nodeId)) affected.add(edge.to.nodeId);
  }
  const protectedNode = myNewtProtectedNodes(snapshot).find((node) => affected.has(node.id));
  if (!protectedNode) return "";
  return `"${protectedNode.data.title || protectedNode.type}" is approved and protected from Newt.${protectedNode.id !== target ? " This action would change one of its upstream inputs." : ""} Reuse it as a reference, work on a duplicate, or ask the user to release its protection in Newt Settings.`;
}

export function assertMyNewtProtection(snapshot, action, { local = false } = {}) {
  if (action.operation === "release-protection" && !local) throw new Error("Only a direct user command or the user can release approved work. Newt cannot release protection itself.");
  if (["protect", "release-protection"].includes(action.operation)) myNewtProtectionTargets(snapshot, action.payload?.nodeIds);
  const error = myNewtProtectionError(snapshot, action);
  if (error) throw new Error(error);
}

export function myNewtProtectionCommand(text, snapshot) {
  let match = text.match(/^(protect|approve|keep|release|unprotect) (?:the )?(selected nodes|selected workflow|"[^"\n]+")(?:(?: as)? (?:approved|unchanged|exactly as (?:it is|they are)))?$/i);
  if (!match) return null;
  const release = /^(release|unprotect)$/i.test(match[1]);
  const name = match[2].startsWith('"') ? match[2].slice(1, -1).trim().toLowerCase() : null;
  const nodes = name === null
    ? (snapshot.nodes || []).filter((node) => snapshot.selectedNodeIds?.includes(node.id) && node.type !== "myNewt")
    : (snapshot.nodes || []).filter((node) => [node.data?.title, node.data?.characterName].some((value) => String(value || "").trim().toLowerCase() === name));
  if (name !== null && nodes.length !== 1) throw new Error(nodes.length ? "More than one node matches. Use a unique node name." : `No node named "${match[2].slice(1, -1)}" was found.`);
  myNewtProtectionTargets(snapshot, nodes.map((node) => node.id));
  return { route: "local", summary: `${release ? "Release protection for" : "Protect approved work in"} ${nodes.map((node) => `"${node.data.title || node.type}"`).join(", ")}. No generation.`, action: { operation: release ? "release-protection" : "protect", payload: { nodeIds: nodes.map((node) => node.id) } } };
}

const scopes = new Map();

export async function withMyNewtRequestScope(nodeId, relay, action) {
  if (scopes.has(nodeId)) throw new Error("My Newt is already working on this node.");
  let sequence = 0;
  scopes.set(nodeId, (path, body) => relay(path, body, ++sequence));
  try { return await action(); } finally { scopes.delete(nodeId); }
}

export function scopedMyNewtRequest(path, options) {
  if (!path.startsWith("/api/node/") || typeof options?.body !== "string") return null;
  let body;
  try { body = JSON.parse(options.body); } catch { return null; }
  const relay = scopes.get(body.nodeId);
  return relay ? relay(path, body) : null;
}

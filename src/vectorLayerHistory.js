export function vectorLayerHistoryShortcut(event) {
  if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return null;
  const key = String(event.key || "").toLowerCase();
  const action = key === "z" ? event.shiftKey ? "redo" : "undo" : key === "y" && !event.shiftKey ? "redo" : null;
  if (!action) return null;
  const target = event.target;
  // Text fields retain their native undo stack; sliders, switches and menus do not.
  if (target?.isContentEditable || target?.closest?.("textarea, [contenteditable='true'], [contenteditable=''], [role='textbox'], [role='searchbox']")) return null;
  if (target?.tagName === "INPUT" && !target.readOnly && ["text", "search", "email", "url", "tel", "password", "number"].includes(target.type || "text")) return null;
  return action;
}

export function stepVectorLayerHistory(history, action) {
  const { operations, redo } = history;
  if (action === "undo" && operations.length) return { operations: operations.slice(0, -1), redo: [...redo, operations.at(-1)] };
  if (action === "redo" && redo.length) return { operations: [...operations, redo.at(-1)], redo: redo.slice(0, -1) };
  return history;
}

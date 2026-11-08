export function focusCanvasSelection(canvas) {
  // Selection gestures prevent the browser's normal focus handoff from inputs.
  canvas?.focus({ preventScroll: true });
}

export function editorTimelineZoomDirection(event) {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return 0;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.("input, textarea, select, [contenteditable], [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton'], [role='dialog'], [aria-modal='true']")) return 0;
  if (target?.ownerDocument?.querySelector("[aria-modal='true']")) return 0;
  if (event.key === "+" || event.key === "=") return 1;
  return event.key === "-" ? -1 : 0;
}

export function editorShuttleKey(event) {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return null;
  const key = event.key?.toLowerCase();
  if (!["j", "k", "l"].includes(key)) return null;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.("input, textarea, select, [contenteditable], [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton'], [role='dialog'], [aria-modal='true'], .editor-context-menu")) return null;
  if (target?.ownerDocument?.querySelector("[aria-modal='true']")) return null;
  return key;
}

export function canDeleteCanvasSelection(event, canvas) {
  if (!canvas || event.defaultPrevented || event.isComposing) return false;
  if (event.key !== "Backspace" && event.key !== "Delete") return false;
  const target = event.target;
  if (target?.closest?.("[data-editor-timeline]")) return false;
  if (target?.isContentEditable || target?.closest?.("input, textarea, select, [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton']")) return false;
  if (target?.closest?.("[role='dialog'], [aria-modal='true']")) return false;
  // Some overlays keep focus on the canvas until their first control is clicked.
  if (canvas.ownerDocument.querySelector("[aria-modal='true']")) return false;
  return true;
}

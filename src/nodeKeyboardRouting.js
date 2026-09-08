export function focusCanvasSelection(canvas) {
  // Selection gestures prevent the browser's normal focus handoff from inputs.
  canvas?.focus({ preventScroll: true });
}

export function canDeleteCanvasSelection(event, canvas) {
  if (!canvas || event.defaultPrevented || event.isComposing) return false;
  if (event.key !== "Backspace" && event.key !== "Delete") return false;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.("input, textarea, select, [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton']")) return false;
  if (target?.closest?.("[role='dialog'], [aria-modal='true']")) return false;
  // Some overlays keep focus on the canvas until their first control is clicked.
  if (canvas.ownerDocument.querySelector("[aria-modal='true']")) return false;
  return true;
}

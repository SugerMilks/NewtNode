export function shouldPrioritizeSelectedTextareaWheel({
  deltaX = 0,
  deltaY = 0,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  shiftKey = false
} = {}) {
  if (ctrlKey || metaKey || altKey || shiftKey) return false;

  const horizontal = Math.abs(Number(deltaX) || 0);
  const vertical = Math.abs(Number(deltaY) || 0);
  return vertical >= 0.01 && vertical >= horizontal;
}

export function canScrollableElementConsumeVerticalWheel({
  scrollTop = 0,
  scrollHeight = 0,
  clientHeight = 0,
  deltaY = 0
} = {}) {
  const maximumScrollTop = Math.max(0, (Number(scrollHeight) || 0) - (Number(clientHeight) || 0));
  const currentScrollTop = Math.min(maximumScrollTop, Math.max(0, Number(scrollTop) || 0));
  const verticalDelta = Number(deltaY) || 0;

  if (maximumScrollTop < 1 || Math.abs(verticalDelta) < 0.01) return false;
  return verticalDelta < 0 ? currentScrollTop > 0.5 : currentScrollTop < maximumScrollTop - 0.5;
}

export function shouldStoryboardFrameTextareaConsumeWheel({
  frameSelected = false,
  ...wheelState
} = {}) {
  return Boolean(frameSelected) &&
    shouldPrioritizeSelectedTextareaWheel(wheelState) &&
    canScrollableElementConsumeVerticalWheel(wheelState);
}

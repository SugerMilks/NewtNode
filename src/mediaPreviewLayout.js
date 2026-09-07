export function containedMediaSize({
  naturalWidth = 0,
  naturalHeight = 0,
  availableWidth = 0,
  availableHeight = 0
} = {}) {
  const width = Number(naturalWidth);
  const height = Number(naturalHeight);
  const maxWidth = Number(availableWidth);
  const maxHeight = Number(availableHeight);
  if (![width, height, maxWidth, maxHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: width * scale,
    height: height * scale
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampCropRect(rect = {}, minimumPercent = 8) {
  const minimum = clamp(Number(minimumPercent) || 8, 0.1, 100);
  const rawX = Number(rect.x);
  const rawY = Number(rect.y);
  const x = clamp(Number.isFinite(rawX) ? rawX : 0, 0, 100 - minimum);
  const y = clamp(Number.isFinite(rawY) ? rawY : 0, 0, 100 - minimum);
  const rawWidth = Number(rect.width);
  const rawHeight = Number(rect.height);

  return {
    x,
    y,
    width: clamp(Number.isFinite(rawWidth) ? rawWidth : 100 - x, minimum, 100 - x),
    height: clamp(Number.isFinite(rawHeight) ? rawHeight : 100 - y, minimum, 100 - y)
  };
}

export function moveCropRect(startRect, deltaX = 0, deltaY = 0, minimumPercent = 8) {
  const rect = clampCropRect(startRect, minimumPercent);
  return {
    ...rect,
    x: clamp(rect.x + (Number(deltaX) || 0), 0, 100 - rect.width),
    y: clamp(rect.y + (Number(deltaY) || 0), 0, 100 - rect.height)
  };
}

export function resizeCropRect({
  startRect,
  pointer,
  startPoint,
  editorWidth,
  editorHeight,
  lockAspect = false,
  minimumPercent = 8
} = {}) {
  const rect = clampCropRect(startRect, minimumPercent);
  const width = Number(editorWidth);
  const height = Number(editorHeight);
  const pointerX = Number(pointer?.x) + (startPoint ? rect.x + rect.width - startPoint.x : 0);
  const pointerY = Number(pointer?.y) + (startPoint ? rect.y + rect.height - startPoint.y : 0);
  if (![width, height, pointerX, pointerY].every(Number.isFinite) || width <= 0 || height <= 0) {
    return rect;
  }

  const maximumWidth = 100 - rect.x;
  const maximumHeight = 100 - rect.y;
  const freeWidth = clamp(pointerX - rect.x, minimumPercent, maximumWidth);
  const freeHeight = clamp(pointerY - rect.y, minimumPercent, maximumHeight);
  if (!lockAspect) {
    return { ...rect, width: freeWidth, height: freeHeight };
  }

  const startPixelWidth = (rect.width / 100) * width;
  const startPixelHeight = (rect.height / 100) * height;
  const aspect = startPixelHeight > 0 ? startPixelWidth / startPixelHeight : 1;
  const rawPixelWidth = (freeWidth / 100) * width;
  const rawPixelHeight = (freeHeight / 100) * height;

  // Project the pointer onto the crop's aspect line so either drag direction feels natural.
  const projectedPixelHeight = ((rawPixelWidth * aspect) + rawPixelHeight) / ((aspect * aspect) + 1);
  const minimumPixelWidth = (minimumPercent / 100) * width;
  const minimumPixelHeight = (minimumPercent / 100) * height;
  const minimumLockedHeight = Math.max(minimumPixelHeight, minimumPixelWidth / aspect);
  const maximumLockedHeight = Math.min(
    (maximumHeight / 100) * height,
    ((maximumWidth / 100) * width) / aspect
  );
  const lockedPixelHeight = clamp(projectedPixelHeight, Math.min(minimumLockedHeight, maximumLockedHeight), maximumLockedHeight);

  return {
    ...rect,
    width: ((lockedPixelHeight * aspect) / width) * 100,
    height: (lockedPixelHeight / height) * 100
  };
}

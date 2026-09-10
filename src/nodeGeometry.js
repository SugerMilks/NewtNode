export const contextMenuSize = { width: 190, height: 420, inset: 8 };
export const plainTextNodeSizeLimits = {
  defaultWidth: 310,
  defaultHeight: 206,
  minWidth: 240,
  minHeight: 176,
  maxWidth: 1200,
  maxHeight: 1200
};

export function normalizePlainTextNodeSize(data = {}, fallback = {}) {
  const width = Number(data.textNodeWidth);
  const height = Number(data.textNodeHeight);
  return {
    width: clamp(
      Number.isFinite(width) ? width : positiveDimension(fallback.width, plainTextNodeSizeLimits.defaultWidth),
      plainTextNodeSizeLimits.minWidth,
      plainTextNodeSizeLimits.maxWidth
    ),
    height: clamp(
      Number.isFinite(height) ? height : positiveDimension(fallback.height, plainTextNodeSizeLimits.defaultHeight),
      plainTextNodeSizeLimits.minHeight,
      plainTextNodeSizeLimits.maxHeight
    )
  };
}

export function resizePlainTextNode(startSize = {}, delta = {}) {
  const normalizedStart = normalizePlainTextNodeSize({}, startSize);
  return {
    width: Math.round(clamp(normalizedStart.width + (Number(delta.x) || 0), plainTextNodeSizeLimits.minWidth, plainTextNodeSizeLimits.maxWidth)),
    height: Math.round(clamp(normalizedStart.height + (Number(delta.y) || 0), plainTextNodeSizeLimits.minHeight, plainTextNodeSizeLimits.maxHeight))
  };
}

export function estimatedNodeWidth(type) {
  if (type === "myNewt") return 410;
  if (type === "frameIt") return 980;
  if (type === "autoAspect") return 390;
  if (type === "coverage") return 390;
  if (type === "skillDirector") return 760;
  if (type === "storyboard") return 920;
  if (type === "imageModel" || type === "videoModel" || type === "audioModel" || type === "utility" || type === "model3d") return 370;
  if (type === "character") return 760;
  if (type === "camera" || type === "style") return 360;
  if (type === "transfer" || type === "preview") return 335;
  return 310;
}

export function estimatedNodeHeight(type) {
  if (type === "myNewt") return 650;
  if (type === "frameIt") return 700;
  if (type === "character") return 520;
  if (type === "composer") return 410;
  if (type === "skillDirector") return 940;
  if (type === "audioModel") return 750;
  if (type === "imageModel" || type === "videoModel" || type === "utility" || type === "model3d" || type === "autoAspect" || type === "coverage") return 430;
  if (type === "transfer" || type === "preview") return 360;
  if (type === "camera") return 380;
  if (type === "style") return 520;
  return 270;
}

export function estimatedNodeRect(node, padding = 0) {
  const plainTextSize = node?.type === "plainText" ? normalizePlainTextNodeSize(node.data) : null;
  const storyboardScale = node?.type === "storyboard" ? Math.max(1, Number(node.data?.storyboardScale) || 1) : 1;
  return {
    left: Number(node?.x || 0) - padding,
    top: Number(node?.y || 0) - padding,
    right: Number(node?.x || 0) + (plainTextSize?.width || estimatedNodeWidth(node?.type) * storyboardScale) + padding,
    bottom: Number(node?.y || 0) + (plainTextSize?.height || estimatedNodeHeight(node?.type)) + padding
  };
}

export function graphBoundsForNodes(nodes = []) {
  const rects = nodes.map((node) => estimatedNodeRect(node));
  if (!rects.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  };
}

export function rectsOverlap(first, second) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

// Move only the new rectangle. Each collision advances past at least one obstacle.
export function nonOverlappingPosition(size, preferred, occupied = [], gap = 80) {
  const width = positiveDimension(size.width, 370);
  const height = positiveDimension(size.height, 520);
  let x = Number.isFinite(preferred?.x) ? preferred.x : 0;
  const y = Number.isFinite(preferred?.y) ? preferred.y : 0;
  const spacing = Math.max(0, Number(gap) || 0);
  for (let step = 0; step <= occupied.length; step++) {
    const candidate = { left: x - spacing, top: y - spacing, right: x + width + spacing, bottom: y + height + spacing };
    const collisions = occupied.filter((rect) => rectsOverlap(candidate, rect));
    if (!collisions.length) return { x, y };
    x = Math.max(...collisions.map((rect) => rect.right)) + spacing;
  }
  return { x, y };
}

export function normalizeRect(start, current) {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    right: Math.max(start.x, current.x),
    bottom: Math.max(start.y, current.y)
  };
}

export function rectsIntersect(first, second) {
  return first.left <= second.right && first.right >= second.left && first.top <= second.bottom && first.bottom >= second.top;
}

export function pointInRect(rect, point) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

export function localPortPointFromRects(portRect, nodeRect, renderedScale = 1) {
  const scale = Number.isFinite(renderedScale) && renderedScale > 0 ? renderedScale : 1;
  return {
    x: (portRect.left + portRect.width / 2 - nodeRect.left) / scale,
    y: (portRect.top + portRect.height / 2 - nodeRect.top) / scale
  };
}

export function scenePortPoint(node, localPoint) {
  return {
    x: Number(node?.x || 0) + Number(localPoint?.x || 0),
    y: Number(node?.y || 0) + Number(localPoint?.y || 0)
  };
}

export function groupToRect(group) {
  return {
    left: group.x,
    top: group.y,
    right: group.x + group.width,
    bottom: group.y + group.height
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampContextMenuPosition(x, y, rect, menuSize = contextMenuSize) {
  const width = positiveDimension(menuSize.width, contextMenuSize.width);
  const height = positiveDimension(menuSize.height, contextMenuSize.height);
  const maxX = Math.max(contextMenuSize.inset, rect.width - width - contextMenuSize.inset);
  const maxY = Math.max(contextMenuSize.inset, rect.height - height - contextMenuSize.inset);

  return {
    x: clamp(x, contextMenuSize.inset, maxX),
    y: clamp(y, contextMenuSize.inset, maxY)
  };
}

export function positiveDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function positiveModulo(value, divisor) {
  if (!divisor) return 0;
  return ((value % divisor) + divisor) % divisor;
}

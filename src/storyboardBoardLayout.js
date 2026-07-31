const storyboardBoardPageWidth = 1152;
const storyboardBoardPageHeight = 648;
const storyboardBoardMargin = 30;

export function storyboardBoardGridForAspect(aspectRatio = "16:9") {
  switch (normalizeStoryboardBoardAspectRatio(aspectRatio)) {
    case "21:9":
      return { cols: 2, rows: 2, gapX: 18, rowGap: 18, captionHeight: 72 };
    case "9:16":
      return { cols: 4, rows: 1, gapX: 18, rowGap: 0, captionHeight: 92 };
    case "1:1":
      return { cols: 4, rows: 2, gapX: 18, rowGap: 18, captionHeight: 72 };
    case "16:9":
    default:
      return { cols: 3, rows: 2, gapX: 18, rowGap: 18, captionHeight: 72 };
  }
}

export function storyboardBoardSheetLayout({ aspectRatio = "16:9", frameCount = 1 } = {}) {
  const normalizedAspectRatio = normalizeStoryboardBoardAspectRatio(aspectRatio);
  const grid = storyboardBoardGridForAspect(normalizedAspectRatio);
  const ratio = storyboardBoardAspectRatioNumber(normalizedAspectRatio);
  const availableWidth = storyboardBoardPageWidth - storyboardBoardMargin * 2;
  const availableHeight = storyboardBoardPageHeight - storyboardBoardMargin * 2;
  const widthByColumns = (availableWidth - grid.gapX * (grid.cols - 1)) / grid.cols;
  const heightByRows = (
    availableHeight - grid.rowGap * (grid.rows - 1) - grid.captionHeight * grid.rows
  ) / grid.rows;
  const panelWidth = Math.max(1, Math.min(widthByColumns, heightByRows * ratio));
  const panelHeight = Math.max(1, panelWidth / ratio);
  const referenceGridWidth = panelWidth * grid.cols + grid.gapX * (grid.cols - 1);
  const referenceGridHeight = (
    panelHeight * grid.rows + grid.captionHeight * grid.rows + grid.rowGap * (grid.rows - 1)
  );
  const startX = storyboardBoardMargin + Math.max(0, (availableWidth - referenceGridWidth) / 2);
  const topMargin = storyboardBoardMargin + Math.max(0, (availableHeight - referenceGridHeight) / 2);
  const bottomMargin = topMargin;
  const rows = Math.max(grid.rows, Math.ceil(Math.max(1, Number(frameCount) || 1) / grid.cols));
  const continuousRowGap = grid.rowGap || 18;
  const height = (
    topMargin +
    rows * (panelHeight + grid.captionHeight) +
    Math.max(0, rows - 1) * continuousRowGap +
    bottomMargin
  );

  return {
    ...grid,
    aspectRatio: normalizedAspectRatio,
    width: storyboardBoardPageWidth,
    height,
    rows,
    panelWidth,
    panelHeight,
    startX,
    topMargin,
    bottomMargin,
    continuousRowGap
  };
}

function normalizeStoryboardBoardAspectRatio(value = "16:9") {
  const ratio = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return ["16:9", "21:9", "9:16", "1:1"].includes(ratio) ? ratio : "16:9";
}

function storyboardBoardAspectRatioNumber(value = "16:9") {
  const [width, height] = normalizeStoryboardBoardAspectRatio(value).split(":").map(Number);
  return width / Math.max(1, height);
}

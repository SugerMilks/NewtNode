import { clamp } from "./nodeGeometry.js";

const defaultMoodBoardOutputFileName = "MOOD_BOARD.png";

export function canvasToBlob(canvas, type, errorMessage = "Could not render still frame.") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(errorMessage));
    }, type);
  });
}

export async function createTransferCollageBlob(images, outputLabel = defaultMoodBoardOutputFileName) {
  const loadedImages = await Promise.all(images.map((image) => loadCanvasImage(image.localUrl)));
  const layout = createMoodBoardLayout(loadedImages);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;

  const context = canvas.getContext("2d");
  layout.cells.forEach((cell) => {
    drawImageCover(context, cell.image, cell.x, cell.y, cell.width, cell.height);
  });

  return canvasToBlob(canvas, "image/png", `Could not create ${outputLabel}.`);
}

export function createMoodBoardLayout(images) {
  if (!images.length) throw new Error("Upload at least one mood board image.");

  const canvasWidth = 1536;
  const preferredAspect = 16 / 9;
  const minAspect = 1.25;
  const maxAspect = 2.35;
  const items = images.map((image, index) => ({
    image,
    index,
    ratio: imageAspectRatio(image)
  }));
  let bestCandidate = null;

  moodBoardOrders(items).forEach((orderedItems, orderIndex) => {
    moodBoardRowPartitions(orderedItems.length).forEach((rowLengths) => {
      const rows = [];
      let cursor = 0;
      rowLengths.forEach((length) => {
        rows.push(orderedItems.slice(cursor, cursor + length));
        cursor += length;
      });

      const naturalHeights = rows.map((row) => canvasWidth / row.reduce((total, item) => total + item.ratio, 0));
      const naturalHeight = naturalHeights.reduce((total, height) => total + height, 0);
      const naturalAspect = canvasWidth / naturalHeight;
      const targetAspect = clamp(naturalAspect, minAspect, maxAspect);
      const targetHeight = canvasWidth / targetAspect;
      const heightScale = targetHeight / naturalHeight;
      const rowBalancePenalty = rowBalanceScore(naturalHeights);
      const tinyCellPenalty = moodBoardTinyCellPenalty(rows, naturalHeights, canvasWidth);
      const orderPenalty = orderIndex === 0 ? 0 : 0.08;
      const dominantWideBonus = rows[0]?.length === 1 && rows[0][0]?.ratio > 1.45 ? -0.08 : 0;
      const score =
        Math.abs(Math.log(naturalAspect / preferredAspect)) * 0.7 +
        Math.abs(Math.log(heightScale)) * 1.8 +
        rowBalancePenalty * 0.45 +
        tinyCellPenalty +
        rows.length * 0.025 +
        orderPenalty +
        dominantWideBonus;

      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = { rows, naturalHeights, targetHeight, score };
      }
    });
  });

  const canvasHeight = Math.round(bestCandidate.targetHeight);
  const naturalTotalHeight = bestCandidate.naturalHeights.reduce((total, height) => total + height, 0);
  const heightScale = canvasHeight / naturalTotalHeight;
  const cells = [];
  let y = 0;

  bestCandidate.rows.forEach((row, rowIndex) => {
    const isLastRow = rowIndex === bestCandidate.rows.length - 1;
    const rowHeight = isLastRow ? canvasHeight - y : bestCandidate.naturalHeights[rowIndex] * heightScale;
    const ratioTotal = row.reduce((total, item) => total + item.ratio, 0);
    let x = 0;

    row.forEach((item, itemIndex) => {
      const isLastItem = itemIndex === row.length - 1;
      const width = isLastItem ? canvasWidth - x : canvasWidth * (item.ratio / ratioTotal);
      cells.push({
        image: item.image,
        x,
        y,
        width,
        height: rowHeight
      });
      x += width;
    });

    y += rowHeight;
  });

  return {
    width: canvasWidth,
    height: canvasHeight,
    cells
  };
}

export function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load one of the mood board images."));
    image.src = src;
  });
}

export function drawImageCover(context, image, x, y, width, height) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function moodBoardOrders(items) {
  const candidates = [
    items,
    [...items].sort((first, second) => second.ratio - first.ratio),
    [...items].sort((first, second) => first.ratio - second.ratio)
  ];
  const dominantWideIndex = items.reduce((bestIndex, item, index) => (item.ratio > items[bestIndex].ratio ? index : bestIndex), 0);
  if (items[dominantWideIndex]?.ratio > 1.45) {
    candidates.push([items[dominantWideIndex], ...items.filter((_, index) => index !== dominantWideIndex)]);
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.map((item) => item.index).join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function moodBoardRowPartitions(count) {
  const maxRows = Math.min(3, count);
  const maxPerRow = Math.min(4, count);
  const partitions = [];

  function build(remaining, current) {
    if (!remaining) {
      partitions.push(current);
      return;
    }
    if (current.length >= maxRows) return;

    for (let length = 1; length <= Math.min(maxPerRow, remaining); length += 1) {
      build(remaining - length, [...current, length]);
    }
  }

  build(count, []);
  return partitions;
}

function imageAspectRatio(image) {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  return clamp(width / height, 0.25, 4.5);
}

function rowBalanceScore(heights) {
  if (heights.length <= 1) return 0;
  const average = heights.reduce((total, height) => total + height, 0) / heights.length;
  return heights.reduce((total, height) => total + Math.abs(height - average) / average, 0) / heights.length;
}

function moodBoardTinyCellPenalty(rows, rowHeights, canvasWidth) {
  return rows.reduce((penalty, row, rowIndex) => {
    const ratioTotal = row.reduce((total, item) => total + item.ratio, 0);
    return row.reduce((rowPenalty, item) => {
      const width = canvasWidth * (item.ratio / ratioTotal);
      const height = rowHeights[rowIndex];
      const narrowPenalty = width < 190 ? (190 - width) / 190 : 0;
      const shortPenalty = height < 190 ? (190 - height) / 190 : 0;
      return rowPenalty + narrowPenalty + shortPenalty;
    }, penalty);
  }, 0);
}

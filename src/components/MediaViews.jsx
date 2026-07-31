import React from "react";
import { Box, Check, ChevronLeft, ChevronRight, Crop, Download, FileAudio, FileImage, Film, FlipHorizontal, FlipVertical, ImagePlus, Loader2, Paintbrush, PanelRightClose, Plus, RefreshCw, RotateCw, Sun, Type, Video, X } from "lucide-react";
import { capitalizeMediaType, finishOutputItemDragData, fullResolutionImageProps, outputDragMime as defaultOutputDragMime, previewImageUrl, setOutputItemDragData } from "../mediaAssets.js";
import { normalizedResultItems, resultDownloadFileName } from "../mediaResults.js";

const LazyModel3DViewer = React.lazy(() => import("./Model3DViewer.jsx").then((module) => ({ default: module.Model3DViewer })));

export function MediaPreview({ node, onPreviewOpen }) {
  if (!node.data.resultUrl) {
    return (
      <div className="media-preview empty">
        <UploadIcon type={node.type} />
        <span>No upload yet</span>
      </div>
    );
  }

  const dragItem = {
    id: `${node.id}:${node.data.resultUrl}`,
    url: node.data.resultUrl,
    type: node.type,
    label: node.data.fileName || capitalizeMediaType(node.type),
    fileName: node.data.fileName || "",
    mimeType: node.data.mimeType || ""
  };
  function startPreviewDrag(event) {
    setOutputItemDragData(event.dataTransfer, dragItem, defaultOutputDragMime);
  }

  function endPreviewDrag(event) {
    finishOutputItemDragData(dragItem, event);
  }

  if (node.type === "image") {
    const itemIndex = Math.max(0, normalizedResultItems(node.data.resultItems, node.data.resultUrl, "image").findIndex((item) => item.url === node.data.resultUrl));
    return (
      <div
        className="media-preview"
        draggable
        onPointerDown={(event) => event.stopPropagation()}
        onDragStart={startPreviewDrag}
        onDragEnd={endPreviewDrag}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPreviewOpen?.({
            ...dragItem,
            type: "image",
            editContext: {
              type: "nodeResult",
              nodeId: node.id,
              itemIndex
            }
          });
        }}
        title="Drag image into another node or double-click to edit"
      >
        <img {...fullResolutionImageProps(node.data.resultUrl, node.data.fileName)} src={previewImageUrl(node.data.resultUrl, node.data.thumbnailUrl)} alt={node.data.fileName || "Uploaded image"} draggable={false} loading="lazy" decoding="async" onError={useNewtNodeImageFallback} />
      </div>
    );
  }

  if (node.type === "video") {
    return (
      <div className="media-preview" draggable onDragStart={startPreviewDrag} onDragEnd={endPreviewDrag} title="Drag video into another node">
        <video src={node.data.resultUrl} controls muted loop playsInline preload="metadata" draggable={false} onError={useNewtNodeVideoFallback} />
      </div>
    );
  }

  return (
    <div className="media-preview audio" draggable onDragStart={startPreviewDrag} onDragEnd={endPreviewDrag} title="Drag audio into another node">
      <FileAudio size={28} />
      <audio src={node.data.resultUrl} controls />
    </div>
  );
}

export function UploadIcon({ type }) {
  if (type === "image") return <FileImage size={22} />;
  if (type === "video") return <Video size={22} />;
  if (type === "audio") return <FileAudio size={22} />;
  return <Plus size={22} />;
}

export const ProjectOutputDrawer = React.memo(function ProjectOutputDrawer({ items, onClose, onRefresh, onPreviewOpen, outputDragMime = defaultOutputDragMime }) {
  const startDrag = React.useCallback((event, item) => {
    setOutputItemDragData(event.dataTransfer, item, outputDragMime);
  }, [outputDragMime]);

  return (
    <aside className="project-output-drawer">
      <div className="output-drawer-header">
        <div className="output-drawer-actions">
          <button onClick={onRefresh} title="Refresh outputs" aria-label="Refresh outputs">
            <RefreshCw size={14} />
          </button>
          <button onClick={onClose} title="Hide project outputs" aria-label="Hide project outputs">
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>
      <div className="project-output-list">
        {items.length ? (
          items.map((item) => (
            <ProjectOutputThumb
              key={item.id}
              item={item}
              onDragStart={startDrag}
              onDragEnd={(item, event) => finishOutputItemDragData(item, event)}
              onPreviewOpen={onPreviewOpen}
            />
          ))
        ) : (
          <div className="project-output-empty">
            <ImagePlus size={22} />
          </div>
        )}
      </div>
    </aside>
  );
});

const ProjectOutputThumb = React.memo(function ProjectOutputThumb({ item, onDragStart, onDragEnd, onPreviewOpen }) {
  const thumbRef = React.useRef(null);
  const mediaSrc = useLazyRailMediaSrc(thumbRef, item.type === "image" ? previewImageUrl(item) : item.thumbnailUrl || item.url);
  const KindIcon = item.type === "video" ? Film : item.type === "audio" ? FileAudio : item.type === "model3d" ? Box : FileImage;

  return (
    <div
      ref={thumbRef}
      className={`project-output-thumb ${item.type}`}
      draggable
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={(event) => onDragEnd(item, event)}
      onDoubleClick={() => onPreviewOpen?.(item)}
      title={`${item.label || item.fileName || "Output"}\nDrag to canvas or double-click to preview`}
    >
      {item.type === "image" && mediaSrc && <img {...fullResolutionImageProps(item)} src={mediaSrc} alt={item.label || item.fileName || "Generated output"} draggable={false} loading="lazy" decoding="async" onError={useNewtNodeImageFallback} />}
      {item.type === "video" && mediaSrc && <video src={mediaSrc} muted playsInline preload="metadata" draggable={false} onError={useNewtNodeVideoFallback} />}
      {(item.type === "model3d" || item.type === "audio" || !mediaSrc) && (
        <div className="project-output-placeholder">
          <KindIcon size={22} />
        </div>
      )}
      <span className="project-output-kind">
        <KindIcon size={12} />
      </span>
    </div>
  );
});

function useLazyRailMediaSrc(ref, url) {
  const [loadedUrl, setLoadedUrl] = React.useState("");

  React.useEffect(() => {
    if (!url) {
      setLoadedUrl("");
      return undefined;
    }
    if (loadedUrl === url) return undefined;
    const element = ref.current;
    if (!element || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setLoadedUrl(url);
      return undefined;
    }

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setLoadedUrl(url);
        observer.disconnect();
      },
      { rootMargin: "180px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, loadedUrl, url]);

  return loadedUrl === url ? url : "";
}

const defaultCropRect = { x: 8, y: 8, width: 84, height: 84 };
const defaultToneAdjustments = { brightness: 0, contrast: 0, saturation: 0 };
const defaultCurvePoints = [
  { x: 0, y: 100 },
  { x: 100, y: 0 }
];
const textOverlayFonts = ["Inter", "Arial", "Helvetica", "Comic Sans MS", "Georgia", "Times New Roman", "Courier New", "Impact", "Trebuchet MS", "Verdana", "Avenir Next"];
const defaultTextOverlay = {
  text: "",
  x: 50,
  y: 50,
  size: 7,
  color: "#f4f0e8",
  font: "Inter"
};
const defaultPaintPrompt = "";
const defaultPaintBrushSize = 42;
const maxCurvePoints = 7;
const curvePreviewMaxEdge = 1400;

function clampCurveNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function normalizedTextOverlay(overlay = defaultTextOverlay) {
  const color = String(overlay?.color || defaultTextOverlay.color);
  return {
    text: String(overlay?.text || "").slice(0, 220),
    x: clampCurveNumber(overlay?.x ?? defaultTextOverlay.x, 0, 100),
    y: clampCurveNumber(overlay?.y ?? defaultTextOverlay.y, 0, 100),
    size: clampCurveNumber(overlay?.size ?? defaultTextOverlay.size, 2, 24),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : defaultTextOverlay.color,
    font: textOverlayFonts.includes(overlay?.font) ? overlay.font : defaultTextOverlay.font
  };
}

function sortedCurvePoints(points = defaultCurvePoints) {
  const safePoints = Array.isArray(points) && points.length ? points : defaultCurvePoints;
  const normalized = safePoints
    .map((point) => ({
      x: clampCurveNumber(point?.x, 0, 100),
      y: clampCurveNumber(point?.y, 0, 100)
    }))
    .sort((a, b) => a.x - b.x);
  const withoutNearEndpoints = normalized.filter((point) => point.x > 0.5 && point.x < 99.5);
  return [
    { x: 0, y: normalized[0]?.x <= 0.5 ? normalized[0].y : 100 },
    ...withoutNearEndpoints.slice(0, maxCurvePoints - 2),
    { x: 100, y: normalized[normalized.length - 1]?.x >= 99.5 ? normalized[normalized.length - 1].y : 0 }
  ];
}

function curveControlPoints(points = defaultCurvePoints) {
  const controls = sortedCurvePoints(points).map((point) => ({
    input: Math.round(clampCurveNumber(point.x, 0, 100) * 2.55),
    output: Math.round(clampCurveNumber(100 - point.y, 0, 100) * 2.55)
  }));
  return controls.filter((point, index) => index === 0 || point.input !== controls[index - 1].input);
}

function interpolatedCurveOutput(points, input) {
  if (points.length < 2) return input;
  let segmentIndex = 0;
  while (segmentIndex < points.length - 2 && input > points[segmentIndex + 1].input) {
    segmentIndex += 1;
  }
  const p0 = points[Math.max(0, segmentIndex - 1)];
  const p1 = points[segmentIndex];
  const p2 = points[Math.min(segmentIndex + 1, points.length - 1)];
  const p3 = points[Math.min(segmentIndex + 2, points.length - 1)];
  const range = Math.max(1, p2.input - p1.input);
  const t = clampCurveNumber((input - p1.input) / range, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const output = 0.5 * (
    (2 * p1.output) +
    (-p0.output + p2.output) * t +
    (2 * p0.output - 5 * p1.output + 4 * p2.output - p3.output) * t2 +
    (-p0.output + 3 * p1.output - 3 * p2.output + p3.output) * t3
  );
  return Math.round(clampCurveNumber(output, 0, 255));
}

function curveLookup(points = defaultCurvePoints) {
  const controls = curveControlPoints(points);
  const lookup = new Uint8ClampedArray(256);
  for (let input = 0; input < 256; input += 1) {
    lookup[input] = interpolatedCurveOutput(controls, input);
  }
  return lookup;
}

function applyCurveToImageData(context, width, height, points = defaultCurvePoints) {
  const imageData = context.getImageData(0, 0, width, height);
  const lookup = curveLookup(points);
  for (let index = 0; index < imageData.data.length; index += 4) {
    imageData.data[index] = lookup[imageData.data[index]];
    imageData.data[index + 1] = lookup[imageData.data[index + 1]];
    imageData.data[index + 2] = lookup[imageData.data[index + 2]];
  }
  context.putImageData(imageData, 0, 0);
}

function normalizedToneAdjustments(adjustments = defaultToneAdjustments) {
  return {
    brightness: Math.round(clampCurveNumber(adjustments?.brightness, -100, 100)),
    contrast: Math.round(clampCurveNumber(adjustments?.contrast, -100, 100)),
    saturation: Math.round(clampCurveNumber(adjustments?.saturation, -100, 100))
  };
}

function applyToneAdjustmentsToImageData(context, width, height, adjustments = defaultToneAdjustments) {
  const { brightness, contrast, saturation } = normalizedToneAdjustments(adjustments);
  const imageData = context.getImageData(0, 0, width, height);
  const brightnessOffset = brightness * 2.55;
  const contrastValue = contrast * 2.55;
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturationFactor = 1 + saturation / 100;
  for (let index = 0; index < imageData.data.length; index += 4) {
    let red = contrastFactor * (imageData.data[index] - 128) + 128 + brightnessOffset;
    let green = contrastFactor * (imageData.data[index + 1] - 128) + 128 + brightnessOffset;
    let blue = contrastFactor * (imageData.data[index + 2] - 128) + 128 + brightnessOffset;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = luminance + (red - luminance) * saturationFactor;
    green = luminance + (green - luminance) * saturationFactor;
    blue = luminance + (blue - luminance) * saturationFactor;
    imageData.data[index] = clampCurveNumber(red, 0, 255);
    imageData.data[index + 1] = clampCurveNumber(green, 0, 255);
    imageData.data[index + 2] = clampCurveNumber(blue, 0, 255);
  }
  context.putImageData(imageData, 0, 0);
}

function loadPreviewImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image preview."));
    image.src = url;
  });
}

async function createCurvesPreviewUrl(url, points = defaultCurvePoints) {
  const image = await loadPreviewImage(url);
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, curvePreviewMaxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not preview curves.");
  context.drawImage(image, 0, 0, width, height);
  applyCurveToImageData(context, width, height, points);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) resolve(nextBlob);
      else reject(new Error("Could not preview curves."));
    }, "image/jpeg", 0.92);
  });
  return URL.createObjectURL(blob);
}

async function createTonePreviewUrl(url, adjustments = defaultToneAdjustments, points = defaultCurvePoints) {
  const image = await loadPreviewImage(url);
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, curvePreviewMaxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not preview adjustments.");
  context.drawImage(image, 0, 0, width, height);
  applyToneAdjustmentsToImageData(context, width, height, adjustments);
  applyCurveToImageData(context, width, height, points);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) resolve(nextBlob);
      else reject(new Error("Could not preview adjustments."));
    }, "image/jpeg", 0.92);
  });
  return URL.createObjectURL(blob);
}

export function OutputPreviewLightbox({ item, onClose, onApplyImageEdit, onRestoreImageEdit }) {
  const imageEditorRef = React.useRef(null);
  const cropDragRef = React.useRef(null);
  const textDragRef = React.useRef(null);
  const paintCanvasRef = React.useRef(null);
  const paintMaskDataCanvasRef = React.useRef(null);
  const paintDragRef = React.useRef(null);
  const curveGraphRef = React.useRef(null);
  const curveDragRef = React.useRef(null);
  const curvePreviewUrlRef = React.useRef("");
  const tonePreviewUrlRef = React.useRef("");
  const toneSliderSnapshotRef = React.useRef(null);
  const textChangeSnapshotRef = React.useRef(null);
  const editUndoStackRef = React.useRef([]);
  const editRedoStackRef = React.useRef([]);
  const committedUndoStackRef = React.useRef([]);
  const committedRedoStackRef = React.useRef([]);
  const activeItemRef = React.useRef(item);
  const [cropMode, setCropMode] = React.useState(false);
  const [cropRect, setCropRect] = React.useState(defaultCropRect);
  const [toneMode, setToneMode] = React.useState(false);
  const [toneAdjustments, setToneAdjustments] = React.useState(defaultToneAdjustments);
  const [curvesMode, setCurvesMode] = React.useState(false);
  const [curvePoints, setCurvePoints] = React.useState(defaultCurvePoints);
  const [textMode, setTextMode] = React.useState(false);
  const [textOverlay, setTextOverlay] = React.useState(defaultTextOverlay);
  const [paintMode, setPaintMode] = React.useState(false);
  const [paintPrompt, setPaintPrompt] = React.useState(defaultPaintPrompt);
  const [paintBrushSize, setPaintBrushSize] = React.useState(defaultPaintBrushSize);
  const [paintHasMask, setPaintHasMask] = React.useState(false);
  const [curvePreviewUrl, setCurvePreviewUrl] = React.useState("");
  const [tonePreviewUrl, setTonePreviewUrl] = React.useState("");
  const [displayItem, setDisplayItem] = React.useState(item);
  const [editBusy, setEditBusy] = React.useState(false);
  const [editError, setEditError] = React.useState("");
  const KindIcon = displayItem.type === "video" ? Film : displayItem.type === "audio" ? FileAudio : displayItem.type === "model3d" ? Box : FileImage;
  const label = displayItem.label || displayItem.fileName || `${capitalizeMediaType(displayItem.type)} preview`;
  const canEditImage = displayItem.type === "image" && ["previewLayout", "storyboardFrame", "nodeResult"].includes(displayItem.editContext?.type) && typeof onApplyImageEdit === "function";
  const inpaintBusy = editBusy && paintMode;

  React.useEffect(() => {
    activeItemRef.current = displayItem;
  }, [displayItem]);

  function currentEditSnapshot() {
    return {
      cropRect: { ...cropRect },
      toneAdjustments: normalizedToneAdjustments(toneAdjustments),
      curvePoints: normalizedCurvePoints(curvePoints),
      textOverlay: normalizedTextOverlay(textOverlay)
    };
  }

  function restoreEditSnapshot(snapshot) {
    if (!snapshot) return;
    setCropRect(clampCropRect(snapshot.cropRect || defaultCropRect));
    setToneAdjustments(normalizedToneAdjustments(snapshot.toneAdjustments || defaultToneAdjustments));
    setCurvePoints(normalizedCurvePoints(snapshot.curvePoints || defaultCurvePoints));
    setTextOverlay(normalizedTextOverlay(snapshot.textOverlay || defaultTextOverlay));
    setEditError("");
  }

  function pushEditUndoSnapshot(snapshot = currentEditSnapshot()) {
    editUndoStackRef.current = [...editUndoStackRef.current.slice(-39), snapshot];
    editRedoStackRef.current = [];
  }

  async function restoreCommittedPreviewItem(nextItem, mode) {
    if (!nextItem || editBusy || typeof onRestoreImageEdit !== "function") return false;
    const currentItem = activeItemRef.current;
    setEditBusy(true);
    setEditError("");
    try {
      const restoredItem = await onRestoreImageEdit(nextItem);
      const displayNext = restoredItem || nextItem;
      if (mode === "undo") {
        committedRedoStackRef.current = [...committedRedoStackRef.current.slice(-39), currentItem];
      } else {
        committedUndoStackRef.current = [...committedUndoStackRef.current.slice(-39), currentItem];
      }
      activeItemRef.current = displayNext;
      setDisplayItem(displayNext);
      setCropMode(false);
      setToneMode(false);
      setCurvesMode(false);
      setTextMode(false);
      setPaintMode(false);
      setCropRect(defaultCropRect);
      setToneAdjustments(defaultToneAdjustments);
      setCurvePoints(defaultCurvePoints);
      setTextOverlay(defaultTextOverlay);
      setPaintPrompt(defaultPaintPrompt);
      setPaintBrushSize(defaultPaintBrushSize);
      setPaintHasMask(false);
      clearPaintMask();
      return true;
    } catch (error) {
      setEditError(error.message || "Could not restore layout image.");
      return false;
    } finally {
      setEditBusy(false);
    }
  }

  async function undoPreviewEdit() {
    const previous = editUndoStackRef.current.pop();
    if (previous) {
      editRedoStackRef.current = [...editRedoStackRef.current.slice(-39), currentEditSnapshot()];
      restoreEditSnapshot(previous);
      return true;
    }
    const committedPrevious = committedUndoStackRef.current.pop();
    if (!committedPrevious) return false;
    const restored = await restoreCommittedPreviewItem(committedPrevious, "undo");
    if (!restored) committedUndoStackRef.current = [...committedUndoStackRef.current, committedPrevious];
    return restored;
  }

  async function redoPreviewEdit() {
    const next = editRedoStackRef.current.pop();
    if (next) {
      editUndoStackRef.current = [...editUndoStackRef.current.slice(-39), currentEditSnapshot()];
      restoreEditSnapshot(next);
      return true;
    }
    const committedNext = committedRedoStackRef.current.pop();
    if (!committedNext) return false;
    const restored = await restoreCommittedPreviewItem(committedNext, "redo");
    if (!restored) committedRedoStackRef.current = [...committedRedoStackRef.current, committedNext];
    return restored;
  }

  function sameCurvePoints(a, b) {
    const left = normalizedCurvePoints(a);
    const right = normalizedCurvePoints(b);
    return left.length === right.length && left.every((point, index) => (
      Math.abs(point.x - right[index].x) < 0.01 && Math.abs(point.y - right[index].y) < 0.01
    ));
  }

  function previewEditorKeyTargetIsTyping(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='slider']"));
  }

  function applyActivePreviewTool() {
    if (!canEditImage || editBusy) return false;
    if (cropMode) {
      applyEdit({ type: "crop", cropRect: clampCropRect(cropRect) });
      return true;
    }
    if (textMode) {
      const overlay = normalizedTextOverlay(textOverlay);
      if (!overlay.text.trim()) return false;
      applyEdit({ type: "text", overlay });
      return true;
    }
    if (paintMode) {
      if (!paintHasMask || !paintPrompt.trim()) return false;
      applyPaintEdit();
      return true;
    }
    if (toneMode) {
      applyEdit({
        type: "tone",
        adjustments: normalizedToneAdjustments(toneAdjustments),
        points: normalizedCurvePoints(curvePoints)
      });
      return true;
    }
    return false;
  }

  React.useEffect(() => {
    function handleKeyDown(event) {
      const commandKey = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (
        event.key === "Enter" &&
        !commandKey &&
        !event.altKey &&
        !event.shiftKey &&
        !previewEditorKeyTargetIsTyping(event.target) &&
        applyActivePreviewTool()
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      if (!canEditImage || !commandKey || (key !== "z" && key !== "y")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if ((key === "z" && event.shiftKey) || key === "y") {
        redoPreviewEdit();
      } else {
        undoPreviewEdit();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [canEditImage, cropMode, cropRect, curvePoints, curvesMode, editBusy, onClose, onRestoreImageEdit, paintHasMask, paintMode, paintPrompt, textMode, textOverlay, toneAdjustments, toneMode]);

  React.useEffect(() => {
    setCropMode(false);
    setCropRect(defaultCropRect);
    setToneMode(false);
    setToneAdjustments(defaultToneAdjustments);
    setCurvesMode(false);
    setCurvePoints(defaultCurvePoints);
    setTextMode(false);
    setTextOverlay(defaultTextOverlay);
    setPaintMode(false);
    setPaintPrompt(defaultPaintPrompt);
    setPaintBrushSize(defaultPaintBrushSize);
    setPaintHasMask(false);
    clearPaintMask();
    setCurvePreviewUrl("");
    setTonePreviewUrl("");
    setDisplayItem(item);
    activeItemRef.current = item;
    setEditBusy(false);
    setEditError("");
    editUndoStackRef.current = [];
    editRedoStackRef.current = [];
    committedUndoStackRef.current = [];
    committedRedoStackRef.current = [];
    toneSliderSnapshotRef.current = null;
    textChangeSnapshotRef.current = null;
  }, [item?.editContext?.nodeId, item?.editContext?.itemId]);

  React.useEffect(() => {
    if (!curvesMode || displayItem.type !== "image" || !displayItem.url) {
      if (curvePreviewUrlRef.current) {
        URL.revokeObjectURL(curvePreviewUrlRef.current);
        curvePreviewUrlRef.current = "";
      }
      setCurvePreviewUrl("");
      return undefined;
    }

    let canceled = false;
    const previewPoints = normalizedCurvePoints(curvePoints);
    const timeout = window.setTimeout(() => {
      createCurvesPreviewUrl(displayItem.url, previewPoints)
        .then((url) => {
          if (canceled) {
            URL.revokeObjectURL(url);
            return;
          }
          if (curvePreviewUrlRef.current) URL.revokeObjectURL(curvePreviewUrlRef.current);
          curvePreviewUrlRef.current = url;
          setCurvePreviewUrl(url);
        })
        .catch(() => {
          if (!canceled) setCurvePreviewUrl("");
        });
    }, 35);

    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [curvesMode, curvePoints, displayItem.type, displayItem.url]);

  React.useEffect(() => {
    if (!toneMode || displayItem.type !== "image" || !displayItem.url) {
      if (tonePreviewUrlRef.current) {
        URL.revokeObjectURL(tonePreviewUrlRef.current);
        tonePreviewUrlRef.current = "";
      }
      setTonePreviewUrl("");
      return undefined;
    }

    let canceled = false;
    const previewAdjustments = normalizedToneAdjustments(toneAdjustments);
    const timeout = window.setTimeout(() => {
      createTonePreviewUrl(displayItem.url, previewAdjustments, normalizedCurvePoints(curvePoints))
        .then((url) => {
          if (canceled) {
            URL.revokeObjectURL(url);
            return;
          }
          if (tonePreviewUrlRef.current) URL.revokeObjectURL(tonePreviewUrlRef.current);
          tonePreviewUrlRef.current = url;
          setTonePreviewUrl(url);
        })
        .catch(() => {
          if (!canceled) setTonePreviewUrl("");
        });
    }, 35);

    return () => {
      canceled = true;
      window.clearTimeout(timeout);
    };
  }, [toneMode, toneAdjustments, curvePoints, displayItem.type, displayItem.url]);

  React.useEffect(() => () => {
    if (curvePreviewUrlRef.current) URL.revokeObjectURL(curvePreviewUrlRef.current);
    if (tonePreviewUrlRef.current) URL.revokeObjectURL(tonePreviewUrlRef.current);
  }, []);

  React.useEffect(() => {
    if (!paintMode) return undefined;
    let frame = window.requestAnimationFrame(() => resizePaintCanvas(false));
    const target = imageEditorRef.current;
    const observer = typeof ResizeObserver !== "undefined" && target
      ? new ResizeObserver(() => resizePaintCanvas(true))
      : null;
    observer?.observe(target);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [paintMode, displayItem.url]);

  function cropPointerPoint(event) {
    const bounds = imageEditorRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return null;
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100
    };
  }

  function clampCropRect(rect) {
    const rawWidth = Number(rect.width);
    const rawHeight = Number(rect.height);
    const rawSize = Number.isFinite(rawWidth) && Number.isFinite(rawHeight)
      ? Math.min(rawWidth, rawHeight)
      : Number.isFinite(rawWidth)
      ? rawWidth
      : Number.isFinite(rawHeight)
      ? rawHeight
      : 100;
    let x = Math.min(Math.max(0, Number(rect.x) || 0), 92);
    let y = Math.min(Math.max(0, Number(rect.y) || 0), 92);
    const maxSize = Math.max(8, Math.min(100 - x, 100 - y));
    const size = Math.min(maxSize, Math.max(8, rawSize));
    x = Math.min(Math.max(0, x), 100 - size);
    y = Math.min(Math.max(0, y), 100 - size);
    return { x, y, width: size, height: size };
  }

  function startCropDrag(event, mode) {
    event.preventDefault();
    event.stopPropagation();
    const point = cropPointerPoint(event);
    if (!point) return;
    cropDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startPoint: point,
      startRect: cropRect
    };
    pushEditUndoSnapshot();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCropPointerMove(event) {
    const drag = cropDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const point = cropPointerPoint(event);
    if (!point) return;
    const deltaX = point.x - drag.startPoint.x;
    const deltaY = point.y - drag.startPoint.y;

    if (drag.mode === "resize") {
      const dominantDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
      const startSize = Math.min(drag.startRect.width, drag.startRect.height);
      setCropRect(clampCropRect({
        ...drag.startRect,
        width: startSize + dominantDelta,
        height: startSize + dominantDelta
      }));
      return;
    }

    setCropRect(clampCropRect({
      ...drag.startRect,
      x: drag.startRect.x + deltaX,
      y: drag.startRect.y + deltaY
    }));
  }

  function stopCropDrag(event) {
    const drag = cropDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
  }

  function resizePaintCanvas(preserve = true) {
    const canvas = paintCanvasRef.current;
    const bounds = imageEditorRef.current?.getBoundingClientRect();
    if (!canvas || !bounds?.width || !bounds?.height) return;
    const pixelRatio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    redrawPaintDisplayCanvas();
  }

  function clearPaintMask() {
    const canvas = paintCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    const dataCanvas = paintMaskDataCanvasRef.current;
    const dataContext = dataCanvas?.getContext("2d");
    if (dataCanvas && dataContext) dataContext.clearRect(0, 0, dataCanvas.width, dataCanvas.height);
    setPaintHasMask(false);
  }

  function previewPaintImageElement() {
    return imageEditorRef.current?.querySelector("img") || null;
  }

  function ensurePaintMaskDataCanvas() {
    const image = previewPaintImageElement();
    const width = Math.max(1, Math.round(image?.naturalWidth || image?.width || 0));
    const height = Math.max(1, Math.round(image?.naturalHeight || image?.height || 0));
    if (!width || !height) return null;
    let canvas = paintMaskDataCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      paintMaskDataCanvasRef.current = canvas;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }

  function redrawPaintDisplayCanvas() {
    const displayCanvas = paintCanvasRef.current;
    const dataCanvas = paintMaskDataCanvasRef.current;
    const context = displayCanvas?.getContext("2d");
    if (!displayCanvas || !context) return;
    context.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    if (dataCanvas?.width && dataCanvas?.height) {
      context.drawImage(dataCanvas, 0, 0, displayCanvas.width, displayCanvas.height);
    }
  }

  function paintCanvasPoint(event) {
    const image = previewPaintImageElement();
    const bounds = image?.getBoundingClientRect();
    if (!image || !bounds?.width || !bounds?.height) return null;
    const naturalWidth = image.naturalWidth || image.width || bounds.width;
    const naturalHeight = image.naturalHeight || image.height || bounds.height;
    const displayX = event.clientX - bounds.left;
    const displayY = event.clientY - bounds.top;
    return {
      displayX,
      displayY,
      naturalX: displayX * (naturalWidth / bounds.width),
      naturalY: displayY * (naturalHeight / bounds.height),
      displayWidth: bounds.width,
      naturalWidth
    };
  }

  function drawPaintStroke(from, to) {
    const dataCanvas = ensurePaintMaskDataCanvas();
    const context = dataCanvas?.getContext("2d");
    if (!dataCanvas || !context || !from?.displayWidth) return;
    const scale = from.naturalWidth / from.displayWidth;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.lineWidth = Math.max(4, paintBrushSize * scale);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#ead42c";
    context.shadowBlur = 0;
    context.beginPath();
    context.moveTo(from.naturalX, from.naturalY);
    context.lineTo(to.naturalX, to.naturalY);
    context.stroke();
    context.restore();
    redrawPaintDisplayCanvas();
    setPaintHasMask(true);
  }

  function startPaintStroke(event) {
    event.preventDefault();
    event.stopPropagation();
    resizePaintCanvas(true);
    const point = paintCanvasPoint(event);
    if (!point) return;
    paintDragRef.current = { pointerId: event.pointerId, point };
    drawPaintStroke(point, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePaintStroke(event) {
    const drag = paintDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const point = paintCanvasPoint(event);
    if (!point) return;
    drawPaintStroke(drag.point, point);
    paintDragRef.current = { ...drag, point };
  }

  function stopPaintStroke(event) {
    const drag = paintDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    paintDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
  }

  function createPaintMaskDataUrl() {
    const dataCanvas = paintMaskDataCanvasRef.current;
    if (!dataCanvas || !dataCanvas.width || !dataCanvas.height || !paintHasMask) return "";
    const width = dataCanvas.width;
    const height = dataCanvas.height;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = Math.max(1, Math.round(width));
    maskCanvas.height = Math.max(1, Math.round(height));
    const context = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "";
    context.fillStyle = "#000";
    context.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    context.drawImage(dataCanvas, 0, 0, maskCanvas.width, maskCanvas.height);
    const imageData = context.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const luminance = (imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2]) / 3;
      const masked = luminance > 24;
      imageData.data[index] = masked ? 255 : 0;
      imageData.data[index + 1] = masked ? 255 : 0;
      imageData.data[index + 2] = masked ? 255 : 0;
      imageData.data[index + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    return maskCanvas.toDataURL("image/png");
  }

  function applyPaintEdit() {
    const maskDataUrl = createPaintMaskDataUrl();
    if (!maskDataUrl || !paintPrompt.trim()) return;
    applyEdit({
      type: "inpaint",
      prompt: paintPrompt.trim(),
      maskDataUrl,
      resolution: "2K"
    });
  }

  function curvePointFromEvent(event) {
    const bounds = curveGraphRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return null;
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100))
    };
  }

  function normalizedCurvePoints(points = curvePoints) {
    return sortedCurvePoints(points);
  }

  function curvePathForPoints(points = curvePoints) {
    const lookup = curveLookup(points);
    const samples = 64;
    return Array.from({ length: samples + 1 }, (_, index) => {
      const input = Math.round((index / samples) * 255);
      const x = (input / 255) * 100;
      const y = 100 - (lookup[input] / 255) * 100;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }

  function visibleCurveControlPoints(points = curvePoints) {
    const normalized = normalizedCurvePoints(points);
    return normalized
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index > 0 && index < normalized.length - 1);
  }

  function startCurvePointDrag(event, index) {
    event.preventDefault();
    event.stopPropagation();
    curveDragRef.current = { index, pointerId: event.pointerId };
    pushEditUndoSnapshot();
    curveGraphRef.current?.setPointerCapture?.(event.pointerId);
  }

  function handleCurvePointMove(event) {
    const drag = curveDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const point = curvePointFromEvent(event);
    if (!point) return;
    setCurvePoints((current) => {
      const next = normalizedCurvePoints(current);
      const previous = next[drag.index - 1];
      const following = next[drag.index + 1];
      const isFirst = drag.index === 0;
      const isLast = drag.index === next.length - 1;
      next[drag.index] = {
        x: isFirst ? 0 : isLast ? 100 : Math.min((following?.x || 100) - 1, Math.max((previous?.x || 0) + 1, point.x)),
        y: point.y
      };
      return normalizedCurvePoints(next);
    });
  }

  function stopCurvePointDrag(event) {
    const drag = curveDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    curveDragRef.current = null;
    if (curveGraphRef.current?.hasPointerCapture?.(drag.pointerId)) {
      curveGraphRef.current.releasePointerCapture(drag.pointerId);
    }
  }

  function addCurvePoint(event) {
    if (curveDragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = curvePointFromEvent(event);
    if (!point) return;
    const before = currentEditSnapshot();
    setCurvePoints((current) => {
      const next = normalizedCurvePoints(current);
      const nearExisting = next.some((existing) => Math.abs(existing.x - point.x) < 4 && Math.abs(existing.y - point.y) < 4);
      if (nearExisting || next.length >= maxCurvePoints) return next;
      const nextPoints = normalizedCurvePoints([...next, point]);
      if (!sameCurvePoints(next, nextPoints)) {
        const dragIndex = nextPoints.findIndex((nextPoint) => Math.abs(nextPoint.x - point.x) < 0.01 && Math.abs(nextPoint.y - point.y) < 0.01);
        pushEditUndoSnapshot(before);
        if (dragIndex > 0 && dragIndex < nextPoints.length - 1) {
          curveDragRef.current = { index: dragIndex, pointerId: event.pointerId };
          curveGraphRef.current?.setPointerCapture?.(event.pointerId);
        }
      }
      return nextPoints;
    });
  }

  function removeCurvePoint(event, index) {
    event.preventDefault();
    event.stopPropagation();
    const before = currentEditSnapshot();
    setCurvePoints((current) => {
      const next = normalizedCurvePoints(current);
      if (index <= 0 || index >= next.length - 1) return next;
      const nextPoints = normalizedCurvePoints(next.filter((_, pointIndex) => pointIndex !== index));
      if (!sameCurvePoints(next, nextPoints)) pushEditUndoSnapshot(before);
      return nextPoints;
    });
  }

  function resetCurves() {
    if (!sameCurvePoints(curvePoints, defaultCurvePoints)) pushEditUndoSnapshot();
    setCurvePoints(defaultCurvePoints);
  }

  function sameToneAdjustments(a, b) {
    const left = normalizedToneAdjustments(a);
    const right = normalizedToneAdjustments(b);
    return left.brightness === right.brightness && left.contrast === right.contrast && left.saturation === right.saturation;
  }

  function startToneSliderChange() {
    if (toneSliderSnapshotRef.current) return;
    toneSliderSnapshotRef.current = currentEditSnapshot();
  }

  function finishToneSliderChange() {
    const before = toneSliderSnapshotRef.current;
    toneSliderSnapshotRef.current = null;
    if (!before || sameToneAdjustments(before.toneAdjustments, toneAdjustments)) return;
    pushEditUndoSnapshot(before);
  }

  function updateToneAdjustment(key, value) {
    setToneAdjustments((current) => normalizedToneAdjustments({
      ...current,
      [key]: value
    }));
  }

  function resetToneAdjustments() {
    if (!sameToneAdjustments(toneAdjustments, defaultToneAdjustments)) pushEditUndoSnapshot();
    setToneAdjustments(defaultToneAdjustments);
  }

  function resetToneAdjustment(key) {
    const current = normalizedToneAdjustments(toneAdjustments);
    if (!Object.prototype.hasOwnProperty.call(current, key) || current[key] === 0) return;
    pushEditUndoSnapshot();
    setToneAdjustments((value) => normalizedToneAdjustments({ ...value, [key]: 0 }));
  }

  function sameTextOverlays(a, b) {
    const left = normalizedTextOverlay(a);
    const right = normalizedTextOverlay(b);
    return left.text === right.text &&
      Math.abs(left.x - right.x) < 0.01 &&
      Math.abs(left.y - right.y) < 0.01 &&
      Math.abs(left.size - right.size) < 0.01 &&
      left.color === right.color &&
      left.font === right.font;
  }

  function startTextOverlayChange() {
    if (textChangeSnapshotRef.current) return;
    textChangeSnapshotRef.current = currentEditSnapshot();
  }

  function finishTextOverlayChange() {
    const before = textChangeSnapshotRef.current;
    textChangeSnapshotRef.current = null;
    if (!before || sameTextOverlays(before.textOverlay, textOverlay)) return;
    pushEditUndoSnapshot(before);
  }

  function updateTextOverlay(patch) {
    setTextOverlay((current) => normalizedTextOverlay({ ...current, ...patch }));
  }

  function resetTextOverlay() {
    if (!sameTextOverlays(textOverlay, defaultTextOverlay)) pushEditUndoSnapshot();
    setTextOverlay(defaultTextOverlay);
  }

  function startTextDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    const point = cropPointerPoint(event);
    if (!point) return;
    textDragRef.current = {
      pointerId: event.pointerId,
      startPoint: point,
      startOverlay: normalizedTextOverlay(textOverlay)
    };
    pushEditUndoSnapshot();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleTextDrag(event) {
    const drag = textDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const point = cropPointerPoint(event);
    if (!point) return;
    updateTextOverlay({
      x: drag.startOverlay.x + point.x - drag.startPoint.x,
      y: drag.startOverlay.y + point.y - drag.startPoint.y
    });
  }

  function stopTextDrag(event) {
    const drag = textDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    textDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
  }

  async function applyEdit(edit) {
    if (!canEditImage || editBusy) return;
    setEditBusy(true);
    setEditError("");
    try {
      const previousItem = activeItemRef.current;
      const editedItem = await onApplyImageEdit(previousItem, edit);
      const nextItem = editedItem || activeItemRef.current;
      committedUndoStackRef.current = [...committedUndoStackRef.current.slice(-39), previousItem];
      committedRedoStackRef.current = [];
      activeItemRef.current = nextItem;
      setDisplayItem(nextItem);
      editUndoStackRef.current = [];
      editRedoStackRef.current = [];
      setCropRect(defaultCropRect);
      setToneAdjustments(defaultToneAdjustments);
      setCurvePoints(defaultCurvePoints);
      setTextOverlay(defaultTextOverlay);
      setPaintPrompt(defaultPaintPrompt);
      setPaintBrushSize(defaultPaintBrushSize);
      setPaintHasMask(false);
      clearPaintMask();
      setCropMode(false);
      setToneMode(false);
      setCurvesMode(false);
      setTextMode(false);
      setPaintMode(false);
    } catch (error) {
      setEditError(error.message || "Could not update layout image.");
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="output-lightbox-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`output-lightbox ${displayItem.type} ${curvesMode || toneMode || textMode || paintMode ? "curves-open" : ""}`} role="dialog" aria-modal="true" aria-label={label} onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <span>
            <KindIcon size={15} />
            {label}
          </span>
          <div className="output-lightbox-header-actions">
            {canEditImage && (
              <div className="output-lightbox-tools" aria-label="Layout image editing tools">
                <button type="button" className={cropMode ? "active" : ""} onClick={() => {
                  setCurvesMode(false);
                  setToneMode(false);
                  setTextMode(false);
                  setPaintMode(false);
                  setCropMode((value) => !value);
                }} disabled={editBusy} title="Crop image" aria-label="Crop image">
                  <Crop size={15} />
                </button>
                <button type="button" onClick={() => applyEdit({ type: "flipHorizontal" })} disabled={editBusy || cropMode || curvesMode || toneMode || textMode || paintMode} title="Flip horizontal" aria-label="Flip horizontal">
                  <FlipHorizontal size={15} />
                </button>
                <button type="button" onClick={() => applyEdit({ type: "flipVertical" })} disabled={editBusy || cropMode || curvesMode || toneMode || textMode || paintMode} title="Flip vertical" aria-label="Flip vertical">
                  <FlipVertical size={15} />
                </button>
                <button type="button" onClick={() => applyEdit({ type: "rotateClockwise" })} disabled={editBusy || cropMode || curvesMode || toneMode || textMode || paintMode} title="Rotate 90 degrees clockwise" aria-label="Rotate 90 degrees clockwise">
                  <RotateCw size={15} />
                </button>
                <button type="button" className={textMode ? "active" : ""} onClick={() => {
                  setCropMode(false);
                  setCurvesMode(false);
                  setToneMode(false);
                  setPaintMode(false);
                  setTextMode((value) => !value);
                }} disabled={editBusy} title="Text overlay" aria-label="Text overlay">
                  <Type size={15} />
                </button>
                <button type="button" className={paintMode ? "active" : ""} onClick={() => {
                  setCropMode(false);
                  setCurvesMode(false);
                  setToneMode(false);
                  setTextMode(false);
                  setPaintMode((value) => !value);
                }} disabled={editBusy} title="Inpaint with brush" aria-label="Inpaint with brush">
                  <Paintbrush size={15} />
                </button>
                <button type="button" className={toneMode ? "active" : ""} onClick={() => {
                  setCropMode(false);
                  setCurvesMode(false);
                  setTextMode(false);
                  setPaintMode(false);
                  setToneMode((value) => !value);
                }} disabled={editBusy} title="Adjust brightness, contrast, saturation, and curves" aria-label="Adjust brightness, contrast, saturation, and curves">
                  <Sun size={15} />
                </button>
                {cropMode && (
                  <>
                    <button type="button" className="crop-apply" onClick={() => applyEdit({ type: "crop", cropRect: clampCropRect(cropRect) })} disabled={editBusy} title="Apply crop" aria-label="Apply crop">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => {
                      setCropMode(false);
                      setCropRect(defaultCropRect);
                    }} disabled={editBusy} title="Cancel crop" aria-label="Cancel crop">
                      <X size={15} />
                    </button>
                  </>
                )}
                {textMode && (
                  <>
                    <button type="button" className="crop-apply" onClick={() => applyEdit({ type: "text", overlay: normalizedTextOverlay(textOverlay) })} disabled={editBusy || !normalizedTextOverlay(textOverlay).text.trim()} title="Apply text overlay" aria-label="Apply text overlay">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => {
                      setTextMode(false);
                      resetTextOverlay();
                    }} disabled={editBusy} title="Cancel text overlay" aria-label="Cancel text overlay">
                      <X size={15} />
                    </button>
                  </>
                )}
                {paintMode && (
                  <>
                    <button type="button" className="crop-apply" onClick={applyPaintEdit} disabled={editBusy || !paintHasMask || !paintPrompt.trim()} title="Apply inpaint edit" aria-label="Apply inpaint edit">
                      {inpaintBusy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
                    </button>
                    <button type="button" onClick={() => {
                      setPaintMode(false);
                      setPaintPrompt(defaultPaintPrompt);
                      setPaintBrushSize(defaultPaintBrushSize);
                      clearPaintMask();
                    }} disabled={editBusy} title="Cancel inpaint edit" aria-label="Cancel inpaint edit">
                      <X size={15} />
                    </button>
                  </>
                )}
                {toneMode && (
                  <>
                    <button type="button" className="crop-apply" onClick={() => applyEdit({
                      type: "tone",
                      adjustments: normalizedToneAdjustments(toneAdjustments),
                      points: normalizedCurvePoints(curvePoints)
                    })} disabled={editBusy} title="Apply adjustments" aria-label="Apply adjustments">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => {
                      setToneMode(false);
                      resetToneAdjustments();
                      resetCurves();
                    }} disabled={editBusy} title="Cancel adjustments" aria-label="Cancel adjustments">
                      <X size={15} />
                    </button>
                  </>
                )}
              </div>
            )}
            <button type="button" onClick={onClose} title="Close preview" aria-label="Close preview">
              <X size={15} />
            </button>
          </div>
        </header>
        {canEditImage && toneMode && (
          <div className="output-adjust-panel">
            <div className="output-curves-panel">
              <div className="output-curves-topline">
                <span>Channel: RGB</span>
                <button type="button" onClick={resetCurves} disabled={editBusy}>Reset</button>
              </div>
              <svg
                ref={curveGraphRef}
                className="output-curves-graph"
                viewBox="-3 -3 106 106"
                preserveAspectRatio="none"
                onPointerDown={addCurvePoint}
                onPointerMove={handleCurvePointMove}
                onPointerUp={stopCurvePointDrag}
                onPointerCancel={stopCurvePointDrag}
                role="img"
                aria-label="RGB curve editor"
              >
                <defs>
                  <linearGradient id="newtnodeCurvesGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="rgba(255,255,255,0.22)" />
                    <stop offset="1" stopColor="rgba(255,255,255,0.02)" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100" height="100" />
                {[25, 50, 75].map((position) => (
                  <React.Fragment key={position}>
                    <line x1={position} y1="0" x2={position} y2="100" />
                    <line x1="0" y1={position} x2="100" y2={position} />
                  </React.Fragment>
                ))}
                <path className="curves-reference-line" d="M 0 100 L 100 0" />
                <path className="curves-active-line" d={curvePathForPoints(curvePoints)} />
                {visibleCurveControlPoints(curvePoints).map(({ point, index }) => (
                  <circle
                    key={`curve-point-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r="2.3"
                    onPointerDown={(event) => startCurvePointDrag(event, index)}
                    onDoubleClick={(event) => removeCurvePoint(event, index)}
                  />
                ))}
              </svg>
            </div>
            <div className="output-tone-panel">
              {["brightness", "contrast", "saturation"].map((key) => {
                const labelText = key.charAt(0).toUpperCase() + key.slice(1);
                const value = toneAdjustments[key] ?? 0;
                return (
                  <div className="output-tone-slider" key={key}>
                    <button type="button" onClick={() => resetToneAdjustment(key)} disabled={editBusy || value === 0}>Reset</button>
                    <span>{labelText}</span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={value}
                      onPointerDown={startToneSliderChange}
                      onPointerUp={finishToneSliderChange}
                      onPointerCancel={finishToneSliderChange}
                      onKeyDown={startToneSliderChange}
                      onKeyUp={finishToneSliderChange}
                      onChange={(event) => updateToneAdjustment(key, event.target.value)}
                      disabled={editBusy}
                    />
                    <output>{value > 0 ? `+${value}` : value}</output>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {canEditImage && textMode && (
          <div className="output-text-panel">
            <label className="output-text-copy">
              <span>Text</span>
              <textarea
                value={textOverlay.text}
                placeholder="Type overlay text"
                rows={2}
                maxLength={220}
                onFocus={startTextOverlayChange}
                onBlur={finishTextOverlayChange}
                onChange={(event) => updateTextOverlay({ text: event.target.value })}
                disabled={editBusy}
              />
            </label>
            <label className="output-text-control">
              <span>Font</span>
              <select
                value={textOverlay.font}
                onFocus={startTextOverlayChange}
                onBlur={finishTextOverlayChange}
                onChange={(event) => updateTextOverlay({ font: event.target.value })}
                disabled={editBusy}
              >
                {textOverlayFonts.map((font) => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </label>
            <label className="output-text-control compact">
              <span>Color</span>
              <input
                type="color"
                value={textOverlay.color}
                onFocus={startTextOverlayChange}
                onBlur={finishTextOverlayChange}
                onChange={(event) => updateTextOverlay({ color: event.target.value })}
                disabled={editBusy}
              />
            </label>
            <label className="output-text-slider">
              <span>Scale</span>
              <input
                type="range"
                min="2"
                max="24"
                step="0.5"
                value={textOverlay.size}
                onPointerDown={startTextOverlayChange}
                onPointerUp={finishTextOverlayChange}
                onPointerCancel={finishTextOverlayChange}
                onKeyDown={startTextOverlayChange}
                onKeyUp={finishTextOverlayChange}
                onChange={(event) => updateTextOverlay({ size: event.target.value })}
                disabled={editBusy}
              />
              <output>{Math.round(textOverlay.size)}</output>
            </label>
            <button type="button" onClick={resetTextOverlay} disabled={editBusy}>Reset</button>
          </div>
        )}
        {canEditImage && paintMode && (
          <div className="output-paint-panel">
            <label className="output-paint-prompt">
              <span>Edit prompt</span>
              <textarea
                value={paintPrompt}
                placeholder="Remove car, add dog, change shirt color..."
                rows={2}
                maxLength={260}
                onChange={(event) => setPaintPrompt(event.target.value)}
                disabled={editBusy}
              />
            </label>
            <label className="output-paint-slider">
              <span>Brush</span>
              <input
                type="range"
                min="8"
                max="120"
                step="1"
                value={paintBrushSize}
                onChange={(event) => setPaintBrushSize(Number(event.target.value) || defaultPaintBrushSize)}
                disabled={editBusy}
              />
              <output>{Math.round(paintBrushSize)}</output>
            </label>
            <button type="button" onClick={clearPaintMask} disabled={editBusy || !paintHasMask}>Clear mask</button>
            <small>{paintHasMask ? "Masked area ready" : "Paint the area to revise"}</small>
          </div>
        )}
        <div className="output-lightbox-stage">
          {displayItem.type === "image" && (
            <div className={`output-lightbox-image-editor ${cropMode ? "cropping" : ""} ${textMode ? "texting" : ""} ${paintMode ? "painting" : ""}`} ref={imageEditorRef}>
              <img src={toneMode && tonePreviewUrl ? tonePreviewUrl : displayItem.url} alt={label} onError={useNewtNodeImageFallback} />
              {textMode && normalizedTextOverlay(textOverlay).text.trim() && (
                <div
                  className="output-text-overlay"
                  style={{
                    left: `${textOverlay.x}%`,
                    top: `${textOverlay.y}%`,
                    color: textOverlay.color,
                    fontFamily: `"${textOverlay.font}", Arial, sans-serif`,
                    fontSize: `clamp(13px, ${textOverlay.size * 0.36}vw, 190px)`
                  }}
                  onPointerDown={startTextDrag}
                  onPointerMove={handleTextDrag}
                  onPointerUp={stopTextDrag}
                  onPointerCancel={stopTextDrag}
                >
                  {textOverlay.text}
                </div>
              )}
              {paintMode && (
                <canvas
                  ref={paintCanvasRef}
                  className="output-paint-mask"
                  onPointerDown={startPaintStroke}
                  onPointerMove={handlePaintStroke}
                  onPointerUp={stopPaintStroke}
                  onPointerCancel={stopPaintStroke}
                  aria-label="Paint inpaint mask"
                />
              )}
              {inpaintBusy && (
                <div className="output-inpaint-busy" role="status" aria-live="polite">
                  <Loader2 size={18} className="spin" />
                  <span>Generating edit</span>
                </div>
              )}
              {cropMode && (
                <div
                  className="output-crop-box"
                  style={{
                    left: `${cropRect.x}%`,
                    top: `${cropRect.y}%`,
                    width: `${cropRect.width}%`,
                    height: `${cropRect.height}%`
                  }}
                  onPointerDown={(event) => startCropDrag(event, "move")}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={stopCropDrag}
                  onPointerCancel={stopCropDrag}
                >
                  <span
                    className="output-crop-handle"
                    onPointerDown={(event) => startCropDrag(event, "resize")}
                    aria-hidden="true"
                  />
                </div>
              )}
            </div>
          )}
          {displayItem.type === "video" && <video src={displayItem.url} controls loop playsInline onError={useNewtNodeVideoFallback} />}
          {displayItem.type === "model3d" && <Model3DViewer url={displayItem.url} label={label} />}
          {displayItem.type === "audio" && (
            <div className="output-lightbox-audio">
              <FileAudio size={34} />
              <audio src={displayItem.url} controls />
            </div>
          )}
          {editError && <small className="output-lightbox-error">{editError}</small>}
        </div>
      </section>
    </div>
  );
}

export function ResultPane({ label, resultUrl, resultItems = [], selectedIndex = 0, type, status, error, onSelectResult, onPreviewOpen, editContext }) {
  const items = normalizedResultItems(resultItems, resultUrl, type);
  const activeIndex = Math.min(Math.max(Number(selectedIndex) || 0, 0), Math.max(items.length - 1, 0));
  const activeItem = items[activeIndex];

  function selectOffset(offset) {
    if (!items.length) return;
    const nextIndex = (activeIndex + offset + items.length) % items.length;
    onSelectResult?.(nextIndex, items[nextIndex]);
  }

  function downloadActiveItem() {
    if (!activeItem?.url) return;
    const link = document.createElement("a");
    link.href = activeItem.url;
    link.download = resultDownloadFileName(activeItem);
    link.click();
  }

  function startResultDrag(event) {
    if (!activeItem?.url || !activeItem?.type) return;
    const dragItem = {
      id: activeItem.id || `result:${activeItem.url}`,
      url: activeItem.url,
      type: activeItem.type,
      label: activeItem.label || activeItem.fileName || `Generated ${activeItem.type}`,
      fileName: activeItem.fileName || resultDownloadFileName(activeItem),
      mimeType: activeItem.mimeType || ""
    };
    setOutputItemDragData(event.dataTransfer, dragItem, defaultOutputDragMime);
  }

  return (
    <div className={`result-pane ${items.length ? "has-result" : ""} ${items.length > 1 ? "multi-result" : ""}`}>
      {activeItem && (
        <div className="result-carousel" onPointerDown={(event) => event.stopPropagation()}>
          <div
            className="result-item"
            draggable
            onDragStart={startResultDrag}
            onDragEnd={(event) => finishOutputItemDragData(activeItem, event)}
            onDoubleClick={(event) => {
              if (activeItem.type !== "image") return;
              event.preventDefault();
              event.stopPropagation();
              onPreviewOpen?.({
                ...activeItem,
                fileName: activeItem.fileName || resultDownloadFileName(activeItem),
                mimeType: activeItem.mimeType || "",
                editContext: editContext ? { ...editContext, itemIndex: activeIndex } : undefined
              });
            }}
            title={activeItem.type === "image" ? `Drag result to canvas or double-click to ${editContext ? "edit" : "preview"}` : "Drag result to canvas"}
          >
            {activeItem.type === "image" && (
              <StableResultImage
                item={activeItem}
                src={previewImageUrl(activeItem)}
                alt={activeItem.label || `Generated image ${activeIndex + 1}`}
              />
            )}
            {activeItem.type === "video" && <video src={activeItem.url} controls loop playsInline preload="metadata" draggable={false} onError={useNewtNodeVideoFallback} />}
            {activeItem.type === "model3d" && <Model3DViewer url={activeItem.url} label={activeItem.label || `3D model ${activeIndex + 1}`} />}
          </div>
          <button type="button" className="result-download-button" onClick={downloadActiveItem} title={`Download ${activeItem.type === "model3d" ? "3D model" : "result"}`} aria-label="Download result">
            <Download size={14} />
          </button>
          {items.length > 1 && (
            <div className="result-cycle-controls" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => selectOffset(-1)} title="Previous generation">
                <ChevronLeft size={15} />
              </button>
              <span>{activeIndex + 1}/{items.length}</span>
              <button type="button" onClick={() => selectOffset(1)} title="Next generation">
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}
      {!items.length && <span>{status === "running" ? "Running..." : label}</span>}
      {error && <small>{error}</small>}
    </div>
  );
}

function StableResultImage({ item, src, alt }) {
  const [displaySrc, setDisplaySrc] = React.useState(src);

  React.useEffect(() => {
    if (!src || src === displaySrc) return undefined;
    if (typeof window === "undefined" || typeof window.Image !== "function") {
      setDisplaySrc(src);
      return undefined;
    }

    let cancelled = false;
    const nextImage = new window.Image();
    const reveal = () => {
      if (!cancelled) setDisplaySrc(src);
    };
    nextImage.onload = reveal;
    nextImage.onerror = reveal;
    nextImage.src = src;
    if (nextImage.complete) reveal();

    return () => {
      cancelled = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src, displaySrc]);

  return (
    <img
      {...fullResolutionImageProps(item)}
      src={displaySrc || src}
      alt={alt}
      draggable={false}
      loading="eager"
      decoding="async"
      onError={useNewtNodeImageFallback}
    />
  );
}

export function useNewtNodeImageFallback(event) {
  const image = event.currentTarget;
  if (image.src.endsWith("/newtnode-logo.png")) return;
  image.classList.add("newtnode-logo-fallback");
  image.src = "/newtnode-logo.png";
}

export function useNewtNodeVideoFallback(event) {
  const video = event.currentTarget;
  if (!video.getAttribute("src") && video.poster.endsWith("/newtnode-logo.png")) return;
  video.classList.add("newtnode-logo-fallback", "newtnode-video-fallback");
  video.poster = "/newtnode-logo.png";
  video.removeAttribute("src");
  video.load();
}

export function Model3DViewer({ url, label }) {
  return (
    <React.Suspense fallback={<Model3DViewerFallback label={label} />}>
      <LazyModel3DViewer url={url} label={label} />
    </React.Suspense>
  );
}

function Model3DViewerFallback({ label }) {
  return (
    <div className="model-3d-viewer loading" aria-label={label || "3D model viewer"} onPointerDown={(event) => event.stopPropagation()}>
      <div className="model-3d-canvas-host" />
      <span>Loading 3D...</span>
    </div>
  );
}

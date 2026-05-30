import React from "react";
import { X } from "lucide-react";
import { loadCanvasImage } from "../canvasMedia.js";
import {
  averageColorFromImageData,
  colorIdMatteBlur,
  colorIdMatteExpand,
  colorIdMatteImageData,
  colorIdMatteSampleRadius,
  colorIdMatteTolerance,
  drawColorIdMattePickerCanvas,
  drawColorIdMatteVideoCanvas,
  normalizeColorIdMatteColor,
  normalizeColorIdMatteItems,
  renderColorIdMattePickerPreview,
  rgbToHex
} from "../colorIdMatte.js";
import { clamp } from "../nodeGeometry.js";

export function ColorIdMattePicker({ imageUrl, node, onUpdate, rowComponent: Row }) {
  const canvasRef = React.useRef(null);
  const largeCanvasRef = React.useRef(null);
  const sourceImageDataRef = React.useRef(null);
  const matteImageDataRef = React.useRef(null);
  const [pickerStatus, setPickerStatus] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerView, setPickerView] = React.useState("rgb");
  const selectedColor = normalizeColorIdMatteColor(node.data.colorIdMatteColor);
  const tolerance = colorIdMatteTolerance(node.data.colorIdMatteTolerance);
  const sampleRadius = colorIdMatteSampleRadius(node.data.colorIdMatteSampleRadius);
  const invert = Boolean(node.data.colorIdMatteInvert);
  const selectedHex = selectedColor ? rgbToHex(selectedColor) : "None";

  React.useEffect(() => {
    let cancelled = false;

    async function drawPicker() {
      const canvas = canvasRef.current;
      if (!canvas || !imageUrl) {
        sourceImageDataRef.current = null;
        matteImageDataRef.current = null;
        return;
      }

      try {
        const image = await loadCanvasImage(imageUrl);
        if (cancelled) return;

        const sourceImageData = drawColorIdMattePickerCanvas(canvas, image);
        const width = sourceImageData.width;
        const height = sourceImageData.height;
        sourceImageDataRef.current = sourceImageData;
        const matteImageData = selectedColor ? colorIdMatteImageData(sourceImageData, selectedColor, tolerance, invert).imageData : null;
        matteImageDataRef.current = matteImageData;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        renderColorIdMattePickerPreview(context, sourceImageData, selectedColor, tolerance, invert, "overlay");

        const largeCanvas = largeCanvasRef.current;
        if (largeCanvas) {
          largeCanvas.width = width;
          largeCanvas.height = height;
          const largeContext = largeCanvas.getContext("2d", { willReadFrequently: true });
          if (pickerView === "matte" && matteImageData) {
            largeContext.putImageData(matteImageData, 0, 0);
          } else {
            renderColorIdMattePickerPreview(largeContext, sourceImageData, selectedColor, tolerance, invert, "rgb");
          }
        }
        setPickerStatus("");
      } catch (error) {
        sourceImageDataRef.current = null;
        matteImageDataRef.current = null;
        setPickerStatus(error.message || "Could not load image.");
      }
    }

    drawPicker();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, selectedColor?.r, selectedColor?.g, selectedColor?.b, tolerance, invert, pickerOpen, pickerView]);

  function pickColor(event, canvas = canvasRef.current) {
    const imageData = sourceImageDataRef.current;
    if (!canvas || !imageData) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.min(imageData.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * (imageData.width / rect.width))));
    const y = Math.min(imageData.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * (imageData.height / rect.height))));
    const color = averageColorFromImageData(imageData, x, y, sampleRadius);
    if (!color) return;

    onUpdate(node.id, {
      colorIdMatteColor: color,
      error: ""
    });
  }

  return (
    <>
      <Row label="Picker">
        <div className="color-id-picker-shell">
          <div className={`color-id-picker ${imageUrl ? "" : "empty"}`} onPointerDown={(event) => event.stopPropagation()}>
            {imageUrl ? <canvas ref={canvasRef} onClick={(event) => pickColor(event)} title="Pick color" /> : <span>No image</span>}
          </div>
          <button type="button" className="color-id-enlarge-button" onClick={() => setPickerOpen(true)} disabled={!imageUrl}>
            Enlarge
          </button>
        </div>
      </Row>
      <Row label="Selected">
        <div className="color-id-selected">
          <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
          <span>{selectedHex}</span>
        </div>
      </Row>
      <Row label="Tolerance">
        <div className="color-id-slider">
          <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
          <span>{tolerance}</span>
        </div>
      </Row>
      <Row label="Sample">
        <select value={String(sampleRadius)} onChange={(event) => onUpdate(node.id, { colorIdMatteSampleRadius: event.target.value })}>
          <option value="0">1 px</option>
          <option value="1">3 px</option>
          <option value="2">5 px</option>
          <option value="3">7 px</option>
        </select>
      </Row>
      <Row label="Invert">
        <button className={`node-toggle ${invert ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { colorIdMatteInvert: !invert })}>
          <span />
        </button>
      </Row>
      {pickerStatus && <small className="upload-error color-id-status">{pickerStatus}</small>}
      {pickerOpen && (
        <div className="color-id-picker-modal" role="dialog" aria-modal="true" aria-label="Color ID matte picker" onPointerDown={(event) => event.stopPropagation()}>
          <div className="color-id-picker-modal-panel">
            <div className="color-id-picker-modal-header">
              <div className="color-id-selected">
                <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
                <span>{selectedHex}</span>
              </div>
              <div className="color-id-view-toggle" role="group" aria-label="Picker view">
                <button type="button" className={pickerView === "rgb" ? "active" : ""} aria-pressed={pickerView === "rgb"} onClick={() => setPickerView("rgb")}>
                  RGB
                </button>
                <button type="button" className={pickerView === "matte" ? "active" : ""} aria-pressed={pickerView === "matte"} onClick={() => setPickerView("matte")} disabled={!selectedColor}>
                  Matte
                </button>
              </div>
              <button type="button" className="color-id-picker-close" onClick={() => setPickerOpen(false)} title="Close picker">
                <X size={17} />
              </button>
            </div>
            <div className="color-id-picker-large">
              <canvas ref={largeCanvasRef} onClick={(event) => pickColor(event, largeCanvasRef.current)} title="Pick color" />
            </div>
            <div className="color-id-modal-controls">
              <span>Tolerance</span>
              <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
              <strong>{tolerance}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ColorIdMatteVideoPicker({
  videoUrl,
  node,
  onUpdate,
  rowComponent: Row,
  formatFrameTimeDisplay,
  normalizeChoice,
  outputOptions
}) {
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const largeCanvasRef = React.useRef(null);
  const sourceImageDataRef = React.useRef(null);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [pickerStatus, setPickerStatus] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickerView = normalizeChoice(node.data.colorIdMattePreviewMode, ["overlay", "rgb", "matte"], "overlay");
  const selectedColor = normalizeColorIdMatteColor(node.data.colorIdMatteColor);
  const tolerance = colorIdMatteTolerance(node.data.colorIdMatteTolerance);
  const sampleRadius = colorIdMatteSampleRadius(node.data.colorIdMatteSampleRadius);
  const invert = Boolean(node.data.colorIdMatteInvert);
  const matteItems = normalizeColorIdMatteItems(node.data.colorIdMatteItems);
  const matteName = String(node.data.colorIdMatteName || "");
  const blur = colorIdMatteBlur(node.data.colorIdMatteBlur);
  const expand = colorIdMatteExpand(node.data.colorIdMatteExpand);
  const startTime = node.data.colorIdMatteStartTime ?? "";
  const endTime = node.data.colorIdMatteEndTime ?? "";
  const outputFormat = normalizeChoice(node.data.colorIdMatteOutputFormat, outputOptions.map(([value]) => value), "mp4");
  const selectedHex = selectedColor ? rgbToHex(selectedColor) : "None";
  const sliderMax = duration ? Math.max(0, duration - 0.01) : Math.max(1, currentTime);

  const drawVideoFrame = React.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !videoUrl || !video?.videoWidth || !video?.videoHeight) {
      sourceImageDataRef.current = null;
      return;
    }

    try {
      const sourceImageData = drawColorIdMatteVideoCanvas(canvas, video);
      sourceImageDataRef.current = sourceImageData;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      renderColorIdMattePickerPreview(context, sourceImageData, selectedColor, tolerance, invert, pickerView);

      const largeCanvas = largeCanvasRef.current;
      if (largeCanvas) {
        largeCanvas.width = sourceImageData.width;
        largeCanvas.height = sourceImageData.height;
        const largeContext = largeCanvas.getContext("2d", { willReadFrequently: true });
        renderColorIdMattePickerPreview(largeContext, sourceImageData, selectedColor, tolerance, invert, pickerView);
      }

      setPickerStatus("");
    } catch (error) {
      sourceImageDataRef.current = null;
      setPickerStatus(error.message || "Could not read video frame.");
    }
  }, [videoUrl, selectedColor?.r, selectedColor?.g, selectedColor?.b, tolerance, invert, pickerView]);

  React.useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setPickerOpen(false);
    sourceImageDataRef.current = null;
  }, [videoUrl]);

  React.useEffect(() => {
    drawVideoFrame();
  }, [drawVideoFrame, pickerOpen]);

  React.useEffect(() => {
    if (!pickerOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pickerOpen]);

  function handleLoadedMetadata(event) {
    const video = event.currentTarget;
    const nextDuration = Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;
    setDuration(nextDuration);
    const nextTime = nextDuration ? Math.min(currentTime, Math.max(0, nextDuration - 0.01)) : currentTime;
    if (Math.abs(video.currentTime - nextTime) > 0.05) {
      try {
        video.currentTime = nextTime;
      } catch {
        // Some browsers reject seeks before metadata is ready.
      }
    } else {
      drawVideoFrame();
    }
  }

  function handleSeeked(event) {
    setCurrentTime(event.currentTarget.currentTime || 0);
    drawVideoFrame();
  }

  function seekVideo(value) {
    const time = duration ? clamp(Number(value) || 0, 0, Math.max(0, duration - 0.01)) : Math.max(0, Number(value) || 0);
    setCurrentTime(time);
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = time;
    } catch {
      drawVideoFrame();
    }
  }

  function pickColor(event, canvas = canvasRef.current) {
    const imageData = sourceImageDataRef.current;
    if (!canvas || !imageData) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.min(imageData.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * (imageData.width / rect.width))));
    const y = Math.min(imageData.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * (imageData.height / rect.height))));
    const color = averageColorFromImageData(imageData, x, y, sampleRadius);
    if (!color) return;

    onUpdate(node.id, {
      colorIdMatteColor: color,
      error: ""
    });
  }

  function setTolerancePreset(value) {
    const nextTolerance = value === "exact" ? 0 : value === "soft" ? 24 : 64;
    onUpdate(node.id, { colorIdMatteTolerance: nextTolerance });
  }

  function addCurrentMatte() {
    if (!selectedColor) return;
    const name = matteName.trim() || selectedHex;
    onUpdate(node.id, {
      colorIdMatteItems: [
        ...matteItems,
        {
          id: `matte-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          color: selectedColor
        }
      ],
      colorIdMatteName: "",
      error: ""
    });
  }

  function updateMatteName(id, name) {
    onUpdate(node.id, {
      colorIdMatteItems: matteItems.map((item) => (item.id === id ? { ...item, name } : item))
    });
  }

  function removeMatte(id) {
    onUpdate(node.id, {
      colorIdMatteItems: matteItems.filter((item) => item.id !== id)
    });
  }

  return (
    <>
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          preload="metadata"
          muted
          playsInline
          className="color-id-video-source"
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={handleSeeked}
          onLoadedData={drawVideoFrame}
        />
      )}
      <Row label="Picker">
        <div className="color-id-picker-shell">
          <div className={`color-id-picker ${videoUrl ? "" : "empty"}`} onPointerDown={(event) => event.stopPropagation()}>
            {videoUrl ? <canvas ref={canvasRef} onClick={(event) => pickColor(event)} title="Pick color from current frame" /> : <span>No video</span>}
          </div>
          <button type="button" className="color-id-enlarge-button" onClick={() => setPickerOpen(true)} disabled={!videoUrl}>
            Enlarge
          </button>
        </div>
      </Row>
      <Row label="Frame">
        <div className="color-id-slider">
          <input type="range" min="0" max={sliderMax || 1} step="0.033" value={Math.min(currentTime, sliderMax || 1)} onChange={(event) => seekVideo(event.target.value)} disabled={!videoUrl} />
          <span>{formatFrameTimeDisplay(currentTime)}</span>
        </div>
      </Row>
      <Row label="Selected">
        <div className="color-id-selected">
          <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
          <span>{selectedHex}</span>
        </div>
      </Row>
      <Row label="Name">
        <input value={matteName} onChange={(event) => onUpdate(node.id, { colorIdMatteName: event.target.value })} placeholder="Matte name" />
      </Row>
      <Row label="Batch">
        <button type="button" onClick={addCurrentMatte} disabled={!selectedColor}>
          Add Matte
        </button>
      </Row>
      {matteItems.length > 0 && (
        <div className="color-id-matte-list">
          {matteItems.map((item, index) => (
            <div className="color-id-matte-item" key={item.id}>
              <span className="color-id-swatch" style={{ backgroundColor: rgbToHex(item.color) }} />
              <input value={item.name} onChange={(event) => updateMatteName(item.id, event.target.value)} aria-label={`Matte ${index + 1} name`} />
              <button type="button" onClick={() => removeMatte(item.id)} title="Remove matte" aria-label="Remove matte">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Row label="View">
        <select value={pickerView} onChange={(event) => onUpdate(node.id, { colorIdMattePreviewMode: event.target.value })}>
          <option value="overlay">Overlay</option>
          <option value="rgb">RGB</option>
          <option value="matte">Matte</option>
        </select>
      </Row>
      <Row label="Preset">
        <div className="color-id-preset-row">
          <button type="button" onClick={() => setTolerancePreset("exact")}>Exact</button>
          <button type="button" onClick={() => setTolerancePreset("soft")}>Soft</button>
          <button type="button" onClick={() => setTolerancePreset("broad")}>Broad</button>
        </div>
      </Row>
      <Row label="Tolerance">
        <div className="color-id-slider">
          <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
          <span>{tolerance}</span>
        </div>
      </Row>
      <Row label="Sample">
        <select value={String(sampleRadius)} onChange={(event) => onUpdate(node.id, { colorIdMatteSampleRadius: event.target.value })}>
          <option value="0">1 px</option>
          <option value="1">3 px</option>
          <option value="2">5 px</option>
          <option value="3">7 px</option>
        </select>
      </Row>
      <Row label="Invert">
        <button className={`node-toggle ${invert ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { colorIdMatteInvert: !invert })}>
          <span />
        </button>
      </Row>
      <Row label="Blur">
        <div className="color-id-slider">
          <input type="range" min="0" max="24" step="0.5" value={blur} onChange={(event) => onUpdate(node.id, { colorIdMatteBlur: event.target.value })} />
          <span>{blur}</span>
        </div>
      </Row>
      <Row label="Expand">
        <div className="color-id-slider">
          <input type="range" min="-12" max="12" step="1" value={expand} onChange={(event) => onUpdate(node.id, { colorIdMatteExpand: event.target.value })} />
          <span>{expand}</span>
        </div>
      </Row>
      <Row label="Range">
        <div className="inline-two-fields">
          <input value={startTime} onChange={(event) => onUpdate(node.id, { colorIdMatteStartTime: event.target.value })} placeholder="Start" />
          <input value={endTime} onChange={(event) => onUpdate(node.id, { colorIdMatteEndTime: event.target.value })} placeholder="End" />
        </div>
      </Row>
      <Row label="Format">
        <select value={outputFormat} onChange={(event) => onUpdate(node.id, { colorIdMatteOutputFormat: event.target.value })}>
          {outputOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Row>
      {pickerStatus && <small className="upload-error color-id-status">{pickerStatus}</small>}
      {pickerOpen && (
        <div className="color-id-picker-modal" role="dialog" aria-modal="true" aria-label="Color ID video matte picker" onPointerDown={(event) => event.stopPropagation()}>
          <div className="color-id-picker-modal-panel">
            <div className="color-id-picker-modal-header">
              <div className="color-id-selected">
                <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
                <span>{selectedHex}</span>
              </div>
              <div className="color-id-view-toggle" role="group" aria-label="Picker view">
                <button type="button" className={pickerView === "overlay" ? "active" : ""} aria-pressed={pickerView === "overlay"} onClick={() => onUpdate(node.id, { colorIdMattePreviewMode: "overlay" })}>
                  Overlay
                </button>
                <button type="button" className={pickerView === "rgb" ? "active" : ""} aria-pressed={pickerView === "rgb"} onClick={() => onUpdate(node.id, { colorIdMattePreviewMode: "rgb" })}>
                  RGB
                </button>
                <button type="button" className={pickerView === "matte" ? "active" : ""} aria-pressed={pickerView === "matte"} onClick={() => onUpdate(node.id, { colorIdMattePreviewMode: "matte" })} disabled={!selectedColor}>
                  Matte
                </button>
              </div>
              <button type="button" className="color-id-picker-close" onClick={() => setPickerOpen(false)} title="Close picker">
                <X size={17} />
              </button>
            </div>
            <div className="color-id-picker-large">
              <canvas ref={largeCanvasRef} onClick={(event) => pickColor(event, largeCanvasRef.current)} title="Pick color from current frame" />
            </div>
            <div className="color-id-modal-controls">
              <span>Frame</span>
              <input type="range" min="0" max={sliderMax || 1} step="0.033" value={Math.min(currentTime, sliderMax || 1)} onChange={(event) => seekVideo(event.target.value)} />
              <strong>{formatFrameTimeDisplay(currentTime)}</strong>
            </div>
            <div className="color-id-modal-controls">
              <span>Tolerance</span>
              <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
              <strong>{tolerance}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

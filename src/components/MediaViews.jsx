import React from "react";
import { Box, ChevronLeft, ChevronRight, Download, FileAudio, FileImage, Film, ImagePlus, PanelRightClose, Plus, RefreshCw, Video, X } from "lucide-react";
import { capitalizeMediaType, outputDragMime as defaultOutputDragMime } from "../mediaAssets.js";
import { normalizedResultItems, resultDownloadFileName } from "../mediaResults.js";

const LazyModel3DViewer = React.lazy(() => import("./Model3DViewer.jsx").then((module) => ({ default: module.Model3DViewer })));

export function MediaPreview({ node }) {
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
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(defaultOutputDragMime, JSON.stringify(dragItem));
    event.dataTransfer.setData("text/plain", dragItem.url);
    event.dataTransfer.setData("text/uri-list", dragItem.url);
  }

  if (node.type === "image") {
    return (
      <div className="media-preview" draggable onDragStart={startPreviewDrag} title="Drag image into another node">
        <img src={node.data.resultUrl} alt={node.data.fileName || "Uploaded image"} draggable={false} onError={useNewtNodeImageFallback} />
      </div>
    );
  }

  if (node.type === "video") {
    return (
      <div className="media-preview" draggable onDragStart={startPreviewDrag} title="Drag video into another node">
        <video src={node.data.resultUrl} controls muted loop draggable={false} onError={useNewtNodeVideoFallback} />
      </div>
    );
  }

  return (
    <div className="media-preview audio" draggable onDragStart={startPreviewDrag} title="Drag audio into another node">
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
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(outputDragMime, JSON.stringify(item));
    event.dataTransfer.setData("text/plain", item.url);
    event.dataTransfer.setData("text/uri-list", item.url);
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

const ProjectOutputThumb = React.memo(function ProjectOutputThumb({ item, onDragStart, onPreviewOpen }) {
  const thumbRef = React.useRef(null);
  const mediaSrc = useLazyRailMediaSrc(thumbRef, item.url);
  const KindIcon = item.type === "video" ? Film : item.type === "audio" ? FileAudio : item.type === "model3d" ? Box : FileImage;

  return (
    <div
      ref={thumbRef}
      className={`project-output-thumb ${item.type}`}
      draggable
      onDragStart={(event) => onDragStart(event, item)}
      onDoubleClick={() => onPreviewOpen?.(item)}
      title={`${item.label || item.fileName || "Output"}\nDrag to canvas or double-click to preview`}
    >
      {item.type === "image" && mediaSrc && <img src={mediaSrc} alt={item.label || item.fileName || "Generated output"} draggable={false} loading="lazy" decoding="async" onError={useNewtNodeImageFallback} />}
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

export function OutputPreviewLightbox({ item, onClose }) {
  React.useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const KindIcon = item.type === "video" ? Film : item.type === "audio" ? FileAudio : item.type === "model3d" ? Box : FileImage;
  const label = item.label || item.fileName || `${capitalizeMediaType(item.type)} preview`;

  return (
    <div className="output-lightbox-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`output-lightbox ${item.type}`} role="dialog" aria-modal="true" aria-label={label} onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <span>
            <KindIcon size={15} />
            {label}
          </span>
          <button type="button" onClick={onClose} title="Close preview" aria-label="Close preview">
            <X size={15} />
          </button>
        </header>
        <div className="output-lightbox-stage">
          {item.type === "image" && <img src={item.url} alt={label} onError={useNewtNodeImageFallback} />}
          {item.type === "video" && <video src={item.url} controls loop playsInline onError={useNewtNodeVideoFallback} />}
          {item.type === "model3d" && <Model3DViewer url={item.url} label={label} />}
          {item.type === "audio" && (
            <div className="output-lightbox-audio">
              <FileAudio size={34} />
              <audio src={item.url} controls />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function ResultPane({ label, resultUrl, resultItems = [], selectedIndex = 0, type, status, error, onSelectResult }) {
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

  return (
    <div className={`result-pane ${items.length ? "has-result" : ""} ${items.length > 1 ? "multi-result" : ""}`}>
      {activeItem && (
        <div className="result-carousel" onPointerDown={(event) => event.stopPropagation()}>
          <div className="result-item" key={activeItem.url}>
            {activeItem.type === "image" && <img src={activeItem.url} alt={activeItem.label || `Generated image ${activeIndex + 1}`} onError={useNewtNodeImageFallback} />}
            {activeItem.type === "video" && <video src={activeItem.url} controls loop onError={useNewtNodeVideoFallback} />}
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

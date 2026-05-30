import React from "react";
import { Box, ChevronLeft, ChevronRight, Download, FileAudio, FileImage, Film, ImagePlus, PanelRightClose, Plus, RefreshCw, Video, X } from "lucide-react";
import { normalizedResultItems, resultDownloadFileName } from "../mediaResults.js";
import { GLTFLoader, THREE, useThreeRuntimeReady } from "../threeRuntime.js";

export function MediaPreview({ node }) {
  if (!node.data.resultUrl) {
    return (
      <div className="media-preview empty">
        <UploadIcon type={node.type} />
        <span>No upload yet</span>
      </div>
    );
  }

  if (node.type === "image") {
    return (
      <div className="media-preview">
        <img src={node.data.resultUrl} alt={node.data.fileName || "Uploaded image"} onError={useNewtNodeImageFallback} />
      </div>
    );
  }

  if (node.type === "video") {
    return (
      <div className="media-preview">
        <video src={node.data.resultUrl} controls muted loop onError={useNewtNodeVideoFallback} />
      </div>
    );
  }

  return (
    <div className="media-preview audio">
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

export function ProjectOutputDrawer({ items, onClose, onRefresh, onPreviewOpen, outputDragMime = "application/x-newtnode-output" }) {
  function startDrag(event, item) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(outputDragMime, JSON.stringify(item));
    event.dataTransfer.setData("text/plain", item.url);
    event.dataTransfer.setData("text/uri-list", item.url);
  }

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
          items.map((item) => {
            const KindIcon = item.type === "video" ? Film : item.type === "audio" ? FileAudio : item.type === "model3d" ? Box : FileImage;
            return (
              <div
                key={item.id}
                className={`project-output-thumb ${item.type}`}
                draggable
                onDragStart={(event) => startDrag(event, item)}
                onDoubleClick={() => onPreviewOpen?.(item)}
                title={`${item.label || item.fileName || "Output"}\nDrag to canvas or double-click to preview`}
              >
                {item.type === "image" && <img src={item.url} alt={item.label || item.fileName || "Generated output"} draggable={false} onError={useNewtNodeImageFallback} />}
                {item.type === "video" && <video src={item.url} muted playsInline preload="metadata" draggable={false} onError={useNewtNodeVideoFallback} />}
                {(item.type === "model3d" || item.type === "audio") && (
                  <div className="project-output-placeholder">
                    <KindIcon size={22} />
                  </div>
                )}
                <span className="project-output-kind">
                  <KindIcon size={12} />
                </span>
              </div>
            );
          })
        ) : (
          <div className="project-output-empty">
            <ImagePlus size={22} />
          </div>
        )}
      </div>
    </aside>
  );
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

function Model3DViewer({ url, label }) {
  const threeReady = useThreeRuntimeReady();
  const hostRef = React.useRef(null);
  const [state, setState] = React.useState(url ? "loading" : "empty");

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) {
      setState("empty");
      return undefined;
    }
    if (!threeReady) {
      setState("loading");
      return undefined;
    }

    let disposed = false;
    let animationFrame = 0;
    let modelRoot = null;
    let isDragging = false;
    let lastPointer = { x: 0, y: 0 };
    let yaw = -0.35;
    let pitch = 0.2;
    let distance = 4;

    setState("loading");
    host.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.className = "model-3d-canvas";
    host.appendChild(renderer.domElement);

    const rig = new THREE.Group();
    scene.add(rig);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(2.5, 4, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8fb7ff, 0.8);
    fillLight.position.set(-4, 2, -2);
    scene.add(fillLight);
    const grid = new THREE.GridHelper(4, 16, 0x3a3a3a, 0x242424);
    grid.position.y = -1.1;
    scene.add(grid);

    function resize() {
      if (disposed) return;
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function updateCamera() {
      const clampedPitch = Math.max(-1.25, Math.min(1.25, pitch));
      pitch = clampedPitch;
      const x = Math.sin(yaw) * Math.cos(pitch) * distance;
      const y = Math.sin(pitch) * distance + 0.25;
      const z = Math.cos(yaw) * Math.cos(pitch) * distance;
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
    }

    function animate() {
      if (disposed) return;
      updateCamera();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    function handlePointerDown(event) {
      event.preventDefault();
      event.stopPropagation();
      isDragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event) {
      if (!isDragging) return;
      event.preventDefault();
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      yaw -= dx * 0.008;
      pitch += dy * 0.008;
      lastPointer = { x: event.clientX, y: event.clientY };
    }

    function handlePointerUp(event) {
      isDragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    }

    function handleWheel(event) {
      event.preventDefault();
      event.stopPropagation();
      distance = Math.max(1.2, Math.min(14, distance + event.deltaY * 0.006));
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    new GLTFLoader().load(
      url,
      (gltf) => {
        if (disposed) return;
        modelRoot = gltf.scene || gltf.scenes?.[0] || null;
        if (!modelRoot) {
          setState("error");
          return;
        }

        const box = new THREE.Box3().setFromObject(modelRoot);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const largestSide = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.25 / largestSide;
        modelRoot.scale.setScalar(scale);
        modelRoot.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        rig.add(modelRoot);
        distance = Math.max(2.4, Math.min(7, 3.1 + largestSide * 0.2));
        resize();
        setState("ready");
      },
      undefined,
      () => {
        if (!disposed) setState("error");
      }
    );

    resize();
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      if (modelRoot) disposeThreeObject(modelRoot);
      renderer.dispose();
      host.innerHTML = "";
    };
  }, [url, threeReady]);

  return (
    <div className={`model-3d-viewer ${state}`} aria-label={label || "3D model viewer"} onPointerDown={(event) => event.stopPropagation()}>
      <div ref={hostRef} className="model-3d-canvas-host" />
      {state === "loading" && <span>Loading 3D...</span>}
      {state === "error" && <span>Could not load 3D model</span>}
      {state === "empty" && <span>No 3D model</span>}
    </div>
  );
}

function disposeThreeObject(root) {
  root.traverse((child) => {
    if (child.geometry?.dispose) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture && value.dispose) value.dispose();
      });
      material.dispose?.();
    });
  });
}

function capitalizeMediaType(type) {
  if (type === "model3d") return "3D";
  const value = String(type || "media");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

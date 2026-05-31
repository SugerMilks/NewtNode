import React from "react";
import { clamp } from "../nodeGeometry.js";
import { degreesToRadians, THREE, useThreeRuntimeReady } from "../threeRuntime.js";

export const ComposerViewport = React.forwardRef(function ComposerViewport(
  {
    sceneData,
    selectedId,
    aspectRatio,
    showGuides,
    onCameraChange,
    renderViewport,
    aspectRatioValue,
    aspectRatioNumber
  },
  ref
) {
  const threeReady = useThreeRuntimeReady();
  const mountRef = React.useRef(null);
  const rendererRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const cameraRef = React.useRef(null);
  const stateRef = React.useRef({ sceneData, selectedId, aspectRatio, showGuides });
  const onCameraChangeRef = React.useRef(onCameraChange);
  const dragRef = React.useRef(null);
  const keysRef = React.useRef(new Set());
  const moveFrameRef = React.useRef(0);

  React.useEffect(() => {
    stateRef.current = { sceneData, selectedId, aspectRatio, showGuides };
    onCameraChangeRef.current = onCameraChange;
    if (!threeReady) return;
    renderViewport(rendererRef.current, sceneRef.current, cameraRef.current, sceneData, selectedId);
  }, [sceneData, selectedId, aspectRatio, showGuides, onCameraChange, renderViewport, threeReady]);

  React.useImperativeHandle(
    ref,
    () => ({
      capture() {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera || !threeReady) return "";
        return renderViewport(renderer, scene, camera, stateRef.current.sceneData, "", {
          showGrid: false,
          showSelection: false,
          awaitTextures: true,
          awaitAssets: true
        }).then(() => {
          const imageDataUrl = renderer.domElement.toDataURL("image/png");
          renderViewport(renderer, scene, camera, stateRef.current.sceneData, stateRef.current.selectedId);
          return imageDataUrl;
        });
      }
    }),
    [renderViewport, threeReady]
  );

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !threeReady) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "composer-canvas";
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const resizeObserver = new ResizeObserver(() => {
      const rect = mount.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
      camera.updateProjectionMatrix();
      renderViewport(renderer, scene, camera, stateRef.current.sceneData, stateRef.current.selectedId);
    });
    resizeObserver.observe(mount);

    function startDrag(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      renderer.domElement.focus();
      renderer.domElement.setPointerCapture(event.pointerId);
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        camera: { ...stateRef.current.sceneData.camera }
      };
    }

    function moveDrag(event) {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      onCameraChangeRef.current({
        yaw: clamp(dragRef.current.camera.yaw - dx * 0.25, -360, 360),
        pitch: clamp(dragRef.current.camera.pitch - dy * 0.18, -82, 82)
      });
    }

    function stopDrag(event) {
      dragRef.current = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    }

    function handleWheel(event) {
      event.preventDefault();
      onCameraChangeRef.current({
        fov: clamp(stateRef.current.sceneData.camera.fov + event.deltaY * 0.02, 18, 80)
      });
    }

    function startMoveLoop() {
      if (moveFrameRef.current) return;
      const step = () => {
        moveFrameRef.current = window.requestAnimationFrame(step);
        if (!keysRef.current.size) return;

        const cameraData = stateRef.current.sceneData.camera;
        const speed = keysRef.current.has("shift") ? 0.16 : 0.07;
        const yaw = degreesToRadians(cameraData.yaw);
        const pitch = degreesToRadians(cameraData.pitch);
        const forward = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const delta = new THREE.Vector3();

        if (keysRef.current.has("w")) delta.add(forward);
        if (keysRef.current.has("s")) delta.sub(forward);
        if (keysRef.current.has("d")) delta.add(right);
        if (keysRef.current.has("a")) delta.sub(right);
        if (keysRef.current.has("e")) delta.y += 1;
        if (keysRef.current.has("q")) delta.y -= 1;
        if (!delta.lengthSq()) return;
        delta.normalize().multiplyScalar(speed);

        const nextCamera = {
          x: cameraData.x + delta.x,
          y: clamp(cameraData.y + delta.y, 0.25, 8),
          z: cameraData.z + delta.z
        };
        stateRef.current = {
          ...stateRef.current,
          sceneData: {
            ...stateRef.current.sceneData,
            camera: {
              ...cameraData,
              ...nextCamera
            }
          }
        };
        onCameraChangeRef.current(nextCamera);
      };
      moveFrameRef.current = window.requestAnimationFrame(step);
    }

    function handleKeyDown(event) {
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d", "q", "e", "shift"].includes(key)) return;
      event.preventDefault();
      keysRef.current.add(key);
      startMoveLoop();
    }

    function handleKeyUp(event) {
      keysRef.current.delete(event.key.toLowerCase());
    }

    function clearKeys() {
      keysRef.current.clear();
    }

    renderer.domElement.addEventListener("pointerdown", startDrag);
    renderer.domElement.addEventListener("pointermove", moveDrag);
    renderer.domElement.addEventListener("pointerup", stopDrag);
    renderer.domElement.addEventListener("pointercancel", stopDrag);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderer.domElement.addEventListener("keydown", handleKeyDown);
    renderer.domElement.addEventListener("keyup", handleKeyUp);
    renderer.domElement.addEventListener("blur", clearKeys);

    renderViewport(renderer, scene, camera, stateRef.current.sceneData, stateRef.current.selectedId);

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", startDrag);
      renderer.domElement.removeEventListener("pointermove", moveDrag);
      renderer.domElement.removeEventListener("pointerup", stopDrag);
      renderer.domElement.removeEventListener("pointercancel", stopDrag);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.domElement.removeEventListener("keydown", handleKeyDown);
      renderer.domElement.removeEventListener("keyup", handleKeyUp);
      renderer.domElement.removeEventListener("blur", clearKeys);
      window.cancelAnimationFrame(moveFrameRef.current);
      disposeComposerScene(scene);
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [renderViewport, threeReady]);

  return (
    <div className="composer-viewport-shell" style={{ aspectRatio: aspectRatioValue(aspectRatio), "--composer-aspect": aspectRatioNumber(aspectRatio) }} ref={mountRef}>
      {showGuides && <div className="composer-guides" aria-hidden="true" />}
    </div>
  );
});

function disposeComposerScene(scene) {
  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose?.();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    }
  });
}

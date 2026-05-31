import React from "react";
import { clamp, positiveModulo } from "../nodeGeometry.js";
import { degreesToRadians, lerp, THREE, useThreeRuntimeReady } from "../threeRuntime.js";

export function CameraControlViewport({ imageUrl, horizontalAngle, verticalAngle, zoom, onChange }) {
  const threeReady = useThreeRuntimeReady();
  const mountRef = React.useRef(null);
  const planeMaterialRef = React.useRef(null);
  const cameraMarkerRef = React.useRef(null);
  const previewStateRef = React.useRef({ horizontalAngle, verticalAngle, zoom });
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    previewStateRef.current = { horizontalAngle, verticalAngle, zoom };
    onChangeRef.current = onChange;
  }, [horizontalAngle, verticalAngle, zoom, onChange]);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !threeReady) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161616);

    const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    previewCamera.position.set(2.8, 2.1, 3.1);
    previewCamera.lookAt(0, 0.35, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "camera-viewport-canvas";
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const grid = new THREE.GridHelper(4.2, 16, 0x2c2c2c, 0x252525);
    grid.position.y = -0.72;
    scene.add(grid);

    const planeGeometry = new THREE.PlaneGeometry(1.25, 1.25);
    const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x77807a, side: THREE.DoubleSide });
    planeMaterialRef.current = planeMaterial;
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.y = 0.1;
    scene.add(plane);

    const horizontalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0x20f3a6 })
    );
    horizontalRing.rotation.x = Math.PI / 2;
    horizontalRing.position.y = -0.66;
    scene.add(horizontalRing);

    const elevationRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.016, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0xff69cc })
    );
    elevationRing.rotation.y = Math.PI / 2;
    elevationRing.position.x = -0.28;
    elevationRing.position.y = 0.06;
    scene.add(elevationRing);

    const cameraMarker = new THREE.Group();
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf9d624 }));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: 0x34516b }));
    body.position.z = 0.2;
    cameraMarker.add(lens, body);
    scene.add(cameraMarker);
    cameraMarkerRef.current = cameraMarker;

    let frameId = 0;
    let dragging = false;
    let lastPointer = { x: 0, y: 0 };

    function resize() {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(260, rect.width);
      const height = Math.max(220, rect.height);
      renderer.setSize(width, height, false);
      previewCamera.aspect = width / height;
      previewCamera.updateProjectionMatrix();
    }

    function updateCameraMarker() {
      const state = previewStateRef.current;
      const azimuth = degreesToRadians(state.horizontalAngle);
      const elevation = degreesToRadians(state.verticalAngle);
      const distance = lerp(2.25, 1.05, clamp(state.zoom, 0, 10) / 10);
      const groundRadius = distance * Math.cos(elevation);

      cameraMarker.position.set(Math.sin(azimuth) * groundRadius, -0.24 + Math.sin(elevation) * 1.35, Math.cos(azimuth) * groundRadius);
      cameraMarker.lookAt(0, 0.1, 0);
    }

    function render() {
      updateCameraMarker();
      renderer.render(scene, previewCamera);
      frameId = window.requestAnimationFrame(render);
    }

    function handlePointerDown(event) {
      dragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event) {
      if (!dragging) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      const state = previewStateRef.current;
      onChangeRef.current?.({
        horizontalAngle: positiveModulo(state.horizontalAngle + dx * 0.7, 360),
        verticalAngle: clamp(state.verticalAngle - dy * 0.45, -30, 90)
      });
    }

    function handlePointerUp(event) {
      dragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    }

    function handleWheel(event) {
      event.preventDefault();
      const state = previewStateRef.current;
      onChangeRef.current?.({ zoom: clamp(state.zoom - event.deltaY * 0.012, 0, 10) });
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      planeMaterial.map?.dispose();
      planeGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [threeReady]);

  React.useEffect(() => {
    const material = planeMaterialRef.current;
    if (!material || !threeReady) return undefined;

    let cancelled = false;
    const previousMap = material.map;

    if (!imageUrl) {
      material.map = null;
      material.color.set(0x77807a);
      material.needsUpdate = true;
      previousMap?.dispose();
      return undefined;
    }

    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }

      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
      previousMap?.dispose();
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, threeReady]);

  return (
    <div className="camera-viewport-shell" onPointerDown={(event) => event.stopPropagation()}>
      <div ref={mountRef} className="camera-viewport" />
      <div className="camera-viewport-legend">
        <span className="azimuth-dot">Azimuth</span>
        <span className="elevation-dot">Elevation</span>
        <span className="zoom-dot">Zoom</span>
      </div>
      {!imageUrl && <span className="camera-viewport-empty">Connect an image</span>}
    </div>
  );
}

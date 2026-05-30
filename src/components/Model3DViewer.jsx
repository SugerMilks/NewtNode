import React from "react";
import { GLTFLoader, THREE, useThreeRuntimeReady } from "../threeRuntime.js";

export function Model3DViewer({ url, label }) {
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

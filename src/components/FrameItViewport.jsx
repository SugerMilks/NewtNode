import React from "react";
import { clamp } from "../nodeGeometry.js";
import {
  frameItAspectRatioNumber,
  frameItCameraPointerGesture,
  frameItCaptureSize,
  frameItDirectDragJoint,
  frameItJointDragRotation,
  frameItJointPatch,
  frameItJointRenderRotation,
  frameItJointRotation,
  frameItJointRotationFromGizmo,
  frameItUsesCameraWheel,
  normalizeFrameItScene
} from "../frameItState.js";
import {
  cloneSkeleton,
  degreesToRadians,
  GLTFLoader,
  radiansToDegrees,
  THREE,
  TransformControls,
  useThreeRuntimeReady
} from "../threeRuntime.js";

const frameItMannequinModelPath = "/models/frame-it-mannequin.glb";
const frameItMannequinTargetHeight = 2.58;

let frameItMannequinAsset = null;
let frameItMannequinAssetPromise = null;
let frameItMannequinAssetFailed = false;

export const FrameItViewport = React.forwardRef(function FrameItViewport(
  {
    sceneData,
    aspectRatio,
    selectedFigureId,
    selectedJoint,
    showGrid,
    showFloor,
    showGuides,
    showShotLabel,
    shotLabel,
    useLimits,
    onSceneChange,
    onSelectionChange,
    onInteractionStart,
    onCanvasPanStart
  },
  ref
) {
  const threeReady = useThreeRuntimeReady();
  const mountRef = React.useRef(null);
  const rendererRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const cameraRef = React.useRef(null);
  const figureObjectsRef = React.useRef(new Map());
  const jointObjectsRef = React.useRef(new Map());
  const transformControlsRef = React.useRef(null);
  const transformProxyRef = React.useRef(null);
  const transformSessionRef = React.useRef(null);
  const cameraDragRef = React.useRef(null);
  const jointDragRef = React.useRef(null);
  const wheelSessionRef = React.useRef({ camera: null, timer: null });
  const stateRef = React.useRef({
    sceneData: normalizeFrameItScene(sceneData),
    aspectRatio,
    selectedFigureId,
    selectedJoint,
    showGrid,
    showFloor,
    showGuides,
    showShotLabel,
    shotLabel,
    useLimits
  });
  const onSceneChangeRef = React.useRef(onSceneChange);
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  const onInteractionStartRef = React.useRef(onInteractionStart);
  const onCanvasPanStartRef = React.useRef(onCanvasPanStart);

  React.useEffect(() => {
    const previousState = stateRef.current;
    const nextState = {
      sceneData: normalizeFrameItScene(sceneData),
      aspectRatio,
      selectedFigureId,
      selectedJoint,
      showGrid,
      showFloor,
      showGuides,
      showShotLabel,
      shotLabel,
      useLimits
    };
    stateRef.current = nextState;
    onSceneChangeRef.current = onSceneChange;
    onSelectionChangeRef.current = onSelectionChange;
    onInteractionStartRef.current = onInteractionStart;
    onCanvasPanStartRef.current = onCanvasPanStart;
    if (threeReady) {
      const figuresChanged = JSON.stringify(previousState.sceneData.figures) !== JSON.stringify(nextState.sceneData.figures);
      const sceneDecorationChanged = previousState.showGrid !== nextState.showGrid || previousState.showFloor !== nextState.showFloor;
      const selectionChanged = previousState.selectedFigureId !== nextState.selectedFigureId || previousState.selectedJoint !== nextState.selectedJoint;
      if (figuresChanged || sceneDecorationChanged || selectionChanged) renderFrameItViewport();
      else {
        syncTransformGizmo();
        renderFrameItCamera();
      }
    }
  }, [sceneData, aspectRatio, selectedFigureId, selectedJoint, showGrid, showFloor, showGuides, showShotLabel, shotLabel, useLimits, onSceneChange, onSelectionChange, onInteractionStart, onCanvasPanStart, threeReady]);

  React.useImperativeHandle(ref, () => ({
    capture() {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera || !threeReady) return "";
      const currentSize = renderer.getSize(new THREE.Vector2());
      const currentAspect = camera.aspect;
      const { width, height } = frameItCaptureSize(stateRef.current.aspectRatio);
      const transformHelper = transformControlsRef.current?.getHelper?.();
      const transformWasVisible = transformHelper?.visible;
      if (transformHelper) transformHelper.visible = false;
      const overlayVisibility = [];
      scene.traverse((object) => {
        if (!object.userData.frameItOverlayControl) return;
        overlayVisibility.push([object, object.visible]);
        object.visible = false;
      });
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const imageDataUrl = renderer.domElement.toDataURL("image/png");
      renderer.setSize(currentSize.x, currentSize.y, false);
      camera.aspect = currentAspect;
      camera.updateProjectionMatrix();
      if (transformHelper) transformHelper.visible = transformWasVisible;
      overlayVisibility.forEach(([object, visible]) => { object.visible = visible; });
      renderer.render(scene, camera);
      return imageDataUrl;
    }
  }), [threeReady]);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !threeReady) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, frameItAspectRatioNumber(aspectRatio), 0.05, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = "frame-it-canvas";
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const transformProxy = new THREE.Object3D();
    transformProxy.name = "frame-it-transform-proxy";
    transformProxy.userData.frameItTransformProxy = true;
    scene.add(transformProxy);

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setColors(0xff4f5e, 0x68d56f, 0x4a8cff, 0xf4d62d);
    transformControls.setSize(0.72);
    transformControls.rotationSnap = degreesToRadians(1);
    transformControls.translationSnap = 0.01;
    disableFrameItFreeRotateHandle(transformControls);
    transformControlsRef.current = transformControls;
    transformProxyRef.current = transformProxy;
    const transformHelper = transformControls.getHelper();
    transformHelper.name = "frame-it-transform-helper";
    transformHelper.userData.frameItTransformHelper = true;
    transformHelper.traverse((object) => {
      object.userData.frameItTransformHelper = true;
      object.renderOrder = 30;
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((material) => {
        material.depthTest = false;
        material.depthWrite = false;
      });
    });
    scene.add(transformHelper);

    const resizeObserver = new ResizeObserver(() => {
      const rect = mount.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = frameItAspectRatioNumber(stateRef.current.aspectRatio);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    });
    resizeObserver.observe(mount);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pointerSelection(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const directHandleHit = hits.find((hit) => (
        !hit.object.userData.frameItTransformHelper
        && hit.object.userData.frameItDirectHandle
      ));
      if (directHandleHit) return directHandleHit;
      for (const hit of hits) {
        if (hit.object.userData.frameItTransformHelper) continue;
        if (hit.object.userData.frameItSelectable) return hit;
        if (hit.object.isSkinnedMesh && hit.object.userData.frameItFigureId) {
          const jointId = frameItJointFromSkinHit(hit);
          if (jointId) {
            return {
              ...hit,
              object: {
                userData: {
                  frameItSelectable: true,
                  figureId: hit.object.userData.frameItFigureId,
                  jointId
                }
              }
            };
          }
        }
      }
      return null;
    }

    function handleTransformMouseDown() {
      const currentState = stateRef.current;
      const figure = currentState.sceneData.figures.find((item) => item.id === currentState.selectedFigureId);
      if (!figure) return;
      const jointObject = frameItJointObject(jointObjectsRef.current.get(`${figure.id}:${currentState.selectedJoint}`));
      if (!jointObject) return;
      const transformObject = transformControls.object || transformProxy;
      onInteractionStartRef.current?.();
      transformSessionRef.current = {
        mode: "jointRotate",
        figure: { ...figure },
        figureId: figure.id,
        jointId: currentState.selectedJoint,
        startingRotation: frameItJointRotation(figure, currentState.selectedJoint),
        startTransformQuaternion: transformObject.quaternion.clone(),
        pendingScene: null
      };
    }

    function handleTransformObjectChange() {
      const session = transformSessionRef.current;
      if (!session) return;
      const transformObject = transformControls.object || transformProxy;
      const deltaQuaternion = session.startTransformQuaternion.clone().invert().multiply(transformObject.quaternion);
      const deltaEuler = new THREE.Euler().setFromQuaternion(deltaQuaternion, "XYZ");
      const nextFigure = {
        ...session.figure,
        ...frameItJointRotationFromGizmo(session.jointId, session.startingRotation, {
          x: radiansToDegrees(deltaEuler.x),
          y: radiansToDegrees(deltaEuler.y),
          z: radiansToDegrees(deltaEuler.z)
        }, stateRef.current.useLimits)
      };
      const nextScene = {
        ...stateRef.current.sceneData,
        figures: stateRef.current.sceneData.figures.map((item) => item.id === session.figureId ? nextFigure : item)
      };
      session.pendingScene = nextScene;
      applyTransientFigure(nextFigure, session.jointId);
    }

    function handleTransformMouseUp() {
      const session = transformSessionRef.current;
      transformSessionRef.current = null;
      if (session?.pendingScene) onSceneChangeRef.current?.(session.pendingScene);
    }

    function handleTransformChange() {
      renderer.render(scene, camera);
    }

    function handleCameraPointerDown(event) {
      if (event.button !== 0) return;
      const cameraGesture = frameItCameraPointerGesture(event);
      if (!cameraGesture) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      renderer.domElement.focus();
      renderer.domElement.setPointerCapture?.(event.pointerId);
      onInteractionStartRef.current?.();
      cameraDragRef.current = {
        type: cameraGesture,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        camera: { ...stateRef.current.sceneData.camera },
        pendingCamera: null
      };
    }

    function handlePointerDown(event) {
      if (event.button !== 0) return;
      if (transformControls.axis || transformControls.dragging) return;

      const hit = pointerSelection(event);
      if (!hit) {
        onCanvasPanStartRef.current?.(event);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      renderer.domElement.focus();
      const figureId = hit.object.userData.figureId;
      const jointId = hit.object.userData.jointId;
      const figure = stateRef.current.sceneData.figures.find((item) => item.id === figureId);
      if (!figure || !jointId) return;
      const drivenJointId = hit.object.userData.frameItDirectHandle ? frameItDirectDragJoint(jointId) : jointId;
      onSelectionChangeRef.current?.({ figureId, jointId: drivenJointId });
      if (hit.object.userData.frameItDirectHandle) {
        onInteractionStartRef.current?.();
        renderer.domElement.setPointerCapture?.(event.pointerId);
        jointDragRef.current = {
          pointerId: event.pointerId,
          figure: { ...figure },
          figureId,
          jointId: drivenJointId,
          startX: event.clientX,
          startY: event.clientY,
          startingRotation: frameItJointRotation(figure, drivenJointId),
          pendingScene: null
        };
        const helper = transformControls.getHelper?.();
        if (helper) helper.visible = false;
      }
    }

    function handlePointerMove(event) {
      const cameraDrag = cameraDragRef.current;
      if (cameraDrag?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const dx = event.clientX - cameraDrag.startX;
        const dy = event.clientY - cameraDrag.startY;
        const nextCamera = cameraDrag.type === "orbit"
          ? {
              ...cameraDrag.camera,
              yaw: cameraDrag.camera.yaw - dx * 0.35,
              pitch: clamp(cameraDrag.camera.pitch + dy * 0.28, -82, 82)
            }
          : frameItPannedCamera(cameraDrag.camera, dx, dy);
        cameraDrag.pendingCamera = nextCamera;
        applyTransientCamera(nextCamera);
        return;
      }

      const jointDrag = jointDragRef.current;
      if (jointDrag?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const dx = event.clientX - jointDrag.startX;
        const dy = event.clientY - jointDrag.startY;
        const nextRotation = frameItJointDragRotation(jointDrag.jointId, jointDrag.startingRotation, dx, dy);
        const nextFigure = {
          ...jointDrag.figure,
          ...frameItJointPatch(jointDrag.jointId, nextRotation, stateRef.current.useLimits)
        };
        const nextScene = {
          ...stateRef.current.sceneData,
          figures: stateRef.current.sceneData.figures.map((item) => item.id === jointDrag.figureId ? nextFigure : item)
        };
        jointDrag.pendingScene = nextScene;
        applyTransientFigure(nextFigure, jointDrag.jointId);
        return;
      }
      if (transformControls.dragging && event.button !== -1) {
        const rect = renderer.domElement.getBoundingClientRect();
        transformControls.pointerMove({
          x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
          y: -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
          button: -1
        });
      }
    }

    function handlePointerUp(event) {
      const cameraDrag = cameraDragRef.current;
      if (cameraDrag?.pointerId === event.pointerId) {
        cameraDragRef.current = null;
        if (cameraDrag.pendingCamera) {
          onSceneChangeRef.current?.({ ...stateRef.current.sceneData, camera: cameraDrag.pendingCamera });
        }
      }
      const jointDrag = jointDragRef.current;
      if (jointDrag?.pointerId === event.pointerId) {
        jointDragRef.current = null;
        if (jointDrag.pendingScene) onSceneChangeRef.current?.(jointDrag.pendingScene);
      }
      if (renderer.domElement.hasPointerCapture?.(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    }

    function handleWheel(event) {
      if (!frameItUsesCameraWheel(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const session = wheelSessionRef.current;
      if (!session.camera) {
        onInteractionStartRef.current?.();
        session.camera = { ...stateRef.current.sceneData.camera };
      }
      const nextCamera = {
        ...session.camera,
        distance: clamp(session.camera.distance + event.deltaY * 0.005, 1.5, 14)
      };
      session.camera = nextCamera;
      applyTransientCamera(nextCamera);
      if (session.timer) window.clearTimeout(session.timer);
      session.timer = window.setTimeout(() => {
        const committedCamera = wheelSessionRef.current.camera;
        wheelSessionRef.current = { camera: null, timer: null };
        if (committedCamera) onSceneChangeRef.current?.({ ...stateRef.current.sceneData, camera: committedCamera });
      }, 140);
    }

    function applyTransientCamera(cameraData) {
      positionFrameItCamera(camera, cameraData);
      renderer.render(scene, camera);
    }

    function applyTransientFigure(figure, jointId) {
      const figureObject = figureObjectsRef.current.get(figure.id);
      if (!figureObject) return;
      figureObject.position.set(figure.x, figure.y, figure.z);
      figureObject.rotation.set(
        degreesToRadians(figure.rotX),
        degreesToRadians(figure.rotY),
        degreesToRadians(figure.rotZ),
        "XYZ"
      );
      figureObject.scale.setScalar(figure.scale);
      const jointObject = jointObjectsRef.current.get(`${figure.id}:${jointId}`);
      if (jointObject) {
        const rotation = frameItJointRenderRotation(jointId, frameItJointRotation(figure, jointId));
        if (typeof jointObject.apply === "function") jointObject.apply(rotation);
        else jointObject.rotation.set(degreesToRadians(rotation.x), degreesToRadians(rotation.y), degreesToRadians(rotation.z));
      }
      renderer.render(scene, camera);
    }

    transformControls.addEventListener("mouseDown", handleTransformMouseDown);
    transformControls.addEventListener("objectChange", handleTransformObjectChange);
    transformControls.addEventListener("mouseUp", handleTransformMouseUp);
    transformControls.addEventListener("change", handleTransformChange);
    renderer.domElement.addEventListener("pointerdown", handleCameraPointerDown, true);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove, true);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderFrameItViewport();

    return () => {
      resizeObserver.disconnect();
      transformControls.removeEventListener("mouseDown", handleTransformMouseDown);
      transformControls.removeEventListener("objectChange", handleTransformObjectChange);
      transformControls.removeEventListener("mouseUp", handleTransformMouseUp);
      transformControls.removeEventListener("change", handleTransformChange);
      transformControls.detach();
      transformControls.dispose();
      renderer.domElement.removeEventListener("pointerdown", handleCameraPointerDown, true);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove, true);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      transformSessionRef.current = null;
      cameraDragRef.current = null;
      jointDragRef.current = null;
      if (wheelSessionRef.current.timer) window.clearTimeout(wheelSessionRef.current.timer);
      wheelSessionRef.current = { camera: null, timer: null };
      scene.remove(transformHelper);
      scene.remove(transformProxy);
      disposeFrameItScene(scene);
      transformControlsRef.current = null;
      transformProxyRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [threeReady]);

  function renderFrameItViewport() {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera || !THREE) return;
    const data = normalizeFrameItScene(stateRef.current.sceneData);
    const transformControls = transformControlsRef.current;
    const transformProxy = transformProxyRef.current;
    const transformHelper = transformControls?.getHelper?.();
    if (transformHelper?.parent === scene) scene.remove(transformHelper);
    if (transformProxy?.parent === scene) scene.remove(transformProxy);
    disposeFrameItScene(scene);
    scene.clear();
    figureObjectsRef.current.clear();
    jointObjectsRef.current.clear();
    scene.background = new THREE.Color(0x111318);
    scene.fog = new THREE.Fog(0x111318, 11, 22);

    scene.add(new THREE.HemisphereLight(0xf1f5ff, 0x25231f, 2.15));
    const keyLight = new THREE.DirectionalLight(0xfff9ef, 3.25);
    keyLight.position.set(3.8, 6.5, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.radius = 5;
    keyLight.shadow.bias = -0.00025;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9ebeff, 0.72);
    fillLight.position.set(-3, 2.4, 4);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x7eb9ff, 1.05);
    rimLight.position.set(-4, 3.5, -3);
    scene.add(rimLight);

    if (stateRef.current.showFloor) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 24),
        new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.9, metalness: 0.01 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
    }
    if (stateRef.current.showFloor && stateRef.current.showGrid) {
      const grid = new THREE.GridHelper(24, 48, 0x4a4f59, 0x292d34);
      grid.position.y = 0.006;
      scene.add(grid);
    }

    data.figures.forEach((figure) => {
      const object = createFrameItFigure(figure, jointObjectsRef.current, {
        figureId: stateRef.current.selectedFigureId,
        jointId: stateRef.current.selectedJoint
      });
      figureObjectsRef.current.set(figure.id, object);
      scene.add(object);
    });
    if (transformProxy) scene.add(transformProxy);
    if (transformHelper) scene.add(transformHelper);
    if (!frameItMannequinAsset && !frameItMannequinAssetFailed) {
      loadFrameItMannequinAsset().then((asset) => {
        if (asset && rendererRef.current === renderer) renderFrameItViewport();
      });
    }
    positionFrameItCamera(camera, data.camera);
    camera.aspect = frameItAspectRatioNumber(stateRef.current.aspectRatio);
    camera.fov = data.camera.fov;
    camera.updateProjectionMatrix();
    syncTransformGizmo();
    renderer.render(scene, camera);
  }

  function renderFrameItCamera() {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera || !THREE) return;
    const data = normalizeFrameItScene(stateRef.current.sceneData);
    positionFrameItCamera(camera, data.camera);
    camera.aspect = frameItAspectRatioNumber(stateRef.current.aspectRatio);
    camera.fov = data.camera.fov;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function syncTransformGizmo() {
    const controls = transformControlsRef.current;
    const proxy = transformProxyRef.current;
    const scene = sceneRef.current;
    if (!controls || !proxy || !scene || !THREE || controls.dragging) return;
    const state = stateRef.current;
    const figure = state.sceneData.figures.find((item) => item.id === state.selectedFigureId);
    const helper = controls.getHelper();
    if (jointDragRef.current) {
      controls.detach();
      helper.visible = false;
      return;
    }
    if (!figure) {
      controls.detach();
      helper.visible = false;
      return;
    }

    helper.visible = false;
    controls.detach();
    controls.setMode("rotate");
    controls.setSpace("local");
    controls.showXY = false;
    controls.showYZ = false;
    controls.showXZ = false;
    const jointObject = frameItJointObject(jointObjectsRef.current.get(`${figure.id}:${state.selectedJoint}`));
    if (!jointObject) {
      controls.detach();
      helper.visible = false;
      return;
    }
    jointObject.updateWorldMatrix(true, false);
    jointObject.getWorldPosition(proxy.position);
    jointObject.getWorldQuaternion(proxy.quaternion);
    proxy.scale.set(1, 1, 1);
    proxy.updateMatrixWorld(true);
    controls.attach(proxy);
    helper.visible = true;
  }

  const ratio = frameItAspectRatioNumber(aspectRatio);
  const portraitWidth = ratio < 0.85 ? `${Math.round(ratio * 82)}%` : ratio < 1.15 ? "78%" : "100%";
  return (
    <div className="frame-it-stage">
      <div
        ref={mountRef}
        className="frame-it-viewport"
        style={{ aspectRatio: String(ratio), width: portraitWidth }}
      />
      {showGuides && <div className="frame-it-guides" style={{ aspectRatio: String(ratio), width: portraitWidth }} aria-hidden="true" />}
      {showShotLabel && <div className="frame-it-shot-label">{shotLabel || "Frame It"}</div>}
      <div className="frame-it-camera-hint">Drag a joint to pose. Option-drag: orbit. Command-drag: pan. Command-scroll: zoom.</div>
    </div>
  );
});

function frameItJointObject(value) {
  return value?.primaryBone || value || null;
}

function positionFrameItCamera(camera, data) {
  const yaw = degreesToRadians(data.yaw);
  const pitch = degreesToRadians(data.pitch);
  const horizontalDistance = Math.cos(pitch) * data.distance;
  camera.position.set(
    data.targetX + Math.sin(yaw) * horizontalDistance,
    data.targetY + Math.sin(pitch) * data.distance,
    data.targetZ + Math.cos(yaw) * horizontalDistance
  );
  camera.lookAt(data.targetX, data.targetY, data.targetZ);
}

function frameItPannedCamera(camera, dx, dy) {
  const scale = Math.max(0.001, camera.distance * 0.0018);
  const yaw = degreesToRadians(camera.yaw);
  return {
    ...camera,
    targetX: camera.targetX - Math.cos(yaw) * dx * scale,
    targetZ: camera.targetZ + Math.sin(yaw) * dx * scale,
    targetY: camera.targetY + dy * scale
  };
}

function loadFrameItMannequinAsset() {
  if (frameItMannequinAsset) return Promise.resolve(frameItMannequinAsset);
  if (frameItMannequinAssetFailed || !GLTFLoader) return Promise.resolve(null);
  if (!frameItMannequinAssetPromise) {
    const loader = new GLTFLoader();
    frameItMannequinAssetPromise = loader.loadAsync(frameItMannequinModelPath)
      .then((gltf) => {
        const scene = gltf.scene || gltf.scenes?.[0];
        if (!scene) throw new Error("Frame It mannequin has no scene.");
        scene.updateMatrixWorld(true);
        frameItMannequinAsset = { scene };
        return frameItMannequinAsset;
      })
      .catch((error) => {
        frameItMannequinAssetFailed = true;
        console.warn("Frame It mannequin model failed to load.", error);
        return null;
      });
  }
  return frameItMannequinAssetPromise;
}

function createFrameItFigure(figure, jointMap, selection) {
  if (frameItMannequinAsset?.scene && cloneSkeleton) {
    return createFrameItModelFigure(figure, jointMap, frameItMannequinAsset, selection);
  }
  return createFrameItProceduralFigure(figure, jointMap);
}

function disableFrameItFreeRotateHandle(controls) {
  const rotateGizmo = controls?._gizmo;
  rotateGizmo?.gizmo?.rotate?.children?.forEach((handle) => {
    if (handle.name === "E" && handle.material) handle.material.visible = false;
  });
  rotateGizmo?.picker?.rotate?.children?.forEach((handle) => {
    if (handle.name === "E") handle.raycast = () => {};
  });
}

function createFrameItModelFigure(figure, jointMap, asset, selection) {
  const root = new THREE.Group();
  root.userData.frameItFigure = true;
  root.userData.figureId = figure.id;
  root.position.set(figure.x, figure.y, figure.z);
  root.rotation.set(
    degreesToRadians(figure.rotX),
    degreesToRadians(figure.rotY),
    degreesToRadians(figure.rotZ),
    "XYZ"
  );
  root.scale.setScalar(figure.scale);

  const model = cloneSkeleton(asset.scene);
  normalizeFrameItMannequin(model);
  const surfaceMaterial = prepareFrameItMannequinClone(model, figure);
  root.add(model);

  const bones = frameItBoneMap(model);
  const pendingControllers = [];
  const registerController = (jointId, boneNames, distribute = false, followParent = false) => {
    const controllerBones = boneNames.map((name) => bones.get(name)).filter(Boolean);
    if (!controllerBones.length) return;
    const controller = createFrameItBoneController(controllerBones, distribute, followParent);
    jointMap.set(`${figure.id}:${jointId}`, controller);
    pendingControllers.push({ controller, jointId });
  };
  const registerElbowController = (jointId, forearmNames, handNames) => {
    const forearm = firstFrameItBone(bones, forearmNames);
    const hand = firstFrameItBone(bones, handNames);
    if (!forearm || !hand) return;
    const controller = createFrameItElbowController(forearm, hand);
    jointMap.set(`${figure.id}:${jointId}`, controller);
    pendingControllers.push({ controller, jointId });
  };

  registerController("hipsRot", ["spine", "Hips", "pelvis"].filter((name) => bones.has(name)).slice(0, 1));
  registerController("upperBodyRot", ["spine.001", "spine.002", "spine.003", "spine001", "spine002", "spine003", "spine_01", "spine_02", "spine_03", "Abdomen", "Torso"].filter((name) => bones.has(name)), true);
  registerController("headRot", ["spine.004", "spine.005", "spine004", "spine005", "spine_04", "spine_05", "neck_01", "neck_02", "head", "Neck", "Head"].filter((name) => bones.has(name)), true);
  registerController("leftUpperArm", ["upper_arm.L", "upper_armL", "UpperArm.L", "UpperArmL", "upperarm_l"].filter((name) => bones.has(name)).slice(0, 1), false, true);
  registerElbowController("leftLowerArm", ["forearm.L", "forearmL", "LowerArm.L", "LowerArmL", "lowerarm_l"], ["hand.L", "handL", "Fist.L", "FistL", "hand_l"]);
  registerController("leftHandRot", ["hand.L", "handL", "Fist.L", "FistL", "hand_l"].filter((name) => bones.has(name)).slice(0, 1), false, true);
  registerController("rightUpperArm", ["upper_arm.R", "upper_armR", "UpperArm.R", "UpperArmR", "upperarm_r"].filter((name) => bones.has(name)).slice(0, 1), false, true);
  registerElbowController("rightLowerArm", ["forearm.R", "forearmR", "LowerArm.R", "LowerArmR", "lowerarm_r"], ["hand.R", "handR", "Fist.R", "FistR", "hand_r"]);
  registerController("rightHandRot", ["hand.R", "handR", "Fist.R", "FistR", "hand_r"].filter((name) => bones.has(name)).slice(0, 1), false, true);
  registerController("leftUpperLeg", ["thigh.L", "thighL", "UpperLeg.L", "UpperLegL", "thigh_l"].filter((name) => bones.has(name)).slice(0, 1));
  registerController("leftLowerLeg", ["shin.L", "shinL", "LowerLeg.L", "LowerLegL", "calf_l"].filter((name) => bones.has(name)).slice(0, 1));
  registerController("leftFootRot", ["foot.L", "footL", "toe.L", "toeL", "Foot.L", "FootL", "foot_l", "ball_l"].filter((name) => bones.has(name)));
  registerController("rightUpperLeg", ["thigh.R", "thighR", "UpperLeg.R", "UpperLegR", "thigh_r"].filter((name) => bones.has(name)).slice(0, 1));
  registerController("rightLowerLeg", ["shin.R", "shinR", "LowerLeg.R", "LowerLegR", "calf_r"].filter((name) => bones.has(name)).slice(0, 1));
  registerController("rightFootRot", ["foot.R", "footR", "toe.R", "toeR", "Foot.R", "FootR", "foot_r", "ball_r"].filter((name) => bones.has(name)));

  root.updateMatrixWorld(true);
  pendingControllers.forEach(({ controller, jointId }) => {
    controller.apply(frameItJointRenderRotation(jointId, frameItJointRotation(figure, jointId)));
    addFrameItJointMarker(controller.primaryBone, figure, jointId, selection);
  });

  model.updateMatrixWorld(true);
  return root;
}

function firstFrameItBone(bones, names) {
  return names.map((name) => bones.get(name)).find(Boolean) || null;
}

function addFrameItJointMarker(bone, figure, jointId, selection) {
  if (!bone) return;
  const selected = selection?.figureId === figure.id && selection?.jointId === jointId;
  const color = frameItJointMarkerColor(jointId);
  const worldRadius = selected ? 0.068 : 0.052;
  bone.updateWorldMatrix(true, false);
  const parentWorldScale = bone.getWorldScale(new THREE.Vector3());
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: selected ? 1 : 0.86,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  marker.name = `frame-it-joint-${jointId}`;
  marker.renderOrder = 28;
  marker.userData.frameItSelectable = true;
  marker.userData.frameItOverlayControl = true;
  marker.userData.figureId = figure.id;
  marker.userData.jointId = jointId;
  marker.userData.frameItDirectHandle = true;
  marker.scale.set(
    worldRadius / Math.max(0.001, Math.abs(parentWorldScale.x)),
    worldRadius / Math.max(0.001, Math.abs(parentWorldScale.y)),
    worldRadius / Math.max(0.001, Math.abs(parentWorldScale.z))
  );
  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(1.75, 12, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false
    })
  );
  hitTarget.name = `${marker.name}-hit-target`;
  hitTarget.userData.frameItSelectable = true;
  hitTarget.userData.frameItDirectHandle = true;
  hitTarget.userData.figureId = figure.id;
  hitTarget.userData.jointId = jointId;
  marker.add(hitTarget);
  bone.add(marker);
}

function frameItJointMarkerColor(jointId) {
  if (jointId === "headRot") return 0xb98be8;
  if (jointId === "upperBodyRot" || jointId === "hipsRot") return 0xf1d25b;
  return 0xf5a044;
}

function normalizeFrameItMannequin(model) {
  model.rotation.y = Math.PI / 2;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = size.y > 0 ? frameItMannequinTargetHeight / size.y : 1;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.updateMatrixWorld(true);
}

function prepareFrameItMannequinClone(model, figure) {
  const color = new THREE.Color(figure.color);
  const surfaceMaterial = new THREE.MeshPhysicalMaterial({
    color: color.clone(),
    roughness: 0.76,
    metalness: 0.01,
    clearcoat: 0,
    sheen: 0.08,
    sheenRoughness: 0.85,
    sheenColor: color.clone().offsetHSL(0, -0.08, 0.08)
  });
  model.traverse((object) => {
    object.frustumCulled = false;
    if (!object.isMesh && !object.isSkinnedMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.geometry = object.geometry?.clone();
    object.geometry?.computeVertexNormals?.();
    object.material = surfaceMaterial;
    if (object.isSkinnedMesh) object.userData.frameItFigureId = figure.id;
  });
  return surfaceMaterial;
}

function frameItBoneMap(model) {
  const bones = new Map();
  model.traverse((object) => {
    if (object.isBone && object.name) bones.set(object.name, object);
  });
  return bones;
}


function createFrameItBoneController(bones, distribute, followParent = false) {
  const bases = bones.map((bone) => bone.quaternion.clone());
  const bindParentWorld = bones.map((bone) => bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion());
  return {
    primaryBone: bones[0],
    apply(rotation) {
      const divisor = distribute ? bones.length : 1;
      bones.forEach((bone, index) => {
        // Arm axes stay attached to the neutral shoulder hierarchy as the limb moves.
        const parentWorld = followParent
          ? bindParentWorld[index]
          : bone.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
        const localDelta = parentWorld.clone().invert()
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
            degreesToRadians(rotation.x) / divisor,
            degreesToRadians(rotation.y) / divisor,
            degreesToRadians(rotation.z) / divisor,
            "XYZ"
          )))
          .multiply(parentWorld);
        bone.quaternion.copy(localDelta.multiply(bases[index]));
        bone.updateMatrixWorld(true);
      });
    }
  };
}

function createFrameItElbowController(forearm, hand) {
  forearm.updateWorldMatrix(true, false);
  hand.updateWorldMatrix(true, false);
  const base = forearm.quaternion.clone();
  const parentWorld = forearm.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
  const worldToParent = parentWorld.clone().invert();
  const shoulderPosition = forearm.parent?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3();
  const elbowPosition = forearm.getWorldPosition(new THREE.Vector3());
  const wristPosition = hand.getWorldPosition(new THREE.Vector3());
  const upperDirection = elbowPosition.clone().sub(shoulderPosition).normalize();
  const forearmDirection = wristPosition.clone().sub(elbowPosition).normalize();
  const flexTarget = upperDirection.clone().negate();
  const hingeAxis = new THREE.Vector3().crossVectors(forearmDirection, flexTarget);
  if (hingeAxis.lengthSq() < 0.0001) hingeAxis.set(0, 0, 1);
  hingeAxis.normalize().applyQuaternion(worldToParent).normalize();
  const forearmAxis = forearmDirection.clone().applyQuaternion(worldToParent).normalize();
  const lateralAxis = new THREE.Vector3().crossVectors(hingeAxis, forearmAxis).normalize();

  return {
    primaryBone: forearm,
    apply(rotation) {
      const flex = new THREE.Quaternion().setFromAxisAngle(
        hingeAxis,
        degreesToRadians(-rotation.x)
      );
      const rotatedForearmAxis = forearmAxis.clone().applyQuaternion(flex).normalize();
      const rotatedLateralAxis = lateralAxis.clone().applyQuaternion(flex).normalize();
      const twist = new THREE.Quaternion().setFromAxisAngle(
        rotatedForearmAxis,
        degreesToRadians(rotation.y)
      );
      const lateral = new THREE.Quaternion().setFromAxisAngle(
        rotatedLateralAxis,
        degreesToRadians(rotation.z)
      );
      forearm.quaternion.copy(lateral.multiply(twist).multiply(flex).multiply(base));
      forearm.updateMatrixWorld(true);
    }
  };
}

function frameItJointFromSkinHit(hit) {
  const geometry = hit.object.geometry;
  const skinIndex = geometry?.getAttribute?.("skinIndex");
  const skinWeight = geometry?.getAttribute?.("skinWeight");
  const face = hit.face;
  const skeleton = hit.object.skeleton;
  if (!skinIndex || !skinWeight || !face || !skeleton) return "";
  const vertices = [face.a, face.b, face.c];
  let strongestWeight = -1;
  let strongestBone = null;
  vertices.forEach((vertex) => {
    const indices = [skinIndex.getX(vertex), skinIndex.getY(vertex), skinIndex.getZ(vertex), skinIndex.getW(vertex)];
    const weights = [skinWeight.getX(vertex), skinWeight.getY(vertex), skinWeight.getZ(vertex), skinWeight.getW(vertex)];
    weights.forEach((weight, index) => {
      if (weight > strongestWeight) {
        strongestWeight = weight;
        strongestBone = skeleton.bones[Math.round(indices[index])] || null;
      }
    });
  });
  return frameItJointForBoneName(strongestBone?.name || "");
}

function frameItJointForBoneName(name) {
  const value = String(name || "");
  const lowerValue = value.toLowerCase();
  const compactValue = lowerValue.replace(/[^a-z0-9]/g, "");
  if (!value) return "";
  if (lowerValue === "head" || lowerValue === "neck") return "headRot";
  if (lowerValue === "torso" || lowerValue === "abdomen") return "upperBodyRot";
  if (lowerValue === "hips") return "hipsRot";
  if (lowerValue === "upperarm.l" || lowerValue === "shoulder.l") return "leftUpperArm";
  if (lowerValue === "lowerarm.l") return "leftLowerArm";
  if (lowerValue === "fist.l") return "leftHandRot";
  if (lowerValue === "upperarm.r" || lowerValue === "shoulder.r") return "rightUpperArm";
  if (lowerValue === "lowerarm.r") return "rightLowerArm";
  if (lowerValue === "fist.r") return "rightHandRot";
  if (lowerValue === "upperleg.l") return "leftUpperLeg";
  if (lowerValue === "lowerleg.l") return "leftLowerLeg";
  if (lowerValue === "foot.l") return "leftFootRot";
  if (lowerValue === "upperleg.r") return "rightUpperLeg";
  if (lowerValue === "lowerleg.r") return "rightLowerLeg";
  if (lowerValue === "foot.r") return "rightFootRot";
  if (lowerValue === "spine005" || lowerValue === "spine004") return "headRot";
  if (/^spine00[1-3]$/.test(lowerValue)) return "upperBodyRot";
  if (lowerValue === "spine") return "hipsRot";
  if (["upper_arm.l", "upper_arml", "shoulderl"].includes(lowerValue)) return "leftUpperArm";
  if (["forearm.l", "forearml"].includes(lowerValue)) return "leftLowerArm";
  if (["hand.l", "handl"].includes(lowerValue) || /^(thumb|f_).+l$/.test(lowerValue)) return "leftHandRot";
  if (["upper_arm.r", "upper_armr", "shoulderr"].includes(lowerValue)) return "rightUpperArm";
  if (["forearm.r", "forearmr"].includes(lowerValue)) return "rightLowerArm";
  if (["hand.r", "handr"].includes(lowerValue) || /^(thumb|f_).+r$/.test(lowerValue)) return "rightHandRot";
  if (["thigh.l", "thighl", "pelvisl"].includes(lowerValue)) return "leftUpperLeg";
  if (["shin.l", "shinl"].includes(lowerValue)) return "leftLowerLeg";
  if (["foot.l", "footl", "toe.l", "toel", "heel02l"].includes(lowerValue)) return "leftFootRot";
  if (["thigh.r", "thighr", "pelvisr"].includes(lowerValue)) return "rightUpperLeg";
  if (["shin.r", "shinr"].includes(lowerValue)) return "rightLowerLeg";
  if (["foot.r", "footr", "toe.r", "toer", "heel02r"].includes(lowerValue)) return "rightFootRot";
  if (["upperarml", "shoulderl"].includes(compactValue)) return "leftUpperArm";
  if (["lowerarml", "forearml"].includes(compactValue)) return "leftLowerArm";
  if (["fistl", "handl"].includes(compactValue)) return "leftHandRot";
  if (["upperarmr", "shoulderr"].includes(compactValue)) return "rightUpperArm";
  if (["lowerarmr", "forearmr"].includes(compactValue)) return "rightLowerArm";
  if (["fistr", "handr"].includes(compactValue)) return "rightHandRot";
  if (["upperlegl", "thighl"].includes(compactValue)) return "leftUpperLeg";
  if (["lowerlegl", "shinl", "calfl"].includes(compactValue)) return "leftLowerLeg";
  if (["footl", "balll"].includes(compactValue)) return "leftFootRot";
  if (["upperlegr", "thighr"].includes(compactValue)) return "rightUpperLeg";
  if (["lowerlegr", "shinr", "calfr"].includes(compactValue)) return "rightLowerLeg";
  if (["footr", "ballr"].includes(compactValue)) return "rightFootRot";
  return "";
}

function createFrameItProceduralFigure(figure, jointMap) {
  const root = new THREE.Group();
  root.userData.frameItFigure = true;
  root.userData.figureId = figure.id;
  root.position.set(figure.x, figure.y, figure.z);
  root.rotation.set(
    degreesToRadians(figure.rotX),
    degreesToRadians(figure.rotY),
    degreesToRadians(figure.rotZ),
    "XYZ"
  );
  root.scale.setScalar(figure.scale);

  const color = new THREE.Color(figure.color);
  const standardMaterial = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.56,
    metalness: 0.03,
    clearcoat: 0.14,
    clearcoatRoughness: 0.72
  });

  const hips = createJoint(root, figure, "hipsRot", new THREE.Vector3(0, 1.34, 0), jointMap);
  addBodyMesh(hips, new THREE.SphereGeometry(0.3, 30, 22), standardMaterial, figure, "hipsRot", {
    position: [0, 0.025, 0], scale: [1.12, 0.72, 0.8]
  });

  const chest = createJoint(hips, figure, "upperBodyRot", new THREE.Vector3(0, 0.2, 0), jointMap);
  addBodyMesh(chest, new THREE.CapsuleGeometry(0.17, 0.22, 10, 20), standardMaterial, figure, "upperBodyRot", {
    position: [0, 0.13, 0], scale: [0.94, 1, 0.72]
  });
  addBodyMesh(chest, new THREE.CylinderGeometry(0.34, 0.22, 0.56, 32, 4), standardMaterial, figure, "upperBodyRot", {
    position: [0, 0.39, 0], scale: [1, 1, 0.7]
  });
  addBodyMesh(chest, new THREE.CapsuleGeometry(0.105, 0.49, 8, 18), standardMaterial, figure, "upperBodyRot", {
    position: [0, 0.58, 0], rotation: [0, 0, Math.PI / 2], scale: [1, 1, 0.74]
  });

  const head = createJoint(chest, figure, "headRot", new THREE.Vector3(0, 0.72, 0), jointMap);
  addBodyMesh(head, new THREE.CylinderGeometry(0.095, 0.11, 0.19, 20), standardMaterial, figure, "headRot", {
    position: [0, 0.025, 0]
  });
  addBodyMesh(head, new THREE.SphereGeometry(0.245, 32, 24), standardMaterial, figure, "headRot", {
    position: [0, 0.285, -0.006], scale: [0.8, 1.02, 0.86]
  });
  addBodyMesh(head, new THREE.SphereGeometry(0.2, 28, 20), standardMaterial, figure, "headRot", {
    position: [0, 0.19, 0.018], scale: [0.78, 0.82, 0.82]
  });
  addBodyMesh(head, new THREE.ConeGeometry(0.036, 0.105, 12), standardMaterial, figure, "headRot", {
    position: [0, 0.285, 0.22], rotation: [Math.PI / 2, 0, 0]
  });

  createArm(chest, figure, "left", -1, standardMaterial, jointMap);
  createArm(chest, figure, "right", 1, standardMaterial, jointMap);
  createLeg(hips, figure, "left", -1, standardMaterial, jointMap);
  createLeg(hips, figure, "right", 1, standardMaterial, jointMap);

  return root;
}

function createArm(chest, figure, side, direction, material, jointMap) {
  const upperKey = `${side}UpperArm`;
  const lowerKey = `${side}LowerArm`;
  const handKey = `${side}HandRot`;
  const shoulder = createJoint(chest, figure, upperKey, new THREE.Vector3(direction * 0.39, 0.55, 0), jointMap);
  addBodyMesh(shoulder, new THREE.SphereGeometry(0.13, 22, 16), material, figure, upperKey, {
    position: [0, -0.035, 0], scale: [1, 0.62, 0.82]
  });
  addTaperedLimb(shoulder, 0.55, 0.115, 0.092, material, figure, upperKey);
  const elbow = createJoint(shoulder, figure, lowerKey, new THREE.Vector3(0, -0.55, 0), jointMap);
  addJointMarker(elbow, material, figure, lowerKey, 0.087);
  addTaperedLimb(elbow, 0.49, 0.09, 0.068, material, figure, lowerKey);
  const wrist = createJoint(elbow, figure, handKey, new THREE.Vector3(0, -0.49, 0), jointMap);
  addJointMarker(wrist, material, figure, handKey, 0.075);
  addBodyMesh(wrist, new THREE.SphereGeometry(0.11, 22, 16), material, figure, handKey, {
    position: [0, -0.125, 0.018], scale: [0.68, 1.28, 0.48]
  });
}

function createLeg(hips, figure, side, direction, material, jointMap) {
  const upperKey = `${side}UpperLeg`;
  const lowerKey = `${side}LowerLeg`;
  const footKey = `${side}FootRot`;
  const hip = createJoint(hips, figure, upperKey, new THREE.Vector3(direction * 0.19, -0.08, 0), jointMap);
  addTaperedLimb(hip, 0.64, 0.145, 0.11, material, figure, upperKey);
  const knee = createJoint(hip, figure, lowerKey, new THREE.Vector3(0, -0.64, 0), jointMap);
  addJointMarker(knee, material, figure, lowerKey, 0.098);
  addTaperedLimb(knee, 0.61, 0.108, 0.078, material, figure, lowerKey);
  const ankle = createJoint(knee, figure, footKey, new THREE.Vector3(0, -0.61, 0), jointMap);
  addJointMarker(ankle, material, figure, footKey, 0.075);
  addBodyMesh(ankle, new THREE.SphereGeometry(0.13, 24, 18), material, figure, footKey, {
    position: [0, -0.055, 0.145], scale: [0.72, 0.42, 1.48]
  });
}

function createJoint(parent, figure, jointId, position, jointMap) {
  const joint = new THREE.Group();
  joint.position.copy(position);
  const rotation = frameItJointRenderRotation(jointId, frameItJointRotation(figure, jointId));
  joint.rotation.set(degreesToRadians(rotation.x), degreesToRadians(rotation.y), degreesToRadians(rotation.z));
  parent.add(joint);
  jointMap.set(`${figure.id}:${jointId}`, joint);
  return joint;
}

function addTaperedLimb(parent, length, topRadius, bottomRadius, material, figure, jointId) {
  addBodyMesh(parent, new THREE.CylinderGeometry(topRadius, bottomRadius, length, 22, 2), material, figure, jointId, {
    position: [0, -length / 2, 0]
  });
}

function addJointMarker(parent, material, figure, jointId, radius) {
  addBodyMesh(parent, new THREE.SphereGeometry(radius, 20, 14), material, figure, jointId);
}

function addBodyMesh(parent, geometry, material, figure, jointId, options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(options.position || [0, 0, 0]);
  mesh.rotation.fromArray(options.rotation || [0, 0, 0]);
  mesh.scale.fromArray(options.scale || [1, 1, 1]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.frameItSelectable = true;
  mesh.userData.figureId = figure.id;
  mesh.userData.jointId = jointId;
  parent.add(mesh);
  return mesh;
}

function disposeFrameItScene(scene) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

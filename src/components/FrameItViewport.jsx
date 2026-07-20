import React from "react";
import { clamp } from "../nodeGeometry.js";
import {
  frameItAspectRatioNumber,
  frameItCameraPointerGesture,
  frameItCaptureSize,
  frameItJointPatch,
  frameItJointRenderRotation,
  frameItJointRotation,
  frameItUsesCameraWheel,
  normalizeFrameItScene
} from "../frameItState.js";
import { cloneSkeleton, degreesToRadians, GLTFLoader, THREE, useThreeRuntimeReady } from "../threeRuntime.js";

const frameItMannequinModelPath = "/models/frame-it-mannequin.glb";
const frameItMannequinTargetHeight = 2.62;

let frameItMannequinAsset = null;
let frameItMannequinAssetPromise = null;
let frameItMannequinAssetFailed = false;

export const FrameItViewport = React.forwardRef(function FrameItViewport(
  {
    sceneData,
    aspectRatio,
    selectedFigureId,
    selectedJoint,
    tool,
    showGrid,
    showFloor,
    showGuides,
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
  const dragRef = React.useRef(null);
  const wheelSessionRef = React.useRef({ camera: null, timer: null });
  const stateRef = React.useRef({
    sceneData: normalizeFrameItScene(sceneData),
    aspectRatio,
    selectedFigureId,
    selectedJoint,
    tool,
    showGrid,
    showFloor,
    showGuides,
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
      tool,
      showGrid,
      showFloor,
      showGuides,
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
      else renderFrameItCamera();
    }
  }, [sceneData, aspectRatio, selectedFigureId, selectedJoint, tool, showGrid, showFloor, showGuides, useLimits, onSceneChange, onSelectionChange, onInteractionStart, onCanvasPanStart, threeReady]);

  React.useImperativeHandle(ref, () => ({
    capture() {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera || !threeReady) return "";
      const currentSize = renderer.getSize(new THREE.Vector2());
      const currentAspect = camera.aspect;
      const { width, height } = frameItCaptureSize(stateRef.current.aspectRatio);
      const selection = scene.getObjectByName("frame-it-selection");
      if (selection) selection.visible = false;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const imageDataUrl = renderer.domElement.toDataURL("image/png");
      renderer.setSize(currentSize.x, currentSize.y, false);
      camera.aspect = currentAspect;
      camera.updateProjectionMatrix();
      if (selection) selection.visible = true;
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
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = "frame-it-canvas";
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

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
      for (const hit of hits) {
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

    function handlePointerDown(event) {
      if (event.button !== 0) return;
      const cameraGesture = frameItCameraPointerGesture(event);
      if (cameraGesture) {
        event.preventDefault();
        event.stopPropagation();
        renderer.domElement.focus();
        renderer.domElement.setPointerCapture?.(event.pointerId);
        onInteractionStartRef.current?.();
        dragRef.current = {
          type: cameraGesture,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          camera: { ...stateRef.current.sceneData.camera }
        };
        return;
      }

      const hit = pointerSelection(event);
      if (!hit) {
        onCanvasPanStartRef.current?.(event);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      renderer.domElement.focus();
      renderer.domElement.setPointerCapture?.(event.pointerId);
      const figureId = hit.object.userData.figureId;
      const jointId = hit.object.userData.jointId;
      const figure = stateRef.current.sceneData.figures.find((item) => item.id === figureId);
      if (!figure || !jointId) return;
      onInteractionStartRef.current?.();
      onSelectionChangeRef.current?.({ figureId, jointId });
      dragRef.current = {
        type: "pose",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        figure,
        figureId,
        jointId,
        rotation: frameItJointRotation(figure, jointId),
        pendingScene: stateRef.current.sceneData
      };
    }

    function handlePointerMove(event) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.type === "orbit") {
        const nextCamera = {
          ...drag.camera,
          yaw: drag.camera.yaw - dx * 0.35,
          pitch: clamp(drag.camera.pitch + dy * 0.28, -82, 82)
        };
        applyTransientCamera(nextCamera);
        drag.pendingCamera = nextCamera;
        return;
      }
      if (drag.type === "pan") {
        const scale = Math.max(0.001, drag.camera.distance * 0.0018);
        const yaw = degreesToRadians(drag.camera.yaw);
        const nextCamera = {
          ...drag.camera,
          targetX: drag.camera.targetX - Math.cos(yaw) * dx * scale,
          targetZ: drag.camera.targetZ + Math.sin(yaw) * dx * scale,
          targetY: drag.camera.targetY + dy * scale
        };
        applyTransientCamera(nextCamera);
        drag.pendingCamera = nextCamera;
        return;
      }

      const currentTool = stateRef.current.tool;
      let nextFigure = { ...drag.figure };
      if (currentTool === "moveVertical") {
        nextFigure.y = clamp(drag.figure.y - dy * 0.008, -1.5, 4);
      } else if (currentTool === "moveFloor") {
        const yaw = degreesToRadians(stateRef.current.sceneData.camera.yaw);
        const scale = Math.max(0.002, stateRef.current.sceneData.camera.distance * 0.0017);
        nextFigure.x = drag.figure.x + (Math.cos(yaw) * dx + Math.sin(yaw) * dy) * scale;
        nextFigure.z = drag.figure.z + (-Math.sin(yaw) * dx + Math.cos(yaw) * dy) * scale;
      } else {
        const nextRotation = { ...drag.rotation };
        if (currentTool === "tilt") nextRotation.z = drag.rotation.z - dx * 0.48;
        else if (currentTool === "rotate") nextRotation.y = drag.rotation.y + dx * 0.55;
        else nextRotation.x = drag.rotation.x + dy * 0.48;
        nextFigure = { ...nextFigure, ...frameItJointPatch(drag.jointId, nextRotation, stateRef.current.useLimits) };
      }
      const nextScene = {
        ...stateRef.current.sceneData,
        figures: stateRef.current.sceneData.figures.map((item) => item.id === drag.figureId ? nextFigure : item)
      };
      drag.pendingScene = nextScene;
      applyTransientFigure(nextFigure, drag.jointId);
    }

    function handlePointerUp(event) {
      const drag = dragRef.current;
      dragRef.current = null;
      if (renderer.domElement.hasPointerCapture?.(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (drag?.pendingCamera) {
        onSceneChangeRef.current?.({ ...stateRef.current.sceneData, camera: drag.pendingCamera });
      } else if (drag?.pendingScene && drag.pendingScene !== stateRef.current.sceneData) {
        onSceneChangeRef.current?.(drag.pendingScene);
      }
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
      const cameraData = session.camera;
      const nextCamera = {
        ...cameraData,
        distance: clamp(cameraData.distance + event.deltaY * 0.005, 1.5, 14)
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
      figureObject.rotation.y = degreesToRadians(figure.rotY);
      figureObject.scale.setScalar(figure.scale);
      const jointObject = jointObjectsRef.current.get(`${figure.id}:${jointId}`);
      if (jointObject) {
        const rotation = frameItJointRenderRotation(jointId, frameItJointRotation(figure, jointId));
        if (typeof jointObject.apply === "function") jointObject.apply(rotation);
        else jointObject.rotation.set(degreesToRadians(rotation.x), degreesToRadians(rotation.y), degreesToRadians(rotation.z));
      }
      renderer.render(scene, camera);
    }

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderFrameItViewport();

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      if (wheelSessionRef.current.timer) window.clearTimeout(wheelSessionRef.current.timer);
      wheelSessionRef.current = { camera: null, timer: null };
      disposeFrameItScene(scene);
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
    disposeFrameItScene(scene);
    scene.clear();
    figureObjectsRef.current.clear();
    jointObjectsRef.current.clear();
    scene.background = new THREE.Color(0x101216);
    scene.fog = new THREE.Fog(0x101216, 11, 22);

    scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x24201d, 2.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
    keyLight.position.set(3.8, 6.5, 4.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x7eb9ff, 1.25);
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
      const object = createFrameItFigure(figure, stateRef.current.selectedFigureId, stateRef.current.selectedJoint, jointObjectsRef.current);
      figureObjectsRef.current.set(figure.id, object);
      scene.add(object);
    });
    if (!frameItMannequinAsset && !frameItMannequinAssetFailed) {
      loadFrameItMannequinAsset().then((asset) => {
        if (asset && rendererRef.current === renderer) renderFrameItViewport();
      });
    }
    positionFrameItCamera(camera, data.camera);
    camera.aspect = frameItAspectRatioNumber(stateRef.current.aspectRatio);
    camera.fov = data.camera.fov;
    camera.updateProjectionMatrix();
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
      <div className="frame-it-camera-hint">Option drag: orbit&nbsp;&nbsp; Command drag: pan&nbsp;&nbsp; Command scroll: dolly</div>
    </div>
  );
});

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

function createFrameItFigure(figure, selectedFigureId, selectedJoint, jointMap) {
  if (frameItMannequinAsset?.scene && cloneSkeleton) {
    return createFrameItModelFigure(figure, selectedFigureId, selectedJoint, jointMap, frameItMannequinAsset);
  }
  return createFrameItProceduralFigure(figure, selectedFigureId, selectedJoint, jointMap);
}

function createFrameItModelFigure(figure, selectedFigureId, selectedJoint, jointMap, asset) {
  const root = new THREE.Group();
  root.userData.frameItFigure = true;
  root.userData.figureId = figure.id;
  root.position.set(figure.x, figure.y, figure.z);
  root.rotation.y = degreesToRadians(figure.rotY);
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

  registerController("hipsRot", ["spine"]);
  registerController("upperBodyRot", ["spine001", "spine002", "spine003"], true);
  registerController("headRot", ["spine004", "spine005"], true);
  registerController("leftUpperArm", ["upper_armL"], false, true);
  registerController("leftLowerArm", ["forearmL"], false, true);
  registerController("leftHandRot", ["handL"], false, true);
  registerController("rightUpperArm", ["upper_armR"], false, true);
  registerController("rightLowerArm", ["forearmR"], false, true);
  registerController("rightHandRot", ["handR"], false, true);
  registerController("leftUpperLeg", ["thighL"]);
  registerController("leftLowerLeg", ["shinL"]);
  registerController("leftFootRot", ["footL", "toeL"]);
  registerController("rightUpperLeg", ["thighR"]);
  registerController("rightLowerLeg", ["shinR"]);
  registerController("rightFootRot", ["footR", "toeR"]);

  pendingControllers.forEach(({ controller, jointId }) => {
    controller.apply(frameItJointRenderRotation(jointId, frameItJointRotation(figure, jointId)));
  });

  if (figure.id === selectedFigureId) {
    const controller = jointMap.get(`${figure.id}:${selectedJoint}`) || jointMap.get(`${figure.id}:hipsRot`);
    const selectedBone = controller?.primaryBone;
    if (selectedBone) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.105, 0.009, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0xf4d62d, transparent: true, opacity: 0.95, depthTest: false })
      );
      ring.name = "frame-it-selection";
      ring.renderOrder = 20;
      ring.rotation.y = Math.PI / 2;
      selectedBone.add(ring);
    }
  }

  model.updateMatrixWorld(true);
  return root;
}

function normalizeFrameItMannequin(model) {
  model.rotation.y = -Math.PI / 2;
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
    roughness: 0.58,
    metalness: 0.01,
    clearcoat: 0.08,
    clearcoatRoughness: 0.78
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
  if (!value) return "";
  if (lowerValue === "spine005" || lowerValue === "spine004") return "headRot";
  if (/^spine00[1-3]$/.test(lowerValue)) return "upperBodyRot";
  if (lowerValue === "spine") return "hipsRot";
  if (lowerValue === "upper_arml" || lowerValue === "shoulderl") return "leftUpperArm";
  if (lowerValue === "forearml") return "leftLowerArm";
  if (lowerValue === "handl" || /^(thumb|f_).+l$/.test(lowerValue)) return "leftHandRot";
  if (lowerValue === "upper_armr" || lowerValue === "shoulderr") return "rightUpperArm";
  if (lowerValue === "forearmr") return "rightLowerArm";
  if (lowerValue === "handr" || /^(thumb|f_).+r$/.test(lowerValue)) return "rightHandRot";
  if (lowerValue === "thighl" || lowerValue === "pelvisl") return "leftUpperLeg";
  if (lowerValue === "shinl") return "leftLowerLeg";
  if (lowerValue === "footl" || lowerValue === "toel" || lowerValue === "heel02l") return "leftFootRot";
  if (lowerValue === "thighr" || lowerValue === "pelvisr") return "rightUpperLeg";
  if (lowerValue === "shinr") return "rightLowerLeg";
  if (lowerValue === "footr" || lowerValue === "toer" || lowerValue === "heel02r") return "rightFootRot";
  return "";
}

function createFrameItProceduralFigure(figure, selectedFigureId, selectedJoint, jointMap) {
  const root = new THREE.Group();
  root.userData.frameItFigure = true;
  root.userData.figureId = figure.id;
  root.position.set(figure.x, figure.y, figure.z);
  root.rotation.y = degreesToRadians(figure.rotY);
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

  if (figure.id === selectedFigureId) {
    const selectedObject = jointMap.get(`${figure.id}:${selectedJoint}`) || hips;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.014, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xf4d62d, transparent: true, opacity: 0.95, depthTest: false })
    );
    ring.name = "frame-it-selection";
    ring.renderOrder = 20;
    ring.rotation.x = Math.PI / 2;
    selectedObject.add(ring);
  }

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

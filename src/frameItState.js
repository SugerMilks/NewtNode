import { clamp } from "./nodeGeometry.js";
import { frameItPresetSnapshots } from "./frameItPresetSnapshots.js";

export const frameItAspectRatios = ["16:9", "21:9", "4:3", "1:1", "9:16"];

export const frameItFigureColors = [
  { id: "gray", label: "Gray", value: "#aeb8c4" },
  { id: "blue", label: "Blue", value: "#5f86c9" },
  { id: "red", label: "Red", value: "#c76666" },
  { id: "green", label: "Green", value: "#67a57a" },
  { id: "purple", label: "Purple", value: "#8b70c7" }
];

export const frameItJointDefinitions = [
  { id: "headRot", label: "Head" },
  { id: "upperBodyRot", label: "Chest" },
  { id: "hipsRot", label: "Hips" },
  { id: "leftUpperArm", label: "Left shoulder" },
  { id: "leftLowerArm", label: "Left elbow" },
  { id: "leftHandRot", label: "Left wrist" },
  { id: "rightUpperArm", label: "Right shoulder" },
  { id: "rightLowerArm", label: "Right elbow" },
  { id: "rightHandRot", label: "Right wrist" },
  { id: "leftUpperLeg", label: "Left hip" },
  { id: "leftLowerLeg", label: "Left knee" },
  { id: "leftFootRot", label: "Left ankle" },
  { id: "rightUpperLeg", label: "Right hip" },
  { id: "rightLowerLeg", label: "Right knee" },
  { id: "rightFootRot", label: "Right ankle" }
];

export const frameItJointLabels = Object.fromEntries(frameItJointDefinitions.map((joint) => [joint.id, joint.label]));

const frameItJointIds = frameItJointDefinitions.map((joint) => joint.id);

const frameItJointRanges = {
  headRot: { x: [-55, 60], y: [-85, 85], z: [-45, 45] },
  upperBodyRot: { x: [-50, 60], y: [-70, 70], z: [-45, 45] },
  hipsRot: { x: [-40, 50], y: [-60, 60], z: [-40, 40] },
  leftUpperArm: { x: [-75, 190], y: [-120, 120], z: [-55, 185] },
  rightUpperArm: { x: [-75, 190], y: [-120, 120], z: [-185, 55] },
  leftLowerArm: { x: [-10, 160], y: [-90, 90], z: [-15, 15] },
  rightLowerArm: { x: [-10, 160], y: [-90, 90], z: [-15, 15] },
  leftHandRot: { x: [-90, 90], y: [-90, 90], z: [-45, 45] },
  rightHandRot: { x: [-90, 90], y: [-90, 90], z: [-45, 45] },
  leftUpperLeg: { x: [-130, 55], y: [-70, 70], z: [-70, 70] },
  rightUpperLeg: { x: [-130, 55], y: [-70, 70], z: [-70, 70] },
  leftLowerLeg: { x: [-10, 160], y: [-15, 15], z: [-15, 15] },
  rightLowerLeg: { x: [-10, 160], y: [-15, 15], z: [-15, 15] },
  leftFootRot: { x: [-60, 50], y: [-40, 40], z: [-45, 45] },
  rightFootRot: { x: [-60, 50], y: [-40, 40], z: [-45, 45] }
};

export const defaultFrameItPoseId = "a-pose";

function frameItSavedPreset(id, label) {
  const snapshot = frameItPresetSnapshots[id];
  const scene = snapshot?.scene
    ? {
        ...snapshot.scene,
        figures: snapshot.scene.figures.map((figure, index) => ({
          ...figure,
          name: `Figure ${index + 1}`
        }))
      }
    : snapshot?.scene;
  return {
    id,
    label,
    pose: {},
    ...snapshot,
    scene
  };
}

export const frameItPosePresets = [
  frameItSavedPreset("a-pose", "A-Pose"),
  frameItSavedPreset("ws", "WS"),
  frameItSavedPreset("cu", "CU"),
  frameItSavedPreset("cowboy", "Cowboy"),
  frameItSavedPreset("ots-ms", "OTS-MS"),
  frameItSavedPreset("ots-cu", "OTS-CU"),
  frameItSavedPreset("2-shot-wide", "2-Shot-Wide"),
  frameItSavedPreset("2-shot-medium", "2-Shot-Medium"),
  frameItSavedPreset("2-shot-close", "2-Shot-Close"),
  frameItSavedPreset("3-shot-wide", "3-Shot-Wide"),
  frameItSavedPreset("3-shot-medium", "3-Shot-Medium")
];

export function defaultFrameItCamera() {
  return {
    yaw: 0,
    pitch: 3,
    distance: 5.2,
    targetX: 0,
    targetY: 1.25,
    targetZ: 0,
    fov: 34
  };
}

export function defaultFrameItFigure(index = 1) {
  const pose = frameItEmptyPose();
  return {
    id: `frame-it-figure-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Figure ${index}`,
    color: frameItFigureColors[0].value,
    x: (index - 1) * 0.72,
    y: 0,
    z: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
    ...pose
  };
}

export function defaultFrameItScene() {
  const figure = defaultFrameItFigure(1);
  return {
    camera: defaultFrameItCamera(),
    figures: [figure]
  };
}

export function normalizeFrameItScene(scene = {}) {
  const fallback = defaultFrameItScene();
  const sourceFigures = Array.isArray(scene?.figures) && scene.figures.length ? scene.figures : fallback.figures;
  return {
    camera: normalizeFrameItCamera(scene?.camera, fallback.camera),
    figures: sourceFigures.slice(0, 6).map((figure, index) => normalizeFrameItFigure(figure, index))
  };
}

export function normalizeFrameItFigure(figure = {}, index = 0) {
  const fallback = defaultFrameItFigure(index + 1);
  return {
    ...fallback,
    ...frameItEmptyPose(),
    ...frameItPoseSnapshot(figure),
    id: String(figure.id || fallback.id),
    name: String(figure.name || fallback.name),
    color: normalizeHexColor(figure.color, fallback.color),
    x: finiteNumber(figure.x, fallback.x),
    y: finiteNumber(figure.y, fallback.y),
    z: finiteNumber(figure.z, fallback.z),
    rotX: finiteNumber(figure.rotX, fallback.rotX),
    rotY: finiteNumber(figure.rotY, fallback.rotY),
    rotZ: finiteNumber(figure.rotZ, fallback.rotZ),
    scale: clamp(finiteNumber(figure.scale, fallback.scale), 0.55, 1.8)
  };
}

export function normalizeFrameItSavedPoses(poses = []) {
  if (!Array.isArray(poses)) return [];
  return poses.slice(0, 40).map((pose, index) => {
    const scene = Array.isArray(pose?.scene?.figures) && pose.scene.figures.length
      ? normalizeFrameItScene(pose.scene)
      : null;
    const selectedFigureId = scene?.figures.some((figure) => figure.id === pose?.selectedFigureId)
      ? String(pose.selectedFigureId)
      : scene?.figures[0]?.id || "";
    return {
      id: String(pose?.id || `frame-it-pose-${index + 1}`),
      name: String(pose?.name || `Pose ${index + 1}`).trim() || `Pose ${index + 1}`,
      pose: frameItPoseSnapshot(pose?.pose || pose),
      figurePatch: pose?.figurePatch ? frameItFigureCompositionSnapshot(pose.figurePatch) : null,
      camera: pose?.camera ? normalizeFrameItCamera(pose.camera) : null,
      scene,
      selectedFigureId,
      aspectRatio: frameItAspectRatios.includes(pose?.aspectRatio) ? pose.aspectRatio : null
    };
  });
}

export function normalizeFrameItCamera(camera = {}, fallback = defaultFrameItCamera()) {
  return {
    yaw: finiteNumber(camera.yaw, fallback.yaw),
    pitch: clamp(finiteNumber(camera.pitch, fallback.pitch), -82, 82),
    distance: clamp(finiteNumber(camera.distance, fallback.distance), 1.5, 14),
    targetX: finiteNumber(camera.targetX, fallback.targetX),
    targetY: finiteNumber(camera.targetY, fallback.targetY),
    targetZ: finiteNumber(camera.targetZ, fallback.targetZ),
    fov: clamp(finiteNumber(camera.fov, fallback.fov), 18, 80)
  };
}

export function frameItFigureCompositionSnapshot(figure = {}) {
  return {
    x: finiteNumber(figure.x, 0),
    y: finiteNumber(figure.y, 0),
    z: finiteNumber(figure.z, 0),
    rotX: finiteNumber(figure.rotX, 0),
    rotY: finiteNumber(figure.rotY, 0),
    rotZ: finiteNumber(figure.rotZ, 0),
    scale: clamp(finiteNumber(figure.scale, 1), 0.55, 1.8)
  };
}

export function frameItFigurePositionPatch(position = {}) {
  return {
    x: clamp(finiteNumber(position.x, 0), -12, 12),
    y: clamp(finiteNumber(position.y, 0), -1.5, 4),
    z: clamp(finiteNumber(position.z, 0), -12, 12)
  };
}

export function frameItFigureRotation(figure = {}) {
  return {
    x: finiteNumber(figure.rotX, 0),
    y: finiteNumber(figure.rotY, 0),
    z: finiteNumber(figure.rotZ, 0)
  };
}

export function frameItFigureRotationPatch(rotation = {}) {
  return {
    rotX: clamp(finiteNumber(rotation.x, 0), -360, 360),
    rotY: clamp(finiteNumber(rotation.y, 0), -360, 360),
    rotZ: clamp(finiteNumber(rotation.z, 0), -360, 360)
  };
}

export function frameItPoseSnapshot(source = {}) {
  const snapshot = {};
  frameItJointIds.forEach((jointId) => {
    snapshot[`${jointId}X`] = finiteNumber(source?.[`${jointId}X`], 0);
    snapshot[`${jointId}Y`] = finiteNumber(source?.[`${jointId}Y`], 0);
    snapshot[`${jointId}Z`] = finiteNumber(source?.[`${jointId}Z`], 0);
  });
  return snapshot;
}

export function frameItEmptyPose() {
  return frameItPoseSnapshot({});
}

export function frameItJointRotation(figure, jointId) {
  return {
    x: finiteNumber(figure?.[`${jointId}X`], 0),
    y: finiteNumber(figure?.[`${jointId}Y`], 0),
    z: finiteNumber(figure?.[`${jointId}Z`], 0)
  };
}

export function frameItJointRenderRotation(jointId, rotation = {}) {
  const invertFlexion = /^(left|right)(Upper|Lower)Arm$/.test(String(jointId || ""));
  return {
    x: finiteNumber(rotation.x, 0) * (invertFlexion ? -1 : 1),
    y: finiteNumber(rotation.y, 0),
    z: finiteNumber(rotation.z, 0)
  };
}

export function frameItJointStateRotation(jointId, rotation = {}) {
  return frameItJointRenderRotation(jointId, rotation);
}

export function frameItJointRotationFromGizmo(jointId, startingRotation, deltaRotation, useLimits = true) {
  const renderedStart = frameItJointRenderRotation(jointId, startingRotation);
  const logicalRotation = frameItJointStateRotation(jointId, {
    x: renderedStart.x + finiteNumber(deltaRotation?.x, 0),
    y: renderedStart.y + finiteNumber(deltaRotation?.y, 0),
    z: renderedStart.z + finiteNumber(deltaRotation?.z, 0)
  });
  return frameItJointPatch(jointId, logicalRotation, useLimits);
}

export function normalizeFrameItGizmoMode(value) {
  if (value === "translate" || value === "figureRotate") return value;
  return "rotate";
}

export function frameItJointPatch(jointId, rotation, useLimits = true) {
  return {
    [`${jointId}X`]: frameItClampJointValue(jointId, "x", rotation.x, useLimits),
    [`${jointId}Y`]: frameItClampJointValue(jointId, "y", rotation.y, useLimits),
    [`${jointId}Z`]: frameItClampJointValue(jointId, "z", rotation.z, useLimits)
  };
}

export function frameItJointRange(jointId, axis, useLimits = true) {
  if (!useLimits) return { min: -180, max: 180 };
  const [min, max] = frameItJointRanges[jointId]?.[axis] || [-175, 175];
  return { min, max };
}

export function frameItCameraPointerGesture({ altKey = false, metaKey = false, ctrlKey = false } = {}) {
  if (altKey) return "orbit";
  if (metaKey || ctrlKey) return "pan";
  return "";
}

export function frameItUsesCameraWheel({ altKey = false, metaKey = false } = {}) {
  return Boolean(metaKey || altKey);
}

export function frameItApplyPose(figure, pose = {}, figurePatch = {}) {
  return normalizeFrameItFigure({
    ...figure,
    ...frameItEmptyPose(),
    ...frameItPoseSnapshot(pose),
    ...figurePatch
  });
}

export function frameItAspectRatioNumber(value = "16:9") {
  const [width, height] = String(value || "16:9").split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

export function frameItCaptureSize(value = "16:9") {
  const ratio = frameItAspectRatioNumber(value);
  if (ratio >= 1) return { width: 1600, height: Math.round(1600 / ratio) };
  return { width: Math.round(1600 * ratio), height: 1600 };
}

function frameItClampJointValue(jointId, axis, value, useLimits) {
  const number = finiteNumber(value, 0);
  if (!useLimits) return clamp(number, -360, 360);
  const { min, max } = frameItJointRange(jointId, axis, true);
  return clamp(number, min, max);
}

function normalizeHexColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

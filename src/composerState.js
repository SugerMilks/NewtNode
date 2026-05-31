import { loadCanvasImage } from "./canvasMedia.js";
import { degreesToRadians } from "./threeRuntime.js";

export const composerPoseFieldKeys = [
  "leftUpperArm",
  "leftUpperArmX",
  "leftUpperArmY",
  "leftUpperArmZ",
  "leftLowerArm",
  "leftLowerArmX",
  "leftLowerArmY",
  "leftLowerArmZ",
  "rightUpperArm",
  "rightUpperArmX",
  "rightUpperArmY",
  "rightUpperArmZ",
  "rightLowerArm",
  "rightLowerArmX",
  "rightLowerArmY",
  "rightLowerArmZ",
  "leftUpperLeg",
  "leftUpperLegX",
  "leftUpperLegY",
  "leftUpperLegZ",
  "leftLowerLeg",
  "leftLowerLegX",
  "leftLowerLegY",
  "leftLowerLegZ",
  "rightUpperLeg",
  "rightUpperLegX",
  "rightUpperLegY",
  "rightUpperLegZ",
  "rightLowerLeg",
  "rightLowerLegX",
  "rightLowerLegY",
  "rightLowerLegZ",
  "hipsRotX",
  "hipsRotY",
  "hipsRotZ",
  "leftHandRotX",
  "leftHandRotY",
  "leftHandRotZ",
  "rightHandRotX",
  "rightHandRotY",
  "rightHandRotZ",
  "leftFootRotX",
  "leftFootRotY",
  "leftFootRotZ",
  "rightFootRotX",
  "rightFootRotY",
  "rightFootRotZ",
  "headRotX",
  "headRotY",
  "headRotZ",
  "upperBodyRotX",
  "upperBodyRotY",
  "upperBodyRotZ",
  "lean"
];
export const composerAspectRatios = {
  "21:9": "21 / 9",
  "16:9": "16 / 9",
  "4:3": "4 / 3",
  "1:1": "1 / 1",
  "9:16": "9 / 16"
};
export const composerPrimitiveOptions = [
  { id: "box", label: "Box" },
  { id: "sphere", label: "Sphere" },
  { id: "cylinder", label: "Cylinder" },
  { id: "cone", label: "Cone" }
];

export function defaultComposerScene() {
  return {
    camera: {
      x: 3.4,
      y: 2.75,
      z: 4.15,
      yaw: 36,
      pitch: -16,
      distance: 6.2,
      fov: 38,
      targetY: 1.1
    },
    maquettes: [defaultComposerMaquette(1)],
    props: [defaultComposerProp(1)],
    imagePlanes: [],
    cameraBookmarks: []
  };
}

export function defaultComposerMaquette(index = 1) {
  return {
    id: `maquette-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: `Maquette ${index}`,
    x: index === 1 ? 0 : (index - 1) * 0.8,
    y: 0,
    z: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
    pose: "",
    leftUpperArm: 0,
    leftUpperArmX: 0,
    leftUpperArmY: 0,
    leftUpperArmZ: 0,
    leftLowerArm: 0,
    leftLowerArmX: 0,
    leftLowerArmY: 0,
    leftLowerArmZ: 0,
    rightUpperArm: 0,
    rightUpperArmX: 0,
    rightUpperArmY: 0,
    rightUpperArmZ: 0,
    rightLowerArm: 0,
    rightLowerArmX: 0,
    rightLowerArmY: 0,
    rightLowerArmZ: 0,
    leftUpperLeg: 0,
    leftUpperLegX: 0,
    leftUpperLegY: 0,
    leftUpperLegZ: 0,
    leftLowerLeg: 0,
    leftLowerLegX: 0,
    leftLowerLegY: 0,
    leftLowerLegZ: 0,
    rightUpperLeg: 0,
    rightUpperLegX: 0,
    rightUpperLegY: 0,
    rightUpperLegZ: 0,
    rightLowerLeg: 0,
    rightLowerLegX: 0,
    rightLowerLegY: 0,
    rightLowerLegZ: 0,
    hipsRotX: 0,
    hipsRotY: 0,
    hipsRotZ: 0,
    leftHandRotX: 0,
    leftHandRotY: 0,
    leftHandRotZ: 0,
    rightHandRotX: 0,
    rightHandRotY: 0,
    rightHandRotZ: 0,
    leftFootRotX: 0,
    leftFootRotY: 0,
    leftFootRotZ: 0,
    rightFootRotX: 0,
    rightFootRotY: 0,
    rightFootRotZ: 0,
    headRotX: 0,
    headRotY: 0,
    headRotZ: 0,
    upperBodyRotX: 0,
    upperBodyRotY: 0,
    upperBodyRotZ: 0,
    lean: 0,
    color: "#b8b8b2"
  };
}

export function defaultComposerProp(index = 1, primitive = "box") {
  const normalizedPrimitive = normalizeComposerPrimitiveType(primitive);
  const primitiveLabel = composerPrimitiveLabel(normalizedPrimitive);
  return {
    id: `prop-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${primitiveLabel} ${index}`,
    primitive: normalizedPrimitive,
    x: index === 1 ? 1.6 : index * 0.6,
    y: 0,
    z: -0.45,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
    width: 0.9,
    height: 0.9,
    depth: 0.9,
    color: "#496b8f"
  };
}

export function defaultComposerImagePlane(index = 1, imageUrl = "", label = "", aspectRatio = 16 / 9) {
  const size = composerImagePlaneSizeForAspect(aspectRatio);
  return {
    id: `image-plane-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: label || `Image Plane ${index}`,
    imageUrl,
    x: 0,
    y: 1.15,
    z: -1.4,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
    width: size.width,
    height: size.height,
    opacity: 1
  };
}

export function normalizeComposerAspectRatio(value) {
  return composerAspectRatios[String(value || "")] ? String(value) : "16:9";
}

export function composerAspectRatioValue(value) {
  return composerAspectRatios[normalizeComposerAspectRatio(value)];
}

export function composerAspectRatioNumber(value) {
  const [width = 16, height = 9] = normalizeComposerAspectRatio(value).split(":").map(Number);
  return width / height;
}

export function normalizeComposerPrimitiveType(value) {
  const primitive = String(value || "box");
  return composerPrimitiveOptions.some((option) => option.id === primitive) ? primitive : "box";
}

export function composerPrimitiveLabel(value) {
  return composerPrimitiveOptions.find((option) => option.id === normalizeComposerPrimitiveType(value))?.label || "Box";
}

export function composerImagePlaneSizeForAspect(aspectRatio) {
  const ratio = Math.max(0.05, finiteNumber(aspectRatio, 16 / 9));
  const maxSide = 2;
  if (ratio >= 1) {
    return {
      width: maxSide,
      height: maxSide / ratio
    };
  }

  return {
    width: maxSide * ratio,
    height: maxSide
  };
}

export async function composerImageAspectFromSource(source) {
  if (source?.width && source?.height) return finiteNumber(source.width, 16) / Math.max(1, finiteNumber(source.height, 9));
  if (!source?.url) return 16 / 9;

  try {
    const image = await loadCanvasImage(source.url);
    return image.naturalWidth / Math.max(1, image.naturalHeight);
  } catch {
    return 16 / 9;
  }
}

export function composerRotationVector(item, key, legacyZ = 0) {
  const zFallback = finiteNumber(item?.[key], legacyZ);
  return {
    x: finiteNumber(item?.[`${key}X`], 0),
    y: finiteNumber(item?.[`${key}Y`], 0),
    z: finiteNumber(item?.[`${key}Z`], zFallback)
  };
}

export function composerRotationVectorPatch(key, value, includeLegacy = true) {
  const vector = {
    x: finiteNumber(value?.x, 0),
    y: finiteNumber(value?.y, 0),
    z: finiteNumber(value?.z, 0)
  };
  const patch = {
    [`${key}X`]: vector.x,
    [`${key}Y`]: vector.y,
    [`${key}Z`]: vector.z
  };
  if (includeLegacy) patch[key] = vector.z;
  return patch;
}

export function composerRotationFields(item, key, legacyZ = 0) {
  return composerRotationVectorPatch(key, composerRotationVector(item, key, legacyZ));
}

export function normalizedComposerScene(scene = null) {
  const fallback = defaultComposerScene();
  const hasScene = scene && typeof scene === "object";
  const camera = hasScene && scene.camera ? scene.camera : fallback.camera;
  const cameraPitch = finiteNumber(camera.pitch, fallback.camera.pitch);
  const cameraYaw = finiteNumber(camera.yaw, fallback.camera.yaw);
  const cameraDistance = finiteNumber(camera.distance, fallback.camera.distance);
  const cameraTargetY = finiteNumber(camera.targetY, fallback.camera.targetY);
  const hasFreeCameraPosition = Number.isFinite(Number(camera.x)) && Number.isFinite(Number(camera.y)) && Number.isFinite(Number(camera.z));
  const legacyPitch = degreesToRadians(cameraPitch);
  const legacyYaw = degreesToRadians(cameraYaw);
  const legacyCameraPosition = {
    x: Math.sin(legacyYaw) * Math.cos(legacyPitch) * cameraDistance,
    y: cameraTargetY + Math.sin(legacyPitch) * cameraDistance,
    z: Math.cos(legacyYaw) * Math.cos(legacyPitch) * cameraDistance
  };
  const maquetteSource = hasScene && Array.isArray(scene.maquettes) ? scene.maquettes : fallback.maquettes;
  const propSource = hasScene && Array.isArray(scene.props) ? scene.props : fallback.props;
  const imagePlaneSource = hasScene && Array.isArray(scene.imagePlanes) ? scene.imagePlanes : fallback.imagePlanes;
  const cameraBookmarkSource = hasScene && Array.isArray(scene.cameraBookmarks) ? scene.cameraBookmarks : fallback.cameraBookmarks;

  return {
    camera: {
      x: finiteNumber(camera.x, legacyCameraPosition.x),
      y: finiteNumber(camera.y, legacyCameraPosition.y),
      z: finiteNumber(camera.z, legacyCameraPosition.z),
      yaw: cameraYaw,
      pitch: hasFreeCameraPosition ? cameraPitch : -cameraPitch,
      distance: cameraDistance,
      fov: finiteNumber(camera.fov, fallback.camera.fov),
      targetY: cameraTargetY
    },
    maquettes: maquetteSource.map((item, index) => {
      const legacyUpperArm = finiteNumber(item?.upperArm, finiteNumber(item?.armSwing, 0));
      const legacyLowerArm = finiteNumber(item?.lowerArm, finiteNumber(item?.armSwing, 0) * 0.65);
      const legacyUpperLeg = finiteNumber(item?.upperLeg, finiteNumber(item?.legSwing, 0));
      const legacyLowerLeg = finiteNumber(item?.lowerLeg, finiteNumber(item?.legSwing, 0) * -0.45);
      const legacyHandRotX = finiteNumber(item?.handRotX, 0);
      const legacyHandRotY = finiteNumber(item?.handRotY, 0);
      const legacyHandRotZ = finiteNumber(item?.handRotZ, 0);
      return {
        id: String(item?.id || `maquette-${index + 1}`),
        name: String(item?.name || `Maquette ${index + 1}`),
        x: finiteNumber(item?.x, 0),
        y: finiteNumber(item?.y, 0),
        z: finiteNumber(item?.z, 0),
        rotX: finiteNumber(item?.rotX, 0),
        rotY: finiteNumber(item?.rotY, finiteNumber(item?.yaw, 0)),
        rotZ: finiteNumber(item?.rotZ, 0),
        scale: finiteNumber(item?.scale, 1),
        pose: String(item?.pose || ""),
        ...composerRotationFields(item, "leftUpperArm", legacyUpperArm),
        ...composerRotationFields(item, "leftLowerArm", legacyLowerArm),
        ...composerRotationFields(item, "rightUpperArm", -legacyUpperArm),
        ...composerRotationFields(item, "rightLowerArm", -legacyLowerArm),
        ...composerRotationFields(item, "leftUpperLeg", legacyUpperLeg),
        ...composerRotationFields(item, "leftLowerLeg", legacyLowerLeg),
        ...composerRotationFields(item, "rightUpperLeg", -legacyUpperLeg),
        ...composerRotationFields(item, "rightLowerLeg", -legacyLowerLeg),
        hipsRotX: finiteNumber(item?.hipsRotX, 0),
        hipsRotY: finiteNumber(item?.hipsRotY, 0),
        hipsRotZ: finiteNumber(item?.hipsRotZ, 0),
        leftHandRotX: finiteNumber(item?.leftHandRotX, legacyHandRotX),
        leftHandRotY: finiteNumber(item?.leftHandRotY, legacyHandRotY),
        leftHandRotZ: finiteNumber(item?.leftHandRotZ, -legacyHandRotZ),
        rightHandRotX: finiteNumber(item?.rightHandRotX, legacyHandRotX),
        rightHandRotY: finiteNumber(item?.rightHandRotY, legacyHandRotY),
        rightHandRotZ: finiteNumber(item?.rightHandRotZ, legacyHandRotZ),
        leftFootRotX: finiteNumber(item?.leftFootRotX, 0),
        leftFootRotY: finiteNumber(item?.leftFootRotY, 0),
        leftFootRotZ: finiteNumber(item?.leftFootRotZ, 0),
        rightFootRotX: finiteNumber(item?.rightFootRotX, 0),
        rightFootRotY: finiteNumber(item?.rightFootRotY, 0),
        rightFootRotZ: finiteNumber(item?.rightFootRotZ, 0),
        headRotX: finiteNumber(item?.headRotX, 0),
        headRotY: finiteNumber(item?.headRotY, 0),
        headRotZ: finiteNumber(item?.headRotZ, 0),
        upperBodyRotX: finiteNumber(item?.upperBodyRotX, 0),
        upperBodyRotY: finiteNumber(item?.upperBodyRotY, 0),
        upperBodyRotZ: finiteNumber(item?.upperBodyRotZ, 0),
        lean: finiteNumber(item?.lean, 0),
        color: String(item?.color || "#b8b8b2")
      };
    }),
    props: propSource.map((item, index) => ({
      id: String(item?.id || `prop-${index + 1}`),
      name: String(item?.name || `${composerPrimitiveLabel(item?.primitive)} ${index + 1}`),
      primitive: normalizeComposerPrimitiveType(item?.primitive || item?.shape),
      x: finiteNumber(item?.x, 1.4),
      y: finiteNumber(item?.y, 0),
      z: finiteNumber(item?.z, -0.4),
      rotX: finiteNumber(item?.rotX, 0),
      rotY: finiteNumber(item?.rotY, finiteNumber(item?.yaw, 0)),
      rotZ: finiteNumber(item?.rotZ, 0),
      scale: finiteNumber(item?.scale, 1),
      width: finiteNumber(item?.width, 0.9),
      height: finiteNumber(item?.height, 0.9),
      depth: finiteNumber(item?.depth, 0.9),
      color: String(item?.color || "#496b8f")
    })),
    imagePlanes: imagePlaneSource.map((item, index) => ({
      id: String(item?.id || `image-plane-${index + 1}`),
      name: String(item?.name || `Image Plane ${index + 1}`),
      imageUrl: String(item?.imageUrl || ""),
      x: finiteNumber(item?.x, 0),
      y: finiteNumber(item?.y, 1.15),
      z: finiteNumber(item?.z, -1.4),
      rotX: finiteNumber(item?.rotX, 0),
      rotY: finiteNumber(item?.rotY, 0),
      rotZ: finiteNumber(item?.rotZ, 0),
      scale: finiteNumber(item?.scale, 1),
      width: finiteNumber(item?.width, 2),
      height: finiteNumber(item?.height, 1.125),
      opacity: finiteNumber(item?.opacity, 1)
    })),
    cameraBookmarks: cameraBookmarkSource.map((item, index) => ({
      id: String(item?.id || `camera-bookmark-${index + 1}`),
      name: String(item?.name || `Cam ${index + 1}`),
      camera: {
        x: finiteNumber(item?.camera?.x, fallback.camera.x),
        y: finiteNumber(item?.camera?.y, fallback.camera.y),
        z: finiteNumber(item?.camera?.z, fallback.camera.z),
        yaw: finiteNumber(item?.camera?.yaw, fallback.camera.yaw),
        pitch: finiteNumber(item?.camera?.pitch, fallback.camera.pitch),
        fov: finiteNumber(item?.camera?.fov, fallback.camera.fov),
        distance: finiteNumber(item?.camera?.distance, fallback.camera.distance),
        targetY: finiteNumber(item?.camera?.targetY, fallback.camera.targetY)
      }
    }))
  };
}

export function composerPoseSnapshot(source = {}) {
  return composerPoseFieldKeys.reduce((snapshot, key) => {
    snapshot[key] = finiteNumber(source?.[key], 0);
    return snapshot;
  }, {});
}

export function normalizeComposerSavedPose(pose, index = 0) {
  if (!pose || typeof pose !== "object") return null;
  const fallbackId = `pose-${index + 1}`;
  const id = String(pose.id || pose.fileName || fallbackId).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96) || fallbackId;
  const name = String(pose.name || `Pose ${index + 1}`).trim() || `Pose ${index + 1}`;
  return {
    id,
    name,
    fileName: String(pose.fileName || ""),
    pose: String(pose.pose || id),
    ...composerPoseSnapshot(pose)
  };
}

export function normalizeComposerSavedPoses(poses = []) {
  if (!Array.isArray(poses)) return [];
  return poses.map((pose, index) => normalizeComposerSavedPose(pose, index)).filter(Boolean);
}

export function mergeComposerSavedPoses(...poseLists) {
  const merged = [];
  const flattened = poseLists.flatMap((list) => (Array.isArray(list) ? list : [list])).filter(Boolean);

  flattened.forEach((pose, index) => {
    const normalized = normalizeComposerSavedPose(pose, index);
    if (!normalized) return;
    const existingIndex = merged.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...normalized
      };
    } else {
      merged.push(normalized);
    }
  });

  return merged;
}

export function composerSavedPosePatch(pose) {
  const normalized = normalizeComposerSavedPose(pose);
  if (!normalized) return {};
  return {
    pose: normalized.id,
    ...composerPoseSnapshot(normalized)
  };
}

export function resolveComposerImagePlaneSources(sceneData, imageSources = []) {
  const data = normalizedComposerScene(sceneData);
  const validSources = imageSources.filter((source) => source?.url);
  if (!validSources.length) return data;

  return {
    ...data,
    imagePlanes: data.imagePlanes.map((plane, index) => {
      const currentSource = validSources.find((source) => source.url === plane.imageUrl);
      const fallbackSource = validSources[index] || validSources[0];
      const source = currentSource || fallbackSource;
      if (!source?.url || plane.imageUrl === source.url) return plane;

      return {
        ...plane,
        imageUrl: source.url,
        name: plane.name || source.label || `Image Plane ${index + 1}`
      };
    })
  };
}

export function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

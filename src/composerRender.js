import { clamp } from "./nodeGeometry.js";
import { GLTFLoader, THREE, cloneSkeleton, degreesToRadians } from "./threeRuntime.js";
import { composerRotationVector, normalizeComposerPrimitiveType, normalizedComposerScene } from "./composerState.js";

const composerMannequinModelPath = "/models/male_mannequin.glb";
const composerMannequinModelScale = 1.45;
const localApiPort = import.meta.env.VITE_API_PORT || "3336";

let composerMannequinAsset = null;
let composerMannequinAssetPromise = null;
let composerMannequinAssetFailed = false;

export function renderComposerViewport(renderer, scene, camera, sceneData, selectedId, options = {}) {
  if (!renderer || !scene || !camera) return;
  const showGrid = options.showGrid !== false;
  const showSelection = options.showSelection !== false;
  const texturePromises = [];
  const assetPromises = [];
  const data = normalizedComposerScene(sceneData);
  disposeComposerScene(scene);
  scene.clear();
  scene.background = new THREE.Color(0x111111);

  camera.fov = data.camera.fov;
  const yaw = degreesToRadians(data.camera.yaw);
  const pitch = degreesToRadians(data.camera.pitch);
  camera.position.set(data.camera.x, data.camera.y, data.camera.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;
  camera.updateProjectionMatrix();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(3, 6, 4);
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.82, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  if (showGrid) {
    const grid = new THREE.GridHelper(12, 24, 0x444444, 0x2a2a2a);
    grid.position.y = 0.004;
    scene.add(grid);
  }

  [
    ...data.imagePlanes.map((plane) => createComposerImagePlane(plane, renderer, scene, camera, { texturePromises })),
    ...data.props.map(createComposerProp),
    ...data.maquettes.map((maquette) => createComposerMaquette(maquette, { assetPromises }))
  ].forEach((object) => {
    scene.add(object);
    if (showSelection && object.userData.id === selectedId) {
      const box = new THREE.Box3().setFromObject(object);
      scene.add(new THREE.Box3Helper(box, 0xf0c83b));
    }
  });

  renderer.render(scene, camera);
  if (options.awaitTextures || options.awaitAssets) {
    return Promise.allSettled([...texturePromises, ...assetPromises]).then(() => {
      if (assetPromises.length) {
        return renderComposerViewport(renderer, scene, camera, sceneData, selectedId, { ...options, awaitAssets: false });
      }
      renderer.render(scene, camera);
    });
  }

  if (assetPromises.length) {
    Promise.allSettled(assetPromises).then(() => {
      renderComposerViewport(renderer, scene, camera, sceneData, selectedId, options);
    });
  }
}

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

function createComposerProp(prop) {
  const group = new THREE.Group();
  group.userData.id = prop.id;
  group.position.set(prop.x, prop.y + (prop.height * prop.scale) / 2, prop.z);
  group.rotation.set(degreesToRadians(prop.rotX), degreesToRadians(prop.rotY), degreesToRadians(prop.rotZ));
  const mesh = new THREE.Mesh(
    createComposerPrimitiveGeometry(prop.primitive),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(prop.color), roughness: 0.74 })
  );
  mesh.scale.set(prop.width * prop.scale, prop.height * prop.scale, prop.depth * prop.scale);
  group.add(mesh);
  return group;
}

function createComposerPrimitiveGeometry(primitive) {
  switch (normalizeComposerPrimitiveType(primitive)) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 18);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 32);
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createComposerImagePlane(plane, renderer, scene, camera, options = {}) {
  const group = new THREE.Group();
  group.userData.id = plane.id;
  group.position.set(plane.x, plane.y, plane.z);
  group.rotation.set(degreesToRadians(plane.rotX), degreesToRadians(plane.rotY), degreesToRadians(plane.rotZ));
  group.scale.setScalar(plane.scale);

  const material = new THREE.MeshBasicMaterial({
    color: plane.imageUrl ? 0xffffff : 0x2b2b2b,
    opacity: clamp(plane.opacity, 0.1, 1),
    transparent: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(plane.width, plane.height), material);
  group.add(mesh);

  if (plane.imageUrl) {
    const texturePromise = new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(
        composerTextureUrl(plane.imageUrl),
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          material.color.set(0xffffff);
          material.map = texture;
          material.needsUpdate = true;
          renderer.render(scene, camera);
          resolve(true);
        },
        undefined,
        () => {
          material.color.set(0x5b4d20);
          renderer.render(scene, camera);
          resolve(false);
        }
      );
    });
    options.texturePromises?.push(texturePromise);
  }

  return group;
}

function composerTextureUrl(url) {
  if (!url || /^(blob:|data:|https?:)/i.test(url)) return url;
  if (typeof window === "undefined") return url;
  if (/^\/(?:uploads|outputs|workflow-assets)\//i.test(url)) {
    const mediaOrigin = ["127.0.0.1", "localhost"].includes(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:${localApiPort}`
      : window.location.origin;
    return `${mediaOrigin}${url}`;
  }
  return new URL(url, window.location.origin).href;
}

function createComposerMaquette(maquette, options = {}) {
  if (composerMannequinAsset?.scene) {
    return createComposerModelMaquette(maquette, composerMannequinAsset);
  }

  if (!composerMannequinAssetFailed) {
    options.assetPromises?.push(loadComposerMannequinAsset());
  }

  return createComposerProceduralMaquette(maquette);
}

function loadComposerMannequinAsset() {
  if (composerMannequinAsset) return Promise.resolve(composerMannequinAsset);
  if (composerMannequinAssetFailed) return Promise.resolve(null);

  if (!composerMannequinAssetPromise) {
    const loader = new GLTFLoader();
    composerMannequinAssetPromise = loader
      .loadAsync(composerMannequinModelPath)
      .then((gltf) => {
        const scene = gltf.scene || gltf.scenes?.[0];
        if (!scene) throw new Error("Mannequin GLB has no scene.");
        scene.updateMatrixWorld(true);
        composerMannequinAsset = { scene };
        return composerMannequinAsset;
      })
      .catch((error) => {
        composerMannequinAssetFailed = true;
        console.warn("Composer mannequin model failed to load.", error);
        return null;
      });
  }

  return composerMannequinAssetPromise;
}

function createComposerModelMaquette(maquette, asset) {
  const group = new THREE.Group();
  group.userData.id = maquette.id;
  applyComposerObjectTransform(group, maquette);

  const poseRoot = new THREE.Group();
  poseRoot.rotation.x = maquette.lean;
  group.add(poseRoot);

  const model = cloneSkeleton(asset.scene);
  model.scale.setScalar(composerMannequinModelScale);
  prepareComposerMannequinClone(model, maquette);
  applyComposerMannequinPose(model, maquette);
  poseRoot.add(model);

  return group;
}

function applyComposerObjectTransform(group, object) {
  group.position.set(object.x, object.y, object.z);
  group.rotation.set(degreesToRadians(object.rotX), degreesToRadians(object.rotY), degreesToRadians(object.rotZ));
  group.scale.setScalar(object.scale);
}

function prepareComposerMannequinClone(model, maquette) {
  const color = new THREE.Color(maquette.color || "#b8b8b2");
  model.traverse((object) => {
    object.frustumCulled = false;
    if (!object.isMesh && !object.isSkinnedMesh) return;

    object.castShadow = true;
    object.receiveShadow = true;
    object.geometry = object.geometry?.clone();
    const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
    const clonedMaterials = materials.map((material) => {
      const clone = material.clone();
      clone.color = color.clone();
      clone.roughness = 0.72;
      clone.metalness = 0.02;
      clone.needsUpdate = true;
      return clone;
    });
    object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
  });
}

function applyComposerMannequinPose(model, maquette) {
  const bones = composerBoneMap(model);
  const upperBody = composerRotationVector(maquette, "upperBodyRot");
  const head = composerRotationVector(maquette, "headRot");
  const leftUpperArm = composerRotationVector(maquette, "leftUpperArm");
  const leftLowerArm = composerRotationVector(maquette, "leftLowerArm");
  const rightUpperArm = composerRotationVector(maquette, "rightUpperArm");
  const rightLowerArm = composerRotationVector(maquette, "rightLowerArm");
  const leftUpperLeg = composerRotationVector(maquette, "leftUpperLeg");
  const leftLowerLeg = composerRotationVector(maquette, "leftLowerLeg");
  const rightUpperLeg = composerRotationVector(maquette, "rightUpperLeg");
  const rightLowerLeg = composerRotationVector(maquette, "rightLowerLeg");
  const hips = composerRotationVector(maquette, "hipsRot");
  const leftHand = composerRotationVector(maquette, "leftHandRot");
  const rightHand = composerRotationVector(maquette, "rightHandRot");
  const leftFoot = composerRotationVector(maquette, "leftFootRot");
  const rightFoot = composerRotationVector(maquette, "rightFootRot");
  const addRotation = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (!bone) return;
    bone.rotation.x += x;
    bone.rotation.y += y;
    bone.rotation.z += z;
  };
  const addDistributedRotation = (names, x = 0, y = 0, z = 0) => {
    const liveBones = names.map((name) => bones.get(name)).filter(Boolean);
    if (!liveBones.length) return;
    liveBones.forEach((bone) => {
      bone.rotation.x += x / liveBones.length;
      bone.rotation.y += y / liveBones.length;
      bone.rotation.z += z / liveBones.length;
    });
  };
  const addFirstRotation = (names, x = 0, y = 0, z = 0) => {
    const boneName = names.find((name) => bones.has(name));
    if (boneName) addRotation(boneName, x, y, z);
  };

  addFirstRotation(["pelvis", "hips"], hips.x, hips.y, hips.z);
  addDistributedRotation(["spine_01", "spine_02", "spine_03", "spine_04", "spine_05"], upperBody.x, upperBody.y, upperBody.z);
  addRotation("head", head.x, head.y, head.z);

  addRotation("upperarm_l", leftUpperArm.x, leftUpperArm.y, leftUpperArm.z);
  addRotation("lowerarm_l", leftLowerArm.x, leftLowerArm.y, leftLowerArm.z);
  addRotation("upperarm_r", rightUpperArm.x, rightUpperArm.y, rightUpperArm.z);
  addRotation("lowerarm_r", rightLowerArm.x, rightLowerArm.y, rightLowerArm.z);
  addRotation("hand_l", leftHand.x, leftHand.y, leftHand.z);
  addRotation("hand_r", rightHand.x, rightHand.y, rightHand.z);

  addRotation("thigh_l", leftUpperLeg.x, leftUpperLeg.y, leftUpperLeg.z);
  addRotation("calf_l", leftLowerLeg.x, leftLowerLeg.y, leftLowerLeg.z);
  addRotation("thigh_r", rightUpperLeg.x, rightUpperLeg.y, rightUpperLeg.z);
  addRotation("calf_r", rightLowerLeg.x, rightLowerLeg.y, rightLowerLeg.z);
  addFirstRotation(["foot_l", "ball_l"], leftFoot.x, leftFoot.y, leftFoot.z);
  addFirstRotation(["foot_r", "ball_r"], rightFoot.x, rightFoot.y, rightFoot.z);

  model.updateMatrixWorld(true);
}

function composerBoneMap(model) {
  const bones = new Map();
  model.traverse((object) => {
    if (object.isBone && object.name) bones.set(object.name, object);
  });
  return bones;
}

function createComposerProceduralMaquette(maquette) {
  const color = new THREE.Color(maquette.color || "#b8b8b2");
  const dark = color.clone().multiplyScalar(0.58);
  const light = color.clone().lerp(new THREE.Color(0xffffff), 0.16);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.02 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.75, metalness: 0.02 });
  const highlightMaterial = new THREE.MeshStandardMaterial({ color: light, roughness: 0.7, metalness: 0.02 });
  const group = new THREE.Group();
  group.userData.id = maquette.id;
  applyComposerObjectTransform(group, maquette);

  const root = new THREE.Group();
  root.rotation.x = maquette.lean;
  root.position.y = 0.02;
  group.add(root);

  const upperBodyRot = composerRotationVector(maquette, "upperBodyRot");
  const headRot = composerRotationVector(maquette, "headRot");
  const leftUpperArm = composerRotationVector(maquette, "leftUpperArm");
  const leftLowerArm = composerRotationVector(maquette, "leftLowerArm");
  const rightUpperArm = composerRotationVector(maquette, "rightUpperArm");
  const rightLowerArm = composerRotationVector(maquette, "rightLowerArm");
  const leftUpperLeg = composerRotationVector(maquette, "leftUpperLeg");
  const leftLowerLeg = composerRotationVector(maquette, "leftLowerLeg");
  const rightUpperLeg = composerRotationVector(maquette, "rightUpperLeg");
  const rightLowerLeg = composerRotationVector(maquette, "rightLowerLeg");
  const hipsRot = composerRotationVector(maquette, "hipsRot");
  const leftHandRot = composerRotationVector(maquette, "leftHandRot");
  const rightHandRot = composerRotationVector(maquette, "rightHandRot");
  const leftFootRot = composerRotationVector(maquette, "leftFootRot");
  const rightFootRot = composerRotationVector(maquette, "rightFootRot");
  const waistY = 1.16;
  const hipY = 1.08;
  const upperBody = new THREE.Group();
  upperBody.position.y = waistY;
  upperBody.rotation.set(upperBodyRot.x, upperBodyRot.y, upperBodyRot.z);
  root.add(upperBody);
  const hips = new THREE.Group();
  hips.position.y = hipY;
  hips.rotation.set(hipsRot.x, hipsRot.y, hipsRot.z);
  root.add(hips);

  addComposerEllipsoid(upperBody, { x: 0, y: 1.8 - waistY, z: 0, sx: 0.52, sy: 0.54, sz: 0.3, material: highlightMaterial });
  addComposerEllipsoid(upperBody, { x: 0, y: 1.46 - waistY, z: 0.01, sx: 0.34, sy: 0.3, sz: 0.24, material });
  addComposerEllipsoid(hips, { x: 0, y: waistY - hipY, z: 0, sx: 0.46, sy: 0.22, sz: 0.28, material });
  addComposerEllipsoid(hips, { x: -0.18, y: 1.18 - hipY, z: -0.02, sx: 0.22, sy: 0.18, sz: 0.23, material });
  addComposerEllipsoid(hips, { x: 0.18, y: 1.18 - hipY, z: -0.02, sx: 0.22, sy: 0.18, sz: 0.23, material });

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 18), jointMaterial);
  neck.position.y = 2.22 - waistY;
  upperBody.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.28 - waistY;
  head.rotation.set(headRot.x, headRot.y, headRot.z);
  upperBody.add(head);

  addComposerEllipsoid(head, { x: 0, y: 0.3, z: -0.01, sx: 0.25, sy: 0.35, sz: 0.22, material });
  addComposerEllipsoid(head, { x: 0, y: 0.3, z: -0.18, sx: 0.17, sy: 0.24, sz: 0.035, material: highlightMaterial });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 14), jointMaterial);
  nose.position.set(0, 0.29, -0.27);
  nose.rotation.x = -Math.PI / 2;
  head.add(nose);

  const shoulderY = 1.98;
  addComposerArm(upperBody, { side: -1, shoulderY: shoulderY - waistY, upper: leftUpperArm.z, lower: leftLowerArm.z, handRotation: leftHandRot, material, jointMaterial });
  addComposerArm(upperBody, { side: 1, shoulderY: shoulderY - waistY, upper: rightUpperArm.z, lower: rightLowerArm.z, handRotation: rightHandRot, material, jointMaterial });
  addComposerLeg(hips, { side: -1, hipY: 0, upper: leftUpperLeg.z, lower: leftLowerLeg.z, footRotation: leftFootRot, material, jointMaterial });
  addComposerLeg(hips, { side: 1, hipY: 0, upper: rightUpperLeg.z, lower: rightLowerLeg.z, footRotation: rightFootRot, material, jointMaterial });

  [
    [-0.24, 0, 0],
    [0.24, 0, 0]
  ].forEach(([x, y, z]) => addComposerEllipsoid(hips, { x, y, z, sx: 0.12, sy: 0.12, sz: 0.12, material: jointMaterial }));
  [
    [-0.55, shoulderY - waistY, 0],
    [0.55, shoulderY - waistY, 0]
  ].forEach(([x, y, z]) => addComposerEllipsoid(upperBody, { x, y, z, sx: 0.12, sy: 0.12, sz: 0.12, material: jointMaterial }));

  return group;
}

function addComposerArm(root, { side, shoulderY, upper, lower, handRotation, material, jointMaterial }) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.55, shoulderY, 0);
  shoulder.rotation.x = upper;
  shoulder.rotation.z = side * 0.18;
  root.add(shoulder);

  addComposerEllipsoid(shoulder, { x: 0, y: 0, z: 0, sx: 0.15, sy: 0.16, sz: 0.14, material });
  addLimb(shoulder, { length: 0.68, radiusTop: 0.105, radiusBottom: 0.085, material });

  const elbow = new THREE.Group();
  elbow.position.y = -0.68;
  elbow.rotation.x = lower;
  shoulder.add(elbow);
  addComposerEllipsoid(elbow, { x: 0, y: 0, z: 0, sx: 0.095, sy: 0.095, sz: 0.095, material: jointMaterial });
  addLimb(elbow, { length: 0.62, radiusTop: 0.085, radiusBottom: 0.058, material });

  const wrist = new THREE.Group();
  wrist.position.y = -0.62;
  wrist.rotation.set(handRotation.x, handRotation.y, handRotation.z);
  elbow.add(wrist);
  addComposerEllipsoid(wrist, { x: 0, y: 0, z: 0, sx: 0.065, sy: 0.06, sz: 0.06, material: jointMaterial });
  addComposerEllipsoid(wrist, { x: 0, y: -0.11, z: -0.01, sx: 0.075, sy: 0.13, sz: 0.04, material });
  addComposerFinger(wrist, { x: -0.036, y: -0.23, z: -0.012, length: 0.12, radius: 0.014, material });
  addComposerFinger(wrist, { x: 0, y: -0.24, z: -0.012, length: 0.13, radius: 0.015, material });
  addComposerFinger(wrist, { x: 0.036, y: -0.23, z: -0.012, length: 0.12, radius: 0.014, material });
  const thumb = addComposerFinger(wrist, { x: side * 0.075, y: -0.1, z: -0.025, length: 0.1, radius: 0.016, material: jointMaterial });
  thumb.rotation.z = side * 0.68;
}

function addComposerLeg(root, { side, hipY, upper, lower, footRotation, material, jointMaterial }) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.24, hipY, 0);
  hip.rotation.x = upper;
  hip.rotation.z = side * 0.05;
  root.add(hip);

  addComposerEllipsoid(hip, { x: 0, y: 0, z: 0, sx: 0.135, sy: 0.12, sz: 0.12, material: jointMaterial });
  addLimb(hip, { length: 0.78, radiusTop: 0.13, radiusBottom: 0.1, material });

  const knee = new THREE.Group();
  knee.position.y = -0.78;
  knee.rotation.x = lower;
  hip.add(knee);
  addComposerEllipsoid(knee, { x: 0, y: 0, z: -0.015, sx: 0.105, sy: 0.085, sz: 0.095, material: jointMaterial });
  addLimb(knee, { length: 0.72, radiusTop: 0.095, radiusBottom: 0.065, material });

  const ankle = new THREE.Group();
  ankle.position.y = -0.72;
  ankle.rotation.set(footRotation?.x || 0, footRotation?.y || 0, footRotation?.z || 0);
  knee.add(ankle);
  addComposerEllipsoid(ankle, { x: 0, y: 0, z: 0, sx: 0.07, sy: 0.055, sz: 0.06, material: jointMaterial });
  const foot = addComposerEllipsoid(ankle, { x: 0, y: -0.075, z: -0.13, sx: 0.12, sy: 0.06, sz: 0.25, material });
  foot.rotation.x = -0.08;
  addComposerEllipsoid(ankle, { x: 0, y: -0.08, z: -0.31, sx: 0.11, sy: 0.045, sz: 0.095, material });
}

function addLimb(root, { length, radiusTop, radiusBottom, material }) {
  const limb = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 18), material);
  limb.position.y = -length / 2;
  root.add(limb);
  return limb;
}

function addComposerEllipsoid(root, { x, y, z, sx, sy, sz, material }) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  root.add(mesh);
  return mesh;
}

function addComposerFinger(root, { x, y, z, length, radius, material }) {
  const finger = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.88, length, 10), material);
  finger.position.set(x, y, z);
  root.add(finger);
  return finger;
}

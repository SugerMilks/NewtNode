import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultFrameItPoseId,
  defaultFrameItFigure,
  frameItApplyPose,
  frameItCameraPointerGesture,
  frameItCaptureSize,
  frameItFigureCompositionSnapshot,
  frameItFigureColors,
  frameItFigurePositionPatch,
  frameItFigureRotation,
  frameItFigureRotationPatch,
  frameItJointPatch,
  frameItJointRange,
  frameItJointRenderRotation,
  frameItJointRotationFromGizmo,
  frameItPosePresets,
  frameItUsesCameraWheel,
  normalizeFrameItGizmoMode,
  normalizeFrameItSavedPoses,
  normalizeFrameItScene
} from "../src/frameItState.js";
import { frameItPresetSnapshots } from "../src/frameItPresetSnapshots.js";

test("Frame It normalizes camera, figures, and joint limits", () => {
  const scene = normalizeFrameItScene({
    camera: { pitch: 100, distance: 99, fov: 2 },
    figures: [{ id: "figure-a", name: "Lead", color: "#ff3366", leftLowerArmX: -80 }]
  });

  assert.equal(scene.camera.pitch, 82);
  assert.equal(scene.camera.distance, 14);
  assert.equal(scene.camera.fov, 18);
  assert.equal(scene.figures[0].id, "figure-a");
  assert.equal(scene.figures[0].name, "Lead");
  assert.equal(scene.figures[0].color, "#ff3366");
  assert.deepEqual(frameItFigureColors.map((color) => color.id), ["gray", "blue", "red", "green", "purple"]);
});

test("Frame It poses reset old joint rotations before applying a preset", () => {
  const figure = defaultFrameItFigure(1);
  figure.headRotY = 45;
  figure.leftUpperArmX = 75;

  const posed = frameItApplyPose(figure, { rightUpperArmZ: 90 });

  assert.equal(posed.headRotY, 0);
  assert.equal(posed.leftUpperArmX, 0);
  assert.equal(posed.rightUpperArmZ, 90);
});

test("Frame It applies biological joint limits and exports native ratios", () => {
  assert.deepEqual(frameItFigurePositionPatch({ x: 20, y: -4, z: -3.25 }), {
    x: 12,
    y: -1.5,
    z: -3.25
  });
  assert.deepEqual(frameItFigureRotation({ rotX: 12, rotY: -45, rotZ: 8 }), {
    x: 12,
    y: -45,
    z: 8
  });
  assert.deepEqual(frameItFigureRotationPatch({ x: 420, y: -90, z: -450 }), {
    rotX: 360,
    rotY: -90,
    rotZ: -360
  });
  assert.deepEqual(frameItJointPatch("leftLowerArm", { x: -90, y: 0, z: 0 }, true), {
    leftLowerArmX: -10,
    leftLowerArmY: 0,
    leftLowerArmZ: 0
  });
  assert.deepEqual(frameItJointPatch("rightLowerLeg", { x: 190, y: 30, z: -30 }, true), {
    rightLowerLegX: 160,
    rightLowerLegY: 15,
    rightLowerLegZ: -15
  });
  assert.deepEqual(frameItJointRange("leftUpperLeg", "x", true), { min: -130, max: 55 });
  assert.deepEqual(frameItJointRange("leftLowerLeg", "x", true), { min: -10, max: 160 });
  assert.deepEqual(frameItJointRange("leftUpperArm", "x", true), { min: -75, max: 190 });
  assert.deepEqual(frameItJointRange("leftUpperArm", "z", true), { min: -55, max: 185 });
  assert.deepEqual(frameItJointRange("rightUpperArm", "z", true), { min: -185, max: 55 });
  assert.deepEqual(frameItJointRange("leftLowerArm", "x", true), { min: -10, max: 160 });
  assert.deepEqual(frameItJointRange("leftLowerArm", "y", true), { min: -90, max: 90 });
  assert.deepEqual(frameItJointRenderRotation("leftUpperArm", { x: 45, y: 12, z: 30 }), { x: -45, y: 12, z: 30 });
  assert.deepEqual(frameItJointRenderRotation("rightLowerArm", { x: 90, y: 0, z: 0 }), { x: -90, y: 0, z: 0 });
  assert.deepEqual(frameItJointRenderRotation("leftLowerLeg", { x: 90, y: 0, z: 0 }), { x: 90, y: 0, z: 0 });
  assert.deepEqual(frameItCaptureSize("16:9"), { width: 1600, height: 900 });
  assert.deepEqual(frameItCaptureSize("9:16"), { width: 900, height: 1600 });
});

test("Frame It presets and saved poses preserve complete compositions", () => {
  assert.equal(defaultFrameItPoseId, "a-pose");
  assert.deepEqual(frameItPosePresets.map((preset) => preset.id), [
    "a-pose",
    "ws",
    "cu",
    "cowboy",
    "ots-ms",
    "ots-cu",
    "2-shot-wide",
    "2-shot-medium",
    "2-shot-close",
    "3-shot-wide",
    "3-shot-medium"
  ]);
  assert.deepEqual(frameItPosePresets.map((preset) => preset.label), [
    "A-Pose",
    "WS",
    "CU",
    "Cowboy",
    "OTS-MS",
    "OTS-CU",
    "2-Shot-Wide",
    "2-Shot-Medium",
    "2-Shot-Close",
    "3-Shot-Wide",
    "3-Shot-Medium"
  ]);
  assert.equal(frameItPosePresets.some((preset) => preset.id.includes("_") || preset.label.includes("_")), false);
  assert.equal(frameItPosePresets.find((preset) => preset.id === "a-pose").scene.figures.length, 1);
  assert.equal(frameItPosePresets.some((preset) => ["t-pose", "mws", "ms"].includes(preset.id)), false);
  assert.equal(frameItPosePresets.find((preset) => preset.id === "ots-ms").scene.figures.length, 2);
  assert.equal(frameItPosePresets.find((preset) => preset.id === "2-shot-close").scene.figures.length, 2);
  assert.equal(frameItPosePresets.find((preset) => preset.id === "3-shot-medium").scene.figures.length, 3);
  assert.deepEqual(
    frameItPosePresets.find((preset) => preset.id === "3-shot-medium").scene.figures.map((figure) => figure.color),
    ["#c76666", "#5f86c9", "#67a57a"]
  );
  Object.entries(frameItPresetSnapshots).forEach(([id, snapshot]) => {
    const preset = frameItPosePresets.find((candidate) => candidate.id === id);
    const expectedScene = {
      ...snapshot.scene,
      figures: snapshot.scene.figures.map((figure, index) => ({
        ...figure,
        name: `Figure ${index + 1}`
      }))
    };
    assert.deepEqual(preset.scene, expectedScene, `${id} must retain its Saved scene with generic figure names`);
    assert.equal(preset.selectedFigureId, snapshot.selectedFigureId);
    assert.equal(preset.aspectRatio, snapshot.aspectRatio);
  });
  assert.equal(
    frameItPosePresets.every((preset) => preset.scene.figures.every((figure, index) => figure.name === `Figure ${index + 1}`)),
    true
  );

  const saved = normalizeFrameItSavedPoses([{
    id: "saved-1",
    name: "Hero frame",
    pose: { headRotY: 18 },
    figurePatch: { x: 2, y: 0.5, z: -1, rotX: 8, rotY: 30, rotZ: -4, scale: 1.2 },
    camera: { yaw: -20, pitch: 8, distance: 4, targetX: 2, targetY: 1.8, targetZ: -1, fov: 42 },
    aspectRatio: "21:9"
  }])[0];

  assert.deepEqual(saved.figurePatch, frameItFigureCompositionSnapshot({ x: 2, y: 0.5, z: -1, rotX: 8, rotY: 30, rotZ: -4, scale: 1.2 }));
  assert.equal(saved.camera.fov, 42);
  assert.equal(saved.aspectRatio, "21:9");

  const composition = normalizeFrameItSavedPoses([{
    id: "saved-cast",
    name: "Two shot",
    selectedFigureId: "figure-b",
    scene: {
      camera: { yaw: 22, pitch: 5, distance: 6, targetY: 1.3, fov: 38 },
      figures: [
        { id: "figure-a", name: "Lead", color: "#5f86c9", x: -0.8, leftUpperArmX: 35 },
        { id: "figure-b", name: "Partner", color: "#c76666", x: 0.8, rightLowerArmX: 70 }
      ]
    },
    aspectRatio: "16:9"
  }])[0];

  assert.equal(composition.scene.figures.length, 2);
  assert.deepEqual(composition.scene.figures.map((figure) => figure.color), ["#5f86c9", "#c76666"]);
  assert.equal(composition.scene.figures[0].leftUpperArmX, 35);
  assert.equal(composition.scene.figures[1].rightLowerArmX, 70);
  assert.equal(composition.scene.camera.yaw, 22);
  assert.equal(composition.selectedFigureId, "figure-b");
});

test("Frame It built-in poses stay within each joint's anatomical range", () => {
  frameItPosePresets.forEach((preset) => {
    Object.entries(preset.pose).forEach(([key, value]) => {
      const match = key.match(/^(.*)([XYZ])$/);
      assert.ok(match, `${preset.id} has an invalid pose key: ${key}`);
      const [, jointId, axisName] = match;
      const { min, max } = frameItJointRange(jointId, axisName.toLowerCase(), true);
      assert.ok(value >= min && value <= max, `${preset.id}.${key} must be between ${min} and ${max}`);
    });
  });
});

test("Frame It reserves modified gestures for its camera and passes ordinary navigation through", () => {
  assert.equal(frameItCameraPointerGesture({ altKey: true }), "orbit");
  assert.equal(frameItCameraPointerGesture({ metaKey: true }), "pan");
  assert.equal(frameItCameraPointerGesture({ ctrlKey: true }), "pan");
  assert.equal(frameItCameraPointerGesture({}), "");
  assert.equal(frameItUsesCameraWheel({ metaKey: true }), true);
  assert.equal(frameItUsesCameraWheel({ altKey: true }), true);
  assert.equal(frameItUsesCameraWheel({ ctrlKey: true }), false);
  assert.equal(frameItUsesCameraWheel({}), false);
});

test("Frame It maps C4D-style gizmo deltas back into logical joint rotations", () => {
  assert.deepEqual(
    frameItJointRotationFromGizmo("headRot", { x: 5, y: -10, z: 2 }, { x: 8, y: 4, z: -3 }, true),
    { headRotX: 13, headRotY: -6, headRotZ: -1 }
  );
  assert.deepEqual(
    frameItJointRotationFromGizmo("leftUpperArm", { x: 20, y: 5, z: 10 }, { x: -15, y: 7, z: 8 }, true),
    { leftUpperArmX: 35, leftUpperArmY: 12, leftUpperArmZ: 18 }
  );
  assert.equal(normalizeFrameItGizmoMode("translate"), "translate");
  assert.equal(normalizeFrameItGizmoMode("figureRotate"), "figureRotate");
  assert.equal(normalizeFrameItGizmoMode("rotate"), "rotate");
  assert.equal(normalizeFrameItGizmoMode("bend"), "rotate");
});

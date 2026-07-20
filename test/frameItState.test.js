import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultFrameItFigure,
  frameItApplyPose,
  frameItCameraPointerGesture,
  frameItCaptureSize,
  frameItFigureCompositionSnapshot,
  frameItFigureColors,
  frameItJointPatch,
  frameItJointRange,
  frameItJointRenderRotation,
  frameItPosePresets,
  frameItUsesCameraWheel,
  normalizeFrameItSavedPoses,
  normalizeFrameItScene
} from "../src/frameItState.js";

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
  assert.deepEqual(frameItJointPatch("leftLowerArm", { x: -90, y: 0, z: 0 }, true), {
    leftLowerArmX: 0,
    leftLowerArmY: 0,
    leftLowerArmZ: 0
  });
  assert.deepEqual(frameItJointPatch("rightLowerLeg", { x: 190, y: 30, z: -30 }, true), {
    rightLowerLegX: 150,
    rightLowerLegY: 8,
    rightLowerLegZ: -8
  });
  assert.deepEqual(frameItJointRange("leftUpperLeg", "x", true), { min: -120, max: 45 });
  assert.deepEqual(frameItJointRange("leftLowerLeg", "x", true), { min: 0, max: 150 });
  assert.deepEqual(frameItJointRange("leftUpperArm", "x", true), { min: -65, max: 180 });
  assert.deepEqual(frameItJointRange("leftUpperArm", "z", true), { min: -45, max: 175 });
  assert.deepEqual(frameItJointRange("rightUpperArm", "z", true), { min: -175, max: 45 });
  assert.deepEqual(frameItJointRenderRotation("leftUpperArm", { x: 45, y: 12, z: 30 }), { x: -45, y: 12, z: 30 });
  assert.deepEqual(frameItJointRenderRotation("rightLowerArm", { x: 90, y: 0, z: 0 }), { x: -90, y: 0, z: 0 });
  assert.deepEqual(frameItJointRenderRotation("leftLowerLeg", { x: 90, y: 0, z: 0 }), { x: 90, y: 0, z: 0 });
  assert.deepEqual(frameItCaptureSize("16:9"), { width: 1600, height: 900 });
  assert.deepEqual(frameItCaptureSize("9:16"), { width: 900, height: 1600 });
});

test("Frame It presets and saved poses preserve complete compositions", () => {
  const seated = frameItPosePresets.find((preset) => preset.id === "seated");
  assert.equal(seated.aspectRatio, "4:3");
  assert.equal(seated.figurePatch.y, 0);
  assert.equal(seated.camera.targetYOffset, 0.92);
  assert.deepEqual(frameItPosePresets.map((preset) => preset.id), ["neutral", "walk", "reach", "seated"]);

  const saved = normalizeFrameItSavedPoses([{
    id: "saved-1",
    name: "Hero frame",
    pose: { headRotY: 18 },
    figurePatch: { x: 2, y: 0.5, z: -1, rotY: 30, scale: 1.2 },
    camera: { yaw: -20, pitch: 8, distance: 4, targetX: 2, targetY: 1.8, targetZ: -1, fov: 42 },
    aspectRatio: "21:9"
  }])[0];

  assert.deepEqual(saved.figurePatch, frameItFigureCompositionSnapshot({ x: 2, y: 0.5, z: -1, rotY: 30, scale: 1.2 }));
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

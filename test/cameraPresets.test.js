import test from "node:test";
import assert from "node:assert/strict";

import {
  lensPresetNames,
  lensPresetPrompts,
  typePresetNames,
  typePresetPrompts
} from "../src/modelOptions.js";

test("Camera node exposes the new lens and type presets", () => {
  assert.equal(lensPresetNames[1], "8mm");
  assert.equal(lensPresetNames.includes("Macro"), false);
  assert.equal(typePresetNames.includes("Macro"), true);
  assert.equal(typePresetNames.includes("Bird's Eye View"), true);
  assert.equal(typePresetNames.includes("Selfie"), true);
});

test("Camera node uses the requested prompt language", () => {
  assert.equal(lensPresetPrompts["8mm"], "Shot on a very wide fisheye 8mm prime lens.");
  assert.equal(
    typePresetPrompts.Macro,
    "Shot on a macro probe lens. Extremely close with very shallow depth of field and extremely detailed textures."
  );
  assert.equal(typePresetPrompts["Extreme High"], "A top view from extremely high angled shot.");
  assert.equal(
    typePresetPrompts["Bird's Eye View"],
    "A TRUE BIRD'S EYE VIEW: THE CAMERA POSITIONED DIRECTLY ABOVE THE SUBJECT, POINTING STRAIGHT DOWN, SO WE LOOK directly DOWN ONTO THE TOP OF the subject AND THE FLOOR FILLS MOST OF THE FRAME. THE SUBJECT IS SEEN FROM DIRECTLY OVERHEAD, FORESHORTENED, ON THE GROUND BELOW."
  );
  assert.equal(
    typePresetPrompts.Selfie,
    "A selfie taken from a mobile device. We do not see the device, only the person/s taking the selfie picture."
  );
});

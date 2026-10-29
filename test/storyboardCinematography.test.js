import test from "node:test";
import assert from "node:assert/strict";
import { storyboardCameraPersonalities, storyboardCameraChoices, normalizeStoryboardCameraPersonality, storyboardCinematographyPlanningPrompt, storyboardCameraRenderingPrompt } from "../src/storyboardCinematography.js";
import { storyboardPlanningSettings, storyboardFrameSchema } from "../src/storyboardWorkflow.js";
import { scriptShotsSchema } from "../src/storyboardScriptImport.js";
import { storyboardShotCameraChoices, validateStoryboardShots, storyboardShotPlanIssues } from "../src/storyboardShotList.js";
import { creativeSchemas } from "../server/creative-llm.js";
import { nodeApi } from "../src/api/newtApi.js";

test("camera personality is separate from story approach, defaults to Expressive and normalizes invalid saved values", () => {
  for (const value of [undefined, null, "invented", "", "toString"]) assert.equal(normalizeStoryboardCameraPersonality(value), "Expressive");
  for (const personality of storyboardCameraPersonalities) {
    assert.equal(storyboardPlanningSettings({ storyboardApproach: "Dialogue", storyboardCameraPersonality: personality }).cameraPersonality, personality);
    assert.equal(storyboardPlanningSettings({ storyboardApproach: "Dialogue", storyboardCameraPersonality: personality }).approach, "Dialogue");
    assert.match(storyboardCinematographyPlanningPrompt(personality), new RegExp(`CAMERA PERSONALITY: ${personality}`));
  }
});

test("all storyboard contracts accept Dutch Angle and preserve authored cameras", () => {
  for (const choices of [storyboardShotCameraChoices.angle, storyboardFrameSchema.properties.angle.enum, scriptShotsSchema.properties.shots.items.properties.angle.enum, creativeSchemas["storyboard-plan"].properties.frames.items.properties.angle.enum]) {
    assert.deepEqual(choices, storyboardCameraChoices.angle);
    assert.ok(choices.includes("Dutch Angle"));
  }
  const shot = { id: "s1", number: 1, description: "A key looms in the near foreground", shot: "CU", lens: "18mm", angle: "Dutch Angle" };
  const shots = validateStoryboardShots([shot]);
  const planned = { ...shot, phase: "single", shotId: "s1" };
  assert.deepEqual(storyboardShotPlanIssues([planned], shots), []);
  for (const patch of [{ angle: "None" }, { shot: "MS" }, { lens: "35mm" }]) assert.ok(storyboardShotPlanIssues([{ ...planned, ...patch }], shots).length);
});

test("cinematography respects story, continuity, revision scope and rendering without requiring effects", () => {
  for (const mode of storyboardCameraPersonalities) {
    const prompt = storyboardCinematographyPlanningPrompt(mode);
    for (const pattern of [/outrank personality/, /Only Auto\/None/, /unless the newest request/, /Do not return extra JSON fields/, /not random angles/, /Dutch roll is not an axis crossing/, /Do not erase a listener/, /Simplify surface detail, not/]) assert.match(prompt, pattern);
  }
  assert.match(storyboardCinematographyPlanningPrompt("Restrained"), /natural perspective and level horizons/);
  assert.match(storyboardCinematographyPlanningPrompt("Bold"), /do not tilt or distort every shot/);
});

test("render directions preserve a chosen shot and only explain optics already selected", () => {
  const frame = { shot: "CU", lens: "18mm", angle: "Dutch Angle", prompt: "The key fills the foreground." };
  const before = structuredClone(frame), prompt = storyboardCameraRenderingPrompt(frame);
  assert.match(prompt, /DUTCH ANGLE: Roll the camera/);
  assert.match(prompt, /Strong foreground enlargement requires a close camera/);
  assert.match(prompt, /Preserve the requested shot size/);
  assert.doesNotMatch(storyboardCameraRenderingPrompt({ lens: "50mm", angle: "None" }), /DUTCH ANGLE:|WIDE LENS:|LONG LENS:/);
  assert.match(storyboardCameraRenderingPrompt({ lens: "120mm" }), /not an automatic request to crop out other required people/);
  assert.deepEqual(frame, before);
});

test("new camera planning, revision, review and PDF builds cannot be billed against an old backend", async t => {
  const original = globalThis.fetch, posts = []; let supported = false;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "POST") posts.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify(String(url).endsWith("/api/health") ? { routes: { storyboardShotList: true, storyboardScriptImport: true, storyboardCinematography: supported } } : { plan: {}, draft: {}, review: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const body = { storyboardApproach: "Shot List", storyboardCameraPersonality: "Bold" };
  const requests = [() => nodeApi.planStoryboard(body), () => nodeApi.reviseStoryboard(body), () => nodeApi.reviewStoryboardSequence(body), () => nodeApi.storyboardScript("build", body)];
  for (const request of requests) await assert.rejects(request(), /Restart NewtNode/);
  assert.equal(posts.length, 0);
  supported = true;
  for (const request of requests) await request();
  assert.equal(posts.length, 4);
  assert.ok(posts.every(post => post.body.storyboardCameraPersonality === "Bold"));
});

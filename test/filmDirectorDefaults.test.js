import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as scenes from "../src/filmDirectorScenes.js";
import { runSkillDirectorNode } from "../src/nodeRunners/skillDirector.js";
import { filmDirectorVideoDuration, filmDirectorVideoResolution, filmDirectorVideoAspectRatio, filmDirectorVideoGenerateAudio } from "../src/nodeRunners/videoModels.js";

const expected = {
  skillApproach: "cinematic",
  skillDurationSeconds: "30",
  skillVideoModel: "Seedance 2.5",
  skillResolution: "1080p",
  skillAspectRatio: "21:9",
  skillShotCount: "Auto",
  skillDirectorAudioMode: "production"
};

function assertSetup(data) {
  for (const [key, value] of Object.entries(expected)) assert.equal(data[key], value, key);
}

// Exercise the real node factory without mounting or modifying a user's project.
const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const start = editor.indexOf("function createDefaultNodeData(");
const end = editor.indexOf("\nfunction ", start + 1);
assert.ok(start >= 0 && end > start);
const createNodeData = new Function(...Object.keys(scenes), `${editor.slice(start, end)}\nreturn createDefaultNodeData;`)(...Object.values(scenes));

test("new Director nodes use the requested setup in both node data and the first scene", () => {
  assert.deepEqual(scenes.filmDirectorNewSceneSetup, expected);
  const data = createNodeData("skillDirector", "Director", 1);
  assert.equal(data.sceneName, "Scene 1");
  assertSetup(data);
  assertSetup(data.skillDirectorScenes[0].state);
  assert.equal(data.skillDirectorScenes[0].state.shotCount, "Auto");
  assert.equal(data.skillDirectorScenes[0].state.durationSeconds, "30");
  assert.ok(Object.values(data.skillDirectorLocks).every((locked) => locked === false));
  assert.equal(data.resultText, "");
});

test("added scene tabs use the same setup without changing the prior scene", () => {
  const original = { sceneName: "Existing", skillApproach: "vintage", skillShotCount: "2", skillDurationSeconds: "8", skillVideoModel: "Kling O3 Pro", skillResolution: "720p", skillAspectRatio: "9:16", skillDirectorAudioMode: "silent", resultText: "Saved direction" };
  const added = scenes.addFilmDirectorScene(original);
  assertSetup(added);
  assert.equal(added.sceneName, "Scene 2");
  const restored = scenes.switchFilmDirectorScene(added, "scene-1");
  for (const [key, value] of Object.entries(original)) assert.equal(restored[key], value, key);
  const restoredNewScene = scenes.switchFilmDirectorScene({ ...added, ...restored }, added.skillDirectorActiveSceneId);
  assertSetup(restoredNewScene);
});

test("legacy scenes keep their original fallback settings instead of acquiring new defaults", () => {
  const legacy = scenes.filmDirectorSceneSnapshot({ sceneName: "Old scene" });
  assert.equal(legacy.skillShotCount, "3");
  assert.equal(legacy.skillDurationSeconds, "15");
  assert.equal(legacy.skillVideoModel, "");
  assert.equal(legacy.skillResolution, "720p");
  assert.equal(legacy.skillAspectRatio, "16:9");
});

test("new defaults reach Director requests and map to the connected Seedance video settings", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ text: "Draft" }), { headers: { "content-type": "application/json" } });
  });
  await runSkillDirectorNode({ node: { id: "director", data: { ...createNodeData("skillDirector", "Director", 1), skillDirectorAction: "style" } }, incoming: {}, sourceLabel: () => "Asset" });
  assert.deepEqual(Object.fromEntries(["approach", "durationSeconds", "videoModel", "resolution", "aspectRatio", "shotCount", "audioMode"].map((key) => [key, request[key]])), {
    approach: "cinematic", durationSeconds: "30", videoModel: "Seedance 2.5", resolution: "1080p", aspectRatio: "21:9", shotCount: "Auto", audioMode: "production"
  });
  assert.equal(filmDirectorVideoDuration(request.videoModel, request.durationSeconds), "30 seconds");
  assert.equal(filmDirectorVideoResolution(request.videoModel, request.resolution), "1080p");
  assert.match(filmDirectorVideoAspectRatio(request.videoModel, request.aspectRatio), /^21:9/);
  assert.equal(filmDirectorVideoGenerateAudio(request.audioMode), true);
});

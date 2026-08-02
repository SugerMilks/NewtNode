import assert from "node:assert/strict";
import test from "node:test";
import {
  addFilmDirectorScene,
  filmDirectorReferencedTags,
  filmDirectorSceneTabs,
  filmDirectorUsesReferenceTag,
  removeFilmDirectorScene,
  switchFilmDirectorScene
} from "../src/filmDirectorScenes.js";

test("Film Director scene tabs preserve independent scene packages", () => {
  const firstScene = {
    sceneName: "Opening",
    sceneOverview: "@Kim enters @Kitchen.",
    text: "@Kim enters @Kitchen.",
    shotList: "CUT 1 — @Kim enters.",
    resultText: "Opening final prompt",
    skillDirectorBuilt: true
  };
  const secondScene = addFilmDirectorScene(firstScene);

  assert.equal(secondScene.sceneName, "Scene 2");
  assert.equal(secondScene.skillDirectorBuilt, false);
  assert.equal(secondScene.skillDirectorScenes[0].state.resultText, "Opening final prompt");

  const editedSecondScene = {
    ...firstScene,
    ...secondScene,
    sceneName: "Hallway",
    sceneOverview: "@Steve crosses @Hallway.",
    text: "@Steve crosses @Hallway.",
    shotList: "CUT 1 — @Steve crosses.",
    resultText: "Hallway final prompt",
    skillDirectorBuilt: true
  };
  const restoredFirstScene = switchFilmDirectorScene(editedSecondScene, "scene-1");
  assert.equal(restoredFirstScene.sceneName, "Opening");
  assert.equal(restoredFirstScene.resultText, "Opening final prompt");

  const restoredSecondScene = switchFilmDirectorScene(
    { ...editedSecondScene, ...restoredFirstScene },
    secondScene.skillDirectorActiveSceneId
  );
  assert.equal(restoredSecondScene.sceneName, "Hallway");
  assert.equal(restoredSecondScene.resultText, "Hallway final prompt");
});

test("Film Director scene tabs remove a scene and restore an adjacent scene", () => {
  const secondScene = addFilmDirectorScene({ sceneName: "Scene 1" });
  const removed = removeFilmDirectorScene(secondScene, secondScene.skillDirectorActiveSceneId);
  const tabs = filmDirectorSceneTabs({ ...secondScene, ...removed });

  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].active, true);
  assert.equal(tabs[0].label, "Scene 1");
});

test("Film Director only activates exact tags referenced by the current scene", () => {
  const data = {
    sceneOverview: "@Kim meets @KitchenTable.",
    motionDirection: "Track with @Kim.",
    skillDirectorRevisionNotes: "Add @CoffeeCup to CUT 2."
  };
  assert.deepEqual([...filmDirectorReferencedTags(data)].sort(), ["coffeecup", "kim", "kitchentable"]);
  assert.equal(filmDirectorUsesReferenceTag(data, "@Kim"), true);
  assert.equal(filmDirectorUsesReferenceTag(data, "@CoffeeCup"), true);
  assert.equal(filmDirectorUsesReferenceTag(data, "@Kitchen"), false);
  assert.equal(filmDirectorUsesReferenceTag(data, "@Steve"), false);
});

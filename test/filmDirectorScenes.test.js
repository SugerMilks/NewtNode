import assert from "node:assert/strict";
import test from "node:test";
import {
  addFilmDirectorScene,
  filterFilmDirectorReferencesForOutput,
  filmDirectorOutputUsesReferenceTag,
  filmDirectorReferencedTags,
  filmDirectorSceneTabs,
  filmDirectorUsesReference,
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
    skillResolution: "1080p",
    skillAspectRatio: "9:16",
    lastRunReferenceTags: ["@Kim", "@Kitchen"],
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
  assert.equal(restoredFirstScene.skillResolution, "1080p");
  assert.equal(restoredFirstScene.skillAspectRatio, "9:16");
  assert.deepEqual(restoredFirstScene.lastRunReferenceTags, ["@Kim", "@Kitchen"]);

  const restoredSecondScene = switchFilmDirectorScene(
    { ...editedSecondScene, ...restoredFirstScene },
    secondScene.skillDirectorActiveSceneId
  );
  assert.equal(restoredSecondScene.sceneName, "Hallway");
  assert.equal(restoredSecondScene.resultText, "Hallway final prompt");
});

test("Film Director recognizes plain asset names and a lone role-based character", () => {
  const data = {
    sceneOverview: "The CEO leaves the office and enters the building.",
    shotList: "CUT 1 — Follow her through the office doorway."
  };

  assert.equal(filmDirectorUsesReference(data, {
    tag: "@Office",
    label: "Office",
    type: "location",
    categoryCount: 2
  }), true);
  assert.equal(filmDirectorUsesReference(data, {
    tag: "@Building",
    label: "Building",
    type: "location",
    categoryCount: 2
  }), true);
  assert.equal(filmDirectorUsesReference(data, {
    tag: "@Patient",
    label: "Patient",
    type: "character",
    categoryCount: 1
  }), true);
  assert.equal(filmDirectorUsesReference(data, {
    tag: "@Lobby",
    label: "Lobby",
    type: "location",
    categoryCount: 2
  }), false);
});

test("Film Director saved scene manifests remain authoritative after prose formatting changes", () => {
  const data = {
    resultText: "A finished prompt without visible reference tags.",
    lastRunReferenceTags: ["@Kim", "@Kitchen"]
  };

  assert.equal(filmDirectorUsesReference(data, { tag: "@Kim", type: "character", categoryCount: 2 }), true);
  assert.equal(filmDirectorUsesReference(data, { tag: "@Kitchen", type: "location", categoryCount: 2 }), true);
  assert.equal(filmDirectorUsesReference(data, { tag: "@Steve", type: "character", categoryCount: 2 }), false);
});

test("Film Director video output only includes assets tagged in the finished prompt", () => {
  const data = {
    sceneOverview: "@Kim meets @Steve in @Kitchen.",
    skillDirectorRevisionNotes: "Remove @Steve and @Kitchen.",
    lastRunReferenceTags: ["@Kim", "@Steve", "@Kitchen"],
    resultText: "@Kim = Lead character.\n\nCUT 1 — @Kim crosses the empty room."
  };
  const references = [
    { tag: "@Kim", url: "/outputs/kim.png" },
    { tag: "@Steve", url: "/outputs/steve.png" },
    { tag: "@Kitchen", url: "/outputs/kitchen.png" }
  ];

  assert.equal(filmDirectorOutputUsesReferenceTag(data, "@Kim"), true);
  assert.equal(filmDirectorOutputUsesReferenceTag(data, "@Steve"), false);
  assert.equal(filmDirectorOutputUsesReferenceTag(data, "@Kitchen"), false);
  assert.deepEqual(filterFilmDirectorReferencesForOutput(references, data), [references[0]]);
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

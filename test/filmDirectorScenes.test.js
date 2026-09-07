import assert from "node:assert/strict";
import test from "node:test";
import {
  addFilmDirectorScene,
  filterFilmDirectorReferencesForOutput,
  filmDirectorCameraInstruction,
  filmDirectorExtendInstruction,
  filmDirectorOutputUsesReferenceTag,
  filmDirectorReferenceVideoMode,
  filmDirectorReferenceVideoCacheKey,
  filmDirectorReferenceInstruction,
  filmDirectorReferencedTags,
  filmDirectorSceneTabs,
  filmDirectorSetupInputIsLocked,
  filmDirectorUsesReference,
  filmDirectorUsesReferenceTag,
  isFilmDirectorSceneTransitionPatch,
  normalizeFilmDirectorReferenceVideoOptions,
  normalizeFilmDirectorReferenceVideoBlueprint,
  removeFilmDirectorScene,
  selectFilmDirectorReferenceVideoMode,
  switchFilmDirectorScene
} from "../src/filmDirectorScenes.js";

test("Director locks every Scene Setup asset input", () => {
  const locked = { setup: true };
  assert.equal(filmDirectorSetupInputIsLocked(locked, "characterIn"), true);
  assert.equal(filmDirectorSetupInputIsLocked(locked, "locationIn"), true);
  assert.equal(filmDirectorSetupInputIsLocked(locked, "imageIn"), true);
  assert.equal(filmDirectorSetupInputIsLocked(locked, "styleIn"), true);
  assert.equal(filmDirectorSetupInputIsLocked(locked, "referenceVideoIn"), true);
  assert.equal(filmDirectorSetupInputIsLocked({ setup: false }, "characterIn"), false);
});

test("Director reference video options normalize and remain scene-specific", () => {
  assert.deepEqual(normalizeFilmDirectorReferenceVideoOptions(), {
    extend: false,
    camera: false,
    reference: false
  });

  const firstScene = {
    sceneName: "Opening",
    skillDirectorReferenceVideoOptions: { extend: true, camera: true }
  };
  const secondScene = addFilmDirectorScene(firstScene);
  assert.deepEqual(secondScene.skillDirectorReferenceVideoOptions, {
    extend: false,
    camera: false,
    reference: false
  });

  const restoredFirstScene = switchFilmDirectorScene(secondScene, "scene-1");
  assert.deepEqual(restoredFirstScene.skillDirectorReferenceVideoOptions, {
    extend: true,
    camera: false,
    reference: false
  });
});

test("Director reference video modes are mutually exclusive", () => {
  assert.deepEqual(normalizeFilmDirectorReferenceVideoOptions({ extend: true, camera: true }), {
    extend: true,
    camera: false,
    reference: false
  });
  const camera = selectFilmDirectorReferenceVideoMode({ extend: true }, "camera", true);
  assert.deepEqual(camera, { extend: false, camera: true, reference: false });
  assert.equal(filmDirectorReferenceVideoMode(camera), "camera");
  assert.deepEqual(selectFilmDirectorReferenceVideoMode(camera, "camera", false), {
    extend: false,
    camera: false,
    reference: false
  });
});

test("Director Extend begins from the reference video's ending without replaying it", () => {
  assert.match(filmDirectorExtendInstruction, /exact final visual and temporal state/i);
  assert.match(filmDirectorExtendInstruction, /Do not restart, recap, reinterpret, or recreate/i);
  assert.match(filmDirectorExtendInstruction, /additional shots below/i);
});

test("Director Camera transfers only camera choreography and edit timing", () => {
  assert.match(filmDirectorCameraInstruction, /solely as the authoritative camera and editing blueprint/i);
  assert.match(filmDirectorCameraInstruction, /shot boundaries, shot order, framing progression/i);
  assert.match(filmDirectorCameraInstruction, /Do not copy or introduce people, wardrobe, objects, setting/i);
  assert.equal(filmDirectorReferenceVideoCacheKey("camera", "/outputs/reference.mp4"), "camera:/outputs/reference.mp4");
});

test("Director Reference re-stages performance while replacing source visual identity", () => {
  assert.match(filmDirectorReferenceInstruction, /temporal performance, blocking, camera, composition, edit, and sound-timing blueprint/i);
  assert.match(filmDirectorReferenceInstruction, /body movement, gestures, expressions, eyelines, interactions/i);
  assert.match(filmDirectorReferenceInstruction, /Replace every source-video identity and visual appearance/i);
  assert.match(filmDirectorReferenceInstruction, /Style Direction is authoritative/i);
  assert.match(filmDirectorReferenceInstruction, /preserve its speech timing and natural performance cadence/i);
  assert.equal(filmDirectorReferenceVideoCacheKey("reference", "/outputs/performance.mp4"), "reference:/outputs/performance.mp4");
});

test("Director Camera blueprints normalize persisted timing and shot metadata", () => {
  assert.deepEqual(normalizeFilmDirectorReferenceVideoBlueprint({
    mode: "camera",
    sourceDurationSeconds: 12.44,
    durationSeconds: "12",
    shotCount: 3,
    cutTimes: [8.1, 3.2, 3.2, -1, 20],
    shots: [
      { startSeconds: 0, endSeconds: 3.2, durationSeconds: 3.2, description: "WS; static" },
      { startSeconds: 3.2, endSeconds: 8.1, durationSeconds: 4.9, description: "CU; dolly in" },
      { startSeconds: 8.1, endSeconds: 12.44, durationSeconds: 4.34, description: "MS; pan right" }
    ]
  }), {
    mode: "camera",
    sourceDurationSeconds: 12.44,
    durationSeconds: "12",
    shotCount: 3,
    cutTimes: [3.2, 8.1],
    shots: [
      { number: 1, startSeconds: 0, endSeconds: 3.2, durationSeconds: 3.2, description: "WS; static" },
      { number: 2, startSeconds: 3.2, endSeconds: 8.1, durationSeconds: 4.9, description: "CU; dolly in" },
      { number: 3, startSeconds: 8.1, endSeconds: 12.44, durationSeconds: 4.34, description: "MS; pan right" }
    ],
    audioDetected: false,
    audioTranscript: "",
    audioSummary: ""
  });
});

test("Director Reference blueprints preserve audio and performance context", () => {
  const blueprint = normalizeFilmDirectorReferenceVideoBlueprint({
    mode: "reference",
    sourceDurationSeconds: 8.2,
    durationSeconds: "8",
    shotCount: 2,
    cutTimes: [4.1],
    shots: [
      { startSeconds: 0, endSeconds: 4.1, durationSeconds: 4.1, description: "Performer A crosses and sits" },
      { startSeconds: 4.1, endSeconds: 8.2, durationSeconds: 4.1, description: "Performer A speaks, then pauses" }
    ],
    audioDetected: true,
    audioTranscript: "[4.50-6.00s] Hello there.",
    audioSummary: "One spoken line followed by a pause."
  });

  assert.equal(blueprint.mode, "reference");
  assert.equal(blueprint.shotCount, 2);
  assert.equal(blueprint.audioDetected, true);
  assert.match(blueprint.audioTranscript, /Hello there/);
  assert.match(blueprint.shots[1].description, /speaks, then pauses/);
});

test("Film Director scene transitions preserve existing output connections", () => {
  const nextScene = addFilmDirectorScene({ sceneName: "Scene 1", skillDirectorBuilt: true, resultText: "CUT 1" });

  assert.equal(isFilmDirectorSceneTransitionPatch(nextScene), true);
  assert.equal(isFilmDirectorSceneTransitionPatch({ skillDirectorBuilt: false, resultText: "" }), false);
});

test("Film Director scene tabs preserve independent scene packages", () => {
  const firstScene = {
    sceneName: "Opening",
    sceneOverview: "@Kim enters @Kitchen.",
    text: "@Kim enters @Kitchen.",
    shotList: "CUT 1 — @Kim enters.",
    resultText: "Opening final prompt",
    skillVideoModel: "Kling O3 Pro",
    skillResolution: "1080p",
    skillAspectRatio: "9:16",
    skillDirectorAudioMode: "full",
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
  assert.equal(restoredFirstScene.skillVideoModel, "Kling O3 Pro");
  assert.equal(restoredFirstScene.skillResolution, "1080p");
  assert.equal(restoredFirstScene.skillAspectRatio, "9:16");
  assert.equal(restoredFirstScene.skillDirectorAudioMode, "full");
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

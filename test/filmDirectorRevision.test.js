import assert from "node:assert/strict";
import test from "node:test";
import {
  appendFilmDirectorRevisionHistory,
  appendFilmDirectorRevisionVersionHistory,
  buildFilmDirectorRevisionPrompt,
  filmDirectorRevisionActiveReferenceTags,
  filmDirectorRevisionStatePatch,
  updateFilmDirectorRevisionVersionSnapshot
} from "../src/filmDirectorRevision.js";

test("Film Director revision prompts preserve the package while prioritizing user notes", () => {
  const prompt = buildFilmDirectorRevisionPrompt({
    revisionNotes: "Remove the dialogue from CUT 2 and make CUT 3 a wide shot.",
    durationLabel: "15-second",
    durationSeconds: "15",
    videoModel: "Kling O3 Pro",
    resolution: "1080p",
    aspectRatio: "21:9",
    audioMode: "silent",
    currentCutCount: 3,
    sceneName: "Coffee Shop",
    referenceSetup: "@Kim = Character reference.",
    shotList: "CUT 1 — shot frame: MS; camera movement: Static; shot type: Coverage:\n@Kim enters.",
    finalPrompt: "Existing final output.",
    shotLogic: "Keep adjacent coverage editorially distinct."
  });

  assert.match(prompt, /USER REVISION NOTES:\nRemove the dialogue from CUT 2/);
  assert.match(prompt, /Preserve the current 3 CUT sections unless the user explicitly asks/);
  assert.match(prompt, /Keep every still-active connected @tag exactly as written/);
  assert.match(prompt, /activeReferenceTags/);
  assert.match(prompt, /Current final output:\nExisting final output/);
  assert.match(prompt, /each shot must carry more of the scene/i);
  assert.match(prompt, /removing or adding a shot must update recommendedShotCount/i);
  assert.match(prompt, /tighter framing or camera movement must update both cameraDirection/i);
  assert.match(prompt, /"sceneName":"complete revised scene name"/);
  assert.match(prompt, /"durationSeconds":"15"/);
  assert.match(prompt, /"videoModel":"Seedance 2\.5"/);
  assert.match(prompt, /"resolution":"720p"/);
  assert.match(prompt, /"aspectRatio":"16:9"/);
  assert.match(prompt, /"audioMode":"production"/);
  assert.match(prompt, /Current resolution:\n1080p/);
  assert.match(prompt, /Current video model:\nKling O3 Pro/);
  assert.match(prompt, /Current aspect ratio:\n21:9/);
  assert.match(prompt, /Current audio mode:\nsilent/);
});

test("Film Director revisions remove inactive reference tags from the authoritative manifest", () => {
  const tags = filmDirectorRevisionActiveReferenceTags(
    { activeReferenceTags: ["@Kim", "@Kitchen"] },
    ["@Kim", "@Steve", "@Kitchen", "@CoffeeCup"],
    "@Steve and @CoffeeCup appear only in stale prose."
  );

  assert.deepEqual(tags, ["@Kim", "@Kitchen"]);
});

test("Film Director revisions infer active tags when an older response omits the manifest", () => {
  const tags = filmDirectorRevisionActiveReferenceTags(
    {},
    ["@Kim", "@Steve", "@Kitchen"],
    "@Kim crosses @Kitchen."
  );

  assert.deepEqual(tags, ["@Kim", "@Kitchen"]);
});

test("Film Director revisions can explicitly remove every connected reference", () => {
  const tags = filmDirectorRevisionActiveReferenceTags(
    { activeReferenceTags: [] },
    ["@Kim", "@Kitchen"],
    "Old text still contains @Kim and @Kitchen."
  );

  assert.deepEqual(tags, []);
});

test("single-shot Film Director revisions preserve a fully directed sustained take", () => {
  const prompt = buildFilmDirectorRevisionPrompt({
    revisionNotes: "Make the ending performance more restrained.",
    durationLabel: "15-second",
    durationSeconds: "15",
    currentCutCount: 1,
    shotList: "CUT 1 — shot frame: MS; camera movement: Slow push; shot type: Master:\n@Kim crosses the room."
  });

  assert.match(prompt, /sustained master take that carries the complete scene/i);
  assert.match(prompt, /opening composition and spatial geography/i);
  assert.doesNotMatch(prompt, /description":"one concise playable shot under 30 words"/i);
});

test("Film Director revision history stays bounded and ignores empty notes", () => {
  const history = Array.from({ length: 8 }, (_value, index) => ({ notes: `Note ${index + 1}` }));
  const next = appendFilmDirectorRevisionHistory(history, { notes: "Latest note", summary: "Adjusted CUT 2." });
  assert.equal(next.length, 8);
  assert.equal(next.at(-1).notes, "Latest note");
  assert.equal(next.at(-1).summary, "Adjusted CUT 2.");
  assert.deepEqual(appendFilmDirectorRevisionHistory(next, { notes: "" }), next);
});

test("Film Director revision state updates every dependent node section atomically", () => {
  const patch = filmDirectorRevisionStatePatch(
    {
      sceneName: "Old Scene",
      skillDurationSeconds: "15",
      skillVideoModel: "Seedance 2.0",
      skillResolution: "1080p",
      skillAspectRatio: "16:9",
      skillDirectorAudioMode: "production",
      skillShotCount: "6",
      styleDirection: "Old style",
      motionDirection: "Old camera",
      sceneOverview: "Old overview",
      shotList: "Old cuts",
      shotListNotes: "Old continuity",
      resultText: "Old final prompt"
    },
    {
      sceneName: "New Scene",
      durationSeconds: "10",
      videoModel: "MiniMax H3",
      resolution: "4K",
      aspectRatio: "9:16",
      audioMode: "silent",
      resolvedShotCount: 4,
      styleDirection: "New style",
      motionDirection: "New camera",
      sceneOverview: "New overview",
      shotList: "New cuts",
      shotListNotes: "New continuity",
      text: "New final prompt"
    }
  );

  assert.equal(patch.sceneName, "New Scene");
  assert.equal(patch.skillDurationSeconds, "10");
  assert.equal(patch.skillVideoModel, "MiniMax H3");
  assert.equal(patch.skillResolution, "4K");
  assert.equal(patch.skillAspectRatio, "9:16");
  assert.equal(patch.skillDirectorAudioMode, "silent");
  assert.equal(patch.skillShotCount, "4");
  assert.equal(patch.shotCount, "4");
  assert.equal(patch.styleDirection, "New style");
  assert.equal(patch.motionDirection, "New camera");
  assert.equal(patch.motionBrief, "New camera");
  assert.equal(patch.sceneOverview, "New overview");
  assert.equal(patch.text, "New overview");
  assert.equal(patch.shotList, "New cuts");
  assert.equal(patch.shotListNotes, "New continuity");
  assert.equal(patch.resultText, "New final prompt");
  assert.deepEqual(patch.skillDirectorLocks, { setup: true, style: true, motion: true, scene: true, shotList: true });
  assert.equal(patch.skillDirectorBuilt, true);
});

test("Film Director revisions preserve newly supported intermediate durations", () => {
  const patch = filmDirectorRevisionStatePatch(
    { skillDurationSeconds: "15" },
    { durationSeconds: "7" }
  );

  assert.equal(patch.skillDurationSeconds, "7");
  assert.equal(patch.durationSeconds, "7");
});

test("Film Director version history preserves the original and complete revision snapshots", () => {
  const original = {
    sceneName: "Original Scene",
    skillShotCount: "3",
    styleDirection: "Original style",
    motionDirection: "Original camera",
    sceneOverview: "Original overview",
    shotList: "Original cuts",
    resultText: "Original prompt",
    skillDirectorLocks: { setup: true, style: true, motion: true, scene: true, shotList: true }
  };
  const revised = {
    ...original,
    skillShotCount: "2",
    styleDirection: "Revised style",
    shotList: "Revised cuts",
    resultText: "Revised prompt"
  };
  const versioned = appendFilmDirectorRevisionVersionHistory([], {
    current: original,
    revised,
    notes: "Remove a shot and change the style.",
    summary: "Reduced the scene to two shots.",
    createdAt: "2026-08-02T12:00:00.000Z"
  });

  assert.equal(versioned.history.length, 2);
  assert.equal(versioned.history[0].label, "Original Setup");
  assert.equal(versioned.history[0].snapshot.resultText, "Original prompt");
  assert.equal(versioned.history[1].label, "Revision 1");
  assert.equal(versioned.history[1].snapshot.skillShotCount, "2");
  assert.equal(versioned.history[1].snapshot.styleDirection, "Revised style");
  assert.equal(versioned.selectedId, versioned.history[1].id);
});

test("switching Film Director history versions preserves manual edits to the current version", () => {
  const first = appendFilmDirectorRevisionVersionHistory([], {
    current: { resultText: "Original prompt" },
    revised: { resultText: "Revision prompt" },
    notes: "First revision",
    createdAt: "2026-08-02T12:00:00.000Z"
  });
  const updated = updateFilmDirectorRevisionVersionSnapshot(
    first.history,
    first.selectedId,
    { resultText: "Manually edited revision prompt" }
  );

  assert.equal(updated[1].snapshot.resultText, "Manually edited revision prompt");
  assert.equal(updated[0].snapshot.resultText, "Original prompt");
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFilmDirectorReferenceChanges,
  clearFilmDirectorStageStale,
  filmDirectorInputSourceSignature,
  filmDirectorSetupInputChanges,
  filmDirectorSetupManifestChanges,
  filmDirectorShotListDraftsForRequest,
  filmDirectorShotListSourceSignature,
  filmDirectorStageDraftForRequest,
  filmDirectorStageNeedsDraft,
  markFilmDirectorStagesStale,
  unlockFilmDirectorStages,
  updateFilmDirectorStageLock
} from "../src/filmDirectorStageLocks.js";

const allLocked = { setup: true, style: true, motion: true, scene: true, shotList: true };

test("unlocking an earlier Film Director section preserves every other lock", () => {
  assert.deepEqual(updateFilmDirectorStageLock(allLocked, "setup", false), {
    setup: false,
    style: true,
    motion: true,
    scene: true,
    shotList: true
  });
  assert.deepEqual(updateFilmDirectorStageLock(allLocked, "style", false), {
    setup: true,
    style: false,
    motion: true,
    scene: true,
    shotList: true
  });
});

test("locking an existing Film Director section does not request another generation", () => {
  const currentShotListSource = { sceneOverview: "Current overview." };
  assert.equal(filmDirectorStageNeedsDraft("style", { styleDirection: "Existing visual direction." }), false);
  assert.equal(filmDirectorStageNeedsDraft("shotList", {
    ...currentShotListSource,
    shotList: "CUT 1 — shot frame: WS",
    skillDirectorShotListSourceSignature: filmDirectorShotListSourceSignature(currentShotListSource)
  }), false);
});

test("Film Director only generates a section when its draft is missing", () => {
  assert.equal(filmDirectorStageNeedsDraft("style", { styleDirection: "" }), true);
  assert.equal(filmDirectorStageNeedsDraft("shotList", { shotList: "" }), true);
});

test("Film Director changes unlock only sections with a known dependency", () => {
  assert.deepEqual(unlockFilmDirectorStages(allLocked, ["shotList"]), {
    setup: true,
    style: true,
    motion: true,
    scene: true,
    shotList: false
  });
  assert.deepEqual(unlockFilmDirectorStages(allLocked, []), allLocked);
});

test("Film Director keeps a dependent draft visible but regenerates it when its source changes", () => {
  const staleStages = markFilmDirectorStagesStale({}, ["shotList"]);
  const currentShotListSource = { sceneOverview: "Current overview." };

  assert.deepEqual(staleStages, { shotList: true });
  assert.equal(filmDirectorStageNeedsDraft("shotList", {
    shotList: "CUT 1 — existing draft",
    skillDirectorStaleStages: staleStages
  }), true);
  assert.equal(filmDirectorStageNeedsDraft("shotList", {
    ...currentShotListSource,
    shotList: "CUT 1 — refreshed draft",
    skillDirectorShotListSourceSignature: filmDirectorShotListSourceSignature(currentShotListSource),
    skillDirectorStaleStages: clearFilmDirectorStageStale(staleStages, "shotList")
  }), false);
});

test("Film Director does not anchor regeneration to a stale dependent draft", () => {
  const data = { skillDirectorStaleStages: { shotList: true } };

  assert.equal(filmDirectorStageDraftForRequest("shotList", "CUT 1 — obsolete direction", data), "");
  assert.equal(filmDirectorStageDraftForRequest("shotList", "CUT 1 — current direction", {}), "CUT 1 — current direction");
});

test("Film Director detects when a Shot List belongs to an older Scene Overview", () => {
  const original = {
    sceneOverview: "The researcher discovers an old note.",
    motionDirection: "Restrained handheld coverage.",
    skillShotCount: "6",
    skillReferenceNotes: { researcher: "Hero talent" }
  };
  const generated = {
    ...original,
    shotList: "CUT 1 — The researcher studies the old note.",
    skillDirectorShotListSourceSignature: filmDirectorShotListSourceSignature(original)
  };

  assert.equal(filmDirectorStageNeedsDraft("shotList", generated), false);
  assert.equal(filmDirectorStageNeedsDraft("shotList", {
    ...generated,
    sceneOverview: "A montage of researchers compares data across the lab."
  }), true);
  assert.deepEqual(filmDirectorShotListDraftsForRequest("shotList", {
    ...generated,
    sceneOverview: "A montage of researchers compares data across the lab.",
    shotListNotes: "Old note continuity."
  }), { shotList: "", shotListNotes: "", fresh: true });
});

test("Film Director Shot List fingerprints ignore output-only controls", () => {
  const source = {
    sceneOverview: "A researcher compares results across three screens.",
    motionDirection: "Slow lateral dolly.",
    skillShotCount: "4"
  };

  assert.equal(filmDirectorShotListSourceSignature(source), filmDirectorShotListSourceSignature({
    ...source,
    skillDurationSeconds: "28",
    skillResolution: "1920p",
    skillAspectRatio: "9:16"
  }));
  assert.notEqual(filmDirectorShotListSourceSignature(source), filmDirectorShotListSourceSignature({
    ...source,
    motionDirection: "Locked-off eye-level coverage."
  }));
});

test("Film Director setup fingerprints detect a replaced Mood Board", () => {
  const original = filmDirectorInputSourceSignature([
    { source: { id: "mood-1", data: { resultUrl: "/outputs/mood-a.png" } }, edge: { from: { port: "boardOut" } } }
  ], "style-inputs");
  const replacement = filmDirectorInputSourceSignature([
    { source: { id: "mood-2", data: { resultUrl: "/outputs/mood-b.png" } }, edge: { from: { port: "boardOut" } } }
  ], "style-inputs");

  assert.notEqual(original, replacement);
  assert.deepEqual(filmDirectorSetupInputChanges({
    skillDirectorLockedStyleInputSignature: original,
    skillDirectorLockedAssetInputSignature: "scene-assets-unchanged"
  }, {
    style: replacement,
    assets: "scene-assets-unchanged"
  }), {
    styleChanged: true,
    assetsChanged: false
  });
});

test("Film Director setup fingerprints are stable when connection order changes", () => {
  const first = { source: { id: "character-1", data: { resultUrl: "/outputs/character.png" } } };
  const second = { source: { id: "location-1", data: { resultUrl: "/outputs/location.png" } } };
  assert.equal(
    filmDirectorInputSourceSignature([first, second], "scene-assets"),
    filmDirectorInputSourceSignature([second, first], "scene-assets")
  );
});

test("an existing Film Director refreshes a connected Mood Board once when upgrading legacy scene data", () => {
  assert.deepEqual(filmDirectorSetupInputChanges({
    styleDirection: "Warm daylight with restrained contrast.",
    skillDirectorBuilt: true,
    resultText: "Style Direction: Warm daylight."
  }, {
    style: "style-inputs-current",
    assets: "scene-assets-current",
    hasStyleInputs: true
  }), {
    styleChanged: true,
    assetsChanged: false
  });
});

test("Film Director fingerprints detect changed images inside the same Mood Board node", () => {
  const before = filmDirectorInputSourceSignature([{
    source: {
      id: "mood-1",
      data: {
        resultUrl: "/outputs/mood.png",
        transferImages: [{ id: "image-1", localUrl: "/inputs/cool.png" }]
      }
    }
  }], "style-inputs");
  const after = filmDirectorInputSourceSignature([{
    source: {
      id: "mood-1",
      data: {
        resultUrl: "/outputs/mood.png",
        transferImages: [{ id: "image-2", localUrl: "/inputs/warm.png" }]
      }
    }
  }], "style-inputs");

  assert.notEqual(before, after);
});

test("Film Director location replacements refresh direction and inherit the active tag position", () => {
  const changes = filmDirectorSetupManifestChanges([
    { sourceId: "old-location", category: "location", tag: "@Apartment", signature: "old" }
  ], [
    { sourceId: "new-location", category: "location", tag: "@Park", signature: "new" }
  ], new Set(["apartment"]));

  assert.equal(changes.locationChanged, true);
  assert.equal(changes.characterChanged, false);
  assert.deepEqual(changes.replacements, [{ from: "@Apartment", to: "@Park" }]);
  assert.equal(
    applyFilmDirectorReferenceChanges("@Emma crosses @Apartment toward the window.", changes),
    "@Emma crosses @Park toward the window."
  );
});

test("Film Director ignores newly connected assets until the scene references them", () => {
  const changes = filmDirectorSetupManifestChanges([], [
    { sourceId: "unused-prop", category: "element", tag: "@Umbrella", signature: "new" }
  ], new Set(["emma"]));

  assert.equal(changes.propsChanged, false);
  assert.deepEqual(changes.replacements, []);
});

test("disconnecting an active asset removes reference syntax without deleting story language", () => {
  const changes = filmDirectorSetupManifestChanges([
    { sourceId: "book", category: "element", tag: "@Book", signature: "old" }
  ], [], new Set(["book"]));

  assert.equal(changes.propsChanged, true);
  assert.equal(applyFilmDirectorReferenceChanges("She closes the @Book.", changes), "She closes the Book.");
});

test("renaming an active asset on the same node updates its reference tag", () => {
  const changes = filmDirectorSetupManifestChanges([
    { sourceId: "location", category: "location", tag: "@Apartment", signature: "before" }
  ], [
    { sourceId: "location", category: "location", tag: "@Loft", signature: "after" }
  ], new Set(["apartment"]));

  assert.deepEqual(changes.replacements, [{ from: "@Apartment", to: "@Loft" }]);
  assert.equal(applyFilmDirectorReferenceChanges("Inside @Apartment.", changes), "Inside @Loft.");
});

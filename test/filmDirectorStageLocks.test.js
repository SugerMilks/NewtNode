import test from "node:test";
import assert from "node:assert/strict";

import {
  filmDirectorStageNeedsDraft,
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
  assert.equal(filmDirectorStageNeedsDraft("style", { styleDirection: "Existing visual direction." }), false);
  assert.equal(filmDirectorStageNeedsDraft("shotList", { shotList: "CUT 1 — shot frame: WS" }), false);
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

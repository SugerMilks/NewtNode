import assert from "node:assert/strict";
import test from "node:test";
import { appendFilmDirectorRevisionHistory, buildFilmDirectorRevisionPrompt } from "../src/filmDirectorRevision.js";

test("Film Director revision prompts preserve the package while prioritizing user notes", () => {
  const prompt = buildFilmDirectorRevisionPrompt({
    revisionNotes: "Remove the dialogue from CUT 2 and make CUT 3 a wide shot.",
    durationLabel: "15-second",
    currentCutCount: 3,
    sceneName: "Coffee Shop",
    referenceSetup: "@Kim = Character reference.",
    shotList: "CUT 1 — shot frame: MS; camera movement: Static; shot type: Coverage:\n@Kim enters.",
    finalPrompt: "Existing final output.",
    shotLogic: "Keep adjacent coverage editorially distinct."
  });

  assert.match(prompt, /USER REVISION NOTES:\nRemove the dialogue from CUT 2/);
  assert.match(prompt, /Preserve the current 3 CUT sections unless the user explicitly asks/);
  assert.match(prompt, /Keep all connected @tags exactly as written/);
  assert.match(prompt, /Current final output:\nExisting final output/);
});

test("Film Director revision history stays bounded and ignores empty notes", () => {
  const history = Array.from({ length: 8 }, (_value, index) => ({ notes: `Note ${index + 1}` }));
  const next = appendFilmDirectorRevisionHistory(history, { notes: "Latest note", summary: "Adjusted CUT 2." });
  assert.equal(next.length, 8);
  assert.equal(next.at(-1).notes, "Latest note");
  assert.equal(next.at(-1).summary, "Adjusted CUT 2.");
  assert.deepEqual(appendFilmDirectorRevisionHistory(next, { notes: "" }), next);
});

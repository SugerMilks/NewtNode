import test from "node:test";
import assert from "node:assert/strict";
import { parseMyNewtVoiceCommand, applyMyNewtVoiceTranscript } from "../src/myNewt/voiceCommands.js";

test("explicit final voice commands are removed from direction", () => {
  for (const phrase of ["Start task", "Run the task!", "Please begin task.", "Newt, start task now.", "My Newt please start the task"]) {
    assert.deepEqual(parseMyNewtVoiceCommand(phrase), { text: "", command: "start" });
    assert.deepEqual(parseMyNewtVoiceCommand(`Create a storyboard. ${phrase}`), { text: "Create a storyboard", command: "start" });
  }
  assert.deepEqual(parseMyNewtVoiceCommand("Create a storyboard and then start task"), { text: "Create a storyboard", command: "start" });
  assert.deepEqual(parseMyNewtVoiceCommand("Change the camera; send note."), { text: "Change the camera", command: "note" });
  assert.deepEqual(parseMyNewtVoiceCommand("Make another angle. Continue task."), { text: "Make another angle", command: "continue" });
});

test("negated, quoted, embedded, questions and vague phrases never submit", () => {
  for (const text of ["Do not start task.", "Don't run the task", "We can start task later", "Can you start task?", "Start task?", 'Say "start task"', "The label should say Start task", "Start task is the button label", "Go ahead", "Yes", "Approve run", "Resume task", "No, do not start task.", "Do not create images and then start task", "No, start task.", "The character says, start task."]) {
    assert.deepEqual(parseMyNewtVoiceCommand(text), { text, command: "" });
  }
});

function fixture(extra = {}) {
  const drafts = [], calls = [];
  return { drafts, calls, args: { current: "Keep the existing assets.", target: "brief", terminal: true, busy: false,
    setDraft: (text) => drafts.push(text), control: async (...args) => { calls.push(args); return true; }, ...extra } };
}

test("a voice start uses the complete fresh brief, not stale React state", async () => {
  const h = fixture();
  await applyMyNewtVoiceTranscript({ ...h.args, transcript: "Create nine angles. Start task." });
  assert.deepEqual(h.calls, [["start", "Keep the existing assets. Create nine angles"]]);
  assert.equal(h.drafts[0], h.calls[0][1]);
});

test("ordinary speech and empty commands stay drafts without starting", async () => {
  const h = fixture(); await applyMyNewtVoiceTranscript({ ...h.args, transcript: "Create nine angles." });
  assert.equal(h.calls.length, 0); assert.match(h.drafts[0], /Keep the existing assets/);
  const empty = fixture({ current: "" });
  assert.match(await applyMyNewtVoiceTranscript({ ...empty.args, transcript: "Start task." }), /Add a task brief/);
  assert.equal(empty.calls.length, 0);
});

test("busy or unavailable actions preserve direction without queuing execution", async () => {
  for (const extra of [{ busy: true }, { control: null }, { target: "note", terminal: false }]) {
    const h = fixture(extra);
    assert.ok(await applyMyNewtVoiceTranscript({ ...h.args, transcript: "Use a wider view. Start task." }));
    assert.equal(h.calls.length, 0); assert.match(h.drafts[0], /Use a wider view/);
  }
});

test("notes and follow-ups use normal control actions, never approval", async () => {
  const note = fixture({ target: "note", terminal: false, current: "" });
  await applyMyNewtVoiceTranscript({ ...note.args, transcript: "Change the camera. Send note." });
  assert.deepEqual(note.calls, [["note", "Change the camera"]]);
  const follow = fixture({ target: "note", current: "" });
  await applyMyNewtVoiceTranscript({ ...follow.args, transcript: "Create another view. Continue task." });
  assert.deepEqual(follow.calls, [["continue", "Create another view"]]);
});

test("failed submission preserves dictated text for manual retry", async () => {
  const h = fixture({ control: async () => false, clearDraft: () => assert.fail("Must preserve a failed draft") });
  await applyMyNewtVoiceTranscript({ ...h.args, transcript: "Make a film. Start task." });
  assert.match(h.drafts.at(-1), /Make a film/);
});

test("only an acknowledged note can clear the exact submitted draft", async () => {
  let cleared;
  const h = fixture({ target: "note", terminal: false, clearDraft: (value) => { cleared = value; } });
  await applyMyNewtVoiceTranscript({ ...h.args, transcript: "Move the camera. Send note." });
  assert.equal(cleared, h.calls[0][1]);
});

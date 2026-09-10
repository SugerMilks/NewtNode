import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflowChangeGuard } from "../src/workflowChangeGuard.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("clean projects switch immediately without saving or prompting", async () => {
  const guard = createWorkflowChangeGuard({ needsSave: () => false, save: () => assert.fail("unexpected save"), onPrompt: () => assert.fail("unexpected prompt") });
  assert.equal(await guard.request("open another project"), true);
});

test("Save keeps the dialog open and switches exactly once after durable success", async () => {
  const write = deferred();
  let prompt, calls = 0, switched = 0;
  const guard = createWorkflowChangeGuard({ needsSave: () => true, save: () => { calls++; return write.promise; }, onPrompt: (value) => { prompt = value; } });
  const navigation = guard.request("load Project B").then((allowed) => { if (allowed) switched++; return allowed; });
  assert.deepEqual(prompt, { actionLabel: "load Project B", saving: false, error: "" });
  const saving = guard.decide("save");
  assert.equal(prompt.saving, true);
  assert.equal(switched, 0);
  await guard.decide("save");
  await guard.decide("cancel");
  await guard.decide("discard");
  assert.equal(await guard.request("load Project C"), false);
  assert.equal(calls, 1);
  assert.equal(prompt.actionLabel, "load Project B");
  write.resolve(true);
  await saving;
  assert.equal(await navigation, true);
  assert.equal(prompt, null);
  assert.equal(switched, 1);
});

test("save errors remain visible and retry continues the original navigation", async () => {
  let prompt, calls = 0;
  const guard = createWorkflowChangeGuard({ needsSave: () => true, save: async () => { if (++calls === 1) throw new Error("Permission denied for project folder."); return true; }, onPrompt: (value) => { prompt = value; } });
  const navigation = guard.request("load Project B");
  await guard.decide("save");
  assert.equal(prompt.saving, false);
  assert.match(prompt.error, /Permission denied/);
  assert.equal(await guard.request("load Project C"), false);
  await guard.decide("save");
  assert.equal(await navigation, true);
  assert.equal(calls, 2);
  assert.equal(prompt, null);
});

test("false save results do not discard the current project, and can be canceled", async () => {
  let prompt;
  const guard = createWorkflowChangeGuard({ needsSave: () => true, save: async () => false, onPrompt: (value) => { prompt = value; } });
  const navigation = guard.request("start a new project");
  await guard.decide("save");
  assert.match(prompt.error, /Could not save/);
  await guard.decide("cancel");
  assert.equal(await navigation, false);
  assert.equal(prompt, null);
});

test("cancel, discard and unknown decisions never save", async () => {
  const guard = createWorkflowChangeGuard({ needsSave: () => true, save: () => assert.fail("unexpected save"), onPrompt: () => {} });
  const canceled = guard.request("open");
  await guard.decide("invalid");
  await guard.decide("cancel");
  assert.equal(await canceled, false);
  const discarded = guard.request("open");
  await guard.decide("discard");
  assert.equal(await discarded, true);
});

test("a late save completion after unmount cannot switch a replacement editor", async () => {
  const write = deferred();
  let updates = 0;
  const guard = createWorkflowChangeGuard({ needsSave: () => true, save: () => write.promise, onPrompt: () => updates++ });
  const navigation = guard.request("open");
  const saving = guard.decide("save");
  guard.dispose();
  const before = updates;
  assert.equal(await navigation, false);
  write.resolve(true);
  await saving;
  assert.equal(updates, before);
});

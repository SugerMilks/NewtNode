import test from "node:test";
import assert from "node:assert/strict";
import { myNewtDefaults, myNewtSettings } from "../src/myNewt/contract.js";
import { createMyNewtCompletionTracker, myNewtHighlightColor } from "../src/myNewt/completion.js";

const task = (status, patch = {}) => ({ projectId: "project", nodeId: "newt", id: "task", status, ...patch });

test("My Newt defaults to $5 without replacing saved budgets", () => {
  assert.equal(myNewtDefaults.budget, 5);
  assert.equal(myNewtSettings().budget, 5);
  assert.equal(myNewtSettings({ budget: "invalid" }).budget, 5);
  assert.equal(myNewtSettings({ budget: 10 }).budget, 10);
  assert.equal(myNewtSettings({ budget: 2.5 }).budget, 2.5);
});

test("My Newt uses yellow until successful completion, including saved tasks", () => {
  assert.equal(myNewtHighlightColor(), "#f0c83b");
  for (const status of ["running", "waiting", "approval", "paused", "stopped", "error"]) {
    assert.equal(myNewtHighlightColor({ jobId: "task", nodeColor: "#ff3b30", myNewtSummary: { status } }), "#f0c83b");
  }
  assert.equal(myNewtHighlightColor({ jobId: "task", myNewtSummary: { status: "complete" } }), "#58ce63");
  assert.equal(myNewtHighlightColor({ jobId: "", myNewtSummary: { status: "complete" } }), "#f0c83b");
});

test("one celebration per completed task, not per step or repeated polling", () => {
  const observe = createMyNewtCompletionTracker();
  assert.equal(observe(task("running")), false);
  for (const status of ["running", "approval", "running", "waiting", "running"]) assert.equal(observe(task(status)), false);
  assert.equal(observe(task("complete")), true);
  assert.equal(observe(task("complete")), false);
  assert.equal(observe(task("running")), false);
  assert.equal(observe(task("complete")), false);
  assert.equal(observe(task("running", { id: "task-2" })), false);
  assert.equal(observe(task("complete", { id: "task-2" })), true);
});

test("loading a completed task never replays the celebration", () => {
  const observe = createMyNewtCompletionTracker();
  assert.equal(observe(task(undefined)), false);
  assert.equal(observe(task("complete")), false);
  assert.equal(observe(task("complete")), false);
  assert.equal(observe(task("running")), false);
  assert.equal(observe(task("complete")), false);
});

test("pauses, stops and errors never celebrate; resumed work may finish", () => {
  for (const status of ["paused", "stopped", "error"]) {
    const observe = createMyNewtCompletionTracker();
    assert.equal(observe(task("running")), false);
    assert.equal(observe(task(status)), false);
    assert.equal(observe(task(status)), false);
    assert.equal(observe(task("running")), false);
    assert.equal(observe(task("complete")), true);
  }
});

test("task identity changes do not mix completion state across projects or nodes", () => {
  for (const patch of [{ projectId: "other" }, { nodeId: "other" }, { id: "other" }]) {
    const observe = createMyNewtCompletionTracker();
    observe(task("running"));
    assert.equal(observe(task("complete", patch)), false);
  }
  const observe = createMyNewtCompletionTracker();
  observe(task("running"));
  assert.equal(observe(null), false);
  assert.equal(observe(task("complete")), false);
});

test("a transient loading state within the same task preserves completion tracking", () => {
  const observe = createMyNewtCompletionTracker();
  observe(task("running"));
  assert.equal(observe(task(undefined)), false);
  assert.equal(observe(task("complete")), true);
});

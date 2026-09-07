import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runSkillDirectorNode } from "../src/nodeRunners/skillDirector.js";

const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const errors = server.slice(server.indexOf("function publicErrorMessage("), server.indexOf("function normalizeVoidVideoFrameCount("));
const publicErrorMessage = new Function("errorStatusCode", `${errors};return publicErrorMessage;`)((error) => error.status || 500);

test("specific Fal errors reach the user instead of only Bad Request", () => {
  assert.equal(publicErrorMessage({ status: 400, message: "Bad Request", body: { detail: "Reasoning is mandatory for this endpoint and cannot be disabled." } }), "Reasoning is mandatory for this endpoint and cannot be disabled.");
  assert.equal(publicErrorMessage({ status: 422, body: { detail: [{ loc: ["body", "model"], msg: "Unknown model" }] } }), "model: Unknown model");
  assert.equal(publicErrorMessage(new Error("Network unavailable")), "Network unavailable");
  assert.equal(publicErrorMessage({}, "Director failed."), "Director failed.");
});

test("empty successful Director responses are failures and do not mutate existing work", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ text: "  " }), { headers: { "content-type": "application/json" } }));
  for (const action of ["style", "motion", "shotList", "build", "revise"]) {
    const node = { id: "director", data: { styleDirection: "Previous style", resultText: "Previous final", skillDirectorAction: action } };
    const before = structuredClone(node);
    await assert.rejects(runSkillDirectorNode({ node, incoming: {}, sourceLabel: () => "Asset" }), /empty result/);
    assert.deepEqual(node, before);
  }
});

test("failed Director responses preserve the error and require a manual retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({ error: "Fal: account temporarily unavailable" }), { status: 400, headers: { "content-type": "application/json" } });
  });
  await assert.rejects(runSkillDirectorNode({ node: { id: "director", data: { skillDirectorAction: "style" } }, incoming: {}, sourceLabel: () => "Asset" }), /account temporarily unavailable/);
  assert.equal(calls, 1);
});

test("invalid successful response shapes never count as Director completion", async (t) => {
  let response;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } }));
  for (response of [null, [], { styleDirection: {} }, { text: 123 }]) {
    await assert.rejects(runSkillDirectorNode({ node: { id: "director", data: { skillDirectorAction: "style" } }, incoming: {}, sourceLabel: () => "Asset" }), /invalid or empty result/);
  }
});

test("Director feedback sits above setup, preserves failed action, and does not report other stages as style work", async () => {
  const ui = await readFile(new URL("../src/components/NodeBodies.jsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const status = await readFile(new URL("../src/components/DirectorTaskStatus.jsx", import.meta.url), "utf8");
  assert.ok(ui.indexOf("<DirectorTaskStatus") < ui.indexOf("1. Scene Setup"));
  assert.match(ui, /onRetry=\{\(\) => runAction\(taskAction\)\}/);
  assert.match(ui, /running && taskAction === "style"/);
  assert.match(editor, /skillDirectorAction: currentNode.data.skillDirectorAction \|\| "build"/);
  assert.match(status, /role=\{failed \? "alert" : "status"\}/);
  assert.match(status, /failed && canRetry/);
  assert.match(status, /Existing scene content has been kept/);
});

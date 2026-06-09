import test from "node:test";
import assert from "node:assert/strict";
import {
  appendedNodeResultState,
  batchRunError,
  fulfilledRunValues,
  rejectedRunResults,
  runRunnableNodesByDependencyOrder
} from "../src/nodeRunner.js";

test("runRunnableNodesByDependencyOrder respects dependency order and stage priority", async () => {
  const nodes = [
    { id: "video", type: "videoModel", data: {} },
    { id: "text", type: "plainText", data: { title: "Text" } },
    { id: "image", type: "imageModel", data: { title: "Image" } }
  ];
  const edges = [
    { from: { nodeId: "text" }, to: { nodeId: "image" } },
    { from: { nodeId: "image" }, to: { nodeId: "video" } }
  ];
  const order = [];
  const statuses = [];

  const result = await runRunnableNodesByDependencyOrder(nodes, edges, {
    runNode: async (node) => {
      order.push(node.id);
      return { status: "complete" };
    },
    onStatus: (message) => statuses.push(message)
  });

  assert.deepEqual(order, ["text", "image", "video"]);
  assert.deepEqual(result, { completed: 3, failed: 0, skipped: 0 });
  assert.equal(statuses[0], "Running 1 text node...");
});

test("runRunnableNodesByDependencyOrder skips dependents after failure", async () => {
  const nodes = [
    { id: "image", type: "imageModel", data: { title: "Image" } },
    { id: "video", type: "videoModel", data: { title: "Video" } }
  ];
  const edges = [{ from: { nodeId: "image" }, to: { nodeId: "video" } }];
  const skipped = [];

  const result = await runRunnableNodesByDependencyOrder(nodes, edges, {
    runNode: async (node) => (node.id === "image" ? { status: "error", error: new Error("bad image") } : { status: "complete" }),
    onNodeSkipped: (nodeId, message) => skipped.push({ nodeId, message })
  });

  assert.deepEqual(result, { completed: 0, failed: 1, skipped: 1 });
  assert.deepEqual(skipped, [{ nodeId: "video", message: "Skipped because Image did not complete." }]);
});

test("result helpers aggregate successful and failed batch results", () => {
  const settled = [
    { status: "fulfilled", value: { url: "/outputs/a.png", text: "A" } },
    { status: "rejected", reason: new Error("nope") },
    { status: "fulfilled", value: [{ url: "/outputs/b.png" }] }
  ];
  assert.equal(fulfilledRunValues(settled).length, 2);
  assert.equal(fulfilledRunValues(settled, { flatten: true }).length, 2);
  assert.equal(rejectedRunResults(settled).length, 1);
  assert.equal(batchRunError("image", 3, fulfilledRunValues(settled), rejectedRunResults(settled)), "2 of 3 image generations complete. nope");

  const state = appendedNodeResultState([{ url: "/outputs/old.png" }], [{ url: "/outputs/new.png" }], "image");
  assert.equal(state.firstNewIndex, 1);
  assert.deepEqual(state.resultItems.map((item) => item.type), ["image", "image"]);
});

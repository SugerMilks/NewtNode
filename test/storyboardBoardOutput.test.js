import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { storyboardBoardBuildSignature as signature, storyboardBoardCanBuild as canBuild, storyboardBoardIsCurrent as isCurrent } from "../src/useStoryboardBoardOutput.js";

const fixture = () => ({ id: "board", type: "storyboard", data: { title: "Test", status: "complete", aspectRatio: "16:9", storyboardFrames: [
  { id: "f1", number: 1, resultUrl: "/outputs/frame.png", prompt: "Door opens.", status: "complete" }
] } });

test("board output identity ignores selection/progress but tracks ordered media, captions and format", () => {
  const node = fixture(), initial = signature(node);
  node.data.storyboardSelectedFrameIds = ["f1"];
  node.data.storyboardFrames[0].protected = true;
  node.data.storyboardFrames[0].status = "queued";
  assert.equal(signature(node), initial);
  for (const patch of [{ resultUrl: "/outputs/new.png" }, { prompt: "Door closes." }, { resultVersion: 2 }, { number: 2 }]) {
    const changed = fixture(); Object.assign(changed.data.storyboardFrames[0], patch);
    assert.notEqual(signature(changed), initial);
  }
  node.data.aspectRatio = "21:9"; assert.notEqual(signature(node), initial);
  const ordered = fixture(); ordered.data.storyboardFrames.push({ id: "f2", number: 2, resultUrl: "/outputs/second.png" });
  const before = signature(ordered); ordered.data.storyboardFrames.reverse(); assert.notEqual(signature(ordered), before);
});

test("automatic preparation waits for jobs to settle and reuses legacy compiled boards", () => {
  assert.equal(canBuild(undefined), false);
  assert.equal(canBuild({ type: "image" }), false);
  const node = fixture(); assert.equal(canBuild(node), true); assert.equal(isCurrent(node), false);
  node.data.storyboardBoardUrl = "/uploads/legacy.png"; assert.equal(isCurrent(node), true);
  node.data.storyboardBoardSource = signature(node); assert.equal(isCurrent(node), true);
  node.data.storyboardFrames[0].resultUrl = "/outputs/new.png"; assert.equal(isCurrent(node), false);
  for (const status of ["planning", "running", "revising", "reviewing-sequence", "exporting"]) {
    node.data.status = status; assert.equal(canBuild(node), false, status);
  }
  node.data.status = "complete";
  for (const status of ["queued", "running", "reviewing"]) {
    node.data.storyboardFrames[0].status = status; assert.equal(canBuild(node), false, status);
  }
  node.data.storyboardFrames[0].status = "error"; assert.equal(canBuild(node), true);
  node.data.storyboardFrames = []; assert.equal(canBuild(node), false);
});

function buildHarness({ imageError, uploadError, mutateAfterImage, mutateAfterUpload, stale = false } = {}) {
  const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("  async function buildStoryboardBoard("), source.indexOf("  async function exportPreviewLayoutBoard("));
  const node = fixture(), nodesRef = { current: [node] }, calls = [];
  const deps = {
    nodesRef, edgesRef: { current: [] }, storyboardBoardCanBuild: canBuild, storyboardBoardBuildSignature: signature,
    normalizedStoryboardFrames: value => value, storyboardAspectRatioForNode: value => value.data.aspectRatio,
    updateNode: (id, patch) => { nodesRef.current = nodesRef.current.map(item => item.id === id ? { ...item, data: { ...item.data, ...patch } } : item); },
    createStoryboardBoardImageBlob: async () => { calls.push("assemble"); mutateAfterImage?.(nodesRef); if (imageError) throw new Error("Cannot load panel 1"); return new Blob(["mock"], { type: "image/png" }); },
    safeStoryboardBoardFileName: value => value,
    uploadNodeAsset: async () => { calls.push("upload"); mutateAfterUpload?.(nodesRef); if (uploadError) throw new Error("Upload failed"); return { localUrl: "/uploads/board.png", fileName: "board.png" }; },
    storyboardBoardLayoutItem: frame => ({ url: frame.resultUrl }),
    syncConnectedPreviewNodes: nodes => { calls.push("sync-preview"); return nodes; },
    setNodes: () => calls.push("publish")
  };
  const run = new Function(...Object.keys(deps), `${block}; return buildStoryboardBoard;`)(...Object.values(deps));
  return { nodesRef, calls, run: () => run(node, { signature: signature(node), isCurrent: () => !stale }) };
}

test("real output writer assembles locally, publishes to connected previews and preserves task status", async () => {
  const harness = buildHarness();
  assert.equal(await harness.run(), "/uploads/board.png");
  assert.deepEqual(harness.calls, ["assemble", "upload", "sync-preview", "publish"]);
  const node = harness.nodesRef.current[0];
  assert.equal(node.data.status, "complete"); assert.equal(isCurrent(node), true);
  assert.equal(node.data.storyboardBoardError, ""); assert.equal(node.data.storyboardFrames.length, 1);
});

for (const mode of ["imageError", "uploadError"]) test(`output ${mode} remains retryable without failing the generation`, async () => {
  const harness = buildHarness({ [mode]: true }); assert.equal(await harness.run(), null);
  const data = harness.nodesRef.current[0].data;
  assert.equal(data.status, "complete"); assert.ok(data.storyboardBoardError); assert.ok(data.storyboardBoardErrorSource);
  assert.equal(data.storyboardBoardUrl, undefined); assert.equal(harness.calls.includes("publish"), false);
});

for (const stage of ["mutateAfterImage", "mutateAfterUpload"]) test(`stale/deleted/changed boards are not published at ${stage}`, async () => {
  for (const mutation of [ref => { ref.current = []; }, ref => { ref.current[0].data.storyboardFrames[0].resultUrl = "/outputs/new.png"; }, ref => { ref.current[0].data.status = "running"; }]) {
    const harness = buildHarness({ [stage]: mutation }); assert.equal(await harness.run(), null);
    assert.equal(harness.calls.includes("publish"), false); assert.equal(harness.calls.includes("sync-preview"), false);
    if (stage === "mutateAfterImage") assert.equal(harness.calls.includes("upload"), false);
  }
  const stale = buildHarness({ stale: true }); assert.equal(await stale.run(), null); assert.deepEqual(stale.calls, []);
});

test("Newt's export stage reports unavailable output rather than claiming success", async () => {
  const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const branch = source.slice(source.indexOf('        if (stage === "export") return prepareStoryboardBoard'), source.indexOf('        throw new Error("Choose storyboard stage'));
  const run = (result, error = "") => new Function("prepareStoryboardBoard", "nodesRef", `return (node, stage) => { ${branch} };`)(
    async () => result, { current: [{ id: "board", data: { storyboardBoardError: error } }] }
  )(fixture(), "export");
  assert.equal(await run("/uploads/board.png"), "/uploads/board.png");
  await assert.rejects(run(null, "Cannot load panel 2"), /Cannot load panel 2/);
  await assert.rejects(run(null), /Storyboard output is not ready/);
});

test("contact-sheet assembly draws sources in sequence and rejects missing images instead of blank placeholders", async () => {
  const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("async function createStoryboardBoardImageBlob("), source.indexOf("function drawCanvasImageContain("));
  for (const fail of [false, true]) {
    const calls = [];
    const context = { scale() {}, fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
    const deps = {
      normalizedStoryboardFrames: frames => frames,
      storyboardBoardSheetLayout: () => ({ width: 600, height: 400, cols: 2, startX: 0, topMargin: 0, panelWidth: 290, panelHeight: 170, gapX: 10, captionHeight: 40, continuousRowGap: 5 }),
      document: { createElement: () => ({ getContext: () => context }) },
      loadCanvasImage: async url => { calls.push(`load:${url}`); if (fail && url === "two") throw new Error("missing"); return url; },
      drawCanvasImageContain: (_context, url) => calls.push(`draw:${url}`),
      storyboardBoardFrameCaption: () => "Caption", drawWrappedCanvasText() {},
      canvasToBlob: async () => { calls.push("save"); return new Blob(["mock"]); }
    };
    const run = new Function(...Object.keys(deps), `${block}; return createStoryboardBoardImageBlob;`)(...Object.values(deps));
    const promise = run({ frames: [{ number: 1, resultUrl: "one" }, { number: 2, resultUrl: "two" }] });
    if (fail) { await assert.rejects(promise, /Could not load panel 2/); assert.deepEqual(calls, ["load:one", "draw:one", "load:two"]); }
    else { await promise; assert.deepEqual(calls, ["load:one", "draw:one", "load:two", "draw:two", "save"]); }
  }
});

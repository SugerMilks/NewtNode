import test from "node:test";
import assert from "node:assert/strict";
import { appendVectorResult, normalizeVectorData, removeVectorResult, vectorDefaults } from "../src/ideogramVector.js";

const output = index => ({ type: "image", url: `/outputs/vector-${index}.png`, svgUrl: `/outputs/vector-${index}.svg`,
  alphaUrl: `/outputs/vector-${index}-alpha.png`, label: `Design ${index}`, cost: { amountUsd: .16 }, vectorLockedKeys: ["lettering"] });
const saved = (selectedResultIndex = 1) => ({ ...vectorDefaults(), status: "complete", prompt: "An emblem", resultItems: [output(1), output(2), output(3)],
  selectedResultIndex, resultUrl: output(selectedResultIndex + 1).url });

test("removing a Vector result selects its next neighbor, or the previous for the last item", () => {
  for (const [index, nextIndex, nextUrl] of [[0, 0, output(2).url], [1, 1, output(3).url], [2, 1, output(2).url]]) {
    const data = saved(index), original = structuredClone(data);
    const patch = removeVectorResult(data, output(index + 1).url);
    assert.equal(patch.selectedResultIndex, nextIndex);
    assert.equal(patch.resultUrl, nextUrl);
    assert.deepEqual(patch.resultItems.map(item => item.url), data.resultItems.filter((_, i) => i !== index).map(item => item.url));
    assert.deepEqual(data, original, "saved data and source files are not mutated");
  }
});

test("deletion preserves a different selection, media metadata and only the surviving drafts", () => {
  const data = { ...saved(2), vectorLayerDrafts: [1, 2, 3].map(index => ({ svgUrl: output(index).svgUrl, operations: [{ type: "rename", key: "text", name: "Logo" }] })) };
  const next = { ...data, ...removeVectorResult(data, output(2).url) };
  assert.equal(next.selectedResultIndex, 1); assert.equal(next.resultUrl, output(3).url);
  assert.deepEqual(next.resultItems, [output(1), output(3)]);
  assert.deepEqual(next.vectorLayerDrafts, [data.vectorLayerDrafts[0], data.vectorLayerDrafts[2]]);
  assert.equal(next.prompt, data.prompt);
});

test("deleting the final Vector image clears legacy output fallback and remains empty after reopen", () => {
  for (const data of [{ ...vectorDefaults(), resultItems: [output(1)], resultUrl: output(1).url, status: "complete" }, { resultUrl: output(1).url }]) {
    const next = { ...data, ...removeVectorResult(data, output(1).url) };
    assert.equal(next.resultUrl, ""); assert.equal(next.selectedResultIndex, 0); assert.deepEqual(next.resultItems, []);
    if (data.status === "complete") assert.equal(next.status, "idle");
    const restored = normalizeVectorData(JSON.parse(JSON.stringify(next)), { restore: true });
    assert.equal(restored.resultUrl, ""); assert.deepEqual(restored.resultItems, []);
  }
});

test("deleting during generation preserves the receipt and a late completion cannot resurrect removed images", () => {
  const data = { ...saved(1), status: "running", vectorJob: { requestId: "pending", status: "running", selectedUrl: output(2).url } };
  const next = { ...data, ...removeVectorResult(data, output(2).url) };
  assert.deepEqual(next.vectorJob, data.vectorJob); assert.equal(next.status, "running");
  const completed = { ...next, ...appendVectorResult(next, output(4), { selectNew: next.resultUrl === next.vectorJob.selectedUrl }) };
  assert.deepEqual(completed.resultItems.map(item => item.url), [output(1).url, output(3).url, output(4).url]);
  assert.equal(completed.resultUrl, output(3).url);
  const empty = { ...next, resultItems: [output(3)], resultUrl: output(3).url, selectedResultIndex: 0 };
  assert.equal(({ ...empty, ...removeVectorResult(empty, output(3).url) }).status, "running");
});

test("missing or already removed results are no-ops and do not remove a shifted neighbor", () => {
  const data = saved();
  assert.equal(removeVectorResult(data, "/outputs/missing.png"), null);
  const next = { ...data, ...removeVectorResult(data, output(2).url) };
  assert.equal(removeVectorResult(next, output(2).url), null);
  assert.equal(removeVectorResult(vectorDefaults(), ""), null);
});

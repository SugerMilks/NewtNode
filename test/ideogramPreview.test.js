import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizedResultItems } from "../src/mediaResults.js";
import { fileNameFromLocalUrl, mimeForOutputItem } from "../src/mediaAssets.js";
import { isCoverageNode } from "../src/coveragePresets.js";
import { nodeApi } from "../src/api/newtApi.js";
import { runImageModelGeneration } from "../src/nodeRunners/mediaModels.js";

// Exercise the same source collection, deduplication and merge used by Preview's Layout effect.
const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const helpers = editor.slice(editor.indexOf("function connectedPreviewSources("), editor.indexOf("async function createEditedPreviewLayoutImageBlob("));
const dependencies = { normalizedResultItems, fileNameFromLocalUrl, mimeForOutputItem, isCoverageNode,
  sourceLabel: source => source.data.title, previewMediaType: () => "image" };
const { connectedPreviewSources, previewLayoutSourceItems, mergePreviewImagesIntoLayout } = new Function(
  ...Object.keys(dependencies), `${helpers}; return { connectedPreviewSources, previewLayoutSourceItems, mergePreviewImagesIntoLayout };`
)(...Object.values(dependencies));

const reference = "/uploads/reference.png";
const output = index => `/workflow-assets/project/outputs/ideogram-${index}.png`;
const legacy = index => ({ url: output(index), thumbnailUrl: `/outputs/thumb-${index}.jpg`, type: "image", label: `Image ${index}`,
  model: "Ideogram 4.5", provider: "fal.ai", sourceUrl: reference, imagePromptCount: 2, editPrecision: "regular", seed: index, cost: { amountUsd: null } });
function incoming(items) {
  return connectedPreviewSources([{ source: { id: "image-model", type: "imageModel", data: { title: "Image Model", resultItems: items,
    resultUrl: items.at(-1)?.url, selectedResultIndex: items.length - 1 } }, edge: { from: { port: "imageOut" } } }])[0];
}
const merge = (items, layout = [], hidden = []) => mergePreviewImagesIntoLayout(layout, previewLayoutSourceItems(incoming(items)), hidden);

test("Ideogram generations sharing a reference all reach Preview Layout across batches", async (t) => {
  let count = 0;
  t.mock.method(nodeApi, "generateImage", async () => ({ response: { ok: true }, data: { model: "Ideogram 4.5", provider: "fal.ai",
    image: { localUrl: output(++count), sourceUrl: reference, imagePromptCount: 1, editPrecision: "regular" } } }));
  const generate = index => runImageModelGeneration({ node: { id: "image-model", type: "imageModel", data: { model: "Ideogram 4.5" } },
    prompt: "Revise the image", imagePromptItems: [{ url: reference, label: "Source" }], index });
  const batch = [...await generate(0), ...await generate(1), ...await generate(2)];
  const first = merge(batch);
  assert.deepEqual(first.map(item => item.url), [output(1), output(2), output(3)]);
  assert.deepEqual(batch.map(item => item.referenceSourceUrl), [reference, reference, reference]);
  assert.deepEqual(batch.map(item => item.sourceUrl), batch.map(item => item.url));
  const next = merge(await generate(0), first);
  assert.deepEqual(next.map(item => item.url), [output(1), output(2), output(3), output(4)]);
  assert.deepEqual(next.slice(0, 3), first);
});

test("saved legacy Ideogram results recover without regenerating or changing files or existing layout", () => {
  const saved = [legacy(1), legacy(2), legacy(3)];
  const copy = JSON.parse(JSON.stringify(saved));
  const previous = [{ id: "keep-me", url: output(1), sourceUrl: reference, type: "image", label: "My first choice" }];
  const layout = merge(copy, previous);
  assert.deepEqual(layout.map(item => item.url), saved.map(item => item.url));
  assert.equal(layout[0].id, "keep-me"); assert.equal(layout[0].label, "My first choice");
  assert.deepEqual(merge(copy, layout), layout);
  assert.deepEqual(copy, saved);
  const normalized = normalizedResultItems(copy, "", "image");
  assert.deepEqual(normalized.map(item => item.referenceSourceUrl), [reference, reference, reference]);
  assert.deepEqual(normalized.map(item => item.sourceUrl), saved.map(item => item.url));
  assert.deepEqual(normalizedResultItems(normalized, "", "image"), normalized);
  for (const item of normalized) {
    assert.equal(item.cost.amountUsd, null); assert.ok(item.thumbnailUrl); assert.equal(item.seed, Number(item.url.match(/(\d+)\.png$/)[1]));
  }
});

test("removing one result does not hide later Ideogram results using the same input", () => {
  const results = [legacy(1), legacy(2), legacy(3)];
  // Older previews recorded both the output and shared input in their hidden list.
  const layout = merge(results, [], [reference, output(1)]);
  assert.deepEqual(layout.map(item => item.url), [output(2), output(3)]);
  assert.deepEqual(merge(results, layout, [reference, output(1)]), layout);
});

test("legitimate layout edits and duplicate suppression remain intact", () => {
  const edited = [{ id: "edited", url: "/uploads/cropped.png", sourceUrl: output(1), type: "image", label: "My crop" }];
  const layout = merge([legacy(1), legacy(2), legacy(3)], edited);
  assert.deepEqual(layout.map(item => item.url), ["/uploads/cropped.png", output(2), output(3)]);
  assert.equal(layout[0].sourceUrl, output(1)); assert.equal(layout[0].id, "edited");
  const ordinary = [{ url: "/outputs/standard-1.png", type: "image" }, { url: "/outputs/standard-2.png", type: "image" }];
  assert.equal(merge(ordinary).length, 2);
  const first = merge(ordinary);
  assert.deepEqual(merge(ordinary, first), first);
});

test("source repair is limited to legacy Ideogram generation metadata, not normal editing lineage", () => {
  const cases = [
    { url: output(1), sourceUrl: reference, type: "image", model: "Ideogram 4.5", editPrecision: "regular", label: "Image Edit" },
    { ...legacy(1), model: "OpenAI Image 2.5 Sunburst" },
    { ...legacy(1), referenceSourceUrl: "/uploads/guide.png" },
    { ...legacy(1), sourceUrl: output(1) },
    { ...legacy(1), type: "video" }
  ];
  for (const item of cases) assert.deepEqual(normalizedResultItems([item], "", item.type)[0], item);
});

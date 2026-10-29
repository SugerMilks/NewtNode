import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { editVectorDocument } from "../server/vector-layers.js";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { vectorDefaults, normalizeVectorData, appendVectorLayerResult } from "../src/ideogramVector.js";
import { clearStaleRunningState, resetCopiedNodeRuntime } from "../src/workflowState.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
<defs><linearGradient id="paint"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient><clipPath id="clip"><rect width="90" height="100"/></clipPath></defs>
<rect id="background" width="100" height="100" fill="#fff"/>
<g id="artwork" opacity=".5" transform="translate(10 10)" clip-path="url(#clip)"><title>Artwork</title><rect id="color" width="40" height="40" fill="url(#paint)"/><rect id="white-detail" x="45" width="20" height="20" fill="#fff"/></g>
<circle id="dot" cx="80" cy="80" r="10" fill="#00ff00"/></svg>`;
const sourceUrl = "/outputs/design.svg";
const pixels = async input => sharp(Buffer.from(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const alphaAt = ({ data, info }, x, y) => data[(y * info.width + x) * info.channels + 3];
const removeBackground = [{ type: "background", keys: ["background"] }, { type: "backgroundVisibility", visible: false }];

test("layer inspection retains geometry, grouping, resources, opacity and anonymous object identity", async () => {
  const inspected = editVectorDocument(svg);
  assert.deepEqual(inspected.layers.map(layer => layer.key), ["background", "artwork", "color", "white-detail", "dot"]);
  assert.equal(inspected.layers[1].name, "Artwork"); assert.equal(inspected.layers[2].parentKey, "artwork");
  assert.deepEqual((await pixels(inspected.svg)).data, (await pixels(svg)).data);
  const anonymous = svg.replace('id="dot"', "");
  const first = editVectorDocument(anonymous), second = editVectorDocument(first.svg);
  assert.deepEqual(second.layers, first.layers);
});

test("background removal keeps white details, fractional alpha, geometry and a reversible SVG", async () => {
  const edited = editVectorDocument(svg, { operations: removeBackground });
  const raster = await pixels(edited.svg);
  assert.equal(alphaAt(raster, 0, 0), 0);
  assert.ok(Math.abs(alphaAt(raster, 60, 20) - 128) <= 1, "white artwork remains half-opaque, not color-keyed away");
  assert.equal(alphaAt(raster, 80, 80), 255);
  assert.deepEqual(edited.backgroundKeys, ["background"]); assert.equal(edited.backgroundVisible, false);
  const restored = editVectorDocument(edited.svg, { backgroundKeys: edited.backgroundKeys, operations: [{ type: "backgroundVisibility", visible: true }] });
  assert.deepEqual((await pixels(restored.svg)).data, (await pixels(svg)).data);
});

test("rename and adjacent grouping leave pixels identical and prevent stacking changes", async () => {
  const id = `newt-group-${randomUUID()}`;
  const grouped = editVectorDocument(svg, { operations: [
    { type: "group", id, keys: ["dot", "artwork"], name: "Design & accents" },
    { type: "rename", key: "white-detail", name: "White <detail>" }
  ] });
  assert.deepEqual((await pixels(grouped.svg)).data, (await pixels(svg)).data);
  assert.equal(grouped.layers.find(layer => layer.key === "artwork").parentKey, id);
  assert.equal(grouped.layers.find(layer => layer.key === "white-detail").name, "White <detail>");
  assert.match(grouped.svg, /White &lt;detail&gt;/);
  for (const keys of [["background", "dot"], ["color", "dot"], ["artwork", "color"], ["color"]]) {
    assert.throws(() => editVectorDocument(svg, { operations: [{ type: "group", keys, id }] }), /adjacent/);
  }
});

test("selection exports retain inherited transforms, clips and opacity at full canvas positions", async () => {
  const selection = editVectorDocument(svg, { isolate: ["white-detail"] });
  const raster = await pixels(selection.svg);
  assert.equal(alphaAt(raster, 0, 0), 0); assert.equal(alphaAt(raster, 80, 80), 0);
  assert.ok(Math.abs(alphaAt(raster, 60, 20) - 128) <= 1);
  const hidden = editVectorDocument(svg, { operations: [{ type: "visibility", keys: ["artwork"], visible: false }], isolate: ["white-detail"] });
  assert.equal(alphaAt(await pixels(hidden.svg), 60, 20), 0, "a selection cannot override an explicitly hidden ancestor");
});

test("invalid edits and unsafe SVGs are rejected before rendering", () => {
  for (const operation of [
    { type: "rename", key: "missing", name: "Hi" }, { type: "rename", key: "dot", name: "" },
    { type: "visibility", keys: ["dot"], visible: "false" }, { type: "background", keys: ["paint"] },
    { type: "script", code: "alert(1)" }, { type: "group", keys: ["artwork", "dot"], id: "evil" }
  ]) assert.throws(() => editVectorDocument(svg, { operations: [operation] }));
  assert.throws(() => editVectorDocument(svg, { operations: Array(501).fill({ type: "background", keys: [] }) }), /500/);
  assert.throws(() => editVectorDocument(svg.replace("<defs>", '<script>alert(1)</script><defs>')), /unsupported/);
  assert.throws(() => editVectorDocument(svg, { isolate: ["missing"] }));
});

function serviceFixture() {
  const writes = [], history = [], reads = [];
  const service = createVectorLayerService({
    readSource: async url => { reads.push(url); return Buffer.from(svg); },
    saveAssets: async (context, artwork) => { writes.push({ context, artwork }); return { url: "/outputs/edit.png", svgUrl: "/outputs/edit.svg", alphaUrl: "/outputs/edit-alpha.png" }; },
    recordHistory: async item => history.push(item)
  });
  return { service, writes, history, reads };
}

test("local saves retain source, full dimensions, alpha matte and zero provider cost with duplicate protection", async () => {
  const { service, writes, history } = serviceFixture();
  const inspected = await service.inspect({ svgUrl: sourceUrl });
  const body = { requestId: randomUUID(), svgUrl: sourceUrl, sourceHash: inspected.sourceHash, operations: removeBackground, projectId: "project", nodeId: "vector" };
  const first = await service.save(body), second = await service.save(body);
  assert.deepEqual(first, second); assert.equal(writes.length, 1); assert.equal(history.length, 1);
  assert.equal(first.item.width, 100); assert.equal(first.item.height, 100);
  assert.equal(first.item.vectorSourceSvgUrl, sourceUrl); assert.equal(first.item.cost.amountUsd, 0);
  assert.equal(first.item.provider, "local"); assert.equal(history[0].projectId, "project");
  assert.deepEqual(history[0].node, { id: "vector", title: "Vector" });
  const rendered = await pixels(writes[0].artwork.svg);
  const png = await sharp(writes[0].artwork.png).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(png.data, rendered.data);
  const matte = await sharp(writes[0].artwork.alpha).raw().toBuffer({ resolveWithObject: true });
  assert.equal(matte.data[0], 0); assert.ok(Math.abs(matte.data[(20 * 100 + 60) * matte.info.channels] - 128) <= 1);
  await assert.rejects(service.save({ ...body, label: "different" }), /different edit/);
  await assert.rejects(service.save({ ...body, requestId: randomUUID(), sourceHash: "0".repeat(64) }), /changed/);
  assert.equal(writes.length, 1);
});

test("local editor refuses nonmanaged sources and preserves saved outputs when History fails", async () => {
  const { service, reads } = serviceFixture();
  for (const svgUrl of ["https://example.com/a.svg", "/etc/a.svg", "/outputs/a.png", "/outputs/a.svg?x=1"]) await assert.rejects(service.inspect({ svgUrl }));
  assert.deepEqual(reads, []);
  const failingHistory = createVectorLayerService({ readSource: async () => Buffer.from(svg), saveAssets: async () => ({ url: "/outputs/edit.png", svgUrl: "/outputs/edit.svg" }), recordHistory: async () => { throw new Error("history offline"); } });
  const inspected = await failingHistory.inspect({ svgUrl: sourceUrl });
  const result = await failingHistory.save({ requestId: randomUUID(), svgUrl: sourceUrl, sourceHash: inspected.sourceHash });
  assert.match(result.warning, /files were saved/); assert.equal(result.item.url, "/outputs/edit.png");
});

test("drafts and edited SVG/PNG/mattes survive normalization, copy and reopen without clearing generation jobs", () => {
  const original = { type: "image", url: "/outputs/original.png", svgUrl: sourceUrl };
  const other = { type: "image", url: "/outputs/other.png", svgUrl: "/outputs/other.svg" };
  const data = { ...vectorDefaults(), resultItems: [original, other], selectedResultIndex: 1, resultUrl: other.url,
    vectorJob: { requestId: "paid-job", status: "running" }, vectorLayerDrafts: [{ svgUrl: sourceUrl, operations: removeBackground }] };
  const edited = { type: "image", url: "/outputs/edit.png", svgUrl: "/outputs/edit.svg", alphaUrl: "/outputs/alpha.png", vectorSourceSvgUrl: sourceUrl, vectorBackgroundKeys: ["background"] };
  const patch = appendVectorLayerResult(data, edited, { sourceSvgUrl: sourceUrl, operations: removeBackground });
  assert.equal(patch.resultUrl, other.url); assert.equal(patch.vectorJob, undefined); assert.deepEqual(patch.vectorLayerDrafts, []);
  const newer = { ...data, vectorLayerDrafts: [{ svgUrl: sourceUrl, operations: [...removeBackground, { type: "rename", key: "dot", name: "Circle" }] }] };
  assert.deepEqual(appendVectorLayerResult(newer, edited, { sourceSvgUrl: sourceUrl, operations: removeBackground }).vectorLayerDrafts, newer.vectorLayerDrafts);
  const saved = { ...data, ...patch };
  for (const restored of [normalizeVectorData(JSON.parse(JSON.stringify(saved))), resetCopiedNodeRuntime(saved), clearStaleRunningState({ type: "vector", data: saved }).data]) {
    assert.equal(restored.resultItems[2].alphaUrl, edited.alphaUrl); assert.equal(restored.resultItems[2].vectorSourceSvgUrl, sourceUrl);
  }
});

test("layer requests require backend support before inspecting or saving", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ routes: { ideogramVector: true } }));
  for (const action of ["inspectLayers", "saveLayers"]) await assert.rejects(ideogramVectorApi[action]({}), /Restart NewtNode.*Vector layers/);
  assert.equal(mock.mock.callCount(), 2);
  assert.ok(mock.mock.calls.every(call => call.arguments[0] === "/api/health"));
});

test("layer saves never replay failures and canceled inspections never submit", async t => {
  let failure = "network";
  const mock = t.mock.method(globalThis, "fetch", async url => {
    if (String(url).endsWith("/api/health")) return Response.json({ routes: { vectorLayers: true } });
    if (failure === "network") throw new Error("lost response");
    if (failure === "stream") return { text: async () => { throw new Error("lost stream"); } };
    return new Response("<html>Gateway error</html>", { status: 502 });
  });
  for (failure of ["network", "stream", "HTML"]) {
    mock.mock.resetCalls();
    await assert.rejects(ideogramVectorApi.saveLayers({ requestId: randomUUID() }));
    assert.equal(mock.mock.calls.filter(call => call.arguments[1]?.method === "POST").length, 1);
  }
  mock.mock.resetCalls();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(ideogramVectorApi.inspectLayers({}, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(mock.mock.calls.filter(call => call.arguments[1]?.method === "POST").length, 0);
});

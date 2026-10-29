import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeVectorGuide, validateVectorMarks, vectorLayoutSize, vectorReferences } from "../src/vectorGuidance.js";
import { vectorDefaults, normalizeVectorData, buildVectorRequest, validateIdeogramVectorRequest, ideogramVectorCost, appendVectorResult } from "../src/ideogramVector.js";
import { saveVectorGuide, readVectorGuideFile } from "../src/vectorGuideMedia.js";

const mark = { layer: "drawing", tool: "pen", color: "#191919", size: .01, opacity: 1, points: [{ x: .2, y: .3 }, { x: .5, y: .7 }] };
const layout = { url: "/uploads/layout.png", label: "Drawn layout", width: 1536, height: 768, marks: [mark], backgroundUrl: "/outputs/subject.png", backgroundLabel: "Subject", enabled: true };
const font = { url: "/uploads/font.png", kind: "font", label: "Studio.otf", sample: "BRAND", enabled: true };
const subject = { url: "/outputs/subject.png", label: "Subject" }, mood = { url: "/outputs/look.png", label: "Look" };
const settings = () => ({ ...vectorDefaults(), prompt: "A graphic emblem", lettering: "BRAND", fontReference: font, layoutReference: layout, quality: "high" });

test("Vector guidance is optional for old projects and remains editable across restore", () => {
  assert.equal(normalizeVectorData({ prompt: "old" }).layoutReference, null);
  const restored = normalizeVectorData(JSON.parse(JSON.stringify(settings())), { restore: true });
  assert.deepEqual(restored.layoutReference, layout);
  assert.deepEqual(restored.fontReference, font);
  assert.notEqual(restored.layoutReference.marks, layout.marks);
  assert.equal(normalizeVectorGuide({ ...font, url: "blob:temporary" }, "font"), null);
  assert.equal(normalizeVectorGuide({ ...font, url: "https://external.example/font.png" }, "font"), null);
});

test("layout leads the submitted order, typography and Mood Board have separate roles", () => {
  const request = buildVectorRequest(settings(), { images: [subject], moodBoards: [mood] });
  assert.deepEqual(request.images.map(image => image.url), [layout.url, subject.url, font.url, mood.url]);
  assert.match(request.prompt, /Reference image 1: LAYOUT SKETCH/);
  assert.match(request.prompt, /Reference image 2: SUBJECT \/ CONTENT/);
  assert.match(request.prompt, /Reference image 3: TYPOGRAPHY/);
  assert.match(request.prompt, /Reference image 4: MOOD BOARD/);
  assert.match(request.prompt, /Do not copy its sample words/);
  assert.match(request.prompt, /omit guide marks and labels/);
  assert.match(request.prompt, /Include exactly this lettering: "BRAND"/);
  assert.equal(request.images[0].marks, undefined);
  assert.deepEqual(validateIdeogramVectorRequest(request), request);
  assert.equal(ideogramVectorCost(request).amountUsd, .32);
});

test("all guidance shares five-reference and composed-prompt limits without truncation", () => {
  assert.equal(buildVectorRequest(settings(), { images: [subject, subject], moodBoards: [mood] }).images.length, 5);
  assert.throws(() => buildVectorRequest(settings(), { images: [subject, subject, subject], moodBoards: [mood] }), /five/);
  assert.throws(() => buildVectorRequest({ ...settings(), prompt: "x".repeat(9000) }), /9,500/);
  const disabled = { ...settings(), fontReference: { ...font, enabled: false }, layoutReference: { ...layout, enabled: false } };
  assert.equal(vectorReferences(disabled).length, 0);
  assert.equal(buildVectorRequest(disabled).images.length, 0);
  assert.equal(ideogramVectorCost(buildVectorRequest(disabled)).amountUsd, .20);
  assert.doesNotMatch(buildVectorRequest(disabled).prompt, /TYPOGRAPHY|LAYOUT SKETCH/);
  const conversion = buildVectorRequest({ ...settings(), vectorMode: "vectorize" }, { images: [subject], moodBoards: [mood] });
  assert.deepEqual(conversion, { mode: "vectorize", vectorizeMode: "default", images: [subject] });
});

test("layout dimensions use selected ratio and saved shapes are bounded passive data", () => {
  assert.deepEqual(vectorLayoutSize("16:9"), { width: 1536, height: 864 });
  assert.deepEqual(vectorLayoutSize("auto", { width: 600, height: 1200 }), { width: 768, height: 1536 });
  assert.deepEqual(vectorLayoutSize("auto"), { width: 1536, height: 1536 });
  assert.deepEqual(validateVectorMarks([mark]), [mark]);
  for (const broken of [{ ...mark, tool: "script" }, { ...mark, size: Infinity }, { ...mark, points: [{ x: -1, y: 0 }] }, { ...mark, color: "url(inject)" }]) assert.throws(() => validateVectorMarks([broken]), /invalid/);
  assert.throws(() => validateVectorMarks(Array(501).fill(mark)), /500/);
  assert.throws(() => validateVectorMarks([{ ...mark, points: Array(20001).fill({ x: .5, y: .5 }) }]), /too detailed/);
});

test("guidance uploads PNG only with the captured workflow package, and failures do not return a reference", async () => {
  let form;
  const blob = new Blob(["fixture"], { type: "image/png" });
  const url = await saveVectorGuide(blob, "vector-layout.png", { projectId: "p", workflowPackageId: "package", workflowPackagePath: "/packaged/project" }, async value => {
    form = value; return { response: { ok: true }, data: { asset: { localUrl: "/workflow-assets/package/inputs/layout.png" } } };
  });
  assert.equal(form.get("workflowPackageId"), "package");
  assert.equal(form.get("workflowPackagePath"), "/packaged/project");
  assert.equal(form.get("asset").type, "image/png");
  assert.match(url, /^\/workflow-assets\//);
  await assert.rejects(saveVectorGuide(blob, "font.png", {}, async () => ({ response: { ok: false }, data: { error: "Disk full" } })), /Disk full/);
  await assert.rejects(readVectorGuideFile({ size: 11 * 1024 * 1024, name: "too-large.ttf" }), /10 MB/);
  await assert.rejects(readVectorGuideFile({ size: 2, name: "broken.ttf", arrayBuffer: async () => new ArrayBuffer(2) }), /supported font/);
});

test("package recursion carries font PNG, layout PNG and underlay; no browser or font binary dependencies", () => {
  const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const block = server.slice(server.indexOf("function collectWorkflowAssetUrls("), server.indexOf("function rewriteWorkflowPackageAssetReferences("));
  const { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls } = new Function("tryLocalPublicPath", `${block}; return { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls };`)(value => /^\/(uploads|outputs)\//.test(value) ? value : "");
  const data = normalizeVectorData(settings());
  const graph = { nodes: [{ type: "vector", data }] };
  assert.deepEqual(new Set(collectWorkflowAssetUrls(graph)), new Set([font.url, layout.url, subject.url]));
  const mapping = new Map([font.url, layout.url, subject.url].map(url => [url, `/workflow-assets/project${url}`]));
  const restored = normalizeVectorData(rewriteWorkflowAssetUrls(graph, mapping).nodes[0].data);
  assert.equal(restored.layoutReference.backgroundUrl, mapping.get(subject.url));
  assert.deepEqual(restored.layoutReference.marks, [mark]);
  const copied = normalizeVectorData(JSON.parse(JSON.stringify(restored)));
  assert.equal(copied.fontReference.url, mapping.get(font.url));
  const finished = { ...data, ...appendVectorResult(data, { url: "/outputs/result.png", svgUrl: "/outputs/result.svg" }) };
  assert.deepEqual(finished.fontReference, font);
  assert.deepEqual(finished.layoutReference, layout);
});

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { parseScriptPages, scriptPagesLabel, validateScriptSelection, validateScriptCatalog, validateScriptShots, scriptImportBuildRequest, scriptImportFrames, mergeImportedScriptFrames, safeScriptUrl } from "../src/storyboardScriptImport.js";
import { readScriptPdf, validatePdfBytes } from "../server/script-pdf.js";
import { registerStoryboardScriptRoutes, scriptSystemPrompt } from "../server/routes/storyboardScripts.js";
import { creativeSchemas, openAiLlmBody, validateCreativeResponse } from "../server/creative-llm.js";
import { storyboardShotRows, validateStoryboardShots } from "../src/storyboardShotList.js";
import { scriptPdfFixture } from "./fixtures/scriptPdf.js";
import { nodeApi } from "../src/api/newtApi.js";

const shot = (page = 3) => ({ number: 1, scene: "Cafe", pages: [page], description: "Maya places her cup on the table. Her companion remains seated opposite.", dialogue: "MAYA: We should go.", voiceover: "", onScreenText: "", timing: "5 seconds", productionNotes: "", shot: "MS", lens: "35mm", angle: "None" });
const draft = () => ({ title: "Cafe 30s", summary: "A conversation at the cafe.", warnings: [], needsNarrowing: false, shots: [shot()] });
const catalog = () => ({ warnings: [], scripts: [
  { title: "Cafe", format: "Broadcast / AV", version: "30s", duration: "30 seconds", summary: "Two friends leave.", excerpt: "MAYA: We should go.", pages: [3, 4], contextPages: [1], scenes: [{ title: "Cafe", summary: "Departure", pages: [3, 4] }] },
  { title: "Cafe", format: "Broadcast / AV", version: "15s", duration: "15 seconds", summary: "Short version.", excerpt: "MAYA: Let's go.", pages: [5], contextPages: [1], scenes: [] }
] });
function harness(overrides = {}) {
  const handlers = new Map(), calls = [], history = [];
  const pdf = { pageCount: 60, digest: "digest", buffer: Buffer.from("pdf"), pages: Array.from({ length: 60 }, (_, i) => ({ number: i + 1, text: `Page ${i + 1} source text`, needsOcr: false })) };
  const answer = async request => { calls.push(request); const result = request.route === "storyboard-script-catalog" ? catalog() : request.route === "storyboard-script-ocr" ? { pages: request.inputs.map(item => ({ page: Number(item.label.match(/\d+/)[0]), text: "INT. CAFE. Maya: We should go.", uncertain: false })) } : draft(); return { text: JSON.stringify(result), provider: "mock", model: "mock", usage: { total_tokens: 100 } }; };
  registerStoryboardScriptRoutes({ post: (route, handler) => handlers.set(route, handler) }, { readPdf: async () => pdf, renderPdf: async () => ({ image: Buffer.from("PNG") }), runTextLlm: answer, runMediaDescriptionLlm: answer,
    recordHistory: async item => history.push(item), estimateCost: () => ({ amountUsd: .01 }), ...overrides });
  const run = async (mode, body = {}) => {
    let status = 200, data;
    await handlers.get(`/api/node/storyboard-script-${mode}`)({ body: { url: "/uploads/script.pdf", digest: "digest", nodeId: "b", ...body } }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  };
  return { run, calls, history, pdf };
}

test("script page ranges deduplicate, count actual selected pages and reject invalid syntax", () => {
  assert.deepEqual(parseScriptPages("3-5, 4, 10, 12-13", 200), [3, 4, 5, 10, 12, 13]);
  assert.equal(scriptPagesLabel([3, 4, 5, 10, 12, 13]), "3-5, 10, 12-13");
  for (const range of ["", "0", "8-3", "1-201", "1.5", "1,,3", "all"]) assert.throws(() => parseScriptPages(range, 200));
});
test("page warning is strictly above 30 and limit strictly above 50, regardless of deck length", () => {
  const pages = count => Array.from({ length: count }, (_, i) => i + 81);
  assert.equal(validateScriptSelection(pages(30), 200).length, 30);
  assert.throws(() => validateScriptSelection(pages(31), 200), /Confirm/);
  assert.equal(validateScriptSelection(pages(50), 200, true).length, 50);
  assert.throws(() => validateScriptSelection(pages(51), 200, true), /50/);
  assert.throws(() => validateScriptSelection([2, 2], 200, true), /unique/);
});
test("catalog keeps alternative scripts separate and rejects invented page provenance", () => {
  const value = catalog(); assert.equal(validateScriptCatalog(value, [1, 3, 4, 5]).scripts.length, 2);
  value.scripts[0].scenes[0].pages = [5]; assert.throws(() => validateScriptCatalog(value, [1, 3, 4, 5]), /outside/);
  value.scripts[0].pages = [100]; assert.throws(() => validateScriptCatalog(value, [1, 3, 4, 5]), /invalid/);
});
test("automatic import covers only the chosen full script, not treatment pages or other versions", () => {
  const document = { url: "/uploads/script.pdf", digest: "digest", pageCount: 200 };
  const script = { ...catalog().scripts[0], pages: [3, 4, 8] };
  const request = scriptImportBuildRequest(document, script);
  assert.deepEqual(request.pages, [3, 4, 8], "include script pages not assigned to a detected scene");
  assert.match(request.selection, /Cafe \(30s\). All scenes/);
  assert.doesNotMatch(request.selection, /15s/);
  assert.equal(request.includeContext, false);
  assert.deepEqual(request.contextPages, []);
  assert.equal(request.maxShots, 35);
  assert.equal(request.allowPaidAnalysis, true);
  assert.equal(request.digest, document.digest);
});
test("automatic import still requires confirmation above 30 script pages and rejects above 50", () => {
  const document = { url: "/uploads/script.pdf", pageCount: 200 };
  const script = count => ({ ...catalog().scripts[0], pages: Array.from({ length: count }, (_, index) => index + 70) });
  assert.equal(scriptImportBuildRequest(document, script(30)).pages.length, 30);
  assert.throws(() => scriptImportBuildRequest(document, script(31)), /Confirm/);
  assert.equal(scriptImportBuildRequest(document, script(50), true).confirmLongScript, true);
  assert.throws(() => scriptImportBuildRequest(document, script(51), true), /50/);
  assert.throws(() => scriptImportBuildRequest(document, null), /Choose a script/);
});
test("shot import rejects partial narrowing output and invalid citations", () => {
  assert.equal(validateScriptShots(draft(), [3]).shots.length, 1);
  assert.throws(() => validateScriptShots(draft(), [4]), /source/);
  assert.throws(() => validateScriptShots({ ...draft(), needsNarrowing: true }, [3]), /partial/);
  assert.equal(validateScriptShots({ ...draft(), needsNarrowing: true, shots: [] }, [3]).needsNarrowing, true);
});
test("import requires explicit replacement, respects protection, preserves media and stops at 35", () => {
  const imported = scriptImportFrames(draft(), { url: "/uploads/script.pdf", fileName: "script.pdf" }, "30s version", () => "new");
  const existing = [{ id: "old", shotDescription: "Original", resultUrl: "/outputs/original.png", versions: [{ resultUrl: "/outputs/older.png" }] }];
  const result = mergeImportedScriptFrames(existing, imported, "append");
  assert.equal(result[0].resultUrl, existing[0].resultUrl); assert.deepEqual(result[0].versions, existing[0].versions);
  assert.equal(result[1].prompt, ""); assert.equal(result[1].sourceScript.dialogue, shot().dialogue);
  assert.throws(() => mergeImportedScriptFrames(existing, imported, "replace"), /Confirm/);
  assert.throws(() => mergeImportedScriptFrames([{ ...existing[0], protected: true }], imported, "replace", true), /Unprotect/);
  assert.equal(mergeImportedScriptFrames(existing, imported, "replace", true).length, 1);
  assert.equal(mergeImportedScriptFrames([{ id: "blank" }], imported, "append").length, 1);
  assert.throws(() => mergeImportedScriptFrames(Array(35).fill(existing[0]), imported, "append"), /35/);
  const reopened = JSON.parse(JSON.stringify(imported));
  assert.deepEqual(reopened[0].sourceScript.pages, [3]);
  assert.equal(validateStoryboardShots(storyboardShotRows(reopened))[0].scriptContext.dialogue, shot().dialogue);
});
test("PDF URLs never allow remote fetches or traversal", () => {
  for (const url of ["https://example.com/script.pdf", "/uploads/../secret.pdf", "/uploads/%2e%2e/secret", "/uploads/x?y", "file:///tmp/file.pdf", "/uploads/x\\y.pdf"]) assert.equal(safeScriptUrl(url), false);
  assert.equal(safeScriptUrl("/workflow-assets/id/inputs/My%20Script.pdf"), true);
});
test("real PDF reader preserves page numbering and AV column geometry and renders a nonblank page", async () => {
  const bytes = scriptPdfFixture([["A DIRECTOR'S TREATMENT", "The following pages contain two separate scripts with different durations."],
    [{ text: "VIDEO", x: 40, y: 740 }, { text: "AUDIO", x: 320, y: 740 }, { text: "Maya sets down a cup.", x: 40, y: 710 }, { text: "MAYA: We should go.", x: 320, y: 710 }], []]);
  const pdf = await readScriptPdf(bytes);
  assert.equal(pdf.pageCount, 3); assert.match(pdf.pages[1].text, /\[40,52\] VIDEO/); assert.match(pdf.pages[1].text, /\[320,52\] AUDIO/);
  assert.equal(pdf.pages[2].needsOcr, true);
  const rendered = await readScriptPdf(bytes, 2);
  const metadata = await sharp(Buffer.from(rendered.image)).metadata();
  assert.equal(Math.max(metadata.width, metadata.height), 1400);
  const stats = await sharp(Buffer.from(rendered.image)).stats();
  assert.ok(stats.channels[0].stdev > 5, "page contains visible text");
});
test("invalid, encrypted/unsupported and oversized PDF inputs fail locally", async () => {
  assert.throws(() => validatePdfBytes(Buffer.from("not a PDF")), /valid PDF/);
  assert.throws(() => validatePdfBytes(Buffer.alloc(41 * 1024 * 1024)), /40 MB/);
  await assert.rejects(readScriptPdf(Buffer.from("%PDF-1.7 invalid file")));
  await assert.rejects(readScriptPdf(scriptPdfFixture(Array.from({ length: 201 }, () => []))), /200/);
});
test("inspection and page preview are local and never call an LLM", async () => {
  const h = harness(); assert.equal((await h.run("inspect")).data.pageCount, 60);
  assert.match((await h.run("page", { page: 3 })).data.image, /^data:image\/png;base64,/);
  assert.equal(h.calls.length, 0); assert.equal(h.history.length, 0);
});
test("bad requests and long selections are rejected before paid calls", async () => {
  const h = harness();
  for (const body of [{ pages: [3] }, { pages: [3], allowPaidAnalysis: true, digest: "wrong" }, { pages: Array.from({ length: 31 }, (_, i) => i + 1), allowPaidAnalysis: true }, { pages: Array.from({ length: 51 }, (_, i) => i + 1), allowPaidAnalysis: true, confirmLongScript: true }, { pages: [3], maxShots: 100, allowPaidAnalysis: true }]) assert.equal((await h.run("build", body)).status, 400);
  assert.equal(h.calls.length, 0);
});
test("catalog and shot building use strict provider schemas, preserve versions, source and cost", async () => {
  const h = harness();
  assert.equal((await h.run("analyze", { range: "1-5", allowPaidAnalysis: true })).data.catalog.scripts.length, 2);
  const result = await h.run("build", { pages: [3, 4], allowPaidAnalysis: true, selection: "Cafe 30s, scene Cafe" });
  assert.equal(result.status, 200); assert.equal(result.data.draft.shots[0].dialogue, shot().dialogue); assert.equal(h.history.length, 2);
  assert.match(h.calls[1].prompt, /Cafe 30s/); assert.doesNotMatch(h.calls[1].prompt, /Page 5 source text/);
  assert.match(h.calls[1].prompt, /never events/); assert.match(scriptSystemPrompt, /untrusted/);
  for (const route of ["storyboard-script-catalog", "storyboard-script-ocr", "storyboard-script-shotlist"]) {
    assert.equal(openAiLlmBody({ route, responseMimeType: "application/json" }).text.format.schema, creativeSchemas[route]);
    assert.throws(() => validateCreativeResponse({}, { route, provider: "test", text: "{}" }), /incomplete/);
  }
});
test("PDF shot planning receives the same camera personality without an extra review pass", async () => {
  for (const personality of [undefined, "Restrained", "Expressive", "Bold"]) {
    const h = harness();
    const result = await h.run("build", { pages: [3], allowPaidAnalysis: true, storyboardCameraPersonality: personality });
    assert.equal(result.status, 200);
    assert.equal(h.calls.length, 1);
    assert.match(h.calls[0].prompt, new RegExp(`CAMERA PERSONALITY: ${personality || "Expressive"}`));
    assert.match(h.calls[0].prompt, /camera directions in a source script outrank personality/);
    assert.match(h.calls[0].prompt, /do not return extra JSON fields/i);
  }
});

test("scanned pages use bounded OCR, cache successful transcriptions, then analyze", async () => {
  const h = harness(); h.pdf.pages[2].needsOcr = true;
  await h.run("analyze", { range: "1-5", allowPaidAnalysis: true });
  assert.equal(h.calls[0].route, "storyboard-script-ocr"); assert.equal(h.calls[0].inputs.length, 1);
  await h.run("build", { pages: [3], allowPaidAnalysis: true });
  assert.equal(h.calls.filter(call => call.route === "storyboard-script-ocr").length, 1);
  assert.equal(h.history.length, 3);
});
test("malformed paid output is billed once and never retried", async () => {
  let calls = 0;
  const h = harness({ runMediaDescriptionLlm: async () => { calls++; return { text: "{}", usage: { total_tokens: 1 }, provider: "mock" }; } });
  const result = await h.run("build", { pages: [3], allowPaidAnalysis: true });
  assert.equal(result.status, 400); assert.equal(calls, 1); assert.equal(h.history.length, 1); assert.ok(h.history[0].error);
});
test("uncertain transport records supplied usage without replay and releases its task lock", async () => {
  let calls = 0;
  const h = harness({ runMediaDescriptionLlm: async () => { calls++; const error = new Error("Interrupted"); error.llmResult = { text: "partial", provider: "mock", usage: { total_tokens: 10 } }; throw error; } });
  assert.equal((await h.run("build", { pages: [3], allowPaidAnalysis: true })).status, 400);
  assert.equal(calls, 1); assert.equal(h.history.length, 1); assert.equal((await h.run("inspect")).status, 200);
});

test("client gates stale backends and never replays uncertain script planning", async () => {
  const original = globalThis.fetch, calls = [];
  try {
    globalThis.fetch = async (path, options) => { calls.push({ path, options }); return new Response(JSON.stringify({ routes: {} }), { status: 200 }); };
    await assert.rejects(nodeApi.storyboardScript("build", { url: "/uploads/script.pdf" }), /Restart/);
    assert.equal(calls.length, 1);
    calls.length = 0;
    globalThis.fetch = async (path, options) => { calls.push({ path, options }); if (path === "/api/health") return new Response(JSON.stringify({ routes: { storyboardScriptImport: true } })); throw new Error("Connection lost"); };
    await assert.rejects(nodeApi.storyboardScript("build", { url: "/uploads/script.pdf" }), /did not resubmit/);
    assert.equal(calls.filter(call => call.options?.method === "POST").length, 1);
  } finally { globalThis.fetch = original; }
});

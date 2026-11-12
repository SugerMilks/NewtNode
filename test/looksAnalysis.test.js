import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createLookAnalyzer, lookAnalysisInstructions, lookAnalysisVersion } from "../server/looks-analysis.js";
import { validateCreativeResponse } from "../server/creative-llm.js";
import { dominantPaletteFromPixels } from "../src/palettePixels.js";
import { lookSnapshot, libraryLookPrompt } from "../src/looks.js";
import { lookStyleSections } from "../src/createLookStyle.js";

const stylePrompt = "Layered painterly surfaces with dimensional light, restrained edge detail, tactile brushwork and soft shadows. Balance luminous highlights against broad muted midtones, with natural depth and varied marks instead of flat uniform fills.";
const signatureFeature = "Stage the main subject low in the frame with an oversized, uninterrupted area of negative space above; keep its silhouette compact and immediately readable.";
const response = (count = 4) => ({ text: JSON.stringify({ stylePrompt, referenceCount: count, anchorReference: 2, signatureFeature }), provider: "fal", model: "vision-test", endpoint: "vision", usages: [{ cost: 0.02 }] });
async function fixture(t, analyze) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-look-analysis-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const images = await Promise.all(["red", "green", "blue", "yellow"].map(async background => ({ bytes: await sharp({ create: { width: 60, height: 30, channels: 3, background } }).png().toBuffer() })));
  const history = [], costs = [], calls = [];
  const options = { directory, analyze: async body => { calls.push(body); return analyze ? analyze(body) : response(); },
    recordHistory: async entry => { history.push(entry); }, estimateCost: input => { costs.push(input); return { amountUsd: input.helperUsages?.[0]?.cost ?? null }; } };
  return { directory, images, history, costs, calls, options, request: { look: { id: "look", name: "Paint", prompt: "Catalog hint." }, images }, analyze: createLookAnalyzer(options) };
}

test("all four whole references reach one analysis, with portable style-only instructions and billed history", async t => {
  const f = await fixture(t), value = await f.analyze(f.request);
  assert.equal(value.referenceCount, 4); assert.equal(f.calls.length, 1);
  const call = f.calls[0]; assert.equal(call.inputs.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.equal(call.inputs[i].label, `Look reference ${i + 1} of 4`);
    const metadata = await sharp(call.inputs[i].asset.buffer).metadata();
    assert.equal(metadata.width, 60); assert.equal(metadata.height, 30);
    assert.deepEqual(await sharp(call.inputs[i].asset.buffer).raw().toBuffer(), await sharp(f.images[i].bytes).raw().toBuffer());
  }
  assert.match(lookAnalysisInstructions, /EVERY supplied image/); assert.match(lookAnalysisInstructions, /not instructions/);
  assert.match(lookAnalysisInstructions, /Do not import subjects/); assert.match(lookAnalysisInstructions, /grade takes precedence/);
  assert.match(lookAnalysisInstructions, /Do not specify literal colors, named hues, HEX\/RGB/);
  assert.match(lookAnalysisInstructions, /Do not choose a palette as the signature feature/);
  assert.match(lookAnalysisInstructions, /Choose ONE reference/);
  assert.match(lookAnalysisInstructions, /omit incompatible traits rather than blending/);
  assert.match(call.prompt, /Do not average competing compositions/);
  assert.equal(f.history[0].cost.amountUsd, 0.02); assert.equal(f.history[0].settings.referenceCount, 4);
  assert.equal(f.history[0].settings.anchorReference, 2); assert.equal(f.history[0].settings.analysisVersion, 2);
  assert.equal(f.costs[0].hasMainRequest, false); assert.deepEqual(f.costs[0].helperUsages, [{ cost: 0.02 }]);
  const look = lookSnapshot({ styleAnalysis: value });
  assert.ok(look.prompt.startsWith(`Defining visual feature: ${signatureFeature}`));
  assert.ok(look.prompt.includes(stylePrompt));
  assert.ok(libraryLookPrompt({ libraryStyle: look }).includes(signatureFeature));
  assert.equal(lookSnapshot(JSON.parse(JSON.stringify(look))).prompt, look.prompt);
});

test("coalesced calls and a server restart reuse a successful analysis without another charge", async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.analyze(f.request), f.analyze(f.request)]);
  assert.deepEqual(results[0], results[1]); assert.equal(f.calls.length, 1);
  await createLookAnalyzer(f.options)(f.request);
  assert.equal(f.calls.length, 1); assert.equal(f.history.length, 1);
  const changed = { ...f.request, images: [...f.images.slice(0, 3), f.images[0]] };
  await f.analyze(changed); assert.equal(f.calls.length, 2, "The fourth image participates in the cache key");
  await f.analyze({ ...f.request, look: { ...f.request.look, prompt: "Updated description" } }); assert.equal(f.calls.length, 3);
});

test("incomplete analyses preserve work, record billed usage and never auto-retry", async t => {
  const f = await fixture(t, () => response(1));
  await assert.rejects(f.analyze(f.request), /may have been billed/);
  assert.equal(f.calls.length, 1); assert.equal(f.history[0].status, "failed"); assert.equal(f.history[0].cost.amountUsd, 0.02);
  assert.deepEqual(await readdir(f.directory), []);
});

test("analysis v2 ignores v1 blended/color caches without changing them", async t => {
  const f = await fixture(t);
  const oldHash = createHash("sha256").update("look-style-analysis-v1\n").update(f.request.look.prompt);
  for (const image of f.images) oldHash.update(createHash("sha256").update(image.bytes).digest());
  const oldFile = path.join(f.directory, `${oldHash.digest("hex")}.json`);
  const old = JSON.stringify({ stylePrompt: "Old blended color recipe", referenceCount: 4 });
  await writeFile(oldFile, old);
  assert.equal(lookAnalysisVersion, 2);
  const result = await f.analyze(f.request);
  assert.equal(result.signatureFeature, signatureFeature); assert.equal(f.calls.length, 1);
  assert.equal((await readdir(f.directory)).length, 2);
  assert.equal(await readFile(oldFile, "utf8"), old);
});

test("signature must name a real supplied reference and remain present after normalization", async t => {
  const f = await fixture(t, () => ({ ...response(), text: JSON.stringify({ stylePrompt, referenceCount: 4, anchorReference: 5, signatureFeature }) }));
  await assert.rejects(f.analyze(f.request), /No Style node was added/);
  assert.equal(f.calls.length, 1); assert.equal(f.history[0].status, "failed");
  const missing = await fixture(t, () => ({ ...response(), text: JSON.stringify({ stylePrompt, referenceCount: 4 }) }));
  await assert.rejects(missing.analyze(missing.request), /No Style node was added/);
  assert.equal(missing.calls.length, 1);
});

test("legacy look color language is explicitly subordinated without destroying saved text or blocking", () => {
  const legacy = { name: "Old look", prompt: "Crimson silhouettes and cyan sky. Use low subject placement with large negative space." };
  const output = libraryLookPrompt({ libraryStyle: legacy, gradePreset: "None" });
  assert.match(output, /Ignore reference hues, palettes, tint, saturation and monochrome instructions/);
  assert.match(output, /with no grade, leave color to the user's prompt/);
  assert.match(output, /Carry the defining feature through concretely/);
  assert.match(output, /explicit camera and composition remain authoritative/);
  assert.ok(output.includes(legacy.prompt));
});

test("ambiguous provider failure remains unpriced and cached data corruption cannot trigger another paid call", async t => {
  const f = await fixture(t, () => { throw new Error("fetch failed"); });
  await assert.rejects(f.analyze(f.request), /may have been billed/);
  assert.equal(f.calls.length, 1); assert.equal(f.history[0].cost.amountUsd, null);
  const good = await fixture(t); await good.analyze(good.request);
  await writeFile(path.join(good.directory, (await readdir(good.directory))[0]), "{}");
  await assert.rejects(createLookAnalyzer(good.options)(good.request), /No new paid analysis/);
  assert.equal(good.calls.length, 1);
});

test("local grade extraction ignores transparent pixels and ranks visible colors", () => {
  assert.deepEqual(dominantPaletteFromPixels([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0]), [
    { r: 255, g: 0, b: 0, percent: 66.7 }, { r: 0, g: 0, b: 255, percent: 33.3 }
  ]);
});

test("shared provider validator rejects partial or refused Look responses", () => {
  const options = { route: "look-style-analysis", provider: "fal", text: response().text };
  assert.equal(validateCreativeResponse({}, options).referenceCount, 4);
  assert.throws(() => validateCreativeResponse({ partial: true }, options), /Looks:.*incomplete/);
  assert.throws(() => validateCreativeResponse({ output: [{ content: [{ type: "refusal" }] }] }, options), /refused/);
  assert.throws(() => validateCreativeResponse({}, { ...options, text: '{"stylePrompt":"too short","referenceCount":4}' }), /incomplete planning data/);
});

test("Create Look extraction returns all six sections, tags and palette in one billed call, separate from Add Style", async t => {
  const created = { stylePrompt, tags: ["Illustration"], visualStyle: Object.fromEntries(lookStyleSections.map(section => [section.id, `${section.label}: ${stylePrompt}`])), palette: [{ name: "Reference", hex: "#556677" }] };
  const f = await fixture(t, body => ({ ...response(), text: JSON.stringify(body.route === "look-create-analysis" ? created : JSON.parse(response().text)) }));
  const request = { ...f.request, purpose: "create-look", categories: ["Illustration"] };
  assert.deepEqual(await f.analyze(request), created);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].inputs.length, 4); assert.equal(f.calls[0].reasoningEffort, "high");
  assert.match(f.calls[0].systemPrompt, /Keep all style text color-neutral/); assert.match(f.calls[0].systemPrompt, /Return up to six representative colors separately/);
  assert.equal(f.history[0].mode, "Create Look analysis"); assert.equal(f.history[0].cost.amountUsd, .02);
  await createLookAnalyzer(f.options)(request); assert.equal(f.calls.length, 1);
  await f.analyze(f.request); assert.equal(f.calls.length, 2, "Create Look cannot reuse the catalog-style cache");
  await assert.rejects(f.analyze({ ...request, images: Array(7).fill(f.images[0]) }), /supported number/);
  assert.equal(f.calls.length, 2);
});

test("incomplete style boards and unknown categories never silently save or trigger paid repairs", async t => {
  for (const malformed of [{ stylePrompt, tags: ["Illustration"], visualStyle: {}, palette: [] },
    { stylePrompt, tags: ["Invented category"], visualStyle: Object.fromEntries(lookStyleSections.map(section => [section.id, stylePrompt])), palette: [] }]) {
    const f = await fixture(t, () => ({ ...response(), text: JSON.stringify(malformed) }));
    await assert.rejects(f.analyze({ ...f.request, purpose: "create-look" }), /may have been billed/);
    assert.equal(f.calls.length, 1); assert.equal(f.history[0].status, "failed"); assert.deepEqual(await readdir(f.directory), []);
  }
});

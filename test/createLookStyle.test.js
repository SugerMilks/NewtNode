import test from "node:test";
import assert from "node:assert/strict";
import { compileLookStyle, lookStyleBlocks, lookStyleSections, lookCategories, lookTags, validLookStyleBlocks, validLookPalette } from "../src/createLookStyle.js";
import { validateCreativeResponse, creativeOutputBudget, openAiLlmBody, falLlmInput } from "../server/creative-llm.js";

export const createdAnalysis = {
  stylePrompt: "Painterly dimensional rendering combines sculpted soft light, tactile surfaces and expressive edges. Strong silhouettes establish a readable hierarchy, with subtle transitions into quiet atmospheric depth.",
  tags: ["Illustration", "3D visualization"],
  visualStyle: Object.fromEntries(lookStyleSections.map(section => [section.id, `Use distinctive ${section.label.toLowerCase()} through layered marks, sculpted surfaces and clearly separated forms without copying reference subjects.`])),
  palette: [{ name: "Reference", hex: "#334455" }, { name: "Accent", hex: "#ccbbaa" }]
};

test("six style sections use peer IDs, defaults, priorities and compiled formatting", () => {
  const blocks = lookStyleBlocks(createdAnalysis.visualStyle);
  assert.deepEqual(blocks.map(block => block.id), ["medium", "lighting", "texture", "shape", "depth", "mood"]);
  assert.deepEqual(blocks.map(block => block.weight), ["primary", "secondary", "secondary", "secondary", "advisory", "advisory"]);
  blocks[0].weight = "absolute"; blocks[1].enabled = false;
  const prompt = compileLookStyle(blocks);
  assert.ok(prompt.startsWith("### Medium & rendering \u00b7 absolute\n"));
  assert.ok(!prompt.includes("Light & contrast")); assert.ok(prompt.includes("Depth & atmosphere"));
  assert.ok(!prompt.includes("#334455"));
  assert.equal(validLookStyleBlocks(blocks), true);
  assert.equal(validLookStyleBlocks([...blocks.slice(0, 5), blocks[0]]), false);
  assert.equal(validLookStyleBlocks(blocks.map(block => ({ ...block, text: "a".repeat(601) }))), false);
  assert.equal(compileLookStyle(blocks.map(block => ({ ...block, enabled: false }))), "");
});

test("tags and category suggestions stay bounded with Various available without a catalog", () => {
  assert.deepEqual(lookTags(["Paint", "paint", " Illustration ", ""]), ["Paint", "Illustration"]);
  assert.ok(lookCategories().includes("Various"));
  assert.ok(lookCategories(["Painters"]).includes("Painters"));
  assert.equal(lookTags(Array.from({ length: 30 }, (_, i) => `tag${i}`)).length, 16);
  assert.equal(validLookPalette(createdAnalysis.palette), true);
  for (const palette of [[{ name: "Bad", hex: "red" }], Array(7).fill(createdAnalysis.palette[0]), [null]]) assert.equal(validLookPalette(palette), false);
});

test("all providers validate complete Create Look boards without accepting truncated or refused output", () => {
  const options = { route: "look-create-analysis", provider: "test", text: JSON.stringify(createdAnalysis) };
  assert.deepEqual(validateCreativeResponse({}, options), createdAnalysis);
  for (const change of [{ partial: true }, { status: "incomplete" }, { output: [{ content: [{ type: "refusal" }] }] }]) assert.throws(() => validateCreativeResponse(change, options), /Looks:/);
  for (const change of [{ visualStyle: { medium: "Incomplete" } }, { palette: [{ name: "Bad", hex: "#abc" }] }, { tags: [] }]) assert.throws(() => validateCreativeResponse({}, { ...options, text: JSON.stringify({ ...createdAnalysis, ...change }) }), /Looks:/);
  const body = openAiLlmBody({ route: options.route, responseMimeType: "application/json", reasoningEffort: "high" });
  assert.equal(body.text.format.strict, true); assert.equal(body.reasoning.effort, "high");
  assert.equal(body.max_output_tokens, creativeOutputBudget(options.route));
  assert.equal(falLlmInput({ route: options.route }).max_tokens, body.max_output_tokens);
});

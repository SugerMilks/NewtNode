import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cloneNode } from "../src/workflowState.js";
import { characterOutputReference, generatedCharacterSheetId } from "../src/characterSheetLibrary.js";
import { characterAutoWardrobeId, characterAutoWardrobePrompt, characterWardrobesForGeneration, isAutoCharacterWardrobe } from "../src/characterAutoWardrobe.js";
import { characterBaseGenerationSignature, characterBaseVideoGenerationSignature } from "../src/characterSheetWorkflow.js";

test("Auto Wardrobe is an opt-in portrait-backed outfit, not an upload or a base change", () => {
  const portrait = { localUrl: "/uploads/portrait.png", thumbnailUrl: "/tiny.jpg", fileName: "Actor.png" };
  const uploaded = [{ id: "coat", localUrl: "/uploads/coat.png" }];
  const data = { characterPortrait: portrait, characterWardrobes: uploaded };
  assert.equal(characterWardrobesForGeneration(data), uploaded);
  assert.equal(characterWardrobesForGeneration({ ...data, autoWardrobe: "false" }), uploaded);
  const enabled = { ...data, autoWardrobe: true };
  const wardrobes = characterWardrobesForGeneration(enabled);
  assert.equal(wardrobes.length, 2);
  assert.equal(wardrobes[0].localUrl, portrait.localUrl);
  assert.equal(wardrobes[0].id, characterAutoWardrobeId);
  assert.equal(wardrobes[0].fileName, "Auto Wardrobe");
  assert.equal(isAutoCharacterWardrobe(wardrobes[0]), true);
  assert.equal(wardrobes[1], uploaded[0]);
  assert.equal(portrait.fileName, "Actor.png");
  assert.equal(uploaded.length, 1);
  for (const signature of [characterBaseGenerationSignature, characterBaseVideoGenerationSignature]) {
    assert.equal(signature(enabled), signature(data), "Enabling wardrobe must not invalidate identity masters");
  }
  assert.deepEqual(characterWardrobesForGeneration({ autoWardrobe: true }), []);
  assert.deepEqual(characterWardrobesForGeneration(), []);
});

test("Auto Wardrobe infers missing clothing and footwear without changing visible outfit or layout", () => {
  const prompt = characterAutoWardrobePrompt();
  assert.match(prompt, /original uploaded portrait/);
  assert.match(prompt, /Visually analyze only its worn wardrobe/);
  assert.match(prompt, /Preserve all clearly visible outfit details/);
  assert.match(prompt, /Complete just the unseen portions/);
  assert.match(prompt, /If shoes are visible, reproduce them; otherwise infer footwear/);
  assert.match(prompt, /all six views/);
  assert.match(prompt, /sunglasses/);
  assert.match(prompt, /No nudity/);
  assert.doesNotMatch(prompt, /Do not invent garments or accessories absent from the reference/);
});

test("Auto Wardrobe CU transfers the completed outfit instead of analyzing the portrait again", () => {
  const prompt = characterAutoWardrobePrompt({ video: true });
  assert.match(prompt, /Base Identity CU Video Sheet/);
  assert.match(prompt, /second image is the completed Auto Wardrobe character sheet/);
  assert.match(prompt, /Do not invent another outfit, redesign the inferred shoes/);
  assert.match(prompt, /all three views/);
  assert.match(prompt, /including the head crops in the two body panels/);
  assert.match(prompt, /full-body views with heads are NOT a template/);
  assert.match(prompt, /heads are outside those crops, they MUST remain outside/);
  assert.match(prompt, /original head angle, eyeline, mouth position and expression/);
  assert.doesNotMatch(prompt, /Visually analyze|otherwise infer footwear/);
});

test("Non-Human Auto Wardrobe respects species, stylization and clothing-compatible anatomy", () => {
  for (const video of [false, true]) {
    const prompt = characterAutoWardrobePrompt({ video, nonHuman: true });
    assert.match(prompt, /Do not humanize/);
    assert.match(prompt, /Include footwear only where compatible/);
    assert.match(prompt, /never invent human feet/);
    assert.match(prompt, /Retain a naturally unclothed design/);
    assert.doesNotMatch(prompt, /underlying facial features, hair, skin detail/);
  }
});

test("Auto Wardrobe output and CU source linkage survive copy, save and package asset remapping", async () => {
  const data = {
    autoWardrobe: true, locked: true, activated: true, cuVideoGeneration: true,
    characterPortrait: { localUrl: "/uploads/portrait.png" }, characterWardrobes: [],
    activeCharacterSheetId: generatedCharacterSheetId(characterAutoWardrobeId),
    characterSheetVariants: [{ wardrobeId: characterAutoWardrobeId, wardrobeUrl: "/uploads/portrait.png",
      generated: { url: "/outputs/auto.png" }, videoGenerated: { url: "/outputs/auto-cu.png" },
      autoWardrobeImageUrl: "/outputs/auto.png" }]
  };
  const copied = cloneNode({ id: "character", type: "character", data });
  const graph = JSON.parse(JSON.stringify({ nodes: [copied] }));
  assert.equal(graph.nodes[0].data.autoWardrobe, true);
  assert.equal(characterOutputReference(graph.nodes[0].data).url, "/outputs/auto.png");
  const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
  const block = server.slice(server.indexOf("function collectWorkflowAssetUrls("), server.indexOf("function rewriteWorkflowPackageAssetReferences("));
  const { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls } = new Function("tryLocalPublicPath",
    `${block}; return { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls };`)(value => /^\/(uploads|outputs)\//.test(value) ? value : "");
  const urls = [...collectWorkflowAssetUrls(graph)];
  assert.deepEqual(new Set(urls), new Set(["/uploads/portrait.png", "/outputs/auto.png", "/outputs/auto-cu.png"]));
  const mapping = new Map(urls.map(url => [url, `/workflow-assets/qa${url}`]));
  const restored = rewriteWorkflowAssetUrls(graph, mapping).nodes[0].data;
  assert.equal(restored.characterSheetVariants[0].autoWardrobeImageUrl, restored.characterSheetVariants[0].generated.url);
  assert.equal(characterOutputReference(restored, { video: true }).url, "/workflow-assets/qa/outputs/auto-cu.png");
  assert.equal(characterWardrobesForGeneration(restored)[0].localUrl, "/workflow-assets/qa/uploads/portrait.png");
});

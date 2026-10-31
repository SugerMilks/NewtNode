import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nonHumanCharacterBasePrompt, nonHumanCharacterIdentityPrompt, nonHumanCharacterWardrobePrompt } from "../src/characterNonHuman.js";
import { characterBaseGenerationSignature, characterBaseVideoGenerationSignature } from "../src/characterSheetWorkflow.js";

test("non-human base guidance preserves species, materials and stylization in both sheet kinds", () => {
  for (const options of [{}, { cinematic: true }, { video: true }]) {
    const prompt = nonHumanCharacterBasePrompt(options);
    assert.match(prompt, /exact number and arrangement of limbs, eyes, heads/);
    assert.match(prompt, /fur, feathers, scales, horns, wings, tails/);
    assert.match(prompt, /Preserve the reference's visual medium and degree of stylization/);
    assert.match(prompt, /Do not force photorealism, human skin texture/);
    assert.match(prompt, /Do not infer male or female human anatomy/);
    assert.match(prompt, /No explicit anatomy, nudity/);
    assert.doesNotMatch(prompt, /ARRI Alexa|men's tight swim trunks|one-piece swimsuit/);
  }
});

test("non-human layouts support quadrupeds, faceless characters and bodies without necks", () => {
  const base = nonHumanCharacterBasePrompt();
  assert.match(base, /quadrupedal or other non-bipedal posture/);
  assert.match(base, /Fit the complete silhouette/);
  assert.match(base, /For a faceless design/);
  const cu = nonHumanCharacterBasePrompt({ video: true });
  assert.match(cu, /no distinct head or neck, keep the whole character/);
  assert.match(cu, /without adding eyes or forcing both eyes into view/);
  assert.match(cu, /only if the character has a mouth/);
  assert.match(cu, /neutral studio background/);
});

test("non-human cinematic mode keeps the requested gray but not human realism requirements", () => {
  const prompt = nonHumanCharacterBasePrompt({ cinematic: true });
  assert.match(prompt, /RGB\(125, 125, 125\), HEX #7D7D7D/);
  assert.match(prompt, /white spacing between panels white/);
  assert.match(prompt, /Cinematic treatment must not change species/);
  assert.match(nonHumanCharacterBasePrompt(), /clean white background/);
  assert.doesNotMatch(nonHumanCharacterBasePrompt(), /polished cinematic lighting/);
});

test("non-human wardrobe prompts preserve source order, accessories and species anatomy", () => {
  for (const video of [false, true]) {
    const prompt = nonHumanCharacterWardrobePrompt({ video });
    assert.match(prompt, /first image as the locked master/);
    assert.match(prompt, /sole authority for identity, anatomy, composition/);
    assert.match(prompt, /exact canvas dimensions, panel layout/);
    assert.match(prompt, /glasses, sunglasses/);
    assert.match(prompt, /lens tint\/opacity/);
    assert.match(prompt, /helmet-mounted goggles separate from sunglasses/);
    assert.match(prompt, /Do not invent a torso, hands, feet, eyes, ears/);
    assert.match(prompt, /Keep existing head crops unchanged/);
    assert.match(prompt, new RegExp(`all ${video ? "three" : "six"} views`));
  }
});

test("the off default preserves legacy signatures while Non-Human invalidates both masters", () => {
  const data = { characterPortrait: { localUrl: "/uploads/reference.png" }, characterSheetModel: "Nano Banana Pro", cinematicCharacterSheet: true };
  for (const signature of [characterBaseGenerationSignature, characterBaseVideoGenerationSignature]) {
    const legacy = signature(data);
    assert.equal(Object.hasOwn(JSON.parse(legacy), "nonHuman"), false);
    assert.equal(signature({ ...data, nonHumanCharacter: false }), legacy);
    assert.equal(signature({ ...data, nonHumanCharacter: "false" }), legacy);
    assert.notEqual(signature({ ...data, nonHumanCharacter: true }), legacy);
    assert.equal(JSON.parse(signature({ ...data, nonHumanCharacter: true })).nonHuman, true);
  }
  const nonHuman = { ...data, nonHumanCharacter: true };
  assert.equal(characterBaseVideoGenerationSignature(nonHuman), characterBaseVideoGenerationSignature({ ...nonHuman, cinematicCharacterSheet: false }));
});

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const names = ["characterImagePromptPieces", "characterVideoPromptPieces", "characterTraitPrompt"];
const functions = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}).join("\n");
const deps = {
  nonHumanCharacterIdentityPrompt,
  characterReferenceLabel: node => `@${node.data.characterName}`,
  characterTag: node => node.data.characterName,
  characterGenerationPhysicalDetailsPrompt: () => "",
  characterOutputReference: () => ({ url: "/outputs/character.png" }),
  activeCharacterVoice: () => null
};
const prompts = new Function(...Object.keys(deps), `${functions}\nreturn { ${names.join(", ")} };`)(...Object.values(deps));

test("downstream image/video identity instructions and traits do not reintroduce humanization", () => {
  const node = { data: { characterName: "Creature", nonHumanCharacter: true, locked: true, activated: true, characterTraits: ["happy"] } };
  const image = prompts.characterImagePromptPieces(node, true).join("\n");
  assert.match(image, /reference labeled "@Creature"/);
  assert.match(image, /Do not humanize/);
  assert.doesNotMatch(image, /identity, face, hair|realistically displayed/);
  const video = prompts.characterVideoPromptPieces(node).join("\n");
  assert.match(video, /For @Creature only:/);
  assert.match(video, /without adding human facial features/);
  const human = { data: { ...node.data, nonHumanCharacter: false } };
  assert.match(prompts.characterImagePromptPieces(human).join("\n"), /identity, face, hair/);
  assert.match(prompts.characterTraitPrompt(human.data), /realistically displayed/);
  assert.doesNotMatch(prompts.characterVideoPromptPieces(human).join("\n"), /Do not humanize/);
});

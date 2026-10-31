import test from "node:test";
import assert from "node:assert/strict";
import { storyboardReferenceMentions, storyboardReferenceTagMatches, storyboardReferenceHighlightParts, tagStoryboardReferences } from "../src/storyboardReferenceTags.js";
import { tagImportedScriptFrames } from "../src/storyboardScriptImport.js";

const references = [
  { nodeId: "man", tag: "Man", name: "Man", color: "cyan", type: "character" },
  { nodeId: "woman", tag: "Woman", name: "Woman", color: "cyan", type: "character" },
  { nodeId: "cafe", tag: "CoffeeShop", name: "Coffee Shop", color: "blue", type: "location-reference" },
  { nodeId: "prop", tag: "Laptop", name: "Laptop", color: "blue", type: "prop-reference" }
];
const parts = (text, refs = references) => storyboardReferenceHighlightParts(text, storyboardReferenceTagMatches(text, refs));

test("script names without @ highlight like explicit tags without changing authored text", () => {
  const text = "Frame the man left and WOMAN right at the Coffee Shop. The woman's laptop faces @Man.";
  const before = structuredClone(references);
  assert.deepEqual(parts(text).filter(part => part.active).map(({ text, color }) => [text, color]), [
    ["man", "cyan"], ["WOMAN", "cyan"], ["Coffee Shop", "blue"], ["woman", "cyan"], ["laptop", "blue"], ["@Man", "cyan"]
  ]);
  assert.equal(parts(text).map(part => part.text).join(""), text);
  assert.deepEqual(references, before);
  assert.equal(tagStoryboardReferences(text, references), "Frame the @Man left and @Woman right at the @CoffeeShop. The @Woman's @Laptop faces @Man.");
  assert.equal(tagStoryboardReferences(tagStoryboardReferences(text, references), references), tagStoryboardReferences(text, references));
});

test("name recognition is exact, whole-name, case insensitive and never guesses pronouns or typos", () => {
  const text = "womanly, manpower, @WomanExtra, @Unknown, @Unknown-Woman, snow-man, human, élman, womané, a@man.test. She speaks to him. Womoan.";
  assert.deepEqual(storyboardReferenceMentions(text, references), []);
  assert.equal(tagStoryboardReferences(text, references), text);
  assert.deepEqual(parts(text).filter(part => part.active), []);
});

test("longest exact names win and shared names or tags remain ambiguous", () => {
  const refs = [
    { nodeId: "a", tag: "SamA", name: "Sam", color: "cyan" },
    { nodeId: "b", tag: "SamB", name: "Sam", color: "cyan" },
    { nodeId: "ann", tag: "Ann", name: "Ann", color: "cyan" },
    { nodeId: "annmarie", tag: "AnnMarie", name: "Ann Marie", color: "blue" },
    { nodeId: "duplicate", tag: "AnnMarie2", name: "Ann Marie", color: "blue" }
  ];
  const text = "Sam meets @SamA, then Ann Marie sees Ann and @AnnMarie. @SamB leaves.";
  assert.deepEqual(parts(text, refs).filter(part => part.active).map(part => part.text), ["@SamA", "Ann", "@AnnMarie", "@SamB"]);
  assert.equal(tagStoryboardReferences(text, refs), "Sam meets @SamA, then Ann Marie sees @Ann and @AnnMarie. @SamB leaves.");
  const unambiguous = refs.slice(0, 4);
  assert.deepEqual(parts("Ann Marie sees Ann.", unambiguous).filter(part => part.active).map(part => part.text), ["Ann Marie", "Ann"]);
  assert.deepEqual(parts("Man and @Man", [...references, { nodeId: "other", tag: "Man", name: "Man" }]).filter(part => part.active), []);
});

test("disconnection or renaming removes name links, while repeats from one source are not ambiguous", () => {
  assert.deepEqual(parts("man and woman", references.filter(item => item.nodeId !== "man")).filter(part => part.active).map(part => part.text), ["woman"]);
  assert.deepEqual(parts("woman and Hero", references.map(item => item.nodeId === "woman" ? { ...item, tag: "Hero", name: "Hero" } : item)).filter(part => part.active).map(part => part.text), ["Hero"]);
  assert.equal(tagStoryboardReferences("Man", [...references, references[0]]), "@Man");
});

test("tag promotion never exceeds shot limits or modifies scripts with no connected names", () => {
  const text = `${" ".repeat(1397)}Man`;
  assert.equal(tagStoryboardReferences(text, references), text);
  assert.equal(tagStoryboardReferences("Man and woman", []), "Man and woman");
  assert.equal(tagStoryboardReferences("" , references), "");
  assert.deepEqual(parts(""), [{ text: "", active: false }]);
});

test("PDF import tags only new descriptions and leaves old shots and literal source-script text intact", () => {
  const old = { id: "old", shotDescription: "The man waits.", prompt: "Existing direction", protected: true, resultUrl: "/outputs/old.png" };
  const added = { id: "new", shotDescription: "The man and woman sit at the Coffee Shop.", prompt: "", shot: "WS", lens: "35mm",
    sourceScript: { dialogue: "Man: hello woman", onScreenText: "Coffee Shop", pages: [2] } };
  const merged = [old, added], before = structuredClone(merged);
  const tagged = tagImportedScriptFrames([old], merged, references);
  assert.equal(tagged[0], old);
  assert.equal(tagged[1].shotDescription, "The @Man and @Woman sit at the @CoffeeShop.");
  for (const key of ["prompt", "shot", "lens", "sourceScript"]) assert.deepEqual(tagged[1][key], added[key]);
  assert.deepEqual(merged, before);
  assert.deepEqual(tagImportedScriptFrames([old], merged, []), merged);
});

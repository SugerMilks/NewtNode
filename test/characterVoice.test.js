import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { characterDialoguePrompt, characterVoicePromptForSource, characterVoiceReferenceInputs } from "../src/characterVoice.js";
import { buildVideoGenerationRequest } from "../src/nodeRunners/videoModels.js";
import { characterBaseGenerationSignature, characterBaseVideoGenerationSignature } from "../src/characterSheetWorkflow.js";
import { scenePortPoint } from "../src/nodeGeometry.js";
import { remapImportedGraph } from "../src/workflowState.js";

const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({
  stdin: { contents: `${editor}\nexport { buildVideoModelPrompt, runVideoModelGeneration, expandVideoDirectorPackageIncoming, normalizeCurrentNode, createDefaultNodeData, getNodeConfig, outputPortIdsForNode, normalizeEditorGraph, buildIncomingByNode, connectedOutputItem };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" }
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { buildVideoModelPrompt, runVideoModelGeneration, expandVideoDirectorPackageIncoming, normalizeCurrentNode, createDefaultNodeData, getNodeConfig, outputPortIdsForNode, normalizeEditorGraph, buildIncomingByNode, connectedOutputItem } = module.exports;
const video = { id: "video", type: "videoModel", data: { model: "Seedance 2.5", duration: "5 seconds", generateAudio: true, aspectRatio: "16:9", resolution: "720p" } };
const character = (name, referenceOnly = true) => ({ id: name, type: "character", data: {
  title: "Character", characterName: name, locked: true, activated: true,
  resultUrl: `/uploads/${name}.png`, characterVoiceReferenceOnly: referenceOnly,
  activeVoiceId: "sample", characterVoices: [{ id: "sample", localUrl: `/uploads/${name}.wav` }],
  compiledVoicePrompt: characterDialoguePrompt
} });
const connection = (source, port = "characterOut") => ({ source, edge: { from: { nodeId: source.id, port }, to: { nodeId: "video", port: port === "voiceOut" ? "referenceAudioIn" : "characterIn" } } });

test("Character offers one output while saved audio-only wires survive reopen and import unchanged", () => {
  const actor = character("Newt");
  actor.data.characterCustomSheets = [{ id: "custom", localUrl: actor.data.resultUrl }];
  actor.data.activeCharacterSheetId = "custom:custom";
  assert.deepEqual(getNodeConfig("character").output.map(port => port.id), ["characterOut"]);
  assert.deepEqual(outputPortIdsForNode(actor), ["characterOut"]);
  const edge = { id: "old-audio", ...connection(actor, "voiceOut").edge };
  const graph = normalizeEditorGraph([actor, video], [edge]);
  const restored = normalizeEditorGraph(...[graph.nodes, graph.edges].map(value => JSON.parse(JSON.stringify(value))));
  const imported = remapImportedGraph(restored, { x: 25, y: 50 }, 123);
  for (const saved of [graph, restored, normalizeEditorGraph(imported.nodes, imported.edges)]) {
    assert.equal(saved.edges.length, 1);
    assert.equal(saved.edges[0].from.port, "voiceOut");
    assert.equal(saved.edges[0].to.port, "referenceAudioIn");
    const target = saved.nodes.find(node => node.type === "videoModel");
    const incoming = buildIncomingByNode(saved.nodes, saved.edges)[target.id];
    assert.equal(incoming.characterIn, undefined, "legacy audio-only wires must not add image references");
    const { source, edge: savedEdge } = incoming.referenceAudioIn[0];
    assert.equal(connectedOutputItem(source, savedEdge).url, "/uploads/Newt.wav");
    assert.equal(connectedOutputItem(source, savedEdge).type, "audio");
    assert.deepEqual(source.data.characterVoices, actor.data.characterVoices);
  }
});

test("legacy voice lines use the Character handle's measured position and fallback", () => {
  const start = editor.indexOf("  function getPortPoint(");
  const code = editor.slice(start, editor.indexOf("\n  function estimatePortPoint", start));
  const actor = { ...character("Newt"), x: 10, y: 20 };
  const fallback = [];
  const resolve = positions => new Function("nodes", "portPositions", "scenePortPoint", "estimatePortPoint", `${code}\nreturn getPortPoint;`)(
    [actor], positions, scenePortPoint, (id, port) => { fallback.push({ id, port }); return { x: 0, y: 0 }; });
  const measured = resolve({ "Newt:characterOut": { x: 800, y: 100 }, "Newt:voiceOut": { x: 800, y: 200 } });
  assert.deepEqual(measured("Newt", "voiceOut"), measured("Newt", "characterOut"));
  resolve({})("Newt", "voiceOut");
  assert.deepEqual(fallback, [{ id: "Newt", port: "characterOut" }]);
});

test("a single Character connection carries the current selected audio in either voice mode", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options = {}) => {
    if (options.body) calls.push(JSON.parse(options.body));
    return Response.json({ video: { localUrl: "/outputs/mock.mp4" } });
  });
  const actor = character("Newt", false);
  actor.data.characterVoices.push({ id: "second", localUrl: "/uploads/second.wav" });
  const incoming = { characterIn: [connection(actor)] };
  for (const referenceOnly of [false, true]) {
    actor.data.characterVoiceReferenceOnly = referenceOnly;
    actor.data.activeVoiceId = referenceOnly ? "second" : "sample";
    const prompt = buildVideoModelPrompt(video, '@Newt says "Hello."', incoming);
    await runVideoModelGeneration({ node: video, incoming, incomingByNode: {}, prompt, index: 0 });
    const request = calls.at(-1);
    assert.deepEqual(request.referenceAudioUrls, [referenceOnly ? "/uploads/second.wav" : "/uploads/Newt.wav"]);
    assert.deepEqual(request.characterReferenceUrls, ["/uploads/Newt.png"]);
    assert.match(request.prompt, referenceOnly ? /VOICE REFERENCE ONLY.*@Audio1/ : /dialogue reference labeled @Audio1/);
  }
  actor.data.activeVoiceId = "";
  const prompt = buildVideoModelPrompt(video, "Newt listens.", incoming);
  await runVideoModelGeneration({ node: video, incoming, incomingByNode: {}, prompt, index: 0 });
  assert.deepEqual(calls.at(-1).referenceAudioUrls, []);
  assert.doesNotMatch(calls.at(-1).prompt, /VOICE REFERENCE ONLY|dialogue reference/);
});

test("legacy dialogue is unchanged; voice-only replaces stale dialogue guidance immediately", () => {
  const actor = character("Newt", false);
  const exact = `${characterDialoguePrompt} Use the dialogue reference labeled @Audio2 for this character.`;
  assert.equal(characterVoicePromptForSource(actor, 2), exact);
  actor.data.characterVoiceReferenceOnly = true;
  const prompt = characterVoicePromptForSource(actor, 2, "Newt");
  assert.match(prompt, /character "Newt": Use @Audio2 only/);
  assert.match(prompt, /subject in the image reference @Newt/);
  assert.match(prompt, /timbre, pitch range, accent, and vocal texture/);
  assert.match(prompt, /written words are authoritative/);
  assert.match(prompt, /Do not repeat, transcribe, or continue/);
  assert.match(prompt, /Do not apply this voice to other characters/);
  assert.match(prompt, /or invent dialogue when none is written/);
  assert.doesNotMatch(prompt, /Use the provided dialogue audio file|Use the dialogue reference/);
  actor.data.characterVoiceReferenceOnly = false;
  assert.equal(characterVoicePromptForSource(actor, 2), exact);
  for (const index of [null, 0, -1, 1.5]) assert.equal(characterVoicePromptForSource(actor, index), "");
});

test("voice mode is opt-in, persists, and does not invalidate generated sheets", () => {
  assert.equal(createDefaultNodeData("character", "Character", 1).characterVoiceReferenceOnly, false);
  for (const value of [undefined, false, "true", true]) {
    const original = character("Newt");
    original.data.characterVoiceReferenceOnly = value;
    const reopened = normalizeCurrentNode(JSON.parse(JSON.stringify(original)));
    assert.equal(reopened.data.characterVoiceReferenceOnly, value === true);
    assert.deepEqual(reopened.data.characterVoices, original.data.characterVoices);
    const before = { ...original.data, characterVoiceReferenceOnly: false };
    for (const signature of [characterBaseGenerationSignature, characterBaseVideoGenerationSignature]) {
      assert.equal(signature(before), signature({ ...before, characterVoiceReferenceOnly: true }));
    }
  }
});

test("only active locked Character voices opt in, and dual connections are deduplicated", () => {
  const actor = character("Newt");
  const incoming = { characterIn: [connection(actor)], referenceAudioIn: [connection(actor, "voiceOut")] };
  assert.equal(characterVoiceReferenceInputs(incoming).length, 1);
  actor.data.locked = false;
  assert.deepEqual(characterVoiceReferenceInputs(incoming), []);
  actor.data.locked = true; actor.data.activeVoiceId = "missing";
  assert.deepEqual(characterVoiceReferenceInputs(incoming), []);
});

test("real prompt and request keep exact-dialogue and voice-reference characters at correct audio indices", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options = {}) => {
    if (options.body) calls.push(JSON.parse(options.body));
    return Response.json({ video: { localUrl: "/outputs/mock.mp4" } });
  });
  const first = character("Newt"), second = character("Higs", false);
  const incoming = {
    referenceAudioIn: [connection({ id: "room", type: "audio", data: { title: "Room", resultUrl: "/uploads/room.wav" } }, "audioOut"), connection(first, "voiceOut")],
    characterIn: [connection(first), connection(second)]
  };
  const written = '@Newt says "A new line." @Higs answers.';
  const prompt = buildVideoModelPrompt(video, written, incoming, {});
  assert.ok(prompt.startsWith(written));
  assert.equal(prompt.match(/VOICE REFERENCE ONLY/g)?.length, 1);
  assert.match(prompt, /character "Newt": Use @Audio2 only/);
  assert.match(prompt, /dialogue reference labeled @Audio3/);
  await runVideoModelGeneration({ node: video, incoming, incomingByNode: {}, prompt, index: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, prompt);
  assert.deepEqual(calls[0].referenceAudioUrls, ["/uploads/room.wav", "/uploads/Newt.wav", "/uploads/Higs.wav"]);
  assert.equal(calls[0].generateAudio, true);
  assert.equal(Object.hasOwn(calls[0], "characterVoiceReferences"), false, "do not invent provider fields");
  assert.deepEqual(calls[0].characterReferenceUrls, ["/uploads/Newt.png", "/uploads/Higs.png"]);
  assert.equal(calls[0].referenceAudioLabels[1], "Character voice Newt", "the voice alias must not replace the Character image alias");
});

test("direct Selected Voice connections work without also connecting Character input", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options = {}) => {
    if (options.body) calls.push(JSON.parse(options.body));
    return Response.json({ video: { localUrl: "/outputs/mock.mp4" } });
  });
  const actor = character("Newt");
  const incoming = { referenceAudioIn: [connection(actor, "voiceOut")], referenceImageIn: [connection({ id: "scene", type: "image", data: { resultUrl: "/uploads/scene.png" } }, "imageOut")] };
  const prompt = buildVideoModelPrompt(video, 'Newt says "Different words."', incoming);
  assert.match(prompt, /character "Newt": Use @Audio1 only/);
  assert.doesNotMatch(prompt, /image reference @Newt/);
  await runVideoModelGeneration({ node: video, incoming, incomingByNode: {}, prompt, index: 0 });
  assert.deepEqual(calls[0].referenceAudioUrls, ["/uploads/Newt.wav"]);
  assert.equal(calls[0].prompt, prompt);
});

test("plain character names still bind to the image and audio after provider alias rewriting", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options = {}) => {
    if (options.body) calls.push(JSON.parse(options.body));
    return Response.json({ video: { localUrl: "/outputs/mock.mp4" } });
  });
  const actor = character("Newt");
  const incoming = { characterIn: [connection(actor)], referenceAudioIn: [connection(actor, "voiceOut")] };
  const prompt = buildVideoModelPrompt(video, 'Newt says "Hello."', incoming);
  await runVideoModelGeneration({ node: video, incoming, incomingByNode: {}, prompt, index: 0 });
  const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const functions = ["rewriteReferenceMentions", "normalizeReferenceNames", "cleanReferenceName", "uniqueReferenceName"].map(name => {
    const start = server.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    return server.slice(start, server.indexOf("\n}", start) + 2);
  }).join("\n");
  const rewrite = new Function(`${functions}\nreturn (request) => rewriteReferenceMentions(request.prompt, {
    imageNames: normalizeReferenceNames(request.referenceImageLabels, request.referenceImageUrls.length),
    audioNames: normalizeReferenceNames(request.referenceAudioLabels, request.referenceAudioUrls.length, "Audio")
  });`)();
  const submitted = rewrite(calls[0]);
  assert.match(submitted, /subject in the image reference @Image1/);
  assert.match(submitted, /character "Newt": Use @Audio1 only/);
  assert.doesNotMatch(submitted, /@Newt/);
});

test("Director expansion preserves new written dialogue and current Character voice mode", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options = {}) => {
    if (options.body) calls.push(JSON.parse(options.body));
    return Response.json({ video: { localUrl: "/outputs/mock.mp4" } });
  });
  const actor = character("Newt");
  const director = { id: "director", type: "skillDirector", data: { skillDirectorBuilt: true, resultText: '@Newt says "Hello again."', skillVideoModel: "Seedance 2.5", skillApproach: "cinematic", skillDirectorAudioMode: "production" } };
  const graph = { director: { characterIn: [connection(actor)] } };
  const incoming = expandVideoDirectorPackageIncoming({ directorIn: [connection(director, "directorOut")] }, graph);
  assert.equal(incoming.characterIn[0].source.id, "Newt");
  const prompt = buildVideoModelPrompt(video, director.data.resultText, incoming, graph);
  assert.match(prompt, /says "Hello again\."/);
  assert.match(prompt, /character "Newt": Use @Audio1 only/);
  await runVideoModelGeneration({ node: video, incoming, incomingByNode: graph, prompt, index: 0 });
  assert.equal(calls[0].prompt, prompt);
  assert.deepEqual(calls[0].referenceAudioUrls, ["/uploads/Newt.wav"]);
  actor.data.characterVoiceReferenceOnly = false;
  const next = buildVideoModelPrompt(video, director.data.resultText, incoming, graph);
  assert.doesNotMatch(next, /VOICE REFERENCE ONLY/);
  assert.match(next, /Use the provided dialogue audio file/);
});

test("unsupported models and routes fail before a paid call; off mode retains existing behavior", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("No network request expected"));
  const incoming = { characterIn: [connection(character("Newt"))] };
  for (const data of [{ model: "Kling 4" }, { model: "MiniMax H3" }, { generateAudio: false }]) {
    await assert.rejects(runVideoModelGeneration({ node: { ...video, data: { ...video.data, ...data } }, incoming, incomingByNode: {}, prompt: "A scene", index: 0 }), /Voice Reference Only/);
  }
  for (const port of ["startFrameIn", "endFrameIn"]) {
    await assert.rejects(runVideoModelGeneration({ node: video, incoming: { ...incoming, [port]: [connection({ id: "frame", type: "image", data: { resultUrl: "/uploads/frame.png" } })] }, incomingByNode: {}, prompt: "A scene", index: 0 }), /Move Start\/End Frame/);
  }
  const common = { node: video, prompt: "Scene", referenceAudioUrls: ["/uploads/Newt.wav"], characterVoiceReferences: characterVoiceReferenceInputs(incoming) };
  assert.throws(() => buildVideoGenerationRequest({ ...common, filmDirector: { videoModel: "Seedance 2.5", audioMode: "silent" } }), /enable audio in Director/);
  assert.throws(() => buildVideoGenerationRequest({ ...common, referenceAudioUrls: [] }), /must be included/);
  assert.throws(() => buildVideoGenerationRequest({ ...common, referenceAudioUrls: [...common.referenceAudioUrls, ...Array.from({ length: 10 }, (_, i) => `/uploads/${i}.wav`)] }), /no more than 10/);
  assert.doesNotThrow(() => buildVideoGenerationRequest({ ...common, startFrameUrls: ["/uploads/frame.png"], characterVoiceReferences: [] }));
});

test("Music Video keeps its soundtrack and does not add competing voice-reference instructions", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options = {}) => {
    if (options.body) calls.push(JSON.parse(options.body));
    return Response.json({ video: { localUrl: "/outputs/mock.mp4" } });
  });
  const actor = character("Newt");
  const music = connection({ id: "music", type: "audio", data: { title: "Music", resultUrl: "/uploads/music.wav" } }, "audioOut");
  const director = { id: "director", type: "skillDirector", data: { skillDirectorBuilt: true, resultText: "@Newt sings along.", skillVideoModel: "Seedance 2.5", skillApproach: "music-video" } };
  const graph = { director: { musicIn: [music], characterIn: [connection(actor)] } };
  const incoming = expandVideoDirectorPackageIncoming({ directorIn: [connection(director, "directorOut")] }, graph);
  const prompt = buildVideoModelPrompt(video, director.data.resultText, incoming, graph);
  assert.doesNotMatch(prompt, /VOICE REFERENCE ONLY|dialogue reference/);
  await runVideoModelGeneration({ node: video, incoming, incomingByNode: graph, prompt, index: 0 });
  assert.deepEqual(calls[0].referenceAudioUrls, ["/uploads/music.wav"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { createDirectorMusicAnalyzer, directorMusicLevelContext } from "../server/director-music.js";
import { filmDirectorMusicVideoError, filmDirectorSupportsMusic, filmDirectorUsesMusic, filmDirectorApproachOptions, normalizeFilmDirectorApproach } from "../src/filmDirectorApproaches.js";
import { applyFilmDirectorAudioPolicyToPrompt, normalizeFilmDirectorAudioMode } from "../src/filmDirectorAudio.js";
import { runSkillDirectorNode } from "../src/nodeRunners/skillDirector.js";
import { buildVideoGenerationRequest } from "../src/nodeRunners/videoModels.js";
import { filmDirectorSetupInputIsLocked } from "../src/filmDirectorScenes.js";

const music = { url: "/uploads/music.wav", label: "Production track" };
const director = { approach: "music-video", audioMode: "production", musicReference: music, videoModel: "Seedance 2.5" };

test("only Music Video and Montage activate the Director Music input", () => {
  for (const { value } of filmDirectorApproachOptions) {
    assert.equal(filmDirectorSupportsMusic(value), ["music-video", "montage"].includes(value));
    assert.equal(filmDirectorUsesMusic(value, [music]), filmDirectorSupportsMusic(value));
    assert.equal(filmDirectorUsesMusic(value, []), value === "music-video");
  }
  assert.equal(filmDirectorSupportsMusic(undefined), false);
  assert.equal(filmDirectorSupportsMusic("unknown"), false);
  assert.equal(filmDirectorUsesMusic("montage", [{ url: " " }]), false);
  assert.equal(filmDirectorMusicVideoError({ approach: "montage" }), "");
  assert.match(filmDirectorMusicVideoError({ approach: "montage", audioInputs: [music], videoModel: "Kling O3 Pro" }), /does not accept/);
});

test("inactive Director music is excluded from every planning action without deleting its connection", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ text: "Draft" }));
  });
  const incoming = { musicIn: [{ source: { id: "music", data: { resultUrl: music.url, title: music.label } } }] };
  const original = structuredClone(incoming);
  for (const { value: skillApproach } of filmDirectorApproachOptions) {
    for (const skillDirectorAction of ["style", "motion", "shotList", "build", "revise"]) {
      await runSkillDirectorNode({ node: { id: "director", data: { skillApproach, skillDirectorAction, skillVideoModel: "Seedance 2.5", skillDirectorAudioMode: "production" } }, incoming, sourceLabel: () => "Music" });
      assert.equal(request.audioInputs.length, filmDirectorSupportsMusic(skillApproach) ? 1 : 0);
      assert.equal(request.audioMode, filmDirectorSupportsMusic(skillApproach) ? "full" : "production");
    }
  }
  assert.deepEqual(incoming, original);
});

test("Montage forwards optional music without forcing singing or changing unconnected audio", () => {
  for (const model of ["Seedance 2.0", "Seedance 2.5", "MiniMax H3"]) {
    const request = buildVideoGenerationRequest({ node: { data: { model, generateAudio: false } }, filmDirector: { ...director, approach: "montage", videoModel: model }, referenceImageUrls: ["/uploads/subject.png"], referenceAudioUrls: ["/uploads/ignored.wav"] });
    assert.deepEqual(request.referenceAudioUrls, [music.url]);
    assert.equal(request.generateAudio, true);
  }
  const unconnected = buildVideoGenerationRequest({ node: { data: { model: "Seedance 2.5" } }, filmDirector: { ...director, approach: "montage", musicReference: null, audioMode: "silent" } });
  assert.deepEqual(unconnected.referenceAudioUrls, []);
  assert.equal(unconnected.generateAudio, false);
});

test("the actual video package excludes inactive Director music and refreshes its prompt policy", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function directorPackageForVideo(");
  const source = editor.slice(start, editor.indexOf("function directorPackageStoryboardSceneDescription(", start));
  const deps = { filmDirectorSupportsMusic, filmDirectorUsesMusic, normalizeFilmDirectorApproach, normalizeFilmDirectorAudioMode, applyFilmDirectorAudioPolicyToPrompt,
    connectedAssetItems: (items = []) => items.map(({ source }) => ({ url: source.data.resultUrl, label: source.data.title })), filmDirectorReferenceVideoMode: () => "",
    normalizeFilmDirectorVideoModel: (v) => v, normalizeFilmDirectorResolution: (v) => v, normalizeFilmDirectorAspectRatio: (v) => v };
  const pack = new Function(...Object.keys(deps), source + ";return directorPackageForVideo;")(...Object.values(deps));
  const incoming = { director: { musicIn: [{ source: { data: { resultUrl: music.url, title: music.label } } }] } };
  for (const { value: skillApproach } of filmDirectorApproachOptions) {
    const result = pack({ id: "director", data: { skillApproach, skillDirectorBuilt: true, resultText: "CUT 1: An arrival.", skillDirectorAudioMode: "production" } }, incoming);
    assert.deepEqual(result.musicReference, filmDirectorSupportsMusic(skillApproach) ? music : null);
    assert.equal(result.audioMode, filmDirectorSupportsMusic(skillApproach) ? "full" : "production");
    if (skillApproach === "montage") assert.match(result.finalPrompt, /montage soundtrack/);
    if (!filmDirectorSupportsMusic(skillApproach)) assert.match(result.finalPrompt, /Background music: NONE/);
  }
});

test("the actual canvas connection validator rejects drops onto inactive Music ports", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("  function getConnectionError(");
  const source = editor.slice(start, editor.indexOf("  function getPortPoint(", start));
  const deps = { filmDirectorSupportsMusic, filmDirectorSetupInputIsLocked, outputPortIdsForNode: () => ["audioOut"], inputPortIdsForNode: () => ["musicIn"],
    isImageModelUnsupportedInput: () => false, isImageModelUnsupportedSource: () => false, isVideoModelUnsupportedInput: () => false,
    getPortCompatibilityError: () => "Reached compatibility check" };
  const validate = new Function(...Object.keys(deps), source + ";return getConnectionError;")(...Object.values(deps));
  for (const { value: skillApproach } of filmDirectorApproachOptions) {
    const nodes = [{ id: "audio", type: "audio", data: {} }, { id: "director", type: "skillDirector", data: { skillApproach } }];
    const result = validate({ nodeId: "audio", port: "audioOut" }, { nodeId: "director", port: "musicIn" }, nodes);
    assert.equal(result, filmDirectorSupportsMusic(skillApproach) ? "Reached compatibility check" : "Music is available for Music Video and Montage only");
  }
});

test("Music Video requires real audio and rejects unsupported video models", () => {
  assert.equal(filmDirectorMusicVideoError({ approach: "cinematic" }), "");
  assert.match(filmDirectorMusicVideoError({ approach: "music-video" }), /Connect an audio file/);
  for (const videoModel of ["", "Seedance 2.0", "Seedance 2.5", "MiniMax H3"]) assert.equal(filmDirectorMusicVideoError({ approach: "music-video", audioInputs: [music], videoModel }), "");
  assert.match(filmDirectorMusicVideoError({ approach: "music-video", audioInputs: [music], videoModel: "Kling O3 Pro" }), /Kling does not accept/);
  assert.equal(filmDirectorSetupInputIsLocked({ setup: true }, "musicIn"), true);
});

test("Director rejects missing music before calling a paid API and sends full-resolution audio when connected", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ text: "A polished performance.", approach: "music-video", audioMode: "full" }));
  });
  const node = { id: "director", data: { skillApproach: "music-video", skillDirectorAction: "style", skillVideoModel: "Seedance 2.5" } };
  await assert.rejects(runSkillDirectorNode({ node, incoming: {}, sourceLabel: () => "Audio" }), /Connect an audio/);
  assert.equal(requests.length, 0);
  const incoming = { musicIn: [{ source: { id: "music", type: "audio", data: { title: "Track", resultUrl: music.url, thumbnailUrl: "/thumbnail.png" } } }] };
  await runSkillDirectorNode({ node, incoming, sourceLabel: () => "Audio" });
  assert.equal(requests[0].audioInputs[0].url, music.url);
  assert.equal(requests[0].audioMode, "full");
});

test("video requests use only the Director's selected music, enable sound and refuse routes that drop audio", () => {
  for (const model of ["Seedance 2.0", "Seedance 2.5", "MiniMax H3"]) {
    const request = buildVideoGenerationRequest({ node: { data: { model, generateAudio: false } }, filmDirector: { ...director, videoModel: model }, referenceImageUrls: ["/uploads/subject.png"], referenceAudioUrls: ["/uploads/unrelated.wav"] });
    assert.deepEqual(request.referenceAudioUrls, [music.url]);
    assert.equal(request.generateAudio, true);
  }
  const args = { node: { data: { model: "Seedance 2.5" } }, filmDirector: director };
  assert.throws(() => buildVideoGenerationRequest({ ...args, filmDirector: { ...director, musicReference: null } }), /Connect an audio/);
  assert.throws(() => buildVideoGenerationRequest({ ...args, startFrameUrls: ["/uploads/first.png"] }), /reference-to-video/);
  assert.throws(() => buildVideoGenerationRequest({ ...args, endFrameUrls: ["/uploads/last.png"] }), /reference-to-video/);
  assert.throws(() => buildVideoGenerationRequest({ ...args, filmDirector: { ...director, videoModel: "Kling O3 Pro" } }), /Kling does not accept/);
  assert.throws(() => buildVideoGenerationRequest({ ...args, filmDirector: { ...director, videoModel: "MiniMax H3" } }), /reference image or video/);
  const cinematic = buildVideoGenerationRequest({ ...args, filmDirector: { ...director, approach: "cinematic", audioMode: "silent" }, referenceAudioUrls: ["/uploads/direct.wav"] });
  assert.deepEqual(cinematic.referenceAudioUrls, ["/uploads/direct.wav"]);
  assert.equal(cinematic.generateAudio, false);
});

test("local music timing identifies level changes without claiming tempo or lyrics", () => {
  const samples = new Float32Array(24000);
  samples.fill(0.02, 0, 8000);
  samples.fill(0.5, 8000, 16000);
  samples.fill(0.1, 16000);
  const context = directorMusicLevelContext(samples);
  assert.match(context, /3.00 seconds/);
  assert.match(context, /energy rises: 1.00s/);
  assert.match(context, /not a listening description, verified beat grid/);
  assert.match(context, /Do not invent BPM, lyrics/);
  assert.throws(() => directorMusicLevelContext(new Float32Array(8000)), /silent/);
  assert.throws(() => directorMusicLevelContext(new Float32Array()), /silent/);
});

test("real FFmpeg music analysis is bounded, local, duration-aware and reusable", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "newtnode-music-test-"));
  try {
    const filePath = path.join(directory, "track.wav");
    await promisify(execFileCallback)(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-y", filePath]);
    const analyze = createDirectorMusicAnalyzer({ resolveAsset: async () => ({ filePath }), ffmpegPath: ffmpeg, ffprobePath: ffprobe.path });
    const context = await analyze(music, 2);
    assert.match(context, /file duration: 3.00 seconds/);
    assert.match(context, /segment: 2.00 seconds/);
    assert.equal(await analyze(music, 2), context);
    assert.match(await analyze(music, 5), /track ends before the requested video duration/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the actual Director expansion forwards music only for active Music Video or Montage scenes", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function expandVideoDirectorPackageIncoming(");
  const end = editor.indexOf("function expandStoryboardDirectorIncoming(", start);
  const expand = new Function("directorPackageConnections", "uniqueConnectionItems", "filmDirectorReferenceVideoMode", "directorSceneUsesConnection", "filmDirectorUsesMusic", editor.slice(start, end) + ";return expandVideoDirectorPackageIncoming;")((items) => items, (items) => items, () => "", () => false, filmDirectorUsesMusic);
  const track = { source: { id: "music", data: { resultUrl: music.url } } };
  const source = { id: "director", data: { skillApproach: "music-video" } };
  const inputs = { directorIn: [{ source }], referenceAudioIn: [{ source: { id: "unrelated" } }] };
  assert.deepEqual(expand(inputs, { director: { musicIn: [track] } }).referenceAudioIn, [track]);
  assert.deepEqual(expand(inputs, {}).referenceAudioIn, []);
  source.data.skillApproach = "montage";
  assert.deepEqual(expand(inputs, { director: { musicIn: [track] } }).referenceAudioIn, [track]);
  assert.deepEqual(expand(inputs, {}).referenceAudioIn, inputs.referenceAudioIn);
  source.data.skillApproach = "cinematic";
  assert.deepEqual(expand(inputs, { director: { musicIn: [track] } }).referenceAudioIn, inputs.referenceAudioIn);
});

test("Music Video preserves Character identity but excludes competing Character voice instructions", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function buildEffectiveVideoPrompt(");
  const end = editor.indexOf("function storyboardVideoReferencePromptPiece(", start);
  const dependencies = {
    filmDirectorUsesMusic,
    directorPackageConnections: (items) => items,
    connectedAudioUrls: () => [music.url],
    connectedCharacterVoiceUrls: () => ["/uploads/voice.wav"],
    activeCharacterVoice: () => ({ localUrl: "/uploads/voice.wav" }),
    characterVideoPromptPieces: (_source, audioIndex) => ["Preserve character identity.", audioIndex ? `Use @Audio${audioIndex} voice.` : ""],
    storyboardVideoReferencePromptPiece: () => ""
  };
  const build = new Function(...Object.keys(dependencies), editor.slice(start, end) + ";return buildEffectiveVideoPrompt;")(...Object.values(dependencies));
  const incoming = { characterIn: [{ source: {} }], directorIn: [{ source: { data: { skillApproach: "music-video" } } }] };
  assert.equal(build("Scene", incoming), "Scene\n\nPreserve character identity.");
  assert.match(build("Scene", { ...incoming, directorIn: [] }), /Use @Audio2 voice/);
});

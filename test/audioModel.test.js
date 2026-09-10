import test from "node:test";
import assert from "node:assert/strict";
import { audioModelDefaults, buildAudioRequest, normalizeAudioModelData, estimateAudioCost, audioInputEnabled, audioRunLabel } from "../src/audioModel.js";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { apiKeyProviderIds, activateApiKeyVersion, addApiKeyVersion, normalizeApiKeyVersions } from "../src/apiKeyVersions.js";
import { appendedNodeResultState, batchRunError, isRunnableNode, runRunnableNodesByDependencyOrder } from "../src/nodeRunner.js";
import { clearStaleRunningState } from "../src/workflowState.js";
import { shouldNotifyNodeGenerationComplete } from "../src/generationChime.js";
import { buildProjectOutputItems } from "../src/projectOutputs.js";

const settings = (patch = {}) => ({ ...audioModelDefaults, voiceId: "test_voice", prompt: "Hello world.", ...patch });

test("Audio Model follows Video Model and shares versioned provider toggles", () => {
  assert.equal(nodeTypeDefinitions[nodeTypeDefinitions.findIndex((entry) => entry.type === "videoModel") + 1].type, "audioModel");
  assert(apiKeyProviderIds.includes("elevenLabs"));
  const existing = normalizeApiKeyVersions({ fal: [{ value: "existing", enabled: true }] });
  const added = addApiKeyVersion(existing, "elevenLabs");
  added.elevenLabs[1].value = "second-test-key";
  const selected = activateApiKeyVersion(added, "elevenLabs", 1);
  assert.deepEqual(selected.elevenLabs.map((entry) => entry.enabled), [false, true]);
  assert.deepEqual(selected.fal, existing.fal);
});

test("TTS preserves literal text, sends voice parameters and integer seed zero", () => {
  const request = buildAudioRequest(settings({ seed: 0, speed: 0.9 }));
  assert.equal(request.endpoint, "/v1/text-to-speech/test_voice");
  assert.equal(request.body.text, "Hello world.");
  assert.equal(request.body.seed, 0);
  assert.equal(request.body.voice_settings.speed, 0.9);
  assert.equal(request.outputFormat, "mp3_44100_128");
  const v3 = buildAudioRequest(settings({ ttsModel: "eleven_v3", stability: 0.8 }));
  assert.deepEqual(v3.body.voice_settings, { stability: 1 });
});

test("Speech-to-speech uses source performance and never submits the text prompt", () => {
  const request = buildAudioRequest(settings({ audioMode: "sts", sourceAudioUrl: "/uploads/test/speech.wav", removeBackgroundNoise: true }));
  assert.equal(request.endpoint, "/v1/speech-to-speech/test_voice");
  assert.equal(request.body.model_id, "eleven_multilingual_sts_v2");
  assert.equal(request.body.remove_background_noise, true);
  assert.equal(request.body.text, undefined);
  assert.equal(request.body.voice_settings.speed, undefined);
  assert.equal(audioInputEnabled("sts", "promptIn"), false);
  assert.equal(audioInputEnabled("tts", "audioIn"), false);
});

test("Sound effects and music send mode-specific controls without voice fields", () => {
  const sfx = buildAudioRequest(settings({ audioMode: "sfx", loop: true, durationSeconds: 30, promptInfluence: 0.8 }));
  assert.deepEqual(sfx.body, { text: "Hello world.", model_id: "eleven_text_to_sound_v2", loop: true, prompt_influence: 0.8, duration_seconds: 30 });
  const music = buildAudioRequest(settings({ audioMode: "music", musicModel: "music_v2", musicDurationSeconds: 120, seed: "not-used" }));
  assert.deepEqual(music.body, { prompt: "Hello world.", model_id: "music_v2", force_instrumental: true, music_length_ms: 120000 });
  assert.equal(buildAudioRequest(settings({ audioMode: "music", autoDuration: true })).body.music_length_ms, undefined);
  assert.equal(buildAudioRequest(settings({ audioMode: "sfx", autoDuration: true })).body.duration_seconds, undefined);
});

test("invalid voices, missing speech, long text and invalid seeds fail locally", () => {
  assert.throws(() => buildAudioRequest(settings({ voiceId: "../../path" })), /voice/);
  assert.throws(() => buildAudioRequest(settings({ audioMode: "sts" })), /recording/);
  assert.throws(() => buildAudioRequest(settings({ prompt: " " })), /text prompt/);
  assert.throws(() => buildAudioRequest(settings({ ttsModel: "eleven_v3", prompt: "x".repeat(5001) })), /5,000/);
  assert.throws(() => buildAudioRequest(settings({ seed: -1 })), /Seed/);
  assert.throws(() => buildAudioRequest(settings({ audioMode: "other" })), /mode/);
});

test("normalization preserves old outputs and restores valid controls", () => {
  const data = normalizeAudioModelData({ resultUrl: "/outputs/a.mp3", resultItems: [{ type: "audio", url: "/outputs/a.mp3" }], durationSeconds: 99, musicDurationSeconds: -1, batchCount: 8, ttsModel: "bad" });
  assert.equal(data.resultUrl, "/outputs/a.mp3");
  assert.equal(data.resultItems.length, 1);
  assert.equal(data.durationSeconds, 30);
  assert.equal(data.musicDurationSeconds, 3);
  assert.equal(data.batchCount, "4");
  assert.equal(data.ttsModel, audioModelDefaults.ttsModel);
});

test("published audio estimates scale by text, duration and batch; unknown stays unknown", () => {
  assert.equal(estimateAudioCost(settings(), { prompt: "a".repeat(1000), batchCount: 4 }).amountUsd, 0.4);
  assert.equal(estimateAudioCost(settings({ ttsModel: "eleven_flash_v2_5" }), { prompt: "a".repeat(1000) }).amountUsd, 0.05);
  assert.equal(estimateAudioCost(settings({ audioMode: "music", musicDurationSeconds: 60 })).amountUsd, 0.15);
  assert.equal(estimateAudioCost(settings({ audioMode: "sfx", durationSeconds: 30 })).amountUsd, 0.06);
  assert.equal(estimateAudioCost(settings({ audioMode: "sts" })).amountUsd, null);
  assert.equal(estimateAudioCost(settings({ audioMode: "sts" }), { durationSeconds: 30 }).amountUsd, 0.06);
  assert.equal(estimateAudioCost(settings({ audioMode: "music", autoDuration: true })).amountUsd, null);
  assert.equal(estimateAudioCost(settings(), { customVoiceRate: true }).amountUsd, null);
  assert.equal(audioRunLabel({ amountUsd: 0.001 }), "Run Audio (<$0.01)");
  assert.equal(audioRunLabel({ amountUsd: null }), "Run Audio (cost varies)");
});

test("audio batching, project outputs and one completion chime use standard result state", async () => {
  const node = { id: "audio", type: "audioModel", data: { status: "running" } };
  assert.equal(isRunnableNode(node), true);
  const next = appendedNodeResultState([{ url: "/outputs/old.mp3" }], [{ url: "/outputs/new.mp3" }], "audio");
  assert.equal(next.firstNewIndex, 1);
  assert.equal(next.resultItems[1].type, "audio");
  assert.equal(shouldNotifyNodeGenerationComplete(node, { ...node, data: { status: "running" } }), false);
  assert.equal(shouldNotifyNodeGenerationComplete(node, { ...node, data: { status: "complete" } }), true);
  const recovered = clearStaleRunningState({ ...node, data: { status: "running", resultUrl: "/outputs/old.mp3", resultItems: next.resultItems } });
  assert.equal(recovered.data.status, "complete");
  assert.deepEqual(recovered.data.resultItems, next.resultItems);
  assert.match(batchRunError("audio", 2, [{}], [{ reason: new Error("Run 2 failed") }]), /1 of 2 audio/);
  const outputs = buildProjectOutputItems({ nodes: [{ ...node, data: { resultItems: next.resultItems } }], getNodeResultMediaType: () => "audio" });
  assert.equal(outputs.length, 2);
  assert(outputs.every((item) => item.mimeType === "audio/mpeg"));
  const order = [];
  await runRunnableNodesByDependencyOrder([{ id: "video", type: "videoModel" }, node], [{ from: { nodeId: "audio" }, to: { nodeId: "video" } }], { runNode: async (n) => { order.push(n.id); return { status: "complete" }; } });
  assert.deepEqual(order, ["audio", "video"]);
});

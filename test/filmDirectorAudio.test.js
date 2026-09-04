import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFilmDirectorAudioPolicyToPrompt,
  filmDirectorAudioModeOptions,
  filmDirectorAudioPolicyPrompt,
  filmDirectorGenerateAudio,
  filmDirectorVisualSceneRules,
  normalizeFilmDirectorAudioMode
} from "../src/filmDirectorAudio.js";

test("Film Director exposes three clear audio modes with Production Sound as the default", () => {
  assert.deepEqual(filmDirectorAudioModeOptions, [
    { value: "production", label: "Production Sound" },
    { value: "full", label: "Full Audio" },
    { value: "silent", label: "Silent" }
  ]);
  assert.equal(normalizeFilmDirectorAudioMode(""), "production");
  assert.equal(normalizeFilmDirectorAudioMode("Full Audio"), "full");
  assert.equal(normalizeFilmDirectorAudioMode("No Audio"), "silent");
});

test("Production Sound explicitly protects the beginning and ending from music cues", () => {
  const policy = filmDirectorAudioPolicyPrompt("production");

  assert.match(policy, /Production sound only/i);
  assert.match(policy, /Background music: NONE/);
  assert.match(policy, /intro cue, or outro cue/i);
  assert.match(policy, /From 0:00 through the final frame/i);
});

test("Silent disables native audio while Production Sound and Full Audio retain it", () => {
  assert.equal(filmDirectorGenerateAudio("production"), true);
  assert.equal(filmDirectorGenerateAudio("full"), true);
  assert.equal(filmDirectorGenerateAudio("silent"), false);
});

test("Film Director upgrades legacy scene rules without moving asset tags", () => {
  const legacy = [
    "@Emma = Character reference.",
    "",
    "Scene rules: Absolutely no music, no music score, no audio effects. Cinematic naturalism, environmental sounds, natural ambience.",
    "",
    "Scene Overview:",
    "@Emma crosses the room."
  ].join("\n");
  const upgraded = applyFilmDirectorAudioPolicyToPrompt(legacy, "silent");

  assert.equal(upgraded.split("\n")[0], "@Emma = Character reference.");
  assert.equal(upgraded.includes(filmDirectorVisualSceneRules), true);
  assert.match(upgraded, /Audio policy: Silent output/);
  assert.doesNotMatch(upgraded, /environmental sounds, natural ambience/i);
});

test("switching to Full Audio removes a previous restrictive audio policy", () => {
  const production = `${filmDirectorVisualSceneRules}\n\n${filmDirectorAudioPolicyPrompt("production")}\n\nScene Overview:\nA quiet room.`;
  const full = applyFilmDirectorAudioPolicyToPrompt(production, "full");

  assert.match(full, /Audio policy: Full native synchronized audio/);
  assert.doesNotMatch(full, /Background music: NONE/);
});

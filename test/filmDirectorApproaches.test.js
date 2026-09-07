import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as approaches from "../src/filmDirectorApproaches.js";
import * as audio from "../src/filmDirectorAudio.js";
import * as style from "../src/filmDirectorStyle.js";
import * as scenes from "../src/filmDirectorScenes.js";
import * as revision from "../src/filmDirectorRevision.js";
import * as detail from "../src/filmDirectorShotDetail.js";
import * as limits from "../src/filmDirectorLimits.js";
import { filmDirectorShotListSourceSignature, filmDirectorStageNeedsDraft } from "../src/filmDirectorStageLocks.js";
import { runSkillDirectorNode } from "../src/nodeRunners/skillDirector.js";
import { creativeSchemas, validateCreativeResponse } from "../server/creative-llm.js";

test("Cinematic remains the unchanged default for legacy and new scenes", () => {
  assert.deepEqual(approaches.filmDirectorApproachOptions.map((option) => option.label), ["Cinematic", "Vintage", "Animation", "Stop-Motion", "Commercial", "Music Video", "Montage"]);
  assert.equal(approaches.normalizeFilmDirectorApproach(), "cinematic");
  assert.equal(approaches.normalizeFilmDirectorApproach("unknown"), "cinematic");
  assert.equal(approaches.normalizeFilmDirectorApproach("Animation"), "animation");
  assert.equal(approaches.filmDirectorSceneRules(), "Scene rules: Cinematic naturalism, premium live-action realism, motivated light, cine lens language, grounded acting, real physics, no subtitles, continuity, 24fps smooth motion.");
  assert.equal(style.filmDirectorStyleDirectionDirective(), style.filmDirectorStyleDirectionDirective("cinematic"));
  const old = { sceneName: "Existing", resultText: "Existing output", styleDirection: "User's style", skillDirectorLocks: { setup: true, style: true } };
  const snapshot = scenes.filmDirectorSceneSnapshot(old);
  assert.equal(snapshot.skillApproach, "cinematic");
  assert.equal(snapshot.resultText, old.resultText);
  assert.equal(snapshot.styleDirection, old.styleDirection);
  assert.equal(snapshot.skillDirectorLocks.style, true);
  assert.equal(approaches.filmDirectorApproachChanged(snapshot), false);
  assert.equal(scenes.addFilmDirectorScene({ skillApproach: "animation" }).skillApproach, "cinematic");
});

test("Vintage and Animation use distinct production vocabulary and camera defaults", () => {
  const vintage = style.filmDirectorStyleDirectionDirective("vintage");
  for (const phrase of ["8mm film", "16fps", "hand-cranked", "muted colors", "halation", "visual grain", "audio policy"]) assert.ok(vintage.includes(phrase));
  const animation = style.filmDirectorStyleDirectionDirective("animation");
  for (const phrase of ["cel animation", "CGI animation", "high contrast", "clean colors", "one coherent medium", "virtual-camera"]) assert.ok(animation.includes(phrase));
  for (const approach of ["vintage", "animation"]) {
    assert.match(style.filmDirectorStyleDirectionDirective(approach), /3-6 concise sentences/);
    assert.match(style.filmDirectorStyleDirectionDirective(approach), /Do not include camera movement or placement/);
    assert.doesNotMatch(approaches.filmDirectorSceneRules(approach), /premium live-action realism|24fps smooth motion/);
  }
  assert.match(approaches.filmDirectorDefaultCameraDirection("animation"), /virtual-camera/);
  assert.match(approaches.filmDirectorDefaultCameraDirection("vintage"), /simple practical handheld/i);
});

test("audio policy refreshes retain the approach and leading asset tags", () => {
  for (const approach of ["cinematic", "vintage", "animation"]) {
    const prompt = "@Emma = Character.\n@Room = Location.\n\nScene rules: old rules.\n\nShot List:\nCUT 1: @Emma enters @Room.";
    for (const mode of ["production", "silent", "full"]) {
      const updated = audio.applyFilmDirectorAudioPolicyToPrompt(prompt, mode, approach);
      assert.ok(updated.startsWith("@Emma = Character.\n@Room = Location."));
      assert.ok(updated.includes(approaches.filmDirectorSceneRules(approach)));
      assert.ok(updated.includes(audio.filmDirectorAudioPolicyPrompt(mode)));
      assert.equal(audio.applyFilmDirectorAudioPolicyToPrompt(updated, mode, approach), updated);
      assert.equal((updated.match(/^Scene rules:/gm) || []).length, 1);
    }
  }
});

test("scene tabs and revision history preserve independent approaches", () => {
  const original = { sceneName: "Vintage scene", skillApproach: "vintage", skillDirectorLockedApproach: "vintage", resultText: "Vintage output" };
  const added = { ...original, ...scenes.addFilmDirectorScene(original), skillApproach: "animation", resultText: "Animation output" };
  const restored = scenes.switchFilmDirectorScene(added, "scene-1");
  assert.equal(restored.skillApproach, "vintage");
  assert.equal(restored.resultText, "Vintage output");
  const history = revision.appendFilmDirectorRevisionVersionHistory([], { current: original, revised: added, notes: "Change approach" });
  assert.equal(history.history[0].snapshot.skillApproach, "vintage");
  assert.equal(history.history[1].snapshot.skillApproach, "animation");
  assert.equal(revision.createFilmDirectorRevisionSnapshot({}).skillApproach, "cinematic");
  const patch = revision.filmDirectorRevisionStatePatch(original, { approach: "animation" });
  assert.equal(patch.skillApproach, "animation");
  assert.equal(patch.skillDirectorLockedApproach, "animation");
  assert.equal(revision.filmDirectorRevisionStatePatch(original, {}).skillApproach, "vintage");
});

test("approach changes invalidate dependent shot drafts without invalidating legacy Cinematic signatures", () => {
  const original = { sceneOverview: "An arrival", motionDirection: "A push in", shotList: "CUT 1: Arrival" };
  original.skillDirectorShotListSourceSignature = filmDirectorShotListSourceSignature(original);
  assert.equal(filmDirectorShotListSourceSignature({ ...original, skillApproach: "cinematic" }), original.skillDirectorShotListSourceSignature);
  assert.equal(filmDirectorStageNeedsDraft("shotList", original), false);
  for (const approach of ["vintage", "animation"]) {
    const changed = { ...original, skillApproach: approach };
    assert.equal(approaches.filmDirectorApproachChanged(changed), true);
    assert.equal(filmDirectorStageNeedsDraft("shotList", changed), true);
    assert.equal(approaches.filmDirectorApproachChanged({ ...changed, skillDirectorLockedApproach: approach }), false);
  }
});

test("revision contracts preserve approach unless explicitly changed and validate the allowed choices", () => {
  const prompt = revision.buildFilmDirectorRevisionPrompt({ approach: "vintage", revisionNotes: "Remove a line." });
  assert.match(prompt, /The approach is vintage\. Preserve it unless the user explicitly requests a different approach/);
  assert.match(prompt, /"approach":"vintage"/);
  assert.deepEqual(creativeSchemas["film-director-revision"].properties.approach.enum, approaches.filmDirectorApproachOptions.map((option) => option.value));
  const payload = { changeSummary: "Updated", sceneName: "Scene", videoModel: "", durationSeconds: "5", resolution: "720p", aspectRatio: "16:9", audioMode: "production", approach: "animation", activeReferenceTags: [], styleDirection: "Cel animation", cameraDirection: "Virtual camera", sceneOverview: "Arrival", recommendedShotCount: 1, continuityLedger: "Same room", mustHaveActions: "Arrival", cuts: [{ number: 1, shotFrame: "MS", cameraMovement: "Static", shotType: "Arrival", description: "Character arrives" }] };
  const validate = (data) => validateCreativeResponse({}, { route: "film-director-revision", provider: "test", text: JSON.stringify(data) });
  assert.equal(validate(payload).approach, "animation");
  assert.throws(() => validate({ ...payload, approach: "unknown" }), /planning data/);
});

// Evaluate the actual server planning functions without starting the app or calling paid APIs.
const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const planningSource = server.slice(server.indexOf("const skillDirectorFinalPromptMaxChars ="), server.indexOf("async function runFilmDirector(input)"));
const dependencies = { ...approaches, ...audio, ...style, ...scenes, ...revision, ...detail, ...limits, skillDirectorDurationLabel: (duration) => `${duration}-second` };
const planning = new Function(...Object.keys(dependencies), `${planningSource}\nreturn { buildSkillDirectorPrompt, composeSkillDirectorFinalPrompt };`)(...Object.values(dependencies));

test("Montage music policy survives formatting and disappears when the live connection is inactive", () => {
  const input = { approach: "montage", referenceLines: ["@Subject = Character."], audioMode: "production", shotList: "CUT 1: @Subject enters." };
  const without = planning.composeSkillDirectorFinalPrompt(input);
  assert.match(without, /Production sound only/);
  const withMusic = planning.composeSkillDirectorFinalPrompt({ ...input, connectedMusic: true });
  assert.match(withMusic, /connected music reference as the montage soundtrack/);
  assert.match(withMusic, /Do not add singing performances unless requested/);
  assert.doesNotMatch(withMusic, /Background music: NONE|Production sound only/);
  assert.ok(withMusic.startsWith("@Subject = Character."));
  assert.equal(audio.applyFilmDirectorAudioPolicyToPrompt(withMusic, "full", "montage"), withMusic);
  assert.doesNotMatch(audio.applyFilmDirectorAudioPolicyToPrompt(withMusic, "production", "montage", false), /montage soundtrack/);
  for (const approach of ["cinematic", "vintage", "animation", "stop-motion", "commercial"]) {
    assert.equal(planning.composeSkillDirectorFinalPrompt({ ...input, approach, connectedMusic: true }), planning.composeSkillDirectorFinalPrompt({ ...input, approach }));
  }
  const prompt = planning.buildSkillDirectorPrompt({ ...input, action: "shotList", musicContext: "Energy rises at 2s." });
  assert.match(prompt, /Energy rises at 2s/);
  assert.match(prompt, /montage soundtrack/);
});

test("all planning stages receive the selected approach without changing Cinematic prompts", () => {
  for (const action of ["style", "motion", "shotList", "build"]) {
    const input = { action, sceneName: "Scene", sceneOverview: "A visitor enters", durationSeconds: "5", shotCount: "1" };
    assert.equal(planning.buildSkillDirectorPrompt(input), planning.buildSkillDirectorPrompt({ ...input, approach: "cinematic" }));
    for (const approach of ["vintage", "animation"]) {
      const prompt = planning.buildSkillDirectorPrompt({ ...input, approach });
      assert.ok(prompt.includes(approaches.filmDirectorApproachDirective(approach)), `${action} must receive ${approach} direction`);
      assert.doesNotMatch(prompt, /High-end cinematic scene, shot on cinema camera/);
    }
  }
});

test("final assembly keeps tags first, uses approach rules and retains those rules under the context cap", () => {
  for (const approach of ["cinematic", "vintage", "animation"]) {
    for (const long of [false, true]) {
      const prompt = planning.composeSkillDirectorFinalPrompt({
        approach, referenceLines: ["@Emma = Character."], audioMode: "silent",
        sceneOverview: long ? "@Emma crosses the room. ".repeat(500) : "@Emma crosses the room.",
        styleDirection: "Muted colors.", shotList: "CUT 1: @Emma enters."
      });
      assert.ok(prompt.startsWith("@Emma = Character.\n\n" + approaches.filmDirectorSceneRules(approach)));
      assert.match(prompt, /Audio policy: Silent output/);
      assert.ok(prompt.length <= 7000);
    }
  }
});

test("Director request and response routing preserve approach for all node actions", async (t) => {
  let captured;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response(JSON.stringify({ text: "Draft", approach: captured.action === "revise" ? "animation" : captured.approach }), { headers: { "content-type": "application/json" } });
  });
  for (const action of ["style", "motion", "shotList", "build", "revise"]) {
    const result = await runSkillDirectorNode({ node: { id: "director", data: { skillApproach: "vintage", skillDirectorAction: action } }, incoming: {}, sourceLabel: () => "Asset" });
    assert.equal(captured.approach, "vintage");
    assert.equal(result.approach, action === "revise" ? "animation" : "vintage");
  }
});

test("extended scenes retain their story continuity without overriding the selected visual approach", () => {
  assert.equal(scenes.filmDirectorExtendInstructionForApproach(), scenes.filmDirectorExtendInstruction);
  for (const approach of ["vintage", "animation"]) {
    const instruction = scenes.filmDirectorExtendInstructionForApproach(approach);
    assert.match(instruction, /Continue from its exact ending action/);
    assert.match(instruction, /override conflicting source-video visual treatment/);
    const prompt = planning.composeSkillDirectorFinalPrompt({ approach, referenceVideoMode: "extend", shotList: "CUT 1: Continue walking." });
    assert.ok(prompt.includes(instruction));
    assert.ok(prompt.includes(approaches.filmDirectorSceneRules(approach)));
    assert.ok(!prompt.includes(scenes.filmDirectorExtendInstruction));
  }
});

test("new approaches reach every stage, final assembly, scene tabs and revision snapshots", () => {
  for (const approach of ["stop-motion", "commercial", "music-video", "montage"]) {
    for (const action of ["style", "motion", "shotList", "build"]) {
      const prompt = planning.buildSkillDirectorPrompt({ action, approach, sceneOverview: "The supplied subject crosses the supplied set.", shotCount: "Auto" });
      assert.ok(prompt.includes(approaches.filmDirectorApproachDirective(approach)));
      assert.match(style.filmDirectorStyleDirectionDirective(approach), /3-6 concise sentences/);
    }
    const final = planning.composeSkillDirectorFinalPrompt({ approach, referenceLines: ["@Subject = Character."], shotList: "CUT 1: @Subject enters.", audioMode: "production" });
    assert.ok(final.startsWith("@Subject = Character.\n\n" + approaches.filmDirectorSceneRules(approach)));
    assert.equal(audio.applyFilmDirectorAudioPolicyToPrompt(final, "production", approach), final);
    const original = { sceneName: "Original", skillApproach: approach, resultText: final, skillDirectorLockedMusicSignature: "track-a" };
    const next = { ...original, ...scenes.addFilmDirectorScene(original) };
    const restored = scenes.switchFilmDirectorScene(next, "scene-1");
    assert.equal(restored.skillApproach, approach);
    assert.equal(restored.skillDirectorLockedMusicSignature, "track-a");
    assert.equal(revision.createFilmDirectorRevisionSnapshot(original).skillApproach, approach);
    assert.equal(revision.filmDirectorRevisionStatePatch({}, { approach }).skillApproach, approach);
  }
});

test("Stop-Motion stays stepped, Commercial polished, and Montage can leave continuous geography", () => {
  assert.match(approaches.filmDirectorSceneRules("stop-motion"), /claymation.*frame-by-frame.*stepped.*low-frame-rate/);
  assert.doesNotMatch(approaches.filmDirectorSceneRules("stop-motion"), /24fps smooth motion|clean graphic assets/);
  assert.match(approaches.filmDirectorApproachDirective("commercial"), /beauty.*editorial.*professional digital cinema/s);
  const montage = planning.buildSkillDirectorPrompt({ action: "shotList", approach: "montage" });
  assert.match(montage, /intentional location\/time jumps/);
  assert.doesNotMatch(montage, /preserve the hidden scene geography from surrounding shots/);
});

test("Music Video replaces all conflicting soundtrack policies without moving asset tags", () => {
  for (const mode of ["production", "silent", "full"]) {
    const final = planning.composeSkillDirectorFinalPrompt({ approach: "music-video", referenceLines: ["@Singer = Character."], audioMode: mode, shotList: "CUT 1: @Singer performs." });
    assert.match(final, /supplied vocal phonemes/);
    assert.doesNotMatch(final, /Background music: NONE|Silent output|no soundtrack/);
    const long = planning.composeSkillDirectorFinalPrompt({ approach: "music-video", audioMode: mode, sceneOverview: "A performance. ".repeat(2000), shotList: "CUT 1: Performs." });
    assert.match(long, /connected music reference/);
    assert.ok(long.length <= 7000);
  }
  const prompt = planning.buildSkillDirectorPrompt({ approach: "music-video", action: "shotList", musicContext: "Measured energy rise at 2.4s; no transcript." });
  assert.match(prompt, /Measured energy rise at 2.4s/);
  assert.match(prompt, /do not invent lyrics/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  filmDirectorShotDescriptionExample,
  filmDirectorShotDetailDirective,
  filmDirectorShotMaxCharsPerCut,
  filmDirectorShotMinimumWords
} from "../src/filmDirectorShotDetail.js";

test("single-shot Film Director plans receive a sustained-take detail contract", () => {
  const directive = filmDirectorShotDetailDirective(1, 15);
  assert.match(directive, /sustained master take/i);
  assert.match(directive, /ordered subject blocking/i);
  assert.match(directive, /ending composition or final hold/i);
  assert.ok(filmDirectorShotMinimumWords(1, 15) >= 30);
  assert.ok(filmDirectorShotMaxCharsPerCut(1, 15) > filmDirectorShotMaxCharsPerCut(6, 15));
});

test("two- and three-shot plans carry fuller internal beats", () => {
  assert.match(filmDirectorShotDetailDirective(2, 15), /clear opening state/i);
  assert.match(filmDirectorShotDetailDirective(3, 15), /editorial handoff/i);
  assert.ok(filmDirectorShotMinimumWords(2, 15) > 0);
  assert.ok(filmDirectorShotMinimumWords(3, 15) > 0);
});

test("multi-shot coverage adds compact visual and continuity context", () => {
  const directive = filmDirectorShotDetailDirective(6, 15);
  assert.match(directive, /32-42 words/i);
  assert.match(directive, /spatial or environment cue/i);
  assert.match(directive, /ending state or editorial handoff/i);
  assert.ok(filmDirectorShotMinimumWords(6, 15) > 0);
  assert.equal(
    filmDirectorShotDescriptionExample(6, 15),
    "one compact playable shot with subject action, spatial context, camera behavior, and a clear ending handoff"
  );
});

test("auto planning explains how detail should scale after choosing a cut count", () => {
  const directive = filmDirectorShotDetailDirective("Auto", 15);
  assert.match(directive, /After choosing recommendedShotCount/i);
  assert.match(directive, /For 1 CUT/i);
  assert.match(directive, /For 4 or more CUTS/i);
  assert.match(directive, /32-42 words/i);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  compactFilmDirectorStyleDirection,
  filmDirectorStyleDirectionDirective,
  filmDirectorStyleDirectionMaxChars
} from "../src/filmDirectorStyle.js";

test("Film Director style instructions keep section ownership explicit", () => {
  const directive = filmDirectorStyleDirectionDirective();
  assert.match(directive, /3-6 concise sentences/i);
  assert.match(directive, /grounded performance texture/i);
  assert.match(directive, /High-end cinematic scene, shot on cinema camera, soft prime lens/i);
  assert.match(directive, /Do not include camera movement or placement/i);
  assert.match(directive, /metaphor, or poetic non-literal direction/i);
});

test("Film Director style summaries use a consistent compact budget", () => {
  const longStyle = `STYLE_DIRECTION: ${"Muted color, soft light, fine grain, restrained contrast. ".repeat(20)}`;
  const compact = compactFilmDirectorStyleDirection(longStyle);
  assert.ok(compact.length <= filmDirectorStyleDirectionMaxChars);
  assert.doesNotMatch(compact, /^STYLE_DIRECTION:/i);
  assert.match(compact, /Muted color/);
});

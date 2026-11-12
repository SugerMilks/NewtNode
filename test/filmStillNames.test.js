import test from "node:test";
import assert from "node:assert/strict";
import { filmStillLabel, filmStillLookName, filmStillDisplayName } from "../server/film-still-names.js";

const palette = { version: 1, colors: ["#530211", "#A83882", "#BF4D8B", "#D3867E", "#C37573", "#CD443C", "#965418", "#F1AF34", "#FDF03F", "#221205"] };

test("film labels use readable filename evidence, never inferred film identities", () => {
  assert.equal(filmStillLabel("BladeRunner.JPG"), "Blade Runner");
  assert.equal(filmStillLabel("BladeRunner2049.JPG"), "Blade Runner 2049");
  assert.equal(filmStillLabel("FullMetalJacket.JPG"), "Full Metal Jacket");
  assert.equal(filmStillLabel("UnderTheSkin 2.JPG"), "Under The Skin");
  assert.equal(filmStillLabel("001 - Some_Film (2).png"), "Some Film");
  assert.equal(filmStillLabel("Her 2.JPG"), "Her");
  assert.equal(filmStillLabel("PSYCHOSYNTHESIS.PNG"), "Psychosynthesis");
  for (const filename of ["1 10.JPG", "2001.JPG", "2a.JPG", "BR 3.JPG", "DKI2.JPG", "aa.JPG", "FilmColor1.JPG", "color2.JPG", "img_035.png", "Untitled (2).jpg"])
    assert.equal(filmStillLabel(filename), "", filename);
});

test("unlabeled stills get stable color and tone names without changing the palette", () => {
  const saved = JSON.stringify(palette), name = filmStillDisplayName("2 28.JPG", palette);
  assert.match(name, /Rose|Magenta/);
  assert.match(name, /Amber|Copper|Gold|Crimson/);
  assert.doesNotMatch(name, /\d/);
  assert.equal(name, filmStillDisplayName("999.JPG", palette));
  assert.equal(name, filmStillLookName({ ...palette, colors: [...palette.colors].reverse() }));
  assert.equal(JSON.stringify(palette), saved);
  assert.ok(filmStillDisplayName("BladeRunner.JPG", palette).startsWith("Blade Runner - "));
  assert.equal(filmStillLookName(null), "Cinematic Tones");
});

test("neutral palettes get a tonal name rather than an invented colorful style", () => {
  const gray = { version: 1, colors: Array.from({ length: 10 }, (_, i) => "#" + (i * 20).toString(16).padStart(2, "0").repeat(3)) };
  assert.equal(filmStillLookName(gray), "Silver Tonal Study");
  assert.ok(filmStillDisplayName("A".repeat(300) + ".png", palette).length <= 120);
});

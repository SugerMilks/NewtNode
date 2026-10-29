import test from "node:test";
import assert from "node:assert/strict";
import { loadVectorLocalFonts, vectorCanvasFont, vectorFontGroups, vectorFontLocalSource, vectorGenericFonts } from "../src/vectorFonts.js";

test("Vector offers a broad, grouped Mac font catalog without shipping font files", () => {
  const names = vectorFontGroups.flatMap(group => group.families);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length >= 75);
  for (const name of ["Arial", "Georgia", "Courier New", "Avenir", "Futura", "Helvetica Neue", "Didot", "Baskerville", "Papyrus", "Menlo", "Zapfino"]) assert.ok(names.includes(name));
  for (const family of names) {
    const source = vectorFontLocalSource(family);
    assert.ok(source.startsWith("local("));
    assert.doesNotMatch(source, /url\(|https?:|data:|file:/);
  }
  assert.match(vectorFontLocalSource("Futura"), /Futura-Medium/);
  assert.match(vectorFontLocalSource("SignPainter"), /SignPainter-HouseScript/);
});

test("only fonts successfully loaded locally become options, with original names and categories", async () => {
  class LocalFont {
    constructor(family, source) { this.family = family; this.source = source; }
    async load() {
      if (!['local("Avenir")', 'local("Didot")', 'local("Menlo")'].some(name => this.source.includes(name))) throw new Error("Not installed");
      return this;
    }
  }
  const available = await loadVectorLocalFonts(LocalFont);
  assert.deepEqual(available.map(font => font.id), ["Avenir", "Didot", "Menlo"]);
  assert.deepEqual(available.map(font => font.group), ["Sans Serif", "Serif & Slab", "Monospace"]);
  assert.ok(available.every(font => font.face instanceof LocalFont && font.family === font.face.family && font.label === font.id));
});

test("blocked font access and unsupported browsers retain generic defaults", async () => {
  assert.deepEqual(await loadVectorLocalFonts(null), []);
  class BlockedFont { constructor() { throw new Error("Local fonts blocked"); } }
  assert.deepEqual(await loadVectorLocalFonts(BlockedFont), []);
  assert.deepEqual(vectorGenericFonts.map(font => font.id), ["sans-serif", "serif", "monospace"]);
  assert.equal(vectorCanvasFont("serif", 100), "100px serif");
  assert.equal(vectorCanvasFont("Courier New", 50), '50px "Courier New"');
  assert.equal(vectorCanvasFont('A"B', 50), '50px "A\\"B"');
});

test("closing the font dialog stops local discovery without publishing late options", async () => {
  const controller = new AbortController(); let loads = 0;
  class LocalFont {
    async load() { loads++; controller.abort(); return this; }
  }
  assert.deepEqual(await loadVectorLocalFonts(LocalFont, { signal: controller.signal }), []);
  assert.equal(loads, 1);
});

// Local names only. macOS font files are not bundled, downloaded or uploaded.
// Catalog: https://support.apple.com/en-us/120414
export const vectorFontGroups = [
  { label: "Sans Serif", families: [
    "Arial", "Arial Black", "Arial Narrow", "Arial Rounded MT Bold", "Avenir", "Avenir Next", "Avenir Next Condensed",
    "DIN Alternate", "DIN Condensed", "Futura", "Galvji", "Geneva", "Gill Sans", "Helvetica", "Helvetica Neue",
    "Lucida Grande", "Microsoft Sans Serif", "Optima", "PT Sans", "PT Sans Caption", "PT Sans Narrow", "Seravek", "Skia",
    "Tahoma", "Trebuchet MS", "Verdana"
  ] },
  { label: "Serif & Slab", families: [
    "American Typewriter", "Athelas", "Baskerville", "Big Caslon", "Bodoni 72", "Bodoni 72 Oldstyle", "Bodoni 72 Smallcaps",
    "Charter", "Cochin", "Didot", "Georgia", "Hoefler Text", "Iowan Old Style", "Kefa", "Marion", "Palatino",
    "PT Serif", "PT Serif Caption", "Rockwell", "STIX Two Text", "Superclarendon", "Times", "Times New Roman"
  ] },
  { label: "Script & Handwritten", families: [
    "Apple Chancery", "Bradley Hand", "Brush Script MT", "Chalkboard", "Chalkboard SE", "Comic Sans MS", "Marker Felt",
    "Noteworthy", "Savoye LET", "SignPainter", "Snell Roundhand", "Zapfino"
  ] },
  { label: "Display", families: [
    "Academy Engraved LET", "Chalkduster", "Copperplate", "Herculanum", "Impact", "Luminari", "Papyrus", "Party LET", "Phosphate", "Trattatello"
  ] },
  { label: "Monospace", families: ["Andale Mono", "Courier", "Courier New", "Menlo", "Monaco", "PT Mono"] }
];

export const vectorGenericFonts = [
  { id: "sans-serif", family: "sans-serif", label: "Sans Serif" },
  { id: "serif", family: "serif", label: "Serif" },
  { id: "monospace", family: "monospace", label: "Monospace" }
];

const localFaces = {
  "Academy Engraved LET": ["Academy Engraved LET Plain:1.0", "AcademyEngravedLetPlain"],
  "Avenir": ["Avenir Roman", "Avenir-Roman"],
  "Big Caslon": ["Big Caslon Medium", "BigCaslon-Medium"],
  "Bodoni 72": ["Bodoni 72 Book", "BodoniSvtyTwoITCTT-Book"],
  "Bodoni 72 Oldstyle": ["Bodoni 72 Oldstyle Book", "BodoniSvtyTwoOSITCTT-Book"],
  "Bodoni 72 Smallcaps": ["Bodoni 72 Smallcaps Book", "BodoniSvtyTwoSCITCTT-Book"],
  "Bradley Hand": ["Bradley Hand Bold", "BradleyHandITCTT-Bold"],
  "DIN Alternate": ["DIN Alternate Bold", "DINAlternate-Bold"],
  "DIN Condensed": ["DIN Condensed Bold", "DINCondensed-Bold"],
  "Futura": ["Futura Medium", "Futura-Medium"],
  "Marker Felt": ["Marker Felt Thin", "MarkerFelt-Thin"],
  "Noteworthy": ["Noteworthy Light", "Noteworthy-Light"],
  "Party LET": ["Party LET Plain", "PartyLetPlain"],
  "Phosphate": ["Phosphate Inline", "Phosphate-Inline"],
  "Savoye LET": ["Savoye LET Plain", "SavoyeLetPlain"],
  "SignPainter": ["SignPainter HouseScript", "SignPainter-HouseScript"]
};

export function vectorFontLocalSource(family) {
  const names = [...new Set([...(localFaces[family] || []), family, `${family} Regular`, family.replaceAll(" ", ""), `${family.replaceAll(" ", "")}-Regular`])];
  return names.map(name => `local(${JSON.stringify(name)})`).join(", ");
}

export async function loadVectorLocalFonts(FontFaceClass = globalThis.FontFace, { signal } = {}) {
  if (!FontFaceClass) return [];
  const available = [];
  for (const group of vectorFontGroups) {
    for (const family of group.families) {
      if (signal?.aborted) return [];
      try {
        // A successful local load proves availability; fonts.check() also accepts missing fonts.
        const face = await new FontFaceClass(`VectorGuideLocal-${family.replaceAll(" ", "-")}`, vectorFontLocalSource(family)).load();
        available.push({ id: family, label: family, family: face.family, group: group.label, face });
      } catch { /* Unavailable or browser-blocked fonts are omitted, never silently substituted. */ }
    }
  }
  return signal?.aborted ? [] : available;
}

export function vectorCanvasFont(family, size) {
  const name = vectorGenericFonts.some(font => font.family === family) ? family : JSON.stringify(family);
  return `${size}px ${name}`;
}

// Explore-only medium definitions: shared Style presets remain unchanged elsewhere.
export const exploreMediumGuidance = Object.freeze({
  Auto: "Infer the appropriate medium from the brief. Invent distinct art-directed worlds within that medium, not a repeated default photographic look.",
  "Cinematic Indie": "Independent feature-film imagery with deliberate authorship, believable staging and tactile photographic craft. The direction chooses its lens, depth, exposure, palette, contrast and mood; indie does not require muted color or shallow focus.",
  "Cinematic Standard": "Feature-film cinematography in a believable physical world. Each direction chooses a different visual grammar, from graphic formalism to deep-focus suspense, intimate naturalism or expressive spectacle. Cinematic is not one lens, grade or lighting setup.",
  "Cinematic Commercial": "Premium advertising cinematography with a memorable campaign idea and precise art direction. Explore sharply contrasting staging, lens language, palettes and light; commercial does not require every image to be bright, glossy or minimally framed.",
  "Vintage 8mm": "Analog 8mm capture with authentic small-gauge texture and optical character. Keep the capture medium while varying visual storytelling, staging, lighting, framing, palette and contrast.",
  "UGC Device": "Convincing handheld-device imagery with natural capture imperfections. Keep this requested capture language while finding intentional, distinct compositions and lighting situations.",
  "Photography Color": "High-craft color photography. Deliberately vary photographic language, lens perspective, set design, focus, light and palette without switching to monochrome or another medium.",
  "Photography B&W": "Expressive black-and-white photography, never color. Explore distinct grayscale separation, hard versus diffuse light, deep versus shallow focus, graphic geometry and photographic perspectives.",
  "Photography Film": "Art-directed analog photographic imagery with plausible film texture. Select lens, stock character, tonal response and staging independently per direction instead of applying one vintage filter throughout.",
  "Painterly 3D": "Dimensional painted animation with visible brushwork and intentional sculpted forms. Let each direction choose its world design, light, color, composition and surface treatment; no compulsory steampunk setting or jewel-tone palette.",
  "80s Animation": "Hand-drawn 1980s cel-animation craft with designed linework and painted backgrounds. Explore different compositions, palettes, value structures and art direction within that medium.",
  "90s Animation": "Hand-drawn 1990s animation craft with confident linework and expressive shape design. Vary composition, color, value, staging and background design rather than repeating one cartoon layout.",
  "Pixel Art": "Deliberate pixel clusters, readable silhouettes and coherent pixel-scale detail without smoothing. Explore distinct palettes, projections, graphic hierarchy, value patterns and world design.",
  Storyboard: "Readable black-and-white ink storyboard drawing with clean silhouettes and selective grayscale, not a photograph. Use expressive staging, perspective, composition and value design without color or decorative panel borders.",
  Anime: "Authored anime illustration with intentional linework, background art and character/shape design. Explore contrasting staging, framing, light, palettes and moods within anime rather than changing the medium.",
  Claymation: "Tactile sculpted clay and physically built miniature sets photographed as stop-motion. Preserve handmade material identity while exploring bold camera perspectives, scale, set design, palettes and lighting. Claymation may be ominous, austere, theatrical or surreal; it need not be cute, softly lit or pastel.",
  "2D Animation": "Designed 2D animation with controlled silhouettes, shapes and color separation. Explore contrasting graphic compositions, staging, palettes and line/paint treatments without switching to photorealism.",
  "3D Animation": "Authored dimensional animation with coherent modeling and material language. Vary lens, staging, scale, surface design, light and palette; no compulsory soft illumination or cheerful mood.",
  "Dark as Fuk": "Unsettling art direction and sustained visual tension. Explore different forms of unease through composition, spatial design, light and surface character; darkness does not require identical low exposure or the same horror set.",
  "Pop as Fuk": "Bold, exuberant pop art direction. Explore sharply different palette systems, graphic rhythms, scale relationships and surface treatments within this expressive mood.",
  "Sexy as Fuk": "Sophisticated, edgy fashion art direction. Preserve the requested subject, wardrobe and anatomy; express the aesthetic through staging, material, light and composition, not automatic undressing.",
  "Strange as Fuk": "Inventive surreal art direction with coherent visual logic. Explore unexpected spatial and material ideas within the brief; protect referenced identities, anatomy, branding and any locked scene content."
});

// Each axis has nine deliberately contrasting strategies. These are starting points
// for the planner, not fixed scenes or a substitute for the user's explicit constraints.
const axes = {
  camera: [
    "Ground-level, very wide-angle perspective; foreground scale and upward convergence make the subject monumental.",
    "True overhead view; read the subject as a graphic arrangement rather than an eye-level portrait.",
    "Long-lens compression from a distance; flatten depth into layered planes and isolate a strong silhouette.",
    "Extreme close detail; make the subject recognizable through tactile structure and selective focus.",
    "Distant extreme-wide view; let the subject occupy very little of the frame and make the surrounding space purposeful.",
    "Oblique elevated three-quarter view with deep focus and multiple readable depth planes.",
    "Deliberate Dutch angle and forceful diagonal perspective; create tension without arbitrary distortion.",
    "Straight-on formal view with precise axial geometry, controlled perspective and deep staging.",
    "Intimate low or side-profile viewpoint through a meaningful foreground plane; make depth and occlusion intentional."
  ],
  graphicView: [
    "Frontal iconic silhouette with a strong outer contour.", "Top-down graphic arrangement emphasizing shape relationships.",
    "Compressed layered planes with deliberate overlap.", "Cropped close-detail motif with recognizable subject structure.",
    "Small isolated mark within expansive negative space.", "Isometric or oblique constructed form where the requested graphic medium permits it.",
    "Strong diagonal orientation and directional energy.", "Axial symmetry and emblematic balance.",
    "Side-profile silhouette and economical internal detail."
  ],
  composition: [
    "Severe centered symmetry and deliberate visual order.", "Extreme off-center placement with a large, active negative-space field.",
    "A bold diagonal leads across the image; let unequal masses create momentum.", "Frame-filling scale and deliberate edge tension; retain every explicitly required part.",
    "A low visual anchor under a large upper field, emphasizing vertical scale.", "A high visual anchor above a large lower field, creating suspended tension.",
    "Foreground, middle and distant planes form a deep, readable composition.", "Flatten the image into distinct graphic bands and a clear focal interruption.",
    "Asymmetric framing through an opening or a shaped negative space, without an ornamental border."
  ],
  lighting: [
    "Hard raking side light, crisp texture and long graphic cast shadows.", "Broad, bright diffuse light with delicate shadow transitions and open exposure.",
    "Strong backlight and translucent or rim-lit edges; keep essential subject details readable.", "Low-key chiaroscuro with a narrow motivated pool of light and deep shadow separation.",
    "Theatrical colored light from opposing directions; separate key, fill and background deliberately.", "Direct frontal light with a bold, flattened editorial character and crisp local detail.",
    "Overhead spotlight with a controlled falloff and a sculptural shadow footprint.", "Soft directional ambient light with cool shadows and a warm localized source.",
    "Low horizontal light and strong depth through atmospheric separation, not a uniform haze filter."
  ],
  palette: [
    "Expressive monochrome with a designed grayscale hierarchy and no incidental color.", "Restrained pastel fields punctuated by one assertive accent.",
    "A saturated complementary pair with a carefully controlled neutral ground.", "Near-monochromatic color: one hue family spanning a wide tonal range.",
    "Earth and mineral pigments with tactile, restrained saturation.", "Acidic, synthetic color relationships organized into a deliberate graphic system.",
    "Rich jewel colors with dense shadow values and selective bright accents.", "Cool silvery neutrals interrupted by a small warm color event.",
    "Bold primary-color blocking with decisive separation and very little muddiness."
  ],
  artDirection: [
    "Austere sculptural minimalism: reduce the world to a few intentional forms and meaningful empty space.",
    "Deadpan theatrical formalism: carefully constructed geometry, controlled staging and an unexpected emotional undertone.",
    "Psychological suspense: use offscreen implication, spatial imbalance and shadow geometry rather than stock horror props.",
    "Immersive naturalism: observed irregularity, physical plausibility and a strong sense of place rather than a studio backdrop.",
    "Exaggerated scale relationships in the environment: make familiar subject matter feel monumental or miniature without changing required identity.",
    "Graphic editorial abstraction: simplify surrounding forms into a bold visual argument while keeping the subject legible.",
    "Tactile workshop-like world building: expressive crafted surfaces and evidence of material-making, adapted to the selected medium.",
    "Elegant retro-futurist spatial design: coherent designed forms, deliberate rhythm and an original rather than borrowed world.",
    "Lyrical, restrained surrealism: one visually legible unexpected spatial idea, not a pile of random objects or effects."
  ],
  texture: [
    "Dry matte surfaces, fine granular detail and absorbent highlights.", "Smooth, polished surfaces with controlled reflective highlights where material identity permits.",
    "Visible handmade/tool-work texture and deliberate irregularity, appropriate to the medium.", "Worn, weathered surface character with selective fine detail, never damage to protected branding.",
    "Soft, velvety surface response and gently rolled highlights without blurring the whole image.", "Crisp microtexture and high local separation without crunchy oversharpening.",
    "Transmitted-light or subsurface emphasis where physically appropriate; keep the required material recognizable.", "Restrained analog/print surface character appropriate to the medium, not a universal film filter.",
    "Clean, graphic material separation with carefully limited texture and strong silhouette readability."
  ],
  tonalDesign: [
    "Sparse bright accents within a dark value field.", "An open high-key value field with a few small dark anchors.",
    "Hard separation into a few strong value masses.", "A rich midtone-dominant structure with subtle highlight/shadow transitions.",
    "Luminous highlights and deep but readable shadows.", "Soft low-contrast values with carefully preserved subject separation.",
    "A precise separation between subject values and background values, without moving either.", "Selective local contrast that emphasizes the subject's existing tactile details.",
    "Restrained highlights and dense tonal weight with fine edge separation."
  ]
};

function shuffle(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function exploreContrastBriefs({ count, exploreMode, action, preserveImageContent, creativeTask, supplied, random = Math.random }) {
  const enabled = exploreMode !== false && ["explore", "push"].includes(action);
  const keys = !enabled ? [] : preserveImageContent ? ["lighting", "palette", "texture", "tonalDesign"]
    : [creativeTask === "Brand / Logo" || creativeTask === "Abstract" ? "graphicView" : "camera", "composition", "lighting", "palette", "artDirection", "texture"];
  if (supplied != null) {
    if (!Array.isArray(supplied) || supplied.length !== (enabled ? count : 0)
      || supplied.some(brief => !brief || typeof brief !== "object" || Array.isArray(brief) || Object.keys(brief).length !== keys.length
        || keys.some(key => !Number.isInteger(brief[key]) || brief[key] < 0 || brief[key] >= axes[key].length))) {
      throw new Error("Explore received invalid saved art-direction choices. No generation was submitted.");
    }
    return supplied.map(brief => Object.fromEntries(keys.map(key => [key, brief[key]])));
  }
  if (!enabled) return [];
  const pools = keys.map(key => shuffle(axes[key].map((_, index) => index), random));
  // Rotate independently after nine to keep all 25 combinations distinct even with a fixed RNG.
  return Array.from({ length: count }, (_, i) => Object.fromEntries(keys.map((key, axis) =>
    [key, pools[axis][(i + Math.floor(i / 9) * axis) % 9]])));
}

export function describeExploreContrast(brief) {
  if (!brief) return "";
  return Object.entries(brief).filter(([key, index]) => axes[key]?.[index]).map(([key, index]) => `${key}: ${axes[key][index]}`).join("\n");
}

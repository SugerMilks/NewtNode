export const filmDirectorApproachOptions = Object.freeze([
  { value: "cinematic", label: "Cinematic" },
  { value: "vintage", label: "Vintage" },
  { value: "animation", label: "Animation" },
  { value: "stop-motion", label: "Stop-Motion" },
  { value: "commercial", label: "Commercial" },
  { value: "music-video", label: "Music Video" },
  { value: "montage", label: "Montage" }
]);

export function normalizeFilmDirectorApproach(value = "", fallback = "cinematic") {
  const normalized = String(value || "").trim().toLowerCase();
  const valid = (candidate) => filmDirectorApproachOptions.some((option) => option.value === candidate);
  return valid(normalized) ? normalized : valid(fallback) ? fallback : "cinematic";
}

export function filmDirectorApproachChanged(data = {}) {
  return normalizeFilmDirectorApproach(data.skillApproach) !== normalizeFilmDirectorApproach(data.skillDirectorLockedApproach);
}

export function filmDirectorDefaultCameraDirection(approach = "cinematic") {
  const additionalDirections = {
    "stop-motion": "Use readable miniature-set staging and deliberate locked-off compositions or small frame-by-frame camera increments. Preserve handmade pose changes, clean silhouettes and consistent spatial direction within each action.",
    commercial: "Use precise premium cinema coverage, controlled dolly and tracking moves, polished macro and hero details, sculpted beauty lighting and deliberate editorial framing appropriate to the advertised subject.",
    "music-video": "Use highly stylized angles, expressive performance coverage and dynamic controlled camera movement. Motivate cuts and movement accents from the connected music track, leaving readable on-camera vocal coverage for synchronized singing.",
    montage: "Sequence distinct, economical vignettes with varied shot scales and purposeful match cuts, movement matches and visual transitions. Maintain clear geography within each vignette; separate locations and time jumps with intentional edits."
  };
  if (additionalDirections[normalizeFilmDirectorApproach(approach)]) return additionalDirections[normalizeFilmDirectorApproach(approach)];
  if (normalizeFilmDirectorApproach(approach) === "animation") {
    return "Use clear virtual-camera staging, readable silhouettes and controlled animated camera moves, with subtle push-ins during emotional beats and consistent screen direction across cuts.";
  }
  if (normalizeFilmDirectorApproach(approach) === "vintage") {
    return "Use simple practical handheld coverage and natural eye-level framing, gentle imperfect camera handling and readable blocking, preserving screen direction across cuts.";
  }
  return "Use restrained handheld coverage with natural eye-level framing, subtle push-ins only during emotional beats, and clean continuity of screen direction across cuts.";
}

export const filmDirectorVisualSceneRules =
  "Scene rules: Cinematic naturalism, premium live-action realism, motivated light, cine lens language, grounded acting, real physics, no subtitles, continuity, 24fps smooth motion.";

export function filmDirectorSceneRules(approach = "cinematic") {
  switch (normalizeFilmDirectorApproach(approach)) {
    case "stop-motion":
      return "Scene rules: Handcrafted stop-motion or claymation, tangible miniature sets and tactile materials, frame-by-frame pose changes, deliberately stepped low-frame-rate motion, slight handmade irregularity, expressive readable silhouettes, consistent character design and scale, coherent physical staging, no interpolated CGI smoothness, no subtitles.";
    case "commercial":
      return "Scene rules: Premium commercial cinema, polished big-budget advertising and editorial finish, professional digital cinema cameras and precision lenses, saturated controlled colors, sculpted high-contrast lighting, refined beauty and product detail, immaculate art direction, polished movement, recognizable asset identity, coherent physical action, no unrequested text or subtitles.";
    case "music-video":
      return "Scene rules: Highly stylized premium music video, polished commercial finish, bold controlled colors and contrast, expressive performances, dynamic camera angles, music-driven movement and editorial pacing. Use the connected music track as the timing authority; synchronize visible singing to its actual vocals. Preserve performer identity, no unrequested text or subtitles.";
    case "montage":
      return "Scene rules: Professionally edited energetic montage, distinct short clips and vignettes across the requested locations, actions and ideas, concise readable beats, purposeful visual matches and transitions, coherent overall look. Preserve continuity within each vignette and asset identity throughout; allow intentional jumps between vignettes, no unrequested text or subtitles.";
    case "vintage":
      return "Scene rules: Cinematic vintage 8mm film, crude analog equipment and techniques, soft lenses, pronounced halation, intermittent soft focus and blur, subtle film flicker, heavy 8mm grain, low contrast, muted colors, shallow depth of field, lens bloom, motion blur, lens-edge distortion and vignetting, atmospheric haze, imperfect real-camera texture, apparent 16fps or hand-cranked cadence, grounded performances, real physics, continuity, no subtitles.";
    case "animation":
      return "Scene rules: High-production-value animation, a coherent user-selected cel, CGI, digital-animation or motion-graphics treatment, clean graphic assets, high contrast, clean colors, smooth intentional animated motion, expressive performances, consistent character design, coherent staging and continuity, no subtitles. Preserve the chosen animation medium throughout.";
    default:
      return filmDirectorVisualSceneRules;
  }
}

export function filmDirectorApproachDirective(approach = "cinematic") {
  switch (normalizeFilmDirectorApproach(approach)) {
    case "stop-motion":
      return "Selected approach: Stop-Motion. Keep Animation's cinematic storytelling, expressive character design, readable staging and coherent medium, but use handcrafted stop-motion or claymation rather than smoothly interpolated digital animation. Choose one physical material treatment from the brief, such as sculpted clay, puppets or model miniatures. Describe tactile handmade surfaces, practical miniature lighting, frame-by-frame incremental posing, slight non-precise registration, held poses, stepped timing and expressive handmade motion. Favor an apparent 8-12 distinct poses per second, or the user's requested low-frame-rate cadence, not continuous CGI tweening. This is a visible animation cadence, not a provider frame-rate or duration setting. Keep anatomy and material identity stable; avoid unintended melting, morphing or jittering camera noise. Do not import clean vector graphics, glossy CGI or live-action skin by default. Obey the selected audio policy.";
    case "commercial":
      return "Selected approach: Commercial. Keep Cinematic's purposeful storytelling, readable coverage, grounded performance, real physics and continuity. Use an extremely polished premium advertising, beauty and editorial finish: the best professional digital cinema cameras, precision primes, controlled high-end camera equipment, sculpted high-contrast lighting, saturated but controlled colors, immaculate art direction, flattering skin and crisp product surfaces. Tailor the finish to the brief, including high-end car advertising, beauty campaigns and big-budget brand marketing. Use deliberate hero presentation and refined movement without inventing a product, brand, claim, logo or on-screen copy. Keep camera choreography in Camera Direction and cuts, not the Style summary. Obey the selected audio policy.";
    case "music-video":
      return "Selected approach: Music Video. Build on Commercial's premium digital cinema, beauty lighting and polished advertising finish with more highly stylized visuals, expressive performance, dynamic angles, bold graphic composition and music-driven editorial pacing. The connected audio file is required and is the musical and vocal timing authority. Shape shot durations, visual accents and movement around the supplied track's phrases and energy, with breathing room rather than cutting on every beat. For visible vocals, request precise phoneme-level lip sync to the actual supplied vocals and preserve their wording, delivery and timing; do not invent lyrics, dialogue, a replacement score or a different singer's voice. During instrumental passages do not fabricate singing. Analysis may provide audio-level cues, not verified beats or lyrics; never claim to have heard musical details absent from the evidence. Keep the user's scene and asset identities, and keep visual style, camera choreography and shot execution in their respective sections.";
    case "montage":
      return "Selected approach: Montage. Plan a professionally edited energetic sizzle of distinct short clips or vignettes rather than forcing every shot into one continuous dramatic scene. Sequence the user's supplied locations, actions and ideas into a concise progression with a strong opening, readable development and deliberate closing image. Use varied shot scales, economical action beats, purposeful match cuts, movement or shape matches, and restrained transitions. Maintain geography, eyelines and physical continuity within each vignette, but explicitly mark intentional location and time changes between vignettes; do not force uninterrupted room geography across separate clips. Preserve the same character and asset identities when they recur and use only assets referenced in each shot. Auto shot count should serve vignette coverage and total duration; respect an explicit shot count without inventing extra CUTs. Keep a unified professional visual finish, avoid repetitive coverage and do not invent major subjects or locations absent from the brief. Energy does not imply music: obey the selected audio policy.";
    case "vintage":
      return "Selected approach: Vintage. Keep cinematic storytelling, continuity and readable blocking, but use crude analog equipment, simple practical camera techniques and a classic vintage film finish instead of premium modern camera language. Cinematic vintage film shot on 8mm film with soft lenses, high halation and blur textures that come in and out, visible film noise and texture, subtle film flicker, heavy 8mm grain, realistic low contrast and muted colors, shallow depth of field, lens bloom, motion blur, lens-edge distortions, blurs and vignetting, atmospheric haze and imperfect real-camera texture. Favor an apparent 16fps or hand-cranked cadence, not uniformly smooth 24fps motion. Frame cadence is a visual instruction, not a change to duration or the provider's encoded frame rate. Film noise means visual grain and texture, not added projector noise or soundtrack; obey the selected audio policy. Do not introduce high-end digital cinema equipment or a pristine modern finish. Preserve scene content and asset identity.";
    case "animation":
      return "Selected approach: Animation. Keep cinematic storytelling, clear coverage, continuity and purposeful performance, but describe animation techniques instead of live-action capture. Use smooth motion graphics, cel animation, CGI animation or digital animation as directed by the user and references. Choose one coherent medium for the scene; do not combine styles unless requested. Favor clean digital assets, clean graphics, high contrast, clean colors and high production value. Describe poses, silhouettes, key poses, expressive timing, spacing, transitions and virtual-camera staging where relevant. Preserve recognizable character design and scene assets within the selected animation medium. Do not force photoreal skin, live-action realism, physical camera equipment, film grain or analog lens defects into the animation. Camera/lens terminology may describe virtual framing or depth, not live-action capture. Keep the selected audio policy.";
    default:
      return "";
  }
}

export function filmDirectorSceneTreatment(approach = "cinematic") {
  const value = normalizeFilmDirectorApproach(approach);
  return ({ cinematic: "cinematic", vintage: "vintage 8mm", animation: "animated" })[value]
    || filmDirectorApproachOptions.find((option) => option.value === value).label.toLowerCase();
}

export function filmDirectorMusicVideoError({ approach, audioInputs = [], videoModel = "" } = {}) {
  if (!filmDirectorUsesMusic(approach, audioInputs)) return "";
  if (!audioInputs.some((item) => typeof item?.url === "string" && item.url.trim())) return "Connect an audio file to the Director Music input before using Music Video.";
  if (videoModel && !filmDirectorVideoModelSupportsMusic(videoModel)) return "Director music requires Seedance 2.0, Seedance 2.5 or MiniMax H3. Kling does not accept reference audio files.";
  return "";
}

export function filmDirectorVideoModelSupportsMusic(model) {
  return ["Seedance 2.0", "Seedance 2.5", "MiniMax H3"].includes(model);
}

export function filmDirectorSupportsMusic(approach) {
  return ["music-video", "montage"].includes(normalizeFilmDirectorApproach(approach));
}

export function filmDirectorUsesMusic(approach, audioInputs = []) {
  const value = normalizeFilmDirectorApproach(approach);
  return value === "music-video" || (value === "montage" && audioInputs.some((item) => typeof item?.url === "string" && item.url.trim()));
}

export { reve21AspectRatios, reve21ResolutionOptions } from "./reve21.js";

export const characterTraitOptions = ["serious", "pleasant", "happy", "angry", "sad", "silly", "confident", "content", "excited", "passionate", "fanatic", "anxious", "scared", "arrogant", "stubborn", "curious"];
export const batchOptions = ["1", "2", "3", "4"];
export const imageBatchOptions = Array.from({ length: 9 }, (_value, index) => String(index + 1));
export const imageModelAutoAspectRatio = "Auto";
export const imageModelNames = {
  zImage: "Z-Image",
  seedream5Pro: "Seedream 5.0 Pro",
  nanoBanana2: "Nano Banana 2",
  nanoBananaPro: "Nano Banana Pro",
  openAiImage2: "OpenAI Image 2",
  reve21: "REVE 2.1",
  krea2Large: "Krea 2 Large"
};
export const imageModelOptions = [
  imageModelNames.zImage,
  imageModelNames.seedream5Pro,
  imageModelNames.nanoBanana2,
  imageModelNames.nanoBananaPro,
  imageModelNames.openAiImage2,
  imageModelNames.reve21,
  imageModelNames.krea2Large
];
export const nanoImageAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"];
export const openAiImageAspectRatios = nanoImageAspectRatios;
export const krea2AspectRatios = ["16:9", "1:1", "4:3", "3:2", "2.35:1", "4:5", "2:3", "9:16"];
export const krea2CreativityOptions = ["raw", "low", "medium", "high"];
export const imageResolutionOptions = ["2K", "1K", "4K"];
export const seedream5ResolutionOptions = ["2K", "1K"];
export const seedanceVideoDurationOptions = ["15 seconds", "10 seconds", "5 seconds"];
export const seedanceVideoResolutionOptions = ["720p", "480p", "1080p", "4k"];
export const seedanceVideoAspectRatioOptions = ["16:9 (Landscape)", "21:9", "9:16 (Portrait)", "1:1"];
export const klingO3ProDurationOptions = Array.from({ length: 13 }, (_value, index) => `${index + 3} seconds`);
export const klingO3ProResolutionOptions = ["1080p"];
export const klingO3ProAspectRatioOptions = ["16:9", "9:16", "1:1"];
export const klingO34kDurationOptions = klingO3ProDurationOptions;
export const klingO34kResolutionOptions = ["4K"];
export const klingO34kAspectRatioOptions = klingO3ProAspectRatioOptions;
export const geminiOmniDurationOptions = Array.from({ length: 8 }, (_value, index) => `${index + 3} seconds`);
export const geminiOmniResolutionOptions = ["720p"];
export const geminiOmniAspectRatioOptions = ["16:9", "9:16"];
export const happyHorseDurationOptions = Array.from({ length: 13 }, (_value, index) => `${index + 3} seconds`);
export const voidVideoFrameOptions = [69, 77, 85, 93, 101, 109, 117, 125, 133, 141, 149, 157, 165, 173, 181, 189, 197];

export const stylePresetPrompts = {
  None: "",
  "Cinematic Indie":
    "High-end cinematic still frame from an indie film, shot on 35mm film, soft prime lens, high dynamic range. High quality refurbished vintage lens. Any captured motion within the composition needs to have realistic motion blur based off of a 24fps film. Must have dynamic framing, atmospheric cinematography, subtle halation. Realistic low contrast and muted color grade. Shallow depth of field, gentle lens bloom, heavy 35mm film grain, realistic lens edge distortions, atmospheric haze, imperfect real-camera texture, high production value, classic film look.",
  "Cinematic Standard":
    "High-end cinematic still frame, shot on ARRI Alexa 35, high quality prime lens, high dynamic range, shallow depth of field, atmospheric cinematography, subtle halation, gentle lens bloom, fine film grain, realistic lens softness, slight atmospheric haze, imperfect real-camera texture, high production value, feature film look.",
  "Cinematic Commercial":
    "Polished commercial image, premium advertising style, shot on ARRI Alexa, high quality prime lens, high dynamic range clean composition, bright refined lighting, shallow depth of field, elevated brand look, modern campaign aesthetic, crisp details, visually appealing.",
  "UGC Device":
    "UGC, Low-end phone photo, shot on iPhone, standard lens, realistic, imperfect real-phone capture, low production value, social media look, User Generated Content. No graphics. No foreground phone seen.",
  "Photography Color":
    "High-end digital color photography image, shot on a mirrorless medium-format body, high quality vintage lens, high dynamic range, fine film grain, realistic lens softness, high end print campaign, slight atmospheric haze, imperfect real-camera texture, high production value, high resolution system, polished commercial image, premium advertising style.",
  "Photography B&W":
    "High-end digital black and white photography image, shot on a mirrorless medium-format body, high quality refurbished vintage lens, high contrast, film grain, realistic lens softness, high end print campaign, slight atmospheric haze, imperfect real-camera texture, high production value, high resolution system, polished commercial image, unique style.",
  "Photography Film":
    "High-end color photography image with refurbished vintage lens, shot on real analog camera with real photography film, fine film grain, realistic lens softness, slight atmospheric haze, imperfect real-camera texture, natural and authentic artistic image with unique compositions and style.",
  "Painterly 3D":
    "Cinematic painterly 3D animation with expressive hand-painted textures, graphic 2D accents layered over dimensional animation, sculpted features, slightly exaggerated proportions, visible brushwork, dramatic chiaroscuro lighting, rich jewel tones contrasted with smoky shadows, atmospheric haze, elegant steampunk-fantasy design, emotionally intense, dynamic asymmetrical composition, concept-art finish, sophisticated prestige-animation aesthetic, no text, no watermark.",
  "80s Animation":
    "Hand-drawn 2D animation inspired by 1980s Saturday-morning cartoons, bold black outlines, simplified features, airbrushed cel shading, saturated color palette, painted background, very subtle film grain, very subtle analog VHS softness, retro-futuristic atmosphere, dynamic composition, authentic animation-cel appearance, no text, no watermark.",
  "90s Animation":
    "Hand-drawn 2D animation inspired by 1990s television cartoons, clean varied linework, angular and expressive design, bright flat colors, minimal cel shading, exaggerated action, colorful painted background, playful attitude, crisp animation-frame composition, very subtle broadcast-era texture, no text, no watermark.",
  "Pixel Art":
    "Polished 16-bit pixel art, crisp deliberate pixel clusters, limited color palette, strong readable silhouette, detailed sprite shading, dramatic pixel lighting, retro video-game environment, layered background, authentic 1990s console aesthetic, nearest-neighbor sharpness, no smoothing, no anti-aliasing, no text, no watermark.",
  Storyboard:
    "Minimal hand-drawn digital storyboard frame, clean black ink line drawing, simple shapes, light grayscale blocking only, open white negative space, production-planning clarity, readable silhouettes, clear visual storytelling. A black and white line drawing. No color. No pencil or charcoal sketches. Not a realistic black-and-white photograph, not photorealistic grayscale, no photographic skin texture, no photo lighting, no heavy shading, no dense detail, no 3D render. No text or numbers unless described. No frame borders.",
  Anime:
    "Stylized anime illustration, clean linework, expressive design, cinematic art lighting, vibrant controlled color palette, detailed background art, dynamic framing, polished animated look, emotionally engaging atmosphere.",
  Claymation:
    "Handmade claymation style, stop-motion look, sculpted clay characters, environment, and props, tactile surfaces, visible handmade imperfections, miniature set design, soft lighting, charming handcrafted aesthetic.",
  "2D Animation":
    "Clean 2D animation style, bold graphic shapes, smooth color blocking, expressive poses, simplified forms, clear silhouettes, modern animated design, playful and readable composition.",
  "3D Animation":
    "Stylized 3D animation look, polished modeling, soft global illumination, appealing textures, expressive forms, cinematic framing, animated feature quality, clean rendering, vibrant and dimensional.",
  "Dark as Fuk":
    "Haunting atmospheric style, eerie stillness, very disturbing and unsettling mood, quiet tension, ghostly lighting, muted colors, shadows, liminal spaces, subtle surreal details, lonely composition, restrained horror tone, dreamlike unease, beautiful but disturbing visual atmosphere.",
  "Pop as Fuk":
    "Poppy fun style, bright bold colors, playful composition, energetic, upbeat mood, glossy visual polish, cheerful, vibrant contrast, whimsical details, modern campaign-ready look, colorful and instantly engaging, super poppy music video vibes.",
  "Sexy as Fuk":
    "High-fashion edgy style, natural, anatomy allure, elegant sensuality, bare skin, bare anatomy, minimal, sculptural, flattering dramatic lighting, skin highlights, premium fashion photography, magnetic presence, sophisticated mood, form and shape, soft skin texture, risky high fashion, edgy.",
  "Strange as Fuk":
    "Strange surreal style, offbeat visual logic, unexpected shapes, odd proportions, unusual textures, dreamlike atmosphere, slightly unsettling but playful tone, surreal composition, imaginative art direction, weird in a smart and intentional way, strange morphs, unexpected abstract realism."
};
export const stylePresetNames = Object.keys(stylePresetPrompts);

export function normalizeStylePresetName(value, fallback = "None") {
  const migratedValue = value === "Cinematic" ? "Cinematic Standard" : value;
  return stylePresetNames.includes(migratedValue) ? migratedValue : fallback;
}

export const shotPresetPrompts = {
  None: "",
  CU: "A close up shot.",
  MS: "A medium shot.",
  WS: "A wide shot.",
  ECU: "An extreme close up shot.",
  EWS: "An extreme wide shot."
};
export const lensPresetPrompts = {
  None: "",
  "8mm": "Shot on a very wide fisheye 8mm prime lens.",
  "18mm": "Shot on a wide 18mm prime lens.",
  "35mm": "Shot on a wide 35mm prime lens.",
  "50mm": "Shot on a 50mm prime lens.",
  "85mm": "Shot on a long 85mm prime lens.",
  "120mm": "Shot on a long 120mm prime lens."
};
export const typePresetPrompts = {
  None: "",
  Macro: "Shot on a macro probe lens. Extremely close with very shallow depth of field and extremely detailed textures.",
  "Low Angle": "A low angle shot.",
  "High Angle": "A high angle shot.",
  "Extreme High": "A top view from extremely high angled shot.",
  "Bird's Eye View": "A TRUE BIRD'S EYE VIEW: THE CAMERA POSITIONED DIRECTLY ABOVE THE SUBJECT, POINTING STRAIGHT DOWN, SO WE LOOK directly DOWN ONTO THE TOP OF the subject AND THE FLOOR FILLS MOST OF THE FRAME. THE SUBJECT IS SEEN FROM DIRECTLY OVERHEAD, FORESHORTENED, ON THE GROUND BELOW.",
  "Extreme Low": "A worm's eye view from extremely low angled shot.",
  Portrait: "A portrait shot.",
  Profile: "A profile shot.",
  Selfie: "A selfie taken from a mobile device. We do not see the device, only the person/s taking the selfie picture."
};
export const shotPresetNames = Object.keys(shotPresetPrompts);
export const lensPresetNames = Object.keys(lensPresetPrompts);
export const typePresetNames = Object.keys(typePresetPrompts);

export const qwenCameraDefaults = {
  horizontalAngle: 90,
  verticalAngle: 0,
  zoom: 5,
  additionalPrompt: "",
  loraScale: 1,
  guidanceScale: 4.5,
  numInferenceSteps: 28
};

export const videoModelNames = {
  seedance: "Seedance 2.0",
  klingO3Pro: "Kling O3 Pro",
  klingO34k: "Kling O3 4K",
  geminiOmni: "Gemini Omni Flash",
  happyHorse: "Happy Horse",
  wanFunControl: "Wan Fun Control",
  wan27Reference: "Wan 2.7 Reference-to-Video",
  aurora: "Creatify Aurora",
  sam3Video: "SAM 3 Video"
};
export const videoModelOptions = [
  videoModelNames.seedance,
  videoModelNames.klingO3Pro,
  videoModelNames.klingO34k,
  videoModelNames.geminiOmni,
  videoModelNames.wan27Reference,
  videoModelNames.happyHorse,
  videoModelNames.aurora
];
export const videoWorkspaceModelOptions = videoModelOptions.filter((model) => model !== videoModelNames.aurora);
export const defaultModelPreferences = {
  image: Object.fromEntries(imageModelOptions.map((model) => [model, model === imageModelNames.zImage])),
  video: Object.fromEntries(videoModelOptions.map((model) => [model, true]))
};
export function normalizeModelPreferences(value = {}) {
  const incomingImage = value?.image && typeof value.image === "object" ? value.image : {};
  const incomingVideo = value?.video && typeof value.video === "object" ? value.video : {};
  const image = Object.fromEntries(imageModelOptions.map((model) => [model, Boolean(incomingImage[model] ?? defaultModelPreferences.image[model])]));
  const video = Object.fromEntries(videoModelOptions.map((model) => [model, Boolean(incomingVideo[model] ?? defaultModelPreferences.video[model])]));

  if (!Object.values(image).some(Boolean)) image[imageModelNames.zImage] = true;
  if (!Object.values(video).some(Boolean)) video[videoModelNames.seedance] = true;

  return { image, video };
}
export function enabledImageModelOptions(preferences) {
  const normalized = normalizeModelPreferences(preferences);
  return imageModelOptions.filter((model) => normalized.image[model]);
}
export function enabledVideoModelOptions(preferences, { workspaceOnly = false } = {}) {
  const normalized = normalizeModelPreferences(preferences);
  const options = workspaceOnly ? videoWorkspaceModelOptions : videoModelOptions;
  return options.filter((model) => normalized.video[model]);
}
export function firstEnabledImageModel(preferences) {
  return enabledImageModelOptions(preferences)[0] || imageModelNames.zImage;
}
export function firstEnabledVideoModel(preferences, { workspaceOnly = false } = {}) {
  return enabledVideoModelOptions(preferences, { workspaceOnly })[0] || videoModelNames.seedance;
}
export const wan27ReferenceDurationOptions = ["2 seconds", "3 seconds", "4 seconds", "5 seconds", "6 seconds", "7 seconds", "8 seconds", "9 seconds", "10 seconds"];
export const wan27ReferenceResolutionOptions = ["1080p", "720p"];
export const wan27ReferenceAspectRatioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4"];

export const model3DNames = {
  hunyuanPro: "Hunyuan 3D 3.1 Pro"
};
export const model3DViewInputs = [
  { id: "frontImageIn", view: "front", label: "Front" },
  { id: "backImageIn", view: "back", label: "Back" },
  { id: "leftImageIn", view: "left", label: "Left" },
  { id: "rightImageIn", view: "right", label: "Right" },
  { id: "topImageIn", view: "top", label: "Top" },
  { id: "bottomImageIn", view: "bottom", label: "Bottom" },
  { id: "leftFrontImageIn", view: "leftFront", label: "Left Front" },
  { id: "rightFrontImageIn", view: "rightFront", label: "Right Front" }
];
export const model3DDescription =
  "Generates a GLB 3D model from connected view images. Front is required; Back, Left, Right, Top, Bottom, Left Front, and Right Front are optional.";

export const utilityImageModelNames = {
  colorIdMatte: "Color ID Matte",
  qwenCameraEdit: "Qwen Camera Edit",
  stillFrame: "Grab Still Frame",
  dwpose: "DWPose",
  depthAnything: "Depth Anything",
  patina: "Patina",
  sam3Image: "SAM 3 Image",
  birefnetImage: "BiRefNet Image"
};
export const patinaMapOptions = [
  { id: "basecolor", label: "Basecolor" },
  { id: "normal", label: "Normal" },
  { id: "roughness", label: "Roughness" },
  { id: "metalness", label: "Metalness" },
  { id: "height", label: "Height" }
];
export const utilityVideoModelNames = {
  wanFunControl: "Wan Fun Control",
  extractFrame: "Extract Frame",
  colorIdMatte: "Color ID Matte",
  compositeVideo: "Composite Video",
  wanVaceMaskToVideo: "Wan VACE Mask-to-Video",
  wanVaceInpainting: "Wan VACE 14B Inpainting",
  sam3Video: "SAM 3 Video",
  voidVideoInpainting: "VOID Video Inpainting",
  birefnetVideo: "BiRefNet Video",
  rifeVideo: "RIFE Video",
  bytedanceUpscaler: "Bytedance Video Upscaler",
  topazUpscaler: "Topaz Video Upscale"
};

export const birefnetModelOptions = ["General Use (Light)", "General Use (Light 2K)", "General Use (Heavy)", "Matting", "Portrait", "General Use (Dynamic)"];
export const birefnetResolutionOptions = ["1024x1024", "2048x2048", "2304x2304"];
export const bytedanceUpscalerResolutionOptions = ["1080p", "2k", "4k"];
export const bytedanceUpscalerFpsOptions = ["30fps", "60fps"];
export const bytedanceUpscalerPresetOptions = ["general", "ugc", "short_series", "aigc", "old_film"];
export const bytedanceUpscalerTierOptions = ["fast", "standard", "pro"];
export const bytedanceUpscalerFidelityOptions = ["high", "medium"];
export const topazUpscalerModelOptions = [
  "Proteus",
  "Artemis HQ",
  "Artemis MQ",
  "Artemis LQ",
  "Nyx",
  "Nyx Fast",
  "Nyx XL",
  "Nyx HF",
  "Gaia HQ",
  "Gaia CG",
  "Gaia 2",
  "Starlight Precise 1",
  "Starlight Precise 2",
  "Starlight Precise 2.5",
  "Starlight HQ",
  "Starlight Mini",
  "Starlight Sharp",
  "Starlight Fast 1",
  "Starlight Fast 2"
];
export const topazUpscalerFpsOptions = ["source", "30", "60"];
export const topazUpscalerBillingTierOptions = [
  ["auto", "Auto"],
  ["up-to-720p", "Up to 720p"],
  ["720p-1080p", "720p to 1080p"],
  ["above-1080p", "Above 1080p"]
];
export const colorIdMatteVideoOutputOptions = [
  ["mp4", "MP4 mask"],
  ["webm", "WebM mask"],
  ["mov", "ProRes mask"]
];
export const wanVaceResolutionOptions = ["480p", "580p", "720p"];
export const wanVaceAspectRatioOptions = ["auto", "16:9", "9:16"];
export const wanVaceSamplerOptions = ["unipc", "dpm++", "euler"];
export const wanVaceAccelerationOptions = ["regular", "low", "none"];

export const utilityModelDescriptions = {
  [utilityImageModelNames.colorIdMatte]: "Creates a black and white ID matte from pixels matching a picked source-image color.",
  [utilityImageModelNames.qwenCameraEdit]: "Reframes a connected image with Qwen camera controls.",
  [utilityImageModelNames.stillFrame]: "Extracts a still PNG frame from a connected video locally, without an API call.",
  [utilityImageModelNames.dwpose]: "Creates pose/control maps from a source image for character and body-guided generation.",
  [utilityImageModelNames.depthAnything]: "Extracts a depth map from an image for depth-aware control and composition.",
  [utilityImageModelNames.patina]: "Generates PBR texture maps such as basecolor, normal, roughness, metalness, and height.",
  [utilityImageModelNames.sam3Image]: "Segments prompted objects in an image and returns the masked result.",
  [utilityImageModelNames.birefnetImage]: "Removes an image background with BiRefNet and can optionally return the mask.",
  [utilityVideoModelNames.wanFunControl]: "Uses a control video, optional reference image, and prompt to guide a new video.",
  [utilityVideoModelNames.extractFrame]: "Captures the current frame from a connected video and outputs it as a still image.",
  [utilityVideoModelNames.colorIdMatte]: "Creates a black and white ID matte video from frames matching a picked source-video color.",
  [utilityVideoModelNames.compositeVideo]: "Locally composites a generated layer video over a base video through a connected matte video.",
  [utilityVideoModelNames.wanVaceMaskToVideo]: "Uses Fal Wan VACE to create a prompted video from a reference image inside a connected mask video.",
  [utilityVideoModelNames.wanVaceInpainting]: "Uses Fal Wan VACE 14B with source video, mask video, prompt, and optional reference images for masked video generation.",
  [utilityVideoModelNames.sam3Video]: "Segments prompted objects through a video and returns a mask video.",
  [utilityVideoModelNames.voidVideoInpainting]: "Removes an object from a video and inpaints the affected background over time.",
  [utilityVideoModelNames.birefnetVideo]: "Removes a video background with BiRefNet and can optionally return the mask video.",
  [utilityVideoModelNames.rifeVideo]: "Interpolates in-between frames with RIFE optical-flow style motion estimation to smooth low-FPS video.",
  [utilityVideoModelNames.bytedanceUpscaler]: "Upscales video with Bytedance's Fal upscaler using resolution, FPS, preset, tier, and fidelity controls.",
  [utilityVideoModelNames.topazUpscaler]: "Upscales and enhances video with Topaz Video AI models, with optional interpolation and billing-tier tracking."
};

export const sam3SegmentationModelsEnabled = false; // Flip back to true when revisiting SAM 3 segmentation.

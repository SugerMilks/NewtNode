import React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  Box,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  FileAudio,
  FileImage,
  Film,
  FolderOpen,
  MonitorPlay,
  ImagePlus,
  Lock,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Pause,
  Play,
  Plus,
  Save,
  Trash2,
  Type,
  Unlock,
  UserRound,
  Video,
  Volume2,
  VolumeX,
  Wrench,
  X
} from "lucide-react";
import "./nodeEditor.css";

const nodeCatalog = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: FileImage },
  { type: "character", label: "Character", icon: UserRound },
  { type: "camera", label: "Camera", icon: Camera },
  { type: "composer", label: "Composer", icon: Box },
  { type: "style", label: "Style", icon: Palette },
  { type: "transfer", label: "Mood Board", icon: Compass },
  { type: "utility", label: "Utility", icon: Wrench },
  { type: "video", label: "Video", icon: Video },
  { type: "audio", label: "Audio", icon: FileAudio },
  { type: "preview", label: "Preview", icon: MonitorPlay },
  { type: "model3d", label: "3D", icon: Box },
  { type: "imageModel", label: "Image Model", icon: ImagePlus },
  { type: "videoModel", label: "Video Model", icon: Film }
];

const portColors = {
  prompt: "#f0c83b",
  image: "#3d85ff",
  camera: "#ef4444",
  style: "#9b5cff",
  transfer: "#ff4fb3",
  character: "#27d5e8",
  video: "#58ce63",
  audio: "#ff8b35",
  model3d: "#14d8c8",
  preview: "#8d8d8d"
};

const maxTransferImages = 6;
const moodBoardOutputFileName = "MOOD_BOARD.png";
const maxCharacterWardrobes = 8;
const maxCharacterVoices = 8;
const characterDefaultWardrobeId = "__default-wardrobe__";
const characterSheetPrompt =
  "Make one image:\n\nStudy the reference image of the character and preserve the person's identity, physical features, proportions, image quality, and visual style as closely as possible.\n\nCreate one high-resolution horizontal character photo sheet on a clean white background. The final image must contain exactly six panels and exactly six total depictions of the same character. Follow this fixed layout precisely:\n- On the left side, place two tall vertical full-body panels side by side: one full body front view, then one full body side profile.\n- On the right side, place four equal 1:1 square face close-up panels in a clean 2 by 2 grid: top left is a left side face profile, top right is a right side face profile, bottom left is a front face portrait with a resting neutral expression, and bottom right is a front face portrait with a natural talking expression with the mouth slightly open.\n\nEach panel must contain exactly one view only. Keep the grid clean, evenly spaced, and clearly separated by simple white spacing. Do not generate any additional views, duplicate depictions, merged two-in-one panels, alternate variations, split sheets, comparison images, multiple sheets, text, labels, props, frames, or borders.";
const characterBasicWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all six views. Replace the current wardrobe with a minimal form-fitting plain black one-piece wardrobe, consistently worn in every panel. Do not show the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";
const characterWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all six views. Study the selected wardrobe sheet reference and apply only the clothing design, garments, materials, colors, and styling from that reference consistently to the character in every panel. If any person, model, face, body, skin, hair, pose, environment, background, text, or unrelated subject appears in the wardrobe reference, ignore it completely. Do not transfer the wardrobe reference person's identity, anatomy, facial features, pose, body shape, or composition. The character portrait reference is the only source for character identity. Do not show the basic black outfit, the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";
const characterVoicePrompt =
  "Use the provided dialogue audio file for the character and make sure the dialogue is seamlessly and realistically integrated into the scene with professional mixing techniques.";
const characterTraitOptions = ["serious", "pleasant", "happy", "angry", "sad", "silly", "confident", "content", "excited", "passionate", "fanatic", "anxious", "scared", "arrogant", "stubborn", "curious"];
const batchOptions = ["1", "2", "3", "4"];
const imageModelAutoAspectRatio = "Auto";
const nanoImageAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"];
const openAiImageAspectRatios = nanoImageAspectRatios;
const happyHorseDurationOptions = Array.from({ length: 13 }, (_value, index) => `${index + 3} seconds`);
const voidVideoFrameOptions = [69, 77, 85, 93, 101, 109, 117, 125, 133, 141, 149, 157, 165, 173, 181, 189, 197];
const composerMannequinModelPath = "/models/male_mannequin.glb";
const composerMannequinModelScale = 1.45;
const composerReferencePrompt =
  "Use the connected Composer frame as a strict composition and blocking control image. Preserve its camera angle, framing, horizon/floor plane, subject silhouette, pose direction, major object positions, scale relationships, and negative space. Translate the simple maquette and proxy objects into the requested final subject matter, but do not copy viewport guide lines, grid lines, flat blue material, or simple primitive geometry as final image details.";
const transferPromptSuffix =
  "Only use the uploaded image labeled MOOD_BOARD.png as a reference for overall style, color grading and image qualities. The generated image should NOT take any elements, subjects, or compositional framing of the content from MOOD_BOARD.png directly; only use MOOD_BOARD.png as a visual guide to transfer the style to the generation.";
let composerMannequinAsset = null;
let composerMannequinAssetPromise = null;
let composerMannequinAssetFailed = false;
const stylePresetPrompts = {
  None: "",
  Cinematic:
    "High-end cinematic still frame, shot on ARRI Alexa 35, high quality prime lens, high dynamic range, shallow depth of field, atmospheric cinematography, high production value, feature film look.",
  Storyboard:
    "Hand-drawn digital storyboard, line drawing with minimalistic shading, grayscale shading, cinematic composition, production-planning style, loose but intentional drawing, simple tonal blocking, clear visual storytelling. A black and white line drawing. No color. No pencil or charcoal sketches. No text or numbers unless described. No frame boarders.",
  Commercial:
    "Polished commercial image, premium advertising style, clean composition, bright refined lighting, shallow depth of field, elevated brand look, modern campaign aesthetic, crisp details, visually appealing.",
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
const stylePresetNames = Object.keys(stylePresetPrompts);
const shotPresetPrompts = {
  None: "",
  CU: "A close up shot.",
  MS: "A medium shot.",
  WS: "A wide shot.",
  ECU: "An extreme close up shot.",
  EWS: "An extreme wide shot."
};
const lensPresetPrompts = {
  None: "",
  "18mm": "Shot on a wide 18mm prime lens.",
  "35mm": "Shot on a wide 35mm prime lens.",
  "50mm": "Shot on a 50mm prime lens.",
  "85mm": "Shot on a long 85mm prime lens.",
  "120mm": "Shot on a long 120mm prime lens.",
  Macro: "Shot on a macro probe lens."
};
const typePresetPrompts = {
  None: "",
  "Low Angle": "A low angle shot.",
  "High Angle": "A high angle shot.",
  "Extreme High": "A bird's eye view from extremely high angled shot.",
  "Extreme Low": "A worm's eye view from extremely low angled shot.",
  Portrait: "A portrait shot.",
  Profile: "A profile shot."
};
const shotPresetNames = Object.keys(shotPresetPrompts);
const lensPresetNames = Object.keys(lensPresetPrompts);
const typePresetNames = Object.keys(typePresetPrompts);
const qwenCameraDefaults = {
  horizontalAngle: 90,
  verticalAngle: 0,
  zoom: 5,
  additionalPrompt: "",
  loraScale: 1,
  guidanceScale: 4.5,
  numInferenceSteps: 28
};
const composerPoseFieldKeys = [
  "leftUpperArm",
  "leftUpperArmX",
  "leftUpperArmY",
  "leftUpperArmZ",
  "leftLowerArm",
  "leftLowerArmX",
  "leftLowerArmY",
  "leftLowerArmZ",
  "rightUpperArm",
  "rightUpperArmX",
  "rightUpperArmY",
  "rightUpperArmZ",
  "rightLowerArm",
  "rightLowerArmX",
  "rightLowerArmY",
  "rightLowerArmZ",
  "leftUpperLeg",
  "leftUpperLegX",
  "leftUpperLegY",
  "leftUpperLegZ",
  "leftLowerLeg",
  "leftLowerLegX",
  "leftLowerLegY",
  "leftLowerLegZ",
  "rightUpperLeg",
  "rightUpperLegX",
  "rightUpperLegY",
  "rightUpperLegZ",
  "rightLowerLeg",
  "rightLowerLegX",
  "rightLowerLegY",
  "rightLowerLegZ",
  "leftHandRotX",
  "leftHandRotY",
  "leftHandRotZ",
  "rightHandRotX",
  "rightHandRotY",
  "rightHandRotZ",
  "headRotX",
  "headRotY",
  "headRotZ",
  "upperBodyRotX",
  "upperBodyRotY",
  "upperBodyRotZ",
  "lean"
];
const composerAspectRatios = {
  "21:9": "21 / 9",
  "16:9": "16 / 9",
  "4:3": "4 / 3",
  "1:1": "1 / 1",
  "9:16": "9 / 16"
};
const composerPrimitiveOptions = [
  { id: "box", label: "Box" },
  { id: "sphere", label: "Sphere" },
  { id: "cylinder", label: "Cylinder" },
  { id: "cone", label: "Cone" }
];

function defaultComposerScene() {
  return {
    camera: {
      x: 3.4,
      y: 2.75,
      z: 4.15,
      yaw: 36,
      pitch: -16,
      distance: 6.2,
      fov: 38,
      targetY: 1.1
    },
    maquettes: [defaultComposerMaquette(1)],
    props: [defaultComposerProp(1)],
    imagePlanes: [],
    cameraBookmarks: []
  };
}

function defaultComposerMaquette(index = 1) {
  return {
    id: `maquette-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: `Maquette ${index}`,
    x: index === 1 ? 0 : (index - 1) * 0.8,
    y: 0,
    z: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
    pose: "",
    leftUpperArm: 0,
    leftUpperArmX: 0,
    leftUpperArmY: 0,
    leftUpperArmZ: 0,
    leftLowerArm: 0,
    leftLowerArmX: 0,
    leftLowerArmY: 0,
    leftLowerArmZ: 0,
    rightUpperArm: 0,
    rightUpperArmX: 0,
    rightUpperArmY: 0,
    rightUpperArmZ: 0,
    rightLowerArm: 0,
    rightLowerArmX: 0,
    rightLowerArmY: 0,
    rightLowerArmZ: 0,
    leftUpperLeg: 0,
    leftUpperLegX: 0,
    leftUpperLegY: 0,
    leftUpperLegZ: 0,
    leftLowerLeg: 0,
    leftLowerLegX: 0,
    leftLowerLegY: 0,
    leftLowerLegZ: 0,
    rightUpperLeg: 0,
    rightUpperLegX: 0,
    rightUpperLegY: 0,
    rightUpperLegZ: 0,
    rightLowerLeg: 0,
    rightLowerLegX: 0,
    rightLowerLegY: 0,
    rightLowerLegZ: 0,
    leftHandRotX: 0,
    leftHandRotY: 0,
    leftHandRotZ: 0,
    rightHandRotX: 0,
    rightHandRotY: 0,
    rightHandRotZ: 0,
    headRotX: 0,
    headRotY: 0,
    headRotZ: 0,
    upperBodyRotX: 0,
    upperBodyRotY: 0,
    upperBodyRotZ: 0,
    lean: 0,
    color: "#b8b8b2"
  };
}

function defaultComposerProp(index = 1, primitive = "box") {
  const normalizedPrimitive = normalizeComposerPrimitiveType(primitive);
  const primitiveLabel = composerPrimitiveLabel(normalizedPrimitive);
  return {
    id: `prop-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${primitiveLabel} ${index}`,
    primitive: normalizedPrimitive,
    x: index === 1 ? 1.6 : index * 0.6,
    y: 0,
    z: -0.45,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
    width: 0.9,
    height: 0.9,
    depth: 0.9,
    color: "#496b8f"
  };
}

function defaultComposerImagePlane(index = 1, imageUrl = "", label = "", aspectRatio = 16 / 9) {
  const size = composerImagePlaneSizeForAspect(aspectRatio);
  return {
    id: `image-plane-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: label || `Image Plane ${index}`,
    imageUrl,
    x: 0,
    y: 1.15,
    z: -1.4,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
    width: size.width,
    height: size.height,
    opacity: 1
  };
}

const initialNodes = [
  {
    id: "text-1",
    type: "text",
    x: 110,
    y: 108,
    data: {
      title: "Prompt",
      text: "A serene landscape with mountains"
    }
  },
  {
    id: "image-1",
    type: "image",
    x: 110,
    y: 442,
    data: {
      title: "Image"
    }
  },
  {
    id: "image-model-1",
    type: "imageModel",
    x: 620,
    y: 126,
    data: {
      title: "Image Model",
      model: "Nano Banana Pro",
      prompt: "A serene landscape with mountains",
      aspectRatio: "21:9",
      resolution: "2K"
    }
  },
  {
    id: "video-model-1",
    type: "videoModel",
    x: 1138,
    y: 44,
    data: {
      title: "Video Model",
      model: "Seedance 2.0",
      prompt: "A beautiful sunset over a calm ocean",
      duration: "15 seconds",
      resolution: "720p",
      aspectRatio: "16:9 (Landscape)",
      generateAudio: true
    }
  }
];

const initialEdges = [
  { id: "edge-1", from: { nodeId: "text-1", port: "promptOut" }, to: { nodeId: "image-model-1", port: "promptIn" }, color: portColors.prompt },
  { id: "edge-2", from: { nodeId: "image-1", port: "imageOut" }, to: { nodeId: "image-model-1", port: "imagePromptIn" }, color: portColors.image }
];

const contextMenuSize = { width: 190, height: 420, inset: 8 };
const viewportScaleFloor = 0.0001;
const maxZoom = 1.9;
const nodeDraftStorageKey = "seedance-node-editor-draft-v1";
const previewBaseWidth = 330;
const previewScaleFloor = 0.05;
const namedColorPalette = [
  { label: "Red", color: "#ff3b30" },
  { label: "Green", color: "#58ce63" },
  { label: "Blue", color: "#3d85ff" },
  { label: "Cyan", color: "#14d8c8" },
  { label: "Magenta", color: "#ff4fb3" },
  { label: "Yellow", color: "#f0c83b" },
  { label: "Orange", color: "#ff8b35" },
  { label: "Purple", color: "#9b5cff" }
];
const groupPalette = namedColorPalette.map((item) => item.color);
const nodeColorPalette = [{ label: "Neutral", color: "" }, ...namedColorPalette];
const referenceTagPalette = ["#4d8dff", "#ff4fb3", "#9b5cff", "#58ce63", "#ff8b35", "#f0c83b"];
const groupPadding = { x: 42, top: 62, bottom: 42 };
const groupSizeFloor = 1;
const imageRunStaggerMs = 850;
const videoModelNames = {
  seedance: "Seedance 2.0",
  seedanceFast: "Seedance 2.0 Fast",
  happyHorse: "Happy Horse",
  wanFunControl: "Wan Fun Control",
  wan27Reference: "Wan 2.7 Reference-to-Video",
  aurora: "Creatify Aurora",
  sam3Video: "SAM 3 Video"
};
const wan27ReferenceDurationOptions = ["2 seconds", "3 seconds", "4 seconds", "5 seconds", "6 seconds", "7 seconds", "8 seconds", "9 seconds", "10 seconds"];
const wan27ReferenceResolutionOptions = ["1080p", "720p"];
const wan27ReferenceAspectRatioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const model3DNames = {
  hunyuanPro: "Hunyuan 3D 3.1 Pro"
};
const model3DViewInputs = [
  { id: "frontImageIn", view: "front", label: "Front" },
  { id: "backImageIn", view: "back", label: "Back" },
  { id: "leftImageIn", view: "left", label: "Left" },
  { id: "rightImageIn", view: "right", label: "Right" },
  { id: "topImageIn", view: "top", label: "Top" },
  { id: "bottomImageIn", view: "bottom", label: "Bottom" },
  { id: "leftFrontImageIn", view: "leftFront", label: "Left Front" },
  { id: "rightFrontImageIn", view: "rightFront", label: "Right Front" }
];
const model3DDescription =
  "Generates a GLB 3D model from connected view images. Front is required; Back, Left, Right, Top, Bottom, Left Front, and Right Front are optional.";
const utilityImageModelNames = {
  colorIdMatte: "Color ID Matte",
  stillFrame: "Grab Still Frame",
  dwpose: "DWPose",
  depthAnything: "Depth Anything",
  patina: "Patina",
  sam3Image: "SAM 3 Image",
  birefnetImage: "BiRefNet Image"
};
const patinaMapOptions = [
  { id: "basecolor", label: "Basecolor" },
  { id: "normal", label: "Normal" },
  { id: "roughness", label: "Roughness" },
  { id: "metalness", label: "Metalness" },
  { id: "height", label: "Height" }
];
const utilityVideoModelNames = {
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
const birefnetModelOptions = ["General Use (Light)", "General Use (Light 2K)", "General Use (Heavy)", "Matting", "Portrait", "General Use (Dynamic)"];
const birefnetResolutionOptions = ["1024x1024", "2048x2048", "2304x2304"];
const bytedanceUpscalerResolutionOptions = ["1080p", "2k", "4k"];
const bytedanceUpscalerFpsOptions = ["30fps", "60fps"];
const bytedanceUpscalerPresetOptions = ["general", "ugc", "short_series", "aigc", "old_film"];
const bytedanceUpscalerTierOptions = ["fast", "standard", "pro"];
const bytedanceUpscalerFidelityOptions = ["high", "medium"];
const topazUpscalerModelOptions = [
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
const topazUpscalerFpsOptions = ["source", "30", "60"];
const topazUpscalerBillingTierOptions = [
  ["auto", "Auto"],
  ["up-to-720p", "Up to 720p"],
  ["720p-1080p", "720p to 1080p"],
  ["above-1080p", "Above 1080p"]
];
const colorIdMatteVideoOutputOptions = [
  ["mp4", "MP4 mask"],
  ["webm", "WebM mask"],
  ["mov", "ProRes mask"]
];
const wanVaceResolutionOptions = ["480p", "580p", "720p"];
const wanVaceAspectRatioOptions = ["auto", "16:9", "9:16"];
const wanVaceSamplerOptions = ["unipc", "dpm++", "euler"];
const wanVaceAccelerationOptions = ["regular", "low", "none"];
const utilityModelDescriptions = {
  [utilityImageModelNames.colorIdMatte]: "Creates a black and white ID matte from pixels matching a picked source-image color.",
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
const sam3SegmentationModelsEnabled = false; // Flip back to true when revisiting SAM 3 segmentation.

export default function NodeEditor({ active = true } = {}) {
  const canvasRef = React.useRef(null);
  const projectMenuRef = React.useRef(null);
  const contextMenuRef = React.useRef(null);
  const workflowFileInputRef = React.useRef(null);
  const localWorkflowHandleRef = React.useRef(null);
  const undoStackRef = React.useRef([]);
  const clipboardRef = React.useRef(null);
  const savedDraft = React.useMemo(loadNodeEditorDraft, []);
  const nodesRef = React.useRef(savedDraft.nodes);
  const edgesRef = React.useRef(savedDraft.edges);
  const [nodes, setNodes] = React.useState(savedDraft.nodes);
  const [edges, setEdges] = React.useState(savedDraft.edges);
  const [groups, setGroups] = React.useState(savedDraft.groups);
  const [dragState, setDragState] = React.useState(null);
  const [draftEdge, setDraftEdge] = React.useState(null);
  const [portPositions, setPortPositions] = React.useState({});
  const [selectionBounds, setSelectionBounds] = React.useState(null);
  const [viewport, setViewport] = React.useState(savedDraft.viewport);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState([]);
  const [projectName, setProjectName] = React.useState(savedDraft.projectName);
  const [projectId, setProjectId] = React.useState(savedDraft.projectId);
  const [savedProjectName, setSavedProjectName] = React.useState(savedDraft.savedProjectName);
  const [projectPackagePath, setProjectPackagePath] = React.useState(savedDraft.projectPackagePath);
  const [projects, setProjects] = React.useState([]);
  const [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
  const [localWorkflowFileName, setLocalWorkflowFileName] = React.useState("");
  const [contextMenu, setContextMenu] = React.useState(null);
  const [toolbarCollapsed, setToolbarCollapsed] = React.useState(true);
  const [saveStatus, setSaveStatus] = React.useState("");
  const [compilingTransferNodeId, setCompilingTransferNodeId] = React.useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState(null);
  const [composerEditorNodeId, setComposerEditorNodeId] = React.useState(null);

  const incomingByNode = React.useMemo(() => buildIncomingByNode(nodes, edges), [nodes, edges]);
  const connectedPortKeys = React.useMemo(() => buildConnectedPortKeys(edges), [edges]);
  const selectedNodeSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const activeEdgeIds = React.useMemo(() => buildActiveEdgeIds(nodes, edges), [nodes, edges]);
  const inactiveEdgeIds = React.useMemo(() => buildInactiveEdgeIds(nodes, edges), [nodes, edges]);
  const referenceTagHighlights = React.useMemo(() => buildReferenceTagHighlights(nodes, incomingByNode), [nodes, incomingByNode]);
  const selectedRunnableNodes = React.useMemo(
    () => nodes.filter((node) => selectedNodeSet.has(node.id) && isRunnableNode(node) && node.data.status !== "running"),
    [nodes, selectedNodeSet]
  );
  const selectedPlayablePreviewNodes = React.useMemo(
    () => nodes.filter((node) => selectedNodeSet.has(node.id) && previewVideoSourceForNode(node, incomingByNode)),
    [nodes, selectedNodeSet, incomingByNode]
  );
  const selectedRunAllCount = selectedRunnableNodes.length + selectedPlayablePreviewNodes.length;
  const selectedProjectName = projects.find((project) => project.id === projectId)?.name;
  const composerEditorNode = nodes.find((node) => node.id === composerEditorNodeId && node.type === "composer");

  function workflowRequestContext(overrides = {}) {
    return {
      projectId: projectId || "",
      projectName: projectName || "Untitled node project",
      workflowPackageId: projectPackagePath ? projectId || "" : "",
      workflowPackagePath: projectPackagePath || "",
      ...overrides
    };
  }

  function appendWorkflowContextToForm(form, overrides = {}) {
    const context = workflowRequestContext(overrides);
    Object.entries(context).forEach(([key, value]) => {
      form.append(key, value || "");
    });
  }

  React.useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  React.useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  React.useEffect(() => {
    setEdges((current) => {
      const normalizedEdges = normalizeEdgesForCurrentGraph(current, nodesRef.current);
      if (sameEdgeList(current, normalizedEdges)) return current;
      edgesRef.current = normalizedEdges;
      return normalizedEdges;
    });
  }, [edges, nodes]);

  React.useLayoutEffect(() => {
    if (!active) return undefined;

    const frame = window.requestAnimationFrame(() => {
      updatePortPositions();
      updateSelectionBounds();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, nodes, viewport, selectedNodeIds]);

  React.useLayoutEffect(() => {
    if (!active) return;
    syncGroupMembership();
  }, [active, nodes, groups, viewport]);

  React.useEffect(() => {
    loadProjects();
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        nodeDraftStorageKey,
        JSON.stringify({
          nodes,
          edges,
          groups,
          viewport,
          projectId,
          projectName,
          savedProjectName,
          projectPackagePath
        })
      );
    } catch {
      // Local persistence should never interrupt the node editor.
    }
  }, [nodes, edges, groups, viewport, projectId, projectName, savedProjectName, projectPackagePath]);

  React.useEffect(() => {
    if (!active) return undefined;
    const handleResize = () => updatePortPositions();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [active, viewport]);

  React.useEffect(() => {
    if (selectedEdgeId && !edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  React.useEffect(() => {
    if (!active) return undefined;
    function handleKeyDown(event) {
      const commandKey = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (commandKey && key === "s") {
        event.preventDefault();
        saveProject();
        return;
      }

      if (event.target.closest?.("input, textarea, select")) return;

      if (commandKey && (key === "=" || key === "+")) {
        event.preventDefault();
        zoomViewportAtCanvasCenter(1.16);
        return;
      }

      if (commandKey && key === "-") {
        event.preventDefault();
        zoomViewportAtCanvasCenter(1 / 1.16);
        return;
      }

      if (commandKey && key === "0") {
        event.preventDefault();
        resetViewportZoom();
        return;
      }

      if (commandKey && key === "z") {
        event.preventDefault();
        undoGraphChange();
        return;
      }

      if (commandKey && key === "c") {
        event.preventDefault();
        copySelection();
        return;
      }

      if (commandKey && key === "v") {
        event.preventDefault();
        pasteSelection();
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        if (selectedEdgeId) {
          event.preventDefault();
          removeEdges([selectedEdgeId]);
          return;
        }

        if (!selectedNodeIds.length) return;
        event.preventDefault();
        removeNodes(selectedNodeIds);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, selectedNodeIds, selectedEdgeId, nodes, edges, groups, viewport, projectId, projectName, savedProjectName, selectedProjectName, projectPackagePath]);

  React.useEffect(() => {
    if (!active) return undefined;
    function handlePointerDown(event) {
      if (!projectMenuRef.current?.contains(event.target)) {
        setProjectMenuOpen(false);
      }
      if (!event.target.closest?.(".node-context-menu")) {
        if (contextMenu?.pendingConnection) setDraftEdge(null);
        setContextMenu(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [active, contextMenu]);

  React.useLayoutEffect(() => {
    if (!active || !contextMenu) return;
    const canvas = canvasRef.current;
    const menu = contextMenuRef.current;
    if (!canvas || !menu) return;

    const canvasRect = canvas.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const nextPosition = clampContextMenuPosition(contextMenu.x, contextMenu.y, canvasRect, {
      width: menuRect.width,
      height: menuRect.height
    });

    if (Math.abs(nextPosition.x - contextMenu.x) < 0.5 && Math.abs(nextPosition.y - contextMenu.y) < 0.5) return;
    setContextMenu((current) => (current ? { ...current, x: nextPosition.x, y: nextPosition.y } : current));
  }, [active, contextMenu]);

  React.useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleWheel(event) {
      handleCanvasWheel(event);
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [active]);

  React.useEffect(() => {
    if (!active) return undefined;
    function blockPagePinchOutsideCanvas(event) {
      if (!event.ctrlKey && !event.metaKey) return;

      const canvas = canvasRef.current;
      if (canvas?.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
    }

    function blockBrowserGestureOutsideCanvas(event) {
      const canvas = canvasRef.current;
      if (canvas?.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("wheel", blockPagePinchOutsideCanvas, { passive: false, capture: true });
    window.addEventListener("gesturestart", blockBrowserGestureOutsideCanvas, { passive: false, capture: true });
    window.addEventListener("gesturechange", blockBrowserGestureOutsideCanvas, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", blockPagePinchOutsideCanvas, { capture: true });
      window.removeEventListener("gesturestart", blockBrowserGestureOutsideCanvas, { capture: true });
      window.removeEventListener("gesturechange", blockBrowserGestureOutsideCanvas, { capture: true });
    };
  }, [active]);

  function updatePortPositions() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const nextPositions = {};
    canvas.querySelectorAll("[data-port-key]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      nextPositions[element.dataset.portKey] = {
        x: (rect.left - canvasRect.left + rect.width / 2 - viewport.x) / viewport.scale,
        y: (rect.top - canvasRect.top + rect.height / 2 - viewport.y) / viewport.scale
      };
    });
    setPortPositions(nextPositions);
  }

  function updateSelectionBounds() {
    if (selectedNodeIds.length < 2) {
      setSelectionBounds(null);
      return;
    }

    setSelectionBounds(getNodeSetBounds(selectedNodeIds));
  }

  function getNodeSetBounds(nodeIds) {
    const bounds = nodeIds.map(getNodeBounds).filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    if (!bounds.length) return null;

    const left = Math.min(...bounds.map((rect) => rect.left));
    const top = Math.min(...bounds.map((rect) => rect.top));
    const right = Math.max(...bounds.map((rect) => rect.right));
    const bottom = Math.max(...bounds.map((rect) => rect.bottom));

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function syncGroupMembership() {
    if (!groups.length || !canvasRef.current) return;

    setGroups((current) => {
      let changed = false;
      const nextGroups = current.map((group) => {
        const nodeIds = getNodeIdsInsideGroup(group);
        const nextNodeIds = nodeIds;

        if (sameStringList(group.nodeIds || [], nextNodeIds)) return group;
        changed = true;
        return { ...group, nodeIds: nextNodeIds };
      });

      return changed ? nextGroups : current;
    });
  }

  function addNode(type, position, options = {}) {
    const count = nodesRef.current.filter((node) => node.type === type).length + 1;
    const spec = nodeCatalog.find((item) => item.type === type);
    const nodePosition = position || defaultNodePosition(count);
    const nodeId = createNodeId(type);
    const nextNode = {
      id: nodeId,
      type,
      x: nodePosition.x,
      y: nodePosition.y,
      data: createDefaultNodeData(type, spec?.label || "Node", count)
    };
    const graphNodes = [...nodesRef.current, nextNode];
    const pendingConnection = options.pendingConnection || null;
    const pendingInput = pendingConnection ? compatibleInputPortForNewNode(pendingConnection.from, nextNode, graphNodes) : null;
    pushUndoSnapshot();
    setSelectedEdgeId(null);
    setNodes((current) => [...current, nextNode]);
    setSelectedNodeIds([nodeId]);
    if (pendingConnection && pendingInput) {
      setEdges((current) =>
        dedupeEdges([
          ...current,
          {
            id: `edge-${Date.now()}`,
            from: pendingConnection.from,
            to: { nodeId, port: pendingInput },
            color: pendingConnection.color
          }
        ])
      );
      setSaveStatus(`Connected ${spec?.label || "node"}`);
    } else if (pendingConnection) {
      setSaveStatus(`${spec?.label || "Node"} added`);
    }
    if (pendingConnection) setDraftEdge(null);
    setContextMenu(null);
  }

  function defaultNodePosition(count) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return {
        x: 180 + count * 28,
        y: 160 + count * 24
      };
    }

    const rect = canvas.getBoundingClientRect();
    const sceneCenter = screenToScene(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const cascadeOffset = ((count - 1) % 6) * 28;
    return {
      x: sceneCenter.x - 170 + cascadeOffset,
      y: sceneCenter.y - 120 + cascadeOffset
    };
  }

  function pointerNodePosition(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const clientX = clamp(event.clientX, rect.left + 16, rect.right - 16);
    const clientY = clamp(event.clientY, rect.top + 16, rect.bottom - 16);
    return screenToScene(clientX, clientY);
  }

  function removeNode(nodeId) {
    removeNodes([nodeId]);
  }

  function removeNodes(nodeIds) {
    if (!nodeIds.length) return;
    pushUndoSnapshot();
    const ids = new Set(nodeIds);
    setNodes((current) => current.filter((node) => !ids.has(node.id)));
    setEdges((current) => current.filter((edge) => !ids.has(edge.from.nodeId) && !ids.has(edge.to.nodeId)));
    setGroups((current) =>
      current.map((group) => ({ ...group, nodeIds: (group.nodeIds || []).filter((id) => !ids.has(id)) })).filter((group) => group.nodeIds.length)
    );
    setSelectedNodeIds((current) => current.filter((id) => !ids.has(id)));
    setSelectedEdgeId((current) => {
      const edge = edges.find((item) => item.id === current);
      return edge && (ids.has(edge.from.nodeId) || ids.has(edge.to.nodeId)) ? null : current;
    });
  }

  function removeEdges(edgeIds) {
    if (!edgeIds.length) return;
    pushUndoSnapshot();
    const ids = new Set(edgeIds);
    setEdges((current) => current.filter((edge) => !ids.has(edge.id)));
    setSelectedEdgeId(null);
    setSaveStatus(`${edgeIds.length} connection${edgeIds.length === 1 ? "" : "s"} deleted`);
  }

  function createGroupFromSelection() {
    if (selectedNodeIds.length < 2) return;

    const bounds = getNodeSetBounds(selectedNodeIds);
    if (!bounds) {
      setSaveStatus("Could not find selected node bounds");
      return;
    }

    pushUndoSnapshot();
    const color = groupPalette[groups.length % groupPalette.length];
    const group = {
      id: `group-${Date.now()}`,
      name: `Group ${groups.length + 1}`,
      color,
      x: Math.round(bounds.left - groupPadding.x),
      y: Math.round(bounds.top - groupPadding.top),
      width: Math.round(Math.max(groupSizeFloor, bounds.width + groupPadding.x * 2)),
      height: Math.round(Math.max(groupSizeFloor, bounds.height + groupPadding.top + groupPadding.bottom)),
      nodeIds: [...selectedNodeIds]
    };

    setGroups((current) => [...current, group]);
    setSelectedEdgeId(null);
    setSaveStatus(`Grouped ${selectedNodeIds.length} nodes`);
  }

  function updateGroup(groupId, patch) {
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
  }

  function removeGroup(groupId) {
    pushUndoSnapshot();
    setGroups((current) => current.filter((group) => group.id !== groupId));
    setSaveStatus("Group removed");
  }

  function startGroupDrag(event, group) {
    if (event.target.closest("input, textarea, select, button, .group-resize-handle")) return;
    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();

    const groupNodeIds = getNodeIdsInsideGroup(group);
    const movableNodeIds = groupNodeIds;
    const nodeSet = new Set(movableNodeIds);
    const pointer = screenToScene(event.clientX, event.clientY);

    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeIds(movableNodeIds);
    setSelectedEdgeId(null);
    updateGroup(group.id, { nodeIds: movableNodeIds });
    setDragState({
      type: "group",
      groupId: group.id,
      startPointer: pointer,
      group: {
        x: group.x,
        y: group.y
      },
      nodes: nodes
        .filter((node) => nodeSet.has(node.id))
        .map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y
        }))
    });
  }

  function startGroupResize(event, group) {
    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();
    const pointer = screenToScene(event.clientX, event.clientY);

    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedEdgeId(null);
    setDragState({
      type: "groupResize",
      groupId: group.id,
      startPointer: pointer,
      group: {
        width: group.width,
        height: group.height
      }
    });
  }

  function updateNode(nodeId, patch) {
    let nextUtilityData = null;
    let nextCameraData = null;
    const cameraPresetChanged = ["shotPreset", "lensPreset", "typePreset"].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    setNodes((current) => {
      const shouldUpdateConnectedPreviews = Array.isArray(patch.resultItems) && patch.resultItems.some((item) => item?.url);
      const nextNodes = current.map((node) =>
        node.id === nodeId
          ? (() => {
              const data = {
                ...node.data,
                ...patch
              };
              if (node.type === "utility") nextUtilityData = data;
              if (node.type === "camera") nextCameraData = data;
              return {
                ...node,
                data
              };
            })()
          : node
      );
      const updatedNodes = shouldUpdateConnectedPreviews ? syncConnectedPreviewNodes(nextNodes, nodeId, edgesRef.current) : nextNodes;
      nodesRef.current = updatedNodes;
      return updatedNodes;
    });

    if (nextUtilityData && ("utilityMode" in patch || "utilityImageModel" in patch || "utilityVideoModel" in patch)) {
      const activePorts = new Set(utilityInputPortIds(nextUtilityData.utilityMode, nextUtilityData.utilityImageModel, nextUtilityData.utilityVideoModel));
      setEdges((current) =>
        current.filter((edge) => {
          const staleOutput = "utilityMode" in patch && edge.from.nodeId === nodeId;
          const inactiveInput = edge.to.nodeId === nodeId && !activePorts.has(edge.to.port);
          return !staleOutput && !inactiveInput;
        })
      );
    }

    if (nextCameraData && cameraPresetChanged && !hasCameraPreset({ data: nextCameraData })) {
      setEdges((current) => current.filter((edge) => !(edge.from.nodeId === nodeId && edge.from.port === "cameraOut")));
      setSelectedEdgeId((current) => {
        const selectedEdge = edgesRef.current.find((edge) => edge.id === current);
        return selectedEdge?.from.nodeId === nodeId && selectedEdge?.from.port === "cameraOut" ? null : current;
      });
    }
  }

  async function uploadMediaAsset(node, file) {
    if (!file) return;
    const isModel3DUpload = node.type === "model3d";

    if (isModel3DUpload && !/\.glb$/i.test(file.name || "")) {
      updateNode(node.id, {
        status: "error",
        error: "Open only supports .glb files for 3D nodes."
      });
      return;
    }

    pushUndoSnapshot();
    updateNode(node.id, {
      fileName: file.name,
      status: "uploading",
      error: "",
      resultUrl: ""
    });

    const form = new FormData();
    appendWorkflowContextToForm(form);
    form.append("nodeType", node.type);
    form.append("asset", file);

    try {
      const response = await fetch("/api/node/upload-asset", {
        method: "POST",
        body: form
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      const asset = data.asset || {};

      if (isModel3DUpload) {
        const nextItems = appendResultItems(
          existingResultItemsForNode(node, "model3d"),
          [
            {
              url: asset.localUrl,
              type: "model3d",
              label: asset.fileName || "Imported GLB"
            }
          ],
          "model3d"
        );

        updateNode(node.id, {
          fileName: asset.fileName,
          storedFileName: asset.storedFileName,
          mimeType: asset.mimeType,
          mediaType: "model3d",
          resultUrl: asset.localUrl,
          resultItems: nextItems,
          selectedResultIndex: Math.max(0, nextItems.length - 1),
          resultType: "model3d",
          status: "ready",
          error: ""
        });
        return;
      }

      updateNode(node.id, {
        fileName: asset.fileName,
        storedFileName: asset.storedFileName,
        mimeType: asset.mimeType,
        mediaType: asset.mediaType,
        resultUrl: asset.localUrl,
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, {
        status: "error",
        error: error.message
      });
    }
  }

  function syncConnectedPreviewNodes(nextNodes, sourceNodeId, currentEdges) {
    const hasPreviewConnection = currentEdges.some((edge) => edge.from.nodeId === sourceNodeId && edge.to.port === "sourceIn");
    if (!hasPreviewConnection) return nextNodes;

    const incomingByPreview = buildIncomingByNode(nextNodes, currentEdges);
    return nextNodes.map((node) => {
      if (node.type !== "preview") return node;
      const incomingSources = incomingByPreview[node.id]?.sourceIn || [];
      if (!incomingSources.some(({ edge }) => edge.from.nodeId === sourceNodeId)) return node;

      const previewItems = connectedPreviewSources(incomingSources);
      let latestIndex = -1;
      previewItems.forEach((item, index) => {
        if (item.sourceNodeId === sourceNodeId) latestIndex = index;
      });
      if (latestIndex < 0) return node;

      return {
        ...node,
        data: {
          ...node.data,
          previewSelectedIndex: latestIndex
        }
      };
    });
  }

  async function captureComposerFrame(node, imageDataUrl) {
    pushUndoSnapshot();
    updateNode(node.id, {
      status: "uploading",
      error: ""
    });

    try {
      const composerScene = normalizedComposerScene(node.data.composerScene);
      const { response, data } = await fetchJsonApi("/api/node/composer-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...workflowRequestContext(),
          imageDataUrl,
          nodeId: node.id,
          nodeTitle: node.data.title,
          aspectRatio: node.data.composerAspectRatio || "16:9",
          maquetteCount: composerScene.maquettes.length,
          propCount: composerScene.props.length,
          imagePlaneCount: composerScene.imagePlanes.length
        })
      }, "Composer capture");
      if (!response.ok) throw new Error(data.error || "Composer capture failed.");

      updateNode(node.id, {
        fileName: data.image.fileName,
        mimeType: data.image.mimeType,
        mediaType: "image",
        resultUrl: data.image.localUrl,
        resultItems: [
          {
            url: data.image.localUrl,
            type: "image",
            label: "Composer frame",
            cost: data.cost
          }
        ],
        selectedResultIndex: 0,
        status: "complete",
        error: ""
      });
      setSaveStatus("Composer frame captured");
    } catch (error) {
      updateNode(node.id, {
        status: "error",
        error: error.message
      });
      throw error;
    }
  }

  async function uploadTransferImages(node, fileList) {
    if (node.data.locked) return;

    const existingImages = Array.isArray(node.data.transferImages) ? node.data.transferImages : [];
    const files = Array.from(fileList || [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, maxTransferImages - existingImages.length);

    if (!files.length) return;

    pushUndoSnapshot();
    updateNode(node.id, {
      status: "uploading",
      error: "",
      activated: false,
      resultUrl: ""
    });

    try {
      const uploadedImages = [];
      for (const file of files) {
        const form = new FormData();
        appendWorkflowContextToForm(form);
        form.append("nodeType", "transfer");
        form.append("asset", file);

        const response = await fetch("/api/node/upload-asset", {
          method: "POST",
          body: form
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Upload failed.");

        uploadedImages.push({
          id: `transfer-image-${Date.now()}-${uploadedImages.length}`,
          fileName: data.asset.fileName,
          storedFileName: data.asset.storedFileName,
          mimeType: data.asset.mimeType,
          localUrl: data.asset.localUrl
        });
      }

      updateNode(node.id, {
        transferImages: [...existingImages, ...uploadedImages].slice(0, maxTransferImages),
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, {
        status: "error",
        error: error.message
      });
    }
  }

  async function uploadCharacterPortrait(node, file) {
    if (!file || !file.type.startsWith("image/")) return;

    pushUndoSnapshot();
    updateNode(node.id, { status: "uploading", error: "" });

    try {
      const asset = await uploadNodeAsset(file, "character");
      updateNode(node.id, {
        characterPortrait: asset,
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, { status: "error", error: error.message });
    }
  }

  async function uploadCharacterWardrobes(node, fileList) {
    const existing = Array.isArray(node.data.characterWardrobes) ? node.data.characterWardrobes : [];
    const files = Array.from(fileList || [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, maxCharacterWardrobes - existing.length);
    if (!files.length) return;

    pushUndoSnapshot();
    updateNode(node.id, { status: "uploading", error: "" });

    try {
      const assets = [];
      for (const file of files) {
        const asset = await uploadNodeAsset(file, "character");
        assets.push({ ...asset, id: `character-wardrobe-${Date.now()}-${assets.length}` });
      }
      const nextWardrobes = [...existing, ...assets].slice(0, maxCharacterWardrobes);
      updateNode(node.id, {
        characterWardrobes: nextWardrobes,
        activeWardrobeId: node.data.activeWardrobeId || nextWardrobes[0]?.id || "",
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, { status: "error", error: error.message });
    }
  }

  async function uploadCharacterVoices(node, fileList) {
    const existing = Array.isArray(node.data.characterVoices) ? node.data.characterVoices : [];
    const files = Array.from(fileList || [])
      .filter((file) => file.type.startsWith("audio/"))
      .slice(0, maxCharacterVoices - existing.length);
    if (!files.length) return;

    pushUndoSnapshot();
    updateNode(node.id, { status: "uploading", error: "" });

    try {
      const assets = [];
      for (const file of files) {
        const asset = await uploadNodeAsset(file, "character");
        assets.push({ ...asset, id: `character-voice-${Date.now()}-${assets.length}` });
      }
      const nextVoices = [...existing, ...assets].slice(0, maxCharacterVoices);
      updateNode(node.id, {
        characterVoices: nextVoices,
        activeVoiceId: node.data.activeVoiceId || nextVoices[0]?.id || "",
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, { status: "error", error: error.message });
    }
  }

  function removeCharacterWardrobe(nodeId, wardrobeId) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const wardrobes = (node.data.characterWardrobes || []).filter((item) => item.id !== wardrobeId);
    const variants = (node.data.characterSheetVariants || []).filter((variant) => variant.wardrobeId !== wardrobeId);
    const activeWardrobeId = node.data.activeWardrobeId === wardrobeId ? wardrobes[0]?.id || "" : node.data.activeWardrobeId;
    const selectedVariant = characterSheetVariantForWardrobeId({ ...node.data, characterSheetVariants: variants }, activeWardrobeId);
    pushUndoSnapshot();
    const patch = {
      characterWardrobes: wardrobes,
      activeWardrobeId
    };
    if (node.data.locked && selectedVariant) {
      updateNode(nodeId, {
        ...patch,
        characterSheetVariants: variants,
        ...characterVariantDisplayPatch(selectedVariant),
        characterVariantNotice: ""
      });
      return;
    }
    updateNode(nodeId, {
      ...patch,
      characterSheetVariants: [],
      activated: false,
      locked: false,
      resultUrl: "",
      resultItems: [],
      compiledWardrobeUrl: "",
      characterVariantNotice: "",
      error: ""
    });
  }

  function removeCharacterVoice(nodeId, voiceId) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const voices = (node.data.characterVoices || []).filter((item) => item.id !== voiceId);
    pushUndoSnapshot();
    updateNode(nodeId, {
      characterVoices: voices,
      activeVoiceId: node.data.activeVoiceId === voiceId ? voices[0]?.id || "" : node.data.activeVoiceId,
      error: ""
    });
  }

  async function activateCharacterNode(node) {
    const portrait = node.data.characterPortrait;
    const name = String(node.data.characterName || "").trim();
    if (!portrait?.localUrl) {
      updateNode(node.id, { error: "Upload a character portrait first." });
      return;
    }
    if (!name) {
      updateNode(node.id, { error: "Enter a character name before locking." });
      return;
    }

    const wardrobes = Array.isArray(node.data.characterWardrobes) ? node.data.characterWardrobes : [];
    const wardrobeOptions = wardrobes.length ? wardrobes : [null];
    const desiredWardrobeId = characterWardrobeVariantId(activeCharacterWardrobe(node));
    const selectedVoice = activeCharacterVoice(node);
    const physicalDetailsPrompt = characterPhysicalDetailsPrompt(node.data);
    let completedVariantCount = 0;

    try {
      updateNode(node.id, {
        status: "compiling",
        characterBatchProgress: { completed: 0, total: wardrobeOptions.length },
        characterVariantNotice: "",
        error: ""
      });
      const results = await Promise.allSettled(
        wardrobeOptions.map(async (wardrobe) => {
          try {
            const prompt = [characterSheetPrompt, wardrobe ? characterWardrobePrompt : characterBasicWardrobePrompt, physicalDetailsPrompt].filter(Boolean).join("\n\n");
            const generated = await runCharacterSheetGeneration({
              node,
              prompt,
              portrait,
              wardrobe,
              workflowContext: workflowRequestContext()
            });
            return {
              wardrobeId: characterWardrobeVariantId(wardrobe),
              wardrobeUrl: wardrobe?.localUrl || "",
              wardrobeFileName: wardrobe?.fileName || "Default black wardrobe",
              generated
            };
          } finally {
            completedVariantCount += 1;
            updateNode(node.id, {
              characterBatchProgress: { completed: completedVariantCount, total: wardrobeOptions.length }
            });
          }
        })
      );
      const variants = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
      const failures = results.filter((result) => result.status === "rejected");
      if (!variants.length) {
        throw failures[0]?.reason || new Error("Character sheet generation failed.");
      }
      const selectedVariant = variants.find((variant) => variant.wardrobeId === desiredWardrobeId) || variants[0];
      const variantNotice = failures.length
        ? `${failures.length} outfit sheet${failures.length === 1 ? "" : "s"} could not be generated.`
        : "";
      pushUndoSnapshot();
      updateNode(node.id, {
        activated: true,
        locked: true,
        characterTab: "sheet",
        characterSheetVariants: variants,
        activeWardrobeId: selectedVariant.wardrobeId === characterDefaultWardrobeId ? "" : selectedVariant.wardrobeId,
        compiledTraitPrompt: characterTraitPrompt(node.data),
        compiledVoicePrompt: selectedVoice ? characterVoicePrompt : "",
        characterBatchProgress: null,
        characterVariantNotice: variantNotice,
        ...characterVariantDisplayPatch(selectedVariant),
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, {
        status: "error",
        characterBatchProgress: null,
        error: error.message
      });
    }
  }

  function unlockCharacterNode(nodeId) {
    pushUndoSnapshot();
    updateNode(nodeId, {
      activated: false,
      locked: false,
      characterTab: "build",
      resultUrl: "",
      resultItems: [],
      fileName: "",
      compiledWardrobeUrl: "",
      compiledTraitPrompt: "",
      compiledVoicePrompt: "",
      characterSheetVariants: [],
      characterBatchProgress: null,
      characterVariantNotice: "",
      status: "ready",
      error: ""
    });
  }

  async function uploadNodeAsset(file, nodeType) {
    const form = new FormData();
    appendWorkflowContextToForm(form);
    form.append("nodeType", nodeType);
    form.append("asset", file);
    const response = await fetch("/api/node/upload-asset", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed.");
    return {
      fileName: data.asset.fileName,
      storedFileName: data.asset.storedFileName,
      mimeType: data.asset.mimeType,
      mediaType: data.asset.mediaType,
      localUrl: data.asset.localUrl
    };
  }

  function removeTransferImage(nodeId, imageId) {
    pushUndoSnapshot();
    updateNode(nodeId, {
      transferImages: nodes.find((node) => node.id === nodeId)?.data.transferImages?.filter((image) => image.id !== imageId) || [],
      activated: false,
      locked: false,
      resultUrl: "",
      fileName: "",
      error: ""
    });
    setEdges((current) => current.filter((edge) => edge.from.nodeId !== nodeId));
    setSelectedEdgeId(null);
  }

  function startPreviewResize(event, node, scaleKey = "previewScale") {
    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = screenToScene(event.clientX, event.clientY);
    setDragState({
      type: "nodeScaleResize",
      nodeId: node.id,
      scaleKey,
      startPointer: pointer,
      startScale: Number(node.data[scaleKey] || 1)
    });
  }

  async function activateTransferNode(node) {
    const transferImages = Array.isArray(node.data.transferImages) ? node.data.transferImages.filter((image) => image.localUrl) : [];
    if (!transferImages.length) {
      updateNode(node.id, { error: "Upload at least one image." });
      return;
    }

    try {
      setCompilingTransferNodeId(node.id);
      updateNode(node.id, { status: "compiling", error: "" });
      const collageBlob = await createTransferCollageBlob(transferImages);
      const transferFile = new File([collageBlob], moodBoardOutputFileName, { type: "image/png" });
      const form = new FormData();
      appendWorkflowContextToForm(form);
      form.append("nodeId", node.id);
      form.append("asset", transferFile);

      const response = await fetch("/api/node/upload-transfer-collage", {
        method: "POST",
        body: form
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not compile ${moodBoardOutputFileName}.`);

      pushUndoSnapshot();
      updateNode(node.id, {
        activated: true,
        locked: true,
        resultUrl: data.asset.localUrl,
        fileName: data.asset.fileName,
        storedFileName: data.asset.storedFileName,
        mimeType: data.asset.mimeType,
        hiddenPrompt: transferPromptSuffix,
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, { status: "error", error: error.message });
    } finally {
      setCompilingTransferNodeId(null);
    }
  }

  function unlockTransferNode(nodeId) {
    pushUndoSnapshot();
    updateNode(nodeId, {
      activated: false,
      locked: false,
      resultUrl: "",
      fileName: "",
      status: "ready",
      error: ""
    });
  }

  function startNodeDrag(event, node) {
    if (event.target.closest("input, textarea, select, button, label, summary, details, .preview-resize-handle")) return;
    event.stopPropagation();
    const selectedIds = selectNodeForDrag(node.id, event.shiftKey);
    pushUndoSnapshot();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = screenToScene(event.clientX, event.clientY);
    setDragState({
      type: "nodes",
      startPointer: pointer,
      nodes: nodes
        .filter((item) => selectedIds.includes(item.id))
        .map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y
        }))
    });
  }

  function handlePointerMove(event) {
    const pointer = screenToScene(event.clientX, event.clientY);

    if (dragState?.type === "pan") {
      event.preventDefault();
      setViewport({
        ...dragState.viewport,
        x: dragState.viewport.x + event.clientX - dragState.startClient.x,
        y: dragState.viewport.y + event.clientY - dragState.startClient.y
      });
      return;
    }

    if (dragState?.type === "nodes") {
      const deltaX = pointer.x - dragState.startPointer.x;
      const deltaY = pointer.y - dragState.startPointer.y;
      const dragged = new Map(dragState.nodes.map((item) => [item.id, item]));
      setNodes((current) =>
        current.map((node) => {
          const start = dragged.get(node.id);
          return start
            ? {
                ...node,
                x: start.x + deltaX,
                y: start.y + deltaY
              }
            : node;
        })
      );
    }

    if (dragState?.type === "group") {
      const deltaX = pointer.x - dragState.startPointer.x;
      const deltaY = pointer.y - dragState.startPointer.y;
      const dragged = new Map(dragState.nodes.map((item) => [item.id, item]));

      setGroups((current) =>
        current.map((group) =>
          group.id === dragState.groupId
            ? {
                ...group,
                x: dragState.group.x + deltaX,
                y: dragState.group.y + deltaY
              }
            : group
        )
      );
      setNodes((current) =>
        current.map((node) => {
          const start = dragged.get(node.id);
          return start
            ? {
                ...node,
                x: start.x + deltaX,
                y: start.y + deltaY
              }
            : node;
        })
      );
      return;
    }

    if (dragState?.type === "groupResize") {
      const deltaX = pointer.x - dragState.startPointer.x;
      const deltaY = pointer.y - dragState.startPointer.y;
      setGroups((current) =>
        current.map((group) =>
          group.id === dragState.groupId
            ? {
                ...group,
                width: Math.round(Math.max(groupSizeFloor, dragState.group.width + deltaX)),
                height: Math.round(Math.max(groupSizeFloor, dragState.group.height + deltaY))
              }
            : group
        )
      );
      return;
    }

    if (dragState?.type === "marquee") {
      const rect = normalizeRect(dragState.start, pointer);
      const selected = nodes
        .filter((node) => rectsIntersect(rect, getNodeBounds(node.id)))
        .map((node) => node.id);
      setDragState((current) => (current?.type === "marquee" ? { ...current, current: pointer } : current));
      setSelectedNodeIds([...new Set([...dragState.baseSelection, ...selected])]);
    }

    if (dragState?.type === "nodeScaleResize") {
      const deltaX = pointer.x - dragState.startPointer.x;
      const deltaY = pointer.y - dragState.startPointer.y;
      const minScale = dragState.scaleKey === "previewScale" ? previewScaleFloor : 1;
      const nextScale = Math.max(minScale, dragState.startScale + Math.max(deltaX, deltaY) / previewBaseWidth);
      updateNode(dragState.nodeId, { [dragState.scaleKey]: roundPreviewScale(nextScale) });
    }

    if (draftEdge) {
      setDraftEdge((current) => ({
        ...current,
        x: pointer.x,
        y: pointer.y
      }));
    }
  }

  function stopNodeDrag() {
    setDragState(null);
  }

  function selectNodeForDrag(nodeId, shouldAdd) {
    let nextSelected;
    if (shouldAdd) {
      nextSelected = selectedNodeSet.has(nodeId) ? selectedNodeIds : [...selectedNodeIds, nodeId];
    } else {
      nextSelected = selectedNodeSet.has(nodeId) ? selectedNodeIds : [nodeId];
    }

    setSelectedNodeIds(nextSelected);
    setSelectedEdgeId(null);
    return nextSelected;
  }

  function startCanvasPointerDown(event) {
    if (!isCanvasSurface(event.target, event.currentTarget)) return;
    setContextMenu(null);
    setSelectedEdgeId(null);
    const pointer = screenToScene(event.clientX, event.clientY);

    if (event.shiftKey) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({
        type: "marquee",
        start: pointer,
        current: pointer,
        baseSelection: selectedNodeIds
      });
      return;
    }

    setSelectedNodeIds([]);
    if (event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      type: "pan",
      startClient: {
        x: event.clientX,
        y: event.clientY
      },
      viewport
    });
  }

  function openCanvasContextMenu(event) {
    if (event.target.closest("[data-node-card-id]")) return;
    event.preventDefault();
    openNodeContextMenuAtPoint(event.clientX, event.clientY);
  }

  function openNodeContextMenuAtPoint(clientX, clientY, pendingConnection = null) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clampedClientX = clamp(clientX, rect.left, rect.right);
    const clampedClientY = clamp(clientY, rect.top, rect.bottom);
    const menuPosition = clampContextMenuPosition(clampedClientX - rect.left, clampedClientY - rect.top, rect);
    setContextMenu({
      x: menuPosition.x,
      y: menuPosition.y,
      scene: screenToScene(clampedClientX, clampedClientY),
      pendingConnection
    });
  }

  function startConnection(event, nodeId, port, color) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedEdgeId(null);
    const pointer = screenToScene(event.clientX, event.clientY);
    const startPoint = getPortPoint(nodeId, port);
    setDraftEdge({
      from: { nodeId, port },
      color,
      start: startPoint,
      x: pointer.x,
      y: pointer.y
    });
  }

  function disconnectInputPort(event, nodeId, port) {
    event.preventDefault();
    event.stopPropagation();
    pushUndoSnapshot();
    setEdges((current) => current.filter((edge) => !(edge.to.nodeId === nodeId && edge.to.port === port)));
    setSelectedEdgeId(null);
    setDraftEdge(null);
    setSaveStatus("Disconnected input");
  }

  function selectEdge(event, edgeId) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeIds([]);
    setSelectedEdgeId(edgeId);
    setContextMenu(null);
  }

  function handleCanvasWheel(event) {
    if (!event.ctrlKey && !event.metaKey) {
      const wardrobeScroller = event.target.closest(".character-thumb-strip");
      if (wardrobeScroller) {
        event.preventDefault();
        event.stopPropagation();
        wardrobeScroller.scrollLeft += event.deltaX + event.deltaY;
        return;
      }

      const voiceScroller = event.target.closest(".character-voice-list");
      if (voiceScroller) {
        event.preventDefault();
        event.stopPropagation();
        voiceScroller.scrollTop += event.deltaY || event.deltaX;
        return;
      }

      const characterScroller = event.target.closest(".character-build-scroll");
      if (characterScroller && characterScroller.scrollHeight > characterScroller.clientHeight) {
        event.preventDefault();
        event.stopPropagation();
        characterScroller.scrollTop += event.deltaY || event.deltaX;
        return;
      }
    }

    const isInteractiveControl = event.target.closest("input, textarea, select");
    if (isInteractiveControl && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    if (event.ctrlKey || event.metaKey || event.altKey) {
      zoomViewportAtPoint(pointer, Math.exp(-event.deltaY * 0.006));
      return;
    }

    setViewport((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY
    }));
  }

  function zoomViewportAtCanvasCenter(zoomFactor) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    zoomViewportAtPoint(
      {
        x: rect.width / 2,
        y: rect.height / 2
      },
      zoomFactor
    );
  }

  function zoomViewportAtPoint(pointer, zoomFactor) {
    setViewport((current) => {
      const nextScale = Math.min(maxZoom, Math.max(viewportScaleFloor, current.scale * zoomFactor));
      if (nextScale === current.scale) return current;
      const scenePoint = {
        x: (pointer.x - current.x) / current.scale,
        y: (pointer.y - current.y) / current.scale
      };

      return {
        x: pointer.x - scenePoint.x * nextScale,
        y: pointer.y - scenePoint.y * nextScale,
        scale: nextScale
      };
    });
  }

  function resetViewportZoom() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = {
      x: rect.width / 2,
      y: rect.height / 2
    };

    setViewport((current) => {
      const nextScale = 1;
      const scenePoint = {
        x: (pointer.x - current.x) / current.scale,
        y: (pointer.y - current.y) / current.scale
      };

      return {
        x: pointer.x - scenePoint.x * nextScale,
        y: pointer.y - scenePoint.y * nextScale,
        scale: nextScale
      };
    });
  }

  function screenToScene(clientX, clientY) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale
    };
  }

  function getNodeBounds(nodeId) {
    const canvas = canvasRef.current;
    const element = canvas?.querySelector(`[data-node-card-id="${nodeId}"]`);
    if (!canvas || !element) return { left: 0, top: 0, right: 0, bottom: 0 };

    const canvasRect = canvas.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      left: (rect.left - canvasRect.left - viewport.x) / viewport.scale,
      top: (rect.top - canvasRect.top - viewport.y) / viewport.scale,
      right: (rect.right - canvasRect.left - viewport.x) / viewport.scale,
      bottom: (rect.bottom - canvasRect.top - viewport.y) / viewport.scale
    };
  }

  function getNodeIdsInsideGroup(group) {
    const groupRect = groupToRect(group);
    return nodes
      .filter((node) => {
        const bounds = getNodeBounds(node.id);
        if (bounds.right > bounds.left && bounds.bottom > bounds.top) {
          return pointInRect(groupRect, {
            x: (bounds.left + bounds.right) / 2,
            y: (bounds.top + bounds.bottom) / 2
          });
        }

        return pointInRect(groupRect, node);
      })
      .map((node) => node.id);
  }

  function finishConnection(event) {
    if (dragState?.type === "marquee") {
      stopNodeDrag();
      return;
    }

    if (!draftEdge) {
      stopNodeDrag();
      return;
    }

    let keepDraftEdge = false;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-port-role='input']");
    if (target) {
      const to = {
        nodeId: target.dataset.nodeId,
        port: target.dataset.portId
      };

      if (to.nodeId !== draftEdge.from.nodeId) {
        const connectionError = getConnectionError(draftEdge.from, to);
        if (connectionError) {
          setSaveStatus(connectionError);
          setDraftEdge(null);
          stopNodeDrag();
          return;
        }

        pushUndoSnapshot();
        setEdges((current) => {
          let nextEdges = current.filter(
            (edge) => !(edge.from.nodeId === draftEdge.from.nodeId && edge.from.port === draftEdge.from.port && edge.to.nodeId === to.nodeId && edge.to.port === to.port)
          );

          return [
            ...nextEdges,
            {
              id: `edge-${Date.now()}`,
              from: draftEdge.from,
              to,
              color: draftEdge.color
            }
          ];
        });
      }
    } else {
      event.preventDefault();
      event.stopPropagation();
      const releasePoint = screenToScene(event.clientX, event.clientY);
      setDraftEdge((current) =>
        current
          ? {
              ...current,
              x: releasePoint.x,
              y: releasePoint.y
            }
          : current
      );
      openNodeContextMenuAtPoint(event.clientX, event.clientY, {
        from: draftEdge.from,
        color: draftEdge.color
      });
      keepDraftEdge = true;
    }

    if (!keepDraftEdge) setDraftEdge(null);
    stopNodeDrag();
  }

  function canCreateEdge(from, to) {
    return !getConnectionError(from, to);
  }

  function compatibleInputPortForNewNode(from, targetNode, graphNodes) {
    const source = graphNodes.find((node) => node.id === from.nodeId);
    if (!source || !targetNode) return null;

    const activeInputs = new Set(activeInputPortIdsForNode(targetNode));
    const candidates = preferredAutoInputPorts(source, from, targetNode).filter((port) => activeInputs.has(port));
    return candidates.find((port) => !getConnectionError(from, { nodeId: targetNode.id, port }, graphNodes)) || null;
  }

  function preferredAutoInputPorts(source, from, target) {
    const outputKind = autoConnectionOutputKind(source, from);
    const inputs = {
      prompt: {
        text: ["textIn"],
        imageModel: ["promptIn"],
        videoModel: ["promptIn"],
        utility: ["promptIn"],
        composer: ["promptIn"]
      },
      image: {
        preview: ["sourceIn"],
        text: ["imageIn"],
        camera: ["imageIn"],
        composer: ["imageIn"],
        model3d: ["frontImageIn"],
        imageModel: ["imagePromptIn", "transferIn"],
        videoModel: ["startFrameIn", "referenceImageIn", "endFrameIn"],
        utility: ["imageIn", "referenceImageIn"]
      },
      video: {
        preview: ["sourceIn"],
        text: ["videoIn"],
        videoModel: ["referenceVideoIn"],
        utility: ["referenceVideoIn", "maskVideoIn"]
      },
      audio: {
        videoModel: ["referenceAudioIn"]
      },
      camera: {
        imageModel: ["cameraIn"]
      },
      style: {
        imageModel: ["styleIn"],
        text: ["styleIn"]
      },
      transfer: {
        imageModel: ["transferIn"],
        composer: ["imageIn"],
        model3d: ["frontImageIn"],
        utility: ["imageIn", "referenceImageIn"],
        preview: ["sourceIn"]
      },
      model3d: {
        preview: ["sourceIn"]
      }
    };

    return inputs[outputKind]?.[target.type] || [];
  }

  function autoConnectionOutputKind(source, from) {
    if (source.type === "camera") return from.port === "cameraOut" ? "camera" : "image";
    if (source.type === "composer") return from.port === "promptOut" ? "prompt" : "image";
    if (source.type === "utility") return utilityOutputType(source);
    if (source.type === "style") return "style";
    if (source.type === "transfer") return "transfer";
    if (source.type === "model3d") return "model3d";
    if (source.type === "video" || source.type === "videoModel") return "video";
    if (source.type === "audio") return "audio";
    if (source.type === "text") return "prompt";
    if (source.type === "image" || source.type === "imageModel") return "image";
    return "";
  }

  function getConnectionError(from, to, graphNodes = nodes) {
    const source = graphNodes.find((node) => node.id === from.nodeId);
    const target = graphNodes.find((node) => node.id === to.nodeId);

    if (!source || !target) return "Choose a valid connection";

    if (source.type === "camera") {
      if (from.port === "imageOut") {
        if (target.type === "preview" && to.port === "sourceIn") return "";
        if (target.type === "text" && to.port === "imageIn") return "";
        if (target.type === "camera" && to.port === "imageIn") return "";
        if (target.type === "composer" && to.port === "imageIn") return "";
        if (target.type === "model3d" && isModel3DImageInputPort(to.port)) return "";
        if (target.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(to.port)) return "";
        if (target.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(to.port)) return "";
        if (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) return "";
        return "Camera image output connects to image inputs";
      }

      if (!hasCameraPreset(source)) return "Choose a Camera preset before connecting";
      if (target.type === "imageModel" && to.port === "cameraIn") return "";
      return "Camera connects to the Image Model camera input";
    }

    if (target.type === "camera" && to.port === "imageIn") {
      if (["image", "imageModel", "transfer"].includes(source.type)) return "";
      return "Camera image input accepts image outputs";
    }

    if (source?.type === "style") {
      if ((source.data.stylePreset || "None") === "None") return "Choose a Style preset before connecting";
      if ((target.type === "imageModel" || target.type === "text") && to.port === "styleIn") return "";
      return "Style presets connect to Style inputs";
    }

    if (source.type === "transfer") {
      if (!source.data.activated || !source.data.resultUrl) return `Lock Mood Board to enable ${moodBoardOutputFileName} output`;
      if (
        (target.type === "imageModel" && to.port === "transferIn") ||
        (target.type === "composer" && to.port === "imageIn") ||
        (target.type === "model3d" && isModel3DImageInputPort(to.port)) ||
        (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) ||
        (target.type === "preview" && to.port === "sourceIn")
      )
        return "";
      return "Mood Board connects to the Image Model mood board input or previews";
    }

    if (source.type === "character") {
      if (!source.data.locked || !source.data.activated || !source.data.resultUrl) return "Lock Character to enable output";
      if (from.port === "voiceOut") {
        if (!activeCharacterVoice(source)?.localUrl) return "Select a character voice before connecting";
        if (target.type === "videoModel" && to.port === "referenceAudioIn") return "";
        return "Character voice connects to a Video Model audio input";
      }
      if (target.type === "imageModel" && to.port === "characterIn") return "";
      if (target.type === "videoModel" && to.port === "characterIn") return "";
      if (target.type === "preview" && to.port === "sourceIn") return "";
      return "Character connects to Character inputs or previews";
    }

    if (["imageModel", "videoModel"].includes(target.type) && to.port === "characterIn") {
      return "Character inputs accept locked Character nodes";
    }

    if (source.type === "utility") {
      if (utilityOutputType(source) === "video") {
        if (target.type === "preview" && to.port === "sourceIn") return "";
        if (target.type === "text" && to.port === "videoIn") return "";
        if (target.type === "videoModel" && to.port === "referenceVideoIn") return "";
        if (target.type === "utility" && ["referenceVideoIn", "maskVideoIn"].includes(to.port)) return "";
        return "Utility video output connects to video inputs";
      }

      if (target.type === "preview" && to.port === "sourceIn") return "";
      if (target.type === "text" && to.port === "imageIn") return "";
      if (target.type === "camera" && to.port === "imageIn") return "";
      if (target.type === "composer" && to.port === "imageIn") return "";
      if (target.type === "model3d" && isModel3DImageInputPort(to.port)) return "";
      if (target.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(to.port)) return "";
      if (target.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(to.port)) return "";
      if (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) return "";
      return "Utility image output connects to image inputs";
    }

    if (target?.type === "utility") {
      if (to.port === "promptIn") {
        if (["text", "imageModel", "videoModel"].includes(source.type)) return "";
        return "Prompt input accepts text outputs";
      }

      if (["imageIn", "referenceImageIn"].includes(to.port)) {
        if (["image", "imageModel", "transfer"].includes(source.type)) return "";
        return "Image input accepts image outputs";
      }

      if (["referenceVideoIn", "maskVideoIn"].includes(to.port)) {
        if (["video", "videoModel"].includes(source.type)) return "";
        return "Video input accepts video outputs";
      }
    }

    if (target?.type === "composer") {
      if (to.port === "promptIn") {
        if (source.type === "composer") return from.port === "promptOut" ? "" : "Composer prompt input accepts prompt outputs";
        if (["text", "imageModel", "videoModel", "utility"].includes(source.type)) return "";
        return "Composer prompt input accepts prompt outputs";
      }

      if (to.port === "imageIn") {
        if (source.type === "composer") return from.port === "imageOut" ? "" : "Composer image input accepts image outputs";
        if (["image", "imageModel", "transfer"].includes(source.type)) return "";
        return "Composer image input accepts image outputs";
      }
    }

    if (source?.type === "composer") {
      if (from.port === "promptOut") {
        if (
          (target.type === "imageModel" && to.port === "promptIn") ||
          (target.type === "videoModel" && to.port === "promptIn") ||
          (target.type === "utility" && to.port === "promptIn") ||
          (target.type === "text" && to.port === "textIn") ||
          (target.type === "composer" && to.port === "promptIn")
        )
          return "";
        return "Composer prompt output connects to prompt inputs";
      }

      if (from.port === "imageOut") {
        if (target.type === "preview" && to.port === "sourceIn") return "";
        if (target.type === "text" && to.port === "imageIn") return "";
        if (target.type === "camera" && to.port === "imageIn") return "";
        if (target.type === "composer" && to.port === "imageIn") return "";
        if (target.type === "model3d" && isModel3DImageInputPort(to.port)) return "";
        if (target.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(to.port)) return "";
        if (target.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(to.port)) return "";
        if (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) return "";
        return "Composer frame output connects to image inputs";
      }
    }

    if (target?.type === "model3d" && isModel3DImageInputPort(to.port)) {
      if (source.type === "camera") return from.port === "imageOut" ? "" : "3D image input accepts Camera image output";
      if (source.type === "composer") return from.port === "imageOut" ? "" : "3D image input accepts Composer frame output";
      if (source.type === "utility") return utilityOutputType(source) === "image" ? "" : "3D image input accepts image outputs";
      if (["image", "imageModel", "transfer"].includes(source.type)) return "";
      return "3D image input accepts image outputs";
    }

    if (target?.type === "preview") {
      if (["image", "video", "imageModel", "videoModel", "utility", "transfer", "composer", "model3d"].includes(source?.type)) return "";
      return "Preview accepts image, video, and 3D sources";
    }

    if (target?.type === "text") {
      if (to.port === "textIn") {
        if (["text", "imageModel", "videoModel"].includes(source.type)) return "";
        return "Text input accepts text outputs";
      }

      if (to.port === "imageIn") {
        if (["image", "imageModel", "transfer"].includes(source.type)) return "";
        return "Image input accepts image outputs";
      }

      if (to.port === "videoIn") {
        if (["video", "videoModel"].includes(source.type)) return "";
        return "Video input accepts video outputs";
      }

      if (to.port === "styleIn") {
        if (source.type === "style") return "";
        return "Style input accepts style outputs";
      }
      if (["image", "video", "imageModel", "videoModel", "utility", "transfer", "character"].includes(source?.type)) return "";
      return "Preview accepts image and video sources";
    }

    return "";
  }

  function getPortPoint(nodeId, port) {
    return portPositions[`${nodeId}:${port}`] || estimatePortPoint(nodeId, port);
  }

  function estimatePortPoint(nodeId, portId) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const bounds = getNodeBounds(nodeId);
    const hasMeasuredBounds = bounds.right > bounds.left && bounds.bottom > bounds.top;
    const left = hasMeasuredBounds ? bounds.left : node.x;
    const right = hasMeasuredBounds ? bounds.right : node.x + estimatedNodeWidth(node.type);
    const top = hasMeasuredBounds ? bounds.top : node.y;
    const bottom = hasMeasuredBounds ? bounds.bottom : node.y + 260;
    const ports = visiblePortIdsForNode(node);
    const portIndex = Math.max(0, ports.findIndex((id) => id === portId));
    const portCount = Math.max(ports.length, 1);
    const isOutput = outputPortIdsForNode(node).includes(portId);
    const sideX = isOutput ? right : left;
    const y = top + ((portIndex + 1) / (portCount + 1)) * (bottom - top);

    return {
      x: sideX,
      y
    };
  }

  function pushUndoSnapshot() {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-39),
      cloneGraphState({ nodes, edges, groups, viewport, selectedNodeIds, selectedEdgeId })
    ];
  }

  function undoGraphChange() {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      setSaveStatus("Nothing to undo");
      return;
    }

    setNodes(previous.nodes);
    setEdges(previous.edges);
    setGroups(previous.groups || []);
    setViewport(previous.viewport);
    setSelectedNodeIds(previous.selectedNodeIds);
    setSelectedEdgeId(previous.selectedEdgeId || null);
    setSaveStatus("Undone");
  }

  function copySelection() {
    if (!selectedNodeIds.length) return;

    const ids = new Set(selectedNodeIds);
    clipboardRef.current = {
      nodes: nodes.filter((node) => ids.has(node.id)).map((node) => cloneNode(node)),
      edges: edges.filter((edge) => ids.has(edge.from.nodeId) && ids.has(edge.to.nodeId)).map((edge) => cloneEdge(edge))
    };
    setSaveStatus(`${selectedNodeIds.length} node${selectedNodeIds.length === 1 ? "" : "s"} copied`);
  }

  function pasteSelection() {
    const clipboard = clipboardRef.current;
    if (!clipboard?.nodes?.length) return;

    pushUndoSnapshot();
    const stamp = Date.now();
    const idMap = new Map();
    const pastedNodes = clipboard.nodes.map((node, index) => {
      const nextId = createNodeId(node.type, `${stamp}-${index}`);
      const nextNode = cloneNode(node);
      idMap.set(node.id, nextId);
      return {
        ...nextNode,
        id: nextId,
        x: node.x + 42,
        y: node.y + 42,
        data: resetCopiedNodeRuntime({
          ...nextNode.data,
          title: `${node.data.title || node.type} Copy`
        })
      };
    });
    const pastedEdges = clipboard.edges
      .filter((edge) => idMap.has(edge.from.nodeId) && idMap.has(edge.to.nodeId))
      .map((edge, index) => ({
        ...cloneEdge(edge),
        id: `edge-${stamp}-${index}`,
        from: {
          ...edge.from,
          nodeId: idMap.get(edge.from.nodeId)
        },
        to: {
          ...edge.to,
          nodeId: idMap.get(edge.to.nodeId)
        }
      }));

    setNodes((current) => [...current, ...pastedNodes]);
    setEdges((current) => [...current, ...pastedEdges]);
    setSelectedNodeIds(pastedNodes.map((node) => node.id));
    setSelectedEdgeId(null);
    setSaveStatus(`${pastedNodes.length} node${pastedNodes.length === 1 ? "" : "s"} pasted`);
  }

  async function loadProjects() {
    try {
      const response = await fetch("/api/saved-workflows");
      if (!response.ok) throw new Error("Could not load saved workflows.");
      const projectList = await response.json();
      setProjects(projectList);
      if (projectId && !savedProjectName) {
        const currentProject = projectList.find((project) => project.id === projectId);
        if (currentProject?.name) setSavedProjectName(currentProject.name);
      }
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  function currentWorkflowDocument({ id = projectId || createNodeId("workflow"), name = projectName, fileName = null, createdAt = null } = {}) {
    const now = new Date().toISOString();
    const cleanProjectName = String(name || "").trim() || "Untitled node project";

    return {
      id,
      name: cleanProjectName,
      fileName,
      createdAt: createdAt || now,
      updatedAt: now,
      app: "NewtNode",
      version: 1,
      packagePath: projectPackagePath || "",
      graph: {
        nodes,
        edges,
        groups,
        viewport
      }
    };
  }

  async function saveProjectToLocalHandle(handle) {
    const cleanProjectName = String(projectName || "").trim() || "Untitled node project";
    const id = projectId || createNodeId("workflow");
    const workflow = currentWorkflowDocument({
      id,
      name: cleanProjectName,
      fileName: handle.name || localWorkflowFileName || workflowFileNameForProject(cleanProjectName)
    });

    if (!(await ensureWritableWorkflowHandle(handle))) {
      throw new Error("Permission to write that workflow file was denied.");
    }

    await writeWorkflowFileHandle(handle, workflow);
    setProjectId(id);
    setProjectName(workflow.name);
    setSavedProjectName(workflow.name);
    setLocalWorkflowFileName(handle.name || workflow.fileName);
    setSaveStatus(`Saved ${handle.name || workflow.fileName}`);
  }

  async function saveProjectAsLocalFile() {
    const cleanProjectName = String(projectName || "").trim() || "Untitled node project";

    try {
      const suggestedParent = window.localStorage.getItem("newtnode-last-package-parent") || "";
      setSaveStatus("Choosing package folder...");
      const { response, data } = await fetchJsonApi("/api/system/select-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Choose parent folder for this NewtNode workflow package",
          defaultPath: suggestedParent
        })
      }, "Folder picker");
      if (!response.ok) {
        if (data.canceled) {
          setSaveStatus("Save As canceled");
          return;
        }
        throw new Error(data.error || "Could not choose a package folder.");
      }

      const packageParentPath = data.path || "";
      if (!packageParentPath) {
        setSaveStatus("Save As canceled");
        return;
      }

      window.localStorage.setItem("newtnode-last-package-parent", packageParentPath);
      await saveProjectToSavedWorkflows({ packageParentPath, saveAsPackage: true, name: cleanProjectName });
    } catch (error) {
      setSaveStatus(error.message || "Could not save workflow package.");
    }
  }

  async function saveProjectToSavedWorkflows(options = {}) {
    try {
      const cleanProjectName = String(options.name || projectName || "").trim() || "Untitled node project";
      const lastSavedName = String(savedProjectName || selectedProjectName || "").trim();
      const shouldCreateNewProject = Boolean(!projectPackagePath && projectId && lastSavedName && cleanProjectName !== lastSavedName);

      setSaveStatus(options.saveAsPackage ? "Saving workflow package..." : "Saving...");
      const response = await fetch("/api/saved-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: shouldCreateNewProject ? null : projectId,
          name: cleanProjectName,
          packageParentPath: options.packageParentPath || "",
          packagePath: options.packageParentPath ? "" : options.packagePath || projectPackagePath || "",
          nodes,
          edges,
          groups,
          viewport
        })
      });
      const project = await response.json();
      if (!response.ok) throw new Error(project.error || "Could not save workflow.");
      setProjectId(project.id);
      setProjectName(project.name);
      setSavedProjectName(project.name);
      setProjectPackagePath(project.packagePath || project.package?.rootPath || "");
      setSaveStatus(project.packagePath ? `Saved package ${project.package?.workflowFileName || project.fileName}` : project.fileName ? `Saved ${project.fileName}` : shouldCreateNewProject ? "Saved as new workflow" : "Saved");
      await loadProjects();
      if (project.graph) {
        const graph = normalizeEditorGraph(project.graph.nodes || [], project.graph.edges || [], project.graph.groups || []);
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setGroups(graph.groups);
        setViewport(project.graph.viewport || viewport);
      }
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  async function saveProject() {
    if (localWorkflowHandleRef.current) {
      try {
        setSaveStatus("Saving local workflow...");
        await saveProjectToLocalHandle(localWorkflowHandleRef.current);
      } catch (error) {
        setSaveStatus(error.message || "Could not save workflow JSON.");
      }
      return;
    }

    await saveProjectToSavedWorkflows();
  }

  function applyWorkflow(project, sourceLabel = "Loaded") {
    const graph = normalizeEditorGraph(project.graph?.nodes || [], project.graph?.edges || [], project.graph?.groups || []);
    localWorkflowHandleRef.current = null;
    setLocalWorkflowFileName("");
    setProjectId(project.id || null);
    setProjectName(project.name || "Untitled node project");
    setSavedProjectName(project.name || null);
    setProjectPackagePath(project.packagePath || project.package?.rootPath || "");
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setGroups(graph.groups);
    setViewport(project.graph?.viewport || { x: 0, y: 0, scale: 1 });
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setProjectMenuOpen(false);
    setSaveStatus(project.fileName ? `${sourceLabel} ${project.fileName}` : sourceLabel);
  }

  async function openWorkflowFile(file) {
    if (!file) return;

    try {
      const project = JSON.parse(await file.text());
      if (!project?.graph || !Array.isArray(project.graph.nodes) || !Array.isArray(project.graph.edges)) {
        throw new Error("That JSON file is not a NewtNode workflow.");
      }

      let openedProject = {
        ...project,
        id: project.id || null,
        name: project.name || file.name.replace(/\.json$/i, "") || "Untitled node project",
        fileName: project.fileName || file.name
      };

      if (openedProject.packagePath || openedProject.package?.rootPath) {
        const response = await fetch("/api/saved-workflows/register-package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflow: openedProject })
        });
        const registered = await response.json();
        if (!response.ok) throw new Error(registered.error || "Could not register workflow package.");
        openedProject = registered;
      }

      applyWorkflow(openedProject, "Opened");
      await loadProjects();
    } catch (error) {
      setSaveStatus(error.message || "Could not open workflow.");
    } finally {
      if (workflowFileInputRef.current) {
        workflowFileInputRef.current.value = "";
      }
    }
  }

  async function loadProject(id) {
    if (!id) return;

    try {
      const selectedProject = projects.find((project) => project.id === id || project.fileName === id);
      const fileName = selectedProject?.fileName || id;
      const response = await fetch(`/api/saved-workflows/${encodeURIComponent(fileName)}`);
      const project = await response.json();
      if (!response.ok) throw new Error(project.error || "Could not load workflow.");
      applyWorkflow(project, "Loaded");
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  async function deleteProject(project) {
    if (!window.confirm(`Delete "${project.name}"?`)) return;

    try {
      const response = await fetch(`/api/saved-workflows/${encodeURIComponent(project.fileName || project.id)}`, {
        method: "DELETE"
      });
      const nextProjects = await response.json();
      if (!response.ok) throw new Error(nextProjects.error || "Could not delete workflow.");
      setProjects(nextProjects);
      if (projectId === project.id) {
        setProjectId(null);
        setProjectName("Untitled node project");
        setSavedProjectName(null);
        setProjectPackagePath("");
      }
      setProjectMenuOpen(false);
      setSaveStatus("Workflow deleted");
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  async function runNode(node) {
    const currentNode = nodesRef.current.find((item) => item.id === node.id) || node;
    if (!isRunnableNode(currentNode)) return { status: "skipped" };
    if (currentNode.data.status === "running") return { status: "skipped" };

    const currentIncomingByNode = buildIncomingByNode(nodesRef.current, edgesRef.current);
    const incoming = currentIncomingByNode[currentNode.id] || {};
    const basePrompt = connectedText(incoming.promptIn, currentIncomingByNode) || currentNode.data.prompt;
    const isSingleRunSegmentation =
      (currentNode.type === "imageModel" && isSam3ImageModel(currentNode.data.model)) ||
      (currentNode.type === "videoModel" && isSam3VideoModel(currentNode.data.model)) ||
      (currentNode.type === "utility" &&
        utilityMode(currentNode) === "video" &&
        (isUtilitySam3VideoModel(currentNode.data.utilityVideoModel) ||
          isUtilityBirefnetVideoModel(currentNode.data.utilityVideoModel) ||
          isUtilityExtractFrameVideoModel(currentNode.data.utilityVideoModel) ||
          isUtilityColorIdMatteModel(currentNode.data.utilityVideoModel)));
    const batchCount = isSingleRunSegmentation ? 1 : nodeBatchCount(currentNode);
    const previousImageResults = existingResultItemsForNode(currentNode, "image");
    const previousVideoResults = existingResultItemsForNode(currentNode, "video");
    const previous3DResults = existingResultItemsForNode(currentNode, "model3d");
    const previousUtilityResults = existingResultItemsForNode(currentNode, currentNode.type === "utility" ? utilityOutputType(currentNode) : "image");
    const requestContext = workflowRequestContext();

    try {
      const runningPatch =
        currentNode.type === "text"
          ? { status: "running", error: "" }
          : { status: "running", error: "" };
      updateNode(currentNode.id, runningPatch);

      if (currentNode.type === "camera") {
        const generated = await runCameraQwenEdit({ node: currentNode, incoming, workflowContext: requestContext });
        const resultItems = appendResultItems(previousImageResults, [generated], "image");
        const firstNewIndex = Math.max(0, resultItems.length - 1);
        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: generated.url,
          resultItems,
          selectedResultIndex: firstNewIndex,
          resultText: generated.prompt || "",
          seed: generated.seed,
          error: ""
        });
        return { status: "complete" };
      }

      if (currentNode.type === "text") {
        const processed = await runTextNodeProcessing({ node: currentNode, incoming, workflowContext: requestContext });
        updateNode(currentNode.id, {
          status: "complete",
          error: "",
          resultText: processed.text,
          lastRunModel: processed.model
        });
        return { status: "complete" };
      }

      if (currentNode.type === "utility") {
        if (utilityMode(currentNode) === "image") {
          const generatedItems = await runUtilityImageGeneration({
            node: currentNode,
            prompt: basePrompt,
            incoming,
            workflowContext: requestContext
          });
          if (!generatedItems.length) throw new Error("Utility image returned no image.");
          const generated = generatedItems[0];
          const resultItems = appendResultItems(previousUtilityResults, generatedItems, "image");
          const firstNewIndex = Math.max(0, resultItems.length - generatedItems.length);
          updateNode(currentNode.id, {
            status: "complete",
            resultUrl: generated.url,
            resultItems,
            selectedResultIndex: firstNewIndex,
            resultText: generatedItems.map((item) => item.text).filter(Boolean).join("\n\n"),
            resultType: "image",
            error: ""
          });
          return { status: "complete" };
        }

        const utilityResultType = utilityOutputType(currentNode);
        const runs = Array.from({ length: batchCount }, (_, index) =>
          runUtilityVideoGeneration({
            node: currentNode,
            prompt: basePrompt,
            incoming,
            workflowContext: requestContext,
            index
          })
        );
        const settled = await Promise.allSettled(runs);
        const successes = settled
          .filter((item) => item.status === "fulfilled")
          .flatMap((item) => (Array.isArray(item.value) ? item.value : [item.value]));
        const failures = settled.filter((item) => item.status === "rejected");
        if (!successes.length) throw new Error(failures[0]?.reason?.message || "Utility video failed.");
        const resultItems = appendResultItems(previousUtilityResults, successes, utilityResultType);
        const firstNewIndex = Math.max(0, resultItems.length - successes.length);

        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: successes[0].url,
          resultItems,
          selectedResultIndex: firstNewIndex,
          resultText: successes.map((item) => item.text).filter(Boolean).join("\n\n"),
          resultType: utilityResultType,
          error: failures.length ? nodeBatchStatusMessage(utilityResultType, batchCount, successes.length, failures) : ""
        });
        return { status: "complete" };
      }

      if (currentNode.type === "imageModel") {
        const isSegmentation = isSam3ImageModel(currentNode.data.model);
        const aspectRatio = isSegmentation ? currentNode.data.aspectRatio : await resolveImageModelAspectRatio(currentNode, incoming);
        const imagePromptItems = connectedImagePromptItems(isSegmentation ? incoming.imagePromptIn || [] : [...(incoming.imagePromptIn || []), ...(incoming.transferIn || []), ...(incoming.characterIn || [])]);
        const prompt = isSegmentation
          ? basePrompt
          : buildEffectiveImagePrompt(basePrompt, [...(incoming.imagePromptIn || []), ...(incoming.cameraIn || []), ...(incoming.styleIn || []), ...(incoming.transferIn || []), ...(incoming.characterIn || [])], aspectRatio);
        const runIndexes = Array.from({ length: batchCount }, (_, index) => index);
        const settled = await settleSequential(runIndexes, (index) =>
          runImageModelGeneration({
            node: currentNode,
            prompt,
            aspectRatio,
            imagePromptItems,
            workflowContext: requestContext,
            index
          }),
          imageRunStaggerMs
        );
        const successes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
        const failures = settled.filter((item) => item.status === "rejected");
        if (!successes.length) throw new Error(failures[0]?.reason?.message || "Image generation failed.");
        const resultItems = appendResultItems(previousImageResults, successes, "image");
        const firstNewIndex = Math.max(0, resultItems.length - successes.length);

        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: successes[0].url,
          resultItems,
          selectedResultIndex: firstNewIndex,
          resultText: successes.map((item) => item.text).filter(Boolean).join("\n\n"),
          error: failures.length ? nodeBatchStatusMessage("image", batchCount, successes.length, failures) : ""
        });
        return { status: "complete" };
      }

      if (currentNode.type === "model3d") {
        const generated = await run3DModelGeneration({
          node: currentNode,
          incoming,
          workflowContext: requestContext
        });
        const resultItems = appendResultItems(previous3DResults, [generated], "model3d");
        const firstNewIndex = Math.max(0, resultItems.length - 1);
        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: generated.url,
          resultItems,
          selectedResultIndex: firstNewIndex,
          resultText: generated.text || "",
          resultType: "model3d",
          error: ""
        });
        return { status: "complete" };
      }

      const prompt = buildEffectiveVideoPrompt(basePrompt, incoming);
      const runs = Array.from({ length: batchCount }, (_, index) =>
        runVideoModelGeneration({
          node: currentNode,
          prompt,
          incoming,
          workflowContext: requestContext,
          index
        })
      );
      const settled = await Promise.allSettled(runs);
      const successes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
      const failures = settled.filter((item) => item.status === "rejected");
      if (!successes.length) throw new Error(failures[0]?.reason?.message || "Video generation failed.");
      const resultItems = appendResultItems(previousVideoResults, successes, "video");
      const firstNewIndex = Math.max(0, resultItems.length - successes.length);

      updateNode(currentNode.id, {
        status: "complete",
        resultUrl: successes[0].url,
        resultItems,
        selectedResultIndex: firstNewIndex,
        resultText: "",
        error: failures.length ? nodeBatchStatusMessage("video", batchCount, successes.length, failures) : ""
      });
      return { status: "complete" };
    } catch (error) {
      updateNode(currentNode.id, { status: "error", error: error.message });
      return { status: "error", error };
    }
  }

  function playSelectedPreviewVideos(nodeIds) {
    const canvas = canvasRef.current;
    const selectedIdSet = new Set(nodeIds);
    const videos = [...(canvas?.querySelectorAll("[data-preview-video-node-id]") || [])].filter((video) => selectedIdSet.has(video.getAttribute("data-preview-video-node-id")));
    const playRequests = videos.map((video) => {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Some browsers reject seeks before video metadata is ready.
      }
      try {
        return video.play();
      } catch (error) {
        return Promise.reject(error);
      }
    });

    return Promise.allSettled(playRequests);
  }

  async function runSelectedNodes() {
    const selectedIds = new Set(selectedNodeIds);
    const currentIncomingByNode = buildIncomingByNode(nodesRef.current, edgesRef.current);
    const runnable = nodesRef.current.filter((node) => selectedIds.has(node.id) && isRunnableNode(node) && node.data.status !== "running");
    const playablePreviewNodes = nodesRef.current.filter((node) => selectedIds.has(node.id) && previewVideoSourceForNode(node, currentIncomingByNode));
    const previewPlayback = playablePreviewNodes.length ? playSelectedPreviewVideos(playablePreviewNodes.map((node) => node.id)) : null;

    if (!runnable.length && !playablePreviewNodes.length) {
      setSaveStatus("No runnable selected nodes");
      return;
    }

    if (!runnable.length) {
      const playback = previewPlayback ? await previewPlayback : [];
      const failedPlays = playback.filter((item) => item.status === "rejected").length;
      setSaveStatus(
        failedPlays
          ? `Playing ${Math.max(0, playablePreviewNodes.length - failedPlays)} preview video${playablePreviewNodes.length - failedPlays === 1 ? "" : "s"}; ${failedPlays} blocked`
          : `Playing ${playablePreviewNodes.length} preview video${playablePreviewNodes.length === 1 ? "" : "s"}`
      );
      return;
    }

    setSaveStatus(
      `${playablePreviewNodes.length ? `Playing ${playablePreviewNodes.length} preview video${playablePreviewNodes.length === 1 ? "" : "s"}; ` : ""}Running ${runnable.length} selected node${runnable.length === 1 ? "" : "s"}...`
    );
    const result = await runNodesByDependencyOrder(runnable);
    if (previewPlayback) await previewPlayback;
    const failedCount = result.failed + result.skipped;
    setSaveStatus(
      failedCount
        ? `Finished ${result.completed} node${result.completed === 1 ? "" : "s"}; ${failedCount} blocked or failed`
        : `Finished ${result.completed} selected node${result.completed === 1 ? "" : "s"}`
    );
  }

  async function runNodesByDependencyOrder(runnableNodes) {
    const nodeMap = new Map(runnableNodes.map((node) => [node.id, node]));
    const pending = new Set(nodeMap.keys());
    const completed = new Set();
    const failed = new Map();
    const skipped = new Map();
    const dependencies = buildSelectedRunnableDependencies(runnableNodes, edgesRef.current);

    while (pending.size) {
      const blocked = [...pending].filter((nodeId) => (dependencies.get(nodeId) || []).some((dependencyId) => failed.has(dependencyId) || skipped.has(dependencyId)));

      blocked.forEach((nodeId) => {
        const failedDependencyId = (dependencies.get(nodeId) || []).find((dependencyId) => failed.has(dependencyId) || skipped.has(dependencyId));
        const message = `Skipped because ${nodeTitle(nodeMap.get(failedDependencyId))} did not complete.`;
        pending.delete(nodeId);
        skipped.set(nodeId, message);
        updateNode(nodeId, { status: "error", error: message });
      });

      const ready = [...pending].filter((nodeId) => (dependencies.get(nodeId) || []).every((dependencyId) => completed.has(dependencyId)));

      if (!ready.length) {
        [...pending].forEach((nodeId) => {
          const message = "Skipped because selected node dependencies could not be resolved.";
          pending.delete(nodeId);
          skipped.set(nodeId, message);
          updateNode(nodeId, { status: "error", error: message });
        });
        break;
      }

      const nextPriority = Math.min(...ready.map((nodeId) => nodeRunPriority(nodeMap.get(nodeId))));
      const batchIds = ready.filter((nodeId) => nodeRunPriority(nodeMap.get(nodeId)) === nextPriority);
      const batchNodes = batchIds.map((nodeId) => nodeMap.get(nodeId));
      setSaveStatus(`Running ${batchNodes.length} ${runStageLabel(batchNodes[0]?.type)} node${batchNodes.length === 1 ? "" : "s"}...`);

      const results = await Promise.all(batchNodes.map((node) => runNode(node)));
      results.forEach((result, index) => {
        const nodeId = batchIds[index];
        pending.delete(nodeId);

        if (result?.status === "error") {
          failed.set(nodeId, result.error || new Error("Node failed."));
          return;
        }

        completed.add(nodeId);
      });

      await wait(0);
    }

    return {
      completed: completed.size,
      failed: failed.size,
      skipped: skipped.size
    };
  }

  return (
    <section className={`node-workspace ${toolbarCollapsed ? "toolbar-collapsed" : ""}`}>
      {composerEditorNode && (
        <ComposerEditorModal
          node={composerEditorNode}
          incoming={incomingByNode[composerEditorNode.id] || {}}
          onClose={() => setComposerEditorNodeId(null)}
          onUpdate={(patch) => updateNode(composerEditorNode.id, patch)}
          onCapture={(imageDataUrl) => captureComposerFrame(composerEditorNode, imageDataUrl)}
        />
      )}
      {toolbarCollapsed && (
        <button className="sidebar-restore" onClick={() => setToolbarCollapsed(false)} title="Show node palette">
          <PanelLeftOpen size={17} />
        </button>
      )}

      <aside className="node-toolbar">
        <div className="toolbar-header">
          <span>Nodes</span>
          <button className="sidebar-hide" onClick={() => setToolbarCollapsed(true)} title="Hide node palette">
            <PanelLeftClose size={16} />
          </button>
        </div>
        <div className="project-tools">
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" />
          <button onClick={saveProject} title="Save project">
            <Save size={16} />
            <span>Save</span>
          </button>
          <button onClick={saveProjectAsLocalFile} title={projectPackagePath ? `Save As portable package. Current package: ${projectPackagePath}` : "Save as portable workflow package"}>
            <Save size={16} />
            <span>Save As</span>
          </button>
          <button onClick={() => workflowFileInputRef.current?.click()} title="Open workflow JSON">
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          <input
            ref={workflowFileInputRef}
            className="workflow-file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => openWorkflowFile(event.target.files?.[0])}
          />
          <div className="project-picker" ref={projectMenuRef}>
            <button className="project-picker-trigger" onClick={() => setProjectMenuOpen((open) => !open)} title="Load saved workflow">
              <span>{selectedProjectName || "Load workflow"}</span>
              <ChevronDown size={13} />
            </button>
            {projectMenuOpen && (
              <div className="project-menu">
                {projects.length ? (
                  projects.map((project) => (
                    <div className="project-menu-row" key={project.id}>
                      <button className="project-load" onClick={() => loadProject(project.id)} title={`Load ${project.fileName || project.name}`}>
                        {project.name}
                      </button>
                      <button className="project-delete" onClick={() => deleteProject(project)} title={`Delete ${project.fileName || project.name}`}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                ) : (
                  <small>No saved workflows</small>
                )}
              </div>
            )}
          </div>
          {saveStatus && <small>{saveStatus}</small>}
        </div>
        {nodeCatalog.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.type} onClick={(event) => addNode(item.type, pointerNodePosition(event))} title={`Add ${item.label}`}>
              <Icon size={17} />
              <span>{item.label}</span>
              <Plus size={14} />
            </button>
          );
        })}
      </aside>

      <div
        ref={canvasRef}
        className="node-canvas"
        style={{
          "--grid-size": `${28 * viewport.scale}px`,
          "--grid-x": `${positiveModulo(viewport.x, 28 * viewport.scale)}px`,
          "--grid-y": `${positiveModulo(viewport.y, 28 * viewport.scale)}px`
        }}
        onPointerDown={startCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishConnection}
        onPointerCancel={stopNodeDrag}
        onContextMenu={openCanvasContextMenu}
      >
        <div
          className="node-scene"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
          }}
        >
          {groups.map((group) => (
            <GroupBackdrop
              key={group.id}
              group={group}
              onDragStart={startGroupDrag}
              onResizeStart={startGroupResize}
              onUpdate={updateGroup}
              onRemove={removeGroup}
            />
          ))}

          <svg className="edge-layer">
            {edges.map((edge) => {
              const from = getPortPoint(edge.from.nodeId, edge.from.port);
              const to = getPortPoint(edge.to.nodeId, edge.to.port);
              return (
                <EdgePath
                  key={edge.id}
                  edgeId={edge.id}
                  from={from}
                  to={to}
                  color={edge.color}
                  selected={selectedEdgeId === edge.id}
                  active={activeEdgeIds.has(edge.id)}
                  inactive={inactiveEdgeIds.has(edge.id)}
                  onSelect={selectEdge}
                />
              );
            })}
          {draftEdge && <EdgePath from={draftEdge.start} to={{ x: draftEdge.x, y: draftEdge.y }} color={draftEdge.color} draft />}
          {dragState?.type === "marquee" && <SelectionMarquee start={dragState.start} current={dragState.current} />}
          </svg>

          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              onDragStart={startNodeDrag}
              onRemove={removeNode}
              onUpdate={updateNode}
              onConnectStart={startConnection}
              onDisconnectInput={disconnectInputPort}
              connectedPortKeys={connectedPortKeys}
              incoming={incomingByNode[node.id] || {}}
              incomingByNode={incomingByNode}
              onRun={runNode}
              onUpload={uploadMediaAsset}
              onTransferImagesUpload={uploadTransferImages}
              onTransferImageRemove={removeTransferImage}
              onTransferActivate={activateTransferNode}
              onTransferUnlock={unlockTransferNode}
              onCharacterPortraitUpload={uploadCharacterPortrait}
              onCharacterWardrobesUpload={uploadCharacterWardrobes}
              onCharacterVoicesUpload={uploadCharacterVoices}
              onCharacterWardrobeRemove={removeCharacterWardrobe}
              onCharacterVoiceRemove={removeCharacterVoice}
              onCharacterActivate={activateCharacterNode}
              onCharacterUnlock={unlockCharacterNode}
              onPreviewResizeStart={startPreviewResize}
              onOpenComposer={setComposerEditorNodeId}
              running={node.data.status === "running"}
              transferCompiling={compilingTransferNodeId === node.id}
              selected={selectedNodeSet.has(node.id)}
              tagHighlight={referenceTagHighlights.get(node.id)}
            />
          ))}
        </div>
        {selectionBounds && (
          <SelectionActionBar
            bounds={selectionBounds}
            viewport={viewport}
            selectedCount={selectedNodeIds.length}
            runnableCount={selectedRunAllCount}
            onRunAll={runSelectedNodes}
            onGroup={createGroupFromSelection}
          />
        )}
        {contextMenu && (
          <div ref={contextMenuRef} className={`node-context-menu ${contextMenu.pendingConnection ? "pending-connection" : ""}`} style={{ left: contextMenu.x, top: contextMenu.y }}>
            {nodeCatalog.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.type} onClick={() => addNode(item.type, contextMenu.scene, { pendingConnection: contextMenu.pendingConnection })}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="zoom-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => zoomViewportAtCanvasCenter(1 / 1.16)} title="Zoom out" aria-label="Zoom out">
            <Minus size={14} />
          </button>
          <button type="button" onClick={resetViewportZoom} title="Reset zoom" aria-label="Reset zoom" className="zoom-readout">
            {Math.round(viewport.scale * 100)}%
          </button>
          <button type="button" onClick={() => zoomViewportAtCanvasCenter(1.16)} title="Zoom in" aria-label="Zoom in">
            <Plus size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

function EdgePath({ edgeId, from, to, color, draft, selected, active, inactive, onSelect }) {
  const curve = Math.max(80, Math.abs(to.x - from.x) * 0.42);
  const path = `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
  return (
    <g className={`edge-path ${draft ? "draft" : ""} ${selected ? "selected" : ""} ${active ? "active" : ""} ${inactive ? "inactive" : ""}`}>
      <path className="edge-visible" d={path} stroke={color} strokeWidth={draft ? 3 : 4} fill="none" opacity={draft ? 0.62 : 0.42} strokeLinecap="round" />
      {!draft && (
        <path
          className="edge-hitbox"
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth="18"
          strokeLinecap="round"
          onPointerDown={(event) => onSelect?.(event, edgeId)}
        />
      )}
    </g>
  );
}

function SelectionMarquee({ start, current }) {
  const rect = normalizeRect(start, current);
  return (
    <rect
      className="selection-marquee"
      x={rect.left}
      y={rect.top}
      width={rect.right - rect.left}
      height={rect.bottom - rect.top}
      rx="8"
    />
  );
}

function SelectionActionBar({ bounds, viewport, selectedCount, runnableCount, onRunAll, onGroup }) {
  const x = viewport.x + (bounds.left + bounds.width / 2) * viewport.scale;
  const y = viewport.y + bounds.top * viewport.scale - 54;

  return (
    <div className="selection-action-bar" style={{ left: x, top: y }} onPointerDown={(event) => event.stopPropagation()}>
      <span className="selection-action-dot" aria-hidden="true" />
      <span className="selection-action-divider" aria-hidden="true" />
      <button onClick={onRunAll} disabled={!runnableCount} title={runnableCount ? `Run or play ${runnableCount} selected node${runnableCount === 1 ? "" : "s"}` : "No runnable selected nodes"}>
        <Play size={18} />
        <span>Run All</span>
      </button>
      <button onClick={onGroup} disabled={selectedCount < 2} title="Group selected nodes">
        <Plus size={17} />
        <span>Group</span>
      </button>
    </div>
  );
}

function GroupBackdrop({ group, onDragStart, onResizeStart, onUpdate, onRemove }) {
  const color = group.color || groupPalette[0];

  return (
    <section
      className="node-group-backdrop"
      style={{
        transform: `translate(${group.x}px, ${group.y}px)`,
        width: group.width,
        height: group.height,
        "--group-color": color
      }}
      onPointerDown={(event) => onDragStart(event, group)}
    >
      <div className="group-header">
        <input
          value={group.name || ""}
          onChange={(event) => onUpdate(group.id, { name: event.target.value })}
          onBlur={(event) => {
            if (!event.target.value.trim()) onUpdate(group.id, { name: "Group" });
          }}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label="Group name"
        />
        <div className="group-color-row" onPointerDown={(event) => event.stopPropagation()}>
          {groupPalette.map((swatch) => (
            <button
              key={swatch}
              className={`group-color-swatch ${swatch === color ? "active" : ""}`}
              style={{ "--swatch-color": swatch }}
              onClick={() => onUpdate(group.id, { color: swatch })}
              title="Set group color"
            />
          ))}
        </div>
        <button className="group-remove" onClick={() => onRemove(group.id)} onPointerDown={(event) => event.stopPropagation()} title="Remove group">
          <X size={13} />
        </button>
      </div>
      <span className="group-resize-handle" onPointerDown={(event) => onResizeStart(event, group)} />
    </section>
  );
}

function nodeColorForData(data = {}) {
  return groupPalette.includes(data.nodeColor) ? data.nodeColor : "";
}

function NodeColorPicker({ color, onChange }) {
  const pickerRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const activeOption = nodeColorPalette.find((option) => option.color === color) || nodeColorPalette[0];

  React.useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectColor(nextColor) {
    onChange(nextColor);
    setOpen(false);
  }

  return (
    <div className="node-color-picker" ref={pickerRef} onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`node-color-current ${activeOption.color ? "" : "neutral"}`}
        style={{ "--swatch-color": activeOption.color || "#202020" }}
        onClick={() => setOpen((value) => !value)}
        title={`Node color: ${activeOption.label}`}
        aria-label={`Node color: ${activeOption.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      />
      {open && (
        <div className="node-color-menu" role="menu" aria-label="Node color">
          {nodeColorPalette.map((option) => (
            <button
              key={option.label}
              type="button"
              className={`node-color-swatch ${option.color ? "" : "neutral"} ${option.color === color ? "active" : ""}`}
              style={{ "--swatch-color": option.color || "#202020" }}
              onClick={() => selectColor(option.color)}
              title={option.label}
              aria-label={option.label}
              role="menuitem"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function isCanvasSurface(target, canvas) {
  return target === canvas || target.classList?.contains("node-scene") || target.classList?.contains("edge-layer");
}

function NodeCard({
  node,
  onDragStart,
  onRemove,
  onUpdate,
  onConnectStart,
  onDisconnectInput,
  connectedPortKeys,
  incoming,
  incomingByNode,
  onRun,
  onUpload,
  onTransferImagesUpload,
  onTransferImageRemove,
  onTransferActivate,
  onTransferUnlock,
  onCharacterPortraitUpload,
  onCharacterWardrobesUpload,
  onCharacterVoicesUpload,
  onCharacterWardrobeRemove,
  onCharacterVoiceRemove,
  onCharacterActivate,
  onCharacterUnlock,
  onPreviewResizeStart,
  onOpenComposer,
  running,
  transferCompiling,
  selected,
  tagHighlight
}) {
  const config = getNodeConfig(node.type);
  const Icon = config.icon;
  const nodeColor = nodeColorForData(node.data);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(node.data.title || "");

  React.useEffect(() => {
    if (!editingTitle) {
      setDraftTitle(node.data.title || "");
    }
  }, [node.data.title, editingTitle]);

  function commitTitleEdit() {
    const title = draftTitle.trim() || node.data.title || configTitleFallback(node.type);
    onUpdate(node.id, { title });
    setDraftTitle(title);
    setEditingTitle(false);
  }

  function cancelTitleEdit() {
    setDraftTitle(node.data.title || "");
    setEditingTitle(false);
  }

  const moodBoardScalable = node.type === "transfer" && node.data.locked && node.data.activated && node.data.resultUrl;

  return (
    <article
      className={`node-card ${node.type === "composer" ? "node-type-composer" : `${node.type} node-type-${node.type}`} ${nodeColor ? "has-node-color" : ""} ${selected ? "selected" : ""} ${tagHighlight ? "reference-tag-highlighted" : ""} ${moodBoardScalable ? "mood-board-scalable" : ""}`}
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        "--preview-scale": node.data.previewScale || 1,
        "--node-color": nodeColor || "transparent",
        "--mood-board-scale": moodBoardScalable ? node.data.moodBoardScale || 1 : 1,
        "--reference-tag-color": tagHighlight?.color || "#4d8dff"
      }}
      data-node-card-id={node.id}
      onPointerDown={(event) => onDragStart(event, node)}
    >
      <div className="node-title">
        <span className="node-title-label">
          <Icon size={15} />
          {editingTitle ? (
            <input
              className="node-title-input"
              value={draftTitle}
              autoFocus
              onPointerDown={(event) => event.stopPropagation()}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitleEdit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTitleEdit();
                }
              }}
            />
          ) : (
            <span
              className="node-title-name"
              role="button"
              tabIndex={0}
              title="Rename node"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setEditingTitle(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditingTitle(true);
                }
              }}
            >
              {node.data.title}
            </span>
          )}
          <NodeColorPicker color={nodeColor} onChange={(color) => onUpdate(node.id, { nodeColor: color })} />
        </span>
        <button onClick={() => onRemove(node.id)} title="Remove node">
          <X size={14} />
        </button>
      </div>

      <NodeBody
        node={node}
        onUpdate={onUpdate}
        incoming={incoming}
        incomingByNode={incomingByNode}
        onRun={onRun}
        running={running}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
        onUpload={onUpload}
        onTransferImagesUpload={onTransferImagesUpload}
        onTransferImageRemove={onTransferImageRemove}
        onTransferActivate={onTransferActivate}
        onTransferUnlock={onTransferUnlock}
        onCharacterPortraitUpload={onCharacterPortraitUpload}
        onCharacterWardrobesUpload={onCharacterWardrobesUpload}
        onCharacterVoicesUpload={onCharacterVoicesUpload}
        onCharacterWardrobeRemove={onCharacterWardrobeRemove}
        onCharacterVoiceRemove={onCharacterVoiceRemove}
        onCharacterActivate={onCharacterActivate}
        onCharacterUnlock={onCharacterUnlock}
        onPreviewResizeStart={onPreviewResizeStart}
        onOpenComposer={onOpenComposer}
        transferCompiling={transferCompiling}
      />
    </article>
  );
}

function PortHandle({ node, port, side, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  const connected = connectedPortKeys.has(`${node.id}:${port.id}`);

  return (
    <button
      className={`inline-port ${side} ${connected ? "connected" : ""}`}
      data-port-role={side}
      data-node-id={node.id}
      data-port-id={port.id}
      data-port-key={`${node.id}:${port.id}`}
      style={{ "--port-color": port.color }}
      onPointerDown={(event) => {
        if (side === "output") {
          onConnectStart(event, node.id, port.id, port.color);
          return;
        }
        onDisconnectInput(event, node.id, port.id);
      }}
      title={side === "input" ? `Disconnect ${port.label}` : `Connect ${port.label}`}
    />
  );
}

function OutputPortRow({ node, port, onConnectStart, onDisconnectInput, connectedPortKeys, label = port.label }) {
  return (
    <div className="port-row output-row">
      <span>{label}</span>
      <PortHandle
        node={node}
        port={port}
        side="output"
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    </div>
  );
}

function MediaPreview({ node }) {
  if (!node.data.resultUrl) {
    return (
      <div className="media-preview empty">
        <UploadIcon type={node.type} />
        <span>No upload yet</span>
      </div>
    );
  }

  if (node.type === "image") {
    return (
      <div className="media-preview">
        <img src={node.data.resultUrl} alt={node.data.fileName || "Uploaded image"} />
      </div>
    );
  }

  if (node.type === "video") {
    return (
      <div className="media-preview">
        <video src={node.data.resultUrl} controls muted loop />
      </div>
    );
  }

  return (
    <div className="media-preview audio">
      <FileAudio size={28} />
      <audio src={node.data.resultUrl} controls />
    </div>
  );
}

function CharacterVoicePlayer({ voice }) {
  const audioRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  React.useEffect(() => {
    const audio = audioRef.current;
    audio?.pause();
    if (audio) audio.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [voice.localUrl]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setPlaying(false));
      return;
    }
    audio.pause();
  }

  return (
    <div className="character-voice-player">
      <audio
        ref={audioRef}
        src={voice.localUrl}
        muted={muted}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button type="button" onClick={togglePlayback} title={playing ? "Pause dialogue" : "Play dialogue"} aria-label={playing ? "Pause dialogue" : "Play dialogue"}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button type="button" onClick={() => setMuted((value) => !value)} title={muted ? "Unmute dialogue" : "Mute dialogue"} aria-label={muted ? "Unmute dialogue" : "Mute dialogue"}>
        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
      <span>{formatTimelineTime(currentTime)} / {formatTimelineTime(duration)}</span>
    </div>
  );
}

function StillFrameScrubber({ videoUrl, value, onChange }) {
  const videoRef = React.useRef(null);
  const [duration, setDuration] = React.useState(0);
  const [loadState, setLoadState] = React.useState(videoUrl ? "loading" : "idle");
  const numericValue = Math.max(0, Number(value) || 0);
  const usableDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const sliderMax = usableDuration ? Math.max(0.01, usableDuration) : Math.max(1, numericValue);
  const displayTime = usableDuration ? clamp(numericValue, 0, Math.max(0, usableDuration - 0.04)) : numericValue;

  React.useEffect(() => {
    setDuration(0);
    setLoadState(videoUrl ? "loading" : "idle");
  }, [videoUrl]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!videoUrl || !video || video.readyState < 1) return;
    const maxTime = usableDuration ? Math.max(0, usableDuration - 0.04) : numericValue;
    const targetTime = clamp(numericValue, 0, maxTime);
    if (Math.abs(video.currentTime - targetTime) > 0.035) {
      video.currentTime = targetTime;
    }
  }, [videoUrl, numericValue, usableDuration]);

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    setDuration(nextDuration);
    setLoadState("ready");
    if (!nextDuration) return;
    const nextTime = clamp(numericValue, 0, Math.max(0, nextDuration - 0.04));
    if (nextTime !== numericValue) onChange(nextTime);
    if (Math.abs(video.currentTime - nextTime) > 0.035) {
      video.currentTime = nextTime;
    }
  }

  function handleScrub(event) {
    const nextTime = Number(event.target.value) || 0;
    onChange(nextTime);
    const video = videoRef.current;
    if (video && video.readyState >= 1) {
      video.currentTime = usableDuration ? clamp(nextTime, 0, Math.max(0, usableDuration - 0.04)) : nextTime;
    }
  }

  function stopCanvasGesture(event) {
    event.stopPropagation();
  }

  if (!videoUrl) {
    return (
      <div className="still-frame-scrubber empty" onPointerDown={stopCanvasGesture} onWheel={stopCanvasGesture}>
        <Film size={18} />
        <span>Connect a video</span>
      </div>
    );
  }

  return (
    <div className="still-frame-scrubber" onPointerDown={stopCanvasGesture} onWheel={stopCanvasGesture}>
      <div className="still-frame-video-shell">
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={() => setLoadState("ready")}
          onError={() => setLoadState("error")}
        />
      </div>
      <div className="still-frame-controls">
        <input type="range" min="0" max={sliderMax} step="0.01" value={displayTime} onChange={handleScrub} disabled={loadState === "error"} aria-label="Still frame position" />
        <span>{loadState === "error" ? "Load failed" : `${formatTimelineTime(displayTime)} / ${formatTimelineTime(usableDuration)}`}</span>
      </div>
    </div>
  );
}

function StyleCollage({ images, locked, outputUrl, outputLabel = moodBoardOutputFileName, onRemove, onDropImages }) {
  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    onDropImages?.(event.dataTransfer.files);
  }

  if (locked && outputUrl) {
    return (
      <div className="style-collage transfer-output-preview locked">
        <div className="style-collage-cell">
          <img src={outputUrl} alt={outputLabel} />
          <span>{outputLabel}</span>
        </div>
      </div>
    );
  }

  if (!images.length) {
    return (
      <div className="style-collage empty" onDragOver={allowFileDrop} onDrop={handleDrop}>
        <Compass size={24} />
        <span>Drop mood board images here</span>
      </div>
    );
  }

  return (
    <div className={`style-collage count-${images.length} ${locked ? "locked" : ""}`} onDragOver={allowFileDrop} onDrop={handleDrop}>
      {images.map((image) => (
        <div className="style-collage-cell" key={image.id}>
          <img src={image.localUrl} alt={image.fileName || "Mood board reference"} />
          {!locked && (
            <button onClick={() => onRemove(image.id)} title="Remove image">
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function CameraControlViewport({ imageUrl, horizontalAngle, verticalAngle, zoom, onChange }) {
  const mountRef = React.useRef(null);
  const planeMaterialRef = React.useRef(null);
  const cameraMarkerRef = React.useRef(null);
  const previewStateRef = React.useRef({ horizontalAngle, verticalAngle, zoom });
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    previewStateRef.current = { horizontalAngle, verticalAngle, zoom };
    onChangeRef.current = onChange;
  }, [horizontalAngle, verticalAngle, zoom, onChange]);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161616);

    const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    previewCamera.position.set(2.8, 2.1, 3.1);
    previewCamera.lookAt(0, 0.35, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "camera-viewport-canvas";
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const grid = new THREE.GridHelper(4.2, 16, 0x2c2c2c, 0x252525);
    grid.position.y = -0.72;
    scene.add(grid);

    const planeGeometry = new THREE.PlaneGeometry(1.25, 1.25);
    const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x77807a, side: THREE.DoubleSide });
    planeMaterialRef.current = planeMaterial;
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.y = 0.1;
    scene.add(plane);

    const horizontalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0x20f3a6 })
    );
    horizontalRing.rotation.x = Math.PI / 2;
    horizontalRing.position.y = -0.66;
    scene.add(horizontalRing);

    const elevationRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.016, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0xff69cc })
    );
    elevationRing.rotation.y = Math.PI / 2;
    elevationRing.position.x = -0.28;
    elevationRing.position.y = 0.06;
    scene.add(elevationRing);

    const cameraMarker = new THREE.Group();
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf9d624 }));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: 0x34516b }));
    body.position.z = 0.2;
    cameraMarker.add(lens, body);
    scene.add(cameraMarker);
    cameraMarkerRef.current = cameraMarker;

    let frameId = 0;
    let dragging = false;
    let lastPointer = { x: 0, y: 0 };

    function resize() {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(260, rect.width);
      const height = Math.max(220, rect.height);
      renderer.setSize(width, height, false);
      previewCamera.aspect = width / height;
      previewCamera.updateProjectionMatrix();
    }

    function updateCameraMarker() {
      const state = previewStateRef.current;
      const azimuth = THREE.MathUtils.degToRad(state.horizontalAngle);
      const elevation = THREE.MathUtils.degToRad(state.verticalAngle);
      const distance = THREE.MathUtils.lerp(2.25, 1.05, clamp(state.zoom, 0, 10) / 10);
      const groundRadius = distance * Math.cos(elevation);

      cameraMarker.position.set(Math.sin(azimuth) * groundRadius, -0.24 + Math.sin(elevation) * 1.35, Math.cos(azimuth) * groundRadius);
      cameraMarker.lookAt(0, 0.1, 0);
    }

    function render() {
      updateCameraMarker();
      renderer.render(scene, previewCamera);
      frameId = window.requestAnimationFrame(render);
    }

    function handlePointerDown(event) {
      dragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event) {
      if (!dragging) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      const state = previewStateRef.current;
      onChangeRef.current?.({
        horizontalAngle: positiveModulo(state.horizontalAngle + dx * 0.7, 360),
        verticalAngle: clamp(state.verticalAngle - dy * 0.45, -30, 90)
      });
    }

    function handlePointerUp(event) {
      dragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    }

    function handleWheel(event) {
      event.preventDefault();
      const state = previewStateRef.current;
      onChangeRef.current?.({ zoom: clamp(state.zoom - event.deltaY * 0.012, 0, 10) });
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      planeMaterial.map?.dispose();
      planeGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  React.useEffect(() => {
    const material = planeMaterialRef.current;
    if (!material) return undefined;

    let cancelled = false;
    const previousMap = material.map;

    if (!imageUrl) {
      material.map = null;
      material.color.set(0x77807a);
      material.needsUpdate = true;
      previousMap?.dispose();
      return undefined;
    }

    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }

      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
      previousMap?.dispose();
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return (
    <div className="camera-viewport-shell" onPointerDown={(event) => event.stopPropagation()}>
      <div ref={mountRef} className="camera-viewport" />
      <div className="camera-viewport-legend">
        <span className="azimuth-dot">Azimuth</span>
        <span className="elevation-dot">Elevation</span>
        <span className="zoom-dot">Zoom</span>
      </div>
      {!imageUrl && <span className="camera-viewport-empty">Connect an image</span>}
    </div>
  );
}

function ComposerEditorModal({ node, incoming = {}, onClose, onUpdate, onCapture }) {
  const viewportRef = React.useRef(null);
  const [captureStatus, setCaptureStatus] = React.useState("");
  const [libraryPoses, setLibraryPoses] = React.useState([]);
  const [poseStatus, setPoseStatus] = React.useState("");
  const sceneData = normalizedComposerScene(node.data.composerScene);
  const nodeSavedPoses = normalizeComposerSavedPoses(node.data.composerSavedPoses);
  const savedPoseOptions = mergeComposerSavedPoses(libraryPoses, nodeSavedPoses);
  const imageSources = connectedAssetItems(incoming.imageIn).filter((item) => item.type === "image" || /\.(png|jpe?g|webp|gif)$/i.test(item.url));
  const renderSceneData = resolveComposerImagePlaneSources(sceneData, imageSources);
  const composerObjects = [...sceneData.maquettes, ...sceneData.props, ...sceneData.imagePlanes];
  const rawSelectedId = node.data.composerSelectedId || "";
  const selectedId = rawSelectedId === "camera" ? "camera" : composerObjects.some((item) => item.id === rawSelectedId) ? rawSelectedId : sceneData.maquettes[0]?.id || sceneData.props[0]?.id || sceneData.imagePlanes[0]?.id || "";
  const selectedMaquette = sceneData.maquettes.find((item) => item.id === selectedId);
  const selectedProp = sceneData.props.find((item) => item.id === selectedId);
  const selectedImagePlane = sceneData.imagePlanes.find((item) => item.id === selectedId);
  const selectedObject = selectedMaquette || selectedProp || selectedImagePlane;
  const selectedKind = selectedId === "camera" ? "camera" : selectedMaquette ? "maquette" : selectedProp ? "prop" : selectedImagePlane ? "imagePlane" : "";
  const rawSelectedCameraBookmark = node.data.composerSelectedCameraBookmark || "";
  const activeCameraBookmark = sceneData.cameraBookmarks.find((item) => item.id === rawSelectedCameraBookmark) || sceneData.cameraBookmarks[0] || null;
  const selectedPoseValue =
    selectedKind === "maquette" && savedPoseOptions.some((pose) => pose.id === selectedObject?.pose) ? selectedObject.pose : "";
  const selectedNameValue = selectedKind === "camera" ? "Camera" : selectedObject?.name || "";

  React.useEffect(() => {
    let cancelled = false;

    fetchJsonApi("/api/composer-poses", { method: "GET" }, "Pose library")
      .then(({ response, data }) => {
        if (!cancelled && response.ok) setLibraryPoses(normalizeComposerSavedPoses(data.poses));
      })
      .catch(() => {
        if (!cancelled) setLibraryPoses([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function commitScene(nextScene, extraPatch = {}) {
    onUpdate({
      composerScene: normalizedComposerScene(nextScene),
      ...extraPatch
    });
  }

  function patchScene(patch) {
    commitScene({ ...sceneData, ...patch });
  }

  function patchCamera(patch) {
    patchScene({
      camera: {
        ...sceneData.camera,
        ...patch
      }
    });
  }

  function patchSelected(patch) {
    if (!selectedObject) return;
    const key = selectedKind === "maquette" ? "maquettes" : selectedKind === "prop" ? "props" : "imagePlanes";
    patchScene({
      [key]: sceneData[key].map((item) => (item.id === selectedObject.id ? { ...item, ...patch } : item))
    });
  }

  function addMaquette() {
    const maquette = defaultComposerMaquette(sceneData.maquettes.length + 1);
    commitScene({ ...sceneData, maquettes: [...sceneData.maquettes, maquette] }, { composerSelectedId: maquette.id });
  }

  function addPrimitiveProp(primitive) {
    const prop = defaultComposerProp(sceneData.props.length + 1, primitive);
    commitScene({ ...sceneData, props: [...sceneData.props, prop] }, { composerSelectedId: prop.id });
  }

  async function addImagePlane() {
    const source = imageSources[0];
    const aspectRatio = await composerImageAspectFromSource(source);
    const imagePlane = defaultComposerImagePlane(sceneData.imagePlanes.length + 1, source?.url || "", source?.label || "", aspectRatio);
    commitScene({ ...sceneData, imagePlanes: [...sceneData.imagePlanes, imagePlane] }, { composerSelectedId: imagePlane.id });
  }

  function saveCameraBookmark() {
    const highestNamedCamera = sceneData.cameraBookmarks.reduce((highest, bookmark) => {
      const match = /^cam\s+(\d+)$/i.exec(bookmark.name || "");
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, sceneData.cameraBookmarks.length);
    const bookmark = {
      id: `camera-bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Cam ${highestNamedCamera + 1}`,
      camera: { ...sceneData.camera }
    };
    commitScene({ ...sceneData, cameraBookmarks: [...sceneData.cameraBookmarks, bookmark] }, { composerSelectedCameraBookmark: bookmark.id });
  }

  function recallCameraBookmark(bookmarkId) {
    const bookmark = sceneData.cameraBookmarks.find((item) => item.id === bookmarkId);
    if (!bookmark) return;
    commitScene({ ...sceneData, camera: { ...sceneData.camera, ...bookmark.camera } }, { composerSelectedCameraBookmark: bookmark.id });
  }

  function stepCameraBookmark(direction) {
    if (!sceneData.cameraBookmarks.length) return;
    const currentIndex = Math.max(0, sceneData.cameraBookmarks.findIndex((item) => item.id === activeCameraBookmark?.id));
    const nextIndex = (currentIndex + direction + sceneData.cameraBookmarks.length) % sceneData.cameraBookmarks.length;
    recallCameraBookmark(sceneData.cameraBookmarks[nextIndex].id);
  }

  function deleteCameraBookmark() {
    if (!activeCameraBookmark) return;
    const currentIndex = sceneData.cameraBookmarks.findIndex((item) => item.id === activeCameraBookmark.id);
    const nextBookmarks = sceneData.cameraBookmarks.filter((item) => item.id !== activeCameraBookmark.id);
    const nextBookmark = nextBookmarks[Math.min(Math.max(currentIndex, 0), nextBookmarks.length - 1)] || null;
    const nextScene = {
      ...sceneData,
      cameraBookmarks: nextBookmarks,
      camera: nextBookmark ? { ...sceneData.camera, ...nextBookmark.camera } : sceneData.camera
    };
    commitScene(nextScene, { composerSelectedCameraBookmark: nextBookmark?.id || "" });
  }

  function applySavedPose(poseId) {
    const savedPose = savedPoseOptions.find((pose) => pose.id === poseId);
    if (!savedPose || !selectedObject) return;

    const posePatch = composerSavedPosePatch(savedPose);
    const nextScene = {
      ...sceneData,
      maquettes: sceneData.maquettes.map((item) => (item.id === selectedObject.id ? { ...item, ...posePatch } : item))
    };

    onUpdate({
      composerScene: normalizedComposerScene(nextScene),
      composerSavedPoses: mergeComposerSavedPoses(nodeSavedPoses, [savedPose])
    });
  }

  async function saveSelectedPose() {
    if (selectedKind !== "maquette" || !selectedObject) return;

    const requestedName = window.prompt("Pose name", selectedObject.name ? `${selectedObject.name} pose` : "New pose");
    const name = String(requestedName || "").trim();
    if (!name) return;

    const pose = normalizeComposerSavedPose({
      id: `pose-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      ...composerPoseSnapshot(selectedObject)
    });
    if (!pose) return;

    const nextSavedPoses = mergeComposerSavedPoses(nodeSavedPoses, [pose]);
    const nextScene = {
      ...sceneData,
      maquettes: sceneData.maquettes.map((item) => (item.id === selectedObject.id ? { ...item, pose: pose.id } : item))
    };

    onUpdate({
      composerScene: normalizedComposerScene(nextScene),
      composerSavedPoses: nextSavedPoses
    });
    setPoseStatus(`Saved "${pose.name}" to this Composer.`);

    try {
      const { response, data } = await fetchJsonApi("/api/composer-poses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pose })
      }, "Pose save");
      if (!response.ok) throw new Error(data.error || "Could not save the pose library file.");

      const savedPose = normalizeComposerSavedPose(data.pose || pose);
      const library = normalizeComposerSavedPoses(data.poses);
      const nextLibraryPoses = library.length ? library : mergeComposerSavedPoses(libraryPoses, [savedPose]);

      setLibraryPoses(nextLibraryPoses);
      onUpdate({
        composerSavedPoses: mergeComposerSavedPoses(nextSavedPoses, [savedPose])
      });
      setPoseStatus(`Saved "${savedPose.name}" to this Composer and public/models/poses.`);
    } catch (error) {
      setPoseStatus(`Saved "${pose.name}" to this Composer. Library save failed until the backend is restarted.`);
      console.warn(error);
    }
  }

  function removeSelected() {
    if (!selectedObject) return;
    const nextMaquettes = sceneData.maquettes.filter((item) => item.id !== selectedObject.id);
    const nextProps = sceneData.props.filter((item) => item.id !== selectedObject.id);
    const nextImagePlanes = sceneData.imagePlanes.filter((item) => item.id !== selectedObject.id);
    commitScene(
      {
        ...sceneData,
        maquettes: nextMaquettes,
        props: nextProps,
        imagePlanes: nextImagePlanes
      },
      { composerSelectedId: nextMaquettes[0]?.id || nextProps[0]?.id || nextImagePlanes[0]?.id || "camera" }
    );
  }

  async function captureFrame() {
    if (!viewportRef.current?.capture) {
      setCaptureStatus("Viewport not ready.");
      return;
    }

    try {
      const imageDataUrl = await viewportRef.current.capture();
      if (!imageDataUrl) {
        setCaptureStatus("Viewport not ready.");
        return;
      }
      setCaptureStatus("Capturing...");
      await onCapture(imageDataUrl);
      setCaptureStatus("Captured.");
    } catch (error) {
      setCaptureStatus(error.message || "Capture failed.");
    }
  }

  return (
    <div className="composer-modal" role="dialog" aria-modal="true" aria-label="Composer">
      <div className="composer-shell" onPointerDown={(event) => event.stopPropagation()}>
        <header className="composer-header">
          <div>
            <span>Composer</span>
            <strong>{node.data.title || "Composer"}</strong>
          </div>
          <div className="composer-header-actions">
            <select value={node.data.composerAspectRatio || "16:9"} onChange={(event) => onUpdate({ composerAspectRatio: event.target.value })} title="Frame aspect ratio">
              <option>16:9</option>
              <option>21:9</option>
              <option>4:3</option>
              <option>1:1</option>
              <option>9:16</option>
            </select>
            <button className={`composer-toggle ${node.data.composerShowGuides !== false ? "enabled" : ""}`} onClick={() => onUpdate({ composerShowGuides: node.data.composerShowGuides === false })}>
              Guides
            </button>
            <button onClick={captureFrame}>Capture Frame</button>
            <button className="icon-only" onClick={onClose} title="Close Composer">
              <X size={17} />
            </button>
          </div>
        </header>

        <main className="composer-main">
          <ComposerViewport
            ref={viewportRef}
            sceneData={renderSceneData}
            selectedId={selectedId}
            aspectRatio={node.data.composerAspectRatio || "16:9"}
            showGuides={node.data.composerShowGuides !== false}
            onCameraChange={patchCamera}
          />

          <aside className="composer-controls">
            <div className="composer-control-row trio">
              <button onClick={addMaquette}>Add Maquette</button>
              <select value="" onChange={(event) => event.target.value && addPrimitiveProp(event.target.value)} title="Add primitive">
                <option value="">Add Primitive</option>
                {composerPrimitiveOptions.map((primitive) => (
                  <option key={primitive.id} value={primitive.id}>
                    {primitive.label}
                  </option>
                ))}
              </select>
              <button onClick={addImagePlane} disabled={!imageSources.length} title={imageSources.length ? "Add connected image plane" : "Connect an image to Composer"}>
                Add Plane
              </button>
            </div>

            <div className="composer-selection-panel">
              <label className="composer-field highlighted">
                <span>Selection</span>
                <select value={selectedId} onChange={(event) => onUpdate({ composerSelectedId: event.target.value })}>
                  <option value="camera">Camera</option>
                  {sceneData.maquettes.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {item.name || `Maquette ${index + 1}`}
                    </option>
                  ))}
                  {sceneData.props.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {item.name || `${composerPrimitiveLabel(item.primitive)} ${index + 1}`}
                    </option>
                  ))}
                  {sceneData.imagePlanes.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {item.name || `Image Plane ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="composer-field highlighted">
                <span>Name</span>
                <input value={selectedNameValue} disabled={selectedKind === "camera"} onChange={(event) => patchSelected({ name: event.target.value })} />
              </label>
            </div>

            {selectedKind === "camera" ? (
              <div className="composer-camera-panel">
                <div className="composer-camera-bookmarks">
                  <button type="button" onClick={() => stepCameraBookmark(-1)} disabled={!sceneData.cameraBookmarks.length} title="Previous camera bookmark" aria-label="Previous camera bookmark">
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    className="composer-camera-bookmark-current"
                    onClick={() => activeCameraBookmark && recallCameraBookmark(activeCameraBookmark.id)}
                    disabled={!activeCameraBookmark}
                    title={activeCameraBookmark ? "Recall camera bookmark" : "No camera bookmarks"}
                  >
                    {activeCameraBookmark?.name || "Cam 0"}
                  </button>
                  <button type="button" onClick={() => stepCameraBookmark(1)} disabled={!sceneData.cameraBookmarks.length} title="Next camera bookmark" aria-label="Next camera bookmark">
                    <ChevronRight size={15} />
                  </button>
                  <button type="button" onClick={saveCameraBookmark} title="Save current camera" aria-label="Save current camera">
                    <Save size={15} />
                  </button>
                  <button type="button" onClick={deleteCameraBookmark} disabled={!activeCameraBookmark} title="Delete camera bookmark" aria-label="Delete camera bookmark">
                    <Trash2 size={15} />
                  </button>
                </div>
                <ComposerVectorRange label="Location" value={{ x: sceneData.camera.x, y: sceneData.camera.y, z: sceneData.camera.z }} step="0.05" onChange={(value) => patchCamera({ x: value.x, y: value.y, z: value.z })} />
                <ComposerRange label="Yaw" min="-360" max="360" step="1" value={sceneData.camera.yaw} onChange={(value) => patchCamera({ yaw: value })} />
                <ComposerRange label="Pitch" min="-82" max="82" step="1" value={sceneData.camera.pitch} onChange={(value) => patchCamera({ pitch: value })} />
                <ComposerRange label="Lens" step="1" value={sceneData.camera.fov} onChange={(value) => patchCamera({ fov: value })} />
              </div>
            ) : selectedObject ? (
              <>
                {selectedKind === "maquette" && (
                  <label className="composer-field">
                    <span>Color</span>
                    <input type="color" value={selectedObject.color || "#b8b8b2"} onChange={(event) => patchSelected({ color: event.target.value })} />
                  </label>
                )}
                <ComposerVectorRange label="Location" value={{ x: selectedObject.x, y: selectedObject.y, z: selectedObject.z }} step="0.05" onChange={(value) => patchSelected({ x: value.x, y: value.y, z: value.z })} />
                <ComposerRotationVectorRange label="Rotation" value={{ x: THREE.MathUtils.degToRad(finiteNumber(selectedObject.rotX, 0)), y: THREE.MathUtils.degToRad(finiteNumber(selectedObject.rotY, 0)), z: THREE.MathUtils.degToRad(finiteNumber(selectedObject.rotZ, 0)) }} onChange={(value) => patchSelected({ rotX: THREE.MathUtils.radToDeg(value.x), rotY: THREE.MathUtils.radToDeg(value.y), rotZ: THREE.MathUtils.radToDeg(value.z) })} />
                <ComposerRange label="Scale" step="0.05" value={selectedObject.scale} onChange={(value) => patchSelected({ scale: value })} />

                {selectedKind === "maquette" ? (
                  <>
                    <div className="composer-control-row pose-save">
                      <label className="composer-field highlighted">
                        <span>Pose</span>
                        <select value={selectedPoseValue} onChange={(event) => applySavedPose(event.target.value)}>
                          <option value="" disabled>
                            {savedPoseOptions.length ? "Select pose" : "No saved poses"}
                          </option>
                          {savedPoseOptions.map((pose) => (
                            <option key={pose.id} value={pose.id}>
                              {pose.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" onClick={saveSelectedPose}>
                        Save
                      </button>
                    </div>
                    {poseStatus && <div className="composer-status">{poseStatus}</div>}
                    <ComposerRotationVectorRange label="L Upper Arm" value={composerRotationVector(selectedObject, "leftUpperArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftUpperArm", value))} />
                    <ComposerRotationVectorRange label="L Lower Arm" value={composerRotationVector(selectedObject, "leftLowerArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftLowerArm", value))} />
                    <ComposerRotationVectorRange label="R Upper Arm" value={composerRotationVector(selectedObject, "rightUpperArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightUpperArm", value))} />
                    <ComposerRotationVectorRange label="R Lower Arm" value={composerRotationVector(selectedObject, "rightLowerArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightLowerArm", value))} />
                    <ComposerRotationVectorRange label="L Upper Leg" value={composerRotationVector(selectedObject, "leftUpperLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftUpperLeg", value))} />
                    <ComposerRotationVectorRange label="L Lower Leg" value={composerRotationVector(selectedObject, "leftLowerLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftLowerLeg", value))} />
                    <ComposerRotationVectorRange label="R Upper Leg" value={composerRotationVector(selectedObject, "rightUpperLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightUpperLeg", value))} />
                    <ComposerRotationVectorRange label="R Lower Leg" value={composerRotationVector(selectedObject, "rightLowerLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightLowerLeg", value))} />
                    <ComposerRotationVectorRange label="L Hand" value={composerRotationVector(selectedObject, "leftHandRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftHandRot", value, false))} />
                    <ComposerRotationVectorRange label="R Hand" value={composerRotationVector(selectedObject, "rightHandRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightHandRot", value, false))} />
                    <ComposerRotationVectorRange label="Head" value={composerRotationVector(selectedObject, "headRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("headRot", value, false))} />
                    <ComposerRotationVectorRange label="Upper Body" value={composerRotationVector(selectedObject, "upperBodyRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("upperBodyRot", value, false))} />
                  </>
                ) : selectedKind === "prop" ? (
                  <>
                    <label className="composer-field">
                      <span>Color</span>
                      <input type="color" value={selectedObject.color || "#496b8f"} onChange={(event) => patchSelected({ color: event.target.value })} />
                    </label>
                    <label className="composer-field">
                      <span>Primitive</span>
                      <select value={selectedObject.primitive || "box"} onChange={(event) => patchSelected({ primitive: event.target.value })}>
                        {composerPrimitiveOptions.map((primitive) => (
                          <option key={primitive.id} value={primitive.id}>
                            {primitive.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ComposerRange label="Width" min="0.25" max="4" step="0.05" value={selectedObject.width} onChange={(value) => patchSelected({ width: value })} />
                    <ComposerRange label="Height" min="0.25" max="4" step="0.05" value={selectedObject.height} onChange={(value) => patchSelected({ height: value })} />
                    <ComposerRange label="Depth" min="0.25" max="4" step="0.05" value={selectedObject.depth} onChange={(value) => patchSelected({ depth: value })} />
                  </>
                ) : (
                  <>
                    <label className="composer-field">
                      <span>Image</span>
                      <select value={selectedObject.imageUrl || ""} onChange={(event) => patchSelected({ imageUrl: event.target.value, name: imageSources.find((item) => item.url === event.target.value)?.label || selectedObject.name })}>
                        <option value="">No image</option>
                        {selectedObject.imageUrl && !imageSources.some((item) => item.url === selectedObject.imageUrl) && (
                          <option value={selectedObject.imageUrl}>Current image</option>
                        )}
                        {imageSources.map((item) => (
                          <option key={item.url} value={item.url}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ComposerRange label="Width" min="0.25" max="8" step="0.05" value={selectedObject.width} onChange={(value) => patchSelected({ width: value })} />
                    <ComposerRange label="Height" min="0.25" max="8" step="0.05" value={selectedObject.height} onChange={(value) => patchSelected({ height: value })} />
                    <ComposerRange label="Opacity" min="0.1" max="1" step="0.05" value={selectedObject.opacity} onChange={(value) => patchSelected({ opacity: value })} />
                  </>
                )}

                <button className="composer-danger" onClick={removeSelected}>
                  Remove Selection
                </button>
              </>
            ) : (
              <div className="composer-empty-selection">Add a maquette or box to begin blocking.</div>
            )}

            {captureStatus && <small className="composer-status">{captureStatus}</small>}
          </aside>
        </main>
      </div>
    </div>
  );
}

function ComposerScrubInput({ label, value, min, max, step, axis, onChange }) {
  const numericValue = finiteNumber(value, 0);
  const minNumber = Number(min);
  const maxNumber = Number(max);
  const hasMin = min !== undefined && min !== null && min !== "" && Number.isFinite(minNumber);
  const hasMax = max !== undefined && max !== null && max !== "" && Number.isFinite(maxNumber);
  const stepValue = Math.max(finiteNumber(step, 1), 0.0001);
  const precision = composerStepPrecision(stepValue);
  const scrubAxis = axis || composerAxisForLabel(label);
  const inputRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const editingRef = React.useRef(false);
  const [draftValue, setDraftValue] = React.useState(formatComposerControlValue(numericValue, precision));
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!editingRef.current && !dragRef.current) {
      setDraftValue(formatComposerControlValue(numericValue, precision));
    }
  }, [numericValue, precision]);

  function normalizedValue(nextValue) {
    let bounded = nextValue;
    if (hasMin) bounded = Math.max(minNumber, bounded);
    if (hasMax) bounded = Math.min(maxNumber, bounded);
    const rounded = Math.round(bounded / stepValue) * stepValue;
    return Number(rounded.toFixed(Math.min(6, precision + 2)));
  }

  function commitValue(nextValue) {
    if (!Number.isFinite(nextValue)) {
      setDraftValue(formatComposerControlValue(numericValue, precision));
      return;
    }

    const next = normalizedValue(nextValue);
    setDraftValue(formatComposerControlValue(next, precision));
    onChange(next);
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: numericValue,
      dragging: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.startX;
    if (!dragRef.current.dragging && Math.abs(deltaX) < 4) return;

    dragRef.current.dragging = true;
    editingRef.current = false;
    setDragging(true);
    event.preventDefault();
    const dragMultiplier = event.shiftKey ? 10 : 1;
    commitValue(dragRef.current.startValue + deltaX * stepValue * dragMultiplier);
  }

  function handlePointerUp(event) {
    const dragState = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!dragState?.dragging) {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }

  function handleFocus() {
    editingRef.current = true;
  }

  function handleBlur() {
    editingRef.current = false;
    commitValue(Number(draftValue));
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      editingRef.current = false;
      setDraftValue(formatComposerControlValue(numericValue, precision));
      event.currentTarget.blur();
    }
  }

  return (
    <span className={`composer-scrub-input ${dragging ? "dragging" : ""}`} style={{ "--axis-color": composerAxisColor(scrubAxis) }}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Type a value, or drag left/right to slide"
        aria-label={label}
      />
    </span>
  );
}

function ComposerRange({ label, value, min, max, step, onChange }) {
  return (
    <label className="composer-field scrub">
      <span>{label}</span>
      <ComposerScrubInput label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </label>
  );
}

function ComposerRotationRange({ label, value, onChange }) {
  const degrees = THREE.MathUtils.radToDeg(finiteNumber(value, 0));
  return (
    <ComposerRange
      label={label}
      min="-360"
      max="360"
      step="1"
      value={degrees}
      onChange={(nextDegrees) => onChange(THREE.MathUtils.degToRad(nextDegrees))}
    />
  );
}

function ComposerVectorRange({ label, value, step = "0.05", onChange }) {
  const vector = {
    x: finiteNumber(value?.x, 0),
    y: finiteNumber(value?.y, 0),
    z: finiteNumber(value?.z, 0)
  };
  const patchAxis = (axis) => (nextValue) => {
    onChange({
      ...vector,
      [axis]: nextValue
    });
  };

  return (
    <label className="composer-field scrub vector">
      <span>{label}</span>
      <span className="composer-vector-inputs">
        <ComposerScrubInput label={`${label} X`} axis="x" step={step} value={vector.x} onChange={patchAxis("x")} />
        <ComposerScrubInput label={`${label} Y`} axis="y" step={step} value={vector.y} onChange={patchAxis("y")} />
        <ComposerScrubInput label={`${label} Z`} axis="z" step={step} value={vector.z} onChange={patchAxis("z")} />
      </span>
    </label>
  );
}

function ComposerRotationVectorRange({ label, value, onChange }) {
  const degrees = {
    x: THREE.MathUtils.radToDeg(finiteNumber(value?.x, 0)),
    y: THREE.MathUtils.radToDeg(finiteNumber(value?.y, 0)),
    z: THREE.MathUtils.radToDeg(finiteNumber(value?.z, 0))
  };
  const patchAxis = (axis) => (nextDegrees) => {
    onChange({
      ...value,
      [axis]: THREE.MathUtils.degToRad(nextDegrees)
    });
  };

  return (
    <label className="composer-field scrub vector">
      <span>{label}</span>
      <span className="composer-vector-inputs">
        <ComposerScrubInput label={`${label} X`} axis="x" min="-360" max="360" step="1" value={degrees.x} onChange={patchAxis("x")} />
        <ComposerScrubInput label={`${label} Y`} axis="y" min="-360" max="360" step="1" value={degrees.y} onChange={patchAxis("y")} />
        <ComposerScrubInput label={`${label} Z`} axis="z" min="-360" max="360" step="1" value={degrees.z} onChange={patchAxis("z")} />
      </span>
    </label>
  );
}

function composerRotationVector(item, key, legacyZ = 0) {
  const zFallback = finiteNumber(item?.[key], legacyZ);
  return {
    x: finiteNumber(item?.[`${key}X`], 0),
    y: finiteNumber(item?.[`${key}Y`], 0),
    z: finiteNumber(item?.[`${key}Z`], zFallback)
  };
}

function composerRotationVectorPatch(key, value, includeLegacy = true) {
  const vector = {
    x: finiteNumber(value?.x, 0),
    y: finiteNumber(value?.y, 0),
    z: finiteNumber(value?.z, 0)
  };
  const patch = {
    [`${key}X`]: vector.x,
    [`${key}Y`]: vector.y,
    [`${key}Z`]: vector.z
  };
  if (includeLegacy) patch[key] = vector.z;
  return patch;
}

function composerRotationFields(item, key, legacyZ = 0) {
  return composerRotationVectorPatch(key, composerRotationVector(item, key, legacyZ));
}

function composerAxisForLabel(label = "") {
  const axisMatch = String(label).match(/\b([XYZ])$/i);
  return axisMatch ? axisMatch[1].toLowerCase() : "";
}

function composerAxisColor(axis) {
  if (axis === "x") return "#ff5a2f";
  if (axis === "y") return "#86d747";
  if (axis === "z") return "#4d8dff";
  return "#ddc631";
}

function composerStepPrecision(step) {
  const [, decimals = ""] = String(step).split(".");
  return Math.min(4, decimals.length);
}

function formatComposerControlValue(value, precision) {
  return Number(value).toFixed(Math.max(0, precision));
}

const ComposerViewport = React.forwardRef(function ComposerViewport({ sceneData, selectedId, aspectRatio, showGuides, onCameraChange }, ref) {
  const mountRef = React.useRef(null);
  const rendererRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const cameraRef = React.useRef(null);
  const stateRef = React.useRef({ sceneData, selectedId, aspectRatio, showGuides });
  const onCameraChangeRef = React.useRef(onCameraChange);
  const dragRef = React.useRef(null);
  const keysRef = React.useRef(new Set());
  const moveFrameRef = React.useRef(0);

  React.useEffect(() => {
    stateRef.current = { sceneData, selectedId, aspectRatio, showGuides };
    onCameraChangeRef.current = onCameraChange;
    renderComposerViewport(rendererRef.current, sceneRef.current, cameraRef.current, sceneData, selectedId);
  }, [sceneData, selectedId, aspectRatio, showGuides, onCameraChange]);

  React.useImperativeHandle(
    ref,
    () => ({
      capture() {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return "";
        return renderComposerViewport(renderer, scene, camera, stateRef.current.sceneData, "", {
          showGrid: false,
          showSelection: false,
          awaitTextures: true,
          awaitAssets: true
        }).then(() => {
          const imageDataUrl = renderer.domElement.toDataURL("image/png");
          renderComposerViewport(renderer, scene, camera, stateRef.current.sceneData, stateRef.current.selectedId);
          return imageDataUrl;
        });
      }
    }),
    []
  );

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "composer-canvas";
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const resizeObserver = new ResizeObserver(() => {
      const rect = mount.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
      camera.updateProjectionMatrix();
      renderComposerViewport(renderer, scene, camera, stateRef.current.sceneData, stateRef.current.selectedId);
    });
    resizeObserver.observe(mount);

    function startDrag(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      renderer.domElement.focus();
      renderer.domElement.setPointerCapture(event.pointerId);
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        camera: { ...stateRef.current.sceneData.camera }
      };
    }

    function moveDrag(event) {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      onCameraChangeRef.current({
        yaw: clamp(dragRef.current.camera.yaw - dx * 0.25, -360, 360),
        pitch: clamp(dragRef.current.camera.pitch - dy * 0.18, -82, 82)
      });
    }

    function stopDrag(event) {
      dragRef.current = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    }

    function handleWheel(event) {
      event.preventDefault();
      onCameraChangeRef.current({
        fov: clamp(stateRef.current.sceneData.camera.fov + event.deltaY * 0.02, 18, 80)
      });
    }

    function startMoveLoop() {
      if (moveFrameRef.current) return;
      const step = () => {
        moveFrameRef.current = window.requestAnimationFrame(step);
        if (!keysRef.current.size) return;

        const cameraData = stateRef.current.sceneData.camera;
        const speed = keysRef.current.has("shift") ? 0.16 : 0.07;
        const yaw = THREE.MathUtils.degToRad(cameraData.yaw);
        const pitch = THREE.MathUtils.degToRad(cameraData.pitch);
        const forward = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const delta = new THREE.Vector3();

        if (keysRef.current.has("w")) delta.add(forward);
        if (keysRef.current.has("s")) delta.sub(forward);
        if (keysRef.current.has("d")) delta.add(right);
        if (keysRef.current.has("a")) delta.sub(right);
        if (keysRef.current.has("e")) delta.y += 1;
        if (keysRef.current.has("q")) delta.y -= 1;
        if (!delta.lengthSq()) return;
        delta.normalize().multiplyScalar(speed);

        const nextCamera = {
          x: cameraData.x + delta.x,
          y: clamp(cameraData.y + delta.y, 0.25, 8),
          z: cameraData.z + delta.z
        };
        stateRef.current = {
          ...stateRef.current,
          sceneData: {
            ...stateRef.current.sceneData,
            camera: {
              ...cameraData,
              ...nextCamera
            }
          }
        };
        onCameraChangeRef.current(nextCamera);
      };
      moveFrameRef.current = window.requestAnimationFrame(step);
    }

    function handleKeyDown(event) {
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d", "q", "e", "shift"].includes(key)) return;
      event.preventDefault();
      keysRef.current.add(key);
      startMoveLoop();
    }

    function handleKeyUp(event) {
      keysRef.current.delete(event.key.toLowerCase());
    }

    function clearKeys() {
      keysRef.current.clear();
    }

    renderer.domElement.addEventListener("pointerdown", startDrag);
    renderer.domElement.addEventListener("pointermove", moveDrag);
    renderer.domElement.addEventListener("pointerup", stopDrag);
    renderer.domElement.addEventListener("pointercancel", stopDrag);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderer.domElement.addEventListener("keydown", handleKeyDown);
    renderer.domElement.addEventListener("keyup", handleKeyUp);
    renderer.domElement.addEventListener("blur", clearKeys);

    renderComposerViewport(renderer, scene, camera, stateRef.current.sceneData, stateRef.current.selectedId);

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", startDrag);
      renderer.domElement.removeEventListener("pointermove", moveDrag);
      renderer.domElement.removeEventListener("pointerup", stopDrag);
      renderer.domElement.removeEventListener("pointercancel", stopDrag);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.domElement.removeEventListener("keydown", handleKeyDown);
      renderer.domElement.removeEventListener("keyup", handleKeyUp);
      renderer.domElement.removeEventListener("blur", clearKeys);
      window.cancelAnimationFrame(moveFrameRef.current);
      disposeComposerScene(scene);
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, []);

  return (
    <div className="composer-viewport-shell" style={{ aspectRatio: composerAspectRatioValue(aspectRatio), "--composer-aspect": composerAspectRatioNumber(aspectRatio) }} ref={mountRef}>
      {showGuides && <div className="composer-guides" aria-hidden="true" />}
    </div>
  );
});

function UploadIcon({ type }) {
  if (type === "image") return <FileImage size={22} />;
  if (type === "video") return <Video size={22} />;
  if (type === "audio") return <FileAudio size={22} />;
  return <Plus size={22} />;
}

function NodeBody({
  node,
  onUpdate,
  incoming,
  onRun,
  running,
  onConnectStart,
  onDisconnectInput,
  connectedPortKeys,
  onUpload,
  onTransferImagesUpload,
  onTransferImageRemove,
  onTransferActivate,
  onTransferUnlock,
  onCharacterPortraitUpload,
  onCharacterWardrobesUpload,
  onCharacterVoicesUpload,
  onCharacterWardrobeRemove,
  onCharacterVoiceRemove,
  onCharacterActivate,
  onCharacterUnlock,
  onPreviewResizeStart,
  onOpenComposer,
  incomingByNode,
  transferCompiling
}) {
  const config = getNodeConfig(node.type);
  const outputPort = config.output[0];
  const resolvedPromptText = (items = []) => connectedText(items, incomingByNode);

  if (node.type === "text") {
    const hasOutputPanel = Boolean(node.data.resultText) || node.data.status === "running" || node.data.status === "complete";
    const textPort = config.input.find((port) => port.id === "textIn");
    const imagePort = config.input.find((port) => port.id === "imageIn");
    const videoPort = config.input.find((port) => port.id === "videoIn");
    const stylePort = config.input.find((port) => port.id === "styleIn");
    const hasRunInput =
      Boolean(String(node.data.text || "").trim()) ||
      Boolean(incoming.textIn?.length) ||
      Boolean(incoming.imageIn?.length) ||
      Boolean(incoming.videoIn?.length) ||
      Boolean(incoming.styleIn?.length);
    return (
      <div className="node-body text-node-body">
        <OutputPortRow node={node} port={outputPort} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        <div className="text-input-port-stack" aria-label="Text node inputs">
          {[textPort, imagePort, videoPort, stylePort].filter(Boolean).map((port) => (
            <PortHandle
              key={port.id}
              node={node}
              port={port}
              side="input"
              onConnectStart={onConnectStart}
              onDisconnectInput={onDisconnectInput}
              connectedPortKeys={connectedPortKeys}
            />
          ))}
        </div>
        <div className={hasOutputPanel ? "text-split-panel" : "text-single-panel"}>
          <label className="text-field-group">
            <span>Original prompt</span>
            <textarea value={node.data.text} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
            <textarea aria-label="Text node prompt" value={node.data.text} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
          </label>
          {hasOutputPanel && (
            <label className="text-field-group">
              <span>Output</span>
              <textarea
                value={node.data.resultText || ""}
                placeholder={running ? "Running..." : "Output will appear here"}
                onChange={(event) => onUpdate(node.id, { resultText: event.target.value })}
              />
            </label>
          )}
        </div>
        <button className="run-node-button" onClick={() => onRun(node)} disabled={running || !hasRunInput}>
          {running ? "Running..." : "Run Text"}
        </button>
        {node.data.lastRunModel && <small className="upload-status">Processed with {node.data.lastRunModel}</small>}
        {node.data.error && <small className="upload-error">{node.data.error}</small>}
      </div>
    );
  }

  if (node.type === "image" || node.type === "video" || node.type === "audio") {
    return (
      <div
        className="node-body media-node-body"
        onDragOver={allowFileDrop}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const file = firstAcceptedFile(event.dataTransfer.files, node.type);
          if (file) onUpload(node, file);
        }}
      >
        <OutputPortRow node={node} port={outputPort} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        <MediaPreview node={node} />
        <label className="media-upload-card">
          <UploadIcon type={node.type} />
          <span>{node.data.resultUrl ? "Replace upload" : "Upload"}</span>
          <input type="file" accept={mediaAccept(node.type)} onChange={(event) => onUpload(node, event.target.files?.[0])} />
        </label>
        {node.data.fileName && <small>{node.data.fileName}</small>}
        {node.data.status === "uploading" && <small className="upload-status">Uploading...</small>}
        {node.data.error && <small className="upload-error">{node.data.error}</small>}
      </div>
    );
  }

  if (node.type === "composer") {
    const promptOutputPort = config.output.find((port) => port.id === "promptOut");
    const imageOutputPort = config.output.find((port) => port.id === "imageOut");
    const promptInputPort = config.input.find((port) => port.id === "promptIn");
    const imageInputPort = config.input.find((port) => port.id === "imageIn");
    const promptValue = resolvedPromptText(incoming.promptIn) || node.data.prompt || "";
    const promptConnected = Boolean(resolvedPromptText(incoming.promptIn));
    const imagePlaneCount = connectedAssetItems(incoming.imageIn).length;

    return (
      <div className="node-body composer-node-body">
        <div className="composer-input-port-stack" aria-label="Composer inputs">
          {[promptInputPort, imageInputPort].filter(Boolean).map((port) => (
            <PortHandle
              key={port.id}
              node={node}
              port={port}
              side="input"
              onConnectStart={onConnectStart}
              onDisconnectInput={onDisconnectInput}
              connectedPortKeys={connectedPortKeys}
            />
          ))}
        </div>
        {promptOutputPort && <OutputPortRow node={node} port={promptOutputPort} label="Prompt output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />}
        {imageOutputPort && <OutputPortRow node={node} port={imageOutputPort} label="Frame output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />}
        <label className="composer-node-prompt">
          <span>Prompt</span>
          <textarea className={promptConnected ? "connected-field" : ""} value={promptValue} readOnly={promptConnected} onChange={(event) => onUpdate(node.id, { prompt: event.target.value })} />
        </label>
        <div className={`composer-node-preview ${node.data.resultUrl ? "" : "empty"}`}>
          {node.data.resultUrl ? (
            <img src={node.data.resultUrl} alt="Composer frame" />
          ) : (
            <>
              <Box size={28} />
              <span>No frame captured</span>
            </>
          )}
        </div>
        <button className="run-node-button" onClick={() => onOpenComposer?.(node.id)}>
          Open Composer
        </button>
        <small className="model-status-note">{imagePlaneCount ? `${imagePlaneCount} image plane source${imagePlaneCount === 1 ? "" : "s"} connected.` : "Block camera, pose, scale, and layout with simple 3D maquettes."}</small>
        {node.data.status === "uploading" && <small className="upload-status">Capturing...</small>}
        {node.data.error && <small className="upload-error">{node.data.error}</small>}
      </div>
    );
  }

  if (node.type === "character") {
    const portrait = node.data.characterPortrait;
    const wardrobes = Array.isArray(node.data.characterWardrobes) ? node.data.characterWardrobes : [];
    const voices = Array.isArray(node.data.characterVoices) ? node.data.characterVoices : [];
    const activeWardrobe = activeCharacterWardrobe(node);
    const activeVoice = activeCharacterVoice(node);
    const selectedTraits = Array.isArray(node.data.characterTraits) ? node.data.characterTraits : [];
    const hasCharacterTraits = selectedTraits.length > 0 || Boolean(String(node.data.customCharacterTraits || "").trim());
    const characterVariants = Array.isArray(node.data.characterSheetVariants) ? node.data.characterSheetVariants : [];
    const variantCount = characterVariants.length;
    const targetVariantCount = Math.max(1, wardrobes.length);
    const batchProgress = node.data.characterBatchProgress;
    const locked = Boolean(node.data.locked && node.data.activated && node.data.resultUrl);
    const compiling = node.data.status === "compiling";
    const activeTab = node.data.characterTab === "sheet" ? "sheet" : "build";
    const characterPort = config.output.find((port) => port.id === "characterOut");
    const voicePort = config.output.find((port) => port.id === "voiceOut");
    const outputConnected = connectedPortKeys.has(`${node.id}:${characterPort.id}`);

    function toggleTrait(trait) {
      const nextTraits = selectedTraits.includes(trait) ? selectedTraits.filter((item) => item !== trait) : [...selectedTraits, trait];
      onUpdate(node.id, { characterTraits: nextTraits });
    }

    function selectWardrobe(wardrobe) {
      const variant = characterSheetVariantForWardrobeId(node.data, wardrobe.id);
      if (locked && !variant) return;
      onUpdate(node.id, {
        activeWardrobeId: wardrobe.id,
        ...(locked && variant ? characterVariantDisplayPatch(variant) : {})
      });
    }

    function handleCharacterDrop(event, zone) {
      allowFileDrop(event);
      if (zone === "portrait") {
        const file = firstAcceptedFile(event.dataTransfer.files, "image");
        if (file) onCharacterPortraitUpload(node, file);
        return;
      }
      if (zone === "wardrobe") {
        onCharacterWardrobesUpload(node, event.dataTransfer.files);
        return;
      }
      onCharacterVoicesUpload(node, event.dataTransfer.files);
    }

    return (
      <div className="node-body character-node-body">
        <div className="character-topbar">
          <div className="character-tabs" role="tablist" aria-label="Character views">
            <button type="button" role="tab" aria-selected={activeTab === "build"} className={activeTab === "build" ? "active" : ""} onClick={() => onUpdate(node.id, { characterTab: "build" })}>
              Character Build
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "sheet"} className={activeTab === "sheet" ? "active" : ""} onClick={() => onUpdate(node.id, { characterTab: "sheet" })}>
              Character Sheet
            </button>
          </div>
          <div className="character-port-bar">
            {locked || outputConnected ? (
              <OutputPortRow node={node} port={characterPort} label={`@${characterTag(node)} Character`} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
            ) : (
              <span>Lock character to enable output</span>
            )}
            {locked && activeVoice && (
              <OutputPortRow node={node} port={voicePort} label="Selected Voice" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
            )}
          </div>
        </div>
        {activeTab === "build" ? (
          <section className="character-build-view">
            <div className="character-layout">
              <section className="character-sheet-panel drop-enabled" onDragOver={allowFileDrop} onDrop={(event) => handleCharacterDrop(event, "portrait")}>
                <span className="character-section-label">Portrait Reference</span>
                <label className={`character-main-preview ${portrait ? "has-image" : ""}`} title={portrait ? "Replace portrait image" : "Upload portrait image"}>
                  {portrait?.localUrl ? (
                    <img src={portrait.localUrl} alt="Character portrait" />
                  ) : (
                    <UserRound size={28} />
                  )}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onCharacterPortraitUpload(node, event.target.files?.[0])} />
                </label>
                <label className="character-identity-field">
                  <span className="character-section-label">Identity</span>
                  <div className="character-name-row">
                    <input
                      value={node.data.characterName || ""}
                      placeholder="Name"
                      onChange={(event) => onUpdate(node.id, { characterName: event.target.value })}
                    />
                    <strong>@{characterTag(node)}</strong>
                  </div>
                </label>
                <label className="character-physical-details">
                  <span className="character-section-label">Physical Details <span className="character-optional-label">(Optional)</span></span>
                  <textarea
                    value={node.data.characterPhysicalDetails || ""}
                    placeholder="Defining features, e.g. glass left eye, wooden prosthetic leg"
                    onChange={(event) => onUpdate(node.id, { characterPhysicalDetails: event.target.value })}
                  />
                </label>
              </section>
              <div className="character-editor character-build-scroll">
                <section className="character-section wardrobe drop-enabled" onDragOver={allowFileDrop} onDrop={(event) => handleCharacterDrop(event, "wardrobe")}>
                  <div className="character-section-head">
                    <span className="character-section-label">Wardrobe</span>
                    {wardrobes.length < maxCharacterWardrobes && (
                      <label className="character-add-button" title="Upload wardrobe images">
                        <Plus size={13} />
                        <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => onCharacterWardrobesUpload(node, event.target.files)} />
                      </label>
                    )}
                  </div>
                  <div className="character-thumb-strip">
                    {wardrobes.map((wardrobe) => {
                      const hasSheet = Boolean(characterSheetVariantForWardrobeId(node.data, wardrobe.id));
                      return (
                        <button
                          key={wardrobe.id}
                          type="button"
                          className={`${wardrobe.id === activeWardrobe?.id ? "active" : ""} ${locked && !hasSheet ? "unavailable" : ""}`}
                          disabled={compiling}
                          onClick={() => selectWardrobe(wardrobe)}
                          title={locked && hasSheet ? `Use ${wardrobe.fileName || "this wardrobe"} character sheet` : locked ? "No generated sheet for this wardrobe" : wardrobe.fileName}
                        >
                          <img src={wardrobe.localUrl} alt={wardrobe.fileName || "Wardrobe"} />
                          <span className="character-remove" onClick={(event) => { event.stopPropagation(); onCharacterWardrobeRemove(node.id, wardrobe.id); }}>
                            <X size={10} />
                          </span>
                        </button>
                      );
                    })}
                    {!wardrobes.length && <small>Drop outfit sheets here</small>}
                  </div>
                </section>
                <label className="character-section character-reference-notes">
                  <span className="character-section-label">Notes</span>
                  <textarea
                    value={node.data.characterReferenceNotes || ""}
                    placeholder="Personal reference notes"
                    onChange={(event) => onUpdate(node.id, { characterReferenceNotes: event.target.value })}
                  />
                </label>
                <details className="character-section character-collapsible characteristics" defaultOpen={hasCharacterTraits}>
                  <summary>
                    <span className="character-section-label">Characteristics <span className="character-optional-label">(Optional)</span></span>
                    <ChevronDown size={13} />
                  </summary>
                  <div className="character-collapsible-body">
                    <div className="character-trait-grid">
                      {characterTraitOptions.map((trait) => (
                        <button key={trait} type="button" className={selectedTraits.includes(trait) ? "active" : ""} onClick={() => toggleTrait(trait)}>
                          {trait}
                        </button>
                      ))}
                    </div>
                    <input
                      className="character-custom-traits"
                      value={node.data.customCharacterTraits || ""}
                      placeholder="Custom traits, separated by commas"
                      onChange={(event) => onUpdate(node.id, { customCharacterTraits: event.target.value })}
                    />
                  </div>
                </details>
                <details className="character-section character-collapsible voice drop-enabled" defaultOpen={Boolean(voices.length)} onDragOver={allowFileDrop} onDrop={(event) => handleCharacterDrop(event, "voice")}>
                  <summary>
                    <span className="character-section-label">Voice <span className="character-optional-label">(Optional)</span></span>
                    <span className="character-summary-meta">{activeVoice ? activeVoice.fileName : "None"}</span>
                    <ChevronDown size={13} />
                  </summary>
                  <div className="character-collapsible-body">
                    <div className="character-section-head">
                      <small>Dialogue references</small>
                      {voices.length < maxCharacterVoices && (
                        <label className="character-add-button" title="Upload dialogue audio">
                          <Plus size={13} />
                          <input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a" multiple onChange={(event) => onCharacterVoicesUpload(node, event.target.files)} />
                        </label>
                      )}
                    </div>
                    <div className="character-voice-list">
                      {voices.map((voice) => (
                        <button key={voice.id} type="button" className={voice.id === activeVoice?.id ? "active" : ""} onClick={() => onUpdate(node.id, { activeVoiceId: voice.id })}>
                          <FileAudio size={13} />
                          <span>{voice.fileName}</span>
                          <span className="character-remove" onClick={(event) => { event.stopPropagation(); onCharacterVoiceRemove(node.id, voice.id); }}>
                            <X size={10} />
                          </span>
                        </button>
                      ))}
                      {!voices.length && <small>Drop dialogue audio here</small>}
                    </div>
                    {activeVoice && <CharacterVoicePlayer voice={activeVoice} />}
                  </div>
                </details>
              </div>
            </div>
            <div className="character-actions">
              <span className={node.data.characterVariantNotice ? "upload-error" : ""}>
                {compiling && batchProgress
                  ? `Building outfit sheets ${batchProgress.completed} / ${batchProgress.total}`
                  : node.data.characterVariantNotice
                    ? node.data.characterVariantNotice
                  : locked
                    ? `${variantCount} outfit sheet${variantCount === 1 ? "" : "s"} ready. @${characterTag(node)} uses the selected outfit.`
                    : `${targetVariantCount} outfit sheet${targetVariantCount === 1 ? "" : "s"} will generate on lock.`}
              </span>
              <button
                className={`style-lock-button ${locked ? "locked" : ""}`}
                type="button"
                disabled={compiling || (!locked && (!portrait?.localUrl || !String(node.data.characterName || "").trim()))}
                onClick={() => (locked ? onCharacterUnlock(node.id) : onCharacterActivate(node))}
                title={locked ? "Unlock character" : `Generate and lock ${targetVariantCount} outfit sheet${targetVariantCount === 1 ? "" : "s"}`}
              >
                {compiling ? "Generating..." : locked ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
            </div>
          </section>
        ) : (
          <section className="character-sheet-view">
            {node.data.resultUrl ? (
              <img src={node.data.resultUrl} alt={`${node.data.characterName || "Character"} sheet`} />
            ) : (
              <div className="character-sheet-empty">
                <UserRound size={32} />
                <span>Generate a character sheet from Character Build</span>
              </div>
            )}
          </section>
        )}
        {node.data.error && <small className="upload-error">{node.data.error}</small>}
      </div>
    );
  }

  if (node.type === "camera") {
    const cameraSelected = hasCameraPreset(node);
    const cameraOutputPort = config.output.find((port) => port.id === "cameraOut");
    const imageOutputPort = config.output.find((port) => port.id === "imageOut");
    const imageInputPort = config.input.find((port) => port.id === "imageIn");
    const imageInputUrl = connectedAssetUrls(incoming.imageIn).at(-1) || "";
    const imageInputLabel = connectedSummary(incoming.imageIn, "Add image");
    const cameraPresetDisabled = Boolean(imageInputUrl);
    const qwenOpen = Boolean(node.data.qwenCameraOpen);
    const horizontalAngle = finiteNumber(node.data.horizontalAngle, qwenCameraDefaults.horizontalAngle);
    const verticalAngle = finiteNumber(node.data.verticalAngle, qwenCameraDefaults.verticalAngle);
    const zoom = finiteNumber(node.data.zoom, qwenCameraDefaults.zoom);
    return (
      <div className="node-body style-only-node-body camera-node-body">
        {cameraSelected ? (
          <OutputPortRow node={node} port={cameraOutputPort} label={cameraLabel(node)} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        ) : (
          <div className="style-output-placeholder">Choose camera preset to enable output</div>
        )}
        <OutputPortRow node={node} port={imageOutputPort} label="Camera image" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        {!qwenOpen && imageInputPort && (
          <div className="model-input-port-stack camera-input-port-stack" aria-label="Camera edit inputs">
            <PortHandle
              node={node}
              port={imageInputPort}
              side="input"
              onConnectStart={onConnectStart}
              onDisconnectInput={onDisconnectInput}
              connectedPortKeys={connectedPortKeys}
            />
          </div>
        )}

        <div className={`style-preset-row ${cameraPresetDisabled ? "disabled" : ""}`}>
          <span>Shot</span>
          <select value={node.data.shotPreset || "None"} disabled={cameraPresetDisabled} onChange={(event) => onUpdate(node.id, { shotPreset: event.target.value })}>
            {shotPresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>
        <div className={`style-preset-row ${cameraPresetDisabled ? "disabled" : ""}`}>
          <span>Lens</span>
          <select value={node.data.lensPreset || "None"} disabled={cameraPresetDisabled} onChange={(event) => onUpdate(node.id, { lensPreset: event.target.value })}>
            {lensPresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>
        <div className={`style-preset-row ${cameraPresetDisabled ? "disabled" : ""}`}>
          <span>Type</span>
          <select value={node.data.typePreset || "None"} disabled={cameraPresetDisabled} onChange={(event) => onUpdate(node.id, { typePreset: event.target.value })}>
            {typePresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>
        <details className="model-settings-drawer camera-control-drawer" open={qwenOpen} onToggle={(event) => onUpdate(node.id, { qwenCameraOpen: event.currentTarget.open })}>
          <summary>Qwen Camera Edit</summary>
          <NodeRow label="Image" inputPort={qwenOpen ? imageInputPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
            <button className={imageInputUrl ? "connected-field" : ""}>{imageInputLabel}</button>
          </NodeRow>
          <CameraControlViewport
            imageUrl={imageInputUrl}
            horizontalAngle={horizontalAngle}
            verticalAngle={verticalAngle}
            zoom={zoom}
            onChange={(patch) => onUpdate(node.id, patch)}
          />
          <div className="camera-control-grid">
            <div className="camera-control-toolbar">
              <button
                className="camera-reset-button"
                onClick={() =>
                  onUpdate(node.id, {
                    horizontalAngle: qwenCameraDefaults.horizontalAngle,
                    verticalAngle: qwenCameraDefaults.verticalAngle,
                    zoom: qwenCameraDefaults.zoom
                  })
                }
              >
                Reset
              </button>
            </div>
            <label>
              <span>Azimuth</span>
              <input type="range" min="0" max="360" step="1" value={horizontalAngle} onChange={(event) => onUpdate(node.id, { horizontalAngle: Number(event.target.value) })} />
              <strong>{Math.round(horizontalAngle)} deg</strong>
            </label>
            <label>
              <span>Elevation</span>
              <input type="range" min="-30" max="90" step="1" value={verticalAngle} onChange={(event) => onUpdate(node.id, { verticalAngle: Number(event.target.value) })} />
              <strong>{Math.round(verticalAngle)} deg</strong>
            </label>
            <label>
              <span>Zoom</span>
              <input type="range" min="0" max="10" step="0.1" value={zoom} onChange={(event) => onUpdate(node.id, { zoom: Number(event.target.value) })} />
              <strong>{zoom.toFixed(1)}</strong>
            </label>
          </div>
          <NodeRow label="Prompt">
            <textarea
              value={node.data.additionalPrompt || ""}
              onChange={(event) => onUpdate(node.id, { additionalPrompt: event.target.value })}
              placeholder="Optional extra instruction"
            />
          </NodeRow>
          {node.data.resultUrl && (
            <div className="camera-generated-preview">
              <img src={node.data.resultUrl} alt="Qwen camera edit result" />
            </div>
          )}
          {node.data.error && <small className="upload-error">{node.data.error}</small>}
          <button className="run-node-button" onClick={() => onRun(node)} disabled={running || !imageInputUrl}>
            {running ? "Running Camera..." : "Run Camera Edit"}
          </button>
        </details>
      </div>
    );
  }

  if (node.type === "transfer") {
    const transferImages = Array.isArray(node.data.transferImages) ? node.data.transferImages : [];
    const canAddImages = !node.data.locked && transferImages.length < maxTransferImages;
    const hasTransferOutput = node.data.activated && node.data.resultUrl;
    const outputConnected = connectedPortKeys.has(`${node.id}:${outputPort.id}`);
    return (
      <div className="node-body style-node-body">
        {hasTransferOutput || outputConnected ? (
          <OutputPortRow node={node} port={outputPort} label={moodBoardOutputFileName} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        ) : (
          <div className="style-output-placeholder">Lock mood board to enable output</div>
        )}

        <StyleCollage
          images={transferImages}
          locked={node.data.locked}
          outputUrl={hasTransferOutput ? node.data.resultUrl : ""}
          outputLabel={moodBoardOutputFileName}
          onRemove={(imageId) => onTransferImageRemove(node.id, imageId)}
          onDropImages={(files) => onTransferImagesUpload(node, files)}
        />

        <div className="style-actions">
          <label className={`style-upload-button ${!canAddImages ? "disabled" : ""}`}>
            <FileImage size={16} />
            <span>{transferImages.length ? "Add images" : "Upload images"}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!canAddImages} onChange={(event) => onTransferImagesUpload(node, event.target.files)} />
          </label>
          <button
            className={`style-lock-button ${node.data.locked ? "locked" : ""}`}
            onClick={() => (node.data.locked ? onTransferUnlock(node.id) : onTransferActivate(node))}
            disabled={transferCompiling || (!node.data.locked && !transferImages.length)}
            title={node.data.locked ? "Unlock mood board" : `Compile ${moodBoardOutputFileName}`}
          >
            {node.data.locked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </div>

        <div className="style-meta">
          <span>{transferImages.length}/{maxTransferImages}</span>
          <span>{transferCompiling ? "Compiling..." : node.data.locked ? "Locked" : "Editable"}</span>
        </div>
        {node.data.fileName && <small>{node.data.fileName}</small>}
        {node.data.status === "uploading" && <small className="upload-status">Uploading...</small>}
        {node.data.error && <small className="upload-error">{node.data.error}</small>}
        {hasTransferOutput && <button className="preview-resize-handle mood-board-resize-handle" onPointerDown={(event) => onPreviewResizeStart(event, node, "moodBoardScale")} title="Resize mood board" />}
      </div>
    );
  }

  if (node.type === "style") {
    const selectedPreset = node.data.stylePreset || "None";
    const styleSelected = selectedPreset !== "None";

    return (
      <div className="node-body style-only-node-body">
        {styleSelected ? (
          <OutputPortRow
            node={node}
            port={outputPort}
            label={selectedPreset}
            onConnectStart={onConnectStart}
            onDisconnectInput={onDisconnectInput}
            connectedPortKeys={connectedPortKeys}
          />
        ) : (
          <div className="style-output-placeholder">Choose style to enable output</div>
        )}

        <div className="style-preset-row">
          <span>Style</span>
          <select value={selectedPreset} onChange={(event) => onUpdate(node.id, { stylePreset: event.target.value })}>
            {stylePresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (node.type === "preview") {
    const previewItems = connectedPreviewSources(incoming.sourceIn);
    const previewIndex = previewSelectedIndexForNode(node, previewItems);
    const previewSource = previewItems[previewIndex] || null;
    const canStepPreview = previewItems.length > 1;
    const sourcePort = config.input.find((port) => port.id === "sourceIn");
    function stepPreview(direction) {
      if (!previewItems.length) return;
      const nextIndex = (previewIndex + direction + previewItems.length) % previewItems.length;
      onUpdate(node.id, { previewSelectedIndex: nextIndex });
    }

    return (
      <div className="node-body preview-node-body">
        <NodeRow label="Source" inputPort={sourcePort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
          <button className={previewSource ? "connected-field" : ""}>{previewSource ? previewSource.label : "Connect media"}</button>
        </NodeRow>
        <div className={`preview-stage ${previewSource ? "has-preview" : ""}`}>
          {previewSource?.type === "image" && <img src={previewSource.url} alt={previewSource.label} />}
          {previewSource?.type === "video" && <video src={previewSource.url} controls loop data-preview-video-node-id={node.id} />}
          {previewSource?.type === "model3d" && <Model3DViewer url={previewSource.url} label={previewSource.label} />}
          {!previewSource && <span>Preview will appear here</span>}
        </div>
        {canStepPreview && (
          <div className="preview-frame-nav">
            <button onClick={() => stepPreview(-1)} title="Previous preview" aria-label="Previous preview">
              <ChevronLeft size={15} />
            </button>
            <span>{previewIndex + 1} / {previewItems.length}</span>
            <button onClick={() => stepPreview(1)} title="Next preview" aria-label="Next preview">
              <ChevronRight size={15} />
            </button>
          </div>
        )}
        <button className="preview-resize-handle" onPointerDown={(event) => onPreviewResizeStart(event, node)} title="Resize preview" />
      </div>
    );
  }

  if (node.type === "utility") {
    const mode = utilityMode(node);
    const isVideoMode = mode === "video";
    const settingsOpen = Boolean(node.data.settingsOpen);
    const imagePort = config.input.find((port) => port.id === "imageIn");
    const promptPort = config.input.find((port) => port.id === "promptIn");
    const referenceImagePort = config.input.find((port) => port.id === "referenceImageIn");
    const referenceVideoPort = config.input.find((port) => port.id === "referenceVideoIn");
    const maskVideoPort = config.input.find((port) => port.id === "maskVideoIn");
    const utilityImageModel = normalizedUtilityImageModelName(node.data.utilityImageModel);
    const utilityVideoModel = normalizedUtilityVideoModelName(node.data.utilityVideoModel);
    const isColorIdMatte = isUtilityColorIdMatteModel(utilityImageModel);
    const isDepthAnything = isDepthAnythingModel(utilityImageModel);
    const isPatina = isPatinaModel(utilityImageModel);
    const isStillFrame = isUtilityStillFrameModel(utilityImageModel);
    const isSam3Image = isUtilitySam3ImageModel(utilityImageModel);
    const isBirefnetImage = isUtilityBirefnetImageModel(utilityImageModel);
    const isSam3Video = isUtilitySam3VideoModel(utilityVideoModel);
    const isVoidVideo = isUtilityVoidVideoModel(utilityVideoModel);
    const isBirefnetVideo = isUtilityBirefnetVideoModel(utilityVideoModel);
    const isRifeVideo = isUtilityRifeVideoModel(utilityVideoModel);
    const isExtractFrameVideo = isUtilityExtractFrameVideoModel(utilityVideoModel);
    const isColorIdMatteVideo = isUtilityColorIdMatteModel(utilityVideoModel);
    const isCompositeVideo = isUtilityCompositeVideoModel(utilityVideoModel);
    const isWanVaceMaskToVideo = isUtilityWanVaceMaskToVideoModel(utilityVideoModel);
    const isWanVaceInpaintingVideo = isUtilityWanVaceInpaintingModel(utilityVideoModel);
    const isWanVaceVideo = isWanVaceMaskToVideo || isWanVaceInpaintingVideo;
    const isBytedanceUpscaler = isUtilityBytedanceUpscalerModel(utilityVideoModel);
    const isTopazUpscaler = isUtilityTopazUpscalerModel(utilityVideoModel);
    const isVideoUpscaler = isUtilityVideoUpscalerModel(utilityVideoModel);
    const utilityOutputMediaType = isVideoMode ? utilityVideoOutputType(utilityVideoModel) : "image";
    const stillFrameVideoUrl = isStillFrame ? connectedAssetUrls(incoming.referenceVideoIn).at(-1) || "" : "";
    const utilityOutputPort = {
      ...config.output[0],
      label: utilityOutputMediaType === "video" ? "Video output" : "Image output",
      color: utilityOutputMediaType === "video" ? portColors.video : portColors.image
    };
    const promptValue = resolvedPromptText(incoming.promptIn) || node.data.prompt || "";
    const promptConnected = Boolean(resolvedPromptText(incoming.promptIn));
    const collapsedPorts = isVideoMode
      ? utilityInputPortIds("video", utilityImageModel, utilityVideoModel)
          .map((portId) => config.input.find((port) => port.id === portId))
          .filter(Boolean)
      : utilityInputPortIds("image", utilityImageModel, utilityVideoModel)
          .map((portId) => config.input.find((port) => port.id === portId))
          .filter(Boolean);
    const resultType = node.data.resultType || utilityOutputMediaType;
    const hasRequiredReferenceVideo = isWanVaceMaskToVideo ? true : Boolean(incoming.referenceVideoIn?.length);
    const canRun = isVideoMode
      ? hasRequiredReferenceVideo &&
        (isBirefnetVideo ||
          isRifeVideo ||
          isExtractFrameVideo ||
          isColorIdMatteVideo ||
          isCompositeVideo ||
          isWanVaceMaskToVideo ||
          isVideoUpscaler ||
          Boolean(promptValue.trim())) &&
        (!isColorIdMatteVideo || colorIdMatteRunColors(node.data).length > 0) &&
        (!isCompositeVideo || Boolean(incoming.maskVideoIn?.length) && (incoming.referenceVideoIn?.length || 0) >= 2) &&
        (!isWanVaceInpaintingVideo || Boolean(incoming.maskVideoIn?.length) && Boolean(promptValue.trim())) &&
        (!isWanVaceMaskToVideo || Boolean(incoming.maskVideoIn?.length) && Boolean(incoming.referenceImageIn?.length) && Boolean(promptValue.trim()))
      : isStillFrame
        ? Boolean(incoming.referenceVideoIn?.length)
        : Boolean(incoming.imageIn?.length) && (!isSam3Image || Boolean(promptValue.trim())) && (!isColorIdMatte || colorIdMatteRunColors(node.data).length > 0);
    const utilityRunLabel = isVideoMode
      ? isSam3Video
        ? "Run SAM 3 Video"
        : isVoidVideo
          ? "Run VOID"
          : isBirefnetVideo
            ? "Run BiRefNet Video"
            : isRifeVideo
              ? "Run RIFE"
              : isExtractFrameVideo
                ? "Extract Frame"
                : isColorIdMatteVideo
                  ? "Run Color Matte"
                  : isCompositeVideo
                    ? "Composite Video"
                    : isWanVaceMaskToVideo
                      ? "Run Mask-to-Video"
                      : isWanVaceInpaintingVideo
                        ? "Run Wan VACE"
                      : isBytedanceUpscaler
                        ? "Run Bytedance Upscale"
                        : isTopazUpscaler
                          ? "Run Topaz Upscale"
                          : "Run Wan Fun Control"
      : isColorIdMatte
        ? "Run Color Matte"
        : isSam3Image
        ? "Run SAM 3 Image"
        : isBirefnetImage
          ? "Run BiRefNet Image"
          : isStillFrame
            ? "Grab Still"
            : isPatina
              ? "Run Patina"
              : isDepthAnything
                ? "Run Depth Map"
                : "Run DWPose";
    const utilityDescription = utilityModelDescription(isVideoMode ? utilityVideoModel : utilityImageModel);
    const referenceVideoLabel = isCompositeVideo
      ? "Base + Layer"
      : isWanVaceMaskToVideo
        ? "Source Video"
        : isSam3Video || isBirefnetVideo || isRifeVideo || isExtractFrameVideo || isColorIdMatteVideo || isWanVaceInpaintingVideo || isVideoUpscaler
          ? "Video"
          : isVoidVideo
            ? "Source Video"
            : "Control Video";
    const referenceVideoPlaceholder = isCompositeVideo ? "Add 2 videos" : isWanVaceMaskToVideo ? "Optional video" : "Add video";

    function setMode(nextMode) {
      if (mode === nextMode) return;
      const nextResultType = nextMode === "video" ? utilityVideoOutputType(utilityVideoModel) : "image";
      onUpdate(node.id, {
        utilityMode: nextMode,
        resultUrl: "",
        resultItems: [],
        selectedResultIndex: 0,
        resultText: "",
        resultType: nextResultType,
        status: "ready",
        error: ""
      });
    }

    function togglePatinaMap(mapId) {
      const currentMaps = patinaMapsForData(node.data);
      if (currentMaps.length === 1 && currentMaps.includes(mapId)) return;
      const nextMaps = currentMaps.includes(mapId) ? currentMaps.filter((item) => item !== mapId) : [...currentMaps, mapId];
      onUpdate(node.id, { patinaMaps: nextMaps });
    }

    return (
      <div className="node-body model-node-body utility-node-body">
        <div className="utility-mode-tabs" role="tablist" aria-label="Utility mode">
          <button className={mode === "image" ? "active" : ""} type="button" role="tab" aria-selected={mode === "image"} onClick={() => setMode("image")}>
            Image
          </button>
          <button className={mode === "video" ? "active" : ""} type="button" role="tab" aria-selected={mode === "video"} onClick={() => setMode("video")}>
            Video
          </button>
        </div>
        <ResultPane
          label="Results will appear here"
          resultUrl={node.data.resultUrl}
          resultItems={node.data.resultItems}
          selectedIndex={node.data.selectedResultIndex}
          type={resultType}
          status={node.data.status}
          error={node.data.error}
          onSelectResult={(index, item) => onUpdate(node.id, { selectedResultIndex: index, resultUrl: item.url })}
        />
        <OutputPortRow node={node} port={utilityOutputPort} label={utilityOutputPort.label} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        {!settingsOpen && (
          <div className="model-input-port-stack utility-input-port-stack" aria-label="Utility inputs">
            {collapsedPorts.filter(Boolean).map((port) => (
              <PortHandle
                key={port.id}
                node={node}
                port={port}
                side="input"
                onConnectStart={onConnectStart}
                onDisconnectInput={onDisconnectInput}
                connectedPortKeys={connectedPortKeys}
              />
            ))}
          </div>
        )}
        <button className="run-node-button" onClick={() => onRun(node)} disabled={running || !canRun}>
          {running ? (isVideoMode ? "Running Video..." : isStillFrame ? "Grabbing Still..." : "Running Image...") : utilityRunLabel}
        </button>
        <details className="model-settings-drawer" open={settingsOpen} onToggle={(event) => onUpdate(node.id, { settingsOpen: event.currentTarget.open })}>
          <summary>{isVideoMode ? "Video" : "Image"}</summary>
          {isVideoMode ? (
            <>
              <NodeRow label="Model">
                <select value={utilityVideoModel} onChange={(event) => onUpdate(node.id, { utilityVideoModel: event.target.value, resultUrl: "", resultItems: [], resultType: utilityVideoOutputType(event.target.value), error: "" })}>
                  <option>{utilityVideoModelNames.wanFunControl}</option>
                  <option>{utilityVideoModelNames.extractFrame}</option>
                  <option>{utilityVideoModelNames.colorIdMatte}</option>
                  <option>{utilityVideoModelNames.compositeVideo}</option>
                  <option>{utilityVideoModelNames.voidVideoInpainting}</option>
                  <option>{utilityVideoModelNames.birefnetVideo}</option>
                  <option>{utilityVideoModelNames.rifeVideo}</option>
                  <option>{utilityVideoModelNames.bytedanceUpscaler}</option>
                  <option>{utilityVideoModelNames.topazUpscaler}</option>
                  <option>{utilityVideoModelNames.sam3Video}</option>
                </select>
              </NodeRow>
              {!isBirefnetVideo && !isRifeVideo && !isExtractFrameVideo && !isColorIdMatteVideo && !isCompositeVideo && !isVideoUpscaler && (
                <NodeRow label="Prompt" inputPort={settingsOpen ? promptPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <textarea className={promptConnected ? "connected-field" : ""} value={promptValue} readOnly={promptConnected} onChange={(event) => onUpdate(node.id, { prompt: event.target.value })} />
                </NodeRow>
              )}
              {!isSam3Video && !isBirefnetVideo && !isRifeVideo && !isExtractFrameVideo && !isColorIdMatteVideo && !isCompositeVideo && !isWanVaceVideo && !isVideoUpscaler && (
                <NodeRow label="Generations">
                  <select value={node.data.batchCount || "1"} onChange={(event) => onUpdate(node.id, { batchCount: event.target.value })}>
                    {batchOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatNodeBatchCount(option)}
                      </option>
                    ))}
                  </select>
                </NodeRow>
              )}
              <NodeRow label={referenceVideoLabel} inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceVideoIn, referenceVideoPlaceholder)}</button>
              </NodeRow>
              {isSam3Video ? (
                <NodeRow label="Threshold">
                  <input type="number" min="0" max="1" step="0.05" value={node.data.sam3VideoDetectionThreshold ?? 0.5} onChange={(event) => onUpdate(node.id, { sam3VideoDetectionThreshold: event.target.value })} />
                </NodeRow>
              ) : isExtractFrameVideo ? (
                <ExtractFrameControls videoUrl={connectedAssetUrls(incoming.referenceVideoIn).at(-1)} node={node} onUpdate={onUpdate} />
              ) : isColorIdMatteVideo ? (
                <ColorIdMatteVideoPicker videoUrl={connectedAssetUrls(incoming.referenceVideoIn).at(-1)} node={node} onUpdate={onUpdate} />
              ) : isCompositeVideo ? (
                <CompositeVideoControls incoming={incoming} maskVideoPort={maskVideoPort} settingsOpen={settingsOpen} node={node} onUpdate={onUpdate} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
              ) : isWanVaceVideo ? (
                <WanVaceInpaintingControls
                  incoming={incoming}
                  referenceImagePort={referenceImagePort}
                  maskVideoPort={maskVideoPort}
                  settingsOpen={settingsOpen}
                  node={node}
                  onUpdate={onUpdate}
                  onConnectStart={onConnectStart}
                  onDisconnectInput={onDisconnectInput}
                  connectedPortKeys={connectedPortKeys}
                />
              ) : isVoidVideo ? (
                <>
                  <NodeRow label="Mask Video" inputPort={settingsOpen ? maskVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                    <button className={incoming.maskVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.maskVideoIn, "Optional mask")}</button>
                  </NodeRow>
                  <NodeRow label="Mask Prompt">
                    <textarea value={node.data.voidMaskPrompt || ""} onChange={(event) => onUpdate(node.id, { voidMaskPrompt: event.target.value })} placeholder="Object to remove" />
                  </NodeRow>
                  <NodeRow label="Pass 2">
                    <button className={`node-toggle ${node.data.voidPass2Refinement ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { voidPass2Refinement: !node.data.voidPass2Refinement })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Negative">
                    <textarea value={node.data.voidNegativePrompt || ""} onChange={(event) => onUpdate(node.id, { voidNegativePrompt: event.target.value })} placeholder="Optional negative prompt" />
                  </NodeRow>
                  <NodeRow label="Steps">
                    <input type="number" min="1" max="80" value={node.data.voidNumInferenceSteps || 30} onChange={(event) => onUpdate(node.id, { voidNumInferenceSteps: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Guidance">
                    <input type="number" min="0" max="20" step="0.1" value={node.data.voidGuidanceScale || 1} onChange={(event) => onUpdate(node.id, { voidGuidanceScale: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Strength">
                    <input type="number" min="0" max="1" step="0.05" value={node.data.voidStrength || 1} onChange={(event) => onUpdate(node.id, { voidStrength: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Frames">
                    <select value={String(normalizeVoidVideoFrameCount(node.data.voidNumFrames))} onChange={(event) => onUpdate(node.id, { voidNumFrames: event.target.value })}>
                      {voidVideoFrameOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Safety">
                    <button className={`node-toggle ${node.data.voidEnableSafetyChecker !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { voidEnableSafetyChecker: node.data.voidEnableSafetyChecker === false })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Seed">
                    <input value={node.data.voidSeed || ""} onChange={(event) => onUpdate(node.id, { voidSeed: event.target.value })} placeholder="Random" />
                  </NodeRow>
                </>
              ) : isRifeVideo ? (
                <>
                  <NodeRow label="In-betweens">
                    <input type="number" min="1" max="8" value={node.data.rifeNumFrames || 1} onChange={(event) => onUpdate(node.id, { rifeNumFrames: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Scene Detect">
                    <button className={`node-toggle ${node.data.rifeUseSceneDetection !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { rifeUseSceneDetection: node.data.rifeUseSceneDetection === false })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Auto FPS">
                    <button className={`node-toggle ${node.data.rifeUseCalculatedFps !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { rifeUseCalculatedFps: node.data.rifeUseCalculatedFps === false })}>
                      <span />
                    </button>
                  </NodeRow>
                  {node.data.rifeUseCalculatedFps === false && (
                    <NodeRow label="FPS">
                      <input type="number" min="1" max="120" value={node.data.rifeFps || 24} onChange={(event) => onUpdate(node.id, { rifeFps: event.target.value })} />
                    </NodeRow>
                  )}
                  <NodeRow label="Loop">
                    <button className={`node-toggle ${node.data.rifeLoop ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { rifeLoop: !node.data.rifeLoop })}>
                      <span />
                    </button>
                  </NodeRow>
                </>
              ) : isBytedanceUpscaler ? (
                <>
                  <NodeRow label="Resolution">
                    <select value={node.data.bytedanceUpscalerTargetResolution || "1080p"} onChange={(event) => onUpdate(node.id, { bytedanceUpscalerTargetResolution: event.target.value })}>
                      {bytedanceUpscalerResolutionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === "2k" ? "2K" : option === "4k" ? "4K" : "1080p"}
                        </option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="FPS">
                    <select value={node.data.bytedanceUpscalerTargetFps || "30fps"} onChange={(event) => onUpdate(node.id, { bytedanceUpscalerTargetFps: event.target.value })}>
                      {bytedanceUpscalerFpsOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Preset">
                    <select value={node.data.bytedanceUpscalerPreset || "general"} onChange={(event) => onUpdate(node.id, { bytedanceUpscalerPreset: event.target.value })}>
                      {bytedanceUpscalerPresetOptions.map((option) => (
                        <option key={option} value={option}>
                          {option.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Tier">
                    <select value={node.data.bytedanceUpscalerTier || "standard"} onChange={(event) => onUpdate(node.id, { bytedanceUpscalerTier: event.target.value })}>
                      {bytedanceUpscalerTierOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Fidelity">
                    <select value={node.data.bytedanceUpscalerFidelity || "high"} onChange={(event) => onUpdate(node.id, { bytedanceUpscalerFidelity: event.target.value })}>
                      {bytedanceUpscalerFidelityOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Scale Ratio">
                    <input type="number" min="1.1" max="10" step="0.1" value={node.data.bytedanceUpscalerScaleRatio || ""} onChange={(event) => onUpdate(node.id, { bytedanceUpscalerScaleRatio: event.target.value })} placeholder="Auto" />
                  </NodeRow>
                </>
              ) : isTopazUpscaler ? (
                <>
                  <NodeRow label="Topaz Model">
                    <select value={node.data.topazUpscalerModel || "Proteus"} onChange={(event) => onUpdate(node.id, { topazUpscalerModel: event.target.value })}>
                      {topazUpscalerModelOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Upscale">
                    <input type="number" min="1" max="8" step="0.25" value={node.data.topazUpscalerFactor || 2} onChange={(event) => onUpdate(node.id, { topazUpscalerFactor: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Target FPS">
                    <select value={node.data.topazUpscalerTargetFps || "source"} onChange={(event) => onUpdate(node.id, { topazUpscalerTargetFps: event.target.value })}>
                      {topazUpscalerFpsOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === "source" ? "Source" : option}
                        </option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Billing Tier">
                    <select value={node.data.topazUpscalerBillingTier || "auto"} onChange={(event) => onUpdate(node.id, { topazUpscalerBillingTier: event.target.value })}>
                      {topazUpscalerBillingTierOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="H264">
                    <button className={`node-toggle ${node.data.topazUpscalerH264Output ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { topazUpscalerH264Output: !node.data.topazUpscalerH264Output })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Compression">
                    <input type="number" min="0" max="1" step="0.05" value={node.data.topazUpscalerCompression ?? ""} onChange={(event) => onUpdate(node.id, { topazUpscalerCompression: event.target.value })} placeholder="Auto" />
                  </NodeRow>
                  <NodeRow label="Noise">
                    <input type="number" min="0" max="1" step="0.05" value={node.data.topazUpscalerNoise ?? ""} onChange={(event) => onUpdate(node.id, { topazUpscalerNoise: event.target.value })} placeholder="Auto" />
                  </NodeRow>
                  <NodeRow label="Halo">
                    <input type="number" min="0" max="1" step="0.05" value={node.data.topazUpscalerHalo ?? ""} onChange={(event) => onUpdate(node.id, { topazUpscalerHalo: event.target.value })} placeholder="Auto" />
                  </NodeRow>
                  <NodeRow label="Grain">
                    <input type="number" min="0" max="0.1" step="0.01" value={node.data.topazUpscalerGrain ?? ""} onChange={(event) => onUpdate(node.id, { topazUpscalerGrain: event.target.value })} placeholder="Auto" />
                  </NodeRow>
                  <NodeRow label="Detail">
                    <input type="number" min="0" max="1" step="0.05" value={node.data.topazUpscalerRecoverDetail ?? ""} onChange={(event) => onUpdate(node.id, { topazUpscalerRecoverDetail: event.target.value })} placeholder="Auto" />
                  </NodeRow>
                </>
              ) : isBirefnetVideo ? (
                <>
                  <NodeRow label="BiRefNet">
                    <select value={node.data.birefnetModel || "General Use (Light)"} onChange={(event) => onUpdate(node.id, { birefnetModel: event.target.value })}>
                      {birefnetModelOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Resolution">
                    <select value={node.data.birefnetOperatingResolution || "1024x1024"} onChange={(event) => onUpdate(node.id, { birefnetOperatingResolution: event.target.value })}>
                      {birefnetResolutionOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Output Mask">
                    <button className={`node-toggle ${node.data.birefnetOutputMask ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { birefnetOutputMask: !node.data.birefnetOutputMask })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Refine">
                    <button className={`node-toggle ${node.data.birefnetRefineForeground !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { birefnetRefineForeground: node.data.birefnetRefineForeground === false })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Output Type">
                    <select value={node.data.birefnetVideoOutputType || "X264 (.mp4)"} onChange={(event) => onUpdate(node.id, { birefnetVideoOutputType: event.target.value })}>
                      <option>X264 (.mp4)</option>
                      <option>VP9 (.webm)</option>
                      <option>PRORES4444 (.mov)</option>
                      <option>GIF (.gif)</option>
                    </select>
                  </NodeRow>
                  <NodeRow label="Quality">
                    <select value={node.data.birefnetVideoQuality || "high"} onChange={(event) => onUpdate(node.id, { birefnetVideoQuality: event.target.value })}>
                      <option>low</option>
                      <option>medium</option>
                      <option>high</option>
                      <option>maximum</option>
                    </select>
                  </NodeRow>
                  <NodeRow label="Write Mode">
                    <select value={node.data.birefnetVideoWriteMode || "balanced"} onChange={(event) => onUpdate(node.id, { birefnetVideoWriteMode: event.target.value })}>
                      <option>fast</option>
                      <option>balanced</option>
                      <option>small</option>
                    </select>
                  </NodeRow>
                </>
              ) : (
                <>
                  <NodeRow label="Reference Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                    <button className={incoming.referenceImageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceImageIn, "Optional image")}</button>
                  </NodeRow>
                  <NodeRow label="Preprocess">
                    <button className={`node-toggle ${node.data.preprocessVideo !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { preprocessVideo: node.data.preprocessVideo === false })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Type">
                    <select value={node.data.preprocessType || "depth"} onChange={(event) => onUpdate(node.id, { preprocessType: event.target.value })}>
                      <option value="depth">Depth</option>
                      <option value="pose">Pose</option>
                    </select>
                  </NodeRow>
                  <NodeRow label="Match Frames">
                    <button className={`node-toggle ${node.data.matchInputNumFrames !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { matchInputNumFrames: node.data.matchInputNumFrames === false })}>
                      <span />
                    </button>
                  </NodeRow>
                  {node.data.matchInputNumFrames === false && (
                    <NodeRow label="Frames">
                      <input type="number" min="1" max="241" value={node.data.numFrames || 81} onChange={(event) => onUpdate(node.id, { numFrames: event.target.value })} />
                    </NodeRow>
                  )}
                  <NodeRow label="Match FPS">
                    <button className={`node-toggle ${node.data.matchInputFps !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { matchInputFps: node.data.matchInputFps === false })}>
                      <span />
                    </button>
                  </NodeRow>
                  {node.data.matchInputFps === false && (
                    <NodeRow label="FPS">
                      <input type="number" min="1" max="60" value={node.data.fps || 16} onChange={(event) => onUpdate(node.id, { fps: event.target.value })} />
                    </NodeRow>
                  )}
                  <NodeRow label="Steps">
                    <input type="number" min="1" max="60" value={node.data.numInferenceSteps || 27} onChange={(event) => onUpdate(node.id, { numInferenceSteps: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Guidance">
                    <input type="number" min="0" max="20" step="0.1" value={node.data.guidanceScale || 6} onChange={(event) => onUpdate(node.id, { guidanceScale: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Shift">
                    <input type="number" min="0" max="20" step="0.1" value={node.data.shift || 5} onChange={(event) => onUpdate(node.id, { shift: event.target.value })} />
                  </NodeRow>
                  <NodeRow label="Seed">
                    <input value={node.data.seed || ""} onChange={(event) => onUpdate(node.id, { seed: event.target.value })} placeholder="Random" />
                  </NodeRow>
                </>
              )}
            </>
          ) : (
            <>
              <NodeRow label="Model">
                <select value={utilityImageModel} onChange={(event) => onUpdate(node.id, { utilityImageModel: event.target.value, resultUrl: "", resultItems: [], resultType: "image", error: "" })}>
                  <option>{utilityImageModelNames.colorIdMatte}</option>
                  <option>{utilityImageModelNames.stillFrame}</option>
                  <option>{utilityImageModelNames.dwpose}</option>
                  <option>{utilityImageModelNames.depthAnything}</option>
                  <option>{utilityImageModelNames.patina}</option>
                  <option>{utilityImageModelNames.birefnetImage}</option>
                  <option>{utilityImageModelNames.sam3Image}</option>
                </select>
              </NodeRow>
              {isSam3Image && (
                <NodeRow label="Prompt" inputPort={settingsOpen ? promptPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <textarea className={promptConnected ? "connected-field" : ""} value={promptValue} readOnly={promptConnected} onChange={(event) => onUpdate(node.id, { prompt: event.target.value })} />
                </NodeRow>
              )}
              {isStillFrame ? (
                <>
                  <NodeRow label="Video" inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                    <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceVideoIn, "Add video")}</button>
                  </NodeRow>
                  <StillFrameScrubber videoUrl={stillFrameVideoUrl} value={node.data.stillFrameTime ?? 0} onChange={(stillFrameTime) => onUpdate(node.id, { stillFrameTime })} />
                </>
              ) : (
                <>
                  <NodeRow label="Image" inputPort={settingsOpen ? imagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                    <button className={incoming.imageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.imageIn, "Add image")}</button>
                  </NodeRow>
                  {isColorIdMatte ? (
                    <ColorIdMattePicker imageUrl={connectedAssetUrls(incoming.imageIn).at(-1)} node={node} onUpdate={onUpdate} />
                  ) : isPatina ? (
                    <>
                      {patinaMapOptions.map((option) => (
                        <NodeRow key={option.id} label={option.label}>
                          <button className={`node-toggle ${patinaMapsForData(node.data).includes(option.id) ? "enabled" : ""}`} onClick={() => togglePatinaMap(option.id)}>
                            <span />
                          </button>
                        </NodeRow>
                      ))}
                      <NodeRow label="Format">
                        <select value={node.data.patinaOutputFormat || "png"} onChange={(event) => onUpdate(node.id, { patinaOutputFormat: event.target.value })}>
                          <option value="png">PNG</option>
                          <option value="jpeg">JPEG</option>
                          <option value="webp">WebP</option>
                        </select>
                      </NodeRow>
                      <NodeRow label="Seed">
                        <input value={node.data.patinaSeed || ""} onChange={(event) => onUpdate(node.id, { patinaSeed: event.target.value })} placeholder="Random" />
                      </NodeRow>
                    </>
                  ) : isBirefnetImage ? (
                    <>
                  <NodeRow label="BiRefNet">
                    <select value={node.data.birefnetModel || "General Use (Light)"} onChange={(event) => onUpdate(node.id, { birefnetModel: event.target.value })}>
                      {birefnetModelOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Resolution">
                    <select value={node.data.birefnetOperatingResolution || "1024x1024"} onChange={(event) => onUpdate(node.id, { birefnetOperatingResolution: event.target.value })}>
                      {birefnetResolutionOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </NodeRow>
                  <NodeRow label="Output Mask">
                    <button className={`node-toggle ${node.data.birefnetOutputMask ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { birefnetOutputMask: !node.data.birefnetOutputMask })}>
                      <span />
                    </button>
                  </NodeRow>
                  <NodeRow label="Mask Only">
                    <button className={`node-toggle ${node.data.birefnetMaskOnly ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { birefnetMaskOnly: !node.data.birefnetMaskOnly })}>
                      <span />
                    </button>
                  </NodeRow>
                  {!node.data.birefnetMaskOnly && (
                    <NodeRow label="Refine">
                      <button className={`node-toggle ${node.data.birefnetRefineForeground !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { birefnetRefineForeground: node.data.birefnetRefineForeground === false })}>
                        <span />
                      </button>
                    </NodeRow>
                  )}
                  <NodeRow label="Format">
                    <select value={node.data.birefnetOutputFormat || "png"} onChange={(event) => onUpdate(node.id, { birefnetOutputFormat: event.target.value })}>
                      <option value="png">PNG</option>
                      <option value="webp">WebP</option>
                      <option value="gif">GIF</option>
                    </select>
                  </NodeRow>
                </>
              ) : isDepthAnything || isSam3Image ? null : (
                <NodeRow label="Draw Mode">
                  <select value={node.data.dwposeDrawMode || "body-pose"} onChange={(event) => onUpdate(node.id, { dwposeDrawMode: event.target.value })}>
                    <option value="body-pose">Body Pose</option>
                    <option value="full-pose">Full Pose</option>
                    <option value="face-pose">Face Pose</option>
                    <option value="hand-pose">Hand Pose</option>
                    <option value="face-hand-mask">Face + Hand Mask</option>
                    <option value="face-mask">Face Mask</option>
                    <option value="hand-mask">Hand Mask</option>
                  </select>
                </NodeRow>
              )}
            </>
          )}
            </>
          )}
        </details>
        <p className="utility-model-description">{utilityDescription}</p>
      </div>
    );
  }

  if (node.type === "model3d") {
    const viewPorts = model3DViewInputs.map((view) => ({
      ...view,
      port: config.input.find((port) => port.id === view.id)
    }));
    const settingsOpen = Boolean(node.data.settingsOpen);
    const frontInputs = [...(incoming.frontImageIn || []), ...(incoming.imageIn || [])];
    const frontConnected = Boolean(frontInputs.length);
    const generateType = normalizeModel3DGenerateType(node.data.generateType);
    const faceCount = model3DFaceCount(node.data.faceCount);

    return (
      <div className="node-body model-node-body model3d-body">
        <ResultPane
          label="Results will appear here"
          resultUrl={node.data.resultUrl}
          resultItems={node.data.resultItems}
          selectedIndex={node.data.selectedResultIndex}
          type="model3d"
          status={node.data.status}
          error={node.data.error}
          onSelectResult={(index, item) => onUpdate(node.id, { selectedResultIndex: index, resultUrl: item.url })}
        />
        <OutputPortRow node={node} port={outputPort} label="3D output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        {!settingsOpen && (
          <div className="model-input-port-stack model3d-input-port-stack" aria-label="3D model inputs">
            {viewPorts
              .map((view) => view.port)
              .filter(Boolean)
              .map((port) => (
                <PortHandle
                  key={port.id}
                  node={node}
                  port={port}
                  side="input"
                  onConnectStart={onConnectStart}
                  onDisconnectInput={onDisconnectInput}
                  connectedPortKeys={connectedPortKeys}
                />
              ))}
          </div>
        )}
        <div className="model3d-action-row">
          <label className="model3d-open-button" title="Open GLB">
            <FolderOpen size={15} />
            <span>Open</span>
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(node, file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button className="run-node-button" onClick={() => onRun(node)} disabled={running || !frontConnected}>
            {running ? "Running 3D..." : "Run 3D"}
          </button>
        </div>
        <details className="model-settings-drawer" open={settingsOpen} onToggle={(event) => onUpdate(node.id, { settingsOpen: event.currentTarget.open })}>
          <summary>Settings</summary>
          <NodeRow label="Model">
            <select value={node.data.model || model3DNames.hunyuanPro} onChange={(event) => onUpdate(node.id, { model: event.target.value })}>
              <option>{model3DNames.hunyuanPro}</option>
            </select>
          </NodeRow>
          {viewPorts.map((view) => {
            const items = view.id === "frontImageIn" ? frontInputs : incoming[view.id] || [];
            const connected = Boolean(items.length);
            return (
              <NodeRow key={view.id} label={view.label} inputPort={settingsOpen ? view.port : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button className={connected ? "connected-field" : ""}>{connectedSummary(items, view.id === "frontImageIn" ? "Add front" : "Optional")}</button>
              </NodeRow>
            );
          })}
          <NodeRow label="Mode">
            <select value={generateType} onChange={(event) => onUpdate(node.id, { generateType: event.target.value })}>
              <option>Normal</option>
              <option>Geometry</option>
            </select>
          </NodeRow>
          <NodeRow label="PBR">
            <button
              className={`node-toggle ${node.data.enablePbr && generateType !== "Geometry" ? "enabled" : ""}`}
              onClick={() => onUpdate(node.id, { enablePbr: !node.data.enablePbr })}
              disabled={generateType === "Geometry"}
              title={generateType === "Geometry" ? "PBR is ignored in Geometry mode" : "Enable PBR textures"}
            >
              <span />
            </button>
          </NodeRow>
          <NodeRow label="Faces">
            <input
              type="number"
              min="40000"
              max="1500000"
              step="10000"
              value={faceCount}
              onChange={(event) => onUpdate(node.id, { faceCount: event.target.value })}
            />
          </NodeRow>
        </details>
        <p className="utility-model-description">{model3DDescription}</p>
      </div>
    );
  }

  if (node.type === "imageModel") {
    const promptValue = resolvedPromptText(incoming.promptIn) || node.data.prompt;
    const promptConnected = Boolean(resolvedPromptText(incoming.promptIn));
    const isSam3Image = isSam3ImageModel(node.data.model);
    const imageInstructionSources = [...(incoming.cameraIn || []), ...(incoming.styleIn || []), ...(incoming.transferIn || []), ...(incoming.characterIn || [])];
    const effectivePromptValue = isSam3Image ? promptValue : buildEffectiveImagePrompt(promptValue, imageInstructionSources, node.data.aspectRatio);
    const promptHasGeneratedAdditions = effectivePromptValue !== promptValue;
    const appliedInstructionLabels = activeImageInstructionLabels(imageInstructionSources);
    const characterTagMatches = isSam3Image ? [] : imageModelCharacterTagMatches(promptValue, incoming.characterIn);
    const imagePromptLabel = connectedSummary(incoming.imagePromptIn, "Add file");
    const cameraPromptLabel = connectedSummary(incoming.cameraIn, "Add camera");
    const stylePromptLabel = connectedSummary(incoming.styleIn, "Add style");
    const transferPromptLabel = connectedSummary(incoming.transferIn, "Add mood board");
    const characterPromptLabel = connectedSummary(incoming.characterIn, "Add character");
    const promptPort = config.input.find((port) => port.id === "promptIn");
    const imagePromptPort = config.input.find((port) => port.id === "imagePromptIn");
    const cameraPort = config.input.find((port) => port.id === "cameraIn");
    const stylePort = config.input.find((port) => port.id === "styleIn");
    const transferPort = config.input.find((port) => port.id === "transferIn");
    const characterPort = config.input.find((port) => port.id === "characterIn");
    const settingsOpen = Boolean(node.data.settingsOpen);
    const collapsedPorts = isSam3Image ? [promptPort, imagePromptPort] : [promptPort, imagePromptPort, cameraPort, stylePort, transferPort, characterPort];
    return (
      <div className="node-body model-node-body image-model-body">
        <ResultPane
          label="Results will appear here"
          resultUrl={node.data.resultUrl}
          resultItems={node.data.resultItems}
          selectedIndex={node.data.selectedResultIndex}
          type="image"
          status={node.data.status}
          error={node.data.error}
          onSelectResult={(index, item) => onUpdate(node.id, { selectedResultIndex: index, resultUrl: item.url })}
        />
        <OutputPortRow node={node} port={outputPort} label="Image output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        {!settingsOpen && (
          <div className="model-input-port-stack image-model-input-port-stack" aria-label="Image model inputs">
            {collapsedPorts.filter(Boolean).map((port) => (
              <PortHandle
                key={port.id}
                node={node}
                port={port}
                side="input"
                onConnectStart={onConnectStart}
                onDisconnectInput={onDisconnectInput}
                connectedPortKeys={connectedPortKeys}
              />
            ))}
          </div>
        )}
        <button className="run-node-button" onClick={() => onRun(node)} disabled={running}>
          {running ? `Running ${formatNodeBatchCount(isSam3Image ? 1 : node.data.batchCount)}...` : "Run Image"}
        </button>
        <details className="model-settings-drawer" open={settingsOpen} onToggle={(event) => onUpdate(node.id, { settingsOpen: event.currentTarget.open })}>
          <summary>Settings</summary>
          <NodeRow label="Prompt" inputPort={settingsOpen ? promptPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
            <TaggedPromptTextarea
              className={promptConnected ? "connected-field" : ""}
              value={promptValue}
              readOnly={promptConnected}
              tagMatches={characterTagMatches}
              onChange={(event) => onUpdate(node.id, { prompt: event.target.value })}
            />
          </NodeRow>
          {characterTagMatches.length > 0 && (
            <div className="reference-tag-chips">
              {characterTagMatches.map((match) => (
                <span key={match.nodeId} className="reference-tag-chip" style={{ "--tag-color": match.color }}>
                  @{match.tag}
                </span>
              ))}
            </div>
          )}
          {promptHasGeneratedAdditions && (
            <div className="effective-prompt-preview">
              <span>{`${appliedInstructionLabels.length === 1 ? "Active input" : "Active inputs"}: ${appliedInstructionLabels.join(" + ")}`}</span>
            </div>
          )}
          <NodeRow label="Model">
            <select value={node.data.model} onChange={(event) => onUpdate(node.id, imageModelSelectionPatch(node.data, event.target.value))}>
              <option>Nano Banana Pro</option>
              <option>OpenAI Image 2</option>
              {sam3SegmentationModelsEnabled && <option>SAM 3 Image</option>}
            </select>
          </NodeRow>
          <NodeRow label={isSam3Image ? "Image" : "Image Prompt"} inputPort={settingsOpen ? imagePromptPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
            <button className={imagePromptLabel !== "Add file" ? "connected-field" : ""}>{imagePromptLabel}</button>
          </NodeRow>
          {!isSam3Image && (
            <>
              <NodeRow label="Camera" inputPort={settingsOpen ? cameraPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button className={cameraPromptLabel !== "Add camera" ? "connected-field" : ""}>{cameraPromptLabel}</button>
              </NodeRow>
              <NodeRow label="Style" inputPort={settingsOpen ? stylePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button className={stylePromptLabel !== "Add style" ? "connected-field" : ""}>{stylePromptLabel}</button>
              </NodeRow>
              <NodeRow label="Mood Board" inputPort={settingsOpen ? transferPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button className={transferPromptLabel !== "Add mood board" ? "connected-field" : ""}>{transferPromptLabel}</button>
              </NodeRow>
              <NodeRow label="Character" inputPort={settingsOpen ? characterPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button className={characterPromptLabel !== "Add character" ? "connected-field" : ""}>{characterPromptLabel}</button>
              </NodeRow>
              <NodeRow label="Generations">
                <select value={node.data.batchCount || "1"} onChange={(event) => onUpdate(node.id, { batchCount: event.target.value })}>
                  {batchOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatNodeBatchCount(option)}
                    </option>
                  ))}
                </select>
              </NodeRow>
              <NodeRow label="Aspect Ratio">
                <select value={node.data.aspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                  {imageModelAspectRatioOptions(node.data.model).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </NodeRow>
              <NodeRow label="Resolution">
                <select value={node.data.resolution} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                  <option>2K</option>
                  <option>1K</option>
                  <option>4K</option>
                </select>
              </NodeRow>
            </>
          )}
        </details>
        {isSam3Image && <small className="upload-status model-status-note">segmentation model</small>}
      </div>
    );
  }

  const promptValue = resolvedPromptText(incoming.promptIn) || node.data.prompt;
  const promptConnected = Boolean(resolvedPromptText(incoming.promptIn));
  const promptPort = config.input.find((port) => port.id === "promptIn");
  const startFramePort = config.input.find((port) => port.id === "startFrameIn");
  const endFramePort = config.input.find((port) => port.id === "endFrameIn");
  const referenceImagePort = config.input.find((port) => port.id === "referenceImageIn");
  const referenceVideoPort = config.input.find((port) => port.id === "referenceVideoIn");
  const referenceAudioPort = config.input.find((port) => port.id === "referenceAudioIn");
  const characterPort = config.input.find((port) => port.id === "characterIn");
  const isWanFunControl = isWanFunControlModel(node.data.model);
  const isWan27Reference = isWan27ReferenceModel(node.data.model);
  const isAurora = isAuroraModel(node.data.model);
  const isHappyHorse = isHappyHorseModel(node.data.model);
  const isSam3Video = isSam3VideoModel(node.data.model);
  const wan27Duration = normalizedWan27ReferenceDurationLabel(node.data.duration);
  const wan27Resolution = normalizedWan27ReferenceResolution(node.data.resolution);
  const wan27AspectRatio = normalizedWan27ReferenceAspectRatio(node.data.aspectRatio);
  const happyHorseDuration = normalizedHappyHorseDurationLabel(node.data.duration);
  const happyHorseResolution = normalizedHappyHorseResolution(node.data.resolution);
  const happyHorseAspectRatio = normalizedHappyHorseAspectRatio(node.data.aspectRatio);
  const happyHorseReferenceImageCount = Math.min(incoming.referenceImageIn?.length || 0, 9);
  const wan27ReferenceImageCount = incoming.referenceImageIn?.length || 0;
  const wan27ReferenceVideoCount = incoming.referenceVideoIn?.length || 0;
  const tagMatches = isWanFunControl || isAurora || isSam3Video ? [] : videoModelReferenceTagMatches(promptValue, incoming);
  const characterConnected = Boolean(incoming.characterIn?.length);
  const settingsOpen = Boolean(node.data.settingsOpen);
  const collapsedPorts = isWanFunControl
    ? [promptPort, referenceVideoPort, referenceImagePort, characterPort]
    : isWan27Reference
      ? [promptPort, referenceImagePort, referenceVideoPort, characterPort]
    : isAurora
      ? [promptPort, referenceImagePort, referenceAudioPort, characterPort]
      : isHappyHorse
        ? [promptPort, referenceImagePort, characterPort]
    : isSam3Video
      ? [promptPort, referenceVideoPort]
      : [promptPort, startFramePort, endFramePort, referenceImagePort, referenceVideoPort, referenceAudioPort, characterPort];
  return (
    <div className="node-body model-node-body video-model-body">
      <ResultPane
        label="Results will appear here"
        resultUrl={node.data.resultUrl}
        resultItems={node.data.resultItems}
        selectedIndex={node.data.selectedResultIndex}
        type="video"
        status={node.data.status}
        error={node.data.error}
        onSelectResult={(index, item) => onUpdate(node.id, { selectedResultIndex: index, resultUrl: item.url })}
      />
      <button className="run-node-button" onClick={() => onRun(node)} disabled={running}>
        {running ? `Running ${formatNodeBatchCount(isSam3Video ? 1 : node.data.batchCount)}...` : "Run Video"}
      </button>
      <OutputPortRow node={node} port={outputPort} label="Video output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
      {!settingsOpen && (
        <div className="model-input-port-stack video-model-input-port-stack" aria-label="Video model inputs">
          {collapsedPorts.filter(Boolean).map((port) => (
            <PortHandle
              key={port.id}
              node={node}
              port={port}
              side="input"
              onConnectStart={onConnectStart}
              onDisconnectInput={onDisconnectInput}
              connectedPortKeys={connectedPortKeys}
            />
          ))}
        </div>
      )}
      <details className="model-settings-drawer" open={settingsOpen} onToggle={(event) => onUpdate(node.id, { settingsOpen: event.currentTarget.open })}>
        <summary>Settings</summary>
        <NodeRow label="Model">
          <select value={node.data.model} onChange={(event) => onUpdate(node.id, videoModelSelectionPatch(node.data, event.target.value))}>
            <option>{videoModelNames.seedance}</option>
            <option>{videoModelNames.seedanceFast}</option>
            <option>{videoModelNames.wan27Reference}</option>
            <option>{videoModelNames.happyHorse}</option>
            <option>{videoModelNames.aurora}</option>
            {sam3SegmentationModelsEnabled && <option>{videoModelNames.sam3Video}</option>}
          </select>
        </NodeRow>
        <NodeRow label="Prompt" inputPort={settingsOpen ? promptPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
          <TaggedPromptTextarea
            className={promptConnected ? "connected-field" : ""}
            value={promptValue}
            readOnly={promptConnected}
            tagMatches={tagMatches}
            onChange={(event) => onUpdate(node.id, { prompt: event.target.value })}
          />
        </NodeRow>
        {tagMatches.length > 0 && (
          <div className="reference-tag-chips">
            {tagMatches.map((match) => (
              <span key={match.nodeId} className="reference-tag-chip" style={{ "--tag-color": match.color }}>
                @{match.tag}
              </span>
            ))}
          </div>
        )}
        {characterConnected && !isSam3Video && <div className="effective-prompt-preview"><span>Character identity and selected voice instructions applied</span></div>}
        {!isSam3Video && (
          <NodeRow label="Generations">
            <select value={node.data.batchCount || "1"} onChange={(event) => onUpdate(node.id, { batchCount: event.target.value })}>
              {batchOptions.map((option) => (
                <option key={option} value={option}>
                  {formatNodeBatchCount(option)}
                </option>
              ))}
            </select>
          </NodeRow>
        )}
        {isWanFunControl ? (
          <>
            <NodeRow label="Control Video" inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceVideoIn, "Add video")}</button>
            </NodeRow>
            <NodeRow label="Reference Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceImageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceImageIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="Character" inputPort={settingsOpen ? characterPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.characterIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.characterIn, "Optional character")}</button>
            </NodeRow>
            <NodeRow label="Preprocess">
              <button className={`node-toggle ${node.data.preprocessVideo !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { preprocessVideo: node.data.preprocessVideo === false })}>
                <span />
              </button>
            </NodeRow>
            <NodeRow label="Type">
              <select value={node.data.preprocessType || "depth"} onChange={(event) => onUpdate(node.id, { preprocessType: event.target.value })}>
                <option value="depth">Depth</option>
                <option value="pose">Pose</option>
              </select>
            </NodeRow>
            <NodeRow label="Match Frames">
              <button className={`node-toggle ${node.data.matchInputNumFrames !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { matchInputNumFrames: node.data.matchInputNumFrames === false })}>
                <span />
              </button>
            </NodeRow>
            {node.data.matchInputNumFrames === false && (
              <NodeRow label="Frames">
                <input type="number" min="1" max="241" value={node.data.numFrames || 81} onChange={(event) => onUpdate(node.id, { numFrames: event.target.value })} />
              </NodeRow>
            )}
            <NodeRow label="Match FPS">
              <button className={`node-toggle ${node.data.matchInputFps !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { matchInputFps: node.data.matchInputFps === false })}>
                <span />
              </button>
            </NodeRow>
            {node.data.matchInputFps === false && (
              <NodeRow label="FPS">
                <input type="number" min="1" max="60" value={node.data.fps || 16} onChange={(event) => onUpdate(node.id, { fps: event.target.value })} />
              </NodeRow>
            )}
            <NodeRow label="Steps">
              <input type="number" min="1" max="60" value={node.data.numInferenceSteps || 27} onChange={(event) => onUpdate(node.id, { numInferenceSteps: event.target.value })} />
            </NodeRow>
            <NodeRow label="Guidance">
              <input type="number" min="0" max="20" step="0.1" value={node.data.guidanceScale || 6} onChange={(event) => onUpdate(node.id, { guidanceScale: event.target.value })} />
            </NodeRow>
            <NodeRow label="Shift">
              <input type="number" min="0" max="20" step="0.1" value={node.data.shift || 5} onChange={(event) => onUpdate(node.id, { shift: event.target.value })} />
            </NodeRow>
            <NodeRow label="Seed">
              <input value={node.data.seed || ""} onChange={(event) => onUpdate(node.id, { seed: event.target.value })} placeholder="Random" />
            </NodeRow>
          </>
        ) : isWan27Reference ? (
          <>
            <NodeRow label="Reference Images" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceImageIn?.length ? "connected-field" : ""}>{`Add Images ( ${wan27ReferenceImageCount} )`}</button>
            </NodeRow>
            <NodeRow label="Reference Videos" inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{`Add Videos ( ${wan27ReferenceVideoCount} )`}</button>
            </NodeRow>
            <NodeRow label="Negative">
              <textarea value={node.data.negativePrompt || ""} onChange={(event) => onUpdate(node.id, { negativePrompt: event.target.value })} placeholder="Optional negative prompt" />
            </NodeRow>
            <NodeRow label="Duration">
              <select value={wan27Duration} onChange={(event) => onUpdate(node.id, { duration: event.target.value })}>
                {wan27ReferenceDurationOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value={wan27Resolution} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                {wan27ReferenceResolutionOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Aspect Ratio">
              <select value={wan27AspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                {wan27ReferenceAspectRatioOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Multi Shot">
              <button className={`node-toggle ${node.data.multiShots ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { multiShots: !node.data.multiShots })}>
                <span />
              </button>
            </NodeRow>
            <NodeRow label="Seed">
              <input value={node.data.seed || ""} onChange={(event) => onUpdate(node.id, { seed: event.target.value })} placeholder="Random" />
            </NodeRow>
            <NodeRow label="Safety Check">
              <button className={`node-toggle ${node.data.enableSafetyChecker !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { enableSafetyChecker: node.data.enableSafetyChecker === false })}>
                <span />
              </button>
            </NodeRow>
          </>
        ) : isAurora ? (
          <>
            <NodeRow label="Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceImageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceImageIn, "Add image")}</button>
            </NodeRow>
            <NodeRow label="Audio" inputPort={settingsOpen ? referenceAudioPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceAudioIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceAudioIn, "Add audio")}</button>
            </NodeRow>
            <NodeRow label="Character" inputPort={settingsOpen ? characterPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.characterIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.characterIn, "Add character")}</button>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value={node.data.resolution} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                <option>720p</option>
                <option>480p</option>
              </select>
            </NodeRow>
          </>
        ) : isHappyHorse ? (
          <>
            <NodeRow label="Reference Images" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceImageIn?.length ? "connected-field" : ""}>{`Add Images ( ${happyHorseReferenceImageCount}/9 )`}</button>
            </NodeRow>
            <NodeRow label="Duration">
              <select value={happyHorseDuration} onChange={(event) => onUpdate(node.id, { duration: event.target.value })}>
                {happyHorseDurationOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value={happyHorseResolution} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                <option>1080p</option>
                <option>720p</option>
              </select>
            </NodeRow>
            <NodeRow label="Aspect Ratio">
              <select value={happyHorseAspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                <option>16:9</option>
                <option>9:16</option>
                <option>1:1</option>
                <option>4:3</option>
                <option>3:4</option>
              </select>
            </NodeRow>
            <NodeRow label="Seed">
              <input value={node.data.seed || ""} onChange={(event) => onUpdate(node.id, { seed: event.target.value })} placeholder="Random" />
            </NodeRow>
            <NodeRow label="Safety Check">
              <button className={`node-toggle ${node.data.enableSafetyChecker !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { enableSafetyChecker: node.data.enableSafetyChecker === false })}>
                <span />
              </button>
            </NodeRow>
          </>
        ) : isSam3Video ? (
          <>
            <NodeRow label="Video" inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceVideoIn, "Add video")}</button>
            </NodeRow>
          </>
        ) : (
          <>
            <NodeRow label="Start Frame" inputPort={settingsOpen ? startFramePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.startFrameIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.startFrameIn, "Add file")}</button>
            </NodeRow>
            <NodeRow label="End Frame" inputPort={settingsOpen ? endFramePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.endFrameIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.endFrameIn, "Add file")}</button>
            </NodeRow>
            <NodeRow label="Reference Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceImageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceImageIn, "Add file")}</button>
            </NodeRow>
            <NodeRow label="Reference Video" inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceVideoIn, "Add file")}</button>
            </NodeRow>
            <NodeRow label="Reference Audio" inputPort={settingsOpen ? referenceAudioPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceAudioIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceAudioIn, "Add file")}</button>
            </NodeRow>
            <NodeRow label="Character" inputPort={settingsOpen ? characterPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.characterIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.characterIn, "Add character")}</button>
            </NodeRow>
            <NodeRow label="Duration">
              <select value={node.data.duration} onChange={(event) => onUpdate(node.id, { duration: event.target.value })}>
                <option>15 seconds</option>
                <option>10 seconds</option>
                <option>5 seconds</option>
              </select>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value={node.data.resolution} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                <option>720p</option>
                <option>480p</option>
                <option>1080p</option>
              </select>
            </NodeRow>
            <NodeRow label="Aspect Ratio">
              <select value={node.data.aspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                <option>16:9 (Landscape)</option>
                <option>21:9</option>
                <option>9:16 (Portrait)</option>
                <option>1:1</option>
              </select>
            </NodeRow>
            <NodeRow label="Generate Audio">
              <button className={`node-toggle ${node.data.generateAudio ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { generateAudio: !node.data.generateAudio })}>
                <span />
              </button>
            </NodeRow>
          </>
        )}
      </details>
      {isAurora && <small className="upload-status model-status-note">lipsync model</small>}
      {isHappyHorse && <small className="upload-status model-status-note">reference image model</small>}
      {isWan27Reference && <small className="upload-status model-status-note">multi-reference image/video model</small>}
      {isSam3Video && <small className="upload-status model-status-note">segmentation mask model</small>}
    </div>
  );
}

function ResultPane({ label, resultUrl, resultItems = [], selectedIndex = 0, type, status, error, onSelectResult }) {
  const items = normalizedResultItems(resultItems, resultUrl, type);
  const activeIndex = Math.min(Math.max(Number(selectedIndex) || 0, 0), Math.max(items.length - 1, 0));
  const activeItem = items[activeIndex];

  function selectOffset(offset) {
    if (!items.length) return;
    const nextIndex = (activeIndex + offset + items.length) % items.length;
    onSelectResult?.(nextIndex, items[nextIndex]);
  }

  function downloadActiveItem() {
    if (!activeItem?.url) return;
    const link = document.createElement("a");
    link.href = activeItem.url;
    link.download = resultDownloadFileName(activeItem);
    link.click();
  }

  return (
    <div className={`result-pane ${items.length ? "has-result" : ""} ${items.length > 1 ? "multi-result" : ""}`}>
      {activeItem && (
        <div className="result-carousel" onPointerDown={(event) => event.stopPropagation()}>
          <div className="result-item" key={activeItem.url}>
            {activeItem.type === "image" && <img src={activeItem.url} alt={activeItem.label || `Generated image ${activeIndex + 1}`} />}
            {activeItem.type === "video" && <video src={activeItem.url} controls loop />}
            {activeItem.type === "model3d" && <Model3DViewer url={activeItem.url} label={activeItem.label || `3D model ${activeIndex + 1}`} />}
          </div>
          <button type="button" className="result-download-button" onClick={downloadActiveItem} title={`Download ${activeItem.type === "model3d" ? "3D model" : "result"}`} aria-label="Download result">
            <Download size={14} />
          </button>
          {items.length > 1 && (
            <div className="result-cycle-controls" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => selectOffset(-1)} title="Previous generation">
                <ChevronLeft size={15} />
              </button>
              <span>{activeIndex + 1}/{items.length}</span>
              <button type="button" onClick={() => selectOffset(1)} title="Next generation">
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}
      {!items.length && <span>{status === "running" ? "Running..." : label}</span>}
      {error && <small>{error}</small>}
    </div>
  );
}

function resultDownloadFileName(item) {
  const urlName = String(item?.url || "").split("/").pop() || "";
  const cleanUrlName = urlName.split("?")[0].split("#")[0];
  if (cleanUrlName) return cleanUrlName;
  if (item?.type === "model3d") return "newt-node-model.glb";
  if (item?.type === "video") return "newt-node-video.mp4";
  return "newt-node-image.png";
}

function Model3DViewer({ url, label }) {
  const hostRef = React.useRef(null);
  const [state, setState] = React.useState(url ? "loading" : "empty");

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) {
      setState("empty");
      return undefined;
    }

    let disposed = false;
    let animationFrame = 0;
    let modelRoot = null;
    let isDragging = false;
    let lastPointer = { x: 0, y: 0 };
    let yaw = -0.35;
    let pitch = 0.2;
    let distance = 4;

    setState("loading");
    host.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.className = "model-3d-canvas";
    host.appendChild(renderer.domElement);

    const rig = new THREE.Group();
    scene.add(rig);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(2.5, 4, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8fb7ff, 0.8);
    fillLight.position.set(-4, 2, -2);
    scene.add(fillLight);
    const grid = new THREE.GridHelper(4, 16, 0x3a3a3a, 0x242424);
    grid.position.y = -1.1;
    scene.add(grid);

    function resize() {
      if (disposed) return;
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function updateCamera() {
      const clampedPitch = Math.max(-1.25, Math.min(1.25, pitch));
      pitch = clampedPitch;
      const x = Math.sin(yaw) * Math.cos(pitch) * distance;
      const y = Math.sin(pitch) * distance + 0.25;
      const z = Math.cos(yaw) * Math.cos(pitch) * distance;
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
    }

    function animate() {
      if (disposed) return;
      updateCamera();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    function handlePointerDown(event) {
      event.preventDefault();
      event.stopPropagation();
      isDragging = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event) {
      if (!isDragging) return;
      event.preventDefault();
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      yaw -= dx * 0.008;
      pitch += dy * 0.008;
      lastPointer = { x: event.clientX, y: event.clientY };
    }

    function handlePointerUp(event) {
      isDragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    }

    function handleWheel(event) {
      event.preventDefault();
      event.stopPropagation();
      distance = Math.max(1.2, Math.min(14, distance + event.deltaY * 0.006));
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    new GLTFLoader().load(
      url,
      (gltf) => {
        if (disposed) return;
        modelRoot = gltf.scene || gltf.scenes?.[0] || null;
        if (!modelRoot) {
          setState("error");
          return;
        }

        const box = new THREE.Box3().setFromObject(modelRoot);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const largestSide = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.25 / largestSide;
        modelRoot.scale.setScalar(scale);
        modelRoot.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        rig.add(modelRoot);
        distance = Math.max(2.4, Math.min(7, 3.1 + largestSide * 0.2));
        resize();
        setState("ready");
      },
      undefined,
      () => {
        if (!disposed) setState("error");
      }
    );

    resize();
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      if (modelRoot) disposeThreeObject(modelRoot);
      renderer.dispose();
      host.innerHTML = "";
    };
  }, [url]);

  return (
    <div className={`model-3d-viewer ${state}`} aria-label={label || "3D model viewer"} onPointerDown={(event) => event.stopPropagation()}>
      <div ref={hostRef} className="model-3d-canvas-host" />
      {state === "loading" && <span>Loading 3D...</span>}
      {state === "error" && <span>Could not load 3D model</span>}
      {state === "empty" && <span>No 3D model</span>}
    </div>
  );
}

function TaggedPromptTextarea({ value, onChange, readOnly, className = "", tagMatches = [] }) {
  const highlighterRef = React.useRef(null);
  const parts = React.useMemo(() => promptHighlightParts(value, tagMatches), [value, tagMatches]);

  function syncScroll(event) {
    if (!highlighterRef.current) return;
    highlighterRef.current.scrollTop = event.currentTarget.scrollTop;
    highlighterRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  return (
    <div className={`tagged-prompt-editor ${className}`}>
      <div ref={highlighterRef} className="tagged-prompt-highlighter" aria-hidden="true">
        {parts.map((part, index) =>
          part.active ? (
            <mark key={`${part.text}-${index}`} className="prompt-tag-mark" style={{ "--tag-color": part.color }}>
              {part.text}
            </mark>
          ) : (
            <span key={`${part.text}-${index}`}>{part.text}</span>
          )
        )}
        {String(value || "").endsWith("\n") ? "\u00a0" : null}
      </div>
      <textarea value={value} readOnly={readOnly} onChange={onChange} onScroll={syncScroll} />
    </div>
  );
}

function disposeThreeObject(root) {
  root.traverse((child) => {
    if (child.geometry?.dispose) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture && value.dispose) value.dispose();
      });
      material.dispose?.();
    });
  });
}

function ColorIdMattePicker({ imageUrl, node, onUpdate }) {
  const canvasRef = React.useRef(null);
  const largeCanvasRef = React.useRef(null);
  const sourceImageDataRef = React.useRef(null);
  const matteImageDataRef = React.useRef(null);
  const [pickerStatus, setPickerStatus] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerView, setPickerView] = React.useState("rgb");
  const selectedColor = normalizeColorIdMatteColor(node.data.colorIdMatteColor);
  const tolerance = colorIdMatteTolerance(node.data.colorIdMatteTolerance);
  const sampleRadius = colorIdMatteSampleRadius(node.data.colorIdMatteSampleRadius);
  const invert = Boolean(node.data.colorIdMatteInvert);
  const selectedHex = selectedColor ? rgbToHex(selectedColor) : "None";

  React.useEffect(() => {
    let cancelled = false;

    async function drawPicker() {
      const canvas = canvasRef.current;
      if (!canvas || !imageUrl) {
        sourceImageDataRef.current = null;
        matteImageDataRef.current = null;
        return;
      }

      try {
        const image = await loadCanvasImage(imageUrl);
        if (cancelled) return;

        const sourceImageData = drawColorIdMattePickerCanvas(canvas, image);
        const width = sourceImageData.width;
        const height = sourceImageData.height;
        sourceImageDataRef.current = sourceImageData;
        const matteImageData = selectedColor ? colorIdMatteImageData(sourceImageData, selectedColor, tolerance, invert).imageData : null;
        matteImageDataRef.current = matteImageData;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        renderColorIdMattePickerPreview(context, sourceImageData, selectedColor, tolerance, invert, "overlay");

        const largeCanvas = largeCanvasRef.current;
        if (largeCanvas) {
          largeCanvas.width = width;
          largeCanvas.height = height;
          const largeContext = largeCanvas.getContext("2d", { willReadFrequently: true });
          if (pickerView === "matte" && matteImageData) {
            largeContext.putImageData(matteImageData, 0, 0);
          } else {
            renderColorIdMattePickerPreview(largeContext, sourceImageData, selectedColor, tolerance, invert, "rgb");
          }
        }
        setPickerStatus("");
      } catch (error) {
        sourceImageDataRef.current = null;
        matteImageDataRef.current = null;
        setPickerStatus(error.message || "Could not load image.");
      }
    }

    drawPicker();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, selectedColor?.r, selectedColor?.g, selectedColor?.b, tolerance, invert, pickerOpen, pickerView]);

  function pickColor(event, canvas = canvasRef.current) {
    const imageData = sourceImageDataRef.current;
    if (!canvas || !imageData) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.min(imageData.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * (imageData.width / rect.width))));
    const y = Math.min(imageData.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * (imageData.height / rect.height))));
    const color = averageColorFromImageData(imageData, x, y, sampleRadius);
    if (!color) return;

    onUpdate(node.id, {
      colorIdMatteColor: color,
      error: ""
    });
  }

  return (
    <>
      <NodeRow label="Picker">
        <div className="color-id-picker-shell">
          <div className={`color-id-picker ${imageUrl ? "" : "empty"}`} onPointerDown={(event) => event.stopPropagation()}>
            {imageUrl ? <canvas ref={canvasRef} onClick={(event) => pickColor(event)} title="Pick color" /> : <span>No image</span>}
          </div>
          <button type="button" className="color-id-enlarge-button" onClick={() => setPickerOpen(true)} disabled={!imageUrl}>
            Enlarge
          </button>
        </div>
      </NodeRow>
      <NodeRow label="Selected">
        <div className="color-id-selected">
          <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
          <span>{selectedHex}</span>
        </div>
      </NodeRow>
      <NodeRow label="Tolerance">
        <div className="color-id-slider">
          <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
          <span>{tolerance}</span>
        </div>
      </NodeRow>
      <NodeRow label="Sample">
        <select value={String(sampleRadius)} onChange={(event) => onUpdate(node.id, { colorIdMatteSampleRadius: event.target.value })}>
          <option value="0">1 px</option>
          <option value="1">3 px</option>
          <option value="2">5 px</option>
          <option value="3">7 px</option>
        </select>
      </NodeRow>
      <NodeRow label="Invert">
        <button className={`node-toggle ${invert ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { colorIdMatteInvert: !invert })}>
          <span />
        </button>
      </NodeRow>
      {pickerStatus && <small className="upload-error color-id-status">{pickerStatus}</small>}
      {pickerOpen && (
        <div className="color-id-picker-modal" role="dialog" aria-modal="true" aria-label="Color ID matte picker" onPointerDown={(event) => event.stopPropagation()}>
          <div className="color-id-picker-modal-panel">
            <div className="color-id-picker-modal-header">
              <div className="color-id-selected">
                <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
                <span>{selectedHex}</span>
              </div>
              <div className="color-id-view-toggle" role="group" aria-label="Picker view">
                <button type="button" className={pickerView === "rgb" ? "active" : ""} aria-pressed={pickerView === "rgb"} onClick={() => setPickerView("rgb")}>
                  RGB
                </button>
                <button type="button" className={pickerView === "matte" ? "active" : ""} aria-pressed={pickerView === "matte"} onClick={() => setPickerView("matte")} disabled={!selectedColor}>
                  Matte
                </button>
              </div>
              <button type="button" className="color-id-picker-close" onClick={() => setPickerOpen(false)} title="Close picker">
                <X size={17} />
              </button>
            </div>
            <div className="color-id-picker-large">
              <canvas ref={largeCanvasRef} onClick={(event) => pickColor(event, largeCanvasRef.current)} title="Pick color" />
            </div>
            <div className="color-id-modal-controls">
              <span>Tolerance</span>
              <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
              <strong>{tolerance}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ColorIdMatteVideoPicker({ videoUrl, node, onUpdate }) {
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const largeCanvasRef = React.useRef(null);
  const sourceImageDataRef = React.useRef(null);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [pickerStatus, setPickerStatus] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickerView = normalizeChoice(node.data.colorIdMattePreviewMode, ["overlay", "rgb", "matte"], "overlay");
  const selectedColor = normalizeColorIdMatteColor(node.data.colorIdMatteColor);
  const tolerance = colorIdMatteTolerance(node.data.colorIdMatteTolerance);
  const sampleRadius = colorIdMatteSampleRadius(node.data.colorIdMatteSampleRadius);
  const invert = Boolean(node.data.colorIdMatteInvert);
  const matteItems = normalizeColorIdMatteItems(node.data.colorIdMatteItems);
  const matteName = String(node.data.colorIdMatteName || "");
  const blur = colorIdMatteBlur(node.data.colorIdMatteBlur);
  const expand = colorIdMatteExpand(node.data.colorIdMatteExpand);
  const startTime = node.data.colorIdMatteStartTime ?? "";
  const endTime = node.data.colorIdMatteEndTime ?? "";
  const outputFormat = normalizeChoice(node.data.colorIdMatteOutputFormat, colorIdMatteVideoOutputOptions.map(([value]) => value), "mp4");
  const selectedHex = selectedColor ? rgbToHex(selectedColor) : "None";
  const sliderMax = duration ? Math.max(0, duration - 0.01) : Math.max(1, currentTime);

  const drawVideoFrame = React.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !videoUrl || !video?.videoWidth || !video?.videoHeight) {
      sourceImageDataRef.current = null;
      return;
    }

    try {
      const sourceImageData = drawColorIdMatteVideoCanvas(canvas, video);
      sourceImageDataRef.current = sourceImageData;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      renderColorIdMattePickerPreview(context, sourceImageData, selectedColor, tolerance, invert, pickerView);

      const largeCanvas = largeCanvasRef.current;
      if (largeCanvas) {
        largeCanvas.width = sourceImageData.width;
        largeCanvas.height = sourceImageData.height;
        const largeContext = largeCanvas.getContext("2d", { willReadFrequently: true });
        renderColorIdMattePickerPreview(largeContext, sourceImageData, selectedColor, tolerance, invert, pickerView);
      }

      setPickerStatus("");
    } catch (error) {
      sourceImageDataRef.current = null;
      setPickerStatus(error.message || "Could not read video frame.");
    }
  }, [videoUrl, selectedColor?.r, selectedColor?.g, selectedColor?.b, tolerance, invert, pickerView]);

  React.useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setPickerOpen(false);
    sourceImageDataRef.current = null;
  }, [videoUrl]);

  React.useEffect(() => {
    drawVideoFrame();
  }, [drawVideoFrame, pickerOpen]);

  React.useEffect(() => {
    if (!pickerOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pickerOpen]);

  function handleLoadedMetadata(event) {
    const video = event.currentTarget;
    const nextDuration = Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;
    setDuration(nextDuration);
    const nextTime = nextDuration ? Math.min(currentTime, Math.max(0, nextDuration - 0.01)) : currentTime;
    if (Math.abs(video.currentTime - nextTime) > 0.05) {
      try {
        video.currentTime = nextTime;
      } catch {
        // Some browsers reject seeks before metadata is ready.
      }
    } else {
      drawVideoFrame();
    }
  }

  function handleSeeked(event) {
    setCurrentTime(event.currentTarget.currentTime || 0);
    drawVideoFrame();
  }

  function seekVideo(value) {
    const time = duration ? clamp(Number(value) || 0, 0, Math.max(0, duration - 0.01)) : Math.max(0, Number(value) || 0);
    setCurrentTime(time);
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = time;
    } catch {
      drawVideoFrame();
    }
  }

  function pickColor(event, canvas = canvasRef.current) {
    const imageData = sourceImageDataRef.current;
    if (!canvas || !imageData) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.min(imageData.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * (imageData.width / rect.width))));
    const y = Math.min(imageData.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * (imageData.height / rect.height))));
    const color = averageColorFromImageData(imageData, x, y, sampleRadius);
    if (!color) return;

    onUpdate(node.id, {
      colorIdMatteColor: color,
      error: ""
    });
  }

  function setTolerancePreset(value) {
    const nextTolerance = value === "exact" ? 0 : value === "soft" ? 24 : 64;
    onUpdate(node.id, { colorIdMatteTolerance: nextTolerance });
  }

  function addCurrentMatte() {
    if (!selectedColor) return;
    const name = matteName.trim() || selectedHex;
    onUpdate(node.id, {
      colorIdMatteItems: [
        ...matteItems,
        {
          id: `matte-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          color: selectedColor
        }
      ],
      colorIdMatteName: "",
      error: ""
    });
  }

  function updateMatteName(id, name) {
    onUpdate(node.id, {
      colorIdMatteItems: matteItems.map((item) => (item.id === id ? { ...item, name } : item))
    });
  }

  function removeMatte(id) {
    onUpdate(node.id, {
      colorIdMatteItems: matteItems.filter((item) => item.id !== id)
    });
  }

  return (
    <>
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          preload="metadata"
          muted
          playsInline
          className="color-id-video-source"
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={handleSeeked}
          onLoadedData={drawVideoFrame}
        />
      )}
      <NodeRow label="Picker">
        <div className="color-id-picker-shell">
          <div className={`color-id-picker ${videoUrl ? "" : "empty"}`} onPointerDown={(event) => event.stopPropagation()}>
            {videoUrl ? <canvas ref={canvasRef} onClick={(event) => pickColor(event)} title="Pick color from current frame" /> : <span>No video</span>}
          </div>
          <button type="button" className="color-id-enlarge-button" onClick={() => setPickerOpen(true)} disabled={!videoUrl}>
            Enlarge
          </button>
        </div>
      </NodeRow>
      <NodeRow label="Frame">
        <div className="color-id-slider">
          <input type="range" min="0" max={sliderMax || 1} step="0.033" value={Math.min(currentTime, sliderMax || 1)} onChange={(event) => seekVideo(event.target.value)} disabled={!videoUrl} />
          <span>{formatFrameTimeDisplay(currentTime)}</span>
        </div>
      </NodeRow>
      <NodeRow label="Selected">
        <div className="color-id-selected">
          <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
          <span>{selectedHex}</span>
        </div>
      </NodeRow>
      <NodeRow label="Name">
        <input value={matteName} onChange={(event) => onUpdate(node.id, { colorIdMatteName: event.target.value })} placeholder="Matte name" />
      </NodeRow>
      <NodeRow label="Batch">
        <button type="button" onClick={addCurrentMatte} disabled={!selectedColor}>
          Add Matte
        </button>
      </NodeRow>
      {matteItems.length > 0 && (
        <div className="color-id-matte-list">
          {matteItems.map((item, index) => (
            <div className="color-id-matte-item" key={item.id}>
              <span className="color-id-swatch" style={{ backgroundColor: rgbToHex(item.color) }} />
              <input value={item.name} onChange={(event) => updateMatteName(item.id, event.target.value)} aria-label={`Matte ${index + 1} name`} />
              <button type="button" onClick={() => removeMatte(item.id)} title="Remove matte" aria-label="Remove matte">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <NodeRow label="View">
        <select value={pickerView} onChange={(event) => onUpdate(node.id, { colorIdMattePreviewMode: event.target.value })}>
          <option value="overlay">Overlay</option>
          <option value="rgb">RGB</option>
          <option value="matte">Matte</option>
        </select>
      </NodeRow>
      <NodeRow label="Preset">
        <div className="color-id-preset-row">
          <button type="button" onClick={() => setTolerancePreset("exact")}>Exact</button>
          <button type="button" onClick={() => setTolerancePreset("soft")}>Soft</button>
          <button type="button" onClick={() => setTolerancePreset("broad")}>Broad</button>
        </div>
      </NodeRow>
      <NodeRow label="Tolerance">
        <div className="color-id-slider">
          <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
          <span>{tolerance}</span>
        </div>
      </NodeRow>
      <NodeRow label="Sample">
        <select value={String(sampleRadius)} onChange={(event) => onUpdate(node.id, { colorIdMatteSampleRadius: event.target.value })}>
          <option value="0">1 px</option>
          <option value="1">3 px</option>
          <option value="2">5 px</option>
          <option value="3">7 px</option>
        </select>
      </NodeRow>
      <NodeRow label="Invert">
        <button className={`node-toggle ${invert ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { colorIdMatteInvert: !invert })}>
          <span />
        </button>
      </NodeRow>
      <NodeRow label="Blur">
        <div className="color-id-slider">
          <input type="range" min="0" max="24" step="0.5" value={blur} onChange={(event) => onUpdate(node.id, { colorIdMatteBlur: event.target.value })} />
          <span>{blur}</span>
        </div>
      </NodeRow>
      <NodeRow label="Expand">
        <div className="color-id-slider">
          <input type="range" min="-12" max="12" step="1" value={expand} onChange={(event) => onUpdate(node.id, { colorIdMatteExpand: event.target.value })} />
          <span>{expand}</span>
        </div>
      </NodeRow>
      <NodeRow label="Range">
        <div className="inline-two-fields">
          <input value={startTime} onChange={(event) => onUpdate(node.id, { colorIdMatteStartTime: event.target.value })} placeholder="Start" />
          <input value={endTime} onChange={(event) => onUpdate(node.id, { colorIdMatteEndTime: event.target.value })} placeholder="End" />
        </div>
      </NodeRow>
      <NodeRow label="Format">
        <select value={outputFormat} onChange={(event) => onUpdate(node.id, { colorIdMatteOutputFormat: event.target.value })}>
          {colorIdMatteVideoOutputOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </NodeRow>
      {pickerStatus && <small className="upload-error color-id-status">{pickerStatus}</small>}
      {pickerOpen && (
        <div className="color-id-picker-modal" role="dialog" aria-modal="true" aria-label="Color ID video matte picker" onPointerDown={(event) => event.stopPropagation()}>
          <div className="color-id-picker-modal-panel">
            <div className="color-id-picker-modal-header">
              <div className="color-id-selected">
                <span className="color-id-swatch" style={{ backgroundColor: selectedColor ? rgbToHex(selectedColor) : "transparent" }} />
                <span>{selectedHex}</span>
              </div>
              <div className="color-id-view-toggle" role="group" aria-label="Picker view">
                <button type="button" className={pickerView === "overlay" ? "active" : ""} aria-pressed={pickerView === "overlay"} onClick={() => onUpdate(node.id, { colorIdMattePreviewMode: "overlay" })}>
                  Overlay
                </button>
                <button type="button" className={pickerView === "rgb" ? "active" : ""} aria-pressed={pickerView === "rgb"} onClick={() => onUpdate(node.id, { colorIdMattePreviewMode: "rgb" })}>
                  RGB
                </button>
                <button type="button" className={pickerView === "matte" ? "active" : ""} aria-pressed={pickerView === "matte"} onClick={() => onUpdate(node.id, { colorIdMattePreviewMode: "matte" })} disabled={!selectedColor}>
                  Matte
                </button>
              </div>
              <button type="button" className="color-id-picker-close" onClick={() => setPickerOpen(false)} title="Close picker">
                <X size={17} />
              </button>
            </div>
            <div className="color-id-picker-large">
              <canvas ref={largeCanvasRef} onClick={(event) => pickColor(event, largeCanvasRef.current)} title="Pick color from current frame" />
            </div>
            <div className="color-id-modal-controls">
              <span>Frame</span>
              <input type="range" min="0" max={sliderMax || 1} step="0.033" value={Math.min(currentTime, sliderMax || 1)} onChange={(event) => seekVideo(event.target.value)} />
              <strong>{formatFrameTimeDisplay(currentTime)}</strong>
            </div>
            <div className="color-id-modal-controls">
              <span>Tolerance</span>
              <input type="range" min="0" max="96" step="1" value={tolerance} onChange={(event) => onUpdate(node.id, { colorIdMatteTolerance: event.target.value })} />
              <strong>{tolerance}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CompositeVideoControls({ incoming, maskVideoPort, settingsOpen, node, onUpdate, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  const videoCount = incoming.referenceVideoIn?.length || 0;
  const maskConnected = Boolean(incoming.maskVideoIn?.length);
  const blur = colorIdMatteBlur(node.data.compositeMaskBlur);
  const expand = colorIdMatteExpand(node.data.compositeMaskExpand);
  const outputFormat = normalizeChoice(node.data.compositeOutputFormat, colorIdMatteVideoOutputOptions.map(([value]) => value), "mp4");

  return (
    <>
      <NodeRow label="Mask Video" inputPort={settingsOpen ? maskVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
        <button className={maskConnected ? "connected-field" : ""}>{connectedSummary(incoming.maskVideoIn, "Add mask")}</button>
      </NodeRow>
      <NodeRow label="Mode">
        <div className="utility-mini-note">Reference image and mask video are required. Source video is optional.</div>
      </NodeRow>
      <NodeRow label="Inputs">
        <div className="utility-mini-note">{videoCount >= 2 ? "First video is base, last video is layer." : "Connect base and layer videos to the Video input."}</div>
      </NodeRow>
      <NodeRow label="Invert Mask">
        <button className={`node-toggle ${node.data.compositeInvertMask ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { compositeInvertMask: !node.data.compositeInvertMask })}>
          <span />
        </button>
      </NodeRow>
      <NodeRow label="Mask Blur">
        <div className="color-id-slider">
          <input type="range" min="0" max="24" step="0.5" value={blur} onChange={(event) => onUpdate(node.id, { compositeMaskBlur: event.target.value })} />
          <span>{blur}</span>
        </div>
      </NodeRow>
      <NodeRow label="Expand">
        <div className="color-id-slider">
          <input type="range" min="-12" max="12" step="1" value={expand} onChange={(event) => onUpdate(node.id, { compositeMaskExpand: event.target.value })} />
          <span>{expand}</span>
        </div>
      </NodeRow>
      <NodeRow label="Format">
        <select value={outputFormat} onChange={(event) => onUpdate(node.id, { compositeOutputFormat: event.target.value })}>
          {colorIdMatteVideoOutputOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label.replace("mask", "video")}
            </option>
          ))}
        </select>
      </NodeRow>
    </>
  );
}

function WanVaceInpaintingControls({ incoming, referenceImagePort, maskVideoPort, settingsOpen, node, onUpdate, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  const referenceImageConnected = Boolean(incoming.referenceImageIn?.length);
  const maskConnected = Boolean(incoming.maskVideoIn?.length);
  const isMaskToVideo = isUtilityWanVaceMaskToVideoModel(node.data.utilityVideoModel);

  return (
    <>
      <NodeRow label="Reference Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
        <button className={referenceImageConnected ? "connected-field" : ""}>{connectedSummary(incoming.referenceImageIn, "Optional image")}</button>
      </NodeRow>
      <NodeRow label="Mask Video" inputPort={settingsOpen ? maskVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
        <button className={maskConnected ? "connected-field" : ""}>{connectedSummary(incoming.maskVideoIn, "Add mask")}</button>
      </NodeRow>
      <NodeRow label="Negative">
        <textarea value={node.data.wanVaceNegativePrompt || ""} onChange={(event) => onUpdate(node.id, { wanVaceNegativePrompt: event.target.value })} placeholder="Optional negative prompt" />
      </NodeRow>
      <NodeRow label="Resolution">
        <select value={node.data.wanVaceResolution || "720p"} onChange={(event) => onUpdate(node.id, { wanVaceResolution: event.target.value })}>
          {wanVaceResolutionOptions.map((option) => (
            <option key={option} value={option}>
              {option === "auto" ? "Auto" : option}
            </option>
          ))}
        </select>
      </NodeRow>
      <NodeRow label="Aspect">
        <select value={node.data.wanVaceAspectRatio || "auto"} onChange={(event) => onUpdate(node.id, { wanVaceAspectRatio: event.target.value })}>
          {wanVaceAspectRatioOptions.map((option) => (
            <option key={option} value={option}>
              {option === "auto" ? "Auto" : option}
            </option>
          ))}
        </select>
      </NodeRow>
      <NodeRow label="Match Frames">
        <button className={`node-toggle ${node.data.wanVaceMatchInputNumFrames !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { wanVaceMatchInputNumFrames: node.data.wanVaceMatchInputNumFrames === false })}>
          <span />
        </button>
      </NodeRow>
      {node.data.wanVaceMatchInputNumFrames === false && (
        <NodeRow label="Frames">
          <input type="number" min="81" max="100" value={node.data.wanVaceNumFrames || 81} onChange={(event) => onUpdate(node.id, { wanVaceNumFrames: event.target.value })} />
        </NodeRow>
      )}
      <NodeRow label="Match FPS">
        <button className={`node-toggle ${node.data.wanVaceMatchInputFps !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { wanVaceMatchInputFps: node.data.wanVaceMatchInputFps === false })}>
          <span />
        </button>
      </NodeRow>
      {node.data.wanVaceMatchInputFps === false && (
        <NodeRow label="FPS">
          <input type="number" min="5" max="24" value={node.data.wanVaceFps || 16} onChange={(event) => onUpdate(node.id, { wanVaceFps: event.target.value })} />
        </NodeRow>
      )}
      <NodeRow label="Steps">
        <input type="number" min="1" max="60" value={node.data.wanVaceNumInferenceSteps || 30} onChange={(event) => onUpdate(node.id, { wanVaceNumInferenceSteps: event.target.value })} />
      </NodeRow>
      {!isMaskToVideo && (
        <NodeRow label="Guidance">
          <input type="number" min="0" max="20" step="0.1" value={node.data.wanVaceGuidanceScale || 5} onChange={(event) => onUpdate(node.id, { wanVaceGuidanceScale: event.target.value })} />
        </NodeRow>
      )}
      <NodeRow label="Shift">
        <input type="number" min="0" max="20" step="0.1" value={node.data.wanVaceShift || 5} onChange={(event) => onUpdate(node.id, { wanVaceShift: event.target.value })} />
      </NodeRow>
      {!isMaskToVideo && (
        <NodeRow label="Sampler">
          <select value={node.data.wanVaceSampler || "unipc"} onChange={(event) => onUpdate(node.id, { wanVaceSampler: event.target.value })}>
            {wanVaceSamplerOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </NodeRow>
      )}
      <NodeRow label="Prompt Expand">
        <button className={`node-toggle ${node.data.wanVaceEnablePromptExpansion ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { wanVaceEnablePromptExpansion: !node.data.wanVaceEnablePromptExpansion })}>
          <span />
        </button>
      </NodeRow>
      <NodeRow label="Preprocess">
        <button className={`node-toggle ${node.data.wanVacePreprocess ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { wanVacePreprocess: !node.data.wanVacePreprocess })}>
          <span />
        </button>
      </NodeRow>
      {!isMaskToVideo && (
        <NodeRow label="Acceleration">
          <select value={node.data.wanVaceAcceleration || "regular"} onChange={(event) => onUpdate(node.id, { wanVaceAcceleration: event.target.value })}>
            {wanVaceAccelerationOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </NodeRow>
      )}
      <NodeRow label="Safety">
        <button className={`node-toggle ${node.data.wanVaceEnableSafetyChecker !== false ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { wanVaceEnableSafetyChecker: node.data.wanVaceEnableSafetyChecker === false })}>
          <span />
        </button>
      </NodeRow>
      {!isMaskToVideo && (
        <>
          <NodeRow label="Quality">
            <select value={node.data.wanVaceVideoQuality || "high"} onChange={(event) => onUpdate(node.id, { wanVaceVideoQuality: event.target.value })}>
              <option>low</option>
              <option>medium</option>
              <option>high</option>
              <option>maximum</option>
            </select>
          </NodeRow>
          <NodeRow label="Write Mode">
            <select value={node.data.wanVaceVideoWriteMode || "balanced"} onChange={(event) => onUpdate(node.id, { wanVaceVideoWriteMode: event.target.value })}>
              <option>fast</option>
              <option>balanced</option>
              <option>small</option>
            </select>
          </NodeRow>
          <NodeRow label="Interp Frames">
            <input type="number" min="0" step="1" value={node.data.wanVaceNumInterpolatedFrames || 0} onChange={(event) => onUpdate(node.id, { wanVaceNumInterpolatedFrames: event.target.value })} />
          </NodeRow>
        </>
      )}
    </>
  );
}

function ExtractFrameControls({ videoUrl, node, onUpdate }) {
  const videoRef = React.useRef(null);
  const largeVideoRef = React.useRef(null);
  const [duration, setDuration] = React.useState(0);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const selectedTime = Math.max(0, finiteNumber(node.data.extractFrameTime, 0));
  const selectedFormat = node.data.extractFrameFormat === "jpeg" ? "jpeg" : "png";
  const sliderMax = duration ? Math.max(0, duration - 0.01) : Math.max(1, selectedTime);
  const sliderValue = clamp(selectedTime, 0, sliderMax);

  React.useEffect(() => {
    setDuration(0);
    setPickerOpen(false);
  }, [videoUrl]);

  React.useEffect(() => {
    if (!pickerOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pickerOpen]);

  React.useEffect(() => {
    syncVideoTime(videoRef.current, selectedTime);
    syncVideoTime(largeVideoRef.current, selectedTime);
  }, [selectedTime, videoUrl, pickerOpen]);

  function syncVideoTime(video, time) {
    if (!video || !Number.isFinite(time)) return;
    const upper = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.01) : time;
    const nextTime = clamp(time, 0, upper);
    if (Math.abs(video.currentTime - nextTime) > 0.05) {
      try {
        video.currentTime = nextTime;
      } catch {
        // Some browsers reject seeks before metadata is fully available.
      }
    }
  }

  function seekPreviewVideos(time) {
    syncVideoTime(videoRef.current, time);
    syncVideoTime(largeVideoRef.current, time);
  }

  function commitTime(value) {
    const unclampedTime = Math.max(0, Number(value) || 0);
    const boundedTime = duration ? clamp(unclampedTime, 0, Math.max(0, duration - 0.01)) : unclampedTime;
    const nextTime = Math.round(boundedTime * 100) / 100;
    if (Math.abs(nextTime - selectedTime) < 0.005) return;
    onUpdate(node.id, {
      extractFrameTime: String(nextTime),
      error: ""
    });
  }

  function handleLoadedMetadata(event) {
    const video = event.currentTarget;
    const nextDuration = Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;
    setDuration(nextDuration);
    const clampedTime = nextDuration ? clamp(selectedTime, 0, Math.max(0, nextDuration - 0.01)) : selectedTime;
    if (Math.abs(clampedTime - selectedTime) >= 0.005) {
      commitTime(clampedTime);
    }
    if (clampedTime > 0 && Math.abs(video.currentTime - clampedTime) > 0.05) {
      video.currentTime = clampedTime;
    }
  }

  function handlePreviewOpen(event) {
    event.stopPropagation();
    if (videoUrl) setPickerOpen(true);
  }

  function handlePreviewKeyDown(event) {
    if (!videoUrl || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    setPickerOpen(true);
  }

  function handleTimeInput(event) {
    const nextTime = Math.max(0, Number(event.target.value) || 0);
    commitTime(nextTime);
    seekPreviewVideos(nextTime);
  }

  return (
    <>
      <NodeRow label="Preview">
        <div
          className={`extract-frame-preview ${videoUrl ? "" : "empty"}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handlePreviewOpen}
          onKeyDown={handlePreviewKeyDown}
          role={videoUrl ? "button" : undefined}
          tabIndex={videoUrl ? 0 : undefined}
          title={videoUrl ? "Open large frame picker" : undefined}
        >
          {videoUrl ? (
            <>
              <video ref={videoRef} src={videoUrl} muted preload="metadata" playsInline onLoadedMetadata={handleLoadedMetadata} />
              <button type="button" className="extract-frame-expand-button" onClick={handlePreviewOpen} title="Open large frame picker" aria-label="Open large frame picker">
                <Maximize2 size={14} />
              </button>
            </>
          ) : (
            <span>No video</span>
          )}
        </div>
      </NodeRow>
      <NodeRow label="Time">
        <div className="extract-frame-time">
          <input type="number" min="0" step="0.01" value={node.data.extractFrameTime ?? 0} onChange={handleTimeInput} />
          <span>{duration ? `/ ${formatFrameTimeDisplay(duration)}` : "sec"}</span>
        </div>
      </NodeRow>
      <NodeRow label="Format">
        <select value={selectedFormat} onChange={(event) => onUpdate(node.id, { extractFrameFormat: event.target.value, error: "" })}>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
        </select>
      </NodeRow>
      {pickerOpen && videoUrl && (
        <div className="extract-frame-modal" role="dialog" aria-modal="true" aria-label="Extract frame picker" onPointerDown={(event) => event.stopPropagation()}>
          <div className="extract-frame-modal-panel">
            <div className="extract-frame-modal-header">
              <div>
                <strong>Extract Frame</strong>
                <span>{duration ? `${formatFrameTimeDisplay(selectedTime)} / ${formatFrameTimeDisplay(duration)}` : formatFrameTimeDisplay(selectedTime)}</span>
              </div>
              <button type="button" className="color-id-picker-close" onClick={() => setPickerOpen(false)} title="Close picker" aria-label="Close picker">
                <X size={17} />
              </button>
            </div>
            <div className="extract-frame-modal-video">
              <video
                ref={largeVideoRef}
                src={videoUrl}
                controls
                muted
                preload="metadata"
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                onSeeked={(event) => commitTime(event.currentTarget.currentTime)}
                onTimeUpdate={(event) => commitTime(event.currentTarget.currentTime)}
              />
            </div>
            <div className="extract-frame-modal-controls">
              <span>Time</span>
              <input type="range" min="0" max={sliderMax} step="0.01" value={sliderValue} onChange={handleTimeInput} />
              <input type="number" min="0" step="0.01" value={node.data.extractFrameTime ?? 0} onChange={handleTimeInput} />
              <strong>{duration ? `/ ${formatFrameTimeDisplay(duration)}` : "sec"}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatFrameTimeDisplay(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  if (minutes > 0) return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
  return `${remainder.toFixed(2)}s`;
}

function NodeRow({ label, children, inputPort, node, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div className={`node-row ${inputPort ? "has-port" : ""}`}>
      <span className="node-row-label">
        {inputPort && (
          <PortHandle
            node={node}
            port={inputPort}
            side="input"
            onConnectStart={onConnectStart}
            onDisconnectInput={onDisconnectInput}
            connectedPortKeys={connectedPortKeys}
          />
        )}
        <span>{label}</span>
      </span>
      {children}
    </div>
  );
}

function getNodeConfig(type) {
  const configs = {
    text: {
      icon: Type,
      input: [
        { id: "textIn", label: "Text", color: portColors.prompt },
        { id: "imageIn", label: "Image", color: portColors.image },
        { id: "videoIn", label: "Video", color: portColors.video },
        { id: "styleIn", label: "Style", color: portColors.style }
      ],
      output: [{ id: "promptOut", label: "Prompt", color: portColors.prompt }]
    },
    image: {
      icon: FileImage,
      input: [],
      output: [{ id: "imageOut", label: "Image", color: portColors.image }]
    },
    character: {
      icon: UserRound,
      input: [],
      output: [
        { id: "characterOut", label: "Character", color: portColors.character },
        { id: "voiceOut", label: "Voice", color: portColors.audio }
      ]
    },
    camera: {
      icon: Camera,
      input: [{ id: "imageIn", label: "Image", color: portColors.image }],
      output: [
        { id: "cameraOut", label: "Camera", color: portColors.camera },
        { id: "imageOut", label: "Image", color: portColors.image }
      ]
    },
    composer: {
      icon: Box,
      input: [
        { id: "promptIn", label: "Prompt", color: portColors.prompt },
        { id: "imageIn", label: "Image Plane", color: portColors.image }
      ],
      output: [
        { id: "promptOut", label: "Prompt", color: portColors.prompt },
        { id: "imageOut", label: "Frame", color: portColors.image }
      ]
    },
    style: {
      icon: Palette,
      input: [],
      output: [{ id: "styleOut", label: "Style", color: portColors.style }]
    },
    transfer: {
      icon: Compass,
      input: [],
      output: [{ id: "transferOut", label: moodBoardOutputFileName, color: portColors.transfer }]
    },
    utility: {
      icon: Wrench,
      input: [
        { id: "imageIn", label: "Image", color: portColors.image },
        { id: "promptIn", label: "Prompt", color: portColors.prompt },
        { id: "referenceImageIn", label: "Reference Image", color: portColors.image },
        { id: "referenceVideoIn", label: "Control Video", color: portColors.video },
        { id: "maskVideoIn", label: "Mask Video", color: portColors.video }
      ],
      output: [{ id: "utilityOut", label: "Output", color: portColors.image }]
    },
    video: {
      icon: Video,
      input: [],
      output: [{ id: "videoOut", label: "Video", color: portColors.video }]
    },
    audio: {
      icon: FileAudio,
      input: [],
      output: [{ id: "audioOut", label: "Audio", color: portColors.audio }]
    },
    preview: {
      icon: MonitorPlay,
      input: [{ id: "sourceIn", label: "Source", color: portColors.preview }],
      output: []
    },
    model3d: {
      icon: Box,
      input: model3DViewInputs.map((input) => ({ id: input.id, label: input.label, color: portColors.image })),
      output: [{ id: "modelOut", label: "3D", color: portColors.model3d }]
    },
    imageModel: {
      icon: ImagePlus,
      input: [
        { id: "promptIn", label: "Prompt", color: portColors.prompt },
        { id: "imagePromptIn", label: "Image Prompt", color: portColors.image },
        { id: "cameraIn", label: "Camera", color: portColors.camera },
        { id: "styleIn", label: "Style", color: portColors.style },
        { id: "transferIn", label: "Mood Board", color: portColors.transfer },
        { id: "characterIn", label: "Character", color: portColors.character }
      ],
      output: [{ id: "imageOut", label: "Image", color: portColors.image }]
    },
    videoModel: {
      icon: Film,
      input: [
        { id: "promptIn", label: "Prompt", color: portColors.prompt },
        { id: "startFrameIn", label: "Start Frame", color: portColors.image },
        { id: "endFrameIn", label: "End Frame", color: portColors.image },
        { id: "referenceImageIn", label: "Reference Image", color: portColors.image },
        { id: "referenceVideoIn", label: "Reference Video", color: portColors.video },
        { id: "referenceAudioIn", label: "Reference Audio", color: portColors.audio },
        { id: "characterIn", label: "Character", color: portColors.character }
      ],
      output: [{ id: "videoOut", label: "Video", color: portColors.video }]
    }
  };

  return configs[type];
}

function createDefaultNodeData(type, label, count) {
  const title = `${label}${count > 1 ? ` ${count}` : ""}`;

  if (type === "text") return { title, text: "" };
  if (type === "image" || type === "video" || type === "audio") return { title };
  if (type === "preview") return { title, previewScale: 1 };
  if (type === "model3d") {
    return {
      title,
      model: model3DNames.hunyuanPro,
      generateType: "Normal",
      enablePbr: false,
      faceCount: 500000,
      resultType: "model3d",
      settingsOpen: false
    };
  }
  if (type === "composer") {
    const composerScene = defaultComposerScene();
    return {
      title,
      prompt: "",
      composerAspectRatio: "16:9",
      composerShowGuides: true,
      composerSelectedId: composerScene.maquettes[0]?.id || "",
      composerSavedPoses: [],
      composerScene
    };
  }
  if (type === "character") {
    return {
      title,
      characterName: "",
      characterPhysicalDetails: "",
      characterPortrait: null,
      characterWardrobes: [],
      activeWardrobeId: "",
      characterReferenceNotes: "",
      characterTraits: [],
      customCharacterTraits: "",
      characterVoices: [],
      activeVoiceId: "",
      characterTab: "build",
      activated: false,
      locked: false,
      compiledWardrobeUrl: "",
      compiledTraitPrompt: "",
      compiledVoicePrompt: "",
      characterSheetVariants: [],
      characterBatchProgress: null,
      characterVariantNotice: ""
    };
  }
  if (type === "preview") return { title, previewScale: 1, previewItemIndex: 0 };
  if (type === "camera") {
    return {
      title,
      shotPreset: "None",
      lensPreset: "None",
      typePreset: "None",
      qwenCameraOpen: false,
      ...qwenCameraDefaults
    };
  }
  if (type === "transfer") {
    return {
      title: title === "Transfer" ? "Mood Board" : title,
      transferImages: [],
      activated: false,
      locked: false,
      moodBoardScale: 1,
      hiddenPrompt: transferPromptSuffix
    };
  }
  if (type === "utility") {
    return {
      title,
      utilityMode: "video",
      model: videoModelNames.wanFunControl,
      utilityImageModel: utilityImageModelNames.dwpose,
      utilityVideoModel: utilityVideoModelNames.wanFunControl,
      stillFrameTime: 0,
      dwposeDrawMode: "body-pose",
      patinaMaps: patinaMapOptions.map((option) => option.id),
      patinaOutputFormat: "png",
      patinaSeed: "",
      colorIdMatteColor: null,
      colorIdMatteTolerance: 0,
      colorIdMatteSampleRadius: 0,
      colorIdMatteInvert: false,
      colorIdMatteName: "",
      colorIdMatteItems: [],
      colorIdMattePreviewMode: "overlay",
      colorIdMatteBlur: 0,
      colorIdMatteExpand: 0,
      colorIdMatteStartTime: "",
      colorIdMatteEndTime: "",
      colorIdMatteOutputFormat: "mp4",
      compositeInvertMask: false,
      compositeMaskBlur: 0,
      compositeMaskExpand: 0,
      compositeOutputFormat: "mp4",
      wanVaceNegativePrompt: "",
      wanVaceMatchInputNumFrames: true,
      wanVaceNumFrames: 81,
      wanVaceMatchInputFps: true,
      wanVaceFps: 16,
      wanVaceResolution: "720p",
      wanVaceAspectRatio: "auto",
      wanVaceNumInferenceSteps: 30,
      wanVaceGuidanceScale: 5,
      wanVaceSampler: "unipc",
      wanVaceShift: 5,
      wanVaceEnableSafetyChecker: true,
      wanVaceEnablePromptExpansion: false,
      wanVacePreprocess: false,
      wanVaceAcceleration: "regular",
      wanVaceVideoQuality: "high",
      wanVaceVideoWriteMode: "balanced",
      wanVaceNumInterpolatedFrames: 0,
      sam3VideoDetectionThreshold: 0.5,
      prompt: "",
      batchCount: "1",
      preprocessVideo: true,
      preprocessType: "depth",
      matchInputNumFrames: true,
      numFrames: 81,
      matchInputFps: true,
      fps: 16,
      rifeNumFrames: 1,
      rifeUseSceneDetection: true,
      rifeUseCalculatedFps: true,
      rifeFps: 24,
      rifeLoop: false,
      bytedanceUpscalerTargetResolution: "1080p",
      bytedanceUpscalerTargetFps: "30fps",
      bytedanceUpscalerPreset: "general",
      bytedanceUpscalerTier: "standard",
      bytedanceUpscalerFidelity: "high",
      bytedanceUpscalerScaleRatio: "",
      topazUpscalerModel: "Proteus",
      topazUpscalerFactor: 2,
      topazUpscalerTargetFps: "source",
      topazUpscalerBillingTier: "auto",
      topazUpscalerH264Output: false,
      topazUpscalerCompression: "",
      topazUpscalerNoise: "",
      topazUpscalerHalo: "",
      topazUpscalerGrain: "",
      topazUpscalerRecoverDetail: "",
      numInferenceSteps: 27,
      guidanceScale: 6,
      shift: 5,
      seed: ""
    };
  }
  if (type === "style") return { title, stylePreset: "None" };
  if (type === "imageModel") {
    return {
      title,
      model: "Nano Banana Pro",
      prompt: "",
      aspectRatio: "21:9",
      resolution: "2K",
      batchCount: "1"
    };
  }

  return {
    title,
    model: "Seedance 2.0",
    prompt: "",
    duration: "15 seconds",
    resolution: "720p",
    aspectRatio: "16:9 (Landscape)",
    generateAudio: true,
    negativePrompt: "",
    multiShots: false,
    enableSafetyChecker: true,
    seed: "",
    batchCount: "1"
  };
}

function imageModelSelectionPatch(data = {}, model) {
  return {
    model,
    aspectRatio: normalizeImageModelAspectRatio(data.aspectRatio, model)
  };
}

function normalizeModel3DGenerateType(value) {
  return value === "Geometry" ? "Geometry" : "Normal";
}

function model3DFaceCount(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 500000;
  return Math.min(1500000, Math.max(40000, number));
}

function model3DInputPortIds() {
  return model3DViewInputs.map((input) => input.id);
}

function isModel3DImageInputPort(portId) {
  return model3DInputPortIds().includes(portId) || portId === "imageIn";
}

function imageModelAspectRatioOptions(model) {
  return [imageModelAutoAspectRatio, ...imageModelSupportedAspectRatios(model)];
}

function imageModelSupportedAspectRatios(model) {
  return isOpenAiImageModel(model) ? openAiImageAspectRatios : nanoImageAspectRatios;
}

function normalizeImageModelAspectRatio(value, model) {
  if (isAutoImageAspectRatio(value)) return imageModelAutoAspectRatio;
  const ratio = extractAspectRatio(value);
  return imageModelSupportedAspectRatios(model).includes(ratio) ? ratio : "21:9";
}

function isAutoImageAspectRatio(value) {
  return String(value || "").toLowerCase() === "auto";
}

function isOpenAiImageModel(model) {
  return String(model || "").toLowerCase().includes("openai");
}

function isWanFunControlModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("wan fun") || normalized.includes("wan-fun") || normalized === "wan";
}

function isWan27ReferenceModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("wan 2.7") || normalized.includes("wan2.7") || normalized.includes("reference-to-video");
}

function isAuroraModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("aurora") || normalized.includes("creatify");
}

function isHappyHorseModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("happy") || normalized.includes("horse") || normalized.includes("alibaba");
}

function videoModelSelectionPatch(data = {}, model) {
  if (isWan27ReferenceModel(model)) {
    return {
      model,
      duration: isWan27ReferenceModel(data.model) ? normalizedWan27ReferenceDurationLabel(data.duration) : "5 seconds",
      resolution: isWan27ReferenceModel(data.model) ? normalizedWan27ReferenceResolution(data.resolution) : "1080p",
      aspectRatio: isWan27ReferenceModel(data.model) ? normalizedWan27ReferenceAspectRatio(data.aspectRatio) : "16:9",
      negativePrompt: data.negativePrompt || "",
      multiShots: Boolean(data.multiShots),
      enableSafetyChecker: data.enableSafetyChecker !== false,
      seed: data.seed || ""
    };
  }

  if (!isHappyHorseModel(model)) {
    return { model };
  }

  return {
    model,
    duration: isHappyHorseModel(data.model) ? normalizedHappyHorseDurationLabel(data.duration) : "5 seconds",
    resolution: isHappyHorseModel(data.model) ? normalizedHappyHorseResolution(data.resolution) : "1080p",
    aspectRatio: isHappyHorseModel(data.model) ? normalizedHappyHorseAspectRatio(data.aspectRatio) : "16:9",
    enableSafetyChecker: data.enableSafetyChecker !== false,
    seed: data.seed || ""
  };
}

function normalizedHappyHorseDurationLabel(value) {
  const number = Math.min(15, Math.max(3, Math.round(Number(String(value || "").match(/\d+/)?.[0]) || 5)));
  return `${number} seconds`;
}

function normalizedHappyHorseResolution(value) {
  const normalized = String(value || "1080p");
  return ["720p", "1080p"].includes(normalized) ? normalized : "1080p";
}

function normalizedHappyHorseAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return ["16:9", "9:16", "1:1", "4:3", "3:4"].includes(normalized) ? normalized : "16:9";
}

function isSam3ImageModel(model) {
  if (!sam3SegmentationModelsEnabled) return false;
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("sam") && normalized.includes("image");
}

function isSam3VideoModel(model) {
  if (!sam3SegmentationModelsEnabled) return false;
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("sam") && normalized.includes("video");
}

function isDepthAnythingModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("depth") || normalized.includes("anything");
}

function isPatinaModel(model) {
  return String(model || "").toLowerCase().includes("patina");
}

function isUtilityColorIdMatteModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("color") && normalized.includes("matte");
}

function isUtilityCompositeVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("composite");
}

function isUtilityWanVaceMaskToVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("vace") && normalized.includes("mask");
}

function isUtilityWanVaceInpaintingModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("vace") && normalized.includes("inpaint");
}

function isUtilityStillFrameModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("still") || normalized.includes("frame");
}

function isUtilitySam3ImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("sam") && normalized.includes("image");
}

function isUtilitySam3VideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("sam") && normalized.includes("video");
}

function isUtilityBirefnetImageModel(model) {
  return String(model || "").toLowerCase().includes("birefnet");
}

function isUtilityBirefnetVideoModel(model) {
  return String(model || "").toLowerCase().includes("birefnet");
}

function isUtilityRifeVideoModel(model) {
  return String(model || "").toLowerCase().includes("rife");
}

function isUtilityExtractFrameVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("extract") || normalized.includes("current frame") || normalized.includes("video frame");
}

function isUtilityBytedanceUpscalerModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("bytedance") && normalized.includes("upscal");
}

function isUtilityTopazUpscalerModel(model) {
  return String(model || "").toLowerCase().includes("topaz");
}

function isUtilityVideoUpscalerModel(model) {
  return isUtilityBytedanceUpscalerModel(model) || isUtilityTopazUpscalerModel(model);
}

function isUtilityVoidVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("void") || (normalized.includes("inpaint") && !normalized.includes("vace") && !normalized.includes("wan"));
}

function utilityMode(node) {
  return node?.data?.utilityMode === "image" ? "image" : "video";
}

function utilityOutputType(node) {
  if (utilityMode(node) === "video" && isUtilityExtractFrameVideoModel(node?.data?.utilityVideoModel)) return "image";
  return utilityMode(node);
}

function utilityResultType(node) {
  return node?.data?.resultType || utilityMode(node);
}

function utilityInputPortIds(mode, imageModel = utilityImageModelNames.dwpose, videoModel = utilityVideoModelNames.wanFunControl) {
  if (mode === "image") {
    if (isUtilityStillFrameModel(imageModel)) return ["referenceVideoIn"];
    return isUtilitySam3ImageModel(imageModel) ? ["promptIn", "imageIn"] : ["imageIn"];
  }

  if (isUtilityBirefnetVideoModel(videoModel)) return ["referenceVideoIn"];
  if (isUtilityRifeVideoModel(videoModel)) return ["referenceVideoIn"];
  if (isUtilityExtractFrameVideoModel(videoModel)) return ["referenceVideoIn"];
  if (isUtilityColorIdMatteModel(videoModel)) return ["referenceVideoIn"];
  if (isUtilityCompositeVideoModel(videoModel)) return ["referenceVideoIn", "maskVideoIn"];
  if (isUtilityWanVaceMaskToVideoModel(videoModel)) return ["promptIn", "referenceImageIn", "referenceVideoIn", "maskVideoIn"];
  if (isUtilityWanVaceInpaintingModel(videoModel)) return ["promptIn", "referenceImageIn", "referenceVideoIn", "maskVideoIn"];
  if (isUtilityVideoUpscalerModel(videoModel)) return ["referenceVideoIn"];
  if (isUtilityVoidVideoModel(videoModel)) return ["promptIn", "referenceVideoIn", "maskVideoIn"];
  return isUtilitySam3VideoModel(videoModel) ? ["promptIn", "referenceVideoIn"] : ["promptIn", "referenceImageIn", "referenceVideoIn"];
}

function normalizedUtilityImageModelName(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("color") && normalized.includes("matte")) return utilityImageModelNames.colorIdMatte;
  if (normalized.includes("still") || normalized.includes("frame")) return utilityImageModelNames.stillFrame;
  if (normalized.includes("sam") && normalized.includes("image")) return utilityImageModelNames.sam3Image;
  if (normalized.includes("birefnet")) return utilityImageModelNames.birefnetImage;
  if (normalized.includes("depth") || normalized.includes("anything")) return utilityImageModelNames.depthAnything;
  if (normalized.includes("patina")) return utilityImageModelNames.patina;
  return utilityImageModelNames.dwpose;
}

function normalizedUtilityVideoModelName(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("color") && normalized.includes("matte")) return utilityVideoModelNames.colorIdMatte;
  if (normalized.includes("composite")) return utilityVideoModelNames.compositeVideo;
  if (normalized.includes("vace") || (normalized.includes("wan") && (normalized.includes("mask") || normalized.includes("inpaint")))) return utilityVideoModelNames.wanFunControl;
  if (normalized.includes("sam") && normalized.includes("video")) return utilityVideoModelNames.sam3Video;
  if (normalized.includes("birefnet")) return utilityVideoModelNames.birefnetVideo;
  if (normalized.includes("rife")) return utilityVideoModelNames.rifeVideo;
  if (isUtilityExtractFrameVideoModel(normalized)) return utilityVideoModelNames.extractFrame;
  if (normalized.includes("bytedance") && normalized.includes("upscal")) return utilityVideoModelNames.bytedanceUpscaler;
  if (normalized.includes("topaz")) return utilityVideoModelNames.topazUpscaler;
  if (normalized.includes("void") || normalized.includes("inpaint")) return utilityVideoModelNames.voidVideoInpainting;
  return utilityVideoModelNames.wanFunControl;
}

function utilityVideoOutputType(model) {
  return isUtilityExtractFrameVideoModel(model) ? "image" : "video";
}

function utilityModelDescription(model) {
  return utilityModelDescriptions[model] || "Utility preprocessing model.";
}

function patinaMapsForData(data = {}) {
  const selectedMaps = Array.isArray(data.patinaMaps) ? data.patinaMaps : patinaMapOptions.map((option) => option.id);
  const validMaps = selectedMaps.filter((mapId) => patinaMapOptions.some((option) => option.id === mapId));
  return validMaps.length ? [...new Set(validMaps)] : patinaMapOptions.map((option) => option.id);
}

function visiblePortIdsForNode(node) {
  if (node?.type === "utility") {
    return [...utilityInputPortIds(node.data?.utilityMode, node.data?.utilityImageModel, node.data?.utilityVideoModel), "utilityOut"];
  }

  return [...inputPortIdsForNode(node), ...outputPortIdsForNode(node)];
}

function inputPortIdsForNode(node) {
  return (getNodeConfig(node?.type)?.input || []).map((port) => port.id);
}

function activeInputPortIdsForNode(node) {
  if (node?.type === "utility") {
    return utilityInputPortIds(node.data?.utilityMode, node.data?.utilityImageModel, node.data?.utilityVideoModel);
  }

  return inputPortIdsForNode(node);
}

function outputPortIdsForNode(node) {
  return (getNodeConfig(node?.type)?.output || []).map((port) => port.id);
}

function estimatedNodeWidth(type) {
  if (type === "imageModel" || type === "videoModel" || type === "utility" || type === "model3d") return 370;
  if (type === "imageModel" || type === "videoModel" || type === "utility") return 370;
  if (type === "character") return 760;
  if (type === "camera") return 360;
  if (type === "transfer" || type === "preview") return 335;
  return 310;
}

function configTitleFallback(type) {
  return nodeCatalog.find((item) => item.type === type)?.label || "Node";
}

function mediaAccept(type) {
  if (type === "image") return "image/png,image/jpeg,image/webp";
  if (type === "video") return "video/mp4,video/quicktime,video/webm";
  return "audio/mpeg,audio/wav,audio/mp4";
}

function allowFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();
}

function firstAcceptedFile(fileList, type) {
  const files = Array.from(fileList || []);
  if (type === "image") return files.find((file) => file.type.startsWith("image/"));
  if (type === "video") return files.find((file) => file.type.startsWith("video/"));
  if (type === "audio") return files.find((file) => file.type.startsWith("audio/"));
  return files[0];
}

function buildIncomingByNode(nodes, edges) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges.reduce((incoming, edge) => {
    const source = nodeMap.get(edge.from.nodeId);
    if (!source) return incoming;
    incoming[edge.to.nodeId] ||= {};
    incoming[edge.to.nodeId][edge.to.port] ||= [];
    incoming[edge.to.nodeId][edge.to.port].push({ edge, source });
    return incoming;
  }, {});
}

function buildConnectedPortKeys(edges) {
  const keys = new Set();
  edges.forEach((edge) => {
    keys.add(`${edge.from.nodeId}:${edge.from.port}`);
    keys.add(`${edge.to.nodeId}:${edge.to.port}`);
  });
  return keys;
}

function buildReferenceTagHighlights(nodes, incomingByNode) {
  const highlights = new Map();

  nodes.forEach((node) => {
    const incoming = incomingByNode[node.id] || {};
    const prompt = connectedText(incoming.promptIn) || node.data.prompt || "";
    const matches = node.type === "imageModel" && !isSam3ImageModel(node.data.model)
      ? imageModelCharacterTagMatches(prompt, incoming.characterIn)
      : node.type === "videoModel" && !isWanFunControlModel(node.data.model) && !isAuroraModel(node.data.model) && !isSam3VideoModel(node.data.model)
        ? videoModelReferenceTagMatches(prompt, incoming)
        : [];

    matches.forEach((match) => {
      if (!highlights.has(match.nodeId)) {
        highlights.set(match.nodeId, match);
      }
    });
  });

  return highlights;
}

function buildActiveEdgeIds(nodes, edges) {
  const activeNodeIds = new Set(nodes.filter((node) => node.data?.status === "running").map((node) => node.id));
  return new Set(edges.filter((edge) => activeNodeIds.has(edge.to.nodeId)).map((edge) => edge.id));
}

function buildInactiveEdgeIds(nodes, edges) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return new Set(
    edges
      .filter((edge) => {
        const source = nodeMap.get(edge.from.nodeId);
        return (
          (source?.type === "transfer" || source?.type === "character") &&
          (!source.data?.locked || !source.data?.activated || !source.data?.resultUrl)
        );
      })
      .map((edge) => edge.id)
  );
}

function connectedText(items = [], incomingByNode = null, visited = new Set()) {
  return items
    .map(({ source }) => {
      if (source.type === "text") return source.data.resultText || source.data.text;
      if (source.type === "imageModel" || source.type === "videoModel" || source.type === "utility") return source.data.resultText;
      if (source.type === "composer") {
        if (visited.has(source.id)) return source.data.prompt || "";
        const nextVisited = new Set(visited);
        nextVisited.add(source.id);
        const incomingPrompt = incomingByNode ? connectedText(incomingByNode[source.id]?.promptIn || [], incomingByNode, nextVisited) : "";
        return incomingPrompt || source.data.prompt || "";
      }
      return source.data.title;
    })
    .filter(Boolean)
    .join("\n");
}

function connectedAssetUrls(items = []) {
  return items.map(({ source }) => source.data.resultUrl).filter(Boolean);
}

function connectedAssetItems(items = []) {
  return items
    .map(({ source }) => {
      const url = source.data.resultUrl;
      if (!url) return null;
      return {
        url,
        type: previewMediaType(source, { from: { port: "" }, to: { port: "" } }),
        label: sourceLabel(source)
      };
    })
    .filter(Boolean);
}

function connectedTextInputItems(items = []) {
  return items
    .map(({ source }) => ({
      label: sourceLabel(source),
      text: source.type === "text" ? source.data.resultText || source.data.text : source.data.resultText || source.data.prompt || source.data.title
    }))
    .filter((item) => item.text);
}

function connectedStyleInputItems(items = []) {
  return items
    .map(({ source }) => ({
      label: `Style: ${sourceLabel(source)}`,
      text: promptPiecesForSource(source).join("\n\n")
    }))
    .filter((item) => item.text);
}

function connectedMediaInputItems(items = [], mediaType) {
  return items
    .map(({ source }) => {
      if (!source.data.resultUrl) return null;
      return {
        url: source.data.resultUrl,
        label: sourceLabel(source),
        type: mediaType
      };
    })
    .filter(Boolean);
}

async function runTextNodeProcessing({ node, incoming, projectId, projectName, workflowContext }) {
  const { response, data } = await fetchJsonApi("/api/node/process-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: node.data.text,
      textInputs: [...connectedTextInputItems(incoming.textIn), ...connectedStyleInputItems(incoming.styleIn)],
      imageInputs: connectedMediaInputItems(incoming.imageIn, "image"),
      videoInputs: connectedMediaInputItems(incoming.videoIn, "video"),
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "Text processing");
  if (!response.ok) throw new Error(data.error || "Text processing failed.");

  return {
    text: data.text || "",
    model: data.model || ""
  };
}

function connectedAssetLabels(items = []) {
  return items
    .filter(({ source }) => source.data.resultUrl)
    .map(({ source }) => source.data.title || sourceLabel(source));
}

function connectedCharacterReferences(items = []) {
  return items
    .filter(({ source }) => source.type === "character" && source.data.locked && source.data.activated && source.data.resultUrl)
    .map(({ source }) => ({
      url: source.data.resultUrl,
      label: characterTag(source)
    }));
}

function connectedCharacterVoiceUrls(items = []) {
  return items
    .filter(({ source }) => source.type === "character" && source.data.locked && source.data.activated)
    .map(({ source }) => activeCharacterVoice(source)?.localUrl)
    .filter(Boolean);
}

function connectedAudioUrls(items = []) {
  return items
    .map(({ source, edge }) => (source.type === "character" && edge.from.port === "voiceOut" ? activeCharacterVoice(source)?.localUrl : source.data.resultUrl))
    .filter(Boolean);
}

function videoModelReferenceTagMatches(prompt, incoming = {}) {
  const text = String(prompt || "");
  const imageCandidates = referenceTagCandidates(incoming.referenceImageIn, 0, "Image");
  const videoCandidates = referenceTagCandidates(incoming.referenceVideoIn, imageCandidates.length, "Video");
  const characterCandidates = characterTagCandidates(incoming.characterIn, imageCandidates.length + videoCandidates.length);
  return [...imageCandidates, ...videoCandidates, ...characterCandidates].filter((match) => promptHasTag(text, match.tag));
}

function imageModelCharacterTagMatches(prompt, items = []) {
  const text = String(prompt || "");
  return characterTagCandidates(items).filter((match) => promptHasTag(text, match.tag));
}

function referenceTagCandidates(items = [], colorOffset = 0, fallbackPrefix = "Image") {
  return items
    .filter(({ source }) => source.data.resultUrl)
    .map(({ source }, index) => ({
      nodeId: source.id,
      tag: cleanPromptTag(source.data.title || sourceLabel(source)) || `${fallbackPrefix}${index + 1}`,
      color: referenceTagPalette[(colorOffset + index) % referenceTagPalette.length],
      type: fallbackPrefix.toLowerCase()
    }));
}

function characterTagCandidates(items = [], colorOffset = 0) {
  return items
    .filter(({ source }) => source.type === "character" && source.data.locked && source.data.activated && source.data.resultUrl)
    .map(({ source }, index) => ({
      nodeId: source.id,
      tag: characterTag(source),
      color: portColors.character || referenceTagPalette[(colorOffset + index) % referenceTagPalette.length],
      type: "character"
    }));
}

function promptHighlightParts(value, tagMatches = []) {
  const text = String(value || "");
  if (!text) return [{ text: "", active: false }];

  const tagMap = new Map(tagMatches.map((match) => [match.tag.toLowerCase(), match]));
  const parts = [];
  const tagPattern = /@([A-Za-z0-9_-]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = tagPattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), active: false });
    }

    const tagMatch = tagMap.get(match[1].toLowerCase());
    parts.push({
      text: match[0],
      active: Boolean(tagMatch),
      color: tagMatch?.color
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), active: false });
  }

  return parts;
}

function promptHasTag(prompt, tag) {
  if (!tag) return false;
  return new RegExp(`@${escapeRegExp(tag)}(?![A-Za-z0-9_-])`, "i").test(prompt);
}

function cleanPromptTag(value) {
  return String(value || "")
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 28);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runCameraQwenEdit({ node, incoming, projectId, projectName, workflowContext }) {
  const imageUrl = connectedAssetUrls(incoming.imageIn).at(-1);
  if (!imageUrl) throw new Error("Connect an image to the Camera node.");

  const { response, data } = await fetchJsonApi("/api/node/qwen-camera-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrls: [imageUrl],
      horizontalAngle: finiteNumber(node.data.horizontalAngle, qwenCameraDefaults.horizontalAngle),
      verticalAngle: finiteNumber(node.data.verticalAngle, qwenCameraDefaults.verticalAngle),
      zoom: finiteNumber(node.data.zoom, qwenCameraDefaults.zoom),
      additionalPrompt: node.data.additionalPrompt || "",
      loraScale: finiteNumber(node.data.loraScale, qwenCameraDefaults.loraScale),
      guidanceScale: finiteNumber(node.data.guidanceScale, qwenCameraDefaults.guidanceScale),
      numInferenceSteps: finiteNumber(node.data.numInferenceSteps, qwenCameraDefaults.numInferenceSteps),
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "Camera edit");
  if (!response.ok) throw new Error(data.error || "Camera edit failed.");

  return {
    url: data.image.localUrl,
    type: "image",
    label: "Camera image",
    prompt: data.prompt || "",
    seed: data.seed,
    cost: data.cost
  };
}

async function runUtilityImageGeneration({ node, prompt, incoming, projectId, projectName, workflowContext }) {
  const modelName = normalizedUtilityImageModelName(node.data.utilityImageModel);
  if (isUtilityStillFrameModel(modelName)) {
    const videoUrl = connectedAssetUrls(incoming.referenceVideoIn).at(-1);
    if (!videoUrl) throw new Error("Connect a video to the Utility node.");
    const still = await grabStillFrameFromVideo({
      videoUrl,
      requestedTime: node.data.stillFrameTime,
      nodeTitle: node.data.title,
      workflowContext
    });
    return [still];
  }

  const imageUrl = connectedAssetUrls(incoming.imageIn).at(-1);
  if (!imageUrl) throw new Error("Connect an image to the Utility node.");
  const model = normalizedUtilityImageModelName(node.data.utilityImageModel);

  if (isUtilityColorIdMatteModel(model)) {
    return [await runColorIdMatteUtilityImage({ node, imageUrl, projectId, projectName, workflowContext })];
  }

  const { response, data } = await fetchJsonApi("/api/node/utility-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      imageUrls: [imageUrl],
      dwposeDrawMode: node.data.dwposeDrawMode || "body-pose",
      patinaMaps: patinaMapsForData(node.data),
      patinaOutputFormat: node.data.patinaOutputFormat || "png",
      patinaSeed: node.data.patinaSeed || "",
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "Utility image");
  if (!response.ok) throw new Error(data.error || "Utility image failed.");

  const images = Array.isArray(data.images) ? data.images : data.image ? [data.image] : [];
  if (!images.length) throw new Error(`${data.modelName || "Utility image"} returned no images.`);
  return images.map((image, index) => ({
    url: image.localUrl,
    type: "image",
    label: image.label || `${data.modelName || "Image"} ${index + 1}`,
    text: data.text || "",
    seed: data.seed,
    cost: data.cost
  }));
}

async function runColorIdMatteUtilityImage({ node, imageUrl, projectId, projectName, workflowContext }) {
  const color = normalizeColorIdMatteColor(node.data.colorIdMatteColor);
  if (!color) throw new Error("Pick a color in the Utility node.");

  const tolerance = colorIdMatteTolerance(node.data.colorIdMatteTolerance);
  const sampleRadius = colorIdMatteSampleRadius(node.data.colorIdMatteSampleRadius);
  const invert = Boolean(node.data.colorIdMatteInvert);
  const mask = await createColorIdMatteBlob(imageUrl, color, { tolerance, invert });
  const file = new File([mask.blob], "color-id-matte.png", { type: "image/png" });
  const form = new FormData();
  form.append("asset", file);
  form.append("sourceImageUrl", imageUrl);
  form.append("selectedColor", rgbToHex(color));
  form.append("tolerance", String(tolerance));
  form.append("sampleRadius", String(sampleRadius));
  form.append("invert", invert ? "true" : "false");
  form.append("matchedPixels", String(mask.matchedPixels));
  form.append("width", String(mask.width));
  form.append("height", String(mask.height));
  appendWorkflowContextFormFields(form, workflowContext, projectId, projectName);
  form.append("nodeId", node.id);
  form.append("nodeTitle", node.data.title || "");

  const { response, data } = await fetchJsonApi("/api/node/color-id-matte", {
    method: "POST",
    body: form
  }, "Color ID matte");
  if (!response.ok) throw new Error(data.error || "Color ID matte failed.");

  return {
    url: data.image.localUrl,
    type: "image",
    label: data.image.label || "Color ID Matte",
    text: data.text || "",
    cost: data.cost
  };
}

async function grabStillFrameFromVideo({ videoUrl, requestedTime, nodeTitle, workflowContext }) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  try {
    video.load();
    await waitForMediaEvent(video, "loadedmetadata");
    if (video.readyState < 2) {
      await waitForMediaEvent(video, "loadeddata");
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const requested = Math.max(0, Number(requestedTime) || 0);
    const targetTime = duration ? Math.min(requested, Math.max(0, duration - 0.04)) : requested;
    if (targetTime > 0.01) {
      await seekVideoFrame(video, targetTime);
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("Could not read video dimensions.");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, "image/png");
    const fileName = `${safeStillFrameName(nodeTitle)}-${formatFrameTime(targetTime)}.png`;
    const form = new FormData();
    appendWorkflowContextFormFields(form, workflowContext);
    form.append("asset", new File([blob], fileName, { type: "image/png" }));

    const { response, data } = await fetchJsonApi("/api/node/upload-asset", {
      method: "POST",
      body: form
    }, "Still frame upload");
    if (!response.ok) throw new Error(data.error || "Could not save still frame.");

    return {
      url: data.asset.localUrl,
      type: "image",
      label: `Still ${formatFrameTime(targetTime)}`,
      text: "",
      seed: null,
      cost: null
    };
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function waitForMediaEvent(element, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(eventName, handleEvent);
      element.removeEventListener("error", handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Could not load video."));
    };
    element.addEventListener(eventName, handleEvent, { once: true });
    element.addEventListener("error", handleError, { once: true });
  });
}

function seekVideoFrame(video, time) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Could not seek video."));
    };
    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = time;
  });
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render still frame."));
    }, type);
  });
}

function safeStillFrameName(value) {
  return String(value || "still-frame")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "still-frame";
}

function formatFrameTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value).toString().padStart(2, "0")}-${Math.round((value % 1) * 10)}`;
}

function formatTimelineTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const wholeSeconds = Math.floor(value % 60);
  const tenths = Math.floor((value % 1) * 10);
  return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}.${tenths}`;
}

async function fetchJsonApi(path, options, label) {
  const requestUrl = localApiFetchUrl(path);
  let response;
  try {
    response = await fetch(requestUrl, options);
  } catch (error) {
    if (requestUrl !== path) {
      try {
        response = await fetch(path, options);
      } catch {
        throw new Error(`${label} failed. Could not reach the local app server. Restart npm run dev and try again. ${error.message || ""}`.trim());
      }
    } else {
      throw new Error(`${label} failed. Could not reach the local app server. Restart npm run dev and try again. ${error.message || ""}`.trim());
    }
  }

  try {
    return {
      response,
      data: await readJsonResponse(response, label)
    };
  } catch (error) {
    if (!error.htmlApiResponse || !canRetryLocalApi(path) || requestUrl !== path) throw error;

    try {
      const healthResponse = await fetch("http://127.0.0.1:3333/api/health");
      const healthData = await readJsonResponse(healthResponse, "Server health");
      const routeKey = path.includes("utility-image")
        ? "utilityImage"
        : path.includes("utility-video")
          ? "utilityVideo"
          : path.includes("extract-video-frame")
            ? "extractVideoFrame"
          : path.includes("color-id-matte")
            ? "colorIdMatte"
          : path.includes("composer-frame")
            ? "composerFrame"
            : path.includes("composer-poses")
              ? "composerPoses"
              : path.includes("generate-3d")
                ? "generate3d"
                : "";
      if (!healthResponse.ok || (routeKey && !healthData?.routes?.[routeKey])) {
        throw new Error("The backend is running, but it does not have the updated API routes.");
      }

      const retryResponse = await fetch(`http://127.0.0.1:3333${path}`, options);
      return {
        response: retryResponse,
        data: await readJsonResponse(retryResponse, label)
      };
    } catch (retryError) {
      throw new Error(
        `${label} failed. ${retryError.message || "Could not reach the updated backend route."} Restart npm run dev so the updated server is active.`
      );
    }
  }
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const looksLikeHtml = text.trim().startsWith("<");
    const statusText = response?.status ? `HTTP ${response.status}` : "unknown status";
    const responseUrl = response?.url || "unknown URL";
    const contentType = response?.headers?.get?.("content-type") || "unknown content type";
    const error = new Error(
      `${label} failed. ${
        looksLikeHtml
          ? `The server returned an HTML page instead of API data from ${responseUrl} (${statusText}, ${contentType}). Restart npm run dev so the updated backend route is active.`
          : "The server returned a response that was not valid JSON."
      }`
    );
    error.htmlApiResponse = looksLikeHtml;
    throw error;
  }
}

function localApiFetchUrl(path) {
  if (!canRetryLocalApi(path)) return path;
  return `http://127.0.0.1:3333${path}`;
}

function canRetryLocalApi(path) {
  if (!String(path || "").startsWith("/api/")) return false;
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0";
  return isLocalhost && window.location.port !== "3333";
}

function workflowContextPayload(workflowContext = {}, projectId = "", projectName = "") {
  return {
    projectId: workflowContext.projectId || projectId || "",
    projectName: workflowContext.projectName || projectName || "Untitled node project",
    workflowPackageId: workflowContext.workflowPackageId || "",
    workflowPackagePath: workflowContext.workflowPackagePath || ""
  };
}

function appendWorkflowContextFormFields(form, workflowContext = {}, projectId = "", projectName = "") {
  Object.entries(workflowContextPayload(workflowContext, projectId, projectName)).forEach(([key, value]) => {
    form.append(key, value || "");
  });
}

async function runImageModelGeneration({ node, prompt, aspectRatio, imagePromptItems, projectId, projectName, workflowContext, index }) {
  const { response, data } = await fetchJsonApi("/api/node/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: node.data.model,
      aspectRatio: aspectRatio || node.data.aspectRatio,
      requestedAspectRatio: node.data.aspectRatio,
      resolution: node.data.resolution,
      imagePromptUrls: imagePromptItems.map((item) => item.url),
      imagePromptLabels: imagePromptItems.map((item) => item.label),
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "Image generation");
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Image generation failed."}`);

  return {
    url: data.image.localUrl,
    type: "image",
    label: `Image ${index + 1}`,
    text: data.text || "",
    cost: data.cost
  };
}

function normalizedWan27ReferenceDurationLabel(value) {
  const number = Math.min(10, Math.max(2, Math.round(Number(String(value || "").match(/\d+/)?.[0]) || 5)));
  return `${number} seconds`;
}

function normalizedWan27ReferenceResolution(value) {
  const normalized = String(value || "1080p");
  return wan27ReferenceResolutionOptions.includes(normalized) ? normalized : "1080p";
}

function normalizedWan27ReferenceAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return wan27ReferenceAspectRatioOptions.includes(normalized) ? normalized : "16:9";
}

async function run3DModelGeneration({ node, incoming, projectId, projectName, workflowContext }) {
  const imageViewUrls = connected3DViewUrls(incoming);
  if (!imageViewUrls.front) throw new Error("Connect a front image to the 3D node.");

  const { response, data } = await fetchJsonApi("/api/node/generate-3d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: node.data.model || model3DNames.hunyuanPro,
      imageViewUrls,
      generateType: normalizeModel3DGenerateType(node.data.generateType),
      enablePbr: Boolean(node.data.enablePbr),
      faceCount: model3DFaceCount(node.data.faceCount),
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "3D generation");
  if (!response.ok) throw new Error(data.error || "3D generation failed.");

  return {
    url: data.model.localUrl,
    type: "model3d",
    label: data.model.label || data.model.fileName || "3D model",
    text: data.text || "",
    thumbnailUrl: data.thumbnail?.localUrl || "",
    seed: data.seed,
    cost: data.cost
  };
}

async function runCharacterSheetGeneration({ node, prompt, portrait, wardrobe, projectId, projectName, workflowContext }) {
  const references = [
    { url: portrait.localUrl, label: "The Character portrait reference" },
    ...(wardrobe?.localUrl ? [{ url: wardrobe.localUrl, label: "Selected wardrobe sheet" }] : [])
  ];
  const { response, data } = await fetchJsonApi("/api/node/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: "OpenAI Image 2",
      aspectRatio: "16:9",
      resolution: "4K",
      imagePromptUrls: references.map((item) => item.url),
      imagePromptLabels: references.map((item) => item.label),
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: `${node.data.title || "Character"} Character Sheet`
    })
  }, "Character sheet generation");
  if (!response.ok) throw new Error(data.error || "Character sheet generation failed.");

  return {
    url: data.image.localUrl,
    type: "image",
    label: `@${characterTag(node)} Character Sheet`,
    fileName: data.image.fileName,
    text: data.text || "",
    cost: data.cost
  };
}

function connected3DViewUrls(incoming = {}) {
  return Object.fromEntries(
    model3DViewInputs
      .map((view) => {
        const items = view.id === "frontImageIn" ? [...(incoming.frontImageIn || []), ...(incoming.imageIn || [])] : incoming[view.id] || [];
        const url = connectedAssetUrls(items).at(-1);
        return [view.view, url || ""];
      })
      .filter(([, url]) => url)
  );
}

async function runVideoModelGeneration({ node, prompt, incoming, projectId, projectName, workflowContext, index }) {
  const characterReferences = connectedCharacterReferences(incoming.characterIn);
  const characterVoices = connectedCharacterVoiceUrls(incoming.characterIn);
  const { response, data } = await fetchJsonApi("/api/node/generate-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: node.data.model,
      duration: node.data.duration,
      resolution: node.data.resolution,
      aspectRatio: node.data.aspectRatio,
      generateAudio: node.data.generateAudio,
      seed: node.data.seed || "",
      enableSafetyChecker: node.data.enableSafetyChecker !== false,
      startFrameUrls: connectedAssetUrls(incoming.startFrameIn),
      endFrameUrls: connectedAssetUrls(incoming.endFrameIn),
      referenceImageUrls: [...connectedAssetUrls(incoming.referenceImageIn), ...characterReferences.map((item) => item.url)],
      referenceImageLabels: [...connectedAssetLabels(incoming.referenceImageIn), ...characterReferences.map((item) => item.label)],
      referenceVideoUrls: connectedAssetUrls(incoming.referenceVideoIn),
      referenceVideoLabels: connectedAssetLabels(incoming.referenceVideoIn),
      referenceAudioUrls: [...new Set([...connectedAudioUrls(incoming.referenceAudioIn), ...characterVoices])],
      wan27Reference: {
        negativePrompt: node.data.negativePrompt || "",
        multiShots: Boolean(node.data.multiShots)
      },
      wanFunControl: {
        preprocessVideo: node.data.preprocessVideo !== false,
        preprocessType: node.data.preprocessType || "depth",
        matchInputNumFrames: node.data.matchInputNumFrames !== false,
        numFrames: node.data.numFrames || 81,
        matchInputFps: node.data.matchInputFps !== false,
        fps: node.data.fps || 16,
        numInferenceSteps: node.data.numInferenceSteps || 27,
        guidanceScale: node.data.guidanceScale || 6,
        shift: node.data.shift || 5,
        seed: node.data.seed || ""
      },
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "Video generation");
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Video generation failed."}`);

  return {
    url: data.video.localUrl,
    type: "video",
    label: `Video ${index + 1}`,
    seed: data.seed,
    cost: data.cost
  };
}

async function runUtilityVideoGeneration({ node, prompt, incoming, projectId, projectName, workflowContext, index }) {
  const model = normalizedUtilityVideoModelName(node.data.utilityVideoModel || utilityVideoModelNames.wanFunControl);
  const { response, data } = await fetchJsonApi("/api/node/utility-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      referenceImageUrls: connectedAssetUrls(incoming.referenceImageIn),
      referenceVideoUrls: connectedAssetUrls(incoming.referenceVideoIn),
      maskVideoUrls: connectedAssetUrls(incoming.maskVideoIn),
      extractFrame: {
        frameTime: node.data.extractFrameTime ?? 0,
        format: node.data.extractFrameFormat || "png"
      },
      wanFunControl: {
        preprocessVideo: node.data.preprocessVideo !== false,
        preprocessType: node.data.preprocessType || "depth",
        matchInputNumFrames: node.data.matchInputNumFrames !== false,
        numFrames: node.data.numFrames || 81,
        matchInputFps: node.data.matchInputFps !== false,
        fps: node.data.fps || 16,
        numInferenceSteps: node.data.numInferenceSteps || 27,
        guidanceScale: node.data.guidanceScale || 6,
        shift: node.data.shift || 5,
        seed: node.data.seed || ""
      },
      sam3Video: {
        detectionThreshold: node.data.sam3VideoDetectionThreshold ?? 0.5
      },
      colorIdMatte: {
        selectedColor: normalizeColorIdMatteColor(node.data.colorIdMatteColor) ? rgbToHex(normalizeColorIdMatteColor(node.data.colorIdMatteColor)) : "",
        tolerance: colorIdMatteTolerance(node.data.colorIdMatteTolerance),
        sampleRadius: colorIdMatteSampleRadius(node.data.colorIdMatteSampleRadius),
        invert: Boolean(node.data.colorIdMatteInvert),
        matteName: node.data.colorIdMatteName || "",
        mattes: colorIdMatteRunColors(node.data).map((item) => ({
          id: item.id,
          name: item.name,
          selectedColor: rgbToHex(item.color)
        })),
        blur: colorIdMatteBlur(node.data.colorIdMatteBlur),
        expand: colorIdMatteExpand(node.data.colorIdMatteExpand),
        startTime: node.data.colorIdMatteStartTime ?? "",
        endTime: node.data.colorIdMatteEndTime ?? "",
        outputFormat: node.data.colorIdMatteOutputFormat || "mp4"
      },
      compositeVideo: {
        invertMask: Boolean(node.data.compositeInvertMask),
        maskBlur: colorIdMatteBlur(node.data.compositeMaskBlur),
        maskExpand: colorIdMatteExpand(node.data.compositeMaskExpand),
        outputFormat: node.data.compositeOutputFormat || "mp4"
      },
      wanVaceMaskToVideo: {
        negativePrompt: node.data.wanVaceNegativePrompt || "",
        matchInputNumFrames: node.data.wanVaceMatchInputNumFrames !== false,
        numFrames: node.data.wanVaceNumFrames || 81,
        matchInputFps: node.data.wanVaceMatchInputFps !== false,
        fps: node.data.wanVaceFps || 16,
        resolution: node.data.wanVaceResolution || "720p",
        aspectRatio: node.data.wanVaceAspectRatio || "auto",
        numInferenceSteps: node.data.wanVaceNumInferenceSteps || 30,
        guidanceScale: node.data.wanVaceGuidanceScale || 5,
        sampler: node.data.wanVaceSampler || "unipc",
        shift: node.data.wanVaceShift || 5,
        enableSafetyChecker: node.data.wanVaceEnableSafetyChecker !== false,
        enablePromptExpansion: Boolean(node.data.wanVaceEnablePromptExpansion),
        preprocess: Boolean(node.data.wanVacePreprocess),
        acceleration: node.data.wanVaceAcceleration || "regular",
        videoQuality: node.data.wanVaceVideoQuality || "high",
        videoWriteMode: node.data.wanVaceVideoWriteMode || "balanced",
        numInterpolatedFrames: node.data.wanVaceNumInterpolatedFrames || 0
      },
      wanVaceInpainting: {
        negativePrompt: node.data.wanVaceNegativePrompt || "",
        matchInputNumFrames: node.data.wanVaceMatchInputNumFrames !== false,
        numFrames: node.data.wanVaceNumFrames || 81,
        matchInputFps: node.data.wanVaceMatchInputFps !== false,
        fps: node.data.wanVaceFps || 16,
        resolution: node.data.wanVaceResolution || "720p",
        aspectRatio: node.data.wanVaceAspectRatio || "auto",
        numInferenceSteps: node.data.wanVaceNumInferenceSteps || 30,
        guidanceScale: node.data.wanVaceGuidanceScale || 5,
        sampler: node.data.wanVaceSampler || "unipc",
        shift: node.data.wanVaceShift || 5,
        enableSafetyChecker: node.data.wanVaceEnableSafetyChecker !== false,
        enablePromptExpansion: Boolean(node.data.wanVaceEnablePromptExpansion),
        preprocess: Boolean(node.data.wanVacePreprocess),
        acceleration: node.data.wanVaceAcceleration || "regular",
        videoQuality: node.data.wanVaceVideoQuality || "high",
        videoWriteMode: node.data.wanVaceVideoWriteMode || "balanced",
        numInterpolatedFrames: node.data.wanVaceNumInterpolatedFrames || 0
      },
      voidVideoInpainting: {
        maskPrompt: node.data.voidMaskPrompt || "",
        enablePass2Refinement: Boolean(node.data.voidPass2Refinement),
        negativePrompt: node.data.voidNegativePrompt || "",
        numInferenceSteps: node.data.voidNumInferenceSteps || 30,
        guidanceScale: node.data.voidGuidanceScale || 1,
        strength: node.data.voidStrength || 1,
        numFrames: normalizeVoidVideoFrameCount(node.data.voidNumFrames),
        enableSafetyChecker: node.data.voidEnableSafetyChecker !== false,
        seed: node.data.voidSeed || ""
      },
      rifeVideo: {
        numFrames: node.data.rifeNumFrames || 1,
        useSceneDetection: node.data.rifeUseSceneDetection !== false,
        useCalculatedFps: node.data.rifeUseCalculatedFps !== false,
        fps: node.data.rifeFps || 24,
        loop: Boolean(node.data.rifeLoop)
      },
      bytedanceVideoUpscaler: {
        targetResolution: node.data.bytedanceUpscalerTargetResolution || "1080p",
        targetFps: node.data.bytedanceUpscalerTargetFps || "30fps",
        enhancementPreset: node.data.bytedanceUpscalerPreset || "general",
        enhancementTier: node.data.bytedanceUpscalerTier || "standard",
        fidelity: node.data.bytedanceUpscalerFidelity || "high",
        scaleRatio: node.data.bytedanceUpscalerScaleRatio || ""
      },
      topazVideoUpscaler: {
        model: node.data.topazUpscalerModel || "Proteus",
        upscaleFactor: node.data.topazUpscalerFactor || 2,
        targetFps: node.data.topazUpscalerTargetFps === "source" ? "" : node.data.topazUpscalerTargetFps || "",
        billingResolutionTier: node.data.topazUpscalerBillingTier || "auto",
        h264Output: Boolean(node.data.topazUpscalerH264Output),
        compression: node.data.topazUpscalerCompression ?? "",
        noise: node.data.topazUpscalerNoise ?? "",
        halo: node.data.topazUpscalerHalo ?? "",
        grain: node.data.topazUpscalerGrain ?? "",
        recoverDetail: node.data.topazUpscalerRecoverDetail ?? ""
      },
      birefnet: {
        model: node.data.birefnetModel || "General Use (Light)",
        operatingResolution: node.data.birefnetOperatingResolution || "1024x1024",
        outputMask: Boolean(node.data.birefnetOutputMask),
        refineForeground: node.data.birefnetRefineForeground !== false,
        outputFormat: node.data.birefnetOutputFormat || "png",
        maskOnly: Boolean(node.data.birefnetMaskOnly),
        videoOutputType: node.data.birefnetVideoOutputType || "X264 (.mp4)",
        videoQuality: node.data.birefnetVideoQuality || "high",
        videoWriteMode: node.data.birefnetVideoWriteMode || "balanced"
      },
      ...workflowContextPayload(workflowContext, projectId, projectName),
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "Utility video");
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Utility video failed."}`);

  if (data.image?.localUrl) {
    return {
      url: data.image.localUrl,
      type: "image",
      label: data.image.label || data.modelName || `Frame ${index + 1}`,
      text: data.text || "",
      cost: data.cost
    };
  }

  if (Array.isArray(data.videos) && data.videos.length) {
    return data.videos
      .filter((video) => video?.localUrl)
      .map((video, itemIndex) => ({
        url: video.localUrl,
        type: "video",
        label: video.label || `${data.modelName || "Video"} ${itemIndex + 1}`,
        seed: data.seed,
        cost: itemIndex === 0 ? data.cost : null
      }));
  }

  return {
    url: data.video.localUrl,
    type: "video",
    label: data.modelName || `Video ${index + 1}`,
    seed: data.seed,
    cost: data.cost
  };
}

function normalizedResultItems(resultItems, resultUrl, type) {
  const items = Array.isArray(resultItems) ? resultItems.filter((item) => item?.url) : [];
  const fallbackLabel = mediaResultLabel(type);
  if (items.length) return items.map((item, index) => ({ type, label: `${fallbackLabel} ${index + 1}`, ...item }));
  return resultUrl ? [{ url: resultUrl, type, label: `${fallbackLabel} 1` }] : [];
}

function existingResultItemsForNode(node, type) {
  return normalizedResultItems(node?.data?.resultItems, node?.data?.resultUrl, type);
}

function appendResultItems(previousItems = [], newItems = [], type) {
  const combined = [...previousItems, ...normalizedResultItems(newItems, "", type)].filter((item) => item?.url);
  const fallbackLabel = mediaResultLabel(type);
  return combined.map((item, index) => ({
    ...item,
    type: item.type || type,
    label: item.label && !new RegExp(`^${fallbackLabel} \\d+$`).test(item.label) ? item.label : `${fallbackLabel} ${index + 1}`
  }));
}

function mediaResultLabel(type) {
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  if (type === "model3d") return "3D";
  return "Result";
}

function nodeBatchCount(node) {
  const count = Number(node.data.batchCount || 1);
  return Math.min(4, Math.max(1, Number.isFinite(count) ? count : 1));
}

function formatNodeBatchCount(value) {
  const count = Number(value) || 1;
  return `${count} gen${count === 1 ? "" : "s"}`;
}

function nodeBatchStatusMessage(mediaType, total, completed, failures) {
  const label = mediaType === "image" ? "image" : "video";
  const firstError = failures[0]?.reason?.message || "";
  return `${completed} of ${total} ${label} generations complete.${firstError ? ` ${firstError}` : ""}`;
}

function connectedPreviewSources(items = []) {
  return items
    .filter(({ source }) => source.data.resultUrl)
    .flatMap(({ source, edge }) => {
      const sourceType = previewMediaType(source, edge);
      const sourceName = source.type === "camera" && edge.from.port === "imageOut" ? "Camera image" : sourceLabel(source);
      const selectedResultIndex = Math.trunc(Number(source.data.selectedResultIndex));
      return normalizedResultItems(source.data.resultItems, source.data.resultUrl, sourceType).map((item, index, allItems) => ({
        ...item,
        sourceNodeId: source.id,
        sourceResultIndex: index,
        sourceSelectedResult: index === selectedResultIndex || item.url === source.data.resultUrl,
        type: item.type || sourceType,
        label: allItems.length > 1 ? `${sourceName} ${index + 1}` : sourceName
      }));
    });
}

function previewVideoSourceForNode(node, incomingByNode) {
  if (node?.type !== "preview") return null;
  const previewItems = connectedPreviewSources(incomingByNode?.[node.id]?.sourceIn || []);
  const previewIndex = previewSelectedIndexForNode(node, previewItems);
  const previewSource = previewItems[previewIndex] || null;
  return previewSource?.type === "video" ? previewSource : null;
}

function previewSelectedIndexForNode(node, previewItems = []) {
  const maxIndex = Math.max(0, previewItems.length - 1);
  const data = node?.data || {};
  if (data.previewSelectedIndex !== undefined && data.previewSelectedIndex !== null && data.previewSelectedIndex !== "") {
    const selectedIndex = Math.trunc(Number(data.previewSelectedIndex));
    return Math.min(Math.max(Number.isFinite(selectedIndex) ? selectedIndex : 0, 0), maxIndex);
  }

  const sourceSelectedIndex = previewItems.findIndex((item) => item.sourceSelectedResult);
  return sourceSelectedIndex >= 0 ? sourceSelectedIndex : 0;
}

function selectedPreviewSource(sources = [], selectedId) {
  if (!sources.length) return null;
  return sources.find((source) => source.id === selectedId) || sources.at(-1);
}

function previewMediaType(source, edge) {
  if (source.type === "utility") return utilityResultType(source);
  if (source.type === "model3d") return "model3d";
  if (source.type === "video" || source.type === "videoModel") return "video";
  if (/\.(glb|gltf)$/i.test(source.data.resultUrl || "")) return "model3d";
  if (/\.(mp4|mov|webm)$/i.test(source.data.resultUrl || "")) return "video";
  return "image";
}

function connectedImagePromptItems(items = []) {
  const namedCharacterReferences = activeConnectedCharacterSources(items).length > 1;

  return items
    .flatMap(({ source }) => {
      if (!source.data.resultUrl) return null;
      if (source.type === "character") {
        return { url: source.data.resultUrl, label: characterReferenceLabel(source, namedCharacterReferences) };
      }
      return {
        url: source.data.resultUrl,
        label: source.type === "composer" ? "Composer frame" : source.type === "transfer" ? moodBoardOutputFileName : sourceLabel(source)
      };
    })
    .filter(Boolean);
}

async function resolveImageModelAspectRatio(node, incoming = {}) {
  const configuredAspectRatio = node.data.aspectRatio || "21:9";
  if (!isAutoImageAspectRatio(configuredAspectRatio)) {
    return normalizeImageModelAspectRatio(configuredAspectRatio, node.data.model);
  }

  const imageUrl = imageModelAutoAspectInputUrls(incoming)[0];
  if (!imageUrl) {
    throw new Error("Auto aspect ratio needs a connected image.");
  }

  const dimensions = await imageDimensionsFromUrl(imageUrl);
  if (!dimensions) {
    throw new Error("Could not read the connected image size for Auto aspect ratio.");
  }

  return closestAspectRatio(dimensions.width / Math.max(1, dimensions.height), imageModelSupportedAspectRatios(node.data.model));
}

function imageModelAutoAspectInputUrls(incoming = {}) {
  return ["imagePromptIn", "cameraIn", "transferIn"]
    .flatMap((portId) => incoming[portId] || [])
    .map(({ source, edge }) => {
      if (!source?.data?.resultUrl) return "";
      return previewMediaType(source, edge) === "image" ? source.data.resultUrl : "";
    })
    .filter(Boolean);
}

async function imageDimensionsFromUrl(url) {
  try {
    const image = await loadCanvasImage(url);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    return width > 0 && height > 0 ? { width, height } : null;
  } catch {
    return null;
  }
}

async function createColorIdMatteBlob(imageUrl, color, { tolerance = 0, invert = false } = {}) {
  const image = await loadCanvasImage(imageUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const sourceCanvas = document.createElement("canvas");
  const sourceImageData = drawColorIdMattePickerCanvas(sourceCanvas, image);
  const mask = colorIdMatteImageData(sourceImageData, color, tolerance, invert);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  maskCanvas.getContext("2d").putImageData(mask.imageData, 0, 0);

  return new Promise((resolve, reject) => {
    maskCanvas.toBlob((blob) => {
      if (blob) {
        resolve({
          blob,
          width,
          height,
          matchedPixels: mask.matchedPixels
        });
      } else {
        reject(new Error("Could not create Color ID matte."));
      }
    }, "image/png");
  });
}

function drawColorIdMattePickerCanvas(canvas, image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function drawColorIdMatteVideoCanvas(canvas, video) {
  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function renderColorIdMattePickerPreview(context, sourceImageData, color, tolerance, invert, view = "overlay") {
  if (view === "matte" && color) {
    context.putImageData(colorIdMatteImageData(sourceImageData, color, tolerance, invert).imageData, 0, 0);
    return;
  }

  if (view === "rgb") {
    context.putImageData(sourceImageData, 0, 0);
    return;
  }

  const preview = new ImageData(new Uint8ClampedArray(sourceImageData.data), sourceImageData.width, sourceImageData.height);
  if (color) {
    const { data } = preview;
    const source = sourceImageData.data;
    for (let index = 0; index < source.length; index += 4) {
      const matches = colorMatches(source, index, color, tolerance);
      if (matches !== invert) {
        data[index] = Math.round(source[index] * 0.35 + 221 * 0.65);
        data[index + 1] = Math.round(source[index + 1] * 0.35 + 198 * 0.65);
        data[index + 2] = Math.round(source[index + 2] * 0.35 + 49 * 0.65);
        data[index + 3] = 255;
      }
    }
  }
  context.putImageData(preview, 0, 0);
}

function colorIdMatteImageData(sourceImageData, color, tolerance, invert) {
  const output = new ImageData(sourceImageData.width, sourceImageData.height);
  const source = sourceImageData.data;
  const target = output.data;
  let matchedPixels = 0;

  for (let index = 0; index < source.length; index += 4) {
    const matches = colorMatches(source, index, color, tolerance);
    const selected = matches !== invert;
    if (matches) matchedPixels += 1;
    const value = selected ? 255 : 0;
    target[index] = value;
    target[index + 1] = value;
    target[index + 2] = value;
    target[index + 3] = 255;
  }

  return { imageData: output, matchedPixels };
}

function colorMatches(data, index, color, tolerance) {
  if (data[index + 3] === 0) return false;
  return (
    Math.abs(data[index] - color.r) <= tolerance &&
    Math.abs(data[index + 1] - color.g) <= tolerance &&
    Math.abs(data[index + 2] - color.b) <= tolerance
  );
}

function averageColorFromImageData(imageData, x, y, radius = 0) {
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(imageData.width - 1, x + radius);
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(imageData.height - 1, y + radius);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let sampleY = minY; sampleY <= maxY; sampleY += 1) {
    for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
      const index = (sampleY * imageData.width + sampleX) * 4;
      if (imageData.data[index + 3] === 0) continue;
      r += imageData.data[index];
      g += imageData.data[index + 1];
      b += imageData.data[index + 2];
      count += 1;
    }
  }

  if (!count) return null;
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count)
  };
}

function normalizeColorIdMatteColor(value) {
  if (typeof value === "string") return colorFromHex(value);
  if (!value || typeof value !== "object") return null;
  const color = {
    r: clampColorChannel(value.r),
    g: clampColorChannel(value.g),
    b: clampColorChannel(value.b)
  };
  return color.r === null || color.g === null || color.b === null ? null : color;
}

function colorFromHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHex(color) {
  return `#${[color.r, color.g, color.b].map((channel) => (clampColorChannel(channel) ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

function clampColorChannel(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(255, Math.max(0, number)) : null;
}

function colorIdMatteTolerance(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(96, Math.max(0, number)) : 0;
}

function colorIdMatteSampleRadius(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(3, Math.max(0, number)) : 0;
}

function colorIdMatteBlur(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(24, Math.max(0, number)) : 0;
}

function colorIdMatteExpand(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(12, Math.max(-12, number)) : 0;
}

function normalizeColorIdMatteItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const color = normalizeColorIdMatteColor(item?.color || item?.selectedColor);
      if (!color) return null;
      return {
        id: String(item?.id || `matte-${index + 1}`),
        name: String(item?.name || `Matte ${index + 1}`).trim() || `Matte ${index + 1}`,
        color
      };
    })
    .filter(Boolean)
    .slice(0, 16);
}

function colorIdMatteRunColors(data = {}) {
  const items = normalizeColorIdMatteItems(data.colorIdMatteItems);
  if (items.length) return items;
  const color = normalizeColorIdMatteColor(data.colorIdMatteColor);
  return color
    ? [
        {
          id: "selected",
          name: String(data.colorIdMatteName || "Color ID Matte").trim() || "Color ID Matte",
          color
        }
      ]
    : [];
}

function normalizeChoice(value, options = [], fallback) {
  return options.includes(value) ? value : fallback;
}

function activeImageInstructionLabels(items = []) {
  return [
    ...new Set(
      items
        .filter(({ source }) => promptPiecesForSource(source).length)
        .map(({ source }) => ({
          camera: "Camera",
          style: "Style",
          transfer: "Mood Board",
          character: "Character identity"
        })[source.type])
        .filter(Boolean)
    )
  ];
}

function buildEffectiveImagePrompt(prompt, items = [], aspectRatio) {
  const hasTransferReference = items.some(({ source }) => source.type === "transfer" && source.data.resultUrl);
  const characterSources = activeConnectedCharacterSources(items);
  const namedCharacterReferences = characterSources.length > 1;
  const resolvedPrompt = resolveImageCharacterMentions(prompt, characterSources, namedCharacterReferences);
  const supportingInstructions = items
    .filter(({ source }) => source.type !== "camera")
    .flatMap(({ source }) => promptPiecesForSource(source, { namedCharacterReferences }))
    .filter(Boolean);
  const cameraInstructions = items
    .filter(({ source }) => source.type === "camera")
    .flatMap(({ source }) => promptPiecesForSource(source, { namedCharacterReferences }))
    .filter(Boolean);

  if (!supportingInstructions.length && !cameraInstructions.length) return resolvedPrompt;

  const ratio = extractAspectRatio(aspectRatio);
  const aspectInstruction = hasTransferReference && ratio
    ? `Generate the final image in the Image Model node's selected ${ratio} aspect ratio. Do not copy ${moodBoardOutputFileName}'s collage layout or aspect ratio into the final image.`
    : "";

  return [resolvedPrompt, ...supportingInstructions, aspectInstruction, ...cameraInstructions].filter(Boolean).join("\n\n");
}

function promptPiecesForSource(source, { namedCharacterReferences = false } = {}) {
  if (source.type === "camera") {
    return cameraPromptPieces(source);
  }

  if (source.type === "style") {
    const selectedPreset = source.data.stylePreset || "None";
    return [stylePresetPrompts[selectedPreset] || ""].filter(Boolean);
  }

  if (source.type === "composer" && source.data.resultUrl) {
    return [composerReferencePrompt];
  }

  if (source.type === "character" && source.data.locked && source.data.activated && source.data.resultUrl) {
    return characterImagePromptPieces(source, namedCharacterReferences);
  }

  if (source.type !== "transfer" || !source.data.activated || !source.data.resultUrl) return [];

  return [source.data.hiddenPrompt || transferPromptSuffix].filter(Boolean);
}

function buildEffectiveVideoPrompt(prompt, incoming = {}) {
  const audioUrls = [...new Set([...connectedAudioUrls(incoming.referenceAudioIn), ...connectedCharacterVoiceUrls(incoming.characterIn)])];
  const characterInstructions = (incoming.characterIn || [])
    .flatMap(({ source }) => {
      const voiceUrl = activeCharacterVoice(source)?.localUrl;
      const audioIndex = voiceUrl ? audioUrls.indexOf(voiceUrl) + 1 : null;
      return characterVideoPromptPieces(source, audioIndex);
    })
    .filter(Boolean);
  return [prompt, ...characterInstructions].filter(Boolean).join("\n\n");
}

function characterImagePromptPieces(source, namedCharacterReferences = false) {
  const sheetLabel = characterReferenceLabel(source, namedCharacterReferences);
  return [
    `CHARACTER REFERENCE: Use "${sheetLabel}" as the only identity, selected wardrobe, and body-proportion authority for the character. Render this same recognizable character in the requested scene and keep the selected outfit consistent.`,
    characterGenerationPhysicalDetailsPrompt(source.data),
    characterTraitPrompt(source.data)
  ].filter(Boolean);
}

function characterVideoPromptPieces(source, audioIndex) {
  if (!source.data.locked || !source.data.activated || !source.data.resultUrl) return [];
  return [
    "The connected character sheet defines the character's visual identity and selected wardrobe. Keep the character consistent throughout the shot.",
    characterGenerationPhysicalDetailsPrompt(source.data),
    characterTraitPrompt(source.data),
    audioIndex && activeCharacterVoice(source)
      ? `${source.data.compiledVoicePrompt || characterVoicePrompt} Use the dialogue reference labeled @Audio${audioIndex} for this character.`
      : ""
  ].filter(Boolean);
}

function characterTraitPrompt(data = {}) {
  const presetTraits = Array.isArray(data.characterTraits) ? data.characterTraits : [];
  const customTraits = String(data.customCharacterTraits || "")
    .split(",")
    .map((trait) => trait.trim())
    .filter(Boolean);
  const traits = [...new Set([...presetTraits, ...customTraits])];
  if (!traits.length) return "";
  return `The character characteristics are authentic, ${traits.join(", ")} and realistically displayed. These traits should be considered when rendering generations.`;
}

function characterPhysicalDetailsPrompt(data = {}) {
  const details = String(data.characterPhysicalDetails || "").trim();
  if (!details) return "";
  return `Defining physical details requirement: ${details}. These are identity-critical physical features. Depict them clearly, accurately, and consistently across every applicable view in the character sheet. Do not omit, soften, replace, or reinterpret these details.`;
}

function characterGenerationPhysicalDetailsPrompt(data = {}) {
  const details = String(data.characterPhysicalDetails || "").trim().replace(/[.!?]+$/, "");
  if (!details) return "";
  return `The character has ${details.charAt(0).toLowerCase()}${details.slice(1)}.`;
}

function activeCharacterWardrobe(node) {
  const wardrobes = Array.isArray(node?.data?.characterWardrobes) ? node.data.characterWardrobes : [];
  return wardrobes.find((wardrobe) => wardrobe.id === node.data.activeWardrobeId) || null;
}

function characterWardrobeVariantId(wardrobe) {
  return wardrobe?.id || characterDefaultWardrobeId;
}

function characterSheetVariantForWardrobeId(data = {}, wardrobeId = "") {
  const targetId = wardrobeId || characterDefaultWardrobeId;
  const variants = Array.isArray(data.characterSheetVariants) ? data.characterSheetVariants : [];
  return variants.find((variant) => variant.wardrobeId === targetId) || null;
}

function characterVariantDisplayPatch(variant) {
  const generated = variant?.generated || {};
  return {
    resultUrl: generated.url || "",
    resultItems: generated.url ? [generated] : [],
    selectedResultIndex: 0,
    fileName: generated.fileName || "",
    compiledWardrobeUrl: variant?.wardrobeUrl || ""
  };
}

function activeCharacterVoice(node) {
  const voices = Array.isArray(node?.data?.characterVoices) ? node.data.characterVoices : [];
  return voices.find((voice) => voice.id === node.data.activeVoiceId) || null;
}

function characterTag(node) {
  return cleanPromptTag(node?.data?.characterName || node?.data?.title || "Character") || "Character";
}

function activeConnectedCharacterSources(items = []) {
  return items
    .map(({ source }) => source)
    .filter((source) => source.type === "character" && source.data.locked && source.data.activated && source.data.resultUrl);
}

function resolveImageCharacterMentions(prompt, characterSources = [], namedCharacterReferences = false) {
  return characterSources.reduce((value, source) => {
    const replacement = namedCharacterReferences
      ? `the character in the reference sheet labeled "${characterReferenceLabel(source, true)}"`
      : "the character in the connected character sheet";
    return replacePromptTag(value, characterTag(source), replacement);
  }, String(prompt || ""));
}

function replacePromptTag(prompt, tag, replacement) {
  const pattern = new RegExp(`@${escapeRegExp(tag)}(?![A-Za-z0-9_-])`, "gi");
  return String(prompt || "").replace(pattern, (match, offset) => (
    offset === 0
      ? `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`
      : replacement
  ));
}

function characterReferenceLabel(node, namedCharacterReferences = false) {
  return namedCharacterReferences ? `${characterTag(node)} character identity sheet` : "The Character identity sheet";
}

function cameraPromptPieces(source) {
  const selectedShot = source.data.shotPreset || "None";
  const selectedLens = source.data.lensPreset || "None";
  const selectedType = source.data.typePreset || "None";
  const settings = [
    shotPresetPrompts[selectedShot] || "",
    lensPresetPrompts[selectedLens] || "",
    typePresetPrompts[selectedType] || ""
  ].filter(Boolean);

  if (!settings.length) return [];

  return [
    `CAMERA COMPOSITION REQUIREMENT: Use the connected Camera node as the authority for final framing and lens perspective. ${settings.join(" ")} Apply these camera choices to the complete final scene, including any connected character. Identity, wardrobe, style, and mood board guidance must preserve this composition rather than replace or weaken it.`
  ];
}

function hasCameraPreset(source) {
  return cameraPromptPieces(source).length > 0;
}

function cameraLabel(source) {
  const labels = [source.data.shotPreset, source.data.lensPreset, source.data.typePreset].filter((value) => value && value !== "None");
  return labels.length ? labels.join(" + ") : "Camera";
}

function connectedSummary(items = [], fallback) {
  if (!items.length) return fallback;
  if (items.length === 1) return sourceLabel(items[0].source);
  return `${items.length} connected`;
}

function sourceLabel(source) {
  if (source.type === "camera") return cameraLabel(source);
  if (source.type === "composer") return source.data.title || "Composer";
  if (source.type === "model3d" && source.data.resultUrl) return source.data.title || "3D model";
  if (source.type === "transfer" && source.data.resultUrl) return "TRANSFER.png";
  if (source.type === "character" && source.data.resultUrl) return `@${characterTag(source)}`;
  if (source.type === "transfer" && source.data.resultUrl) return moodBoardOutputFileName;
  if (source.type === "style") return (source.data.stylePreset || "None") === "None" ? "Style" : source.data.stylePreset;
  if (source.type === "utility" && source.data.resultUrl) return utilityResultType(source) === "video" ? "Utility video" : "Utility image";
  if (source.data.resultUrl) return source.data.resultUrl.split("/").pop();
  if (source.data.fileName) return source.data.fileName;
  return source.data.title || source.type;
}

function extractAspectRatio(value) {
  return String(value || "").match(/\d+:\d+/)?.[0] || "";
}

function closestAspectRatio(ratio, options = []) {
  const normalizedRatio = Number(ratio);
  if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) return options[0] || "21:9";

  return options.reduce((closest, option) => {
    const optionRatio = aspectRatioNumber(option);
    const closestRatio = aspectRatioNumber(closest);
    return Math.abs(Math.log(optionRatio / normalizedRatio)) < Math.abs(Math.log(closestRatio / normalizedRatio)) ? option : closest;
  }, options[0] || "21:9");
}

function aspectRatioNumber(value) {
  const [width = 21, height = 9] = extractAspectRatio(value).split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 21 / 9;
}

async function createTransferCollageBlob(images) {
  const loadedImages = await Promise.all(images.map((image) => loadCanvasImage(image.localUrl)));
  const layout = createMoodBoardLayout(loadedImages);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;

  const context = canvas.getContext("2d");
  layout.cells.forEach((cell) => {
    drawImageCover(context, cell.image, cell.x, cell.y, cell.width, cell.height);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error(`Could not create ${moodBoardOutputFileName}.`));
      }
    }, "image/png");
  });
}

function createMoodBoardLayout(images) {
  if (!images.length) throw new Error("Upload at least one mood board image.");

  const canvasWidth = 1536;
  const preferredAspect = 16 / 9;
  const minAspect = 1.25;
  const maxAspect = 2.35;
  const items = images.map((image, index) => ({
    image,
    index,
    ratio: imageAspectRatio(image)
  }));
  let bestCandidate = null;

  moodBoardOrders(items).forEach((orderedItems, orderIndex) => {
    moodBoardRowPartitions(orderedItems.length).forEach((rowLengths) => {
      const rows = [];
      let cursor = 0;
      rowLengths.forEach((length) => {
        rows.push(orderedItems.slice(cursor, cursor + length));
        cursor += length;
      });

      const naturalHeights = rows.map((row) => canvasWidth / row.reduce((total, item) => total + item.ratio, 0));
      const naturalHeight = naturalHeights.reduce((total, height) => total + height, 0);
      const naturalAspect = canvasWidth / naturalHeight;
      const targetAspect = clamp(naturalAspect, minAspect, maxAspect);
      const targetHeight = canvasWidth / targetAspect;
      const heightScale = targetHeight / naturalHeight;
      const rowBalancePenalty = rowBalanceScore(naturalHeights);
      const tinyCellPenalty = moodBoardTinyCellPenalty(rows, naturalHeights, canvasWidth);
      const orderPenalty = orderIndex === 0 ? 0 : 0.08;
      const dominantWideBonus = rows[0]?.length === 1 && rows[0][0]?.ratio > 1.45 ? -0.08 : 0;
      const score =
        Math.abs(Math.log(naturalAspect / preferredAspect)) * 0.7 +
        Math.abs(Math.log(heightScale)) * 1.8 +
        rowBalancePenalty * 0.45 +
        tinyCellPenalty +
        rows.length * 0.025 +
        orderPenalty +
        dominantWideBonus;

      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = { rows, naturalHeights, targetHeight, score };
      }
    });
  });

  const canvasHeight = Math.round(bestCandidate.targetHeight);
  const naturalTotalHeight = bestCandidate.naturalHeights.reduce((total, height) => total + height, 0);
  const heightScale = canvasHeight / naturalTotalHeight;
  const cells = [];
  let y = 0;

  bestCandidate.rows.forEach((row, rowIndex) => {
    const isLastRow = rowIndex === bestCandidate.rows.length - 1;
    const rowHeight = isLastRow ? canvasHeight - y : bestCandidate.naturalHeights[rowIndex] * heightScale;
    const ratioTotal = row.reduce((total, item) => total + item.ratio, 0);
    let x = 0;

    row.forEach((item, itemIndex) => {
      const isLastItem = itemIndex === row.length - 1;
      const width = isLastItem ? canvasWidth - x : canvasWidth * (item.ratio / ratioTotal);
      cells.push({
        image: item.image,
        x,
        y,
        width,
        height: rowHeight
      });
      x += width;
    });

    y += rowHeight;
  });

  return {
    width: canvasWidth,
    height: canvasHeight,
    cells
  };
}

function moodBoardOrders(items) {
  const candidates = [
    items,
    [...items].sort((first, second) => second.ratio - first.ratio),
    [...items].sort((first, second) => first.ratio - second.ratio)
  ];
  const dominantWideIndex = items.reduce((bestIndex, item, index) => (item.ratio > items[bestIndex].ratio ? index : bestIndex), 0);
  if (items[dominantWideIndex]?.ratio > 1.45) {
    candidates.push([items[dominantWideIndex], ...items.filter((_, index) => index !== dominantWideIndex)]);
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.map((item) => item.index).join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function moodBoardRowPartitions(count) {
  const maxRows = Math.min(3, count);
  const maxPerRow = Math.min(4, count);
  const partitions = [];

  function build(remaining, current) {
    if (!remaining) {
      partitions.push(current);
      return;
    }
    if (current.length >= maxRows) return;

    for (let length = 1; length <= Math.min(maxPerRow, remaining); length += 1) {
      build(remaining - length, [...current, length]);
    }
  }

  build(count, []);
  return partitions;
}

function imageAspectRatio(image) {
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  return clamp(width / height, 0.25, 4.5);
}

function rowBalanceScore(heights) {
  if (heights.length <= 1) return 0;
  const average = heights.reduce((total, height) => total + height, 0) / heights.length;
  return heights.reduce((total, height) => total + Math.abs(height - average) / average, 0) / heights.length;
}

function moodBoardTinyCellPenalty(rows, rowHeights, canvasWidth) {
  return rows.reduce((penalty, row, rowIndex) => {
    const ratioTotal = row.reduce((total, item) => total + item.ratio, 0);
    return row.reduce((rowPenalty, item) => {
      const width = canvasWidth * (item.ratio / ratioTotal);
      const height = rowHeights[rowIndex];
      const narrowPenalty = width < 190 ? (190 - width) / 190 : 0;
      const shortPenalty = height < 190 ? (190 - height) / 190 : 0;
      return rowPenalty + narrowPenalty + shortPenalty;
    }, penalty);
  }, 0);
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load one of the mood board images."));
    image.src = src;
  });
}

function drawImageCover(context, image, x, y, width, height) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function normalizeRect(start, current) {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    right: Math.max(start.x, current.x),
    bottom: Math.max(start.y, current.y)
  };
}

function rectsIntersect(first, second) {
  return first.left <= second.right && first.right >= second.left && first.top <= second.bottom && first.bottom >= second.top;
}

function pointInRect(rect, point) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function groupToRect(group) {
  return {
    left: group.x,
    top: group.y,
    right: group.x + group.width,
    bottom: group.y + group.height
  };
}

function sameStringList(first = [], second = []) {
  if (first.length !== second.length) return false;
  return first.every((value, index) => value === second[index]);
}

function normalizeComposerAspectRatio(value) {
  return composerAspectRatios[String(value || "")] ? String(value) : "16:9";
}

function composerAspectRatioValue(value) {
  return composerAspectRatios[normalizeComposerAspectRatio(value)];
}

function composerAspectRatioNumber(value) {
  const [width = 16, height = 9] = normalizeComposerAspectRatio(value).split(":").map(Number);
  return width / height;
}

function normalizeComposerPrimitiveType(value) {
  const primitive = String(value || "box");
  return composerPrimitiveOptions.some((option) => option.id === primitive) ? primitive : "box";
}

function composerPrimitiveLabel(value) {
  return composerPrimitiveOptions.find((option) => option.id === normalizeComposerPrimitiveType(value))?.label || "Box";
}

function composerImagePlaneSizeForAspect(aspectRatio) {
  const ratio = Math.max(0.05, finiteNumber(aspectRatio, 16 / 9));
  const maxSide = 2;
  if (ratio >= 1) {
    return {
      width: maxSide,
      height: maxSide / ratio
    };
  }

  return {
    width: maxSide * ratio,
    height: maxSide
  };
}

async function composerImageAspectFromSource(source) {
  if (source?.width && source?.height) return finiteNumber(source.width, 16) / Math.max(1, finiteNumber(source.height, 9));
  if (!source?.url) return 16 / 9;

  try {
    const image = await loadCanvasImage(source.url);
    return image.naturalWidth / Math.max(1, image.naturalHeight);
  } catch {
    return 16 / 9;
  }
}

function normalizedComposerScene(scene = null) {
  const fallback = defaultComposerScene();
  const hasScene = scene && typeof scene === "object";
  const camera = hasScene && scene.camera ? scene.camera : fallback.camera;
  const cameraPitch = finiteNumber(camera.pitch, fallback.camera.pitch);
  const cameraYaw = finiteNumber(camera.yaw, fallback.camera.yaw);
  const cameraDistance = finiteNumber(camera.distance, fallback.camera.distance);
  const cameraTargetY = finiteNumber(camera.targetY, fallback.camera.targetY);
  const hasFreeCameraPosition = Number.isFinite(Number(camera.x)) && Number.isFinite(Number(camera.y)) && Number.isFinite(Number(camera.z));
  const legacyPitch = THREE.MathUtils.degToRad(cameraPitch);
  const legacyYaw = THREE.MathUtils.degToRad(cameraYaw);
  const legacyCameraPosition = {
    x: Math.sin(legacyYaw) * Math.cos(legacyPitch) * cameraDistance,
    y: cameraTargetY + Math.sin(legacyPitch) * cameraDistance,
    z: Math.cos(legacyYaw) * Math.cos(legacyPitch) * cameraDistance
  };
  const maquetteSource = hasScene && Array.isArray(scene.maquettes) ? scene.maquettes : fallback.maquettes;
  const propSource = hasScene && Array.isArray(scene.props) ? scene.props : fallback.props;
  const imagePlaneSource = hasScene && Array.isArray(scene.imagePlanes) ? scene.imagePlanes : fallback.imagePlanes;
  const cameraBookmarkSource = hasScene && Array.isArray(scene.cameraBookmarks) ? scene.cameraBookmarks : fallback.cameraBookmarks;

  return {
    camera: {
      x: finiteNumber(camera.x, legacyCameraPosition.x),
      y: finiteNumber(camera.y, legacyCameraPosition.y),
      z: finiteNumber(camera.z, legacyCameraPosition.z),
      yaw: cameraYaw,
      pitch: hasFreeCameraPosition ? cameraPitch : -cameraPitch,
      distance: cameraDistance,
      fov: finiteNumber(camera.fov, fallback.camera.fov),
      targetY: cameraTargetY
    },
    maquettes: maquetteSource.map((item, index) => {
      const legacyUpperArm = finiteNumber(item?.upperArm, finiteNumber(item?.armSwing, 0));
      const legacyLowerArm = finiteNumber(item?.lowerArm, finiteNumber(item?.armSwing, 0) * 0.65);
      const legacyUpperLeg = finiteNumber(item?.upperLeg, finiteNumber(item?.legSwing, 0));
      const legacyLowerLeg = finiteNumber(item?.lowerLeg, finiteNumber(item?.legSwing, 0) * -0.45);
      const legacyHandRotX = finiteNumber(item?.handRotX, 0);
      const legacyHandRotY = finiteNumber(item?.handRotY, 0);
      const legacyHandRotZ = finiteNumber(item?.handRotZ, 0);
      return {
        id: String(item?.id || `maquette-${index + 1}`),
        name: String(item?.name || `Maquette ${index + 1}`),
        x: finiteNumber(item?.x, 0),
        y: finiteNumber(item?.y, 0),
        z: finiteNumber(item?.z, 0),
        rotX: finiteNumber(item?.rotX, 0),
        rotY: finiteNumber(item?.rotY, finiteNumber(item?.yaw, 0)),
        rotZ: finiteNumber(item?.rotZ, 0),
        scale: finiteNumber(item?.scale, 1),
        pose: String(item?.pose || ""),
        ...composerRotationFields(item, "leftUpperArm", legacyUpperArm),
        ...composerRotationFields(item, "leftLowerArm", legacyLowerArm),
        ...composerRotationFields(item, "rightUpperArm", -legacyUpperArm),
        ...composerRotationFields(item, "rightLowerArm", -legacyLowerArm),
        ...composerRotationFields(item, "leftUpperLeg", legacyUpperLeg),
        ...composerRotationFields(item, "leftLowerLeg", legacyLowerLeg),
        ...composerRotationFields(item, "rightUpperLeg", -legacyUpperLeg),
        ...composerRotationFields(item, "rightLowerLeg", -legacyLowerLeg),
        leftHandRotX: finiteNumber(item?.leftHandRotX, legacyHandRotX),
        leftHandRotY: finiteNumber(item?.leftHandRotY, legacyHandRotY),
        leftHandRotZ: finiteNumber(item?.leftHandRotZ, -legacyHandRotZ),
        rightHandRotX: finiteNumber(item?.rightHandRotX, legacyHandRotX),
        rightHandRotY: finiteNumber(item?.rightHandRotY, legacyHandRotY),
        rightHandRotZ: finiteNumber(item?.rightHandRotZ, legacyHandRotZ),
        headRotX: finiteNumber(item?.headRotX, 0),
        headRotY: finiteNumber(item?.headRotY, 0),
        headRotZ: finiteNumber(item?.headRotZ, 0),
        upperBodyRotX: finiteNumber(item?.upperBodyRotX, 0),
        upperBodyRotY: finiteNumber(item?.upperBodyRotY, 0),
        upperBodyRotZ: finiteNumber(item?.upperBodyRotZ, 0),
        lean: finiteNumber(item?.lean, 0),
        color: String(item?.color || "#b8b8b2")
      };
    }),
    props: propSource.map((item, index) => ({
      id: String(item?.id || `prop-${index + 1}`),
      name: String(item?.name || `${composerPrimitiveLabel(item?.primitive)} ${index + 1}`),
      primitive: normalizeComposerPrimitiveType(item?.primitive || item?.shape),
      x: finiteNumber(item?.x, 1.4),
      y: finiteNumber(item?.y, 0),
      z: finiteNumber(item?.z, -0.4),
      rotX: finiteNumber(item?.rotX, 0),
      rotY: finiteNumber(item?.rotY, finiteNumber(item?.yaw, 0)),
      rotZ: finiteNumber(item?.rotZ, 0),
      scale: finiteNumber(item?.scale, 1),
      width: finiteNumber(item?.width, 0.9),
      height: finiteNumber(item?.height, 0.9),
      depth: finiteNumber(item?.depth, 0.9),
      color: String(item?.color || "#496b8f")
    })),
    imagePlanes: imagePlaneSource.map((item, index) => ({
      id: String(item?.id || `image-plane-${index + 1}`),
      name: String(item?.name || `Image Plane ${index + 1}`),
      imageUrl: String(item?.imageUrl || ""),
      x: finiteNumber(item?.x, 0),
      y: finiteNumber(item?.y, 1.15),
      z: finiteNumber(item?.z, -1.4),
      rotX: finiteNumber(item?.rotX, 0),
      rotY: finiteNumber(item?.rotY, 0),
      rotZ: finiteNumber(item?.rotZ, 0),
      scale: finiteNumber(item?.scale, 1),
      width: finiteNumber(item?.width, 2),
      height: finiteNumber(item?.height, 1.125),
      opacity: finiteNumber(item?.opacity, 1)
    })),
    cameraBookmarks: cameraBookmarkSource.map((item, index) => ({
      id: String(item?.id || `camera-bookmark-${index + 1}`),
      name: String(item?.name || `Cam ${index + 1}`),
      camera: {
        x: finiteNumber(item?.camera?.x, fallback.camera.x),
        y: finiteNumber(item?.camera?.y, fallback.camera.y),
        z: finiteNumber(item?.camera?.z, fallback.camera.z),
        yaw: finiteNumber(item?.camera?.yaw, fallback.camera.yaw),
        pitch: finiteNumber(item?.camera?.pitch, fallback.camera.pitch),
        fov: finiteNumber(item?.camera?.fov, fallback.camera.fov),
        distance: finiteNumber(item?.camera?.distance, fallback.camera.distance),
        targetY: finiteNumber(item?.camera?.targetY, fallback.camera.targetY)
      }
    }))
  };
}

function composerPoseSnapshot(source = {}) {
  return composerPoseFieldKeys.reduce((snapshot, key) => {
    snapshot[key] = finiteNumber(source?.[key], 0);
    return snapshot;
  }, {});
}

function normalizeComposerSavedPose(pose, index = 0) {
  if (!pose || typeof pose !== "object") return null;
  const fallbackId = `pose-${index + 1}`;
  const id = String(pose.id || pose.fileName || fallbackId).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96) || fallbackId;
  const name = String(pose.name || `Pose ${index + 1}`).trim() || `Pose ${index + 1}`;
  return {
    id,
    name,
    fileName: String(pose.fileName || ""),
    pose: String(pose.pose || id),
    ...composerPoseSnapshot(pose)
  };
}

function normalizeComposerSavedPoses(poses = []) {
  if (!Array.isArray(poses)) return [];
  return poses.map((pose, index) => normalizeComposerSavedPose(pose, index)).filter(Boolean);
}

function mergeComposerSavedPoses(...poseLists) {
  const merged = [];
  const flattened = poseLists.flatMap((list) => (Array.isArray(list) ? list : [list])).filter(Boolean);

  flattened.forEach((pose, index) => {
    const normalized = normalizeComposerSavedPose(pose, index);
    if (!normalized) return;
    const existingIndex = merged.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...normalized
      };
    } else {
      merged.push(normalized);
    }
  });

  return merged;
}

function composerSavedPosePatch(pose) {
  const normalized = normalizeComposerSavedPose(pose);
  if (!normalized) return {};
  return {
    pose: normalized.id,
    ...composerPoseSnapshot(normalized)
  };
}

function resolveComposerImagePlaneSources(sceneData, imageSources = []) {
  const data = normalizedComposerScene(sceneData);
  const validSources = imageSources.filter((source) => source?.url);
  if (!validSources.length) return data;

  return {
    ...data,
    imagePlanes: data.imagePlanes.map((plane, index) => {
      const currentSource = validSources.find((source) => source.url === plane.imageUrl);
      const fallbackSource = validSources[index] || validSources[0];
      const source = currentSource || fallbackSource;
      if (!source?.url || plane.imageUrl === source.url) return plane;

      return {
        ...plane,
        imageUrl: source.url,
        name: plane.name || source.label || `Image Plane ${index + 1}`
      };
    })
  };
}

function renderComposerViewport(renderer, scene, camera, sceneData, selectedId, options = {}) {
  if (!renderer || !scene || !camera) return;
  const showGrid = options.showGrid !== false;
  const showSelection = options.showSelection !== false;
  const texturePromises = [];
  const assetPromises = [];
  const data = normalizedComposerScene(sceneData);
  disposeComposerScene(scene);
  scene.clear();
  scene.background = new THREE.Color(0x111111);

  camera.fov = data.camera.fov;
  const yaw = THREE.MathUtils.degToRad(data.camera.yaw);
  const pitch = THREE.MathUtils.degToRad(data.camera.pitch);
  camera.position.set(data.camera.x, data.camera.y, data.camera.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;
  camera.updateProjectionMatrix();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(3, 6, 4);
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.82, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  if (showGrid) {
    const grid = new THREE.GridHelper(12, 24, 0x444444, 0x2a2a2a);
    grid.position.y = 0.004;
    scene.add(grid);
  }

  [
    ...data.imagePlanes.map((plane) => createComposerImagePlane(plane, renderer, scene, camera, { texturePromises })),
    ...data.props.map(createComposerProp),
    ...data.maquettes.map((maquette) => createComposerMaquette(maquette, { assetPromises }))
  ].forEach((object) => {
    scene.add(object);
    if (showSelection && object.userData.id === selectedId) {
      const box = new THREE.Box3().setFromObject(object);
      scene.add(new THREE.Box3Helper(box, 0xf0c83b));
    }
  });

  renderer.render(scene, camera);
  if (options.awaitTextures || options.awaitAssets) {
    return Promise.allSettled([...texturePromises, ...assetPromises]).then(() => {
      if (assetPromises.length) {
        return renderComposerViewport(renderer, scene, camera, sceneData, selectedId, { ...options, awaitAssets: false });
      }
      renderer.render(scene, camera);
    });
  }

  if (assetPromises.length) {
    Promise.allSettled(assetPromises).then(() => {
      renderComposerViewport(renderer, scene, camera, sceneData, selectedId, options);
    });
  }
}

function disposeComposerScene(scene) {
  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose?.();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    }
  });
}

function createComposerProp(prop) {
  const group = new THREE.Group();
  group.userData.id = prop.id;
  group.position.set(prop.x, prop.y + (prop.height * prop.scale) / 2, prop.z);
  group.rotation.set(THREE.MathUtils.degToRad(prop.rotX), THREE.MathUtils.degToRad(prop.rotY), THREE.MathUtils.degToRad(prop.rotZ));
  const mesh = new THREE.Mesh(
    createComposerPrimitiveGeometry(prop.primitive),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(prop.color), roughness: 0.74 })
  );
  mesh.scale.set(prop.width * prop.scale, prop.height * prop.scale, prop.depth * prop.scale);
  group.add(mesh);
  return group;
}

function createComposerPrimitiveGeometry(primitive) {
  switch (normalizeComposerPrimitiveType(primitive)) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 18);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 32);
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createComposerImagePlane(plane, renderer, scene, camera, options = {}) {
  const group = new THREE.Group();
  group.userData.id = plane.id;
  group.position.set(plane.x, plane.y, plane.z);
  group.rotation.set(THREE.MathUtils.degToRad(plane.rotX), THREE.MathUtils.degToRad(plane.rotY), THREE.MathUtils.degToRad(plane.rotZ));
  group.scale.setScalar(plane.scale);

  const material = new THREE.MeshBasicMaterial({
    color: plane.imageUrl ? 0xffffff : 0x2b2b2b,
    opacity: clamp(plane.opacity, 0.1, 1),
    transparent: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(plane.width, plane.height), material);
  group.add(mesh);

  if (plane.imageUrl) {
    const texturePromise = new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(
        composerTextureUrl(plane.imageUrl),
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          material.color.set(0xffffff);
          material.map = texture;
          material.needsUpdate = true;
          renderer.render(scene, camera);
          resolve(true);
        },
        undefined,
        () => {
          material.color.set(0x5b4d20);
          renderer.render(scene, camera);
          resolve(false);
        }
      );
    });
    options.texturePromises?.push(texturePromise);
  }

  return group;
}

function composerTextureUrl(url) {
  if (!url || /^(blob:|data:|https?:)/i.test(url)) return url;
  if (typeof window === "undefined") return url;
  if (/^\/(?:uploads|outputs|workflow-assets)\//i.test(url)) {
    const mediaOrigin = ["127.0.0.1", "localhost"].includes(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:3333`
      : window.location.origin;
    return `${mediaOrigin}${url}`;
  }
  return new URL(url, window.location.origin).href;
}

function createComposerMaquette(maquette, options = {}) {
  if (composerMannequinAsset?.scene) {
    return createComposerModelMaquette(maquette, composerMannequinAsset);
  }

  if (!composerMannequinAssetFailed) {
    options.assetPromises?.push(loadComposerMannequinAsset());
  }

  return createComposerProceduralMaquette(maquette);
}

function loadComposerMannequinAsset() {
  if (composerMannequinAsset) return Promise.resolve(composerMannequinAsset);
  if (composerMannequinAssetFailed) return Promise.resolve(null);

  if (!composerMannequinAssetPromise) {
    const loader = new GLTFLoader();
    composerMannequinAssetPromise = loader
      .loadAsync(composerMannequinModelPath)
      .then((gltf) => {
        const scene = gltf.scene || gltf.scenes?.[0];
        if (!scene) throw new Error("Mannequin GLB has no scene.");
        scene.updateMatrixWorld(true);
        composerMannequinAsset = { scene };
        return composerMannequinAsset;
      })
      .catch((error) => {
        composerMannequinAssetFailed = true;
        console.warn("Composer mannequin model failed to load.", error);
        return null;
      });
  }

  return composerMannequinAssetPromise;
}

function createComposerModelMaquette(maquette, asset) {
  const group = new THREE.Group();
  group.userData.id = maquette.id;
  applyComposerObjectTransform(group, maquette);

  const poseRoot = new THREE.Group();
  poseRoot.rotation.x = maquette.lean;
  group.add(poseRoot);

  const model = cloneSkeleton(asset.scene);
  model.scale.setScalar(composerMannequinModelScale);
  prepareComposerMannequinClone(model, maquette);
  applyComposerMannequinPose(model, maquette);
  poseRoot.add(model);

  return group;
}

function applyComposerObjectTransform(group, object) {
  group.position.set(object.x, object.y, object.z);
  group.rotation.set(THREE.MathUtils.degToRad(object.rotX), THREE.MathUtils.degToRad(object.rotY), THREE.MathUtils.degToRad(object.rotZ));
  group.scale.setScalar(object.scale);
}

function prepareComposerMannequinClone(model, maquette) {
  const color = new THREE.Color(maquette.color || "#b8b8b2");
  model.traverse((object) => {
    object.frustumCulled = false;
    if (!object.isMesh && !object.isSkinnedMesh) return;

    object.castShadow = true;
    object.receiveShadow = true;
    object.geometry = object.geometry?.clone();
    const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
    const clonedMaterials = materials.map((material) => {
      const clone = material.clone();
      clone.color = color.clone();
      clone.roughness = 0.72;
      clone.metalness = 0.02;
      clone.needsUpdate = true;
      return clone;
    });
    object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
  });
}

function applyComposerMannequinPose(model, maquette) {
  const bones = composerBoneMap(model);
  const upperBody = composerRotationVector(maquette, "upperBodyRot");
  const head = composerRotationVector(maquette, "headRot");
  const leftUpperArm = composerRotationVector(maquette, "leftUpperArm");
  const leftLowerArm = composerRotationVector(maquette, "leftLowerArm");
  const rightUpperArm = composerRotationVector(maquette, "rightUpperArm");
  const rightLowerArm = composerRotationVector(maquette, "rightLowerArm");
  const leftUpperLeg = composerRotationVector(maquette, "leftUpperLeg");
  const leftLowerLeg = composerRotationVector(maquette, "leftLowerLeg");
  const rightUpperLeg = composerRotationVector(maquette, "rightUpperLeg");
  const rightLowerLeg = composerRotationVector(maquette, "rightLowerLeg");
  const leftHand = composerRotationVector(maquette, "leftHandRot");
  const rightHand = composerRotationVector(maquette, "rightHandRot");
  const addRotation = (name, x = 0, y = 0, z = 0) => {
    const bone = bones.get(name);
    if (!bone) return;
    bone.rotation.x += x;
    bone.rotation.y += y;
    bone.rotation.z += z;
  };
  const addDistributedRotation = (names, x = 0, y = 0, z = 0) => {
    const liveBones = names.map((name) => bones.get(name)).filter(Boolean);
    if (!liveBones.length) return;
    liveBones.forEach((bone) => {
      bone.rotation.x += x / liveBones.length;
      bone.rotation.y += y / liveBones.length;
      bone.rotation.z += z / liveBones.length;
    });
  };

  addDistributedRotation(["spine_01", "spine_02", "spine_03", "spine_04", "spine_05"], upperBody.x, upperBody.y, upperBody.z);
  addRotation("head", head.x, head.y, head.z);

  addRotation("upperarm_l", leftUpperArm.x, leftUpperArm.y, leftUpperArm.z);
  addRotation("lowerarm_l", leftLowerArm.x, leftLowerArm.y, leftLowerArm.z);
  addRotation("upperarm_r", rightUpperArm.x, rightUpperArm.y, rightUpperArm.z);
  addRotation("lowerarm_r", rightLowerArm.x, rightLowerArm.y, rightLowerArm.z);
  addRotation("hand_l", leftHand.x, leftHand.y, leftHand.z);
  addRotation("hand_r", rightHand.x, rightHand.y, rightHand.z);

  addRotation("thigh_l", leftUpperLeg.x, leftUpperLeg.y, leftUpperLeg.z);
  addRotation("calf_l", leftLowerLeg.x, leftLowerLeg.y, leftLowerLeg.z);
  addRotation("thigh_r", rightUpperLeg.x, rightUpperLeg.y, rightUpperLeg.z);
  addRotation("calf_r", rightLowerLeg.x, rightLowerLeg.y, rightLowerLeg.z);

  model.updateMatrixWorld(true);
}

function composerBoneMap(model) {
  const bones = new Map();
  model.traverse((object) => {
    if (object.isBone && object.name) bones.set(object.name, object);
  });
  return bones;
}

function createComposerProceduralMaquette(maquette) {
  const color = new THREE.Color(maquette.color || "#b8b8b2");
  const dark = color.clone().multiplyScalar(0.58);
  const light = color.clone().lerp(new THREE.Color(0xffffff), 0.16);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.02 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.75, metalness: 0.02 });
  const highlightMaterial = new THREE.MeshStandardMaterial({ color: light, roughness: 0.7, metalness: 0.02 });
  const group = new THREE.Group();
  group.userData.id = maquette.id;
  applyComposerObjectTransform(group, maquette);

  const root = new THREE.Group();
  root.rotation.x = maquette.lean;
  root.position.y = 0.02;
  group.add(root);

  const upperBodyRot = composerRotationVector(maquette, "upperBodyRot");
  const headRot = composerRotationVector(maquette, "headRot");
  const leftUpperArm = composerRotationVector(maquette, "leftUpperArm");
  const leftLowerArm = composerRotationVector(maquette, "leftLowerArm");
  const rightUpperArm = composerRotationVector(maquette, "rightUpperArm");
  const rightLowerArm = composerRotationVector(maquette, "rightLowerArm");
  const leftUpperLeg = composerRotationVector(maquette, "leftUpperLeg");
  const leftLowerLeg = composerRotationVector(maquette, "leftLowerLeg");
  const rightUpperLeg = composerRotationVector(maquette, "rightUpperLeg");
  const rightLowerLeg = composerRotationVector(maquette, "rightLowerLeg");
  const leftHandRot = composerRotationVector(maquette, "leftHandRot");
  const rightHandRot = composerRotationVector(maquette, "rightHandRot");
  const waistY = 1.16;
  const upperBody = new THREE.Group();
  upperBody.position.y = waistY;
  upperBody.rotation.set(upperBodyRot.x, upperBodyRot.y, upperBodyRot.z);
  root.add(upperBody);

  addComposerEllipsoid(upperBody, { x: 0, y: 1.8 - waistY, z: 0, sx: 0.52, sy: 0.54, sz: 0.3, material: highlightMaterial });
  addComposerEllipsoid(upperBody, { x: 0, y: 1.46 - waistY, z: 0.01, sx: 0.34, sy: 0.3, sz: 0.24, material });
  addComposerEllipsoid(root, { x: 0, y: waistY, z: 0, sx: 0.46, sy: 0.22, sz: 0.28, material });
  addComposerEllipsoid(root, { x: -0.18, y: 1.18, z: -0.02, sx: 0.22, sy: 0.18, sz: 0.23, material });
  addComposerEllipsoid(root, { x: 0.18, y: 1.18, z: -0.02, sx: 0.22, sy: 0.18, sz: 0.23, material });

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 18), jointMaterial);
  neck.position.y = 2.22 - waistY;
  upperBody.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.28 - waistY;
  head.rotation.set(headRot.x, headRot.y, headRot.z);
  upperBody.add(head);

  addComposerEllipsoid(head, { x: 0, y: 0.3, z: -0.01, sx: 0.25, sy: 0.35, sz: 0.22, material });
  addComposerEllipsoid(head, { x: 0, y: 0.3, z: -0.18, sx: 0.17, sy: 0.24, sz: 0.035, material: highlightMaterial });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 14), jointMaterial);
  nose.position.set(0, 0.29, -0.27);
  nose.rotation.x = -Math.PI / 2;
  head.add(nose);

  const shoulderY = 1.98;
  const hipY = 1.08;
  addComposerArm(upperBody, { side: -1, shoulderY: shoulderY - waistY, upper: leftUpperArm.z, lower: leftLowerArm.z, handRotation: leftHandRot, material, jointMaterial });
  addComposerArm(upperBody, { side: 1, shoulderY: shoulderY - waistY, upper: rightUpperArm.z, lower: rightLowerArm.z, handRotation: rightHandRot, material, jointMaterial });
  addComposerLeg(root, { side: -1, hipY, upper: leftUpperLeg.z, lower: leftLowerLeg.z, material, jointMaterial });
  addComposerLeg(root, { side: 1, hipY, upper: rightUpperLeg.z, lower: rightLowerLeg.z, material, jointMaterial });

  [
    [-0.24, hipY, 0],
    [0.24, hipY, 0]
  ].forEach(([x, y, z]) => addComposerEllipsoid(root, { x, y, z, sx: 0.12, sy: 0.12, sz: 0.12, material: jointMaterial }));
  [
    [-0.55, shoulderY - waistY, 0],
    [0.55, shoulderY - waistY, 0]
  ].forEach(([x, y, z]) => addComposerEllipsoid(upperBody, { x, y, z, sx: 0.12, sy: 0.12, sz: 0.12, material: jointMaterial }));

  return group;
}

function addComposerArm(root, { side, shoulderY, upper, lower, handRotation, material, jointMaterial }) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.55, shoulderY, 0);
  shoulder.rotation.x = upper;
  shoulder.rotation.z = side * 0.18;
  root.add(shoulder);

  addComposerEllipsoid(shoulder, { x: 0, y: 0, z: 0, sx: 0.15, sy: 0.16, sz: 0.14, material });
  addLimb(shoulder, { length: 0.68, radiusTop: 0.105, radiusBottom: 0.085, material });

  const elbow = new THREE.Group();
  elbow.position.y = -0.68;
  elbow.rotation.x = lower;
  shoulder.add(elbow);
  addComposerEllipsoid(elbow, { x: 0, y: 0, z: 0, sx: 0.095, sy: 0.095, sz: 0.095, material: jointMaterial });
  addLimb(elbow, { length: 0.62, radiusTop: 0.085, radiusBottom: 0.058, material });

  const wrist = new THREE.Group();
  wrist.position.y = -0.62;
  wrist.rotation.set(handRotation.x, handRotation.y, handRotation.z);
  elbow.add(wrist);
  addComposerEllipsoid(wrist, { x: 0, y: 0, z: 0, sx: 0.065, sy: 0.06, sz: 0.06, material: jointMaterial });
  addComposerEllipsoid(wrist, { x: 0, y: -0.11, z: -0.01, sx: 0.075, sy: 0.13, sz: 0.04, material });
  addComposerFinger(wrist, { x: -0.036, y: -0.23, z: -0.012, length: 0.12, radius: 0.014, material });
  addComposerFinger(wrist, { x: 0, y: -0.24, z: -0.012, length: 0.13, radius: 0.015, material });
  addComposerFinger(wrist, { x: 0.036, y: -0.23, z: -0.012, length: 0.12, radius: 0.014, material });
  const thumb = addComposerFinger(wrist, { x: side * 0.075, y: -0.1, z: -0.025, length: 0.1, radius: 0.016, material: jointMaterial });
  thumb.rotation.z = side * 0.68;
}

function addComposerLeg(root, { side, hipY, upper, lower, material, jointMaterial }) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.24, hipY, 0);
  hip.rotation.x = upper;
  hip.rotation.z = side * 0.05;
  root.add(hip);

  addComposerEllipsoid(hip, { x: 0, y: 0, z: 0, sx: 0.135, sy: 0.12, sz: 0.12, material: jointMaterial });
  addLimb(hip, { length: 0.78, radiusTop: 0.13, radiusBottom: 0.1, material });

  const knee = new THREE.Group();
  knee.position.y = -0.78;
  knee.rotation.x = lower;
  hip.add(knee);
  addComposerEllipsoid(knee, { x: 0, y: 0, z: -0.015, sx: 0.105, sy: 0.085, sz: 0.095, material: jointMaterial });
  addLimb(knee, { length: 0.72, radiusTop: 0.095, radiusBottom: 0.065, material });

  const ankle = new THREE.Group();
  ankle.position.y = -0.72;
  knee.add(ankle);
  addComposerEllipsoid(ankle, { x: 0, y: 0, z: 0, sx: 0.07, sy: 0.055, sz: 0.06, material: jointMaterial });
  const foot = addComposerEllipsoid(ankle, { x: 0, y: -0.075, z: -0.13, sx: 0.12, sy: 0.06, sz: 0.25, material });
  foot.rotation.x = -0.08;
  addComposerEllipsoid(ankle, { x: 0, y: -0.08, z: -0.31, sx: 0.11, sy: 0.045, sz: 0.095, material });
}

function addLimb(root, { length, radiusTop, radiusBottom, material }) {
  const limb = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 18), material);
  limb.position.y = -length / 2;
  root.add(limb);
  return limb;
}

function addComposerEllipsoid(root, { x, y, z, sx, sy, sz, material }) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  root.add(mesh);
  return mesh;
}

function addComposerFinger(root, { x, y, z, length, radius, material }) {
  const finger = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.88, length, 10), material);
  finger.position.set(x, y, z);
  root.add(finger);
  return finger;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeVoidVideoFrameCount(value) {
  const numeric = Number.parseInt(value, 10);
  const target = Number.isFinite(numeric) ? numeric : 85;
  return voidVideoFrameOptions.reduce((nearest, option) => (Math.abs(option - target) < Math.abs(nearest - target) ? option : nearest), 85);
}

function isRunnableNode(node) {
  return ["text", "imageModel", "videoModel", "utility", "model3d"].includes(node.type) || (node.type === "camera" && node.data.qwenCameraOpen);
}

function buildSelectedRunnableDependencies(nodes, edges) {
  const runnableIds = new Set(nodes.map((node) => node.id));
  const dependencies = new Map(nodes.map((node) => [node.id, []]));

  edges.forEach((edge) => {
    if (!runnableIds.has(edge.from.nodeId) || !runnableIds.has(edge.to.nodeId)) return;
    dependencies.get(edge.to.nodeId)?.push(edge.from.nodeId);
  });

  return dependencies;
}

function nodeRunPriority(node) {
  if (node?.type === "text") return 0;
  if (node?.type === "camera") return 1;
  if (node?.type === "imageModel") return 2;
  if (node?.type === "model3d") return 3;
  if (node?.type === "utility") return 4;
  if (node?.type === "videoModel") return 4;
  return 3;
}

function runStageLabel(type) {
  if (type === "text") return "text";
  if (type === "camera") return "camera";
  if (type === "imageModel") return "image";
  if (type === "model3d") return "3D";
  if (type === "utility") return "utility";
  if (type === "videoModel") return "video";
  return "selected";
}

function nodeTitle(node) {
  return node?.data?.title || node?.type || "a dependency";
}

async function settleSequential(items, run, delayMs = 0) {
  const results = [];

  for (const [index, item] of items.entries()) {
    if (index > 0 && delayMs > 0) await wait(delayMs);

    try {
      results.push({ status: "fulfilled", value: await run(item, index) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }

  return results;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cloneGraphState(state) {
  return {
    nodes: state.nodes.map(cloneNode),
    edges: state.edges.map(cloneEdge),
    groups: (state.groups || []).map(cloneGroup),
    viewport: { ...state.viewport },
    selectedNodeIds: [...state.selectedNodeIds],
    selectedEdgeId: state.selectedEdgeId || null
  };
}

function cloneNode(node) {
  return {
    ...node,
    data: JSON.parse(JSON.stringify(node.data || {}))
  };
}

function createNodeId(type, suffix = "") {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return [type, Date.now(), suffix, randomPart].filter(Boolean).join("-");
}

function workflowFileNameForProject(name) {
  const cleanName = String(name || "Untitled node project")
    .trim()
    .replace(/[^a-z0-9-_ ]+/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${cleanName || "newtnode-workflow"}.json`;
}

async function ensureWritableWorkflowHandle(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) return true;
  const options = { mode: "readwrite" };
  const currentPermission = await handle.queryPermission(options);
  if (currentPermission === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

async function writeWorkflowFileHandle(handle, workflow) {
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(workflow, null, 2));
  } finally {
    await writable.close();
  }
}

function downloadWorkflowJson(workflow, fileName) {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function resetCopiedNodeRuntime(data = {}) {
  if (!["running", "uploading"].includes(data.status)) return data;

  return {
    ...data,
    status: "ready",
    error: "",
    resultUrl: "",
    resultItems: [],
    selectedResultIndex: 0,
    resultText: ""
  };
}

function cloneEdge(edge) {
  return {
    ...edge,
    from: { ...edge.from },
    to: { ...edge.to }
  };
}

function cloneGroup(group) {
  return {
    ...group,
    nodeIds: [...(group.nodeIds || [])]
  };
}

function loadNodeEditorDraft() {
  const fallbackGraph = normalizeEditorGraph(initialNodes, initialEdges);
  const fallback = {
    nodes: fallbackGraph.nodes,
    edges: fallbackGraph.edges,
    groups: fallbackGraph.groups,
    viewport: { x: 0, y: 0, scale: 1 },
    projectId: null,
    projectName: "Untitled node project",
    savedProjectName: null,
    projectPackagePath: ""
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(nodeDraftStorageKey) || "null");
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return fallback;
    const graph = normalizeEditorGraph(parsed.nodes, parsed.edges, parsed.groups);
    return {
      nodes: graph.nodes,
      edges: graph.edges,
      groups: graph.groups,
      viewport: parsed.viewport || fallback.viewport,
      projectId: parsed.projectId || null,
      projectName: parsed.projectName || fallback.projectName,
      savedProjectName: parsed.savedProjectName || null,
      projectPackagePath: parsed.projectPackagePath || ""
    };
  } catch {
    return fallback;
  }
}

function normalizeEditorGraph(nodes = [], edges = [], groups = []) {
  const normalizedNodes = [];
  const legacySplits = new Map();

  nodes.forEach((node) => {
    if (isLegacyDirectionNode(node)) {
      const split = splitLegacyDirectionNode(node);
      normalizedNodes.push(split.transferNode);
      if (split.cameraNode) normalizedNodes.push(split.cameraNode);
      if (split.styleNode) normalizedNodes.push(split.styleNode);
      legacySplits.set(node.id, split);
      return;
    }

    normalizedNodes.push(normalizeCurrentNode(node));
  });

  const nodeMap = new Map(normalizedNodes.map((node) => [node.id, node]));
  const normalizedEdges = [];

  edges.forEach((edge) => {
    const split = legacySplits.get(edge.from.nodeId);
    if (split) {
      normalizedEdges.push(...edgesForLegacyDirection(edge, split));
      return;
    }

    const normalizedEdge = normalizeEdgeForCurrentGraph(edge, nodeMap);
    if (normalizedEdge) normalizedEdges.push(normalizedEdge);
  });

  return {
    nodes: normalizedNodes,
    edges: normalizeEdgesForCurrentGraph(normalizedEdges, normalizedNodes),
    groups: normalizeGroups(groups, nodeMap)
  };
}

function normalizeEdgesForCurrentGraph(edges = [], nodes = []) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return dedupeEdges(edges.map((edge) => normalizeEdgeForCurrentGraph(edge, nodeMap)).filter(Boolean));
}

function normalizeGroups(groups = [], nodeMap = new Map()) {
  if (!Array.isArray(groups)) return [];

  return groups
    .map((group, index) => {
      const nodeIds = [...new Set(Array.isArray(group?.nodeIds) ? group.nodeIds.filter((id) => nodeMap.has(id)) : [])];
      return {
        id: String(group?.id || `group-${index + 1}`),
        name: String(group?.name || `Group ${index + 1}`),
        color: groupPalette.includes(group?.color) ? group.color : groupPalette[index % groupPalette.length],
        x: finiteNumber(group?.x, 120 + index * 30),
        y: finiteNumber(group?.y, 120 + index * 30),
        width: Math.max(groupSizeFloor, finiteNumber(group?.width, groupSizeFloor)),
        height: Math.max(groupSizeFloor, finiteNumber(group?.height, groupSizeFloor)),
        nodeIds
      };
    })
    .filter((group) => group.id && group.width && group.height);
}

function normalizeCurrentNode(node) {
  const nextNode = clearStaleRunningState(node);
  const data = nextNode.data || {};

  if (nextNode.type === "videoModel" && isWanFunControlModel(data.model)) {
    return {
      ...nextNode,
      type: "utility",
      data: normalizeUtilityData({
        ...data,
        title: data.title === "Video Model" ? "Utility" : data.title,
        utilityMode: "video"
      })
    };
  }

  if (nextNode.type === "utility") {
    return {
      ...nextNode,
      data: normalizeUtilityData(data)
    };
  }

  if (nextNode.type === "composer") {
    return {
      ...nextNode,
      data: normalizeComposerData(data)
    };
  }

  if (nextNode.type === "imageModel") {
    return {
      ...nextNode,
      data: normalizeImageModelData(data)
    };
  }

  if (nextNode.type === "model3d") {
    return {
      ...nextNode,
      data: normalizeModel3DData(data)
    };
  }

  if (nextNode.type === "transfer") {
    return {
      ...nextNode,
      data: {
        ...data,
        title: transferTitleFromLegacy(data.title),
        fileName: data.fileName === "TRANSFER.png" ? moodBoardOutputFileName : data.fileName,
        moodBoardScale: data.moodBoardScale || 1,
        hiddenPrompt: transferPromptSuffix
      }
    };
  }

  if (nextNode.type === "character") {
    const characterSheetVariants = normalizeCharacterSheetVariants(data);
    const normalizedData = {
      ...createDefaultNodeData("character", "Character", 1),
      ...data,
      characterWardrobes: Array.isArray(data.characterWardrobes) ? data.characterWardrobes : [],
      characterVoices: Array.isArray(data.characterVoices) ? data.characterVoices : [],
      characterTraits: Array.isArray(data.characterTraits) ? data.characterTraits : [],
      characterSheetVariants,
      characterBatchProgress: null,
      characterTab: data.characterTab === "sheet" && data.resultUrl ? "sheet" : "build"
    };
    const selectedVariant = characterSheetVariantForWardrobeId(normalizedData, normalizedData.activeWardrobeId);
    return {
      ...nextNode,
      data: selectedVariant && normalizedData.locked && normalizedData.activated
        ? { ...normalizedData, ...characterVariantDisplayPatch(selectedVariant) }
        : normalizedData
    };
  }

  return nextNode;
}

function normalizeModel3DData(data = {}) {
  return {
    ...data,
    title: data.title || "3D",
    model: data.model || model3DNames.hunyuanPro,
    generateType: normalizeModel3DGenerateType(data.generateType),
    enablePbr: Boolean(data.enablePbr),
    faceCount: model3DFaceCount(data.faceCount),
    resultType: "model3d",
    batchCount: "1"
  };
}

function normalizeImageModelData(data = {}) {
  const model = data.model || "Nano Banana Pro";
  return {
    ...data,
    title: data.title || "Image Model",
    model,
    prompt: data.prompt || "",
    aspectRatio: normalizeImageModelAspectRatio(data.aspectRatio, model),
    resolution: data.resolution || "2K",
    batchCount: data.batchCount || "1"
  };
}

function normalizeComposerData(data = {}) {
  const composerScene = normalizedComposerScene(data.composerScene);
  const selectedStillExists = data.composerSelectedId === "camera" || [...composerScene.maquettes, ...composerScene.props, ...composerScene.imagePlanes].some((item) => item.id === data.composerSelectedId);
  return {
    ...data,
    title: data.title || "Composer",
    prompt: data.prompt || "",
    composerAspectRatio: normalizeComposerAspectRatio(data.composerAspectRatio),
    composerShowGuides: data.composerShowGuides !== false,
    composerSelectedId: selectedStillExists ? data.composerSelectedId : composerScene.maquettes[0]?.id || composerScene.props[0]?.id || composerScene.imagePlanes[0]?.id || "camera",
    composerSelectedCameraBookmark: data.composerSelectedCameraBookmark || "",
    composerSavedPoses: normalizeComposerSavedPoses(data.composerSavedPoses),
    composerScene
  };
}

function normalizeCharacterSheetVariants(data = {}) {
  const existing = Array.isArray(data.characterSheetVariants)
    ? data.characterSheetVariants.filter((variant) => variant?.wardrobeId && variant?.generated?.url)
    : [];
  if (existing.length || !data.resultUrl) return existing;

  const generated = (Array.isArray(data.resultItems) ? data.resultItems.find((item) => item?.url === data.resultUrl) : null) || {
    url: data.resultUrl,
    type: "image",
    label: `@${cleanPromptTag(data.characterName || data.title || "Character") || "Character"} Character Sheet`,
    fileName: data.fileName || ""
  };
  return [{
    wardrobeId: data.activeWardrobeId || characterDefaultWardrobeId,
    wardrobeUrl: data.compiledWardrobeUrl || "",
    wardrobeFileName: "Existing wardrobe",
    generated
  }];
}

function normalizeUtilityData(data = {}) {
  const utilityModeValue = data.utilityMode === "image" ? "image" : "video";
  const utilityVideoModel = normalizedUtilityVideoModelName(data.utilityVideoModel);
  return {
    ...data,
    title: data.title || "Utility",
    utilityMode: utilityModeValue,
    model: videoModelNames.wanFunControl,
    utilityImageModel: normalizedUtilityImageModelName(data.utilityImageModel),
    utilityVideoModel,
    resultType: utilityModeValue === "video" ? utilityVideoOutputType(utilityVideoModel) : "image",
    dwposeDrawMode: data.dwposeDrawMode || "body-pose",
    patinaMaps: patinaMapsForData(data),
    patinaOutputFormat: data.patinaOutputFormat || "png",
    patinaSeed: data.patinaSeed || "",
    colorIdMatteColor: normalizeColorIdMatteColor(data.colorIdMatteColor),
    colorIdMatteTolerance: colorIdMatteTolerance(data.colorIdMatteTolerance),
    colorIdMatteSampleRadius: colorIdMatteSampleRadius(data.colorIdMatteSampleRadius),
    colorIdMatteInvert: Boolean(data.colorIdMatteInvert),
    colorIdMatteName: String(data.colorIdMatteName || ""),
    colorIdMatteItems: normalizeColorIdMatteItems(data.colorIdMatteItems),
    colorIdMattePreviewMode: normalizeChoice(data.colorIdMattePreviewMode, ["overlay", "rgb", "matte"], "overlay"),
    colorIdMatteBlur: colorIdMatteBlur(data.colorIdMatteBlur),
    colorIdMatteExpand: colorIdMatteExpand(data.colorIdMatteExpand),
    colorIdMatteStartTime: data.colorIdMatteStartTime ?? "",
    colorIdMatteEndTime: data.colorIdMatteEndTime ?? "",
    colorIdMatteOutputFormat: normalizeChoice(data.colorIdMatteOutputFormat, colorIdMatteVideoOutputOptions.map(([value]) => value), "mp4"),
    compositeInvertMask: Boolean(data.compositeInvertMask),
    compositeMaskBlur: colorIdMatteBlur(data.compositeMaskBlur),
    compositeMaskExpand: colorIdMatteExpand(data.compositeMaskExpand),
    compositeOutputFormat: normalizeChoice(data.compositeOutputFormat, colorIdMatteVideoOutputOptions.map(([value]) => value), "mp4"),
    wanVaceNegativePrompt: String(data.wanVaceNegativePrompt || ""),
    wanVaceMatchInputNumFrames: data.wanVaceMatchInputNumFrames !== false,
    wanVaceNumFrames: data.wanVaceNumFrames || 81,
    wanVaceMatchInputFps: data.wanVaceMatchInputFps !== false,
    wanVaceFps: data.wanVaceFps || 16,
    wanVaceResolution: normalizeChoice(data.wanVaceResolution, wanVaceResolutionOptions, "720p"),
    wanVaceAspectRatio: normalizeChoice(data.wanVaceAspectRatio, wanVaceAspectRatioOptions, "auto"),
    wanVaceNumInferenceSteps: data.wanVaceNumInferenceSteps || 30,
    wanVaceGuidanceScale: data.wanVaceGuidanceScale || 5,
    wanVaceSampler: normalizeChoice(data.wanVaceSampler, wanVaceSamplerOptions, "unipc"),
    wanVaceShift: data.wanVaceShift || 5,
    wanVaceEnableSafetyChecker: data.wanVaceEnableSafetyChecker !== false,
    wanVaceEnablePromptExpansion: Boolean(data.wanVaceEnablePromptExpansion),
    wanVacePreprocess: Boolean(data.wanVacePreprocess),
    wanVaceAcceleration: normalizeChoice(data.wanVaceAcceleration, wanVaceAccelerationOptions, "regular"),
    wanVaceVideoQuality: normalizeChoice(data.wanVaceVideoQuality, ["low", "medium", "high", "maximum"], "high"),
    wanVaceVideoWriteMode: normalizeChoice(data.wanVaceVideoWriteMode, ["fast", "balanced", "small"], "balanced"),
    wanVaceNumInterpolatedFrames: Math.max(0, Math.round(Number(data.wanVaceNumInterpolatedFrames || 0))),
    stillFrameTime: data.stillFrameTime ?? 0,
    sam3VideoDetectionThreshold: data.sam3VideoDetectionThreshold ?? 0.5,
    extractFrameTime: data.extractFrameTime ?? 0,
    extractFrameFormat: data.extractFrameFormat === "jpeg" ? "jpeg" : "png",
    batchCount: data.batchCount || "1",
    preprocessVideo: data.preprocessVideo !== false,
    preprocessType: data.preprocessType || "depth",
    matchInputNumFrames: data.matchInputNumFrames !== false,
    numFrames: data.numFrames || 81,
    matchInputFps: data.matchInputFps !== false,
    fps: data.fps || 16,
    voidNumFrames: normalizeVoidVideoFrameCount(data.voidNumFrames),
    rifeNumFrames: data.rifeNumFrames || 1,
    rifeUseSceneDetection: data.rifeUseSceneDetection !== false,
    rifeUseCalculatedFps: data.rifeUseCalculatedFps !== false,
    rifeFps: data.rifeFps || 24,
    rifeLoop: Boolean(data.rifeLoop),
    bytedanceUpscalerTargetResolution: data.bytedanceUpscalerTargetResolution || "1080p",
    bytedanceUpscalerTargetFps: data.bytedanceUpscalerTargetFps || "30fps",
    bytedanceUpscalerPreset: data.bytedanceUpscalerPreset || "general",
    bytedanceUpscalerTier: data.bytedanceUpscalerTier || "standard",
    bytedanceUpscalerFidelity: data.bytedanceUpscalerFidelity || "high",
    bytedanceUpscalerScaleRatio: data.bytedanceUpscalerScaleRatio || "",
    topazUpscalerModel: data.topazUpscalerModel || "Proteus",
    topazUpscalerFactor: data.topazUpscalerFactor || 2,
    topazUpscalerTargetFps: data.topazUpscalerTargetFps || "source",
    topazUpscalerBillingTier: data.topazUpscalerBillingTier || "auto",
    topazUpscalerH264Output: Boolean(data.topazUpscalerH264Output),
    topazUpscalerCompression: data.topazUpscalerCompression ?? "",
    topazUpscalerNoise: data.topazUpscalerNoise ?? "",
    topazUpscalerHalo: data.topazUpscalerHalo ?? "",
    topazUpscalerGrain: data.topazUpscalerGrain ?? "",
    topazUpscalerRecoverDetail: data.topazUpscalerRecoverDetail ?? "",
    numInferenceSteps: data.numInferenceSteps || 27,
    guidanceScale: data.guidanceScale || 6,
    shift: data.shift || 5,
    seed: data.seed || ""
  };
}

function isLegacyDirectionNode(node) {
  return node.type === "direction" || (node.type === "style" && hasLegacyDirectionData(node));
}

function hasLegacyDirectionData(node) {
  const data = node.data || {};
  return Array.isArray(data.styleImages) || "activated" in data || "locked" in data || "hiddenPrompt" in data || "shotPreset" in data || "lensPreset" in data || "typePreset" in data;
}

function splitLegacyDirectionNode(node) {
  const data = node.data || {};
  const transferNode = clearStaleRunningState({
    ...node,
    type: "transfer",
    data: {
      ...data,
      title: transferTitleFromLegacy(data.title),
      transferImages: data.transferImages || data.styleImages || [],
      moodBoardScale: data.moodBoardScale || 1,
      hiddenPrompt: transferPromptSuffix
    }
  });

  const cameraNode = hasCameraPreset({ data })
    ? {
        id: `${node.id}-camera`,
        type: "camera",
        x: node.x + 360,
        y: node.y,
        data: {
          title: "Camera",
          shotPreset: data.shotPreset || "None",
          lensPreset: data.lensPreset || "None",
          typePreset: data.typePreset || "None",
          qwenCameraOpen: false,
          ...qwenCameraDefaults
        }
      }
    : null;

  const styleNode =
    data.stylePreset && data.stylePreset !== "None"
      ? {
          id: `${node.id}-style`,
          type: "style",
          x: node.x + 360,
          y: node.y + 118,
          data: {
            title: "Style",
            stylePreset: data.stylePreset
          }
        }
      : null;

  return {
    originalId: node.id,
    transferNode,
    cameraNode,
    styleNode
  };
}

function edgesForLegacyDirection(edge, split) {
  const edges = [];

  if (edge.to.port === "imagePromptIn") {
    edges.push({
      ...cloneEdge(edge),
      id: `${edge.id}-transfer`,
      from: { nodeId: split.transferNode.id, port: "transferOut" },
      to: { ...edge.to, port: "transferIn" },
      color: portColors.transfer
    });

    if (split.cameraNode) {
      edges.push({
        id: `${edge.id}-camera`,
        from: { nodeId: split.cameraNode.id, port: "cameraOut" },
        to: { ...edge.to, port: "cameraIn" },
        color: portColors.camera
      });
    }

    if (split.styleNode) {
      edges.push({
        id: `${edge.id}-style`,
        from: { nodeId: split.styleNode.id, port: "styleOut" },
        to: { ...edge.to, port: "styleIn" },
        color: portColors.style
      });
    }
  }

  if (edge.to.port === "sourceIn") {
    edges.push({
      ...cloneEdge(edge),
      id: `${edge.id}-transfer`,
      from: { nodeId: split.transferNode.id, port: "transferOut" },
      color: portColors.transfer
    });
  }

  return edges;
}

function normalizeEdgeForCurrentGraph(edge, nodeMap) {
  const source = nodeMap.get(edge.from.nodeId);
  if (!source) return null;

  const nextEdge = cloneEdge(edge);
  const target = nodeMap.get(edge.to.nodeId);

  if (target?.type === "model3d" && nextEdge.to.port === "imageIn") {
    nextEdge.to.port = "frontImageIn";
  }

  if (target?.type === "utility" && !utilityInputPortIds(target.data?.utilityMode, target.data?.utilityImageModel, target.data?.utilityVideoModel).includes(nextEdge.to.port)) {
    return null;
  }

  if (source.type === "transfer") {
    nextEdge.from.port = "transferOut";
    if (nextEdge.to.port === "imagePromptIn") nextEdge.to.port = "transferIn";
    nextEdge.color = portColors.transfer;
  }

  if (source.type === "camera") {
    if (isCameraImageEdge(nextEdge, target)) {
      nextEdge.from.port = "imageOut";
      nextEdge.color = portColors.image;
    } else {
      if (!hasCameraPreset(source)) return null;
      nextEdge.from.port = "cameraOut";
      nextEdge.color = portColors.camera;
    }
  }

  if (source.type === "style") {
    nextEdge.from.port = "styleOut";
    nextEdge.color = portColors.style;
  }

  if (source.type === "utility") {
    nextEdge.from.port = "utilityOut";
    nextEdge.color = utilityOutputType(source) === "video" ? portColors.video : portColors.image;
  }

  if (source.type === "model3d") {
    nextEdge.from.port = "modelOut";
    nextEdge.color = portColors.model3d;
  }
  if (source.type === "character") {
    if (nextEdge.from.port === "voiceOut") {
      nextEdge.color = portColors.audio;
    } else {
      nextEdge.from.port = "characterOut";
      nextEdge.color = portColors.character;
    }
  }

  if (!inputPortIdsForNode(target).includes(nextEdge.to.port)) return null;
  if (!outputPortIdsForNode(source).includes(nextEdge.from.port)) return null;

  return nextEdge;
}

function isCameraImageEdge(edge, target) {
  if (edge.from.port === "imageOut") return true;
  if (edge.to.port === "sourceIn") return true;
  if (target?.type === "text" && edge.to.port === "imageIn") return true;
  if (target?.type === "camera" && edge.to.port === "imageIn") return true;
  if (target?.type === "composer" && edge.to.port === "imageIn") return true;
  if (target?.type === "model3d" && isModel3DImageInputPort(edge.to.port)) return true;
  if (target?.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(edge.to.port)) return true;
  if (target?.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(edge.to.port)) return true;
  if (target?.type === "utility" && ["imageIn", "referenceImageIn"].includes(edge.to.port)) return true;
  return false;
}

function sameEdgeList(first = [], second = []) {
  if (first.length !== second.length) return false;
  return first.every((edge, index) => {
    const nextEdge = second[index];
    return (
      edge.id === nextEdge?.id &&
      edge.from?.nodeId === nextEdge.from?.nodeId &&
      edge.from?.port === nextEdge.from?.port &&
      edge.to?.nodeId === nextEdge.to?.nodeId &&
      edge.to?.port === nextEdge.to?.port &&
      edge.color === nextEdge.color
    );
  });
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.from.nodeId}:${edge.from.port}->${edge.to.nodeId}:${edge.to.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clearStaleRunningState(node) {
  if (node.data?.status !== "running") return node;

  return {
    ...node,
    data: {
      ...node.data,
      status: node.data.resultUrl ? "complete" : "ready"
    }
  };
}

function transferTitleFromLegacy(title) {
  if (!title) return "Mood Board";
  return String(title).replace(/^(Style|Direction|Transfer)\b/, "Mood Board");
}

function roundPreviewScale(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampContextMenuPosition(x, y, rect, menuSize = contextMenuSize) {
  const width = positiveDimension(menuSize.width, contextMenuSize.width);
  const height = positiveDimension(menuSize.height, contextMenuSize.height);
  const maxX = Math.max(contextMenuSize.inset, rect.width - width - contextMenuSize.inset);
  const maxY = Math.max(contextMenuSize.inset, rect.height - height - contextMenuSize.inset);

  return {
    x: clamp(x, contextMenuSize.inset, maxX),
    y: clamp(y, contextMenuSize.inset, maxY)
  };
}

function positiveDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveModulo(value, divisor) {
  if (!divisor) return 0;
  return ((value % divisor) + divisor) % divisor;
}

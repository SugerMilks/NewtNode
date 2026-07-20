import React from "react";
import {
  Box,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  Download,
  FileAudio,
  FileImage,
  Film,
  FolderOpen,
  Info,
  MonitorPlay,
  ImagePlus,
  Loader2,
  Lock,
  Maximize2,
  Megaphone,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Palette,
  Pause,
  PersonStanding,
  Pipette,
  Play,
  Plus,
  GripVertical,
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
import { composerApi, historyApi, nodeApi, systemApi } from "./api/newtApi.js";
import { CameraControlViewport } from "./components/CameraControlViewport.jsx";
import { EdgePath, SelectionActionBar, SelectionMarquee, UnsavedWorkflowPrompt } from "./components/CanvasChrome.jsx";
import { ComposerViewport } from "./components/ComposerViewport.jsx";
import { FrameItNodeBody } from "./components/FrameItNodeBody.jsx";
import {
  Model3DViewer,
  OutputPreviewLightbox,
  ProjectOutputDrawer,
  ResultPane,
  useNewtNodeImageFallback,
  useNewtNodeVideoFallback
} from "./components/MediaViews.jsx";
import { ComposerNodeBody, MediaAssetNodeBody, PlainTextNodeBody, SkillDirectorNodeBody, TextModelNodeBody } from "./components/NodeBodies.jsx";
import { NodeRow, OutputPortRow, PortHandle } from "./components/NodePorts.jsx";
import { StyleCollage } from "./components/StyleCollage.jsx";
import { canvasToBlob, createTransferCollageBlob, drawImageCover, loadCanvasImage } from "./canvasMedia.js";
import { renderComposerViewport } from "./composerRender.js";
import {
  composerAspectRatioNumber,
  composerAspectRatioValue,
  composerImageAspectFromSource,
  composerPrimitiveLabel,
  composerPrimitiveOptions,
  composerPoseSnapshot,
  composerRotationVector,
  composerRotationVectorPatch,
  composerSavedPosePatch,
  defaultComposerImagePlane,
  defaultComposerMaquette,
  defaultComposerProp,
  defaultComposerScene,
  mergeComposerSavedPoses,
  normalizeComposerAspectRatio,
  normalizeComposerSavedPose,
  normalizeComposerSavedPoses,
  normalizedComposerScene,
  resolveComposerImagePlaneSources
} from "./composerState.js";
import { defaultFrameItScene, normalizeFrameItSavedPoses, normalizeFrameItScene } from "./frameItState.js";
import {
  colorIdMatteBlur,
  colorIdMatteExpand,
  colorIdMatteImageData,
  colorIdMatteRunColors,
  colorIdMatteSampleRadius,
  colorIdMatteTolerance,
  drawColorIdMattePickerCanvas,
  normalizeColorIdMatteColor,
  normalizeColorIdMatteItems,
  rgbToHex
} from "./colorIdMatte.js";
import {
  allowFileDrop,
  assetFromOutputItem,
  capitalizeMediaType,
  clearOutputItemDragData,
  currentDraggedOutputItem,
  fileBaseName,
  fileNameFromLocalUrl,
  finishOutputItemDragData,
  firstAcceptedFile,
  hasOutputItemDragData,
  hasSupportedDroppedFile,
  isOutputItemCompatibleWithNode,
  mimeForOutputItem,
  nodeTypeForDroppedFile,
  outputDragEndEvent,
  outputDragMime,
  outputItemFromDataTransfer,
  previewImageUrl,
  setOutputItemDragData
} from "./mediaAssets.js";
import { appendResultItems, existingResultItemsForNode, normalizedResultItems } from "./mediaResults.js";
import { normalizeOpenAiImage2Quality, openAiImage2Quality, openAiImage2QualityOptions } from "./openAiImage2.js";
import {
  batchOptions,
  birefnetModelOptions,
  birefnetResolutionOptions,
  bytedanceUpscalerFidelityOptions,
  bytedanceUpscalerFpsOptions,
  bytedanceUpscalerPresetOptions,
  bytedanceUpscalerResolutionOptions,
  bytedanceUpscalerTierOptions,
  characterTraitOptions,
  colorIdMatteVideoOutputOptions,
  happyHorseDurationOptions,
  imageBatchOptions,
  enabledImageModelOptions,
  enabledVideoModelOptions,
  firstEnabledImageModel,
  firstEnabledVideoModel,
  imageModelNames,
  imageModelOptions,
  imageModelAutoAspectRatio,
  imageResolutionOptions,
  geminiOmniAspectRatioOptions,
  geminiOmniDurationOptions,
  geminiOmniResolutionOptions,
  krea2AspectRatios,
  krea2CreativityOptions,
  klingO34kAspectRatioOptions,
  klingO34kDurationOptions,
  klingO34kResolutionOptions,
  klingO3ProAspectRatioOptions,
  klingO3ProDurationOptions,
  klingO3ProResolutionOptions,
  lensPresetNames,
  lensPresetPrompts,
  lumaImageAspectRatios,
  lumaVideoAspectRatioOptions,
  lumaVideoDurationOptions,
  lumaVideoResolutionOptions,
  model3DDescription,
  model3DNames,
  model3DViewInputs,
  nanoImageAspectRatios,
  openAiImageAspectRatios,
  patinaMapOptions,
  qwenCameraDefaults,
  sam3SegmentationModelsEnabled,
  seedanceVideoAspectRatioOptions,
  seedanceVideoDurationOptions,
  seedanceVideoResolutionOptions,
  seedanceFastVideoResolutionOptions,
  seedream5ResolutionOptions,
  shotPresetNames,
  shotPresetPrompts,
  stylePresetNames,
  stylePresetPrompts,
  topazUpscalerBillingTierOptions,
  topazUpscalerFpsOptions,
  topazUpscalerModelOptions,
  typePresetNames,
  typePresetPrompts,
  utilityImageModelNames,
  utilityModelDescriptions,
  utilityVideoModelNames,
  videoModelOptions,
  videoModelNames,
  voidVideoFrameOptions,
  wan27ReferenceAspectRatioOptions,
  wan27ReferenceDurationOptions,
  wan27ReferenceResolutionOptions,
  wanVaceAccelerationOptions,
  wanVaceAspectRatioOptions,
  wanVaceResolutionOptions,
  wanVaceSamplerOptions
} from "./modelOptions.js";
import { isGeminiOmniModel } from "./geminiOmni.js";
import { isNanoBanana2Model, nanoBanana2ResolutionOptions, normalizeNanoBanana2Resolution } from "./nanoBanana2.js";
import {
  clamp,
  clampContextMenuPosition,
  estimatedNodeHeight,
  estimatedNodeRect,
  estimatedNodeWidth,
  graphBoundsForNodes,
  groupToRect,
  normalizeRect,
  pointInRect,
  positiveModulo,
  rectsIntersect,
  rectsOverlap
} from "./nodeGeometry.js";
import { nodeTypeDefinitions, nodeTypeForOutputItem, nodeTypeLabel } from "./nodeRegistry.js";
import {
  canScrollableElementConsumeVerticalWheel,
  shouldStoryboardFrameTextareaConsumeWheel,
  shouldPrioritizeSelectedTextareaWheel
} from "./nodeWheelRouting.js";
import {
  appendedNodeResultState,
  batchRunError,
  formatNodeBatchCount,
  fulfilledRunValues,
  ensureRunSuccesses,
  isRunnableNode,
  nodeBatchCount,
  nodeRunIndexes,
  rejectedRunResults,
  resultTextFromItems,
  runRunnableNodesByDependencyOrder,
  settleSequential
} from "./nodeRunner.js";
import { run3DModelGeneration, runAutoAspectGeneration, runCharacterSheetGeneration, runImageModelGeneration } from "./nodeRunners/mediaModels.js";
import { runSkillDirectorNode } from "./nodeRunners/skillDirector.js";
import { appendFilmDirectorRevisionHistory } from "./filmDirectorRevision.js";
import { runTextNodeProcessing } from "./nodeRunners/textModels.js";
import {
  buildUtilityVideoRequest,
  buildVideoGenerationRequest,
  normalizeUtilityVideoGenerationResult,
  normalizeVideoGenerationResult,
  videoModelSupportsFilmDirector
} from "./nodeRunners/videoModels.js";
import { buildProjectOutputItems } from "./projectOutputs.js";
import { degreesToRadians, radiansToDegrees } from "./threeRuntime.js";
import { loadNodeEditorDraft, nodeEditorDraftSnapshot, useNodeEditorDraftPersistence } from "./useNodeEditorDraft.js";
import { useWorkflowPersistence } from "./useWorkflowPersistence.js";
import { appendWorkflowContextFormFields, workflowContextPayload } from "./workflowContext.js";
import {
  clearStaleRunningState,
  cloneEdge,
  cloneGraphState,
  cloneNode,
  createNodeId,
  dedupeEdges,
  resetCopiedNodeRuntime,
  sameEdgeList,
  sameStringList
} from "./workflowState.js";
import "./nodeEditor.css";

const ColorIdMattePicker = React.lazy(() => import("./components/ColorIdMatteControls.jsx").then((module) => ({ default: module.ColorIdMattePicker })));
const ColorIdMatteVideoPicker = React.lazy(() => import("./components/ColorIdMatteControls.jsx").then((module) => ({ default: module.ColorIdMatteVideoPicker })));

const nodeIcons = {
  plainText: Type,
  image: FileImage,
  video: Video,
  preview: MonitorPlay,
  character: UserRound,
  camera: Camera,
  composer: Box,
  frameIt: PersonStanding,
  style: Palette,
  transfer: Compass,
  utility: Wrench,
  audio: FileAudio,
  model3d: Box,
  autoAspect: Maximize2,
  imageModel: ImagePlus,
  videoModel: Film,
  storyboard: Clapperboard,
  skillDirector: Megaphone,
  text: Type
};

const nodeCatalog = nodeTypeDefinitions.map((definition) => ({
  ...definition,
  icon: nodeIcons[definition.type] || Box
}));

const nodeHelpContent = {
  plainText: {
    title: "Text",
    lines: [
      "Use this as a simple prompt or note source.",
      "Connect the yellow output to nodes that need text direction."
    ]
  },
  text: {
    title: "Smart Text",
    lines: [
      "Turns connected references and written direction into cleaner prompt text.",
      "Run the node, then use the yellow output wherever that text should drive another node."
    ]
  },
  skillDirector: {
    title: "Film Director",
    lines: [
      "Builds a cinematic video plan from characters, locations, props, style, and scene direction.",
      "Lock each section in order, build the scene, then connect the blue director output to a video model."
    ]
  },
  image: {
    title: "Image",
    lines: [
      "Holds an uploaded or generated still image.",
      "Use the blue output as an image prompt, reference, storyboard input, or preview source."
    ]
  },
  video: {
    title: "Video",
    lines: [
      "Holds an uploaded or generated video clip.",
      "Connect the green output to preview, utility, or video-reference inputs."
    ]
  },
  audio: {
    title: "Audio",
    lines: [
      "Holds an uploaded audio file.",
      "Use the orange output when a video model supports dialogue or audio reference."
    ]
  },
  preview: {
    title: "Preview",
    lines: [
      "Reviews connected images, videos, and layouts without generating new media.",
      "Use the Layout tab to arrange frames, edit images, and export ordered frame files."
    ]
  },
  autoAspect: {
    title: "Auto Aspect",
    lines: [
      "Reframes one connected image into selected aspect ratios.",
      "Use advanced options for model, resolution, or removing graphic overlays before compositing."
    ]
  },
  storyboard: {
    title: "Storyboard",
    lines: [
      "Plans and generates ordered storyboard frames from a scene description or Film Director input.",
      "Lock the board to create a compiled storyboard image and connect its blue output downstream."
    ]
  },
  character: {
    title: "Character",
    lines: [
      "Creates consistent character sheets from portrait and wardrobe references.",
      "Use the character tag and cyan output to keep people consistent across image and video generations."
    ]
  },
  camera: {
    title: "Camera",
    lines: [
      "Adds shot size, lens, and angle direction to image generations.",
      "Connect the red output to an image model camera input."
    ]
  },
  composer: {
    title: "Composer",
    lines: [
      "Builds a staged 3D reference layout for blocking, camera, and object placement.",
      "Capture a view and use it as an image reference or composition guide."
    ]
  },
  frameIt: {
    title: "Frame It",
    lines: [
      "Pose one or more articulated figures, then frame the scene with camera and aspect-ratio controls.",
      "Option-drag orbits, Command-drag pans, and Command-scroll dollies the camera. Unmodified gestures navigate the node canvas.",
      "Capture the current view and connect the blue output as an image reference anywhere in NewtNode."
    ]
  },
  style: {
    title: "Style",
    lines: [
      "Applies a preset or custom palette as hidden style direction.",
      "Connect the purple output to an image model style input."
    ]
  },
  transfer: {
    title: "Mood Board",
    lines: [
      "Combines up to six images into one style reference board.",
      "Lock it, then connect the pink output to models that support mood board style transfer."
    ]
  },
  utility: {
    title: "Utility",
    lines: [
      "Contains helper tools for media cleanup, extraction, masks, and other workflow tasks.",
      "Connect supported media, choose the tool, then run or export the result."
    ]
  },
  model3d: {
    title: "3D",
    lines: [
      "Holds a 3D model asset for preview or downstream layout workflows.",
      "Use it when a scene needs object or set reference beyond a flat image."
    ]
  },
  imageModel: {
    title: "Image Model",
    lines: [
      "Generates images from prompt text and supported references.",
      "Choose model, aspect ratio, resolution, and generation count, then run the yellow button."
    ]
  },
  videoModel: {
    title: "Video Model",
    lines: [
      "Generates videos from prompt text and supported image, video, audio, storyboard, or director inputs.",
      "A text prompt or Film Director input is required before running."
    ]
  }
};

const portColors = {
  prompt: "#f0c83b",
  image: "#3d85ff",
  camera: "#ef4444",
  style: "#9b5cff",
  transfer: "#ff4fb3",
  character: "#27d5e8",
  director: "#6f7dff",
  video: "#58ce63",
  audio: "#ff8b35",
  model3d: "#14d8c8",
  preview: "#8d8d8d"
};

const maxTransferImages = 6;
const moodBoardOutputFileName = "MOOD_BOARD.png";
const autoAspectDefaultRatios = [];
const autoAspectModelOptions = [imageModelNames.openAiImage2, imageModelNames.nanoBananaPro];
const composerCharacterPortPrefix = "characterIn:";
const maxCharacterWardrobes = 8;
const maxCharacterVoices = 8;
const characterDefaultWardrobeId = "__default-wardrobe__";
const characterSheetPrompt =
  "Make one image:\n\nStudy the reference image of the character and preserve the person's identity, physical features, proportions, image quality, and visual style as closely as possible.\n\nCreate one high-resolution horizontal character photo sheet on a clean white background. The final image must contain exactly six panels and exactly six total depictions of the same character. Follow this fixed layout precisely:\n- On the left side, place two tall vertical full-body panels side by side: one full body front view, then one full body side profile.\n- On the right side, place four equal 1:1 square face close-up panels in a clean 2 by 2 grid: top left is a left side face profile, top right is a right side face profile, bottom left is a front face portrait with a resting neutral expression, and bottom right is a front face portrait with a natural talking expression with the mouth slightly open.\n\nEach panel must contain exactly one view only. Keep the grid clean, evenly spaced, and clearly separated by simple white spacing. Do not generate any additional views, duplicate depictions, merged two-in-one panels, alternate variations, split sheets, comparison images, multiple sheets, text, labels, props, frames, or borders.";
const cinematicCharacterSheetPrompt =
  "Make one image:\n\nStudy the reference image of the character and preserve the person's identity, physical features and proportions as closely as possible. It's important the image is realistic with natural skin texture and natural skin tones. Preserve only the skin detail and texture naturally visible in the reference image, with subtle tonal variation, natural translucency, and restrained matte-to-satin highlights. Do not invent, exaggerate, sharpen, or outline pores, wrinkles, blemishes, facial lines, or other skin features that are not clearly present in the reference. Skin must not look plastic, waxy, airbrushed, porcelain, oily, overly smooth, glossy, synthetic, or digitally retouched. Avoid excessive specular highlights, HDR sheen, beauty-filter smoothing, and CG skin texture. High-end cinematic still frame, shot on ARRI Alexa 35, high quality prime lens, high dynamic range, shallow depth of field, atmospheric cinematography, subtle halation, very gentle lens bloom that does not soften identity-defining detail, fine film grain, realistic lens softness, very slight atmospheric haze, imperfect real-camera texture, high production value, feature film look.\n\nThe final image must contain exactly six panels and exactly six total depictions of the same character placed on the same solid gray background. Follow this fixed layout precisely:\n- On the left side, place two tall vertical full-body panels side by side: one full body front view, then one full body side profile.\n- On the right side, place four equal 1:1 square face close-up panels in a clean 2 by 2 grid: top left is a left side face profile, top right is a right side face profile, bottom left is a front face portrait with a resting neutral expression, and bottom right is a front face portrait with a natural talking expression with the mouth slightly open.\n\nEach panel must contain exactly one view only. Keep the grid clean, evenly spaced, and clearly separated by simple white spacing. Do not generate any additional views, duplicate depictions, merged two-in-one panels, alternate variations, split sheets, comparison images, multiple sheets, text, labels, props, frames, or borders.";
const characterBasicWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all six views. Replace the current wardrobe with a minimal form-fitting plain black one-piece wardrobe, consistently worn in every panel. Do not show the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";
const characterWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all six views. Study the selected wardrobe sheet reference and apply only the clothing design, garments, materials, colors, and styling from that reference consistently to the character in every panel. If any person, model, face, body, skin, hair, pose, environment, background, text, or unrelated subject appears in the wardrobe reference, ignore it completely. Do not transfer the wardrobe reference person's identity, anatomy, facial features, pose, body shape, or composition. The character portrait reference is the only source for character identity. Do not show the basic black outfit, the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";
const characterVoicePrompt =
  "Use the provided dialogue audio file for the character and make sure the dialogue is seamlessly and realistically integrated into the scene with professional mixing techniques.";
const composerReferencePrompt = (writtenPrompt = "") => {
  const cleanWrittenPrompt = String(writtenPrompt || "").trim();
  return `Use the input guide image as a locked spatial blueprint. Use the written prompt as the sole source for the final subject matter, character design, wardrobe, environment, lighting, color, material, texture, style, mood, and rendering quality.

The input guide image controls composition and spatial structure only. The written prompt controls the final visual interpretation only.

STRICT POSE TRACE REQUIREMENT

Treat the input guide image as a rotoscope underlay, pose skeleton, and spatial control map. The final rendered subjects must be retargeted directly onto the visible guide subjects, not loosely inspired by them.

For every primary subject, match the visible 2D screen position of the head, neck, shoulder line, torso centerline, hips, elbows, wrists, hands, knees, ankles, feet, and major silhouette corners as closely as possible. If the final image were overlaid on the guide image, the pose, limb endpoints, body angle, subject size, and subject placement should visibly line up.

Do not naturalize, straighten, relax, rebalance, beautify, simplify, or make the pose more comfortable. If the guide pose is awkward, asymmetric, off-balance, puppet-like, mannequin-like, partially cropped, or physically unusual, preserve that exact spatial arrangement. The final subject's anatomy may be rendered naturally, but it must occupy the same pose footprint and keep the same gesture and limb endpoints.

GUIDE IMAGE ROLE

Analyze the input guide image and preserve its visible layout exactly.

The input guide image controls:
composition, camera angle, camera height, lens perspective, framing, crop, subject count, subject placement, subject scale, foreground/background depth relationships, pose, gesture, stance, body orientation, head placement, torso orientation, shoulder line, limb placement, hand and foot endpoints, silhouette, body blocking, occlusion, contact points, negative space, and overall staging.

The input guide image does not control:
subject identity, character design, facial design, wardrobe, accessories, color, material, texture, lighting, background design, environment details, mood, rendering style, or level of finish.

CHARACTER REFERENCE ROLE

If character reference images are provided, they control character identity, face, body type, selected wardrobe, and character-specific surface detail only. They do not control pose, stance, gesture, head angle, limb placement, hand position, foot position, camera, crop, scale, lighting, background, or composition.

Never copy a pose, relaxed standing posture, portrait stance, camera angle, crop, or expression from a character reference sheet. Retarget each character onto the corresponding guide-image subject while keeping the guide image's pose and spatial structure as the highest priority.

WRITTEN PROMPT ROLE

Use the written prompt only for:
final subject identity, character details, facial design, expression, wardrobe, props that are explicitly requested, environment, background style, lighting, color palette, materials, texture, atmosphere, mood, art direction, medium, and rendering quality.

Apply the written prompt inside the locked spatial structure of the input guide image.

PRIMARY TRANSFORMATION

Replace the guide image's placeholder forms completely with the subjects and scene described in the written prompt.

The final image should look as though the written prompt was painted directly over the input guide image, while preserving the guide image's composition, pose, scale, camera, crop, silhouette, depth, and staging.

All major subjects in the guide image must keep their original:
position in frame, relative size, distance from camera, body orientation, pose class, gesture, stance, crop, silhouette, occlusion relationship, and relationship to other subjects.

SUBJECT MAPPING

Map the main visible figures, objects, or compositional masses from the input guide image to the subjects or elements described in the written prompt.

Preserve the guide image's:
number of primary subjects
left-to-right ordering
foreground-to-background ordering
relative scale between subjects
viewing angle of each subject
pose and gesture of each subject
crop of each subject
occlusion between subjects
spacing between subjects
negative space around subjects

Do not add, remove, merge, split, shrink, enlarge, or reposition primary subjects unless the written prompt explicitly requires it. If the written prompt requires added detail, keep it subordinate to the guide image's existing composition.

POSE AND BODY LOCK

Preserve each figure's pose from the input guide image.

Keep:
standing figures standing
seated figures seated
kneeling figures kneeling
crouching figures crouching
reclining figures reclining
walking figures walking
running figures running
leaning figures leaning in the same direction
turned figures turned the same way
front-facing figures front-facing
back-facing figures back-facing
side-facing figures side-facing
over-the-shoulder figures over-the-shoulder

Also keep each visible arm, hand, leg, foot, shoulder, hip, head, and torso in the same screen-space position and the same relative distance from every other visible body part. Do not treat the pose as a general action label; treat it as an exact body layout to trace.

Do not reinterpret the action or emotional body language by changing the body pose. Express emotion through face, lighting, color, texture, and style, not through a new pose.

Preserve:
head angle and placement
neck direction
torso orientation
shoulder placement
arm angles
hand endpoints
leg angles
foot placement
weight distribution
contact points
body tension
silhouette outline

Do not move hands, feet, head, torso, or limbs away from their guide-image positions. Do not turn a standing figure into a seated figure, a cropped figure into a full figure, a background figure into a foreground figure, or a foreground figure into a background figure.

CAMERA AND FRAMING LOCK

Preserve the guide image's camera and frame.

Keep:
same aspect ratio
same camera angle
same camera height
same lens perspective
same distance relationship to subjects
same crop
same framing
same horizon or implied horizon
same foreground, midground, and background structure
same empty-space pattern

Do not mirror, rotate, zoom, recrop, reframe, change the camera height, change the lens perspective, or change the apparent distance between camera and subjects.

CROP AND OCCLUSION LOCK

If a subject is cropped by the frame in the guide image, keep that subject cropped in the same way.

If a subject is partially hidden, blocked, or overlapped by another subject or object in the guide image, preserve that same occlusion relationship.

If the guide image contains a large foreground shape, close-up body part, over-the-shoulder framing element, cropped object, or blocking mass, preserve its role as a large foreground compositional element.

Do not turn cropped or occluded elements into fully visible elements. Do not reveal hidden body parts or complete forms that are cropped out of the guide image.

NEGATIVE SPACE LOCK

Preserve the guide image's negative space and visual breathing room.

The written prompt may define the environment, but environmental details must fit behind and around the locked composition. Do not fill open areas with large new props, scenery, architecture, furniture, crowds, text, symbols, or decorative elements that change the guide image's spatial balance.

Add background and atmosphere only where they do not disturb subject placement, silhouette, staging, occlusion, or negative space.

STYLE REPLACEMENT

Do not copy the guide image's placeholder appearance.

Do not preserve:
guide image color
guide image material
guide image texture
guide image lighting
guide image background
mannequin-like appearance
primitive shapes
unfinished surfaces
simple gray or colored placeholder look
construction artifacts
rigging marks
model seams
guide-object identity

The guide image is not the final subject and not the final style. It is only the composition and pose blueprint.

CONFLICT RULE

If the written prompt conflicts with the input guide image's pose, staging, camera, crop, subject placement, or silhouette, follow the input guide image.

If the written prompt implies a different pose, different camera angle, different framing, different subject scale, different subject position, or different action, ignore that spatial implication and keep the guide image layout.

If a requested costume, accessory, prop, or environment detail would require changing the locked pose, silhouette, crop, or staging, adapt that detail so it fits within the guide image's existing visual footprint.

FORBIDDEN CHANGES

Do not mirror the composition.
Do not rotate the composition.
Do not zoom in or out.
Do not recrop.
Do not reframe.
Do not change camera height.
Do not change lens perspective.
Do not change subject count.
Do not change subject placement.
Do not change foreground/background order.
Do not change relative subject scale.
Do not change pose class.
Do not change stance.
Do not change gesture.
Do not replace an unusual pose with a more natural pose.
Do not make a character stand straighter, lower their arms, raise their arms, uncross legs, plant both feet, or relax their posture unless the guide image already shows that.
Do not move head, hands, feet, torso, or limb endpoints.
Do not alter silhouette or body blocking.
Do not reveal cropped-out body parts.
Do not remove occlusion.
Do not fill negative space with new large elements.
Do not copy placeholder materials, colors, lighting, or primitive construction from the guide image.

PRIORITY ORDER

1. Preserve the input guide image's composition, camera, crop, subject placement, relative scale, depth, silhouette, occlusion, pose, and negative space.
2. Preserve each subject's pose class, orientation, gesture, stance, body blocking, and frame crop.
3. Preserve exact screen-space limb endpoints and body-part relationships from the guide image, including hands, feet, elbows, knees, shoulders, hips, head, and torso.
4. Apply the written prompt's subject identity, character design, wardrobe, materials, environment, lighting, style, mood, and rendering quality.
5. Add detail only where it does not change the locked composition or pose footprint.
6. When any instruction conflicts, the guide image's spatial structure wins.

WRITTEN PROMPT

${cleanWrittenPrompt || "No additional written prompt was provided."}

Generate the final image as a fully rendered interpretation of the written prompt, locked to the composition, pose, camera, framing, silhouette, scale, occlusion, and negative space of the input guide image.`;
};
const transferPromptSuffix =
  "Use the connected visual style reference only for overall style, color grading, texture, contrast, and image qualities. Do not take elements, subjects, or compositional framing from that reference directly; transfer only the abstract visual style to the generation.";
const storyboardDefaultFrameCount = 6;
const storyboardAutoFrameCount = "Auto";
const storyboardMaxFrameCount = 35;
const storyboardMoodBoardLabel = "Visual Style Reference";
const storyboardDefaultMoodBoardUrl = "/storyboard/MOOD_BOARD.png";
const storyboardMaxCharacters = 4;
const storyboardCharacterSheetVersion = 2;
const storyboardDefaultAspectRatio = "16:9";
const storyboardAspectRatioOptions = ["16:9", "21:9", "9:16", "1:1"];
const storyboardDefaultResolution = "1K";
const storyboardHighResolution = "4K";
const storyboardFixedModel = imageModelNames.openAiImage2;
const storyboardPreviousFrameLabel = "PREVIOUS_FRAME.png";
const storyboardSpatialAnchorLabel = "SPATIAL_ANCHOR.png";
const storyboardBoardOutputPortId = "storyboardOut";
const storyboardBaseInstruction =
  "STORYBOARD STYLE LOCK: Create a single clean hand-drawn film storyboard frame. Use black ink linework, simple shapes, open white negative space, minimal grayscale blocking, readable silhouettes, and production-planning clarity. Keep drawings sparse, graphic, and easy to read. This is not a realistic black-and-white photograph, not photorealistic grayscale, not a 3D render, not photographic concept art, and not a fully rendered illustration. Avoid photographic skin texture, realistic camera lighting, glossy realism, heavy shadows, dense background detail, and fully rendered photo detail. No color. No text, numbers, frame borders, speech bubbles, captions, watermarks, or UI overlays unless explicitly described.";
const storyboardReferenceStyleGuard =
  "FINAL STYLE PRIORITY: The clean black-and-white storyboard line-art style overrides every uploaded image reference and every Film Director visual-style phrase. Use references only for identity, wardrobe, continuity, screen geography, object placement, and story information. Simplify all realistic references into sparse line drawing and simple gray fills. Do not copy photorealistic rendering, realistic grayscale photography, photo lighting, lens blur, skin texture, tonal realism, or polished photo detail from any reference image.";
const storyboardMoodBoardStyleInstruction =
  "Use the connected visual style reference only to infer abstract storyboard line-art qualities such as clean ink outlines, simple value grouping, open negative space, and production-planning readability. Do not copy its subjects, locations, props, compositions, realistic shading, texture density, or tonal detail.";
const storyboardFinalStyleClamp =
  "FINAL RENDER CHECK: Before output, simplify the image toward clean storyboard line art like a production board: white or light background, black outlines, flat light-gray fills, minimal texture, minimal clutter, and no photorealistic grayscale rendering.";
const storyboardContinuityInstruction =
  "Follow professional storyboard continuity. Maintain the 180 degree rule, screen direction, blocking, eyeline, silhouette, and editorial sequencing. Keep characters on the correct side of the environment unless the action clearly moves them. Keep props, drawers, doors, counters, walls, and furniture physically grounded with correct contact points and perspective. Adjacent cuts should have a meaningful editorial change in shot scale, angle, or emphasis; avoid nearly identical framing unless explicitly requested. Characters should not look at camera unless explicitly stated. Describe only this one frame.";
const storyboardCharacterSheetStyleInstruction =
  "STORYBOARD STYLE OVERRIDE: Convert the character sheet into the exact same clean storyboard style used for the final boards. Use hand-drawn digital storyboard line art, black ink linework, minimal grayscale shading, cinematic production-planning clarity, simple tonal blocking, and clear readable silhouettes. Do not create a realistic grayscale photograph, realistic black-and-white portrait, 3D render, fashion photo, photographic skin texture, photo lighting, or realistic camera render. No color, no labels, no numbers, no frame borders, no captions, and no decorative borders. This style override is more important than preserving the uploaded image's photographic style.";
const storyboardCharacterWardrobeFromPortraitPrompt =
  "Wardrobe rule: use exactly one outfit across all six views. Use the exact visible wardrobe from the uploaded character reference image consistently in every panel. Do not switch to a plain black outfit, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";
const storyboardCharacterSheetBasePrompt = characterSheetPrompt
  .replace(
    "Study the reference image of the character and preserve the person's identity, physical features, proportions, image quality, and visual style as closely as possible.",
    "Study the reference image of the character and preserve the person's identity, physical features, proportions, and recognizable details as closely as possible while converting the final sheet into storyboard line art."
  )
  .replace(
    "Create one high-resolution horizontal character photo sheet on a clean white background.",
    "Create one high-resolution horizontal character storyboard reference sheet on a clean white background."
  );
const initialNodes = [
  {
    id: "text-1",
    type: "plainText",
    x: 123.3203125,
    y: 102.61370849609375,
    data: {
      title: "Prompt 1",
      text: "A dog with a ball."
    }
  },
  {
    id: "image-model-1",
    type: "imageModel",
    x: 546.8897713928794,
    y: 96.03308838042841,
    data: {
      title: "Image Model",
      model: imageModelNames.openAiImage2,
      prompt: "A serene landscape with mountains",
      aspectRatio: "16:9",
      resolution: "2K",
      kreaCreativity: "raw",
      batchCount: "1",
      settingsOpen: true
    }
  },
  {
    id: "text-2",
    type: "plainText",
    x: 124.23687795605827,
    y: 379.67701542395395,
    data: {
      title: "Prompt",
      text: "The location is a park."
    }
  },
  {
    id: "camera-1",
    type: "camera",
    x: 101.27786006671954,
    y: 658.981734327887,
    data: {
      title: "Camera",
      shotPreset: "MS",
      lensPreset: "35mm",
      typePreset: "None"
    }
  },
  {
    id: "style-1",
    type: "style",
    x: 102.00101081119362,
    y: 970.3715360841652,
    data: {
      title: "Style",
      stylePreset: "Cinematic",
      customPaletteRgbText: "",
      customPalettePicker: "#ddc631",
      customPaletteColors: [],
      customPalettePreviewUrl: "",
      customPaletteSourceName: "",
      customPaletteStatus: "",
      customPaletteError: ""
    }
  },
  {
    id: "preview-1",
    type: "preview",
    x: 1022.6723497659082,
    y: 313.64054190479334,
    data: {
      title: "Preview",
      previewScale: 2.42,
      previewItemIndex: 0,
      previewTab: "preview",
      previewLayoutItems: []
    }
  }
];

const initialEdges = [
  { id: "edge-1", from: { nodeId: "text-1", port: "promptOut" }, to: { nodeId: "image-model-1", port: "promptIn" }, color: portColors.prompt },
  { id: "edge-2", from: { nodeId: "text-2", port: "promptOut" }, to: { nodeId: "image-model-1", port: "promptIn" }, color: portColors.prompt },
  { id: "edge-3", from: { nodeId: "camera-1", port: "cameraOut" }, to: { nodeId: "image-model-1", port: "cameraIn" }, color: portColors.camera },
  { id: "edge-4", from: { nodeId: "style-1", port: "styleOut" }, to: { nodeId: "image-model-1", port: "styleIn" }, color: portColors.style },
  { id: "edge-5", from: { nodeId: "image-model-1", port: "imageOut" }, to: { nodeId: "preview-1", port: "sourceIn" }, color: portColors.image }
];

const initialViewport = {
  x: -1.7490859208151575,
  y: 16.552319630928295,
  scale: 0.7127650165308045
};

const viewportScaleFloor = 0.0001;
const maxZoom = 1.9;
const previewBaseWidth = 330;
const previewScaleFloor = 0.05;
const previewLayoutDragMime = "application/x-newtnode-preview-layout-item";
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
const zImageUnsupportedInputPorts = new Set(["cameraIn", "styleIn", "transferIn", "characterIn"]);
const zImageUnsupportedSourceTypes = new Set(["camera", "style", "transfer", "character"]);
const lumaImageUnsupportedInputPorts = new Set(["cameraIn", "transferIn", "characterIn"]);
const lumaImageUnsupportedSourceTypes = new Set(["camera", "transfer", "character"]);
const krea2UnsupportedInputPorts = new Set(["cameraIn", "transferIn", "characterIn"]);
const krea2UnsupportedSourceTypes = new Set(["camera", "transfer", "character"]);
const emptyPortSet = new Set();
const groupPadding = { x: 42, top: 62, bottom: 42 };
const groupSizeFloor = 1;
const imageRunStaggerMs = 850;

function sameViewport(left, right, tolerance = 0.000001) {
  return Boolean(
    left &&
      right &&
      Math.abs(left.x - right.x) <= tolerance &&
      Math.abs(left.y - right.y) <= tolerance &&
      Math.abs(left.scale - right.scale) <= tolerance
  );
}

function samePointMap(left, right, tolerance = 0.25) {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((key) => {
    const leftPoint = left?.[key];
    const rightPoint = right?.[key];
    return Boolean(leftPoint && Math.abs(leftPoint.x - rightPoint.x) <= tolerance && Math.abs(leftPoint.y - rightPoint.y) <= tolerance);
  });
}

function sameRect(left, right, tolerance = 0.25) {
  if (!left || !right) return left === right;
  return ["left", "top", "right", "bottom", "width", "height"].every((key) => Math.abs(left[key] - right[key]) <= tolerance);
}

export default function NodeEditor({ active = true, onStatusChange, modelPreferences, modelPreferencesReady = true } = {}) {
  const canvasRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const zoomReadoutRef = React.useRef(null);
  const fileMenuRef = React.useRef(null);
  const projectMenuRef = React.useRef(null);
  const contextMenuRef = React.useRef(null);
  const undoStackRef = React.useRef([]);
  const redoStackRef = React.useRef([]);
  const portPositionFrameRef = React.useRef(null);
  const viewportRenderFrameRef = React.useRef(null);
  const viewportCommitTimerRef = React.useRef(null);
  const clipboardRef = React.useRef(null);
  const metadataLoadedRef = React.useRef(false);
  const outputHistoryLoadedRef = React.useRef(false);
  const outputHistoryLoadPromiseRef = React.useRef(null);
  const outputHistoryReloadRequestedRef = React.useRef(false);
  const savedDraft = React.useMemo(() => loadNodeEditorDraft({ initialNodes, initialEdges, initialViewport, normalizeEditorGraph }), []);
  const viewportRef = React.useRef(savedDraft.viewport);
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
  const [workflowFilePath, setWorkflowFilePath] = React.useState(savedDraft.workflowFilePath);
  const [fileMenuOpen, setFileMenuOpen] = React.useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [toolbarCollapsed, setToolbarCollapsed] = React.useState(true);
  const [outputsCollapsed, setOutputsCollapsed] = React.useState(true);
  const [outputHistory, setOutputHistory] = React.useState([]);
  const [previewLightboxItem, setPreviewLightboxItem] = React.useState(null);
  const [compilingTransferNodeId, setCompilingTransferNodeId] = React.useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState(null);
  const selectedEdgeIdRef = React.useRef(null);
  const [composerEditorNodeId, setComposerEditorNodeId] = React.useState(null);

  const incomingByNode = React.useMemo(() => buildIncomingByNode(nodes, edges), [nodes, edges]);
  const connectedPortKeys = React.useMemo(() => buildConnectedPortKeys(edges), [edges]);
  const selectedNodeSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const enabledImageModels = React.useMemo(
    () => (modelPreferencesReady ? enabledImageModelOptions(modelPreferences) : imageModelOptions),
    [modelPreferences, modelPreferencesReady]
  );
  const enabledVideoModels = React.useMemo(
    () => (modelPreferencesReady ? enabledVideoModelOptions(modelPreferences) : videoModelOptions),
    [modelPreferences, modelPreferencesReady]
  );
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
  const composerEditorNode = nodes.find((node) => node.id === composerEditorNodeId && node.type === "composer");
  const {
    workflowFileInputRef,
    projects,
    selectedProjectName,
    setSaveStatus,
    unsavedPrompt,
    resolveUnsavedWorkflowPrompt,
    workflowRequestContext,
    appendWorkflowContextToForm,
    loadProjects,
    saveProject,
    startNewProject,
    saveProjectAsLocalFile,
    openWorkflowFile,
    openWorkflowFromSystemPicker,
    importWorkflowFromSystemPicker,
    loadProject,
    deleteProject
  } = useWorkflowPersistence({
    savedDraft,
    nodes,
    edges,
    groups,
    viewport,
    projectId,
    projectName,
    savedProjectName,
    projectPackagePath,
    workflowFilePath,
    setNodes,
    setEdges,
    setGroups,
    setViewport,
    setProjectId,
    setProjectName,
    setSavedProjectName,
    setProjectPackagePath,
    setWorkflowFilePath,
    setSelectedNodeIds,
    setSelectedEdgeId,
    setProjectMenuOpen,
    setFileMenuOpen,
    newProjectNodes: initialNodes,
    newProjectEdges: initialEdges,
    newProjectViewport: initialViewport,
    normalizeEditorGraph,
    dedupeEdges,
    pushUndoSnapshot,
    clearUndoStack,
    importOffsetForNodes: clearImportOffset,
    prepareNodesForSave: captureTextareaHeightsForSave,
    onStatusChange
  });
  const draftSnapshot = React.useMemo(
    () =>
      nodeEditorDraftSnapshot({
        nodes,
        edges,
        groups,
        viewport,
        projectId,
        projectName,
        savedProjectName,
        projectPackagePath,
        workflowFilePath
      }),
    [nodes, edges, groups, viewport, projectId, projectName, savedProjectName, projectPackagePath, workflowFilePath]
  );
  useNodeEditorDraftPersistence(draftSnapshot);
  const projectOutputs = React.useMemo(
    () => buildProjectOutputItems({ nodes, history: outputHistory, projectId, projectName, getNodeResultMediaType: nodeResultMediaType, titleFallback: configTitleFallback }),
    [nodes, outputHistory, projectId, projectName]
  );

  React.useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  React.useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  React.useLayoutEffect(() => {
    viewportRef.current = viewport;
    applyViewportToCanvas(viewport);
  }, [viewport]);

  React.useEffect(() => {
    if (!modelPreferencesReady) return;
    const fallbackImageModel = firstEnabledImageModel(modelPreferences);
    const fallbackVideoModel = firstEnabledVideoModel(modelPreferences);
    setNodes((current) =>
      current.map((node) => {
        if (node.type === "imageModel" && !isSam3ImageModel(node.data.model) && !enabledImageModels.includes(node.data.model)) {
          return { ...node, data: { ...node.data, model: fallbackImageModel } };
        }
        if (node.type === "videoModel" && !isSam3VideoModel(node.data.model) && !enabledVideoModels.includes(node.data.model)) {
          return { ...node, data: { ...node.data, model: fallbackVideoModel } };
        }
        return node;
      })
    );
  }, [enabledImageModels, enabledVideoModels, modelPreferences, modelPreferencesReady]);

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
  }, [active, nodes, selectedNodeIds]);

  React.useLayoutEffect(() => {
    if (!active || typeof ResizeObserver === "undefined") return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const observer = new ResizeObserver(() => schedulePortPositionRefresh());
    observer.observe(canvas);
    canvas.querySelectorAll("[data-node-card-id]").forEach((element) => observer.observe(element));
    canvas.querySelectorAll("[data-port-key]").forEach((element) => observer.observe(element));
    schedulePortPositionRefresh();

    return () => observer.disconnect();
  }, [active, nodes.map((node) => node.id).join("|"), selectedNodeIds.join("|")]);

  React.useEffect(() => () => {
    if (portPositionFrameRef.current) {
      window.cancelAnimationFrame(portPositionFrameRef.current);
      portPositionFrameRef.current = null;
    }
    if (viewportRenderFrameRef.current) {
      window.cancelAnimationFrame(viewportRenderFrameRef.current);
      viewportRenderFrameRef.current = null;
    }
    if (viewportCommitTimerRef.current) {
      window.clearTimeout(viewportCommitTimerRef.current);
      viewportCommitTimerRef.current = null;
    }
  }, []);

  React.useLayoutEffect(() => {
    if (!active) return;
    syncGroupMembership();
  }, [active, nodes, groups]);

  React.useEffect(() => {
    if (!active || metadataLoadedRef.current) return;
    metadataLoadedRef.current = true;
    loadProjects();
  }, [active]);

  React.useEffect(() => {
    if (!active || outputsCollapsed || outputHistoryLoadedRef.current) return;
    loadOutputHistory();
  }, [active, outputsCollapsed]);

  React.useEffect(() => {
    if (!active) return undefined;
    const handleResize = () => updatePortPositions();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [active]);

  React.useEffect(() => {
    if (selectedEdgeId && !edges.some((edge) => edge.id === selectedEdgeId)) {
      selectedEdgeIdRef.current = null;
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  React.useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId || null;
  }, [selectedEdgeId]);

  React.useEffect(() => {
    if (selectedNodeIds.length) selectedEdgeIdRef.current = null;
  }, [selectedNodeIds]);

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

      if (event.key === "Backspace" || event.key === "Delete") {
        const edgeId = selectedEdgeIdRef.current || selectedEdgeId;
        if (!selectedNodeIds.length && edgeId && edgesRef.current.some((edge) => edge.id === edgeId)) {
          event.preventDefault();
          removeEdges([edgeId]);
          return;
        }
      }

      const frameItControl = event.target.closest?.(".frame-it-node-body");
      const frameItLocalDraft = event.target.closest?.("[data-frame-it-local-draft]");
      if (frameItControl && !frameItLocalDraft && commandKey && key === "z" && event.shiftKey) {
        event.preventDefault();
        redoGraphChange();
        return;
      }

      if (frameItControl && !frameItLocalDraft && commandKey && key === "y") {
        event.preventDefault();
        redoGraphChange();
        return;
      }

      if (frameItControl && !frameItLocalDraft && commandKey && key === "z") {
        event.preventDefault();
        undoGraphChange();
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

      if (commandKey && key === "z" && event.shiftKey) {
        event.preventDefault();
        redoGraphChange();
        return;
      }

      if (commandKey && key === "y") {
        event.preventDefault();
        redoGraphChange();
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
        if (selectedNodeIds.length) {
          event.preventDefault();
          removeNodes(selectedNodeIds);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, selectedNodeIds, selectedEdgeId, nodes, edges, groups, viewport, projectId, projectName, savedProjectName, selectedProjectName, projectPackagePath]);

  React.useEffect(() => {
    if (!active) return undefined;
    function handlePointerDown(event) {
      if (!fileMenuRef.current?.contains(event.target)) {
        setFileMenuOpen(false);
      }
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

  function schedulePortPositionRefresh() {
    if (portPositionFrameRef.current) return;
    portPositionFrameRef.current = window.requestAnimationFrame(() => {
      portPositionFrameRef.current = null;
      updatePortPositions();
      updateSelectionBounds();
    });
  }

  function applyViewportToCanvas(nextViewport) {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (scene) {
      scene.style.transform = `translate3d(${nextViewport.x}px, ${nextViewport.y}px, 0) scale(${nextViewport.scale})`;
    }
    if (canvas) {
      const gridSize = 28 * nextViewport.scale;
      canvas.style.setProperty("--grid-size", `${gridSize}px`);
      canvas.style.setProperty("--grid-x", `${positiveModulo(nextViewport.x, gridSize)}px`);
      canvas.style.setProperty("--grid-y", `${positiveModulo(nextViewport.y, gridSize)}px`);
    }
    if (zoomReadoutRef.current) {
      zoomReadoutRef.current.textContent = `${Math.round(nextViewport.scale * 100)}%`;
    }
  }

  function renderTransientViewport(nextViewport, { commitAfterMs = null } = {}) {
    viewportRef.current = nextViewport;
    canvasRef.current?.classList.add("is-navigating");
    if (!viewportRenderFrameRef.current) {
      viewportRenderFrameRef.current = window.requestAnimationFrame(() => {
        viewportRenderFrameRef.current = null;
        applyViewportToCanvas(viewportRef.current);
      });
    }

    if (viewportCommitTimerRef.current) {
      window.clearTimeout(viewportCommitTimerRef.current);
      viewportCommitTimerRef.current = null;
    }
    if (Number.isFinite(commitAfterMs)) {
      viewportCommitTimerRef.current = window.setTimeout(() => {
        viewportCommitTimerRef.current = null;
        commitTransientViewport();
      }, commitAfterMs);
    }
  }

  function commitTransientViewport() {
    if (viewportCommitTimerRef.current) {
      window.clearTimeout(viewportCommitTimerRef.current);
      viewportCommitTimerRef.current = null;
    }
    if (viewportRenderFrameRef.current) {
      window.cancelAnimationFrame(viewportRenderFrameRef.current);
      viewportRenderFrameRef.current = null;
    }
    const nextViewport = viewportRef.current;
    applyViewportToCanvas(nextViewport);
    canvasRef.current?.classList.remove("is-navigating");
    setViewport((current) => (sameViewport(current, nextViewport) ? current : nextViewport));
  }

  function updatePortPositions() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const nextPositions = {};
    const activeViewport = viewportRef.current;
    canvas.querySelectorAll("[data-port-key]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      nextPositions[element.dataset.portKey] = {
        x: (rect.left - canvasRect.left + rect.width / 2 - activeViewport.x) / activeViewport.scale,
        y: (rect.top - canvasRect.top + rect.height / 2 - activeViewport.y) / activeViewport.scale
      };
    });
    setPortPositions((current) => (samePointMap(current, nextPositions) ? current : nextPositions));
  }

  function updateSelectionBounds() {
    if (selectedNodeIds.length < 2) {
      setSelectionBounds(null);
      return;
    }

    const nextBounds = getSelectionBounds(selectedNodeIds);
    setSelectionBounds((current) => (sameRect(current, nextBounds) ? current : nextBounds));
  }

  function getNodeSetBounds(nodeIds) {
    const bounds = nodeIds.map(getNodeBounds).filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    return rectBounds(bounds);
  }

  function getSelectionBounds(nodeIds) {
    const bounds = nodeIds.map(getNodeBounds).filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    getSelectedGroupsForNodeIds(nodeIds).forEach((group) => bounds.push(groupToRect(group)));
    return rectBounds(bounds);
  }

  function rectBounds(bounds) {
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
      data: createNodeData(type, spec?.label || "Node", count)
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

  function createNodeData(type, label, count) {
    const data = createDefaultNodeData(type, label, count);
    if (type === "imageModel") {
      const model = enabledImageModels.includes(imageModelNames.openAiImage2)
        ? imageModelNames.openAiImage2
        : enabledImageModels[0] || imageModelNames.openAiImage2;
      return {
        ...data,
        ...imageModelSelectionPatch(data, model)
      };
    }
    if (type === "videoModel") {
      const model = enabledVideoModels[0] || videoModelNames.seedance;
      return {
        ...data,
        ...videoModelSelectionPatch(data, model)
      };
    }
    return data;
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

  function createMediaNodeFromOutputItem(item, position) {
    const type = nodeTypeForOutputItem(item);
    if (!type) {
      setSaveStatus("That output type cannot create a node yet");
      return;
    }

    const count = nodesRef.current.filter((node) => node.type === type).length + 1;
    const spec = nodeCatalog.find((catalogItem) => catalogItem.type === type);
    const nodePosition = position || defaultNodePosition(count);
    const nodeId = createNodeId(type);
    const fileName = item.fileName || fileNameFromLocalUrl(item.url);
    const mediaType = type === "model3d" ? "model3d" : item.type;
    const resultItem = {
      url: item.url,
      thumbnailUrl: item.thumbnailUrl || "",
      type: mediaType,
      label: item.label || fileName || `${capitalizeMediaType(mediaType)} output`,
      fileName,
      mimeType: item.mimeType || mimeForOutputItem(item),
      createdAt: item.createdAt || ""
    };
    const nextNode = {
      id: nodeId,
      type,
      x: nodePosition.x,
      y: nodePosition.y,
      data: {
        ...createDefaultNodeData(type, spec?.label || "Node", count),
        fileName,
        storedFileName: "",
        mimeType: resultItem.mimeType,
        mediaType,
        resultType: mediaType,
        resultUrl: item.url,
        thumbnailUrl: item.thumbnailUrl || "",
        resultItems: [resultItem],
        selectedResultIndex: 0,
        status: "ready",
        error: ""
      }
    };

    pushUndoSnapshot();
    setSelectedEdgeId(null);
    setNodes((current) => [...current, nextNode]);
    setSelectedNodeIds([nodeId]);
    setSaveStatus(`Created ${spec?.label || "node"} from ${fileName || "output"}`);
  }

  async function createMediaNodesFromFiles(fileList, position) {
    const files = Array.from(fileList || [])
      .map((file) => ({ file, type: nodeTypeForDroppedFile(file) }))
      .filter((item) => item.type);

    if (!files.length) {
      setSaveStatus("Drop an image, video, audio, 3D model, or text file");
      return;
    }

    const stamp = Date.now();
    const typeCounts = new Map();
    nodeCatalog.forEach((item) => {
      typeCounts.set(item.type, nodesRef.current.filter((node) => node.type === item.type).length);
    });

    const droppedNodes = files.map(({ file, type }, index) => {
      const nextCount = (typeCounts.get(type) || 0) + 1;
      typeCounts.set(type, nextCount);
      const spec = nodeCatalog.find((item) => item.type === type);
      const nodeId = createNodeId(type, `drop-${stamp}-${index}`);
      const nodePosition = {
        x: Math.round((position?.x ?? defaultNodePosition(nextCount).x) + index * 38),
        y: Math.round((position?.y ?? defaultNodePosition(nextCount).y) + index * 38)
      };
      const defaultData = createDefaultNodeData(type, spec?.label || "Node", nextCount);
      return {
        id: nodeId,
        type,
        x: nodePosition.x,
        y: nodePosition.y,
        file,
        data: {
          ...defaultData,
          title: fileBaseName(file.name) || defaultData.title,
          fileName: file.name,
          ...(type === "plainText" ? { text: "" } : { status: "uploading", error: "", resultUrl: "" })
        }
      };
    });

    pushUndoSnapshot();
    setSelectedEdgeId(null);
    setNodes((current) => [
      ...current,
      ...droppedNodes.map(({ file: _file, ...node }) => node)
    ]);
    setSelectedNodeIds(droppedNodes.map((node) => node.id));
    setSaveStatus(`Importing ${droppedNodes.length} file${droppedNodes.length === 1 ? "" : "s"}...`);

    await Promise.all(
      droppedNodes.map(async (node) => {
        if (node.type === "plainText") {
          try {
            const text = await node.file.text();
            updateNode(node.id, { text, status: "ready", error: "" });
          } catch (error) {
            updateNode(node.id, { text: error.message || "Could not read text file.", status: "error", error: error.message || "Could not read text file." });
          }
          return;
        }

        await uploadDroppedFileToNode(node.id, node.type, node.file);
      })
    );
  }

  async function uploadDroppedFileToNode(nodeId, type, file) {
    try {
      const asset = await uploadNodeAsset(file, type);
      const mediaType = type === "model3d" ? "model3d" : asset.mediaType;
      const resultItem = {
        url: asset.localUrl,
        type: mediaType,
        label: asset.fileName || file.name || `${capitalizeMediaType(mediaType)} upload`,
        fileName: asset.fileName || file.name,
        mimeType: asset.mimeType
      };

      updateNode(nodeId, {
        fileName: asset.fileName,
        storedFileName: asset.storedFileName,
        mimeType: asset.mimeType,
        mediaType,
        resultType: mediaType,
        resultUrl: asset.localUrl,
        resultItems: [resultItem],
        selectedResultIndex: 0,
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(nodeId, {
        status: "error",
        error: error.message || "Upload failed."
      });
    }
  }

  function handleCanvasDragOver(event) {
    if (hasOutputItemDragData(event.dataTransfer) || hasSupportedDroppedFile(event.dataTransfer?.items || event.dataTransfer?.files)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleCanvasDrop(event) {
    const outputItem = outputItemFromDataTransfer(event.dataTransfer);
    const files = event.dataTransfer?.files;
    const storyboardFrameDropTarget = event.target.closest?.("[data-storyboard-node-id][data-storyboard-frame-id]");
    if (storyboardFrameDropTarget) {
      const storyboardNode = nodesRef.current.find((node) => node.id === storyboardFrameDropTarget.dataset.storyboardNodeId);
      const frameId = storyboardFrameDropTarget.dataset.storyboardFrameId;
      const imageFile = firstAcceptedFile(files, "image");
      if (storyboardNode && frameId && (outputItem?.type === "image" || imageFile)) {
        event.preventDefault();
        event.stopPropagation();
        importImageToStoryboardFrame(storyboardNode, frameId, outputItem?.type === "image" ? { outputItem } : { file: imageFile });
        return;
      }
    }
    if (!outputItem && !hasSupportedDroppedFile(files)) return;

    event.preventDefault();
    event.stopPropagation();
    const position = pointerNodePosition(event);
    if (outputItem) {
      createMediaNodeFromOutputItem(outputItem, position);
      return;
    }
    createMediaNodesFromFiles(files, position);
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
    const autoAspectInputsRemoved = new Set(
      edgesRef.current
        .filter((edge) => ids.has(edge.id))
        .filter((edge) => edge.to.port === "imageIn" && nodesRef.current.find((node) => node.id === edge.to.nodeId)?.type === "autoAspect")
        .map((edge) => edge.to.nodeId)
    );
    setEdges((current) => current.filter((edge) => !ids.has(edge.id)));
    autoAspectInputsRemoved.forEach((nodeId) => updateNode(nodeId, resetAutoAspectOutputPatch()));
    selectedEdgeIdRef.current = null;
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

  function captureTextareaHeightsForSave(currentNodes = nodesRef.current) {
    const preparedNodes = mergeTextareaHeightsFromCanvas(currentNodes, canvasRef.current);
    if (preparedNodes === currentNodes) return currentNodes;
    nodesRef.current = preparedNodes;
    setNodes(preparedNodes);
    return preparedNodes;
  }

  function updateNode(nodeId, patch) {
    let nextUtilityData = null;
    let nextCameraData = null;
    let nextStyleData = null;
    let nextSkillDirectorData = null;
    let nextVideoModelData = null;
    const cameraPresetChanged = ["shotPreset", "lensPreset", "typePreset"].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    const styleOutputMaybeChanged = ["stylePreset", "customPaletteRgbText", "customPaletteColors", "customPalettePreviewUrl"].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
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
              if (node.type === "style") nextStyleData = data;
              if (node.type === "skillDirector") nextSkillDirectorData = data;
              if (node.type === "videoModel") nextVideoModelData = data;
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

    if (nextStyleData && styleOutputMaybeChanged && !styleOutputEnabled(nextStyleData)) {
      setEdges((current) => current.filter((edge) => !(edge.from.nodeId === nodeId && edge.from.port === "styleOut")));
      setSelectedEdgeId((current) => {
        const selectedEdge = edgesRef.current.find((edge) => edge.id === current);
        return selectedEdge?.from.nodeId === nodeId && selectedEdge?.from.port === "styleOut" ? null : current;
      });
    }

    if (nextCameraData && cameraPresetChanged && !hasCameraPreset({ data: nextCameraData })) {
      setEdges((current) => current.filter((edge) => !(edge.from.nodeId === nodeId && edge.from.port === "cameraOut")));
      setSelectedEdgeId((current) => {
        const selectedEdge = edgesRef.current.find((edge) => edge.id === current);
        return selectedEdge?.from.nodeId === nodeId && selectedEdge?.from.port === "cameraOut" ? null : current;
      });
    }

    if (nextSkillDirectorData && ("skillDirectorBuilt" in patch || "resultText" in patch) && (!nextSkillDirectorData.skillDirectorBuilt || !nextSkillDirectorData.resultText)) {
      const skillDirectorOutputPorts = new Set(["promptOut", "directorOut"]);
      setEdges((current) => current.filter((edge) => !(edge.from.nodeId === nodeId && skillDirectorOutputPorts.has(edge.from.port))));
      setSelectedEdgeId((current) => {
        const selectedEdge = edgesRef.current.find((edge) => edge.id === current);
        return selectedEdge?.from.nodeId === nodeId && skillDirectorOutputPorts.has(selectedEdge?.from.port) ? null : current;
      });
    }

    if (nextVideoModelData && "model" in patch && !videoModelSupportsFilmDirector(nextVideoModelData.model)) {
      setEdges((current) => current.filter((edge) => !(edge.to.nodeId === nodeId && edge.to.port === "directorIn")));
      setSelectedEdgeId((current) => {
        const selectedEdge = edgesRef.current.find((edge) => edge.id === current);
        return selectedEdge?.to.nodeId === nodeId && selectedEdge?.to.port === "directorIn" ? null : current;
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
      const { response, data } = await nodeApi.uploadAsset(form);
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

      const previewSources = connectedPreviewSources(incomingSources);
      const sourceGroup = previewSources.find((source) => source.sourceNodeId === sourceNodeId);
      if (!sourceGroup) return node;
      const selectedItemIndex = sourceGroup.items.findIndex((item) => item.sourceSelectedResult);
      const previewItemIndex = selectedItemIndex >= 0 ? selectedItemIndex : Math.max(0, sourceGroup.items.length - 1);

      return {
        ...node,
        data: {
          ...node.data,
          previewSourceId: sourceGroup.id,
          previewItemIndex
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
      const { response, data } = await nodeApi.composerFrame({
        ...workflowRequestContext(),
        imageDataUrl,
        nodeId: node.id,
        nodeTitle: node.data.title,
        aspectRatio: node.data.composerAspectRatio || "16:9",
        maquetteCount: composerScene.maquettes.length,
        propCount: composerScene.props.length,
        imagePlaneCount: composerScene.imagePlanes.length
      });
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
      loadOutputHistory();
    } catch (error) {
      updateNode(node.id, {
        status: "error",
        error: error.message
      });
      throw error;
    }
  }

  async function captureFrameItFrame(node, imageDataUrl) {
    pushUndoSnapshot();
    updateNode(node.id, { status: "uploading", error: "" });

    try {
      const frameItScene = normalizeFrameItScene(node.data.frameItScene);
      const { response, data } = await nodeApi.composerFrame({
        ...workflowRequestContext(),
        imageDataUrl,
        captureKind: "frame-it",
        nodeId: node.id,
        nodeTitle: node.data.title,
        aspectRatio: node.data.frameItAspectRatio || "16:9",
        figureCount: frameItScene.figures.length
      }, "Frame It capture");
      if (!response.ok) throw new Error(data.error || "Frame It capture failed.");

      updateNode(node.id, {
        fileName: data.image.fileName,
        mimeType: data.image.mimeType,
        mediaType: "image",
        resultUrl: data.image.localUrl,
        resultItems: [{
          url: data.image.localUrl,
          type: "image",
          label: "Frame It pose",
          cost: data.cost
        }],
        selectedResultIndex: 0,
        status: "complete",
        error: ""
      });
      setSaveStatus("Frame It pose captured");
      loadOutputHistory();
    } catch (error) {
      updateNode(node.id, { status: "error", error: error.message });
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

        const { response, data } = await nodeApi.uploadAsset(form);
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

  async function uploadCharacterPortrait(node, file, target = "portrait") {
    if (!file || !file.type.startsWith("image/")) return;

    pushUndoSnapshot();
    updateNode(node.id, { status: "uploading", error: "" });

    try {
      const asset = await uploadNodeAsset(file, "character");
      updateNode(node.id, {
        ...(target === "customSheet"
          ? { customCharacterSheet: asset, useCustomCharacterSheet: true }
          : { characterPortrait: asset }),
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

  function importOutputAssetToMediaNode(node, item) {
    if (!isOutputItemCompatibleWithNode(item, node.type)) {
      const itemType = capitalizeMediaType(item?.type || "media");
      const targetType = node.type === "model3d" ? "3D" : capitalizeMediaType(node.type);
      updateNode(node.id, { error: `${itemType} outputs cannot be dropped on ${targetType} nodes.` });
      setSaveStatus(`${itemType} output needs a matching node`);
      return;
    }

    const fileName = item.fileName || fileNameFromLocalUrl(item.url);
    const mimeType = item.mimeType || mimeForOutputItem(item);
    const resultItem = {
      url: item.url,
      thumbnailUrl: item.thumbnailUrl || "",
      type: item.type,
      label: item.label || fileName || `${capitalizeMediaType(item.type)} output`,
      fileName,
      mimeType,
      createdAt: item.createdAt || ""
    };
    const resultItems = appendResultItems(existingResultItemsForNode(node, item.type), [resultItem], item.type);

    pushUndoSnapshot();
    updateNode(node.id, {
      fileName,
      storedFileName: "",
      mimeType,
      mediaType: item.type,
      resultUrl: item.url,
      thumbnailUrl: item.thumbnailUrl || "",
      resultItems,
      selectedResultIndex: Math.max(0, resultItems.length - 1),
      resultType: item.type,
      status: "ready",
      error: ""
    });
    setSaveStatus(`Added ${fileName || "output"} to ${node.data.title || configTitleFallback(node.type)}`);
  }

  function importOutputAssetToTransferNode(node, item) {
    if (item?.type !== "image") {
      updateNode(node.id, { error: "Mood Board accepts image outputs." });
      setSaveStatus("Mood Board accepts image outputs");
      return;
    }

    const existingImages = Array.isArray(node.data.transferImages) ? node.data.transferImages : [];
    if (node.data.locked) {
      updateNode(node.id, { error: "Unlock Mood Board before adding output images." });
      return;
    }
    if (existingImages.length >= maxTransferImages) {
      updateNode(node.id, { error: `Mood Board accepts up to ${maxTransferImages} images.` });
      return;
    }

    pushUndoSnapshot();
    updateNode(node.id, {
      transferImages: [
        ...existingImages,
        {
          ...assetFromOutputItem(item),
          id: `transfer-output-${Date.now()}`
        }
      ].slice(0, maxTransferImages),
      status: "ready",
      activated: false,
      locked: false,
      resultUrl: "",
      fileName: "",
      error: ""
    });
    setSaveStatus("Added output image to Mood Board");
  }

  function importOutputAssetToCharacterPortrait(node, item, target = "portrait") {
    if (item?.type !== "image") {
      const targetLabel = target === "customSheet" ? "Custom Sheet" : "Portrait Reference";
      updateNode(node.id, { error: `${targetLabel} accepts image outputs.` });
      setSaveStatus(`${targetLabel} accepts image outputs`);
      return;
    }

    pushUndoSnapshot();
    updateNode(node.id, {
      ...(target === "customSheet"
        ? { customCharacterSheet: assetFromOutputItem(item), useCustomCharacterSheet: true }
        : { characterPortrait: assetFromOutputItem(item) }),
      status: "ready",
      error: ""
    });
    setSaveStatus(target === "customSheet" ? "Added output image as custom character sheet" : "Added output image as character portrait");
  }

  function importOutputAssetToCharacterWardrobes(node, item) {
    if (item?.type !== "image") {
      updateNode(node.id, { error: "Wardrobe accepts image outputs." });
      setSaveStatus("Wardrobe accepts image outputs");
      return;
    }

    const existing = Array.isArray(node.data.characterWardrobes) ? node.data.characterWardrobes : [];
    if (existing.length >= maxCharacterWardrobes) {
      updateNode(node.id, { error: `Character accepts up to ${maxCharacterWardrobes} wardrobe references.` });
      return;
    }

    const wardrobe = {
      ...assetFromOutputItem(item),
      id: `character-wardrobe-output-${Date.now()}`
    };
    const nextWardrobes = [...existing, wardrobe].slice(0, maxCharacterWardrobes);

    pushUndoSnapshot();
    updateNode(node.id, {
      characterWardrobes: nextWardrobes,
      activeWardrobeId: node.data.activeWardrobeId || wardrobe.id,
      status: "ready",
      error: ""
    });
    setSaveStatus("Added output image as wardrobe reference");
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
    const customSheet = node.data.customCharacterSheet;
    const useCustomSheet = Boolean(node.data.useCustomCharacterSheet);
    const name = String(node.data.characterName || "").trim();
    if (useCustomSheet && !customSheet?.localUrl) {
      updateNode(node.id, { error: "Upload a custom character sheet first." });
      return;
    }
    if (!useCustomSheet && !portrait?.localUrl) {
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
    const baseCharacterSheetPrompt = node.data.cinematicCharacterSheet ? cinematicCharacterSheetPrompt : characterSheetPrompt;
    let completedVariantCount = 0;

    if (useCustomSheet) {
      const generated = {
        url: customSheet.localUrl,
        thumbnailUrl: customSheet.thumbnailUrl || "",
        type: "image",
        label: `@${characterTag(node)} Character Sheet`,
        fileName: customSheet.fileName || "Custom character sheet",
        text: "",
        cost: null
      };
      const selectedVariant = {
        wardrobeId: characterDefaultWardrobeId,
        wardrobeUrl: "",
        wardrobeFileName: "Custom character sheet",
        generated
      };
      pushUndoSnapshot();
      updateNode(node.id, {
        activated: true,
        locked: true,
        characterTab: "sheet",
        characterSheetVariants: [selectedVariant],
        activeWardrobeId: "",
        compiledTraitPrompt: characterTraitPrompt(node.data),
        compiledVoicePrompt: selectedVoice ? characterVoicePrompt : "",
        characterBatchProgress: null,
        characterVariantNotice: "",
        ...characterVariantDisplayPatch(selectedVariant),
        status: "ready",
        error: ""
      });
      return;
    }

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
            const prompt = [baseCharacterSheetPrompt, wardrobe ? characterWardrobePrompt : characterBasicWardrobePrompt, physicalDetailsPrompt].filter(Boolean).join("\n\n");
            const generated = await runCharacterSheetGeneration({
              node,
              prompt,
              portrait,
              wardrobe,
              workflowContext: workflowRequestContext(),
              characterTag: characterTag(node)
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
    const { response, data } = await nodeApi.uploadAsset(form);
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

      const { response, data } = await nodeApi.uploadTransferCollage(form);
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

  function updateStoryboardNodeFrames(nodeId, updater, patch = {}) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const frames = normalizedStoryboardFrames(node.data.storyboardFrames);
    const nextFrames = normalizedStoryboardFrames(typeof updater === "function" ? updater(frames) : updater);
    const selectedFrameId = patch.selectedFrameId || node.data.selectedFrameId || nextFrames.find((frame) => frame.resultUrl)?.id || nextFrames[0]?.id || "";
    const selectedFrame = nextFrames.find((frame) => frame.id === selectedFrameId) || nextFrames.find((frame) => frame.resultUrl);
    const dataPatch = {
      ...clearStoryboardBoardPatch(),
      ...patch,
      storyboardFrames: nextFrames,
      selectedFrameId,
      resultUrl: selectedFrame?.resultUrl || "",
      resultItems: storyboardResultItems(nextFrames),
      selectedResultIndex: Math.max(0, nextFrames.filter((frame) => frame.resultUrl).findIndex((frame) => frame.id === selectedFrameId))
    };
    const nextNodes = nodesRef.current.map((item) => (
      item.id === nodeId
        ? {
            ...item,
            data: {
              ...item.data,
              ...dataPatch
            }
          }
        : item
    ));
    const updatedNodes = dataPatch.resultItems?.some((item) => item?.url) || dataPatch.storyboardBoardUrl
      ? syncConnectedPreviewNodes(nextNodes, nodeId, edgesRef.current)
      : nextNodes;
    nodesRef.current = updatedNodes;
    setNodes(updatedNodes);
  }

  function patchStoryboardFrame(nodeId, frameId, patch) {
    updateStoryboardNodeFrames(nodeId, (frames) => frames.map((frame) => (frame.id === frameId ? { ...frame, ...patch } : frame)), { selectedFrameId: frameId });
  }

  async function importImageToStoryboardFrame(node, frameId, source) {
    const currentNode = nodesRef.current.find((item) => item.id === node.id);
    if (!currentNode || currentNode.data.status === "running" || currentNode.data.status === "planning" || currentNode.data.status === "exporting" || currentNode.data.status === "compiling-board" || currentNode.data.status === "compiling-characters") return;
    const frames = normalizedStoryboardFrames(currentNode.data.storyboardFrames);
    const targetFrame = frames.find((frame) => frame.id === frameId);
    if (!targetFrame) return;

    try {
      let asset = null;
      if (source?.outputItem?.type === "image") {
        asset = assetFromOutputItem(source.outputItem);
      } else if (source?.file) {
        asset = await uploadNodeAsset(source.file, "storyboard-frame");
      }
      if (!asset?.localUrl) return;

      pushUndoSnapshot();
      updateStoryboardNodeFrames(currentNode.id, (currentFrames) => currentFrames.map((frame) => (
        frame.id === frameId
          ? {
              ...frame,
              resultUrl: asset.localUrl,
              exportUrl: asset.localUrl,
              resultFallbackUrl: "",
              resultVersion: Date.now(),
              fileName: asset.fileName || source?.outputItem?.fileName || source?.file?.name || frame.fileName || "",
              mimeType: asset.mimeType || "image/png",
              status: "complete",
              error: "",
              qcWarning: ""
            }
          : frame
      )), {
        storyboardTab: "view",
        selectedFrameId: frameId,
        status: "complete",
        error: ""
      });
    } catch (error) {
      updateStoryboardNodeFrames(currentNode.id, (currentFrames) => currentFrames.map((frame) => (
        frame.id === frameId
          ? {
              ...frame,
              status: "error",
              error: error.message || "Could not replace storyboard frame image."
            }
          : frame
      )), {
        storyboardTab: "view",
        selectedFrameId: frameId,
        status: "error",
        error: error.message || "Could not replace storyboard frame image."
      });
    }
  }

  React.useEffect(() => {
    function handleOutputDragEnd(event) {
      const item = event.detail?.item;
      if (item?.type !== "image") return;
      const clientX = Number(event.detail?.clientX);
      const clientY = Number(event.detail?.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      const target = document.elementFromPoint(clientX, clientY)?.closest?.("[data-storyboard-node-id][data-storyboard-frame-id]");
      if (!target) return;
      const storyboardNode = nodesRef.current.find((node) => node.id === target.dataset.storyboardNodeId);
      const frameId = target.dataset.storyboardFrameId;
      if (!storyboardNode || !frameId) return;
      const currentFrame = normalizedStoryboardFrames(storyboardNode.data.storyboardFrames).find((frame) => frame.id === frameId);
      if (currentFrame?.resultUrl === item.url) return;
      importImageToStoryboardFrame(storyboardNode, frameId, { outputItem: item });
    }

    window.addEventListener(outputDragEndEvent, handleOutputDragEnd);
    return () => window.removeEventListener(outputDragEndEvent, handleOutputDragEnd);
  });

  function syncStoryboardPreparedCharacters(nodeId, characters) {
    const nextCharacters = normalizedStoryboardCharacters(characters);
    const nextNodes = nodesRef.current.map((item) => (
      item.id === nodeId
        ? {
            ...item,
            data: {
              ...item.data,
              storyboardCharacters: nextCharacters
            }
          }
        : item
    ));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    return nextNodes.find((item) => item.id === nodeId);
  }

  function updateStoryboardCharacter(nodeId, characterId, patch) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    const characters = normalizedStoryboardCharacters(node.data.storyboardCharacters).map((character) => (
      character.id === characterId ? { ...character, ...patch } : character
    ));
    updateNode(nodeId, { storyboardCharacters: characters, error: "" });
  }

  async function uploadStoryboardCharacter(node, file) {
    if (!file || !file.type.startsWith("image/")) return;
    const characters = normalizedStoryboardCharacters(node.data.storyboardCharacters);
    if (characters.length >= storyboardMaxCharacters) {
      updateNode(node.id, { error: `Storyboard accepts up to ${storyboardMaxCharacters} internal characters.` });
      return;
    }

    pushUndoSnapshot();
    updateNode(node.id, { status: "uploading", error: "" });

    try {
      const asset = await uploadNodeAsset(file, "storyboard-character");
      const character = createStoryboardCharacter({
        name: storyboardCharacterNameFromFile(file.name, characters.length + 1),
        portrait: asset,
        status: "ready"
      });
      updateNode(node.id, {
        storyboardCharacters: [...characters, character],
        useInternalStoryboardCharacters: true,
        status: "ready",
        error: ""
      });
    } catch (error) {
      updateNode(node.id, { status: "error", error: error.message });
    }
  }

  function importStoryboardCharacter(node, outputItem) {
    if (!outputItem?.url || outputItem.type !== "image") return;
    const characters = normalizedStoryboardCharacters(node.data.storyboardCharacters);
    if (characters.length >= storyboardMaxCharacters) {
      updateNode(node.id, { error: `Storyboard accepts up to ${storyboardMaxCharacters} internal characters.` });
      return;
    }

    pushUndoSnapshot();
    const asset = assetFromOutputItem(outputItem);
    const character = createStoryboardCharacter({
      name: storyboardCharacterNameFromFile(outputItem.fileName || outputItem.label || asset.fileName, characters.length + 1),
      portrait: asset,
      status: "ready"
    });
    updateNode(node.id, {
      storyboardCharacters: [...characters, character],
      useInternalStoryboardCharacters: true,
      status: "ready",
      error: ""
    });
  }

  function removeStoryboardCharacter(nodeId, characterId) {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node) return;
    pushUndoSnapshot();
    updateNode(nodeId, {
      storyboardCharacters: normalizedStoryboardCharacters(node.data.storyboardCharacters).filter((character) => character.id !== characterId),
      error: ""
    });
  }

  async function ensureStoryboardCharactersReady(node) {
    const currentNode = nodesRef.current.find((item) => item.id === node.id) || node;
    if (!storyboardUsesInternalCharacters(currentNode)) return currentNode;
    const characters = normalizedStoryboardCharacters(currentNode.data.storyboardCharacters);
    let preparedNode = currentNode;
    const unnamedCharacters = characters.filter((character) => character.portrait?.localUrl && !String(character.name || "").trim());
    if (unnamedCharacters.length) {
      const nextCharacters = characters.map((character) => (
        unnamedCharacters.some((item) => item.id === character.id)
          ? { ...character, status: "error", error: "Add a name tag before generating." }
          : character
      ));
      updateNode(currentNode.id, {
        storyboardCharacters: nextCharacters,
        status: "ready",
        error: "Add name tags for all Storyboard characters before generating."
      });
      throw new Error("Add name tags for all Storyboard characters before generating.");
    }
    const pendingCharacters = characters.filter((character) =>
      character.portrait?.localUrl &&
      storyboardCharacterTag(character) &&
      (!character.sheetUrl || finiteNumber(character.sheetVersion, 0) < storyboardCharacterSheetVersion)
    );
    if (!pendingCharacters.length) return currentNode;

    updateNode(currentNode.id, { status: "compiling-characters", storyboardTab: "view", error: "" });
    let latestCharacters = characters;
    for (const character of pendingCharacters) {
      updateStoryboardCharacter(currentNode.id, character.id, { status: "compiling", error: "" });
      try {
        const generationNode = {
          ...currentNode,
          data: {
            ...currentNode.data,
            title: `${currentNode.data.title || "Storyboard"} ${character.name || "Character"}`
          }
        };
        const generated = await runCharacterSheetGeneration({
          node: generationNode,
          prompt: storyboardCharacterSheetPromptForNode(currentNode),
          portrait: character.portrait,
          wardrobe: null,
          workflowContext: workflowRequestContext(),
          characterTag: storyboardCharacterTag(character)
        });
        latestCharacters = normalizedStoryboardCharacters(nodesRef.current.find((item) => item.id === currentNode.id)?.data.storyboardCharacters || latestCharacters).map((item) => (
          item.id === character.id
            ? {
                ...item,
                sheetUrl: generated.url,
                sheetFileName: generated.fileName || "",
                sheetVersion: storyboardCharacterSheetVersion,
                status: "ready",
                error: ""
              }
            : item
        ));
        preparedNode = {
          ...preparedNode,
          data: {
            ...preparedNode.data,
            storyboardCharacters: latestCharacters
          }
        };
        preparedNode = syncStoryboardPreparedCharacters(currentNode.id, latestCharacters) || preparedNode;
        updateNode(currentNode.id, { error: "" });
      } catch (error) {
        latestCharacters = normalizedStoryboardCharacters(nodesRef.current.find((item) => item.id === currentNode.id)?.data.storyboardCharacters || latestCharacters).map((item) => (
          item.id === character.id ? { ...item, status: "error", error: error.message || "Character sheet failed." } : item
        ));
        updateNode(currentNode.id, { storyboardCharacters: latestCharacters, error: error.message || "Character sheet failed." });
      }
    }

    updateNode(currentNode.id, { status: "ready" });
    return preparedNode;
  }

  async function planStoryboardNode(node) {
    const currentNode = nodesRef.current.find((item) => item.id === node.id) || node;
    const currentIncomingByNode = buildIncomingByNode(nodesRef.current, edgesRef.current);
    const incoming = expandStoryboardDirectorIncoming(currentIncomingByNode[currentNode.id] || {}, currentIncomingByNode);
    const sceneDescription = storyboardSceneDescriptionForNode(currentNode, incoming);
    const directorControlsScene = Boolean(connectedDirectorPackageSource(incoming.directorIn || []));
    if (!sceneDescription.trim()) {
      updateNode(currentNode.id, { error: "Add a scene description before planning frames." });
      return null;
    }
    const requestedFrameCount = storyboardFrameCountForNode(currentNode, incoming);

    try {
      updateNode(currentNode.id, { status: "planning", error: "" });
      const { response, data } = await nodeApi.planStoryboard({
        sceneDescription,
        frameCount: requestedFrameCount,
        notes: directorControlsScene ? "" : currentNode.data.storyboardNotes || "",
        characters: storyboardCharacterSummariesForNode(currentNode, incoming.characterIn, currentIncomingByNode, { includeInternal: !directorControlsScene }),
        sceneReferences: storyboardSceneReferenceSummaries(incoming.sceneReferenceIn || [], currentIncomingByNode)
      }, "Storyboard planning");
      const plan = data.plan || fallbackStoryboardPlanForClient(sceneDescription, requestedFrameCount);
      const plannedFrames = storyboardFramesFromPlan(plan.frames);
      if (!response.ok && !plannedFrames.length) throw new Error(data.error || "Storyboard planning failed.");

      pushUndoSnapshot();
      updateStoryboardNodeFrames(currentNode.id, plannedFrames.length ? plannedFrames : defaultStoryboardFrames(requestedFrameCount), {
        storyboardAnalysis: plan.analysis || "",
        storyboardPlanSceneDescription: sceneDescription,
        sceneName: plan.sceneTitle || currentNode.data.sceneName || "Scene 1",
        storyboardTab: "view",
        status: "ready",
        error: response.ok ? "" : data.error || ""
      });
      return plannedFrames;
    } catch (error) {
      const fallbackFrames = defaultStoryboardFrames(requestedFrameCount).map((frame, index) => ({
        ...frame,
        prompt: `${storyboardFallbackBeat(index)} Single storyboard frame for: ${sceneDescription}. Keep screen direction, blocking, silhouette, eyeline, and continuity clear.`,
        beat: storyboardFallbackBeat(index)
      }));
      updateStoryboardNodeFrames(currentNode.id, fallbackFrames, {
        storyboardPlanSceneDescription: sceneDescription,
        storyboardTab: "view",
        status: "ready",
        error: `Planner fallback used. ${error.message || ""}`.trim()
      });
      return fallbackFrames;
    }
  }

  async function generateStoryboardFrame(node, frameId) {
    return generateStoryboardNode(node, [frameId]);
  }

  async function generateStoryboardNode(node, frameIds = null) {
    let currentNode = nodesRef.current.find((item) => item.id === node.id) || node;
    let currentIncomingByNode = buildIncomingByNode(nodesRef.current, edgesRef.current);
    let incoming = expandStoryboardDirectorIncoming(currentIncomingByNode[currentNode.id] || {}, currentIncomingByNode);
    let frames = normalizedStoryboardFrames(currentNode.data.storyboardFrames);
    const sceneDescription = storyboardSceneDescriptionForNode(currentNode, incoming);

    if (!storyboardPlanIsCurrent(currentNode, sceneDescription)) {
      updateNode(currentNode.id, {
        status: "ready",
        error: "Plan the storyboard again after changing the scene description."
      });
      return { status: "error", error: new Error("Plan the storyboard again after changing the scene description.") };
    }

    const targetIds = new Set(frameIds?.length ? frameIds : frames.map((frame) => frame.id));
    const targetFrames = frames.filter((frame) => targetIds.has(frame.id));
    if (!targetFrames.length) {
      updateNode(currentNode.id, { error: "No storyboard frames selected to generate." });
      return { status: "error", error: new Error("No storyboard frames selected to generate.") };
    }

    const workflowContext = workflowRequestContext();
    const directorControlsInitialScene = Boolean(connectedDirectorPackageSource(incoming.directorIn || []));
    try {
      if (!directorControlsInitialScene) currentNode = await ensureStoryboardCharactersReady(currentNode);
    } catch (error) {
      return { status: "error", error };
    }
    currentNode = storyboardNodeWithMostPreparedCharacters(currentNode, nodesRef.current.find((item) => item.id === currentNode.id));
    currentIncomingByNode = buildIncomingByNode(nodesRef.current, edgesRef.current);
    incoming = expandStoryboardDirectorIncoming(currentIncomingByNode[currentNode.id] || {}, currentIncomingByNode);
    const directorControlsScene = Boolean(connectedDirectorPackageSource(incoming.directorIn || []));
    const aspectRatio = storyboardAspectRatioForNode(currentNode);
    const resolution = storyboardResolutionForNode(currentNode);
    const qcEnabled = currentNode.data.storyboardAutoQc !== false;
    const successes = [];
    const failures = [];

    updateNode(currentNode.id, { status: "running", storyboardTab: "view", error: "" });
    const queuedVersion = Date.now();
    for (const frame of targetFrames) {
      patchStoryboardFrame(currentNode.id, frame.id, { status: "queued", error: "", resultVersion: queuedVersion });
    }

    for (const frame of targetFrames) {
      try {
        patchStoryboardFrame(currentNode.id, frame.id, { status: "running", error: "" });
        const latestStoryboardNode = storyboardNodeWithMostPreparedCharacters(currentNode, nodesRef.current.find((item) => item.id === currentNode.id));
        const continuityReferenceItems = storyboardContinuityReferenceItems(latestStoryboardNode, frame);
        const requiredCharacterSources = storyboardRequiredCharacterSourcesForFrame(latestStoryboardNode, frame, sceneDescription, incoming, currentIncomingByNode, { includeInternal: !directorControlsScene });
        const allCharacterSources = storyboardCharacterSourcesForNode(latestStoryboardNode, incoming.characterIn || [], currentIncomingByNode, { includeInternal: !directorControlsScene });
        const activeCharacterSources = requiredCharacterSources.length
          ? requiredCharacterSources
          : allCharacterSources.length === 1 ? allCharacterSources : [];
        const baseImagePromptItems = storyboardImagePromptItems(latestStoryboardNode, incoming, currentIncomingByNode, { characterSources: activeCharacterSources });
        const imagePromptItems = storyboardImagePromptItemsForFrame(baseImagePromptItems, continuityReferenceItems);
        const missingCharacterTags = storyboardMissingRequiredCharacterTags(latestStoryboardNode, incoming.characterIn || [], currentIncomingByNode, [
          frame.prompt,
          frame.beat,
          frame.notes,
          sceneDescription
        ].filter(Boolean).join("\n"), { includeInternal: !directorControlsScene });
        if (missingCharacterTags.length) {
          throw new Error(`Character sheet missing for ${missingCharacterTags.map((tag) => `@${tag}`).join(", ")}. Regenerate or re-upload that Storyboard character before running this frame.`);
        }
        const basePrompt = buildStoryboardFramePrompt(latestStoryboardNode, frame, sceneDescription, incoming, currentIncomingByNode, {
          hasPreviousFrameReference: continuityReferenceItems.some((item) => item.label === storyboardPreviousFrameLabel),
          hasSpatialAnchorReference: continuityReferenceItems.some((item) => item.label === storyboardSpatialAnchorLabel),
          requiredCharacterSources,
          activeCharacterSources
        });
        let prompt = basePrompt;
        let generated = null;
        let qcResult = null;
        let qcRetryCount = 0;
        const maxAttempts = qcEnabled ? 2 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          patchStoryboardFrame(currentNode.id, frame.id, { status: "running", error: "", qcWarning: "" });
          const generatedItems = await runImageModelGeneration({
            node: {
              ...currentNode,
              data: {
                ...currentNode.data,
                title: `${currentNode.data.title || "Storyboard"} Frame ${String(frame.number).padStart(3, "0")}`,
                model: storyboardFixedModel,
                aspectRatio,
                resolution
              }
            },
            prompt,
            aspectRatio,
            imagePromptItems,
            workflowContext,
            index: frame.number - 1
          });
          generated = Array.isArray(generatedItems) ? generatedItems[0] || null : generatedItems;

          if (!qcEnabled) break;

          patchStoryboardFrame(currentNode.id, frame.id, { status: "reviewing" });
          qcResult = await reviewStoryboardGeneratedFrame({
            node: currentNode,
            frame,
            generated,
            sceneDescription,
            framePrompt: prompt,
            continuityReferenceItems
          });

          if (qcResult.pass || !qcResult.shouldRetry || attempt >= maxAttempts - 1) break;

          qcRetryCount += 1;
          prompt = storyboardQcRetryPrompt(basePrompt, qcResult);
        }

        if (!generated?.url) {
          throw new Error("Storyboard frame generation returned no image.");
        }

        const exported = await exportStoryboardFrameResult({
          node: currentNode,
          frame,
          generated,
          workflowContext
        });
        const nextFrame = {
          resultUrl: generated.url,
          exportUrl: exported.url,
          resultFallbackUrl: exported.url && exported.url !== generated.url ? exported.url : "",
          resultVersion: Date.now(),
          fileName: exported.fileName || generated.fileName || "",
          status: "complete",
          error: "",
          qcPassed: qcResult ? Boolean(qcResult.pass) : null,
          qcWarning: qcResult && !qcResult.pass ? `QC warning: ${qcResult.summary || "Frame may have continuity or physical logic issues."}` : "",
          qcSummary: qcResult?.summary || "",
          qcIssues: qcResult?.issues || [],
          qcRetryCount
        };
        patchStoryboardFrame(currentNode.id, frame.id, nextFrame);
        successes.push({ ...generated, url: exported.url, label: `Frame ${String(frame.number).padStart(3, "0")}` });
      } catch (error) {
        patchStoryboardFrame(currentNode.id, frame.id, { status: "error", error: error.message || "Frame generation failed." });
        failures.push(error);
      }
    }

    const latestNode = nodesRef.current.find((item) => item.id === currentNode.id) || currentNode;
    updateStoryboardNodeFrames(currentNode.id, normalizedStoryboardFrames(latestNode.data.storyboardFrames), {
      status: successes.length ? "complete" : "error",
      storyboardTab: "view",
      error: failures.length ? `${failures.length} frame${failures.length === 1 ? "" : "s"} failed. ${failures[0]?.message || ""}`.trim() : "",
      resultText: successes.map((item) => item.text).filter(Boolean).join("\n\n")
    });
    loadOutputHistory();
    return successes.length ? { status: "complete" } : { status: "error", error: failures[0] || new Error("Storyboard generation failed.") };
  }

  async function reviewStoryboardGeneratedFrame({ node, frame, generated, sceneDescription, framePrompt, continuityReferenceItems = [] }) {
    try {
      const previousFrame = continuityReferenceItems.find((item) => item.label === storyboardPreviousFrameLabel);
      const spatialAnchor = continuityReferenceItems.find((item) => item.label === storyboardSpatialAnchorLabel);
      const { response, data } = await nodeApi.reviewStoryboardFrame({
        sourceUrl: generated.url,
        previousFrameUrl: previousFrame?.url || "",
        spatialAnchorUrl: spatialAnchor?.url || "",
        sceneDescription,
        framePrompt,
        frameNumber: frame.number,
        shot: frame.shot || "",
        angle: frame.angle || "",
        notes: frame.notes || "",
        ...workflowContextPayload(workflowRequestContext()),
        nodeId: node.id,
        nodeTitle: node.data.title
      }, "Storyboard frame QC");
      if (!response.ok) throw new Error(data.error || "Storyboard frame QC failed.");
      return normalizeStoryboardQcForClient(data.qc);
    } catch (error) {
      console.warn("Storyboard frame QC skipped:", error.message);
      return {
        pass: true,
        shouldRetry: false,
        severity: "ok",
        summary: "QC skipped.",
        issues: [],
        correctionPrompt: ""
      };
    }
  }

  async function exportStoryboardFrameResult({ node, frame, generated, workflowContext }) {
    const { response, data } = await nodeApi.exportStoryboardFrame({
      sourceUrl: generated.url,
      sceneName: node.data.sceneName || "Scene 1",
      frameNumber: frame.number,
      ...workflowContextPayload(workflowContext),
      nodeId: node.id,
      nodeTitle: node.data.title
    });

    if (!response.ok) {
      return { url: generated.url, fileName: "" };
    }

    return {
      url: data.frame.localUrl,
      fileName: data.frame.fileName
    };
  }

  async function exportStoryboardBoard(node, exportMode = "pdf") {
    const currentNode = nodesRef.current.find((item) => item.id === node.id) || node;
    const exportingFrames = exportMode === "frames";
    const currentIncomingByNode = buildIncomingByNode(nodesRef.current, edgesRef.current);
    const incoming = currentIncomingByNode[currentNode.id] || {};
    const frames = normalizedStoryboardFrames(currentNode.data.storyboardFrames)
      .filter((frame) => frame.exportUrl || frame.resultUrl)
      .map((frame) => ({
        number: frame.number,
        sourceUrl: frame.exportUrl || frame.resultUrl,
        description: frame.description || frame.beat || frame.prompt || "",
        prompt: frame.prompt || "",
        beat: frame.beat || "",
        notes: frame.notes || "",
        shot: frame.shot || "None",
        lens: frame.lens || "None",
        angle: frame.angle || "None"
      }));

    if (!frames.length) {
      updateNode(currentNode.id, { error: "Generate at least one storyboard frame before exporting boards." });
      return;
    }

    updateNode(currentNode.id, {
      status: "exporting",
      storyboardExportMode: exportingFrames ? "frames" : "pdf",
      storyboardTab: "view",
      error: ""
    });

    try {
      const baseName = safeStoryboardBoardFileName(currentNode.data.sceneName || currentNode.data.title || "storyboard");
      const saveSelection = await systemApi.selectSavePath({
        title: exportingFrames
          ? "Name and save the storyboard frames folder"
          : "Name and save the storyboard PDF",
        defaultPath: projectPackagePath || "",
        defaultName: exportingFrames ? `${baseName}_frames` : `${baseName}_boards.pdf`,
        extension: exportingFrames ? "" : "pdf"
      });
      if (!saveSelection.response.ok) {
        if (saveSelection.data?.canceled) {
          updateNode(currentNode.id, { status: "complete", error: "" });
          return;
        }
        throw new Error(saveSelection.data?.error || "Could not choose where to save the storyboard export.");
      }
      const selectedExportPath = saveSelection.data?.path || "";
      if (!selectedExportPath) {
        updateNode(currentNode.id, { status: "complete", error: "" });
        return;
      }

      const { response, data } = await nodeApi.exportStoryboardBoard({
        sceneName: currentNode.data.sceneName || "Scene 1",
        sceneDescription: storyboardSceneDescriptionForNode(currentNode, incoming),
        aspectRatio: storyboardAspectRatioForNode(currentNode),
        exportFilePath: exportingFrames ? "" : selectedExportPath,
        exportFramesPath: exportingFrames ? selectedExportPath : "",
        frames,
        includePdf: !exportingFrames,
        includeFrames: exportingFrames,
        ...workflowContextPayload(workflowRequestContext()),
        nodeId: currentNode.id,
        nodeTitle: currentNode.data.title
      });

      if (!response.ok) throw new Error(data.error || "Storyboard export failed.");

      updateNode(currentNode.id, {
        status: "complete",
        error: "",
        storyboardTab: "view",
        storyboardExport: data.export
      });
    } catch (error) {
      updateNode(currentNode.id, {
        status: "error",
        error: error.message || "Storyboard export failed."
      });
    }
  }

  async function lockStoryboardBoard(node) {
    const currentNode = nodesRef.current.find((item) => item.id === node.id) || node;
    const frames = normalizedStoryboardFrames(currentNode.data.storyboardFrames)
      .filter((frame) => frame.exportUrl || frame.resultUrl);

    if (!frames.length) {
      updateNode(currentNode.id, { error: "Generate at least one storyboard frame before locking the board." });
      return;
    }

    updateNode(currentNode.id, { status: "compiling-board", storyboardTab: "view", error: "" });

    try {
      const boardBlob = await createStoryboardBoardImageBlob({
        aspectRatio: storyboardAspectRatioForNode(currentNode),
        frames
      });
      const baseName = safeStoryboardBoardFileName(currentNode.data.sceneName || currentNode.data.title || "storyboard");
      const boardFile = new File([boardBlob], `${baseName}_board.png`, { type: "image/png" });
      const asset = await uploadNodeAsset(boardFile, "storyboard-board");
      const nextData = {
        status: "complete",
        error: "",
        storyboardTab: "view",
        storyboardBoardUrl: asset.localUrl,
        storyboardBoardFileName: asset.fileName,
        storyboardBoardStoredFileName: asset.storedFileName,
        storyboardBoardMimeType: asset.mimeType,
        storyboardBoardFrames: frames.map((frame, index) => storyboardBoardLayoutItem(frame, index)),
        storyboardBoardVersion: Date.now()
      };
      const nextNodes = nodesRef.current.map((item) => (
        item.id === currentNode.id
          ? {
              ...item,
              data: {
                ...item.data,
                ...nextData
              }
            }
          : item
      ));
      const updatedNodes = syncConnectedPreviewNodes(nextNodes, currentNode.id, edgesRef.current);
      nodesRef.current = updatedNodes;
      setNodes(updatedNodes);
    } catch (error) {
      updateNode(currentNode.id, {
        status: "error",
        error: error.message || "Could not lock storyboard board."
      });
    }
  }

  async function exportPreviewLayoutBoard(node) {
    const currentNode = nodesRef.current.find((item) => item.id === node.id) || node;
    const layoutItems = normalizedPreviewLayoutItems(currentNode.data.previewLayoutItems);
    const frames = layoutItems.map((item, index) => {
      const description = previewLayoutExportCaption(item, index);
      return {
        number: index + 1,
        sourceUrl: item.url,
        description,
        prompt: "",
        beat: "",
        notes: "",
        shot: "None",
        lens: "None",
        angle: "None"
      };
    });

    if (!frames.length) {
      updateNode(currentNode.id, {
        previewLayoutExportStatus: "",
        previewLayoutExportError: "Add at least one image to the Layout tab before exporting."
      });
      return;
    }

    updateNode(currentNode.id, {
      previewTab: "layout",
      previewLayoutExportStatus: "exporting",
      previewLayoutExportError: ""
    });

    try {
      const folderSelection = await systemApi.selectFolder({
        title: "Choose where to save preview layout boards",
        defaultPath: projectPackagePath || ""
      });
      if (!folderSelection.response.ok) {
        if (folderSelection.data?.canceled) {
          updateNode(currentNode.id, { previewLayoutExportStatus: "", previewLayoutExportError: "" });
          return;
        }
        throw new Error(folderSelection.data?.error || "Could not choose an export folder.");
      }

      const exportDestinationPath = folderSelection.data?.path || "";
      if (!exportDestinationPath) {
        updateNode(currentNode.id, { previewLayoutExportStatus: "", previewLayoutExportError: "" });
        return;
      }

      const { response, data } = await nodeApi.exportStoryboardBoard({
        sceneName: currentNode.data.title || "Preview Layout",
        sceneDescription: `${currentNode.data.title || "Preview Layout"} exported from Preview Layout.`,
        aspectRatio: "16:9",
        exportDestinationPath,
        frames,
        includePdf: false,
        ...workflowContextPayload(workflowRequestContext()),
        nodeId: currentNode.id,
        nodeTitle: currentNode.data.title || "Preview Layout"
      }, "Preview layout export");

      if (!response.ok) throw new Error(data.error || "Preview layout export failed.");

      updateNode(currentNode.id, {
        previewLayoutExportStatus: "complete",
        previewLayoutExportError: "",
        previewLayoutExport: data.export
      });
    } catch (error) {
      updateNode(currentNode.id, {
        previewLayoutExportStatus: "error",
        previewLayoutExportError: error.message || "Preview layout export failed."
      });
    }
  }

  async function applyPreviewLayoutImageEdit(item, edit = {}) {
    const editContext = item?.editContext || {};
    if (!["previewLayout", "storyboardFrame", "nodeResult"].includes(editContext.type) || !editContext.nodeId || (!editContext.itemId && editContext.type !== "nodeResult")) {
      throw new Error("This image is not editable from this board.");
    }

    const currentNode = nodesRef.current.find((node) => (
      node.id === editContext.nodeId &&
      (
        editContext.type === "previewLayout"
          ? node.type === "preview"
          : editContext.type === "storyboardFrame"
            ? node.type === "storyboard"
            : node.type === "image"
      )
    ));
    if (!currentNode) throw new Error(
      editContext.type === "previewLayout"
        ? "Could not find the Preview node for this image."
        : editContext.type === "storyboardFrame"
          ? "Could not find the Storyboard node for this frame."
          : "Could not find the Image node for this image."
    );

    const currentItems = editContext.type === "previewLayout"
      ? normalizedPreviewLayoutItems(currentNode.data.previewLayoutItems)
      : [];
    const currentFrames = editContext.type === "storyboardFrame"
      ? normalizedStoryboardFrames(currentNode.data.storyboardFrames)
      : [];
    const currentResultItems = editContext.type === "nodeResult"
      ? normalizedResultItems(currentNode.data.resultItems, currentNode.data.resultUrl, "image")
      : [];
    const targetResultIndex = editContext.type === "nodeResult"
      ? Math.min(Math.max(0, Math.trunc(Number(editContext.itemIndex) || 0)), Math.max(0, currentResultItems.length - 1))
      : -1;
    const targetFrame = currentFrames.find((frame) => frame.id === editContext.itemId);
    const targetItem = editContext.type === "previewLayout"
      ? currentItems.find((layoutItem) => layoutItem.id === editContext.itemId)
      : editContext.type === "nodeResult"
        ? currentResultItems[targetResultIndex]
        : targetFrame
          ? {
              id: targetFrame.id,
              url: targetFrame.exportUrl || targetFrame.resultUrl,
              type: "image",
              fileName: targetFrame.fileName || fileNameFromLocalUrl(targetFrame.exportUrl || targetFrame.resultUrl),
              label: `Frame ${String(targetFrame.number || 1).padStart(3, "0")}`,
              mimeType: mimeForOutputItem({ url: targetFrame.exportUrl || targetFrame.resultUrl, type: "image" })
            }
          : null;
    if (!targetItem?.url) throw new Error(
      editContext.type === "previewLayout"
        ? "Could not find the layout image to edit."
        : editContext.type === "storyboardFrame"
          ? "Could not find the storyboard frame image to edit."
          : "Could not find the Image node source to edit."
    );

    const editSuffix = edit.type === "crop" ? "crop" : edit.type === "flipVertical" ? "flip-v" : edit.type === "rotateClockwise" ? "rotate-cw" : edit.type === "curves" ? "curves" : edit.type === "tone" ? "adjustments" : edit.type === "text" ? "text" : edit.type === "inpaint" ? "inpaint" : "flip-h";
    const baseName = safeStillFrameName(fileBaseName(targetItem.fileName || targetItem.label || currentNode.data.title || "layout-image"));
    const uploadType = editContext.type === "storyboardFrame" ? "storyboard-frame" : editContext.type === "previewLayout" ? "preview-layout" : "image";
    let asset;
    if (edit.type === "inpaint") {
      const { response, data } = await nodeApi.previewInpaint({
        sourceUrl: targetItem.url,
        prompt: edit.prompt || "",
        maskDataUrl: edit.maskDataUrl || "",
        resolution: edit.resolution || "2K",
        ...workflowContextPayload(workflowRequestContext()),
        nodeId: currentNode.id,
        nodeTitle: `${currentNode.data.title || (editContext.type === "storyboardFrame" ? "Storyboard" : "Preview")} Inpaint`,
        outputFileNameBase: `${baseName}-${editSuffix}`
      }, "Preview inpainting");
      if (!response.ok) throw new Error(data.error || "Preview inpainting failed.");
      if (!data.image?.localUrl) throw new Error("Preview inpainting returned no image output.");
      const compositeBlob = await createInpaintCompositePreviewLayoutBlob(targetItem.url, data.image.localUrl, edit.maskDataUrl || "");
      asset = await uploadNodeAsset(new File([compositeBlob], `${baseName}-${editSuffix}.png`, { type: "image/png" }), uploadType);
    } else {
      const blob = await createEditedPreviewLayoutImageBlob(targetItem.url, edit);
      asset = await uploadNodeAsset(new File([blob], `${baseName}-${editSuffix}.png`, { type: "image/png" }), uploadType);
    }
    if (!asset?.localUrl) throw new Error("Preview edit returned no image output.");
    const editedItem = {
      ...targetItem,
      url: asset.localUrl,
      thumbnailUrl: asset.thumbnailUrl || "",
      type: "image",
      fileName: asset.fileName,
      mimeType: asset.mimeType || "image/png",
      label: targetItem.label || asset.fileName
    };
    const editedLightboxItem = {
      ...editedItem,
      editContext
    };

    pushUndoSnapshot();
    if (editContext.type === "previewLayout") {
      const nextItems = currentItems.map((layoutItem) => (layoutItem.id === targetItem.id ? editedItem : layoutItem));
      updateNode(currentNode.id, {
        previewTab: "layout",
        previewLayoutItems: nextItems,
        previewLayoutExport: null,
        previewLayoutExportStatus: "",
        previewLayoutExportError: ""
      });
    } else if (editContext.type === "storyboardFrame") {
      updateStoryboardNodeFrames(currentNode.id, currentFrames.map((frame) => (
        frame.id === editContext.itemId
          ? {
              ...frame,
              resultUrl: asset.localUrl,
              exportUrl: asset.localUrl,
              resultFallbackUrl: "",
              resultVersion: Date.now(),
              fileName: asset.fileName,
              status: "complete",
              error: ""
            }
          : frame
      )), {
        storyboardTab: "view",
        selectedFrameId: editContext.itemId,
        status: "complete",
        error: "",
        storyboardExport: null
      });
    } else if (editContext.type === "nodeResult") {
      const nextItems = currentResultItems.map((resultItem, index) => (index === targetResultIndex ? editedItem : resultItem));
      const selectedResultIndex = Math.min(Math.max(0, Math.trunc(Number(currentNode.data.selectedResultIndex) || 0)), Math.max(0, nextItems.length - 1));
      const selectedWasEdited = selectedResultIndex === targetResultIndex || currentNode.data.resultUrl === targetItem.url;
      updateNode(currentNode.id, {
        resultUrl: selectedWasEdited ? asset.localUrl : nextItems[selectedResultIndex]?.url || asset.localUrl,
        resultItems: nextItems,
        selectedResultIndex,
        fileName: selectedWasEdited ? asset.fileName : currentNode.data.fileName,
        mimeType: selectedWasEdited ? asset.mimeType || "image/png" : currentNode.data.mimeType,
        thumbnailUrl: selectedWasEdited ? asset.thumbnailUrl || "" : currentNode.data.thumbnailUrl,
        mediaType: "image",
        resultType: "image",
        status: "complete",
        error: ""
      });
    }
    setPreviewLightboxItem((current) => {
      if (!["previewLayout", "storyboardFrame", "nodeResult"].includes(current?.editContext?.type)) return current;
      if (current.editContext.nodeId !== currentNode.id) return current;
      if (editContext.type === "nodeResult") {
        if (Math.trunc(Number(current.editContext.itemIndex) || 0) !== targetResultIndex) return current;
      } else if (current.editContext.itemId !== targetItem.id) {
        return current;
      }
      return editedLightboxItem;
    });
    return editedLightboxItem;
  }

  async function restorePreviewLayoutImageEdit(item) {
    const editContext = item?.editContext || {};
    if (!["previewLayout", "storyboardFrame", "nodeResult"].includes(editContext.type) || !editContext.nodeId || (!editContext.itemId && editContext.type !== "nodeResult")) {
      throw new Error("This image is not editable from this board.");
    }

    const currentNode = nodesRef.current.find((node) => (
      node.id === editContext.nodeId &&
      (
        editContext.type === "previewLayout"
          ? node.type === "preview"
          : editContext.type === "storyboardFrame"
            ? node.type === "storyboard"
            : node.type === "image"
      )
    ));
    if (!currentNode) throw new Error(
      editContext.type === "previewLayout"
        ? "Could not find the Preview node for this image."
        : editContext.type === "storyboardFrame"
          ? "Could not find the Storyboard node for this frame."
          : "Could not find the Image node for this image."
    );

    const currentItems = editContext.type === "previewLayout"
      ? normalizedPreviewLayoutItems(currentNode.data.previewLayoutItems)
      : [];
    const currentFrames = editContext.type === "storyboardFrame"
      ? normalizedStoryboardFrames(currentNode.data.storyboardFrames)
      : [];
    const currentResultItems = editContext.type === "nodeResult"
      ? normalizedResultItems(currentNode.data.resultItems, currentNode.data.resultUrl, "image")
      : [];
    const targetResultIndex = editContext.type === "nodeResult"
      ? Math.min(Math.max(0, Math.trunc(Number(editContext.itemIndex) || 0)), Math.max(0, currentResultItems.length - 1))
      : -1;
    const targetItem = editContext.type === "previewLayout"
      ? currentItems.find((layoutItem) => layoutItem.id === editContext.itemId)
      : editContext.type === "nodeResult"
        ? currentResultItems[targetResultIndex]
        : currentFrames.find((frame) => frame.id === editContext.itemId);
    if (!targetItem) throw new Error(
      editContext.type === "previewLayout"
        ? "Could not find the layout image to restore."
        : editContext.type === "storyboardFrame"
          ? "Could not find the storyboard frame to restore."
          : "Could not find the Image node source to restore."
    );

    const { editContext: _lightboxEditContext, ...itemData } = item;
    const restoredItem = {
      ...targetItem,
      ...itemData,
      url: itemData.url || targetItem.url || targetItem.exportUrl || targetItem.resultUrl || "",
      type: "image"
    };
    const restoredLightboxItem = {
      ...restoredItem,
      editContext
    };
    if (editContext.type === "previewLayout") {
      updateNode(currentNode.id, {
        previewTab: "layout",
        previewLayoutItems: currentItems.map((layoutItem) => (layoutItem.id === editContext.itemId ? restoredItem : layoutItem)),
        previewLayoutExport: null,
        previewLayoutExportStatus: "",
        previewLayoutExportError: ""
      });
    } else if (editContext.type === "storyboardFrame") {
      updateStoryboardNodeFrames(currentNode.id, currentFrames.map((frame) => (
        frame.id === editContext.itemId
          ? {
              ...frame,
              resultUrl: restoredItem.url || frame.resultUrl,
              exportUrl: restoredItem.url || frame.exportUrl,
              resultFallbackUrl: "",
              resultVersion: Date.now(),
              fileName: restoredItem.fileName || frame.fileName,
              status: "complete",
              error: ""
            }
          : frame
      )), {
        storyboardTab: "view",
        selectedFrameId: editContext.itemId,
        status: "complete",
        error: "",
        storyboardExport: null
      });
    } else if (editContext.type === "nodeResult") {
      const nextItems = currentResultItems.map((resultItem, index) => (index === targetResultIndex ? restoredItem : resultItem));
      const selectedResultIndex = Math.min(Math.max(0, Math.trunc(Number(currentNode.data.selectedResultIndex) || 0)), Math.max(0, nextItems.length - 1));
      const selectedWasRestored = selectedResultIndex === targetResultIndex || currentNode.data.resultUrl === targetItem.url;
      updateNode(currentNode.id, {
        resultUrl: selectedWasRestored ? restoredItem.url : nextItems[selectedResultIndex]?.url || restoredItem.url,
        resultItems: nextItems,
        selectedResultIndex,
        fileName: selectedWasRestored ? restoredItem.fileName || currentNode.data.fileName : currentNode.data.fileName,
        mimeType: selectedWasRestored ? restoredItem.mimeType || currentNode.data.mimeType : currentNode.data.mimeType,
        thumbnailUrl: selectedWasRestored ? restoredItem.thumbnailUrl || "" : currentNode.data.thumbnailUrl,
        mediaType: "image",
        resultType: "image",
        status: "complete",
        error: ""
      });
    }
    setPreviewLightboxItem((current) => {
      if (!["previewLayout", "storyboardFrame", "nodeResult"].includes(current?.editContext?.type)) return current;
      if (current.editContext.nodeId !== currentNode.id) return current;
      if (editContext.type === "nodeResult") {
        if (Math.trunc(Number(current.editContext.itemIndex) || 0) !== targetResultIndex) return current;
      } else if (current.editContext.itemId !== editContext.itemId) {
        return current;
      }
      return restoredLightboxItem;
    });
    return restoredLightboxItem;
  }

  function startNodeDrag(event, node) {
    if (event.target.closest("input, textarea, select, button, label, summary, details, .preview-resize-handle, .storyboard-frame-card")) return;
    if (event.target.closest(".frame-it-canvas")) return;
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
        })),
      groups: getSelectedGroupsForNodeIds(selectedIds).map((group) => ({
        id: group.id,
        x: group.x,
        y: group.y
      }))
    });
  }

  function startSelectionMove(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedNodeIds.length) return;
    pushUndoSnapshot();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pointer = screenToScene(event.clientX, event.clientY);
    const selected = new Set(selectedNodeIds);
    setDragState({
      type: "nodes",
      startPointer: pointer,
      nodes: nodes
        .filter((item) => selected.has(item.id))
        .map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y
        })),
      groups: getSelectedGroupsForNodeIds(selectedNodeIds).map((group) => ({
        id: group.id,
        x: group.x,
        y: group.y
      }))
    });
  }

  function handlePointerMove(event) {
    const pointer = screenToScene(event.clientX, event.clientY);

    if (dragState?.type === "pan") {
      event.preventDefault();
      renderTransientViewport({
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
      const draggedGroups = new Map((dragState.groups || []).map((item) => [item.id, item]));
      if (draggedGroups.size) {
        setGroups((current) =>
          current.map((group) => {
            const start = draggedGroups.get(group.id);
            return start
              ? {
                  ...group,
                  x: start.x + deltaX,
                  y: start.y + deltaY
                }
              : group;
          })
        );
      }
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
    if (dragState?.type === "pan") commitTransientViewport();
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

    beginCanvasPan(event);
  }

  function beginCanvasPan(event) {
    setSelectedNodeIds([]);
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    setDragState({
      type: "pan",
      startClient: {
        x: event.clientX,
        y: event.clientY
      },
      viewport: viewportRef.current
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
    const targetNode = nodesRef.current.find((node) => node.id === nodeId);
    if (targetNode?.type === "autoAspect" && port === "imageIn") {
      updateNode(nodeId, resetAutoAspectOutputPatch());
    }
    setSelectedEdgeId(null);
    setDraftEdge(null);
    setSaveStatus("Disconnected input");
  }

  function selectEdge(event, edgeId) {
    event.preventDefault();
    event.stopPropagation();
    document.activeElement?.blur?.();
    setSelectedNodeIds([]);
    selectedEdgeIdRef.current = edgeId;
    setSelectedEdgeId(edgeId);
    setContextMenu(null);
  }

  function handleCanvasWheel(event) {
    const storyboardScroller = event.target.closest(".storyboard-scroll-surface");
    if (storyboardScroller && shouldPrioritizeSelectedTextareaWheel(event)) {
      const nestedTextarea = event.target.closest("textarea");
      const storyboardFrame = nestedTextarea?.closest(".storyboard-frame-card");
      const textareaOwnsWheel = nestedTextarea && (
        !storyboardFrame
          ? canScrollableElementConsumeVerticalWheel({
              scrollTop: nestedTextarea.scrollTop,
              scrollHeight: nestedTextarea.scrollHeight,
              clientHeight: nestedTextarea.clientHeight,
              deltaY: event.deltaY
            })
          : shouldStoryboardFrameTextareaConsumeWheel({
              frameSelected: storyboardFrame.classList.contains("selected"),
              scrollTop: nestedTextarea.scrollTop,
              scrollHeight: nestedTextarea.scrollHeight,
              clientHeight: nestedTextarea.clientHeight,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey
            })
      );
      if (textareaOwnsWheel) {
        event.stopPropagation();
        return;
      }

      if (storyboardScroller.scrollHeight > storyboardScroller.clientHeight + 1) {
        event.preventDefault();
        event.stopPropagation();
        storyboardScroller.scrollTop += event.deltaY;
        return;
      }
    }

    const selectedTextarea = event.target.closest("textarea")?.closest(".node-card.selected");
    if (selectedTextarea && shouldPrioritizeSelectedTextareaWheel(event)) {
      event.stopPropagation();
      return;
    }

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

    const interactiveControl = event.target.closest("input, textarea, select, [contenteditable='true']");
    if (interactiveControl && !event.ctrlKey && !event.metaKey && interactiveControl === document.activeElement) {
      if (interactiveControl.tagName !== "TEXTAREA" || textareaCanConsumeWheel(interactiveControl, event.deltaY)) return;
    }
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

    const current = viewportRef.current;
    renderTransientViewport(
      {
        ...current,
        x: current.x - event.deltaX,
        y: current.y - event.deltaY
      },
      { commitAfterMs: 120 }
    );
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
    const current = viewportRef.current;
    const nextScale = Math.min(maxZoom, Math.max(viewportScaleFloor, current.scale * zoomFactor));
    if (nextScale === current.scale) return;
    const scenePoint = {
      x: (pointer.x - current.x) / current.scale,
      y: (pointer.y - current.y) / current.scale
    };
    renderTransientViewport(
      {
        x: pointer.x - scenePoint.x * nextScale,
        y: pointer.y - scenePoint.y * nextScale,
        scale: nextScale
      },
      { commitAfterMs: 120 }
    );
  }

  function resetViewportZoom() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = {
      x: rect.width / 2,
      y: rect.height / 2
    };

    const current = viewportRef.current;
    const nextScale = 1;
    const scenePoint = {
      x: (pointer.x - current.x) / current.scale,
      y: (pointer.y - current.y) / current.scale
    };
    renderTransientViewport({
      x: pointer.x - scenePoint.x * nextScale,
      y: pointer.y - scenePoint.y * nextScale,
      scale: nextScale
    });
    commitTransientViewport();
  }

  function screenToScene(clientX, clientY) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const activeViewport = viewportRef.current;
    return {
      x: (clientX - rect.left - activeViewport.x) / activeViewport.scale,
      y: (clientY - rect.top - activeViewport.y) / activeViewport.scale
    };
  }

  function getNodeBounds(nodeId) {
    const canvas = canvasRef.current;
    const element = canvas?.querySelector(`[data-node-card-id="${nodeId}"]`);
    if (!canvas || !element) return { left: 0, top: 0, right: 0, bottom: 0 };

    const canvasRect = canvas.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const activeViewport = viewportRef.current;
    return {
      left: (rect.left - canvasRect.left - activeViewport.x) / activeViewport.scale,
      top: (rect.top - canvasRect.top - activeViewport.y) / activeViewport.scale,
      right: (rect.right - canvasRect.left - activeViewport.x) / activeViewport.scale,
      bottom: (rect.bottom - canvasRect.top - activeViewport.y) / activeViewport.scale
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

  function getSelectedGroupsForNodeIds(nodeIds) {
    if (!groups.length || !nodeIds.length) return [];
    const selected = new Set(nodeIds);
    return groups.filter((group) => {
      const groupNodeIds = getNodeIdsInsideGroup(group);
      return groupNodeIds.length > 0 && groupNodeIds.every((nodeId) => selected.has(nodeId));
    });
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
        const targetNodeForConnection = nodesRef.current.find((node) => node.id === to.nodeId);
        const shouldResetAutoAspectOutput = targetNodeForConnection?.type === "autoAspect" && to.port === "imageIn";
        setEdges((current) => {
          const replacesSingleComposerCharacterInput = isComposerCharacterInputPort(to.port, targetNodeForConnection);
          const replacesSingleAutoAspectInput = targetNodeForConnection?.type === "autoAspect" && to.port === "imageIn";
          const replacesSingleStoryboardSceneInput = targetNodeForConnection?.type === "storyboard" && to.port === "sceneDescriptionIn";
          let nextEdges = current.filter((edge) => {
            if (replacesSingleComposerCharacterInput && edge.to.nodeId === to.nodeId && edge.to.port === to.port) return false;
            if (replacesSingleAutoAspectInput && edge.to.nodeId === to.nodeId && edge.to.port === to.port) return false;
            if (replacesSingleStoryboardSceneInput && edge.to.nodeId === to.nodeId && edge.to.port === to.port) return false;
            return !(edge.from.nodeId === draftEdge.from.nodeId && edge.from.port === draftEdge.from.port && edge.to.nodeId === to.nodeId && edge.to.port === to.port);
          });

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
        if (shouldResetAutoAspectOutput) updateNode(to.nodeId, resetAutoAspectOutputPatch());
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
        imageModel: ["promptIn"],
        videoModel: ["promptIn"],
        utility: ["promptIn"],
        storyboard: ["sceneDescriptionIn"],
        text: ["textIn"]
      },
      director: {
        videoModel: ["directorIn"],
        storyboard: ["directorIn"]
      },
      image: {
        preview: ["sourceIn"],
        autoAspect: ["imageIn"],
        camera: ["imageIn"],
        composer: ["imageIn"],
        model3d: ["frontImageIn"],
        imageModel: ["imagePromptIn", "transferIn"],
        storyboard: ["sceneReferenceIn"],
        videoModel: ["startFrameIn", "referenceImageIn", "endFrameIn"],
        utility: ["imageIn", "referenceImageIn"],
        text: ["imageIn"],
        skillDirector: ["imageIn", "locationIn"]
      },
      video: {
        preview: ["sourceIn"],
        videoModel: ["referenceVideoIn"],
        utility: ["referenceVideoIn", "maskVideoIn"],
        text: ["videoIn"]
      },
      audio: {
        videoModel: ["referenceAudioIn"]
      },
      camera: {
        imageModel: ["cameraIn"]
      },
      style: {
        imageModel: ["styleIn"],
        storyboard: ["styleIn"],
        text: ["styleIn"]
      },
      transfer: {
        imageModel: ["transferIn"],
        storyboard: ["transferIn"],
        skillDirector: ["styleIn"],
        composer: ["imageIn"],
        model3d: ["frontImageIn"],
        utility: ["imageIn", "referenceImageIn"],
        preview: ["sourceIn"]
      },
      character: {
        imageModel: ["characterIn"],
        videoModel: ["characterIn"],
        storyboard: ["characterIn"],
        skillDirector: ["characterIn"],
        composer: composerCharacterInputPortIdsForNode(target),
        preview: ["sourceIn"]
      },
      model3d: {
        preview: ["sourceIn"]
      }
    };

    return inputs[outputKind]?.[target.type] || [];
  }

  function autoConnectionOutputKind(source, from) {
    if (source.type === "storyboard") return storyboardOutputItem(source, { from })?.url ? "image" : "";
    if (source.type === "autoAspect") return autoAspectOutputItem(source, { from })?.url ? "image" : "";
    if (source.type === "camera") return "camera";
    if (source.type === "composer") return "image";
    if (source.type === "utility") return utilityOutputType(source);
    if (source.type === "style") return "style";
    if (source.type === "transfer") return "transfer";
    if (source.type === "character") return from.port === "voiceOut" ? "audio" : "character";
    if (source.type === "model3d") return "model3d";
    if (source.type === "video" || source.type === "videoModel") return "video";
    if (source.type === "audio") return "audio";
    if (source.type === "skillDirector") return "director";
    if (source.type === "plainText" || source.type === "text") return "prompt";
    if (source.type === "image" || source.type === "imageModel") return "image";
    return "";
  }

  function getConnectionError(from, to, graphNodes = nodes) {
    const source = graphNodes.find((node) => node.id === from.nodeId);
    const target = graphNodes.find((node) => node.id === to.nodeId);

    if (!source || !target) return "Choose a valid connection";
    if (!outputPortIdsForNode(source).includes(from.port)) return "Choose a valid output";
    if (!inputPortIdsForNode(target).includes(to.port)) return "Choose a valid input";
    if (source.type === "skillDirector" && (!source.data?.skillDirectorBuilt || !source.data?.resultText)) return "Build Scene before connecting Film Director output";
    if (target.type === "skillDirector" && ["characterIn", "locationIn", "imageIn", "styleIn"].includes(to.port) && target.data?.skillDirectorLocks?.setup) {
      return "Unlock Scene Setup before changing Film Director references";
    }
    if (isImageModelUnsupportedInput(target, to.port)) return imageModelUnsupportedInputMessage(target.data?.model);
    if (isImageModelUnsupportedSource(target, source)) return imageModelUnsupportedInputMessage(target.data?.model);
    if (isVideoModelUnsupportedInput(target, to.port)) return videoModelUnsupportedInputMessage(target.data?.model, to.port);
    const compatibilityError = getPortCompatibilityError(source, from.port, target, to.port);
    if (compatibilityError) return compatibilityError;

    if (source.type === "storyboard") {
      if (!storyboardOutputItem(source, { from })?.url) return from.port === storyboardBoardOutputPortId ? "Lock this Storyboard board before connecting it" : "Generate this Storyboard frame before connecting it";
      if (target.type === "preview" && to.port === "sourceIn") return "";
      if (target.type === "storyboard" && to.port === "sceneReferenceIn") return "";
      if (target.type === "autoAspect" && to.port === "imageIn") return "";
      if (target.type === "composer" && to.port === "imageIn") return "";
      if (target.type === "model3d" && isModel3DImageInputPort(to.port)) return "";
      if (target.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(to.port)) return "";
      if (target.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(to.port)) return "";
      if (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) return "";
      if (target.type === "skillDirector" && ["imageIn", "locationIn"].includes(to.port)) return "";
      return "Storyboard frames connect to image inputs or previews";
    }

    if (source.type === "autoAspect") {
      const outputItem = autoAspectOutputItem(source, { from });
      if (!outputItem?.url) return "Generate this Auto Aspect output before connecting it";
      if (target.type === "preview" && to.port === "sourceIn") return "";
      if (target.type === "storyboard" && to.port === "sceneReferenceIn") return "";
      if (target.type === "autoAspect" && to.port === "imageIn") return "";
      if (target.type === "composer" && to.port === "imageIn") return "";
      if (target.type === "model3d" && isModel3DImageInputPort(to.port)) return "";
      if (target.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(to.port)) return "";
      if (target.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(to.port)) return "";
      if (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) return "";
      if (target.type === "text" && to.port === "imageIn") return "";
      if (target.type === "skillDirector" && ["imageIn", "locationIn"].includes(to.port)) return "";
      return "Auto Aspect outputs connect to image inputs or previews";
    }

    if (source.type === "camera") {
      if (!hasCameraPreset(source)) return "Choose a Camera preset before connecting";
      if (target.type === "imageModel" && to.port === "cameraIn") return "";
      return "Camera connects to the Image Model camera input";
    }

    if (source?.type === "style") {
      if ((source.data.stylePreset || "None") === "None") return "Choose a Style preset before connecting";
      if ((source.data.stylePreset || "None") === "Custom Palette" && !customPalettePromptPiece(source.data)) return "Add palette colors before connecting";
      if (target.type === "imageModel" && to.port === "styleIn") return "";
      if (target.type === "text" && to.port === "styleIn") return "";
      if (target.type === "storyboard" && to.port === "styleIn") {
        if (target.data.useStoryboardStyle !== false) return "Disable Storyboard Style before connecting a custom Style";
        return "";
      }
      return "Style presets connect to Style inputs";
    }

    if (source.type === "transfer") {
      if (!source.data.activated || !source.data.resultUrl) return `Lock Mood Board to enable ${moodBoardOutputFileName} output`;
      if (
        (target.type === "imageModel" && to.port === "transferIn") ||
        (target.type === "storyboard" && to.port === "transferIn" && target.data.useStoryboardStyle === false) ||
        (target.type === "composer" && to.port === "imageIn") ||
        (target.type === "model3d" && isModel3DImageInputPort(to.port)) ||
        (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) ||
        (target.type === "preview" && to.port === "sourceIn") ||
        (target.type === "skillDirector" && to.port === "styleIn")
      )
        return "";
      if (target.type === "storyboard" && to.port === "transferIn") return "Disable Storyboard Style before connecting a custom Mood Board";
      return "Mood Board connects to the Image Model mood board input or previews";
    }

    if (source.type === "character") {
      if (!source.data.locked || !source.data.activated || !source.data.resultUrl) return "Lock Character to enable output";
      if (from.port === "voiceOut") {
        if (!activeCharacterVoice(source)?.localUrl) return "Select a character voice before connecting";
        if (target.type === "videoModel" && to.port === "referenceAudioIn") return "";
        return "Character voice connects to a Video Model audio input";
      }
      if (target.type === "storyboard" && to.port === "characterIn") {
        if (target.data.useStoryboardStyle !== false) return "Disable Storyboard Style before connecting custom characters";
        return "";
      }
      if (target.type === "imageModel" && to.port === "characterIn") return "";
      if (target.type === "videoModel" && to.port === "characterIn") return "";
      if (target.type === "composer" && isComposerCharacterInputPort(to.port, target)) return "";
      if (target.type === "skillDirector" && to.port === "characterIn") return "";
      if (target.type === "preview" && to.port === "sourceIn") return "";
      return "Character connects to Character inputs or previews";
    }

    if ((["imageModel", "videoModel", "skillDirector"].includes(target.type) || target.type === "storyboard") && to.port === "characterIn") {
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
      if (target.type === "storyboard" && to.port === "sceneReferenceIn") return "";
      if (target.type === "autoAspect" && to.port === "imageIn") return "";
      if (target.type === "composer" && to.port === "imageIn") return "";
      if (target.type === "model3d" && isModel3DImageInputPort(to.port)) return "";
      if (target.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(to.port)) return "";
      if (target.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(to.port)) return "";
      if (target.type === "text" && to.port === "imageIn") return "";
      if (target.type === "skillDirector" && ["imageIn", "locationIn"].includes(to.port)) return "";
      if (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) return "";
      return "Utility image output connects to image inputs";
    }

    if (target?.type === "utility") {
      if (to.port === "promptIn") {
        if (["plainText", "text", "skillDirector", "imageModel", "videoModel"].includes(source.type)) return "";
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
      if (isComposerCharacterInputPort(to.port, target)) {
        if (source.type === "character" && from.port === "characterOut") return "";
        return "Composer character inputs accept locked Character nodes";
      }

      if (to.port === "imageIn") {
        if (source.type === "composer") return from.port === "imageOut" ? "" : "Composer image input accepts image outputs";
        if (["image", "imageModel", "transfer"].includes(source.type)) return "";
        return "Composer image input accepts image outputs";
      }
    }

    if (target?.type === "autoAspect") {
      if (to.port === "imageIn") {
        if (source.type === "composer") return from.port === "imageOut" ? "" : "Auto Aspect accepts image outputs";
        if (source.type === "utility") return utilityOutputType(source) === "image" ? "" : "Auto Aspect accepts image outputs";
        if (source.type === "storyboard") return storyboardOutputItem(source, { from })?.url ? "" : "Generate this Storyboard output before connecting it";
        if (source.type === "autoAspect") return autoAspectOutputItem(source, { from })?.url ? "" : "Generate this Auto Aspect output before connecting it";
        if (["image", "imageModel"].includes(source.type)) return "";
        return "Auto Aspect accepts image outputs";
      }
    }

    if (source?.type === "composer") {
      if (from.port === "imageOut") {
        if (target.type === "preview" && to.port === "sourceIn") return "";
        if (target.type === "storyboard" && to.port === "sceneReferenceIn") return "";
        if (target.type === "autoAspect" && to.port === "imageIn") return "";
        if (target.type === "composer" && to.port === "imageIn") return "";
        if (target.type === "model3d" && isModel3DImageInputPort(to.port)) return "";
        if (target.type === "imageModel" && ["imagePromptIn", "transferIn"].includes(to.port)) return "";
        if (target.type === "videoModel" && ["startFrameIn", "endFrameIn", "referenceImageIn"].includes(to.port)) return "";
        if (target.type === "text" && to.port === "imageIn") return "";
        if (target.type === "skillDirector" && ["imageIn", "locationIn"].includes(to.port)) return "";
        if (target.type === "utility" && ["imageIn", "referenceImageIn"].includes(to.port)) return "";
        return "Composer frame output connects to image inputs";
      }
    }

    if (target?.type === "model3d" && isModel3DImageInputPort(to.port)) {
      if (source.type === "composer") return from.port === "imageOut" ? "" : "3D image input accepts Composer frame output";
      if (source.type === "utility") return utilityOutputType(source) === "image" ? "" : "3D image input accepts image outputs";
      if (["image", "imageModel", "transfer"].includes(source.type)) return "";
      return "3D image input accepts image outputs";
    }

    if (target?.type === "storyboard" && to.port === "sceneReferenceIn") {
      if (source.type === "composer") return from.port === "imageOut" ? "" : "Storyboard scene reference accepts image outputs";
      if (source.type === "utility") return utilityOutputType(source) === "image" ? "" : "Storyboard scene reference accepts image outputs";
      if (source.type === "storyboard") return storyboardOutputItem(source, { from })?.url ? "" : "Generate this Storyboard output before connecting it";
      if (source.type === "autoAspect") return autoAspectOutputItem(source, { from })?.url ? "" : "Generate this Auto Aspect output before connecting it";
      if (["image", "imageModel"].includes(source.type)) return "";
      return "Storyboard scene reference accepts image outputs";
    }

    if (target?.type === "text") {
      if (to.port === "textIn") {
        if (["plainText", "text", "skillDirector", "imageModel", "videoModel"].includes(source.type)) return "";
        return "Smart Text Model input accepts text outputs";
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

    if (target?.type === "preview") {
      if (["image", "video", "imageModel", "videoModel", "utility", "transfer", "composer", "model3d"].includes(source?.type)) return "";
      return "Preview accepts image, video, and 3D sources";
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
    redoStackRef.current = [];
  }

  function clearUndoStack() {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }

  function undoGraphChange() {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      setSaveStatus("Nothing to undo");
      return;
    }

    redoStackRef.current = [
      ...redoStackRef.current.slice(-39),
      cloneGraphState({ nodes, edges, groups, viewport, selectedNodeIds, selectedEdgeId })
    ];
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setGroups(previous.groups || []);
    setViewport(previous.viewport);
    setSelectedNodeIds(previous.selectedNodeIds);
    setSelectedEdgeId(previous.selectedEdgeId || null);
    setSaveStatus("Undone");
  }

  function redoGraphChange() {
    const next = redoStackRef.current.pop();
    if (!next) {
      setSaveStatus("Nothing to redo");
      return;
    }

    undoStackRef.current = [
      ...undoStackRef.current.slice(-39),
      cloneGraphState({ nodes, edges, groups, viewport, selectedNodeIds, selectedEdgeId })
    ];
    setNodes(next.nodes);
    setEdges(next.edges);
    setGroups(next.groups || []);
    setViewport(next.viewport);
    setSelectedNodeIds(next.selectedNodeIds);
    setSelectedEdgeId(next.selectedEdgeId || null);
    setSaveStatus("Redone");
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
    const pastedNodeMap = new Map(pastedNodes.map((node) => [node.id, node]));
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
      }))
      .map((edge) => normalizeEdgeForCurrentGraph(edge, pastedNodeMap))
      .filter(Boolean);

    setNodes((current) => [...current, ...pastedNodes]);
    setEdges((current) => [...current, ...pastedEdges]);
    setSelectedNodeIds(pastedNodes.map((node) => node.id));
    setSelectedEdgeId(null);
    setSaveStatus(`${pastedNodes.length} node${pastedNodes.length === 1 ? "" : "s"} pasted`);
  }

  async function loadOutputHistory() {
    if (outputHistoryLoadPromiseRef.current) {
      outputHistoryReloadRequestedRef.current = true;
      return outputHistoryLoadPromiseRef.current;
    }

    outputHistoryLoadPromiseRef.current = (async () => {
      try {
        const history = await historyApi.listSummary({ limit: 500 });
        setOutputHistory(Array.isArray(history) ? history : []);
        outputHistoryLoadedRef.current = true;
      } catch {
        // The output rail is helpful, but it should never block the graph editor.
      }
    })();

    try {
      await outputHistoryLoadPromiseRef.current;
    } finally {
      outputHistoryLoadPromiseRef.current = null;
      if (outputHistoryReloadRequestedRef.current) {
        outputHistoryReloadRequestedRef.current = false;
        window.setTimeout(loadOutputHistory, 250);
      }
    }
  }

  function clearImportOffset(importedNodes) {
    const importBounds = graphBoundsForNodes(importedNodes);
    const importWidth = Math.max(estimatedNodeWidth("image"), importBounds.right - importBounds.left);
    const importHeight = Math.max(estimatedNodeHeight("image"), importBounds.bottom - importBounds.top);
    const canvas = canvasRef.current;
    const canvasRect = canvas?.getBoundingClientRect();
    const sceneCenter = canvasRect
      ? screenToScene(canvasRect.left + canvasRect.width / 2, canvasRect.top + canvasRect.height / 2)
      : defaultNodePosition(nodesRef.current.length + 1);
    const currentRects = nodesRef.current.map((node) => estimatedNodeRect(node, 72));
    const targetPositions = [
      { x: sceneCenter.x - importWidth / 2, y: sceneCenter.y - importHeight / 2 },
      { x: sceneCenter.x + 420, y: sceneCenter.y - importHeight / 2 },
      { x: sceneCenter.x - importWidth / 2, y: sceneCenter.y + 360 },
      { x: sceneCenter.x - importWidth - 420, y: sceneCenter.y - importHeight / 2 },
      { x: sceneCenter.x - importWidth / 2, y: sceneCenter.y - importHeight - 360 }
    ];

    for (const target of targetPositions) {
      const candidate = {
        left: target.x,
        top: target.y,
        right: target.x + importWidth,
        bottom: target.y + importHeight
      };
      if (!currentRects.some((rect) => rectsOverlap(rect, candidate))) {
        return {
          x: target.x - importBounds.left,
          y: target.y - importBounds.top
        };
      }
    }

    const currentBounds = graphBoundsForNodes(nodesRef.current);
    return {
      x: currentBounds.right + 160 - importBounds.left,
      y: Math.max(currentBounds.top, sceneCenter.y - importHeight / 2) - importBounds.top
    };
  }

  async function runNode(node) {
    const storedNode = nodesRef.current.find((item) => item.id === node.id);
    const currentNode =
      storedNode && node?.type === "skillDirector"
        ? {
            ...storedNode,
            data: {
              ...storedNode.data,
              ...node.data
            }
          }
        : storedNode || node;
    if (!isRunnableNode(currentNode)) return { status: "skipped" };
    if (currentNode.data.status === "running") return { status: "skipped" };

    const currentIncomingByNode = buildIncomingByNode(nodesRef.current, edgesRef.current);
    const incoming = currentIncomingByNode[currentNode.id] || {};
    const connectedPrompt = connectedText(incoming.promptIn);
    const directorPackagePrompt =
      currentNode.type === "videoModel" && videoModelSupportsFilmDirector(currentNode.data.model)
        ? connectedDirectorPackageText(incoming.directorIn)
        : "";
    const basePrompt =
      currentNode.type === "videoModel"
        ? [directorPackagePrompt, connectedPrompt || currentNode.data.prompt].filter(Boolean).join("\n\n")
        : connectedPrompt || currentNode.data.prompt;
    const isSingleRunSegmentation =
      (currentNode.type === "imageModel" && isSam3ImageModel(currentNode.data.model)) ||
      (currentNode.type === "videoModel" && isSam3VideoModel(currentNode.data.model)) ||
      (currentNode.type === "utility" &&
        utilityMode(currentNode) === "video" &&
        (isUtilitySam3VideoModel(currentNode.data.utilityVideoModel) ||
          isUtilityBirefnetVideoModel(currentNode.data.utilityVideoModel) ||
          isUtilityExtractFrameVideoModel(currentNode.data.utilityVideoModel) ||
          isUtilityColorIdMatteModel(currentNode.data.utilityVideoModel)));
    const batchCount = isSingleRunSegmentation ? 1 : nodeBatchCount(currentNode, currentNode.type === "imageModel" ? 9 : 4);
    const previousVideoResults = existingResultItemsForNode(currentNode, "video");
    const previous3DResults = existingResultItemsForNode(currentNode, "model3d");
    const previousUtilityResults = existingResultItemsForNode(currentNode, currentNode.type === "utility" ? utilityOutputType(currentNode) : "image");
    const requestContext = workflowRequestContext();
    const hasBasePrompt = Boolean(String(basePrompt || "").trim());

    if (currentNode.type === "videoModel" && !hasBasePrompt) {
      const error = new Error("Add a text prompt before running the Video Model.");
      updateNode(currentNode.id, { status: "error", error: error.message });
      return { status: "error", error };
    }

    try {
      updateNode(currentNode.id, { status: "running", error: "" });

      if (currentNode.type === "text") {
        const processed = await runTextNodeProcessing({
          node: currentNode,
          incoming,
          workflowContext: requestContext,
          sourceLabel,
          promptPiecesForSource
        });
        updateNode(currentNode.id, {
          status: "complete",
          error: "",
          resultText: processed.text,
          lastRunModel: processed.model
        });
        return { status: "complete" };
      }

      if (currentNode.type === "skillDirector") {
        const processed = await runSkillDirectorNode({
          node: currentNode,
          incoming,
          workflowContext: requestContext,
          sourceLabel
        });
        const action = processed.action || currentNode.data.skillDirectorAction || "build";
        const nextSkillPatch = {
          status: "complete",
          error: "",
          lastRunModel: processed.model,
          lastRunSkillName: processed.skillName,
          lastRunShotCount: processed.resolvedShotCount || processed.shotCount,
          lastRunDurationSeconds: processed.durationSeconds,
          lastRunActualShotCount: processed.actualShotCount,
          lastRunReferenceSetup: processed.referenceSetup,
          skillDirectorAction: "",
          skillDirectorQueuedAction: ""
        };
        if (action === "style") {
          updateNode(currentNode.id, {
            ...nextSkillPatch,
            skillDirectorLocks: {
              ...(currentNode.data.skillDirectorLocks && typeof currentNode.data.skillDirectorLocks === "object" ? currentNode.data.skillDirectorLocks : {}),
              setup: true,
              style: false,
              motion: false,
              scene: false,
              shotList: false
            },
            styleDirection: processed.styleDirection || processed.text || currentNode.data.styleDirection || "",
            skillDirectorBuilt: false,
            resultText: "",
            skillPreviewOpen: false
          });
          return { status: "complete" };
        }
        if (action === "motion") {
          updateNode(currentNode.id, {
            ...nextSkillPatch,
            skillDirectorLocks: {
              ...(currentNode.data.skillDirectorLocks && typeof currentNode.data.skillDirectorLocks === "object" ? currentNode.data.skillDirectorLocks : {}),
              setup: true,
              style: true,
              motion: false,
              scene: false,
              shotList: false
            },
            motionDirection: processed.motionDirection || processed.text || currentNode.data.motionDirection || "",
            motionBrief: processed.motionDirection || processed.text || currentNode.data.motionDirection || "",
            skillDirectorBuilt: false,
            resultText: "",
            skillPreviewOpen: false
          });
          return { status: "complete" };
        }
        if (action === "shotList") {
          updateNode(currentNode.id, {
            ...nextSkillPatch,
            skillDirectorLocks: {
              ...(currentNode.data.skillDirectorLocks && typeof currentNode.data.skillDirectorLocks === "object" ? currentNode.data.skillDirectorLocks : {}),
              setup: true,
              style: true,
              motion: true,
              scene: true,
              shotList: false
            },
            shotList: processed.shotList || processed.text || currentNode.data.shotList || "",
            shotListNotes: processed.shotListNotes || "",
            skillDirectorBuilt: false,
            resultText: "",
            skillPreviewOpen: false
          });
          return { status: "complete" };
        }
        if (action === "revise") {
          const revisionHistory = appendFilmDirectorRevisionHistory(currentNode.data.skillDirectorRevisionHistory, {
            notes: currentNode.data.skillDirectorRevisionNotes,
            summary: processed.revisionSummary,
            createdAt: new Date().toISOString()
          });
          updateNode(currentNode.id, {
            ...nextSkillPatch,
            resultText: formatSkillDirectorFinalPromptForClient(processed.text),
            styleDirection: processed.styleDirection || currentNode.data.styleDirection || "",
            motionDirection: processed.motionDirection || currentNode.data.motionDirection || "",
            motionBrief: processed.motionDirection || currentNode.data.motionDirection || "",
            sceneOverview: processed.sceneOverview || currentNode.data.sceneOverview || "",
            text: processed.sceneOverview || currentNode.data.sceneOverview || "",
            shotList: formatSkillDirectorShotListForClient(processed.shotList || currentNode.data.shotList || ""),
            shotListNotes: processed.shotListNotes || currentNode.data.shotListNotes || "",
            skillDirectorBuilt: Boolean(processed.text),
            skillPreviewOpen: Boolean(processed.text),
            skillDirectorRevisionOpen: true,
            skillDirectorRevisionNotes: "",
            skillDirectorLastRevisionSummary: processed.revisionSummary || "Applied the requested revisions.",
            skillDirectorRevisionHistory: revisionHistory
          });
          return { status: "complete" };
        }
        updateNode(currentNode.id, {
          ...nextSkillPatch,
          resultText: action === "build" ? formatSkillDirectorFinalPromptForClient(processed.text) : processed.text,
          styleDirection: processed.styleDirection || currentNode.data.styleDirection || "",
          motionDirection: processed.motionDirection || currentNode.data.motionDirection || "",
          shotList: formatSkillDirectorShotListForClient(processed.shotList || currentNode.data.shotList || ""),
          shotListNotes: processed.shotListNotes || currentNode.data.shotListNotes || "",
          skillDirectorBuilt: Boolean(processed.text),
          skillPreviewOpen: Boolean(processed.text)
        });
        return { status: "complete" };
      }

      if (currentNode.type === "autoAspect") {
        const sourceImageUrl = connectedAssetUrls(incoming.imageIn).at(-1);
        if (!sourceImageUrl) throw new Error("Connect an image to Auto Aspect.");
        const autoAspectTargets = autoAspectTargetsForData(currentNode.data);
        if (!autoAspectTargets.length) throw new Error("Select at least one aspect ratio.");

        const settled = await settleSequential(
          autoAspectTargets,
          (target, index) => runAutoAspectGeneration({
            node: currentNode,
            sourceImageUrl,
            aspectRatio: target.aspectRatio,
            workflowContext: requestContext,
            index
          }),
          imageRunStaggerMs
        );
        const successes = fulfilledRunValues(settled, { flatten: true });
        const failures = rejectedRunResults(settled);
        ensureRunSuccesses(successes, failures, "Auto Aspect generation failed.");
        const autoAspectResults = successes.map((item) => ({
          key: item.key || autoAspectTargetKey(item),
          aspectRatio: item.aspectRatio,
          url: item.url,
          label: item.label,
          text: item.text || "",
          cost: item.cost ?? null,
          sourceUrl: item.sourceUrl || ""
        }));
        const resultItems = autoAspectResultItems({ autoAspectResults });

        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: resultItems[0]?.url || autoAspectResults[0]?.url || "",
          resultItems,
          selectedResultIndex: 0,
          autoAspectResults,
          resultText: resultTextFromItems(autoAspectResults),
          error: batchRunError("image", autoAspectTargets.length, successes, failures)
        });
        loadOutputHistory();
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
          const { resultItems, firstNewIndex } = appendedNodeResultState(previousUtilityResults, generatedItems, "image");
          updateNode(currentNode.id, {
            status: "complete",
            resultUrl: generated.url,
            resultItems,
            selectedResultIndex: firstNewIndex,
            resultText: resultTextFromItems(generatedItems),
            resultType: "image",
            error: ""
          });
          loadOutputHistory();
          return { status: "complete" };
        }

        const utilityResultType = utilityOutputType(currentNode);
        const runs = nodeRunIndexes(batchCount).map((index) =>
          runUtilityVideoGeneration({
            node: currentNode,
            prompt: basePrompt,
            incoming,
            workflowContext: requestContext,
            index
          })
        );
        const settled = await Promise.allSettled(runs);
        const successes = fulfilledRunValues(settled, { flatten: true });
        const failures = rejectedRunResults(settled);
        ensureRunSuccesses(successes, failures, "Utility video failed.");
        const { resultItems, firstNewIndex } = appendedNodeResultState(previousUtilityResults, successes, utilityResultType);

        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: successes[0].url,
          resultItems,
          selectedResultIndex: firstNewIndex,
          resultText: resultTextFromItems(successes),
          resultType: utilityResultType,
          error: batchRunError(utilityResultType, batchCount, successes, failures)
        });
        loadOutputHistory();
        return { status: "complete" };
      }

      if (currentNode.type === "imageModel") {
        const isSegmentation = isSam3ImageModel(currentNode.data.model);
        const isZImage = isZImageImageModel(currentNode.data.model);
        const aspectRatio = isSegmentation ? currentNode.data.aspectRatio : await resolveImageModelAspectRatio(currentNode, incoming);
        const imageInstructionSources = imageInstructionSourcesForModel(currentNode.data.model, incoming);
        const imagePromptItems = connectedImagePromptItems(
          isSegmentation ? zImageSupportedReferenceConnections(incoming.imagePromptIn || []) : imageReferenceConnectionsForModel(currentNode.data.model, incoming),
          currentIncomingByNode,
          { includeComposerCharacterBindings: !isZImage }
        );
        const prompt = isSegmentation
          ? basePrompt
          : isZImage
            ? basePrompt
          : buildEffectiveImagePrompt(basePrompt, imageInstructionSources, aspectRatio, currentIncomingByNode);
        const runIndexes = nodeRunIndexes(batchCount);
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
        const successes = fulfilledRunValues(settled, { flatten: true });
        const failures = rejectedRunResults(settled);
        ensureRunSuccesses(successes, failures, "Image generation failed.");
        const { resultItems, firstNewIndex } = appendedNodeResultState([], successes, "image");

        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: successes[0].url,
          resultItems,
          selectedResultIndex: firstNewIndex,
          resultText: resultTextFromItems(successes),
          error: batchRunError("image", batchCount, successes, failures)
        });
        loadOutputHistory();
        return { status: "complete" };
      }

      if (currentNode.type === "model3d") {
        const generated = await run3DModelGeneration({
          node: currentNode,
          imageViewUrls: connected3DViewUrls(incoming),
          workflowContext: requestContext,
          model: currentNode.data.model || model3DNames.hunyuanPro,
          generateType: normalizeModel3DGenerateType(currentNode.data.generateType),
          faceCount: model3DFaceCount(currentNode.data.faceCount)
        });
        const { resultItems, firstNewIndex } = appendedNodeResultState(previous3DResults, [generated], "model3d");
        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: generated.url,
          resultItems,
          selectedResultIndex: firstNewIndex,
          resultText: generated.text || "",
          resultType: "model3d",
          error: ""
        });
        loadOutputHistory();
        return { status: "complete" };
      }

      const supportsVideoCharacters = videoModelSupportsCharacterInput(currentNode.data.model);
      const compatibleVideoIncoming = supportsVideoCharacters
        ? incoming
        : { ...incoming, characterIn: [] };
      const videoIncoming = expandVideoDirectorPackageIncoming(compatibleVideoIncoming, currentIncomingByNode, {
        includeCharacters: supportsVideoCharacters
      });
      const prompt = buildEffectiveVideoPrompt(basePrompt, videoIncoming);
      const runs = nodeRunIndexes(batchCount).map((index) =>
        runVideoModelGeneration({
          node: currentNode,
          prompt,
          incoming: videoIncoming,
          incomingByNode: currentIncomingByNode,
          workflowContext: requestContext,
          index
        })
      );
      const settled = await Promise.allSettled(runs);
      const successes = fulfilledRunValues(settled);
      const failures = rejectedRunResults(settled);
      ensureRunSuccesses(successes, failures, "Video generation failed.");
      const { resultItems, firstNewIndex } = appendedNodeResultState(previousVideoResults, successes, "video");

      updateNode(currentNode.id, {
        status: "complete",
        resultUrl: successes[0].url,
        resultItems,
        selectedResultIndex: firstNewIndex,
        resultText: "",
        error: batchRunError("video", batchCount, successes, failures)
      });
      loadOutputHistory();
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
    return runRunnableNodesByDependencyOrder(runnableNodes, edgesRef.current, {
      runNode,
      onStatus: setSaveStatus,
      onNodeSkipped: (nodeId, message) => updateNode(nodeId, { status: "error", error: message })
    });
  }

  return (
    <section className={`node-workspace ${toolbarCollapsed ? "toolbar-collapsed" : ""} ${outputsCollapsed ? "outputs-collapsed" : "outputs-open"}`}>
      {composerEditorNode && (
        <ComposerEditorModal
          node={composerEditorNode}
          incoming={incomingByNode[composerEditorNode.id] || {}}
          onClose={() => setComposerEditorNodeId(null)}
          onUpdate={(patch) => updateNode(composerEditorNode.id, patch)}
          onCapture={(imageDataUrl) => captureComposerFrame(composerEditorNode, imageDataUrl)}
        />
      )}
      {unsavedPrompt && (
        <UnsavedWorkflowPrompt
          actionLabel={unsavedPrompt.actionLabel}
          onDecision={resolveUnsavedWorkflowPrompt}
        />
      )}
      {previewLightboxItem && (
        <OutputPreviewLightbox
          item={previewLightboxItem}
          onApplyImageEdit={applyPreviewLayoutImageEdit}
          onRestoreImageEdit={restorePreviewLayoutImageEdit}
          onClose={() => setPreviewLightboxItem(null)}
        />
      )}
      {toolbarCollapsed && (
        <button className="sidebar-restore" onClick={() => setToolbarCollapsed(false)} title="Show node palette">
          <PanelLeftOpen size={17} />
        </button>
      )}
      {outputsCollapsed && (
        <button className="outputs-restore" onClick={() => setOutputsCollapsed(false)} title="Show project outputs">
          <PanelRightOpen size={17} />
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
          <button className="new-project-button" onClick={startNewProject} title="Start a new node project">
            <Plus size={14} />
            <span>New Project</span>
          </button>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" />
          <div className="file-menu" ref={fileMenuRef}>
            <button className="file-menu-trigger" onClick={() => setFileMenuOpen((open) => !open)} title="File">
              <FolderOpen size={16} />
              <span>File</span>
              <ChevronDown size={13} />
            </button>
            {fileMenuOpen && (
              <div className="file-menu-list">
                <button onClick={() => { setFileMenuOpen(false); saveProject(); }} title="Save project">
                  <Save size={15} />
                  <span>Save</span>
                </button>
                <button onClick={() => { setFileMenuOpen(false); saveProjectAsLocalFile(); }} title={projectPackagePath ? `Save As portable package. Current package: ${projectPackagePath}` : "Save as portable workflow package"}>
                  <Save size={15} />
                  <span>Save As</span>
                </button>
                <button onClick={() => { setFileMenuOpen(false); openWorkflowFromSystemPicker(); }} title="Open workflow package JSON">
                  <FolderOpen size={15} />
                  <span>Open</span>
                </button>
                <button onClick={() => { setFileMenuOpen(false); importWorkflowFromSystemPicker(); }} title="Import workflow into this canvas">
                  <Download size={15} />
                  <span>Import</span>
                </button>
              </div>
            )}
          </div>
          <input
            ref={workflowFileInputRef}
            className="workflow-file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => openWorkflowFile(event.target.files?.[0])}
          />
          <div className="project-picker" ref={projectMenuRef}>
            <button className="project-picker-trigger" onClick={() => setProjectMenuOpen((open) => !open)} title="Load saved workflow">
              <span>Recent Projects</span>
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
                      <button className="project-delete" onClick={() => deleteProject(project)} title={`Remove ${project.registryFileName || project.fileName || project.name} from dropdown`}>
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
          "--grid-size": `${28 * viewportRef.current.scale}px`,
          "--grid-x": `${positiveModulo(viewportRef.current.x, 28 * viewportRef.current.scale)}px`,
          "--grid-y": `${positiveModulo(viewportRef.current.y, 28 * viewportRef.current.scale)}px`
        }}
        onPointerDown={startCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishConnection}
        onPointerCancel={stopNodeDrag}
        onContextMenu={openCanvasContextMenu}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        <div
          ref={sceneRef}
          className="node-scene"
          style={{
            transform: `translate3d(${viewportRef.current.x}px, ${viewportRef.current.y}px, 0) scale(${viewportRef.current.scale})`
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
              onOutputImport={importOutputAssetToMediaNode}
              onTransferImagesUpload={uploadTransferImages}
              onTransferOutputImport={importOutputAssetToTransferNode}
              onTransferImageRemove={removeTransferImage}
              onTransferActivate={activateTransferNode}
              onTransferUnlock={unlockTransferNode}
              onCharacterPortraitUpload={uploadCharacterPortrait}
              onCharacterPortraitImport={importOutputAssetToCharacterPortrait}
              onCharacterWardrobesUpload={uploadCharacterWardrobes}
              onCharacterWardrobeImport={importOutputAssetToCharacterWardrobes}
              onCharacterVoicesUpload={uploadCharacterVoices}
              onCharacterWardrobeRemove={removeCharacterWardrobe}
              onCharacterVoiceRemove={removeCharacterVoice}
              onCharacterActivate={activateCharacterNode}
              onCharacterUnlock={unlockCharacterNode}
              onStoryboardPlan={planStoryboardNode}
              onStoryboardGenerateAll={generateStoryboardNode}
              onStoryboardGenerateFrame={generateStoryboardFrame}
              onStoryboardExport={exportStoryboardBoard}
              onStoryboardLock={lockStoryboardBoard}
              onStoryboardCharacterUpload={uploadStoryboardCharacter}
              onStoryboardCharacterImport={importStoryboardCharacter}
              onStoryboardCharacterUpdate={updateStoryboardCharacter}
              onStoryboardCharacterRemove={removeStoryboardCharacter}
              onStoryboardFrameImport={importImageToStoryboardFrame}
              onUndoSnapshot={pushUndoSnapshot}
              onPreviewResizeStart={startPreviewResize}
              onPreviewOpen={setPreviewLightboxItem}
              onPreviewLayoutExport={exportPreviewLayoutBoard}
              onOpenComposer={setComposerEditorNodeId}
              onFrameItCapture={captureFrameItFrame}
              onCanvasPanStart={beginCanvasPan}
              running={node.data.status === "running"}
              transferCompiling={compilingTransferNodeId === node.id}
              selected={selectedNodeSet.has(node.id)}
              tagHighlight={referenceTagHighlights.get(node.id)}
              imageModelOptions={enabledImageModels}
              videoModelOptions={enabledVideoModels}
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
            onMoveStart={startSelectionMove}
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
          <button ref={zoomReadoutRef} type="button" onClick={resetViewportZoom} title="Reset zoom" aria-label="Reset zoom" className="zoom-readout">
            {Math.round(viewport.scale * 100)}%
          </button>
          <button type="button" onClick={() => zoomViewportAtCanvasCenter(1.16)} title="Zoom in" aria-label="Zoom in">
            <Plus size={14} />
          </button>
        </div>
      </div>
      {!outputsCollapsed && (
        <ProjectOutputDrawer
          items={projectOutputs}
          onClose={() => setOutputsCollapsed(true)}
          onRefresh={loadOutputHistory}
          onPreviewOpen={setPreviewLightboxItem}
          outputDragMime={outputDragMime}
        />
      )}
    </section>
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
  return target === canvas || target.classList?.contains("node-scene") || target.classList?.contains("edge-layer") || target.classList?.contains("frame-it-canvas");
}

function textareaCanConsumeWheel(textarea, deltaY) {
  if (!textarea || Math.abs(Number(deltaY) || 0) < 0.01 || textarea.scrollHeight <= textarea.clientHeight) return false;
  if (deltaY < 0) return textarea.scrollTop > 0;
  return textarea.scrollTop + textarea.clientHeight < textarea.scrollHeight - 1;
}

function nodeTextareaStorageKey(textarea, index) {
  const descriptor =
    textarea.getAttribute("aria-label") ||
    textarea.getAttribute("name") ||
    textarea.getAttribute("placeholder") ||
    textarea.className ||
    "textarea";
  return `${index}:${String(descriptor).replace(/\s+/g, " ").trim().slice(0, 90)}`;
}

function normalizedTextareaHeights(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, height]) => [key, Number(height)])
      .filter(([key, height]) => key && Number.isFinite(height) && height >= 40 && height <= 1400)
  );
}

function textareaLayoutHeight(textarea) {
  const inlineHeight = Number.parseFloat(textarea.style.height || "");
  if (Number.isFinite(inlineHeight) && inlineHeight > 0) return inlineHeight;
  const computedHeight = Number.parseFloat(window.getComputedStyle(textarea).height || "");
  if (Number.isFinite(computedHeight) && computedHeight > 0) return computedHeight;
  return textarea.offsetHeight;
}

function mergeTextareaHeightsFromCanvas(nodes = [], canvas) {
  if (!canvas) return nodes;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const captured = new Map();
  canvas.querySelectorAll("[data-node-card-id]").forEach((card) => {
    const nodeId = card.getAttribute("data-node-card-id");
    if (!nodeMap.has(nodeId)) return;
    const heights = normalizedTextareaHeights(nodeMap.get(nodeId)?.data?.textareaHeights);
    card.querySelectorAll("textarea").forEach((textarea, index) => {
      const height = Math.round(textareaLayoutHeight(textarea));
      if (!Number.isFinite(height) || height < 40 || height > 1400) return;
      heights[nodeTextareaStorageKey(textarea, index)] = height;
    });
    captured.set(nodeId, heights);
  });

  if (!captured.size) return nodes;
  let changed = false;
  const nextNodes = nodes.map((node) => {
    const heights = captured.get(node.id);
    if (!heights) return node;
    const currentHeights = normalizedTextareaHeights(node.data?.textareaHeights);
    const same =
      Object.keys(heights).length === Object.keys(currentHeights).length &&
      Object.entries(heights).every(([key, value]) => currentHeights[key] === value);
    if (same) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        textareaHeights: heights
      }
    };
  });
  return changed ? nextNodes : nodes;
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
  onOutputImport,
  onTransferImagesUpload,
  onTransferOutputImport,
  onTransferImageRemove,
  onTransferActivate,
  onTransferUnlock,
  onCharacterPortraitUpload,
  onCharacterPortraitImport,
  onCharacterWardrobesUpload,
  onCharacterWardrobeImport,
  onCharacterVoicesUpload,
  onCharacterWardrobeRemove,
  onCharacterVoiceRemove,
  onCharacterActivate,
  onCharacterUnlock,
  onStoryboardPlan,
  onStoryboardGenerateAll,
  onStoryboardGenerateFrame,
  onStoryboardExport,
  onStoryboardLock,
  onStoryboardCharacterUpload,
  onStoryboardCharacterImport,
  onStoryboardCharacterUpdate,
  onStoryboardCharacterRemove,
  onStoryboardFrameImport,
  onUndoSnapshot,
  onPreviewResizeStart,
  onPreviewOpen,
  onPreviewLayoutExport,
  onOpenComposer,
  onFrameItCapture,
  onCanvasPanStart,
  running,
  transferCompiling,
  selected,
  tagHighlight,
  imageModelOptions,
  videoModelOptions
}) {
  const config = getNodeConfig(node.type);
  const Icon = config.icon;
  const nodeColor = nodeColorForData(node.data);
  const nodeHelp = nodeHelpContent[node.type] || {
    title: configTitleFallback(node.type),
    lines: ["Use this node as part of a connected NewtNode workflow."]
  };
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(node.data.title || "");
  const cardRef = React.useRef(null);

  React.useEffect(() => {
    if (!editingTitle) {
      setDraftTitle(node.data.title || "");
    }
  }, [node.data.title, editingTitle]);

  React.useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const savedHeights = normalizedTextareaHeights(node.data.textareaHeights);
    card.querySelectorAll("textarea").forEach((textarea, index) => {
      const savedHeight = savedHeights[nodeTextareaStorageKey(textarea, index)];
      if (!savedHeight) return;
      textarea.style.height = `${savedHeight}px`;
    });
  }, [node.id, node.type, node.data.textareaHeights]);

  React.useEffect(() => {
    if (!infoOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setInfoOpen(false);
    }
    function handlePointerDown(event) {
      if (!cardRef.current?.contains(event.target)) setInfoOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [infoOpen]);

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
  const storyboardScalable = node.type === "storyboard";
  const frameItScalable = node.type === "frameIt";

  return (
    <article
      ref={cardRef}
      className={`node-card ${node.type === "composer" ? "node-type-composer" : `${node.type} node-type-${node.type}`} ${nodeColor ? "has-node-color" : ""} ${selected ? "selected" : ""} ${tagHighlight ? "reference-tag-highlighted" : ""} ${moodBoardScalable ? "mood-board-scalable" : ""} ${storyboardScalable ? "storyboard-scalable" : ""} ${frameItScalable ? "frame-it-scalable" : ""}`}
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        "--preview-scale": node.data.previewScale || 1,
        "--node-color": nodeColor || "transparent",
        "--mood-board-scale": moodBoardScalable ? node.data.moodBoardScale || 1 : 1,
        "--storyboard-scale": storyboardScalable ? node.data.storyboardScale || 1 : 1,
        "--frame-it-scale": frameItScalable ? node.data.frameItScale || 1 : 1,
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
        <span className="node-title-actions" onPointerDown={(event) => event.stopPropagation()}>
          <span className="node-info-wrap">
            <button
              type="button"
              className={`node-info-button ${infoOpen ? "active" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setInfoOpen((value) => !value);
              }}
              title={`About ${nodeHelp.title}`}
              aria-label={`About ${nodeHelp.title}`}
              aria-expanded={infoOpen}
            >
              <Info size={12} />
            </button>
            {infoOpen && (
              <div className="node-info-popover" role="dialog" aria-label={`${nodeHelp.title} info`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                <strong>{nodeHelp.title}</strong>
                {nodeHelp.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
          </span>
          <button type="button" className="node-remove-button" onClick={() => onRemove(node.id)} title="Remove node" aria-label="Remove node">
            <X size={14} />
          </button>
        </span>
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
        onOutputImport={onOutputImport}
        onTransferImagesUpload={onTransferImagesUpload}
        onTransferOutputImport={onTransferOutputImport}
        onTransferImageRemove={onTransferImageRemove}
        onTransferActivate={onTransferActivate}
        onTransferUnlock={onTransferUnlock}
        onCharacterPortraitUpload={onCharacterPortraitUpload}
        onCharacterPortraitImport={onCharacterPortraitImport}
        onCharacterWardrobesUpload={onCharacterWardrobesUpload}
        onCharacterWardrobeImport={onCharacterWardrobeImport}
        onCharacterVoicesUpload={onCharacterVoicesUpload}
        onCharacterWardrobeRemove={onCharacterWardrobeRemove}
        onCharacterVoiceRemove={onCharacterVoiceRemove}
        onCharacterActivate={onCharacterActivate}
        onCharacterUnlock={onCharacterUnlock}
        onStoryboardPlan={onStoryboardPlan}
        onStoryboardGenerateAll={onStoryboardGenerateAll}
        onStoryboardGenerateFrame={onStoryboardGenerateFrame}
        onStoryboardExport={onStoryboardExport}
        onStoryboardLock={onStoryboardLock}
        onStoryboardCharacterUpload={onStoryboardCharacterUpload}
        onStoryboardCharacterImport={onStoryboardCharacterImport}
        onStoryboardCharacterUpdate={onStoryboardCharacterUpdate}
        onStoryboardCharacterRemove={onStoryboardCharacterRemove}
        onUndoSnapshot={onUndoSnapshot}
        onPreviewResizeStart={onPreviewResizeStart}
        onPreviewOpen={onPreviewOpen}
        onPreviewLayoutExport={onPreviewLayoutExport}
        onOpenComposer={onOpenComposer}
        onFrameItCapture={onFrameItCapture}
        onCanvasPanStart={onCanvasPanStart}
        transferCompiling={transferCompiling}
        imageModelOptions={imageModelOptions}
        videoModelOptions={videoModelOptions}
      />
    </article>
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
      <div className="still-frame-scrubber empty" onPointerDown={stopCanvasGesture}>
        <Film size={18} />
        <span>Connect a video</span>
      </div>
    );
  }

  return (
    <div className="still-frame-scrubber" onPointerDown={stopCanvasGesture}>
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
  const selectedId = rawSelectedId === "camera" ? "camera" : composerObjects.some((item) => item.id === rawSelectedId) ? rawSelectedId : sceneData.maquettes[0]?.id || sceneData.props[0]?.id || sceneData.imagePlanes[0]?.id || "camera";
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
  const sceneObjectList = [
    { id: "camera", label: "Camera", type: "View" },
    ...sceneData.maquettes.map((item, index) => ({ id: item.id, label: item.name || `Maquette ${index + 1}`, type: "Maquette" })),
    ...sceneData.props.map((item, index) => ({ id: item.id, label: item.name || `${composerPrimitiveLabel(item.primitive)} ${index + 1}`, type: composerPrimitiveLabel(item.primitive) })),
    ...sceneData.imagePlanes.map((item, index) => ({ id: item.id, label: item.name || `Image Plane ${index + 1}`, type: "Image Plane" }))
  ];

  React.useEffect(() => {
    let cancelled = false;

    composerApi.listPoses()
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
      const { response, data } = await composerApi.savePose(pose);
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

  async function deleteSelectedPose() {
    if (selectedKind !== "maquette" || !selectedObject || !selectedPoseValue) return;

    const savedPose = savedPoseOptions.find((pose) => pose.id === selectedPoseValue);
    if (!savedPose) return;

    const confirmed = window.confirm(`Delete pose "${savedPose.name}"?`);
    if (!confirmed) return;

    const nextSavedPoses = nodeSavedPoses.filter((pose) => pose.id !== savedPose.id);
    const nextScene = {
      ...sceneData,
      maquettes: sceneData.maquettes.map((item) => (item.pose === savedPose.id ? { ...item, pose: "" } : item))
    };

    onUpdate({
      composerScene: normalizedComposerScene(nextScene),
      composerSavedPoses: nextSavedPoses
    });
    setLibraryPoses((poses) => poses.filter((pose) => pose.id !== savedPose.id));
    setPoseStatus(`Deleted "${savedPose.name}" from this Composer.`);

    if (!savedPose.fileName) return;

    try {
      const { response, data } = await composerApi.deletePose(savedPose.id);
      if (!response.ok) throw new Error(data.error || "Could not delete the pose library file.");

      setLibraryPoses(normalizeComposerSavedPoses(data.poses));
      setPoseStatus(`Deleted "${savedPose.name}" from this Composer and public/models/poses.`);
    } catch (error) {
      setPoseStatus(`Deleted "${savedPose.name}" from this Composer. Library delete failed until the backend is restarted.`);
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
            <button className="composer-danger" onClick={removeSelected} disabled={!selectedObject} title={selectedObject ? "Delete selected scene object" : "Select a scene object to delete"}>
              Delete Selected
            </button>
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
            renderViewport={renderComposerViewport}
            aspectRatioValue={composerAspectRatioValue}
            aspectRatioNumber={composerAspectRatioNumber}
          />

          <aside className={`composer-controls ${selectedKind === "maquette" ? "maquette-selected" : ""}`}>
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
              <div className="composer-object-list" role="listbox" aria-label="Scene objects">
                {sceneObjectList.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === selectedId ? "selected" : ""}
                    onClick={() => onUpdate({ composerSelectedId: item.id })}
                    role="option"
                    aria-selected={item.id === selectedId}
                  >
                    <span>{item.label}</span>
                    <small>{item.type}</small>
                  </button>
                ))}
              </div>
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
              selectedKind === "maquette" ? (
                <>
                  <label className="composer-field">
                    <span>Color</span>
                    <input type="color" value={selectedObject.color || "#b8b8b2"} onChange={(event) => patchSelected({ color: event.target.value })} />
                  </label>
                  <ComposerVectorRange label="Location" value={{ x: selectedObject.x, y: selectedObject.y, z: selectedObject.z }} step="0.05" onChange={(value) => patchSelected({ x: value.x, y: value.y, z: value.z })} />
                  <ComposerRotationVectorRange label="Rotation" value={{ x: degreesToRadians(finiteNumber(selectedObject.rotX, 0)), y: degreesToRadians(finiteNumber(selectedObject.rotY, 0)), z: degreesToRadians(finiteNumber(selectedObject.rotZ, 0)) }} onChange={(value) => patchSelected({ rotX: radiansToDegrees(value.x), rotY: radiansToDegrees(value.y), rotZ: radiansToDegrees(value.z) })} />
                  <ComposerRange label="Scale" step="0.05" value={selectedObject.scale} onChange={(value) => patchSelected({ scale: value })} />
                  <details className="composer-pose-panel">
                    <summary>
                      <span>Pose Controls</span>
                      <ChevronDown size={14} />
                    </summary>
                    <div className="composer-pose-panel-body">
                      <div className="composer-control-row pose-save">
                        <label className="composer-field highlighted">
                          <span>Pose Presets</span>
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
                        <button type="button" className="composer-pose-delete" onClick={deleteSelectedPose} disabled={!selectedPoseValue} title={selectedPoseValue ? "Delete selected pose" : "Select a pose to delete"} aria-label="Delete selected pose">
                          <Trash2 size={15} />
                        </button>
                        <button type="button" onClick={saveSelectedPose}>
                          Save
                        </button>
                      </div>
                      {poseStatus && <div className="composer-status">{poseStatus}</div>}
                      <ComposerRotationVectorRange label="Head" value={composerRotationVector(selectedObject, "headRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("headRot", value, false))} />
                      <ComposerRotationVectorRange label="Upper Body" value={composerRotationVector(selectedObject, "upperBodyRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("upperBodyRot", value, false))} />
                      <ComposerRotationVectorRange label="L Upper Arm" value={composerRotationVector(selectedObject, "leftUpperArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftUpperArm", value))} />
                      <ComposerRotationVectorRange label="L Lower Arm" value={composerRotationVector(selectedObject, "leftLowerArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftLowerArm", value))} />
                      <ComposerRotationVectorRange label="L Hand" value={composerRotationVector(selectedObject, "leftHandRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftHandRot", value, false))} />
                      <ComposerRotationVectorRange label="R Upper Arm" value={composerRotationVector(selectedObject, "rightUpperArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightUpperArm", value))} />
                      <ComposerRotationVectorRange label="R Lower Arm" value={composerRotationVector(selectedObject, "rightLowerArm")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightLowerArm", value))} />
                      <ComposerRotationVectorRange label="R Hand" value={composerRotationVector(selectedObject, "rightHandRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightHandRot", value, false))} />
                      <ComposerRotationVectorRange label="Hips" value={composerRotationVector(selectedObject, "hipsRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("hipsRot", value, false))} />
                      <ComposerRotationVectorRange label="L Upper Leg" value={composerRotationVector(selectedObject, "leftUpperLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftUpperLeg", value))} />
                      <ComposerRotationVectorRange label="L Lower Leg" value={composerRotationVector(selectedObject, "leftLowerLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftLowerLeg", value))} />
                      <ComposerRotationVectorRange label="L Foot" value={composerRotationVector(selectedObject, "leftFootRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("leftFootRot", value, false))} />
                      <ComposerRotationVectorRange label="R Upper Leg" value={composerRotationVector(selectedObject, "rightUpperLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightUpperLeg", value))} />
                      <ComposerRotationVectorRange label="R Lower Leg" value={composerRotationVector(selectedObject, "rightLowerLeg")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightLowerLeg", value))} />
                      <ComposerRotationVectorRange label="R Foot" value={composerRotationVector(selectedObject, "rightFootRot")} onChange={(value) => patchSelected(composerRotationVectorPatch("rightFootRot", value, false))} />
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <ComposerVectorRange label="Location" value={{ x: selectedObject.x, y: selectedObject.y, z: selectedObject.z }} step="0.05" onChange={(value) => patchSelected({ x: value.x, y: value.y, z: value.z })} />
                  <ComposerRotationVectorRange label="Rotation" value={{ x: degreesToRadians(finiteNumber(selectedObject.rotX, 0)), y: degreesToRadians(finiteNumber(selectedObject.rotY, 0)), z: degreesToRadians(finiteNumber(selectedObject.rotZ, 0)) }} onChange={(value) => patchSelected({ rotX: radiansToDegrees(value.x), rotY: radiansToDegrees(value.y), rotZ: radiansToDegrees(value.z) })} />
                  <ComposerRange label="Scale" step="0.05" value={selectedObject.scale} onChange={(value) => patchSelected({ scale: value })} />

                  {selectedKind === "prop" ? (
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
                </>
              )
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
  const degrees = radiansToDegrees(finiteNumber(value, 0));
  return (
    <ComposerRange
      label={label}
      min="-360"
      max="360"
      step="1"
      value={degrees}
      onChange={(nextDegrees) => onChange(degreesToRadians(nextDegrees))}
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
    x: radiansToDegrees(finiteNumber(value?.x, 0)),
    y: radiansToDegrees(finiteNumber(value?.y, 0)),
    z: radiansToDegrees(finiteNumber(value?.z, 0))
  };
  const patchAxis = (axis) => (nextDegrees) => {
    onChange({
      ...value,
      [axis]: degreesToRadians(nextDegrees)
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
  onOutputImport,
  onTransferImagesUpload,
  onTransferOutputImport,
  onTransferImageRemove,
  onTransferActivate,
  onTransferUnlock,
  onCharacterPortraitUpload,
  onCharacterPortraitImport,
  onCharacterWardrobesUpload,
  onCharacterWardrobeImport,
  onCharacterVoicesUpload,
  onCharacterWardrobeRemove,
  onCharacterVoiceRemove,
  onCharacterActivate,
  onCharacterUnlock,
  onStoryboardPlan,
  onStoryboardGenerateAll,
  onStoryboardGenerateFrame,
  onStoryboardExport,
  onStoryboardLock,
  onStoryboardCharacterUpload,
  onStoryboardCharacterImport,
  onStoryboardCharacterUpdate,
  onStoryboardCharacterRemove,
  onUndoSnapshot,
  onPreviewResizeStart,
  onPreviewOpen,
  onPreviewLayoutExport,
  onOpenComposer,
  onFrameItCapture,
  onCanvasPanStart,
  incomingByNode,
  transferCompiling,
  imageModelOptions,
  videoModelOptions
}) {
  const config = getNodeConfig(node.type);
  const outputPort = config.output[0];
  const resolvedPromptText = (items = []) => connectedText(items);

  React.useEffect(() => {
    if (node.type !== "preview" || node.data.previewTab !== "layout") return;
    const previewSources = connectedPreviewSources(incoming.sourceIn || []);
    const { source } = previewSelectionForNode(node, previewSources);
    const currentItems = normalizedPreviewLayoutItems(node.data.previewLayoutItems);
    const hiddenUrls = normalizedPreviewLayoutHiddenUrls(node.data.previewLayoutHiddenUrls);
    const nextItems = mergePreviewImagesIntoLayout(currentItems, previewLayoutSourceItems(source), hiddenUrls);
    if (samePreviewLayoutItems(currentItems, nextItems)) return;
    onUpdate(node.id, { previewLayoutItems: nextItems });
  }, [incoming.sourceIn, node, onUpdate]);

  if (node.type === "plainText") {
    return (
      <PlainTextNodeBody
        node={node}
        outputPort={outputPort}
        onUpdate={onUpdate}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    );
  }

  if (node.type === "text") {
    return (
      <TextModelNodeBody
        node={node}
        config={config}
        outputPort={outputPort}
        incoming={incoming}
        onUpdate={onUpdate}
        onRun={onRun}
        running={running}
        sourceLabel={sourceLabel}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    );
  }

  if (node.type === "skillDirector") {
    return (
      <SkillDirectorNodeBody
        node={node}
        config={config}
        outputPort={outputPort}
        incoming={incoming}
        onUpdate={onUpdate}
        onRun={onRun}
        running={running}
        sourceLabel={sourceLabel}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    );
  }

  if (node.type === "image" || node.type === "video" || node.type === "audio") {
    return (
      <MediaAssetNodeBody
        node={node}
        outputPort={outputPort}
        onUpload={onUpload}
        onOutputImport={onOutputImport}
        onPreviewOpen={onPreviewOpen}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    );
  }

  if (node.type === "composer") {
    const imageOutputPort = config.output.find((port) => port.id === "imageOut");
    const imageInputPort = config.input.find((port) => port.id === "imageIn");
    const characterInputPorts = composerCharacterInputPortsForNode(node);
    const composerInputPorts = [imageInputPort, ...characterInputPorts].filter(Boolean);

    return (
      <ComposerNodeBody
        node={node}
        imageOutputPort={imageOutputPort}
        composerInputPorts={composerInputPorts}
        onOpenComposer={onOpenComposer}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    );
  }

  if (node.type === "frameIt") {
    return (
      <FrameItNodeBody
        node={node}
        outputPort={{
          ...outputPort,
          disabled: !node.data.resultUrl,
          disabledReason: "Capture the Frame It view before connecting it"
        }}
        onUpdate={onUpdate}
        onCapture={onFrameItCapture}
        onCanvasPanStart={onCanvasPanStart}
        onUndoSnapshot={onUndoSnapshot}
        onResizeStart={onPreviewResizeStart}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />
    );
  }

  if (node.type === "character") {
    const portrait = node.data.characterPortrait;
    const customSheet = node.data.customCharacterSheet;
    const useCustomSheet = Boolean(node.data.useCustomCharacterSheet);
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
    const characterResultItems = normalizedResultItems(node.data.resultItems, node.data.resultUrl, "image");
    const characterResultIndex = Math.min(
      Math.max(Number(node.data.selectedResultIndex) || 0, 0),
      Math.max(characterResultItems.length - 1, 0)
    );
    const characterSheetItem = characterResultItems[characterResultIndex] || null;
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
      const outputItem = outputItemFromDataTransfer(event.dataTransfer) || currentDraggedOutputItem();
      if (outputItem && zone === "portrait") {
        onCharacterPortraitImport?.(node, outputItem);
        return;
      }
      if (outputItem && zone === "customSheet") {
        onCharacterPortraitImport?.(node, outputItem, "customSheet");
        return;
      }
      if (outputItem && zone === "wardrobe") {
        onCharacterWardrobeImport?.(node, outputItem);
        return;
      }
      if (zone === "portrait") {
        const file = firstAcceptedFile(event.dataTransfer.files, "image");
        if (file) onCharacterPortraitUpload(node, file);
        return;
      }
      if (zone === "customSheet") {
        const file = firstAcceptedFile(event.dataTransfer.files, "image");
        if (file) onCharacterPortraitUpload(node, file, "customSheet");
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
                    <img src={previewImageUrl(portrait)} alt="Character portrait" loading="lazy" decoding="async" />
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
                          <img src={previewImageUrl(wardrobe)} alt={wardrobe.fileName || "Wardrobe"} loading="lazy" decoding="async" />
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
                <label className="character-section character-option-row">
                  <input
                    type="checkbox"
                    checked={Boolean(node.data.cinematicCharacterSheet)}
                    disabled={compiling || locked || useCustomSheet}
                    onChange={(event) => onUpdate(node.id, { cinematicCharacterSheet: event.target.checked })}
                  />
                  <span>
                    <strong>Cinematic Sheet</strong>
                    <small>Natural skin texture and film-quality realism</small>
                  </span>
                </label>
                <label className="character-section character-option-row">
                  <input
                    type="checkbox"
                    checked={useCustomSheet}
                    disabled={compiling || locked}
                    onChange={(event) => onUpdate(node.id, { useCustomCharacterSheet: event.target.checked })}
                  />
                  <span>
                    <strong>Use Custom Sheet</strong>
                    <small>Override generation with your own completed character sheet</small>
                  </span>
                </label>
                {useCustomSheet && (
                  <section
                    className={`character-section character-custom-sheet drop-enabled ${customSheet?.localUrl ? "has-image" : ""}`}
                    onDragOver={allowFileDrop}
                    onDrop={(event) => handleCharacterDrop(event, "customSheet")}
                  >
                    <div className="character-section-head">
                      <span className="character-section-label">Custom Character Sheet</span>
                      {customSheet?.localUrl && !locked && (
                        <button
                          type="button"
                          className="character-add-button"
                          title="Remove custom character sheet"
                          onClick={() => {
                            onUndoSnapshot?.();
                            onUpdate(node.id, { customCharacterSheet: null });
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <label className="character-custom-sheet-upload" title={customSheet?.localUrl ? "Replace custom character sheet" : "Upload custom character sheet"}>
                      {customSheet?.localUrl ? (
                        <img src={previewImageUrl(customSheet)} alt="Custom character sheet" loading="lazy" decoding="async" />
                      ) : (
                        <>
                          <ImagePlus size={20} />
                          <span>Drop or upload a completed sheet</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={compiling || locked}
                        onChange={(event) => onCharacterPortraitUpload(node, event.target.files?.[0], "customSheet")}
                      />
                    </label>
                  </section>
                )}
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
                    ? useCustomSheet
                      ? `Custom character sheet ready. @${characterTag(node)} uses the uploaded override.`
                      : `${variantCount} outfit sheet${variantCount === 1 ? "" : "s"} ready. @${characterTag(node)} uses the selected outfit.`
                    : useCustomSheet
                      ? customSheet?.localUrl
                        ? "Custom character sheet will be used on lock."
                        : "Upload a completed custom character sheet."
                    : `${targetVariantCount} outfit sheet${targetVariantCount === 1 ? "" : "s"} will generate on lock.`}
              </span>
              <button
                className={`style-lock-button ${locked ? "locked" : ""}`}
                type="button"
                disabled={compiling || (!locked && (!(useCustomSheet ? customSheet?.localUrl : portrait?.localUrl) || !String(node.data.characterName || "").trim()))}
                onClick={() => (locked ? onCharacterUnlock(node.id) : onCharacterActivate(node))}
                title={locked ? "Unlock character" : useCustomSheet ? "Lock custom character sheet" : `Generate and lock ${targetVariantCount} outfit sheet${targetVariantCount === 1 ? "" : "s"}`}
              >
                {compiling ? "Generating..." : locked ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
            </div>
          </section>
        ) : (
          <section className="character-sheet-view">
            {characterSheetItem?.url ? (
              <div
                className="character-sheet-drag-source"
                draggable
                onPointerDown={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  event.stopPropagation();
                  setOutputItemDragData(event.dataTransfer, {
                    ...characterSheetItem,
                    id: characterSheetItem.id || `character-sheet:${node.id}:${characterSheetItem.url}`,
                    url: characterSheetItem.url,
                    type: "image",
                    label: characterSheetItem.label || `@${characterTag(node)} Character Sheet`,
                    fileName: characterSheetItem.fileName || fileNameFromLocalUrl(characterSheetItem.url),
                    mimeType: characterSheetItem.mimeType || mimeForOutputItem({ url: characterSheetItem.url, type: "image" })
                  }, outputDragMime);
                }}
                onDragEnd={(event) => finishOutputItemDragData(characterSheetItem, event)}
                title="Drag the full-resolution character sheet into another node"
              >
                <img src={previewImageUrl(characterSheetItem)} alt={`${node.data.characterName || "Character"} sheet`} draggable={false} loading="lazy" decoding="async" />
              </div>
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

  if (node.type === "storyboard") {
    const frames = normalizedStoryboardFrames(node.data.storyboardFrames);
    const storedStoryboardTab = ["setup", "view", "advanced"].includes(node.data.storyboardTab) ? node.data.storyboardTab : "setup";
    const selectedFrame = frames.find((frame) => frame.id === node.data.selectedFrameId) || frames[0];
    const preparingCharacters = node.data.status === "compiling-characters";
    const compilingStoryboardBoard = node.data.status === "compiling-board";
    const runningStoryboard = node.data.status === "running" || preparingCharacters;
    const planningStoryboard = node.data.status === "planning";
    const exportingStoryboard = node.data.status === "exporting";
    const exportingStoryboardFrames = exportingStoryboard && node.data.storyboardExportMode === "frames";
    const exportingStoryboardPdf = exportingStoryboard && !exportingStoryboardFrames;
    const storyboardLocked = planningStoryboard || runningStoryboard || exportingStoryboard || compilingStoryboardBoard;
    const activeTab = runningStoryboard || exportingStoryboard || compilingStoryboardBoard ? "view" : storedStoryboardTab;
    const completedStoryboardFrameCount = frames.filter((frame) => frame.exportUrl || frame.resultUrl).length;
    const storyboardBoardLocked = Boolean(node.data.storyboardBoardUrl);
    const storyboardBoardOutputPort = outputPortDefinitionsForNode(node).find((port) => port.id === storyboardBoardOutputPortId);
    const directorPort = config.input.find((port) => port.id === "directorIn");
    const sceneDescriptionPort = config.input.find((port) => port.id === "sceneDescriptionIn");
    const sceneReferencePort = config.input.find((port) => port.id === "sceneReferenceIn");
    const stylePort = config.input.find((port) => port.id === "styleIn");
    const transferPort = config.input.find((port) => port.id === "transferIn");
    const characterPort = config.input.find((port) => port.id === "characterIn");
    const storyboardIncoming = expandStoryboardDirectorIncoming(incoming, incomingByNode);
    const directorSource = connectedDirectorPackageSource(incoming.directorIn || []);
    const connectedSceneDescription = connectedText(storyboardIncoming.sceneDescriptionIn || []);
    const directorConnected = Boolean(incoming.directorIn?.length);
    const directorControlsScene = Boolean(directorSource);
    const directorFrameCount = directorControlsScene ? directorPackageShotCount(directorSource) : 0;
    const directorDisabledReason = "Film Director is controlling this storyboard";
    const sceneDescriptionConnected = Boolean(connectedSceneDescription.trim());
    const sceneDescription = storyboardSceneDescriptionForNode(node, storyboardIncoming);
    const storyboardPlanCurrent = storyboardPlanIsCurrent(node, sceneDescription);
    const storyboardCharacters = normalizedStoryboardCharacters(node.data.storyboardCharacters);
    const storyboardStyleEnabled = node.data.useStoryboardStyle !== false;
    const internalCharactersEnabled = !directorControlsScene && storyboardUsesInternalCharacters(node);
    const sceneCharacterTagMatches = storyboardSceneTagMatches(sceneDescription, node, storyboardIncoming, incomingByNode);
    const customInputReason = "Disable Storyboard Style to connect custom nodes";
    const customInputDisabled = storyboardLocked || storyboardStyleEnabled;
    const customInputDisabledReason = storyboardLocked ? "Storyboard is generating" : customInputReason;
    const sceneDescriptionInputPort = sceneDescriptionPort ? { ...sceneDescriptionPort, disabled: storyboardLocked || directorControlsScene, disabledReason: storyboardLocked ? "Storyboard is generating" : directorDisabledReason } : null;
    const sceneReferenceInputPort = sceneReferencePort ? { ...sceneReferencePort, disabled: storyboardLocked || directorControlsScene, disabledReason: storyboardLocked ? "Storyboard is generating" : directorDisabledReason } : null;
    const directorInputPort = directorPort ? { ...directorPort, disabled: storyboardLocked, disabledReason: "Storyboard is generating" } : null;
    const customStylePort = stylePort ? { ...stylePort, disabled: customInputDisabled, disabledReason: customInputDisabledReason } : null;
    const customTransferPort = transferPort ? { ...transferPort, disabled: customInputDisabled, disabledReason: customInputDisabledReason } : null;
    const customCharacterPort = characterPort ? { ...characterPort, disabled: customInputDisabled || directorControlsScene, disabledReason: directorControlsScene ? directorDisabledReason : customInputDisabledReason } : null;
    const storyboardAspectRatio = storyboardAspectRatioForNode(node);
    const storyboardAspectKey = storyboardAspectRatio.replace(":", "x");
    const storyboardFrameAspectStyle = { "--storyboard-frame-aspect": storyboardCssAspectRatio(storyboardAspectRatio) };
    const frameCountValue = directorControlsScene && directorFrameCount ? String(directorFrameCount) : normalizeStoryboardFrameCountValue(node.data.frameCount);
    const frameCountMode = directorControlsScene || frameCountValue !== storyboardAutoFrameCount ? "Custom" : storyboardAutoFrameCount;
    const customFrameCountValue = frameCountMode === "Custom" ? frameCountValue : "";
    const displayedSceneName = directorControlsScene
      ? directorSource?.data?.sceneName || node.data.sceneName || "Film Director Scene"
      : node.data.sceneName || "";

    function updateFrame(frameId, patch) {
      if (storyboardLocked) return;
      const nextFrames = frames.map((frame) => (frame.id === frameId ? { ...frame, ...patch } : frame));
      onUpdate(node.id, {
        ...clearStoryboardBoardPatch(),
        storyboardFrames: nextFrames,
        selectedFrameId: frameId,
        resultItems: storyboardResultItems(nextFrames),
        resultUrl: nextFrames.find((frame) => frame.id === frameId)?.resultUrl || node.data.resultUrl || ""
      });
    }

    function addFrame() {
      if (storyboardLocked) return;
      if (frames.length >= storyboardMaxFrameCount) return;
      const nextFrames = [...frames, createStoryboardFrame(frames.length + 1)];
      onUndoSnapshot?.();
      onUpdate(node.id, { ...clearStoryboardBoardPatch(), storyboardFrames: nextFrames, selectedFrameId: nextFrames.at(-1).id, storyboardTab: "view" });
    }

    function removeFrame(frameId) {
      if (storyboardLocked) return;
      if (frames.length <= 1) return;
      const nextFrames = normalizedStoryboardFrames(frames.filter((frame) => frame.id !== frameId));
      onUndoSnapshot?.();
      onUpdate(node.id, {
        ...clearStoryboardBoardPatch(),
        storyboardFrames: nextFrames,
        selectedFrameId: nextFrames[0]?.id || "",
        resultItems: storyboardResultItems(nextFrames),
        resultUrl: nextFrames.find((frame) => frame.resultUrl)?.resultUrl || ""
      });
    }

    function moveFrame(fromId, toId) {
      if (storyboardLocked) return;
      if (!fromId || !toId || fromId === toId) return;
      const fromIndex = frames.findIndex((frame) => frame.id === fromId);
      const toIndex = frames.findIndex((frame) => frame.id === toId);
      if (fromIndex < 0 || toIndex < 0) return;
      const nextFrames = [...frames];
      const [moved] = nextFrames.splice(fromIndex, 1);
      nextFrames.splice(toIndex, 0, moved);
      onUndoSnapshot?.();
      onUpdate(node.id, { ...clearStoryboardBoardPatch(), storyboardFrames: normalizedStoryboardFrames(nextFrames), selectedFrameId: fromId });
    }

    function handleFrameDrop(event, frameId) {
      event.preventDefault();
      event.stopPropagation();
      if (storyboardLocked) return;

      const sourceFrameId = event.dataTransfer.getData("application/x-storyboard-frame-id");
      if (sourceFrameId) {
        moveFrame(sourceFrameId, frameId);
        return;
      }

      const outputItem = outputItemFromDataTransfer(event.dataTransfer);
      if (outputItem?.type === "image") {
        onStoryboardFrameImport?.(node, frameId, { outputItem });
        return;
      }

      const file = firstAcceptedFile(event.dataTransfer.files, "image");
      if (file) {
        onStoryboardFrameImport?.(node, frameId, { file });
        return;
      }
    }

    function handleFrameDragOver(event) {
      const types = Array.from(event.dataTransfer?.types || []);
      const frameDrop = types.includes("application/x-storyboard-frame-id");
      const draggedOutputItem = currentDraggedOutputItem();
      const imageDrop =
        types.includes(outputDragMime) ||
        types.includes("text/uri-list") ||
        types.includes("text/plain") ||
        types.includes("DownloadURL") ||
        types.includes("text/html") ||
        types.includes("Files") ||
        draggedOutputItem?.type === "image";
      if (!imageDrop && !frameDrop) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = frameDrop ? "move" : "copy";
    }

    function openStoryboardFrame(frame, event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (storyboardLocked) return;
      const url = frame.exportUrl || frame.resultUrl || "";
      if (!url) return;
      onPreviewOpen?.({
        url,
        type: "image",
        label: `Frame ${String(frame.number || 1).padStart(3, "0")}`,
        text: frame.prompt || "",
        fileName: frame.fileName || fileNameFromLocalUrl(url),
        mimeType: mimeForOutputItem({ url, type: "image" }),
        editContext: {
          type: "storyboardFrame",
          nodeId: node.id,
          itemId: frame.id
        }
      });
    }

    function storyboardFrameOutputItem(frame) {
      const url = frame.exportUrl || frame.resultUrl || "";
      if (!url) return null;
      return {
        id: `storyboard:${node.id}:${frame.id}`,
        url,
        type: "image",
        label: `Frame ${String(frame.number || 1).padStart(3, "0")}`,
        fileName: frame.fileName || fileNameFromLocalUrl(url),
        mimeType: frame.mimeType || mimeForOutputItem({ url, type: "image" })
      };
    }

    function handleCharacterDrop(event) {
      allowFileDrop(event);
      if (storyboardLocked || !internalCharactersEnabled) return;
      const outputItem = outputItemFromDataTransfer(event.dataTransfer);
      if (outputItem?.type === "image") {
        onStoryboardCharacterImport?.(node, outputItem);
        return;
      }
      const file = firstAcceptedFile(event.dataTransfer.files, "image");
      if (file) onStoryboardCharacterUpload?.(node, file);
    }

    return (
      <div className={`node-body storyboard-node-body ${storyboardLocked ? "is-rendering" : ""}`}>
        <div className="storyboard-topbar">
          <div className="character-tabs" role="tablist" aria-label="Storyboard views">
            <button type="button" role="tab" aria-selected={activeTab === "setup"} className={activeTab === "setup" ? "active" : ""} disabled={storyboardLocked} onClick={() => onUpdate(node.id, { storyboardTab: "setup" })}>
              Storyboard Setup
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "view"} className={activeTab === "view" ? "active" : ""} disabled={storyboardLocked} onClick={() => onUpdate(node.id, { storyboardTab: "view" })}>
              Storyboard View
            </button>
            <button type="button" role="tab" aria-selected={activeTab === "advanced"} className={activeTab === "advanced" ? "active" : ""} disabled={storyboardLocked} onClick={() => onUpdate(node.id, { storyboardTab: "advanced" })}>
              Advanced
            </button>
          </div>
          <div className="storyboard-actions">
            <button type="button" onClick={() => onStoryboardPlan?.(node)} disabled={planningStoryboard || runningStoryboard || !sceneDescription.trim()}>
              {planningStoryboard ? "Planning..." : "Plan"}
            </button>
            {storyboardBoardLocked && (
              <>
                <button type="button" onClick={() => onStoryboardExport?.(node, "frames")} disabled={storyboardLocked} title="Export locked storyboard frames as image files">
                  {exportingStoryboardFrames ? <Loader2 size={14} className="spin" /> : <FileImage size={14} />}
                  <span>{exportingStoryboardFrames ? "Exporting" : "Export Frames"}</span>
                </button>
                <button type="button" onClick={() => onStoryboardExport?.(node, "pdf")} disabled={storyboardLocked} title="Export locked storyboard as a PDF">
                  {exportingStoryboardPdf ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  <span>{exportingStoryboardPdf ? "Exporting" : "Export PDF"}</span>
                </button>
              </>
            )}
            {(preparingCharacters || exportingStoryboard || compilingStoryboardBoard) && (
              <span className="storyboard-action-busy" title={preparingCharacters ? "Generating character sheets" : compilingStoryboardBoard ? "Locking storyboard board" : "Exporting storyboard boards"}>
                <Loader2 size={15} />
              </span>
            )}
            <button type="button" className="primary" onClick={() => onStoryboardGenerateAll?.(node)} disabled={runningStoryboard || planningStoryboard || !sceneDescription.trim() || !storyboardPlanCurrent} title={!storyboardPlanCurrent && sceneDescription.trim() ? "Plan frames after changing the scene description" : "Generate storyboard frames"}>
              {preparingCharacters ? "Preparing..." : runningStoryboard ? "Generating..." : "Generate"}
            </button>
            {activeTab === "view" && (
              <>
                <button type="button" className={`icon-only storyboard-board-lock ${storyboardBoardLocked ? "locked" : ""}`} onClick={() => onStoryboardLock?.(node)} disabled={storyboardLocked || !completedStoryboardFrameCount} title={storyboardBoardLocked ? "Rebuild the locked storyboard board" : "Lock the current storyboard into one image output"} aria-label={storyboardBoardLocked ? "Storyboard board locked" : "Lock storyboard board"} aria-pressed={storyboardBoardLocked}>
                  {compilingStoryboardBoard ? <Loader2 size={15} className="spin" /> : storyboardBoardLocked ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
                {storyboardBoardOutputPort && (
                  <span className="storyboard-action-output" title={node.data.storyboardBoardUrl ? "Connect storyboard output" : "Lock board to enable output"}>
                    <PortHandle node={node} port={storyboardBoardOutputPort} side="output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
                  </span>
                )}
                <button type="button" className="icon-only" onClick={addFrame} disabled={storyboardLocked || frames.length >= storyboardMaxFrameCount} title="Add frame">
                  <Plus size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {activeTab === "setup" ? (
          <section className="storyboard-setup storyboard-scroll-surface">
            <div className="storyboard-setup-grid">
              <label className="storyboard-scene-field">
                <span>Scene Description</span>
                <TaggedPromptTextarea
                  className="storyboard-tagged-editor"
                  value={sceneDescription}
                  placeholder={directorConnected ? "Connected Film Director plan" : sceneDescriptionConnected ? "Connected scene description" : "Describe the scene, action, location, and story beat."}
                  tagMatches={sceneCharacterTagMatches}
                  readOnly={storyboardLocked || sceneDescriptionConnected || directorConnected}
                  onChange={(event) => onUpdate(node.id, {
                    sceneDescription: event.target.value,
                    storyboardPlanSceneDescription: "",
                    storyboardAnalysis: ""
                  })}
                />
              </label>
              <div className="storyboard-settings-grid">
                <NodeRow label="Scene">
                  <input value={displayedSceneName} placeholder="Scene 1" disabled={storyboardLocked || directorControlsScene} onChange={(event) => onUpdate(node.id, { sceneName: event.target.value })} />
                </NodeRow>
                <NodeRow label="Frames">
                  <div className="storyboard-frame-count-control">
                    <select
                      value={frameCountMode}
                      disabled={storyboardLocked || directorControlsScene}
                      onChange={(event) => {
                        if (event.target.value === storyboardAutoFrameCount) {
                          onUpdate(node.id, { frameCount: storyboardAutoFrameCount });
                        } else {
                          onUpdate(node.id, { frameCount: String(storyboardFrameCountForNode(node, storyboardIncoming)) });
                        }
                      }}
                    >
                      <option value={storyboardAutoFrameCount}>Auto</option>
                      <option value="Custom">Custom</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      max={storyboardMaxFrameCount}
                      step="1"
                      value={customFrameCountValue}
                      placeholder={`1-${storyboardMaxFrameCount}`}
                      disabled={storyboardLocked || directorControlsScene || frameCountMode === storyboardAutoFrameCount}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        const nextCount = Number.isFinite(parsed) ? Math.min(storyboardMaxFrameCount, Math.max(1, parsed)) : storyboardDefaultFrameCount;
                        onUpdate(node.id, { frameCount: String(nextCount) });
                      }}
                    />
                  </div>
                </NodeRow>
                <NodeRow label="Film Director" inputPort={directorInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button type="button" className={directorConnected ? "connected-field" : ""} disabled={storyboardLocked}>
                    {connectedSummary(incoming.directorIn, "Optional Film Director")}
                  </button>
                </NodeRow>
                <NodeRow label="Scene Text" inputPort={sceneDescriptionInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button type="button" className={sceneDescriptionConnected ? "connected-field" : ""} disabled={storyboardLocked || directorControlsScene}>
                    {directorControlsScene ? "From Film Director" : sceneDescriptionConnected ? connectedSummary(incoming.sceneDescriptionIn, "Connected text") : "Optional Description"}
                  </button>
                </NodeRow>
                <NodeRow label="Scene Reference" inputPort={sceneReferenceInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button type="button" className={storyboardIncoming.sceneReferenceIn?.length ? "connected-field" : ""} disabled={storyboardLocked || directorControlsScene}>
                    {directorControlsScene ? connectedSummary(storyboardIncoming.sceneReferenceIn, "From Film Director") : connectedSummary(incoming.sceneReferenceIn, "Optional image")}
                  </button>
                </NodeRow>
              </div>
            </div>
            <section className={`storyboard-character-zone ${internalCharactersEnabled ? "" : "disabled"}`} onDragOver={allowFileDrop} onDrop={handleCharacterDrop}>
              <div className="storyboard-character-head">
                <span>Characters</span>
                {internalCharactersEnabled && !storyboardLocked && storyboardCharacters.length < storyboardMaxCharacters && (
                  <label className="storyboard-add-character" title="Upload character image">
                    <Plus size={14} />
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onStoryboardCharacterUpload?.(node, event.target.files?.[0])} />
                  </label>
                )}
              </div>
              <div className="storyboard-character-strip">
                {internalCharactersEnabled ? (
                  storyboardCharacters.length ? storyboardCharacters.map((character) => (
                    <div className={`storyboard-character-card ${character.sheetUrl ? "ready" : ""} ${character.status === "error" ? "error" : ""}`} key={character.id}>
                      <div className="storyboard-character-thumb">
                        {character.portrait?.localUrl ? <img src={previewImageUrl(character.portrait)} alt={character.name || "Storyboard character"} loading="lazy" decoding="async" /> : <UserRound size={20} />}
                      </div>
                      <div className="storyboard-character-name-row">
                        <input value={character.name || ""} placeholder="Name becomes @Name" disabled={storyboardLocked} onChange={(event) => onStoryboardCharacterUpdate?.(node.id, character.id, { name: event.target.value, error: "", status: character.status === "error" ? "ready" : character.status })} />
                        <div className="storyboard-character-meta-row">
                          {character.name ? <span className="storyboard-character-tag-preview">@{storyboardCharacterTag(character)}</span> : <span className="storyboard-character-tag-example">Example: @Researcher</span>}
                          {character.sheetUrl && <span className="storyboard-character-ready">Sheet ready</span>}
                        </div>
                      </div>
                      <button type="button" className="storyboard-character-remove" onClick={() => onStoryboardCharacterRemove?.(node.id, character.id)} disabled={storyboardLocked} title="Remove character">
                        <X size={12} />
                      </button>
                      {character.status === "compiling" && !character.sheetUrl && <small>Building sheet...</small>}
                      {character.error && <small className="upload-error">{character.error}</small>}
                    </div>
                  )) : (
                    <div className="storyboard-character-empty">Drag to upload a headshot of any character consistency needed in the scene</div>
                  )
                ) : (
                  <div className="storyboard-character-empty">{directorControlsScene ? connectedSummary(storyboardIncoming.characterIn, "Using Film Director character inputs") : "Internal characters disabled in Advanced"}</div>
                )}
              </div>
            </section>
            <div className="storyboard-mood-row compact">
              <label className="storyboard-notes-field">
                <span>Planning Notes</span>
                <textarea value={directorControlsScene ? "" : node.data.storyboardNotes || ""} placeholder={directorControlsScene ? "Using Film Director scene rules" : "Optional scene rules"} disabled={storyboardLocked || directorControlsScene} onChange={(event) => onUpdate(node.id, { storyboardNotes: event.target.value })} />
              </label>
            </div>
            {node.data.storyboardAnalysis && <p className="storyboard-analysis">{node.data.storyboardAnalysis}</p>}
          </section>
        ) : activeTab === "advanced" ? (
          <section className="storyboard-advanced storyboard-scroll-surface">
            <div className="storyboard-advanced-panel">
              <div className="storyboard-advanced-controls">
                <div className="storyboard-style-master-row">
                  <span>Storyboard Style</span>
                  <button
                    type="button"
                    className={`storyboard-master-toggle ${storyboardStyleEnabled ? "enabled" : ""}`}
                    disabled={storyboardLocked}
                    onClick={() => {
                      const nextEnabled = !storyboardStyleEnabled;
                      onUpdate(node.id, {
                        useStoryboardStyle: nextEnabled,
                        useMoodBoard: nextEnabled,
                        useInternalStoryboardCharacters: nextEnabled
                      });
                    }}
                    aria-pressed={storyboardStyleEnabled}
                    title={storyboardStyleEnabled ? "Storyboard Style enabled" : "Storyboard Style disabled"}
                  >
                    <span />
                  </button>
                  <small>Disable Storyboard Style for access to custom node inputs for style, mood board and character.</small>
                </div>
                <NodeRow label="Resolution">
                  <select value={storyboardResolutionForNode(node)} disabled={storyboardLocked} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                    {imageResolutionOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </NodeRow>
                <NodeRow label="Aspect Ratio">
                  <select value={storyboardAspectRatioForNode(node)} disabled={storyboardLocked} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                    {storyboardAspectRatioOptions.map((ratio) => (
                      <option key={ratio}>{ratio}</option>
                    ))}
                  </select>
                </NodeRow>
                <div className="storyboard-style-master-row">
                  <span>Auto QC</span>
                  <button
                    type="button"
                    className={`storyboard-master-toggle ${node.data.storyboardAutoQc !== false ? "enabled" : ""}`}
                    disabled={storyboardLocked}
                    onClick={() => onUpdate(node.id, { storyboardAutoQc: node.data.storyboardAutoQc === false })}
                    aria-pressed={node.data.storyboardAutoQc !== false}
                    title={node.data.storyboardAutoQc !== false ? "Storyboard QC enabled" : "Storyboard QC disabled"}
                  >
                    <span />
                  </button>
                  <small>Reviews frames, retries obvious physical or continuity errors once, and skips failed frames as anchors.</small>
                </div>
              </div>
              <div className={`storyboard-custom-inputs ${storyboardStyleEnabled ? "disabled" : ""}`}>
                <NodeRow label="Style" inputPort={customStylePort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button type="button" className={incoming.styleIn?.length ? "connected-field" : ""} disabled={storyboardLocked || storyboardStyleEnabled}>
                    {connectedSummary(incoming.styleIn, "Add style")}
                  </button>
                </NodeRow>
                <NodeRow label="Mood Board" inputPort={customTransferPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button type="button" className={incoming.transferIn?.length ? "connected-field" : ""} disabled={storyboardLocked || storyboardStyleEnabled}>
                    {connectedSummary(incoming.transferIn, "Add mood board")}
                  </button>
                </NodeRow>
                <NodeRow label="Character" inputPort={customCharacterPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button type="button" className={incoming.characterIn?.length ? "connected-field" : ""} disabled={storyboardLocked || storyboardStyleEnabled}>
                    {connectedSummary(incoming.characterIn, "Add character")}
                  </button>
                </NodeRow>
              </div>
            </div>
          </section>
        ) : (
          <section className="storyboard-view storyboard-scroll-surface" style={storyboardFrameAspectStyle}>
            <div className="storyboard-frame-grid" data-storyboard-aspect={storyboardAspectKey}>
              {frames.map((frame) => {
                const selected = frame.id === selectedFrame?.id;
                const frameBusy = frame.status === "running" || frame.status === "queued" || frame.status === "reviewing";
                const frameCharacterTagMatches = storyboardSceneTagMatches(frame.prompt || "", node, storyboardIncoming, incomingByNode);
                return (
                  <article
                    key={frame.id}
                    className={`storyboard-frame-card ${selected ? "selected" : ""} ${frame.resultUrl ? "has-result" : ""} ${frameBusy ? "is-busy" : ""}`}
                    data-storyboard-node-id={node.id}
                    data-storyboard-frame-id={frame.id}
                    draggable={!storyboardLocked}
                    onDragStart={(event) => {
                      if (storyboardLocked) {
                        event.preventDefault();
                        return;
                      }
                      event.stopPropagation();
                      const dragItem = storyboardFrameOutputItem(frame);
                      if (dragItem) setOutputItemDragData(event.dataTransfer, dragItem, outputDragMime);
                      event.dataTransfer.effectAllowed = dragItem ? "copyMove" : "move";
                      event.dataTransfer.setData("application/x-storyboard-frame-id", frame.id);
                    }}
                    onDragEnd={() => clearOutputItemDragData(storyboardFrameOutputItem(frame))}
                    onDragOverCapture={handleFrameDragOver}
                    onDropCapture={(event) => handleFrameDrop(event, frame.id)}
                    onDragOver={handleFrameDragOver}
                    onDrop={(event) => handleFrameDrop(event, frame.id)}
                    onClick={() => {
                      if (storyboardLocked) return;
                      onUpdate(node.id, { selectedFrameId: frame.id, resultUrl: frame.resultUrl || node.data.resultUrl });
                    }}
                  >
                    <div
                      className="storyboard-frame-media"
                      data-storyboard-node-id={node.id}
                      data-storyboard-frame-id={frame.id}
                      onDragOver={handleFrameDragOver}
                      onDrop={(event) => handleFrameDrop(event, frame.id)}
                      onDoubleClick={(event) => openStoryboardFrame(frame, event)}
                      title={frame.resultUrl ? "Double-click to edit frame" : undefined}
                    >
                      {frame.resultUrl ? (
                        <img
                          src={storyboardFrameImageSrc(frame)}
                          alt={`Storyboard frame ${frame.number}`}
                          draggable={false}
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            const fallbackSrc = storyboardFrameFallbackSrc(frame);
                            if (fallbackSrc && event.currentTarget.src !== new URL(fallbackSrc, window.location.href).href) {
                              event.currentTarget.src = fallbackSrc;
                            }
                          }}
                        />
                      ) : (
                        <div className="storyboard-frame-empty">
                          <Clapperboard size={22} />
                          <span>Frame {String(frame.number).padStart(2, "0")}</span>
                        </div>
                      )}
                      {frameBusy && (
                        <div className="storyboard-frame-rendering">
                          <Loader2 size={18} />
                          <span>{frame.status === "queued" ? "Queued" : frame.status === "reviewing" ? "Reviewing" : "Rendering"}</span>
                        </div>
                      )}
                      <div className="storyboard-frame-number">
                        <GripVertical size={12} />
                        <span>{String(frame.number).padStart(2, "0")}</span>
                      </div>
                    </div>
                    <div className="storyboard-frame-controls">
                      <select value={frame.shot || "None"} disabled={storyboardLocked} onChange={(event) => updateFrame(frame.id, { shot: event.target.value })}>
                        {shotPresetNames.map((option) => <option key={option}>{option}</option>)}
                      </select>
                      <select value={frame.lens || "None"} disabled={storyboardLocked} onChange={(event) => updateFrame(frame.id, { lens: event.target.value })}>
                        {lensPresetNames.map((option) => <option key={option}>{option}</option>)}
                      </select>
                      <select value={frame.angle || "None"} disabled={storyboardLocked} onChange={(event) => updateFrame(frame.id, { angle: event.target.value })}>
                        {typePresetNames.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </div>
                    <TaggedPromptTextarea
                      className="storyboard-tagged-editor"
                      value={frame.prompt || ""}
                      placeholder="Frame prompt"
                      tagMatches={frameCharacterTagMatches}
                      readOnly={storyboardLocked}
                      onChange={(event) => updateFrame(frame.id, { prompt: event.target.value })}
                    />
                    <div className="storyboard-frame-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); onStoryboardGenerateFrame?.(node, frame.id); }} disabled={storyboardLocked || !sceneDescription.trim() || !storyboardPlanCurrent} title={!storyboardPlanCurrent && sceneDescription.trim() ? "Plan frames after changing the scene description" : "Generate this frame"}>
                        {frame.status === "queued" ? "Queued..." : frame.status === "reviewing" ? "Reviewing..." : frame.status === "running" ? "Running..." : "Run"}
                      </button>
                      <button type="button" className="icon-only" onClick={(event) => { event.stopPropagation(); removeFrame(frame.id); }} disabled={frames.length <= 1 || storyboardLocked}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {frame.qcWarning && <small className="upload-error">{frame.qcWarning}</small>}
                    {frame.error && <small className="upload-error">{frame.error}</small>}
                  </article>
                );
              })}
            </div>
            {node.data.storyboardExport && (
              <div className="storyboard-export-status">
                <Download size={13} />
                <span>
                  {node.data.storyboardExport.pdf
                    ? `Exported PDF to ${node.data.storyboardExport.folderPath || node.data.storyboardExport.folderName || "final boards"}`
                    : `Exported ${node.data.storyboardExport.frameCount || 0} frame${node.data.storyboardExport.frameCount === 1 ? "" : "s"} to ${node.data.storyboardExport.folderPath || node.data.storyboardExport.folderName || "final boards"}`}
                </span>
              </div>
            )}
          </section>
        )}
        {node.data.error && <small className="upload-error storyboard-error">{node.data.error}</small>}
        <button className="preview-resize-handle storyboard-resize-handle" onPointerDown={(event) => onPreviewResizeStart(event, node, "storyboardScale")} title="Resize storyboard" />
      </div>
    );
  }

  if (node.type === "camera") {
    const cameraSelected = hasCameraPreset(node);
    const cameraOutputPort = config.output.find((port) => port.id === "cameraOut");
    return (
      <div className="node-body style-only-node-body camera-node-body">
        {cameraSelected ? (
          <OutputPortRow node={node} port={cameraOutputPort} label={cameraLabel(node)} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        ) : (
          <div className="style-output-placeholder">Choose camera preset to enable output</div>
        )}

        <div className="style-preset-row">
          <span>Shot</span>
          <select value={node.data.shotPreset || "None"} onChange={(event) => onUpdate(node.id, { shotPreset: event.target.value })}>
            {shotPresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>
        <div className="style-preset-row">
          <span>Lens</span>
          <select value={node.data.lensPreset || "None"} onChange={(event) => onUpdate(node.id, { lensPreset: event.target.value })}>
            {lensPresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>
        <div className="style-preset-row">
          <span>Type</span>
          <select value={node.data.typePreset || "None"} onChange={(event) => onUpdate(node.id, { typePreset: event.target.value })}>
            {typePresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>
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
          onDropOutput={(item) => onTransferOutputImport?.(node, item)}
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
    const customPaletteSelected = selectedPreset === "Custom Palette";
    const paletteColors = normalizedCustomPaletteColors(node.data);
    const styleSelected = styleOutputEnabled(node.data);

    async function handlePaletteImageUpload(files) {
      const file = firstAcceptedFile(files, "image");
      if (!file) return;
      onUndoSnapshot?.();
      onUpdate(node.id, {
        customPaletteStatus: "extracting",
        customPaletteError: "",
        customPaletteSourceName: file.name,
        customPalettePreviewUrl: "",
        customPaletteColors: [],
        customPaletteRgbText: ""
      });
      try {
        const extracted = await extractCustomPaletteFromFile(file);
        const firstExtractedColor = extracted.colors?.[0]?.hex;
        onUpdate(node.id, {
          customPaletteStatus: "",
          customPaletteError: "",
          customPaletteSourceName: file.name,
          customPalettePreviewUrl: extracted.previewUrl,
          customPaletteColors: extracted.colors,
          customPaletteRgbText: "",
          customPalettePicker: firstExtractedColor || node.data.customPalettePicker || "#ddc631"
        });
      } catch (error) {
        onUpdate(node.id, {
          customPaletteStatus: "",
          customPaletteError: error.message || "Could not extract palette from image."
        });
      }
    }

    function handlePaletteDrop(event) {
      allowFileDrop(event);
      handlePaletteImageUpload(event.dataTransfer.files);
    }

    function addPickerColor() {
      const pickerColor = node.data.customPalettePicker || "#ddc631";
      const nextColors = uniqueCustomPaletteColors([...paletteColors, customPaletteColorFromHex(pickerColor)]).slice(0, 10);
      const colorAlreadyApplied = nextColors.length === paletteColors.length && nextColors.every((color, index) => color.hex === paletteColors[index]?.hex);
      if (colorAlreadyApplied) return;
      onUndoSnapshot?.();
      onUpdate(node.id, {
        customPaletteColors: nextColors,
        customPaletteRgbText: "",
        customPalettePicker: pickerColor,
        customPaletteError: ""
      });
    }

    async function pickScreenColor() {
      if (typeof window === "undefined" || !window.EyeDropper) {
        onUpdate(node.id, {
          customPaletteError: "Eye dropper is not available in this browser."
        });
        return;
      }
      try {
        const result = await new window.EyeDropper().open();
        const color = customPaletteColorFromHex(result.sRGBHex);
        onUpdate(node.id, {
          customPalettePicker: color.hex,
          customPaletteError: ""
        });
      } catch (error) {
        if (error?.name === "AbortError") return;
        onUpdate(node.id, {
          customPaletteError: "Could not pick that color."
        });
      }
    }

    function clearCustomPalette() {
      onUndoSnapshot?.();
      onUpdate(node.id, {
        customPaletteRgbText: "",
        customPaletteColors: [],
        customPalettePreviewUrl: "",
        customPaletteSourceName: "",
        customPaletteStatus: "",
        customPaletteError: ""
      });
    }

    function updateInlinePicker(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      const saturation = Math.round(x * 100);
      const value = Math.round((1 - y) * 100);
      const color = customPaletteColorFromHsv(pickerColor.hue, saturation, value);
      onUpdate(node.id, {
        customPalettePicker: color.hex,
        customPaletteError: ""
      });
    }

    function startInlinePicker(event) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateInlinePicker(event);
    }

    function updateHuePicker(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      const hue = Math.round(y * 360);
      const color = customPaletteColorFromHsv(hue, pickerColor.saturation, pickerColor.value);
      onUpdate(node.id, {
        customPalettePicker: color.hex,
        customPaletteError: ""
      });
    }

    function startHuePicker(event) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateHuePicker(event);
    }

    const pickerColor = customPaletteColorFromHex(node.data.customPalettePicker || "#ddc631");
    const hasImagePalette = Boolean(node.data.customPalettePreviewUrl);
    const pickerHueColor = customPaletteColorFromHsv(pickerColor.hue, 100, 100);
    const pickerMarkerStyle = {
      "--picker-color": pickerColor.hex,
      "--picker-hue-color": pickerHueColor.hex,
      "--picker-x": `${pickerColor.saturation}%`,
      "--picker-y": `${100 - pickerColor.value}%`,
      "--picker-hue-y": `${pickerColor.hue / 3.6}%`
    };

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
          <div className="style-output-placeholder">{customPaletteSelected ? "Add palette colors to enable output" : "Choose style to enable output"}</div>
        )}

        <div className="style-preset-row">
          <span>Style</span>
          <select value={selectedPreset} onChange={(event) => onUpdate(node.id, { stylePreset: event.target.value, customPaletteError: "" })}>
            {stylePresetNames.map((presetName) => (
              <option key={presetName}>{presetName}</option>
            ))}
          </select>
        </div>

        {customPaletteSelected && (
          <section className="custom-palette-panel" onDragOver={allowFileDrop} onDrop={handlePaletteDrop}>
            <div className={`custom-palette-image-wrap ${hasImagePalette ? "has-preview" : ""}`}>
              <label className={`custom-palette-image-drop ${node.data.customPalettePreviewUrl ? "has-preview" : ""}`} title={node.data.customPalettePreviewUrl ? "Replace palette image" : "Extract palette from image"}>
                {node.data.customPalettePreviewUrl ? (
                  <img className="custom-palette-preview" src={previewImageUrl(node.data.customPalettePreviewUrl)} alt="Extracted custom palette" loading="lazy" decoding="async" />
                ) : (
                  <span className="custom-palette-empty">
                    <FileImage size={18} />
                    <span>Drop image or click to extract palette</span>
                  </span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    handlePaletteImageUpload(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {hasImagePalette && (
                <button type="button" className="custom-palette-image-clear" onClick={clearCustomPalette} title="Clear extracted palette">
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {!hasImagePalette && (
              <>
                <div className="custom-palette-inline-picker">
                  <div className="custom-palette-spectrum-wrap" style={pickerMarkerStyle}>
                    <button
                      type="button"
                      className="custom-palette-spectrum"
                      onPointerDown={startInlinePicker}
                      onPointerMove={(event) => {
                        if (event.buttons === 1) updateInlinePicker(event);
                      }}
                      title="Pick a palette color"
                    >
                      <span className="custom-palette-marker" />
                    </button>
                    <button
                      type="button"
                      className="custom-palette-hue-rail"
                      onPointerDown={startHuePicker}
                      onPointerMove={(event) => {
                        if (event.buttons === 1) updateHuePicker(event);
                      }}
                      title="Choose hue"
                    >
                      <span className="custom-palette-hue-thumb" />
                    </button>
                  </div>
                  <div className="custom-palette-tool-rail">
                    <button type="button" className="custom-palette-tool" onClick={addPickerColor} title="Add selected color">
                      <Plus size={16} />
                      <span>Add</span>
                    </button>
                    <button type="button" className="custom-palette-tool" onClick={pickScreenColor} title="Use eye dropper">
                      <Pipette size={16} />
                      <span>Pick</span>
                    </button>
                    <button type="button" className="custom-palette-tool muted" onClick={clearCustomPalette} title="Clear palette colors">
                      <Trash2 size={16} />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                <div className="custom-palette-swatches" aria-label="Custom palette colors">
                  {paletteColors.map((color) => (
                    <span key={`${color.hex}-${color.hue}-${color.value}`} title={`${color.hex} RGB(${color.r}, ${color.g}, ${color.b}) H${color.hue} V${color.value}%`} style={{ "--swatch-color": color.hex }} />
                  ))}
                </div>
              </>
            )}
            {node.data.customPaletteStatus === "extracting" && <small className="custom-palette-status">Extracting...</small>}
            {node.data.customPaletteError && <small className="upload-error">{node.data.customPaletteError}</small>}
          </section>
        )}
      </div>
    );
  }

  if (node.type === "preview") {
    const previewSources = connectedPreviewSources(incoming.sourceIn);
    const { source: previewSource, item: previewItem, itemIndex: previewIndex } = previewSelectionForNode(node, previewSources);
    const previewItems = previewSource?.items || [];
    const activePreviewTab = node.data.previewTab === "layout" ? "layout" : "preview";
    const layoutItems = normalizedPreviewLayoutItems(node.data.previewLayoutItems);
    const layoutColumnCount = previewLayoutColumnCount(layoutItems);
    const layoutExporting = node.data.previewLayoutExportStatus === "exporting";
    const layoutExport = node.data.previewLayoutExport || null;
    const sourcePort = config.input.find((port) => port.id === "sourceIn");

    function selectPreviewItem(index, event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (!previewSource || !previewItems.length) return;
      const nextIndex = ((index % previewItems.length) + previewItems.length) % previewItems.length;
      const item = previewItems[nextIndex];
      if (!item?.url) return;
      onUpdate(previewSource.sourceNodeId, {
        selectedResultIndex: item.sourceResultIndex ?? nextIndex,
        resultUrl: item.url
      });
      onUpdate(node.id, {
        previewSourceId: previewSource.id,
        previewItemIndex: nextIndex
      });
    }

    function startPreviewThumbDrag(event, item, index) {
      if (!item?.url || !item?.type) return;
      const dragItem = {
        id: `preview:${previewSource.id}:${index}`,
        url: item.url,
        type: item.type,
        label: item.label || `${previewSource.label} ${index + 1}`,
        fileName: item.fileName || fileNameFromLocalUrl(item.url),
        mimeType: item.mimeType || mimeForOutputItem(item)
      };
      setOutputItemDragData(event.dataTransfer, dragItem, outputDragMime);
    }

    function previewLayoutDropAllowed(event) {
      const types = Array.from(event.dataTransfer?.types || []);
      return types.includes(previewLayoutDragMime) || hasOutputItemDragData(event.dataTransfer);
    }

    function handleLayoutDragOver(event) {
      if (!previewLayoutDropAllowed(event)) return;
      allowFileDrop(event);
      event.dataTransfer.dropEffect = Array.from(event.dataTransfer?.types || []).includes(previewLayoutDragMime) ? "move" : "copy";
    }

    function addLayoutItem(item, beforeId = "") {
      if (item?.type !== "image" || !item.url) return;
      const nextItem = createPreviewLayoutItem(item);
      const currentItems = normalizedPreviewLayoutItems(node.data.previewLayoutItems);
      const hiddenUrls = normalizedPreviewLayoutHiddenUrls(node.data.previewLayoutHiddenUrls).filter((url) => url !== nextItem.url && url !== nextItem.sourceUrl);
      const insertIndex = beforeId ? currentItems.findIndex((layoutItem) => layoutItem.id === beforeId) : -1;
      const nextItems = [...currentItems];
      if (insertIndex >= 0) nextItems.splice(insertIndex, 0, nextItem);
      else nextItems.push(nextItem);
      onUndoSnapshot?.();
      onUpdate(node.id, {
        previewTab: "layout",
        previewLayoutItems: nextItems,
        previewLayoutHiddenUrls: hiddenUrls
      });
    }

    function moveLayoutItem(fromId, beforeId = "") {
      if (!fromId || fromId === beforeId) return;
      const currentItems = normalizedPreviewLayoutItems(node.data.previewLayoutItems);
      const fromIndex = currentItems.findIndex((item) => item.id === fromId);
      if (fromIndex < 0) return;
      const nextItems = [...currentItems];
      const [moved] = nextItems.splice(fromIndex, 1);
      const toIndex = beforeId ? nextItems.findIndex((item) => item.id === beforeId) : -1;
      if (toIndex >= 0) nextItems.splice(toIndex, 0, moved);
      else nextItems.push(moved);
      if (samePreviewLayoutItems(currentItems, nextItems)) return;
      onUndoSnapshot?.();
      onUpdate(node.id, { previewLayoutItems: nextItems });
    }

    function handleLayoutDrop(event, beforeId = "") {
      if (!previewLayoutDropAllowed(event)) return;
      allowFileDrop(event);
      const layoutItemId = event.dataTransfer.getData(previewLayoutDragMime);
      if (layoutItemId) {
        moveLayoutItem(layoutItemId, beforeId);
        return;
      }
      const outputItem = outputItemFromDataTransfer(event.dataTransfer);
      if (outputItem?.type === "image") addLayoutItem(outputItem, beforeId);
    }

    function startLayoutItemDrag(event, item) {
      if (!item?.url) return;
      event.dataTransfer.setData(previewLayoutDragMime, item.id);
      setOutputItemDragData(event.dataTransfer, item, outputDragMime);
      event.dataTransfer.effectAllowed = "copyMove";
    }

    function removeLayoutItem(itemId, event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const target = layoutItems.find((item) => item.id === itemId);
      const nextItems = layoutItems.filter((item) => item.id !== itemId);
      if (nextItems.length === layoutItems.length) return;
      const nextHiddenUrls = normalizedPreviewLayoutHiddenUrls(node.data.previewLayoutHiddenUrls);
      [target?.sourceUrl, target?.url].filter(Boolean).forEach((url) => {
        if (!nextHiddenUrls.includes(url)) nextHiddenUrls.push(url);
      });
      onUndoSnapshot?.();
      onUpdate(node.id, {
        previewLayoutItems: nextItems,
        previewLayoutHiddenUrls: nextHiddenUrls
      });
    }

    function rememberLayoutItemImageElement(itemId, image) {
      const width = previewLayoutDimension(image?.naturalWidth);
      const height = previewLayoutDimension(image?.naturalHeight);
      if (!itemId || !width || !height) return;
      const currentItems = normalizedPreviewLayoutItems(node.data.previewLayoutItems);
      const target = currentItems.find((item) => item.id === itemId);
      if (!target || (target.width === width && target.height === height)) return;
      onUpdate(node.id, {
        previewLayoutItems: currentItems.map((item) => (item.id === itemId ? { ...item, width, height } : item))
      });
    }

    function rememberLayoutItemDimensions(itemId, event) {
      rememberLayoutItemImageElement(itemId, event?.currentTarget);
    }

    function rememberCachedLayoutItemDimensions(itemId, image) {
      if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return;
      window.requestAnimationFrame(() => rememberLayoutItemImageElement(itemId, image));
    }

    function openLayoutItem(item, event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (!item?.url) return;
      onPreviewOpen?.({
        ...item,
        editContext: {
          type: "previewLayout",
          nodeId: node.id,
          itemId: item.id
        }
      });
    }

    return (
      <div className="node-body preview-node-body">
        <div className="preview-tabs" role="tablist" aria-label="Preview views" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" role="tab" aria-selected={activePreviewTab === "preview"} className={activePreviewTab === "preview" ? "active" : ""} onClick={() => onUpdate(node.id, { previewTab: "preview" })}>
            Preview
          </button>
          <button type="button" role="tab" aria-selected={activePreviewTab === "layout"} className={activePreviewTab === "layout" ? "active" : ""} onClick={() => {
            const nextItems = mergePreviewImagesIntoLayout(layoutItems, previewLayoutSourceItems(previewSource), normalizedPreviewLayoutHiddenUrls(node.data.previewLayoutHiddenUrls));
            onUpdate(node.id, samePreviewLayoutItems(layoutItems, nextItems) ? { previewTab: "layout" } : { previewTab: "layout", previewLayoutItems: nextItems });
          }}>
            Layout
          </button>
        </div>

        <NodeRow label="Source" inputPort={sourcePort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
          {previewSources.length > 1 ? (
            <select
              className="connected-field"
              value={previewSource?.id || ""}
              onChange={(event) => onUpdate(node.id, { previewSourceId: event.target.value, previewItemIndex: 0 })}
            >
              {previewSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                  {source.items.length > 1 ? ` (${source.items.length})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <button className={previewSource ? "connected-field" : ""}>{previewSource ? previewSource.label : "Connect media"}</button>
          )}
        </NodeRow>

        {activePreviewTab === "preview" ? (
          <>
            <div className={`preview-stage ${previewItem ? "has-preview" : ""}`} onDragStart={(event) => event.preventDefault()}>
              {previewItem?.type === "image" && <img key={previewItem.url} src={previewImageUrl(previewItem)} alt={previewItem.label || previewSource.label} draggable={false} loading="lazy" decoding="async" onError={useNewtNodeImageFallback} />}
              {previewItem?.type === "video" && <video key={previewItem.url} src={previewItem.url} controls loop draggable={false} data-preview-video-node-id={node.id} onError={useNewtNodeVideoFallback} />}
              {previewItem?.type === "model3d" && <Model3DViewer key={previewItem.url} url={previewItem.url} label={previewItem.label || previewSource.label} />}
              {!previewItem && <span>Preview will appear here</span>}
            </div>
            {previewItems.length > 1 && (
              <div className="preview-frame-nav" onPointerDown={(event) => event.stopPropagation()}>
                <button type="button" onClick={(event) => selectPreviewItem(previewIndex - 1, event)} title="Previous preview" aria-label="Previous preview">
                  <ChevronLeft size={15} />
                </button>
                <span>{previewIndex + 1} / {previewItems.length}</span>
                <button type="button" onClick={(event) => selectPreviewItem(previewIndex + 1, event)} title="Next preview" aria-label="Next preview">
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
            {previewItems.length > 0 && (
              <div className="preview-result-browser" onPointerDown={(event) => event.stopPropagation()}>
                <div className="preview-thumb-strip">
                  {previewItems.map((item, index) => (
                    <button
                      key={`${previewSource.id}-${item.url}-${index}`}
                      type="button"
                      className={index === previewIndex ? "active" : ""}
                      draggable
                      onClick={(event) => selectPreviewItem(index, event)}
                      onDragStart={(event) => startPreviewThumbDrag(event, item, index)}
                      onDragEnd={(event) => finishOutputItemDragData(item, event)}
                      title={`Select or drag ${item.label || `${previewSource.label} ${index + 1}`}`}
                      aria-label={`Select preview ${index + 1}`}
                    >
                      {item.type === "image" && <img src={previewImageUrl(item)} alt={item.label || `Preview ${index + 1}`} draggable={false} loading="lazy" decoding="async" onError={useNewtNodeImageFallback} />}
                      {item.type === "video" && <video src={item.url} muted playsInline preload="metadata" draggable={false} onError={useNewtNodeVideoFallback} />}
                      {item.type === "model3d" && (
                        <span className="preview-thumb-model">
                          <Box size={18} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <section className="preview-layout-panel" onPointerDown={(event) => event.stopPropagation()}>
            <div className="preview-layout-toolbar">
              <span>{layoutItems.length ? `${layoutItems.length} frame${layoutItems.length === 1 ? "" : "s"}` : "Layout board"}</span>
              <button
                type="button"
                onClick={() => onPreviewLayoutExport?.(node)}
                disabled={!layoutItems.length || layoutExporting}
                title="Export layout frames and PDF"
              >
                {layoutExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                <span>{layoutExporting ? "Exporting" : "Export"}</span>
              </button>
            </div>
            <div
              className={`preview-layout-board ${layoutItems.length ? "has-items" : ""}`}
              onDragOver={handleLayoutDragOver}
              onDrop={(event) => handleLayoutDrop(event)}
            >
              {layoutItems.length ? (
                <div className="preview-layout-grid" style={{ "--preview-layout-column-count": layoutColumnCount }}>
                  {layoutItems.map((item, index) => (
                    <figure
                      key={item.id}
                      className={`preview-layout-item ${item.width && item.height ? "has-dimensions" : ""}`}
                      style={{ "--preview-layout-item-aspect": previewLayoutAspectValue(item) }}
                      draggable
                      onDragStart={(event) => startLayoutItemDrag(event, item)}
                      onDragEnd={(event) => finishOutputItemDragData(item, event)}
                      onDragOver={handleLayoutDragOver}
                      onDrop={(event) => handleLayoutDrop(event, item.id)}
                      onDoubleClick={(event) => openLayoutItem(item, event)}
                      title={`${item.label || `Layout image ${index + 1}`}\nDrag to reorder, double-click to preview`}
                    >
                      <img ref={(image) => {
                        if (!item.width || !item.height) rememberCachedLayoutItemDimensions(item.id, image);
                      }} src={previewImageUrl(item)} alt={item.label || `Layout image ${index + 1}`} draggable={false} loading="lazy" decoding="async" onLoad={(event) => rememberLayoutItemDimensions(item.id, event)} onError={useNewtNodeImageFallback} />
                      <figcaption>{index + 1}</figcaption>
                      <button type="button" onClick={(event) => removeLayoutItem(item.id, event)} title="Remove from layout" aria-label="Remove from layout">
                        <X size={12} />
                      </button>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="preview-layout-empty">
                  <ImagePlus size={20} />
                  <span>Drop image thumbnails here</span>
                </div>
              )}
            </div>
            {(node.data.previewLayoutExportError || layoutExport?.folderPath) && (
              <small className={`preview-layout-export-status ${node.data.previewLayoutExportError ? "error" : ""}`} title={layoutExport?.folderPath || ""}>
                {node.data.previewLayoutExportError || `Exported ${layoutExport.frameCount || layoutItems.length} frame${(layoutExport.frameCount || layoutItems.length) === 1 ? "" : "s"}`}
              </small>
            )}
          </section>
        )}
        <button className="preview-resize-handle" onPointerDown={(event) => onPreviewResizeStart(event, node)} title="Resize preview" />
      </div>
    );
  }

  if (node.type === "autoAspect") {
    const imagePort = config.input.find((port) => port.id === "imageIn");
    const selectedAspectRatios = normalizedAutoAspectRatios(node.data);
    const results = normalizedAutoAspectResults(node.data);
    const sourceConnected = Boolean(incoming.imageIn?.length);
    const sourceSummary = autoAspectSourceSummary(incoming.imageIn, "Connect image");
    const advancedOpen = Boolean(node.data.advancedOpen);
    const model = normalizeAutoAspectModel(node.data.model);
    const resolution = normalizeImageModelResolution(node.data.resolution || "2K");
    const removeTextGraphics = Boolean(node.data.removeTextGraphics);
    const resultItems = autoAspectResultItems({ autoAspectResults: results });
    const outputPorts = new Map(autoAspectOutputPortsForNode(node).map((port) => [autoAspectTargetKeyFromOutputPort(port.id), port]));

    function activeResultKeysFor(selectedRatios) {
      return new Set(autoAspectTargetsForData({ selectedAspectRatios: selectedRatios }).map(autoAspectTargetKey));
    }

    function toggleAspectRatio(ratio) {
      if (running) return;
      const nextSelected = selectedAspectRatios.includes(ratio)
        ? selectedAspectRatios.filter((item) => item !== ratio)
        : [...selectedAspectRatios, ratio];
      const activeKeys = activeResultKeysFor(nextSelected);
      const nextResults = results.filter((result) => activeKeys.has(result.key));
      const resultItems = autoAspectResultItems({ autoAspectResults: nextResults });
      onUpdate(node.id, {
        selectedAspectRatios: nextSelected,
        autoAspectResults: nextResults,
        resultItems,
        resultUrl: resultItems[0]?.url || "",
        selectedResultIndex: 0
      });
    }

    function updateModel(value) {
      if (running) return;
      onUpdate(node.id, {
        ...resetAutoAspectOutputPatch(),
        model: normalizeAutoAspectModel(value)
      });
    }

    function updateResolution(value) {
      if (running) return;
      onUpdate(node.id, {
        ...resetAutoAspectOutputPatch(),
        resolution: normalizeImageModelResolution(value)
      });
    }

    function toggleRemoveTextGraphics() {
      if (running) return;
      onUpdate(node.id, {
        ...resetAutoAspectOutputPatch(),
        removeTextGraphics: !removeTextGraphics
      });
    }

    return (
      <div className="node-body model-node-body auto-aspect-node-body">
        <ResultPane
          label="Aspect outputs will appear here"
          resultUrl={node.data.resultUrl}
          resultItems={node.data.resultItems}
          selectedIndex={node.data.selectedResultIndex}
          type="image"
          status={node.data.status}
          error={node.data.error}
          onSelectResult={(index, item) => onUpdate(node.id, { selectedResultIndex: index, resultUrl: item.url })}
          onPreviewOpen={onPreviewOpen}
        />
        <NodeRow label="Image" inputPort={imagePort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
          <button type="button" className={sourceConnected ? "connected-field" : ""} title={sourceConnected ? sourceSummary : ""}>{sourceSummary}</button>
        </NodeRow>
        <div className="auto-aspect-list" aria-label="Auto Aspect outputs">
          {openAiImageAspectRatios.map((ratio) => {
            const selected = selectedAspectRatios.includes(ratio);
            const targets = autoAspectTargetsForRatio(ratio);
            const targetResults = targets.map((target) => autoAspectResultForTarget(node, target)).filter(Boolean);
            const readyCount = targetResults.filter((result) => result?.url).length;
            const result = targetResults[0] || null;
            const statusText = !selected
              ? "Select"
              : readyCount === targets.length
                ? targets.length > 1 ? `${readyCount} ready` : "Ready"
                : targets.length > 1 ? `${targets.length} outputs` : "Will generate";
            return (
              <div key={ratio} className={`auto-aspect-row ${selected ? "selected" : ""} ${result?.url ? "ready" : ""}`}>
                <button type="button" disabled={running} onClick={() => toggleAspectRatio(ratio)} title={selected ? `Remove ${ratio}` : `Add ${ratio}`}>
                  <span className="auto-aspect-check" />
                  <span>{ratio}</span>
                  <small>{statusText}</small>
                </button>
                {selected && (
                  <div className="auto-aspect-output-stack" aria-label={`${ratio} outputs`}>
                    {targets.map((target) => {
                      const targetKey = autoAspectTargetKey(target);
                      const port = outputPorts.get(targetKey) || {
                        id: autoAspectOutputPortId(target),
                        label: ratio,
                        color: portColors.image,
                        disabled: true
                      };
                      return (
                        <OutputPortRow
                          key={targetKey}
                          node={node}
                          port={port}
                          label=""
                          onConnectStart={onConnectStart}
                          onDisconnectInput={onDisconnectInput}
                          connectedPortKeys={connectedPortKeys}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className={`auto-aspect-advanced ${advancedOpen ? "open" : ""}`}>
          <button
            type="button"
            className="auto-aspect-advanced-toggle"
            disabled={running}
            onClick={() => onUpdate(node.id, { advancedOpen: !advancedOpen })}
            aria-expanded={advancedOpen}
          >
            <ChevronDown size={14} />
            <span>Advanced</span>
          </button>
          {advancedOpen && (
            <div className="auto-aspect-advanced-content">
              <NodeRow label="Model">
                <select value={model} disabled={running} onChange={(event) => updateModel(event.target.value)}>
                  {autoAspectModelOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </NodeRow>
              <NodeRow label="Resolution">
                <select value={resolution} disabled={running} onChange={(event) => updateResolution(event.target.value)}>
                  {imageResolutionOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </NodeRow>
              <button
                type="button"
                className={`auto-aspect-clean-toggle ${removeTextGraphics ? "active" : ""}`}
                disabled={running}
                onClick={toggleRemoveTextGraphics}
                aria-pressed={removeTextGraphics}
              >
                <span className="auto-aspect-check" />
                <span>Remove Graphic Overlays for Compositing</span>
              </button>
            </div>
          )}
        </div>
        <button className="run-node-button" onClick={() => onRun(node)} disabled={running || !sourceConnected || !selectedAspectRatios.length}>
          {running ? "Generating aspects..." : "Generate Aspects"}
        </button>
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
    const isQwenCameraEdit = isUtilityQwenCameraEditModel(utilityImageModel);
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
    const qwenImageInputUrl = isQwenCameraEdit ? connectedAssetUrls(incoming.imageIn).at(-1) || "" : "";
    const qwenHorizontalAngle = finiteNumber(node.data.horizontalAngle, qwenCameraDefaults.horizontalAngle);
    const qwenVerticalAngle = finiteNumber(node.data.verticalAngle, qwenCameraDefaults.verticalAngle);
    const qwenZoom = finiteNumber(node.data.zoom, qwenCameraDefaults.zoom);
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
        : isQwenCameraEdit
          ? "Run Camera Edit"
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
          onPreviewOpen={onPreviewOpen}
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
          {running ? (isVideoMode ? "Running Video..." : isStillFrame ? "Grabbing Still..." : isQwenCameraEdit ? "Running Camera..." : "Running Image...") : utilityRunLabel}
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
                <React.Suspense fallback={<small className="upload-status color-id-status">Loading picker...</small>}>
                  <ColorIdMatteVideoPicker
                    videoUrl={connectedAssetUrls(incoming.referenceVideoIn).at(-1)}
                    node={node}
                    onUpdate={onUpdate}
                    rowComponent={NodeRow}
                    formatFrameTimeDisplay={formatFrameTimeDisplay}
                    normalizeChoice={normalizeChoice}
                    outputOptions={colorIdMatteVideoOutputOptions}
                  />
                </React.Suspense>
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
                  <option>{utilityImageModelNames.qwenCameraEdit}</option>
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
              ) : isQwenCameraEdit ? (
                <>
                  <NodeRow label="Image" inputPort={settingsOpen ? imagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                    <button className={qwenImageInputUrl ? "connected-field" : ""}>{connectedSummary(incoming.imageIn, "Add image")}</button>
                  </NodeRow>
                  <CameraControlViewport
                    imageUrl={qwenImageInputUrl}
                    horizontalAngle={qwenHorizontalAngle}
                    verticalAngle={qwenVerticalAngle}
                    zoom={qwenZoom}
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
                      <input type="range" min="0" max="360" step="1" value={qwenHorizontalAngle} onChange={(event) => onUpdate(node.id, { horizontalAngle: Number(event.target.value) })} />
                      <strong>{Math.round(qwenHorizontalAngle)} deg</strong>
                    </label>
                    <label>
                      <span>Elevation</span>
                      <input type="range" min="-30" max="90" step="1" value={qwenVerticalAngle} onChange={(event) => onUpdate(node.id, { verticalAngle: Number(event.target.value) })} />
                      <strong>{Math.round(qwenVerticalAngle)} deg</strong>
                    </label>
                    <label>
                      <span>Zoom</span>
                      <input type="range" min="0" max="10" step="0.1" value={qwenZoom} onChange={(event) => onUpdate(node.id, { zoom: Number(event.target.value) })} />
                      <strong>{qwenZoom.toFixed(1)}</strong>
                    </label>
                  </div>
                  <NodeRow label="Prompt">
                    <textarea
                      value={node.data.additionalPrompt || ""}
                      onChange={(event) => onUpdate(node.id, { additionalPrompt: event.target.value })}
                      placeholder="Optional extra instruction"
                    />
                  </NodeRow>
                </>
              ) : (
                <>
                  <NodeRow label="Image" inputPort={settingsOpen ? imagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                    <button className={incoming.imageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.imageIn, "Add image")}</button>
                  </NodeRow>
                  {isColorIdMatte ? (
                    <React.Suspense fallback={<small className="upload-status color-id-status">Loading picker...</small>}>
                      <ColorIdMattePicker imageUrl={connectedAssetUrls(incoming.imageIn).at(-1)} node={node} onUpdate={onUpdate} rowComponent={NodeRow} />
                    </React.Suspense>
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
      <div
        className="node-body model-node-body model3d-body"
        onDragOver={allowFileDrop}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const outputItem = outputItemFromDataTransfer(event.dataTransfer);
          if (outputItem) {
            onOutputImport?.(node, outputItem);
            return;
          }
          const file = firstAcceptedFile(event.dataTransfer.files, "model3d");
          if (file) onUpload(node, file);
        }}
      >
        <ResultPane
          label="Results will appear here"
          resultUrl={node.data.resultUrl}
          resultItems={node.data.resultItems}
          selectedIndex={node.data.selectedResultIndex}
          type="model3d"
          status={node.data.status}
          error={node.data.error}
          onSelectResult={(index, item) => onUpdate(node.id, { selectedResultIndex: index, resultUrl: item.url })}
          onPreviewOpen={onPreviewOpen}
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
    const isZImage = isZImageImageModel(node.data.model);
    const isKrea2Large = isKrea2LargeImageModel(node.data.model);
    const isSeedream5 = isSeedream5ImageModel(node.data.model);
    const isNanoBanana2 = isNanoBanana2Model(node.data.model);
    const isOpenAiImage2 = node.data.model === imageModelNames.openAiImage2;
    const imageInstructionSources = imageInstructionSourcesForModel(node.data.model, incoming);
    const effectivePromptValue = isSam3Image || isZImage ? promptValue : buildEffectiveImagePrompt(promptValue, imageInstructionSources, node.data.aspectRatio, incomingByNode);
    const promptHasGeneratedAdditions = effectivePromptValue !== promptValue;
    const appliedInstructionLabels = activeImageInstructionLabels(imageInstructionSources, incomingByNode);
    const characterTagMatches = isSam3Image || isImageModelUnsupportedInput(node, "characterIn") ? [] : imageModelCharacterTagMatches(promptValue, imageInstructionSources, incomingByNode);
    const imagePromptConnections = imagePromptInputConnectionsForModel(node.data.model, incoming);
    const imagePromptLabel = connectedSummary(imagePromptConnections, "Add file");
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
    const cameraInputUnsupported = isImageModelUnsupportedInput(node, "cameraIn");
    const styleInputUnsupported = isImageModelUnsupportedInput(node, "styleIn");
    const transferInputUnsupported = isImageModelUnsupportedInput(node, "transferIn");
    const characterInputUnsupported = isImageModelUnsupportedInput(node, "characterIn");
    const settingsOpen = node.data.settingsOpen !== false;
    const collapsedPorts = isSam3Image
      ? [promptPort, imagePromptPort]
      : [
          promptPort,
          imagePromptPort,
          cameraInputUnsupported ? null : cameraPort,
          styleInputUnsupported ? null : stylePort,
          transferInputUnsupported ? null : transferPort,
          characterInputUnsupported ? null : characterPort
        ];
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
          onPreviewOpen={onPreviewOpen}
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
              {imageModelOptions.map((model) => (
                <option key={model}>{model}</option>
              ))}
              {sam3SegmentationModelsEnabled && <option>SAM 3 Image</option>}
            </select>
          </NodeRow>
          {isOpenAiImage2 && (
            <NodeRow label="Quality">
              <select value={normalizeOpenAiImage2Quality(node.data.quality)} onChange={(event) => onUpdate(node.id, { quality: normalizeOpenAiImage2Quality(event.target.value) })}>
                {openAiImage2QualityOptions.map((option) => (
                  <option key={option} value={option}>{formatOpenAiImage2Quality(option)}</option>
                ))}
              </select>
            </NodeRow>
          )}
          {isKrea2Large && (
            <NodeRow label="Creativity">
              <select value={normalizeKrea2Creativity(node.data.kreaCreativity)} onChange={(event) => onUpdate(node.id, { kreaCreativity: event.target.value })}>
                {krea2CreativityOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatKrea2Creativity(option)}
                  </option>
                ))}
              </select>
            </NodeRow>
          )}
          {isSeedream5 && (
            <NodeRow label="Layer Separation">
              <button
                className={`node-toggle ${node.data.seedreamLayers ? "enabled" : ""}`}
                onClick={() => onUpdate(node.id, {
                  seedreamLayers: !node.data.seedreamLayers,
                  batchCount: "1"
                })}
                title="Return a flattened image plus editable transparent component layers"
              >
                <span />
              </button>
            </NodeRow>
          )}
          <NodeRow label={isSam3Image ? "Image" : "Image Prompt"} inputPort={settingsOpen ? imagePromptPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
            <button className={imagePromptLabel !== "Add file" ? "connected-field" : ""}>{imagePromptLabel}</button>
          </NodeRow>
          {!isSam3Image && (
            <>
              {!cameraInputUnsupported && (
                <NodeRow label="Camera" inputPort={settingsOpen ? cameraPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button className={cameraPromptLabel !== "Add camera" ? "connected-field" : ""}>{cameraPromptLabel}</button>
                </NodeRow>
              )}
              {!styleInputUnsupported && (
                <NodeRow label="Style" inputPort={settingsOpen ? stylePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button className={stylePromptLabel !== "Add style" ? "connected-field" : ""}>{stylePromptLabel}</button>
                </NodeRow>
              )}
              {!transferInputUnsupported && (
                <NodeRow label="Mood Board" inputPort={settingsOpen ? transferPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button className={transferPromptLabel !== "Add mood board" ? "connected-field" : ""}>{transferPromptLabel}</button>
                </NodeRow>
              )}
              {!characterInputUnsupported && (
                <NodeRow label="Character" inputPort={settingsOpen ? characterPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button className={characterPromptLabel !== "Add character" ? "connected-field" : ""}>{characterPromptLabel}</button>
                </NodeRow>
              )}
              <NodeRow label="Generations">
                <select value={isSeedream5 && node.data.seedreamLayers ? "1" : node.data.batchCount || "1"} disabled={isSeedream5 && node.data.seedreamLayers} onChange={(event) => onUpdate(node.id, { batchCount: event.target.value })}>
                  {(isSeedream5 && node.data.seedreamLayers ? ["1"] : imageBatchOptions).map((option) => (
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
                  {(isSeedream5 ? seedream5ResolutionOptions : isNanoBanana2 ? nanoBanana2ResolutionOptions : imageResolutionOptions).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </NodeRow>
            </>
          )}
        </details>
        {isSam3Image && <small className="upload-status model-status-note">segmentation model</small>}
      </div>
    );
  }

  const promptPort = config.input.find((port) => port.id === "promptIn");
  const directorPort = config.input.find((port) => port.id === "directorIn");
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
  const isLumaVideo = isLumaVideoModel(node.data.model);
  const isKlingO34k = isKlingO34kModel(node.data.model);
  const isKlingO3Pro = isKlingO3ProModel(node.data.model);
  const isKlingO3 = isKlingO34k || isKlingO3Pro;
  const isGeminiOmni = isGeminiOmniModel(node.data.model);
  const isSam3Video = isSam3VideoModel(node.data.model);
  const wan27Duration = normalizedWan27ReferenceDurationLabel(node.data.duration);
  const wan27Resolution = normalizedWan27ReferenceResolution(node.data.resolution);
  const wan27AspectRatio = normalizedWan27ReferenceAspectRatio(node.data.aspectRatio);
  const happyHorseDuration = normalizedHappyHorseDurationLabel(node.data.duration);
  const happyHorseResolution = normalizedHappyHorseResolution(node.data.resolution);
  const happyHorseAspectRatio = normalizedHappyHorseAspectRatio(node.data.aspectRatio);
  const lumaDuration = normalizedLumaVideoDurationLabel(node.data.duration);
  const lumaResolution = normalizedLumaVideoResolution(node.data.resolution);
  const lumaAspectRatio = normalizedLumaVideoAspectRatio(node.data.aspectRatio);
  const happyHorseReferenceImageCount = Math.min(incoming.referenceImageIn?.length || 0, 9);
  const wan27ReferenceImageCount = incoming.referenceImageIn?.length || 0;
  const wan27ReferenceVideoCount = incoming.referenceVideoIn?.length || 0;
  const supportsCharacterInput = videoModelSupportsCharacterInput(node.data.model);
  const supportsDirectorInput = videoModelSupportsFilmDirector(node.data.model);
  const activeDirectorPort = supportsDirectorInput ? directorPort : null;
  const displayIncoming = supportsDirectorInput
    ? expandVideoDirectorPackageIncoming(incoming, incomingByNode, { includeCharacters: supportsCharacterInput })
    : incoming;
  const directorPromptValue = supportsDirectorInput ? connectedDirectorPackageText(incoming.directorIn) : "";
  const promptValue = [directorPromptValue, resolvedPromptText(incoming.promptIn) || node.data.prompt].filter(Boolean).join("\n\n");
  const promptConnected = Boolean(resolvedPromptText(incoming.promptIn) || directorPromptValue);
  const directorConnected = supportsDirectorInput && Boolean(incoming.directorIn?.length);
  const hasVideoPrompt = Boolean(String(promptValue || "").trim());
  const tagMatches = isWanFunControl || isAurora || isLumaVideo || isSam3Video ? [] : videoModelReferenceTagMatches(promptValue, displayIncoming);
  const characterConnected = supportsCharacterInput && Boolean(displayIncoming.characterIn?.length);
  const settingsOpen = node.data.settingsOpen !== false;
  const collapsedPorts = isWanFunControl
    ? [promptPort, activeDirectorPort, referenceVideoPort, referenceImagePort, characterPort]
    : isWan27Reference
      ? [promptPort, activeDirectorPort, referenceImagePort, referenceVideoPort, characterPort]
    : isAurora
      ? [promptPort, activeDirectorPort, referenceImagePort, referenceAudioPort]
      : isHappyHorse
        ? [promptPort, activeDirectorPort, referenceImagePort, characterPort]
    : isLumaVideo
      ? [promptPort, activeDirectorPort, startFramePort, endFramePort, referenceImagePort]
    : isKlingO3
      ? [promptPort, activeDirectorPort, startFramePort, endFramePort, referenceImagePort, referenceVideoPort, characterPort]
    : isGeminiOmni
      ? [promptPort, activeDirectorPort, startFramePort, referenceImagePort, characterPort]
    : isSam3Video
      ? [promptPort, activeDirectorPort, referenceVideoPort]
      : [promptPort, activeDirectorPort, startFramePort, endFramePort, referenceImagePort, referenceVideoPort, referenceAudioPort, characterPort];
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
      <button className="run-node-button" onClick={() => onRun(node)} disabled={running || !hasVideoPrompt}>
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
            {videoModelOptions.map((model) => (
              <option key={model}>{model}</option>
            ))}
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
        {supportsDirectorInput && (
          <NodeRow label="Film Director" inputPort={settingsOpen ? directorPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
            <button className={directorConnected ? "connected-field" : ""}>{connectedSummary(incoming.directorIn, "Add film director")}</button>
          </NodeRow>
        )}
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
        ) : isLumaVideo ? (
          <>
            <NodeRow label="Start Frame" inputPort={settingsOpen ? startFramePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.startFrameIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.startFrameIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="End Frame" inputPort={settingsOpen ? endFramePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.endFrameIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.endFrameIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="Reference Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceImageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceImageIn, "Optional start")}</button>
            </NodeRow>
            <NodeRow label="Duration">
              <select value={lumaDuration} onChange={(event) => onUpdate(node.id, { duration: event.target.value })}>
                {lumaVideoDurationOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value={lumaResolution} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                {lumaVideoResolutionOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Aspect Ratio">
              <select value={lumaAspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                {lumaVideoAspectRatioOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Loop">
              <button className={`node-toggle ${node.data.loop ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { loop: !node.data.loop })}>
                <span />
              </button>
            </NodeRow>
          </>
        ) : isGeminiOmni ? (
          <>
            <NodeRow label="Start Frame" inputPort={settingsOpen ? startFramePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.startFrameIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.startFrameIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="Reference Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={displayIncoming.referenceImageIn?.length ? "connected-field" : ""}>{connectedSummary(displayIncoming.referenceImageIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="Character" inputPort={settingsOpen ? characterPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={displayIncoming.characterIn?.length ? "connected-field" : ""}>{connectedSummary(displayIncoming.characterIn, "Optional character")}</button>
            </NodeRow>
            <NodeRow label="Duration">
              <select value={node.data.duration} onChange={(event) => onUpdate(node.id, { duration: event.target.value })}>
                {geminiOmniDurationOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value="720p" disabled>
                {geminiOmniResolutionOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </NodeRow>
            <NodeRow label="Aspect Ratio">
              <select value={node.data.aspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                {geminiOmniAspectRatioOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </NodeRow>
            <NodeRow label="Generate Audio">
              <button className={`node-toggle ${node.data.generateAudio ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { generateAudio: !node.data.generateAudio })}>
                <span />
              </button>
            </NodeRow>
          </>
        ) : isKlingO3 ? (
          <>
            <NodeRow label="Start Frame" inputPort={settingsOpen ? startFramePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.startFrameIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.startFrameIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="End Frame" inputPort={settingsOpen ? endFramePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.endFrameIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.endFrameIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="Reference Image" inputPort={settingsOpen ? referenceImagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={displayIncoming.referenceImageIn?.length ? "connected-field" : ""}>{connectedSummary(displayIncoming.referenceImageIn, "Optional image")}</button>
            </NodeRow>
            <NodeRow label="Reference Video" inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceVideoIn, "Optional video")}</button>
            </NodeRow>
            <NodeRow label="Character" inputPort={settingsOpen ? characterPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
              <button className={displayIncoming.characterIn?.length ? "connected-field" : ""}>{connectedSummary(displayIncoming.characterIn, "Optional character")}</button>
            </NodeRow>
            <NodeRow label="Duration">
              <select value={node.data.duration} onChange={(event) => onUpdate(node.id, { duration: event.target.value })}>
                {(isKlingO34k ? klingO34kDurationOptions : klingO3ProDurationOptions).map((option) => <option key={option}>{option}</option>)}
              </select>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value={isKlingO34k ? "4K" : "1080p"} disabled>
                {(isKlingO34k ? klingO34kResolutionOptions : klingO3ProResolutionOptions).map((option) => <option key={option}>{option}</option>)}
              </select>
            </NodeRow>
            <NodeRow label="Aspect Ratio">
              <select value={node.data.aspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                {(isKlingO34k ? klingO34kAspectRatioOptions : klingO3ProAspectRatioOptions).map((option) => <option key={option}>{option}</option>)}
              </select>
            </NodeRow>
            {!isKlingO34k && (
              <>
                <NodeRow label="Prompt Strength">
                  <input type="range" min="0" max="1" step="0.05" value={node.data.klingCfgScale ?? 0.5} onChange={(event) => onUpdate(node.id, { klingCfgScale: Number(event.target.value) })} />
                  <span>{Number(node.data.klingCfgScale ?? 0.5).toFixed(2)}</span>
                </NodeRow>
                <NodeRow label="Negative">
                  <textarea value={node.data.negativePrompt || ""} onChange={(event) => onUpdate(node.id, { negativePrompt: event.target.value })} placeholder="Optional negative prompt" />
                </NodeRow>
              </>
            )}
            <NodeRow label="Generate Audio">
              <button className={`node-toggle ${node.data.generateAudio ? "enabled" : ""}`} onClick={() => onUpdate(node.id, { generateAudio: !node.data.generateAudio })}>
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
                {seedanceVideoDurationOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Resolution">
              <select value={node.data.resolution} onChange={(event) => onUpdate(node.id, { resolution: event.target.value })}>
                {(isSeedanceFastModel(node.data.model) ? seedanceFastVideoResolutionOptions : seedanceVideoResolutionOptions).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </NodeRow>
            <NodeRow label="Aspect Ratio">
              <select value={node.data.aspectRatio} onChange={(event) => onUpdate(node.id, { aspectRatio: event.target.value })}>
                {seedanceVideoAspectRatioOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
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
      {isLumaVideo && <small className="upload-status model-status-note">Luma Ray2 via Fal</small>}
      {isWan27Reference && <small className="upload-status model-status-note">multi-reference image/video model</small>}
      {isGeminiOmni && <small className="upload-status model-status-note">Google direct with fal fallback · preview</small>}
      {isKlingO3 && <small className="upload-status model-status-note">Film Director shots compile to {isKlingO34k ? "native 4K " : ""}Kling multi-shot</small>}
      {isSam3Video && <small className="upload-status model-status-note">segmentation mask model</small>}
    </div>
  );
}

function TaggedPromptTextarea({ value, onChange, readOnly, className = "", tagMatches = [], placeholder = "" }) {
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
      <textarea value={value} readOnly={readOnly} placeholder={placeholder} onChange={onChange} onScroll={syncScroll} />
    </div>
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

function getNodeConfig(type) {
  const configs = {
    plainText: {
      icon: Type,
      input: [],
      output: [{ id: "promptOut", label: "Prompt", color: portColors.prompt }]
    },
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
    skillDirector: {
      icon: Megaphone,
      input: [
        { id: "characterIn", label: "Character", color: portColors.character },
        { id: "locationIn", label: "Location", color: portColors.image },
        { id: "imageIn", label: "Props", color: portColors.image },
        { id: "styleIn", label: "Mood Board", color: portColors.transfer }
      ],
      output: [{ id: "directorOut", label: "Film Director", color: portColors.director }]
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
      input: [],
      output: [{ id: "cameraOut", label: "Camera", color: portColors.camera }]
    },
    composer: {
      icon: Box,
      input: [{ id: "imageIn", label: "Image Plane", color: portColors.image }],
      output: [{ id: "imageOut", label: "Frame", color: portColors.image }]
    },
    frameIt: {
      icon: PersonStanding,
      input: [],
      output: [{ id: "imageOut", label: "Frame", color: portColors.image }]
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
    autoAspect: {
      icon: Maximize2,
      input: [{ id: "imageIn", label: "Image", color: portColors.image }],
      output: []
    },
    storyboard: {
      icon: Clapperboard,
      input: [
        { id: "directorIn", label: "Film Director", color: portColors.director },
        { id: "sceneDescriptionIn", label: "Scene Description", color: portColors.prompt },
        { id: "sceneReferenceIn", label: "Scene Reference", color: portColors.image },
        { id: "styleIn", label: "Style", color: portColors.style },
        { id: "transferIn", label: "Mood Board", color: portColors.transfer },
        { id: "characterIn", label: "Character", color: portColors.character }
      ],
      output: [{ id: storyboardBoardOutputPortId, label: "Storyboard", color: portColors.image }]
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
        { id: "directorIn", label: "Film Director", color: portColors.director },
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

  if (type === "plainText") return { title, text: "" };
  if (type === "text") return { title, text: "" };
  if (type === "skillDirector") {
    return {
      title,
      sceneName: "",
      sceneOverview: "",
      text: "",
      skillShotCount: "3",
      skillDurationSeconds: "15",
      styleDirection: "",
      motionBrief: "",
      motionDirection: "",
      shotList: "",
      shotListNotes: "",
      resultText: "",
      skillDirectorLocks: {
        setup: false,
        style: false,
        motion: false,
        scene: false,
        shotList: false
      },
      skillDirectorCollapsed: {
        setup: false,
        style: false,
        motion: false,
        scene: false,
        shotList: false
      },
      skillDirectorBuilt: false,
      skillDirectorAction: "",
      skillDirectorQueuedAction: "",
      skillDirectorQueueId: "",
      skillPreviewOpen: false,
      skillReferenceNotes: {},
      skillDirectorRevisionOpen: false,
      skillDirectorRevisionNotes: "",
      skillDirectorLastRevisionSummary: "",
      skillDirectorRevisionHistory: []
    };
  }
  if (type === "image" || type === "video" || type === "audio") return { title };
  if (type === "preview") return { title, previewScale: 1, previewItemIndex: 0, previewTab: "preview", previewLayoutItems: [] };
  if (type === "autoAspect") {
    return {
      title,
      selectedAspectRatios: autoAspectDefaultRatios,
      autoAspectResults: [],
      model: imageModelNames.openAiImage2,
      resolution: "2K",
      removeTextGraphics: false,
      advancedOpen: false
    };
  }
  if (type === "storyboard") {
    return {
      title,
      storyboardTab: "setup",
      sceneName: "Scene 1",
      sceneDescription: "",
      storyboardNotes: "",
      storyboardAutoQc: true,
      frameCount: "Auto",
      model: storyboardFixedModel,
      aspectRatio: storyboardDefaultAspectRatio,
      resolution: storyboardDefaultResolution,
      useStoryboardStyle: true,
      useMoodBoard: true,
      useInternalStoryboardCharacters: true,
      storyboardStylePreset: "None",
      storyboardMoodBoardUrl: storyboardDefaultMoodBoardUrl,
      storyboardMoodBoardFileName: storyboardMoodBoardLabel,
      storyboardCharacters: [],
      storyboardAnalysis: "",
      storyboardPlanSceneDescription: "",
      storyboardFrames: defaultStoryboardFrames(storyboardDefaultFrameCount),
      selectedFrameId: "",
      storyboardScale: 1,
      storyboardBoardUrl: "",
      storyboardBoardFileName: "",
      storyboardBoardStoredFileName: "",
      storyboardBoardMimeType: "",
      storyboardBoardFrames: [],
      storyboardBoardVersion: 0,
      settingsOpen: true
    };
  }
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
      composerAspectRatio: "16:9",
      composerShowGuides: true,
      composerSelectedId: composerScene.maquettes[0]?.id || "",
      composerSavedPoses: [],
      composerScene
    };
  }
  if (type === "frameIt") {
    const frameItScene = defaultFrameItScene();
    return {
      title,
      frameItScene,
      frameItSelectedFigureId: frameItScene.figures[0]?.id || "",
      frameItSelectedJoint: "upperBodyRot",
      frameItTool: "bend",
      frameItAspectRatio: "16:9",
      frameItShowFloor: true,
      frameItShowGrid: true,
      frameItShowGuides: true,
      frameItUseLimits: true,
      frameItSavedPoses: [],
      frameItSelectedPoseId: "",
      frameItScale: 1
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
      cinematicCharacterSheet: false,
      useCustomCharacterSheet: false,
      customCharacterSheet: null,
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
  if (type === "camera") {
    return {
      title,
      shotPreset: "None",
      lensPreset: "None",
      typePreset: "None"
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
      ...qwenCameraDefaults,
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
  if (type === "style") {
    return {
      title,
      stylePreset: "None",
      customPaletteRgbText: "",
      customPalettePicker: "#ddc631",
      customPaletteColors: [],
      customPalettePreviewUrl: "",
      customPaletteSourceName: "",
      customPaletteStatus: "",
      customPaletteError: ""
    };
  }
  if (type === "imageModel") {
    return {
      title,
      model: imageModelNames.openAiImage2,
      prompt: "",
      aspectRatio: "16:9",
      resolution: "2K",
      quality: openAiImage2Quality,
      kreaCreativity: "raw",
      seedreamLayers: false,
      batchCount: "1",
      settingsOpen: true
    };
  }

  return {
    title,
    model: videoModelNames.seedance,
    prompt: "",
    duration: "15 seconds",
    resolution: "720p",
    aspectRatio: "16:9 (Landscape)",
    generateAudio: true,
    klingCfgScale: 0.5,
    loop: false,
    negativePrompt: "",
    multiShots: false,
    enableSafetyChecker: true,
    seed: "",
    batchCount: "1",
    settingsOpen: true
  };
}

function imageModelSelectionPatch(data = {}, model) {
  const isSeedream5 = isSeedream5ImageModel(model);
  const isNanoBanana2 = isNanoBanana2Model(model);
  return {
    model,
    aspectRatio: normalizeImageModelAspectRatio(data.aspectRatio, model),
    resolution: isSeedream5
      ? normalizeChoice(String(data.resolution || "2K").toUpperCase(), seedream5ResolutionOptions, "2K")
      : isNanoBanana2
        ? normalizeNanoBanana2Resolution(data.resolution)
        : normalizeImageModelResolution(data.resolution),
    quality: normalizeOpenAiImage2Quality(data.quality),
    kreaCreativity: normalizeKrea2Creativity(data.kreaCreativity),
    seedreamLayers: isSeedream5 ? Boolean(data.seedreamLayers) : false,
    batchCount: isSeedream5 && data.seedreamLayers ? "1" : data.batchCount || "1"
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
  if (isKrea2LargeImageModel(model)) return krea2AspectRatios;
  if (isLumaImageModel(model)) return lumaImageAspectRatios;
  return isOpenAiImageModel(model) ? openAiImageAspectRatios : nanoImageAspectRatios;
}

function normalizeImageModelAspectRatio(value, model) {
  if (isAutoImageAspectRatio(value)) return imageModelAutoAspectRatio;
  const ratio = extractAspectRatio(value);
  return imageModelSupportedAspectRatios(model).includes(ratio) ? ratio : "16:9";
}

function isAutoImageAspectRatio(value) {
  return String(value || "").toLowerCase() === "auto";
}

function isOpenAiImageModel(model) {
  return String(model || "").toLowerCase().includes("openai");
}

function formatOpenAiImage2Quality(value) {
  const quality = normalizeOpenAiImage2Quality(value);
  if (quality === "low") return "Low (Economy)";
  if (quality === "medium") return "Medium (Draft)";
  return "High (Professional)";
}

function isKrea2LargeImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("krea") && normalized.includes("large");
}

function isSeedream5ImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("seedream") && normalized.includes("5");
}

function normalizeKrea2Creativity(value) {
  return normalizeChoice(String(value || "raw").toLowerCase(), krea2CreativityOptions, "raw");
}

function formatKrea2Creativity(value) {
  const text = normalizeKrea2Creativity(value);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function isZImageImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("z-image") || normalized.includes("z image") || normalized.includes("zimage");
}

function zImageUnsupportedInputMessage() {
  return "Z-Image supports Prompt and Image Prompt only; Camera, Style, Mood Board, and Character inputs are not supported.";
}

function lumaImageUnsupportedInputMessage() {
  return "Luma Dream Machine supports Prompt, Image Prompt, and Style inputs only; Camera, Mood Board, and Character inputs are not supported.";
}

function imageModelUnsupportedInputMessage(model) {
  if (isZImageImageModel(model)) return zImageUnsupportedInputMessage();
  if (isKrea2LargeImageModel(model)) return "This input is not supported by the selected model.";
  if (isLumaImageModel(model)) return lumaImageUnsupportedInputMessage();
  return "";
}

function imageModelUnsupportedInputPorts(model) {
  if (isZImageImageModel(model)) return zImageUnsupportedInputPorts;
  if (isKrea2LargeImageModel(model)) return krea2UnsupportedInputPorts;
  if (isLumaImageModel(model)) return lumaImageUnsupportedInputPorts;
  return emptyPortSet;
}

function imageModelUnsupportedSourceTypes(model) {
  if (isZImageImageModel(model)) return zImageUnsupportedSourceTypes;
  if (isKrea2LargeImageModel(model)) return krea2UnsupportedSourceTypes;
  if (isLumaImageModel(model)) return lumaImageUnsupportedSourceTypes;
  return emptyPortSet;
}

function isImageModelUnsupportedInput(node, portId) {
  return node?.type === "imageModel" && imageModelUnsupportedInputPorts(node.data?.model).has(portId);
}

function isImageModelUnsupportedSource(target, source) {
  return target?.type === "imageModel" && imageModelUnsupportedSourceTypes(target.data?.model).has(source?.type);
}

function zImageSupportedReferenceConnections(items = []) {
  return items.filter(({ source, edge }) => {
    if (!source?.data?.resultUrl || zImageUnsupportedSourceTypes.has(source.type)) return false;
    return previewMediaType(source, edge) === "image";
  });
}

function imagePromptInputConnectionsForModel(model, incoming = {}) {
  if (isZImageImageModel(model)) return zImageSupportedReferenceConnections(incoming.imagePromptIn || []);
  return incoming.imagePromptIn || [];
}

function imageInstructionSourcesForModel(model, incoming = {}) {
  const unsupportedPorts = imageModelUnsupportedInputPorts(model);
  return [
    ...(incoming.imagePromptIn || []),
    ...(!unsupportedPorts.has("cameraIn") ? incoming.cameraIn || [] : []),
    ...(!unsupportedPorts.has("styleIn") ? incoming.styleIn || [] : []),
    ...(!unsupportedPorts.has("transferIn") ? incoming.transferIn || [] : []),
    ...(!unsupportedPorts.has("characterIn") ? incoming.characterIn || [] : [])
  ];
}

function imageReferenceConnectionsForModel(model, incoming = {}) {
  const unsupportedPorts = imageModelUnsupportedInputPorts(model);
  if (isZImageImageModel(model)) return zImageSupportedReferenceConnections(incoming.imagePromptIn || []);
  return [
    ...(incoming.imagePromptIn || []),
    ...(!unsupportedPorts.has("transferIn") ? incoming.transferIn || [] : []),
    ...(!unsupportedPorts.has("characterIn") ? incoming.characterIn || [] : [])
  ];
}

function isLumaImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("luma") || normalized.includes("photon");
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

function isLumaVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("luma") || normalized.includes("dream") || normalized.includes("ray2") || normalized.includes("ray 2");
}

function isKlingO3Model(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("kling") && (normalized.includes("o3") || normalized.includes("03"));
}

function isKlingO34kModel(model) {
  return isKlingO3Model(model) && String(model || "").toLowerCase().includes("4k");
}

function isKlingO3ProModel(model) {
  return isKlingO3Model(model) && !isKlingO34kModel(model);
}

function videoModelSupportsCharacterInput(model) {
  return !isAuroraModel(model) && !isLumaVideoModel(model) && !isSam3VideoModel(model);
}

function isVideoModelUnsupportedCharacterInput(node, portId) {
  return node?.type === "videoModel" && portId === "characterIn" && !videoModelSupportsCharacterInput(node.data?.model);
}

function isVideoModelUnsupportedInput(node, portId) {
  if (isVideoModelUnsupportedCharacterInput(node, portId)) return true;
  if (node?.type === "videoModel" && portId === "directorIn" && !videoModelSupportsFilmDirector(node.data?.model)) return true;
  if (node?.type === "videoModel" && isGeminiOmniModel(node.data?.model) && ["endFrameIn", "referenceVideoIn", "referenceAudioIn"].includes(portId)) return true;
  return node?.type === "videoModel" && isKlingO3Model(node.data?.model) && portId === "referenceAudioIn";
}

function videoModelUnsupportedInputMessage(model, portId) {
  if (portId === "directorIn" && !videoModelSupportsFilmDirector(model)) {
    return "Film Director is available only for Seedance 2.0, Kling O3 Pro, Kling O3 4K, and Gemini Omni Flash.";
  }
  if (isGeminiOmniModel(model) && portId === "endFrameIn") return "Gemini Omni Flash preview does not support end-frame interpolation.";
  if (isGeminiOmniModel(model) && portId === "referenceVideoIn") return "Gemini Omni Flash preview video references are not reliable yet.";
  if (isGeminiOmniModel(model) && portId === "referenceAudioIn") return "Gemini Omni Flash preview does not support uploaded audio references.";
  if (isKlingO3Model(model) && portId === "referenceAudioIn") return `${isKlingO34kModel(model) ? "Kling O3 4K" : "Kling O3 Pro"} generates native audio but does not accept reference audio files.`;
  return videoModelUnsupportedCharacterMessage(model);
}

function videoModelUnsupportedCharacterMessage(model) {
  if (isAuroraModel(model)) return "Creative Aurora does not support Character inputs.";
  if (isLumaVideoModel(model)) return "Luma Dream Machine video does not support Character inputs.";
  return "This video model does not support Character inputs.";
}

function videoModelSelectionPatch(data = {}, model) {
  if (isGeminiOmniModel(model)) {
    return {
      model,
      duration: isGeminiOmniModel(data.model) && geminiOmniDurationOptions.includes(data.duration) ? data.duration : "8 seconds",
      resolution: "720p",
      aspectRatio: isGeminiOmniModel(data.model) && geminiOmniAspectRatioOptions.includes(data.aspectRatio) ? data.aspectRatio : "16:9",
      generateAudio: data.generateAudio !== false
    };
  }

  if (isKlingO3Model(model)) {
    const is4k = isKlingO34kModel(model);
    return {
      model,
      duration: isKlingO3Model(data.model) && klingO3ProDurationOptions.includes(data.duration) ? data.duration : "15 seconds",
      resolution: is4k ? "4K" : "1080p",
      aspectRatio: isKlingO3Model(data.model) && klingO3ProAspectRatioOptions.includes(data.aspectRatio) ? data.aspectRatio : "16:9",
      generateAudio: data.generateAudio !== false,
      klingCfgScale: Math.min(1, Math.max(0, Number(data.klingCfgScale ?? 0.5))),
      negativePrompt: data.negativePrompt || ""
    };
  }

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

  if (isLumaVideoModel(model)) {
    return {
      model,
      duration: isLumaVideoModel(data.model) ? normalizedLumaVideoDurationLabel(data.duration) : "5 seconds",
      resolution: isLumaVideoModel(data.model) ? normalizedLumaVideoResolution(data.resolution) : "540p",
      aspectRatio: isLumaVideoModel(data.model) ? normalizedLumaVideoAspectRatio(data.aspectRatio) : "16:9",
      loop: Boolean(data.loop)
    };
  }

  if (!isHappyHorseModel(model)) {
    const resolutionOptions = isSeedanceFastModel(model) ? seedanceFastVideoResolutionOptions : seedanceVideoResolutionOptions;
    return {
      model,
      duration: seedanceVideoDurationOptions.includes(data.duration) ? data.duration : "15 seconds",
      resolution: resolutionOptions.includes(data.resolution) ? data.resolution : "720p",
      aspectRatio: seedanceVideoAspectRatioOptions.includes(data.aspectRatio) ? data.aspectRatio : "16:9 (Landscape)",
      generateAudio: data.generateAudio !== false
    };
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

function isSeedanceFastModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("seedance") && normalized.includes("fast");
}

function normalizeImageModelResolution(value) {
  return imageResolutionOptions.includes(value) ? value : "2K";
}

function normalizeAutoAspectModel(value) {
  return autoAspectModelOptions.includes(value) ? value : imageModelNames.openAiImage2;
}

function normalizedLumaVideoDurationLabel(value) {
  const seconds = String(value || "").match(/\d+/)?.[0] || "5";
  return lumaVideoDurationOptions.includes(`${seconds} seconds`) ? `${seconds} seconds` : "5 seconds";
}

function normalizedLumaVideoResolution(value) {
  return lumaVideoResolutionOptions.includes(value) ? value : "540p";
}

function normalizedLumaVideoAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return lumaVideoAspectRatioOptions.includes(normalized) ? normalized : "16:9";
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

function isUtilityQwenCameraEditModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("qwen") && normalized.includes("camera");
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
    if (isUtilityQwenCameraEditModel(imageModel)) return ["imageIn"];
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
  if (isUtilityQwenCameraEditModel(normalized)) return utilityImageModelNames.qwenCameraEdit;
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

function inputPortDefinitionsForNode(node) {
  const basePorts = getNodeConfig(node?.type)?.input || [];
  return node?.type === "composer" ? [...basePorts, ...composerCharacterInputPortsForNode(node)] : basePorts;
}

function outputPortDefinitionsForNode(node) {
  const basePorts = getNodeConfig(node?.type)?.output || [];
  if (node?.type === "frameIt") return basePorts.map((port) => ({
    ...port,
    disabled: !node?.data?.resultUrl,
    disabledReason: "Capture the Frame It view before connecting it"
  }));
  if (node?.type === "storyboard") return [
    ...basePorts.map((port) => ({
      ...port,
      disabled: !node?.data?.storyboardBoardUrl,
      disabledReason: "Lock the Storyboard board before connecting it"
    })),
    ...storyboardFrameOutputPortsForNode(node)
  ];
  if (node?.type === "autoAspect") return [...basePorts, ...autoAspectOutputPortsForNode(node)];
  if (node?.type === "text") return [{ id: "promptOut", label: "Prompt", color: portColors.prompt }];
  return basePorts;
}

function inputPortIdsForNode(node) {
  return inputPortDefinitionsForNode(node).map((port) => port.id);
}

function activeInputPortIdsForNode(node) {
  if (node?.type === "utility") {
    return utilityInputPortIds(node.data?.utilityMode, node.data?.utilityImageModel, node.data?.utilityVideoModel);
  }

  if (node?.type === "storyboard") {
    return [
      "directorIn",
      "sceneDescriptionIn",
      "sceneReferenceIn",
      ...(node.data?.useStoryboardStyle === false ? ["styleIn", "transferIn", "characterIn"] : [])
    ];
  }

  if (node?.type === "imageModel") {
    return inputPortIdsForNode(node).filter((portId) => !isImageModelUnsupportedInput(node, portId));
  }

  if (node?.type === "videoModel") {
    return inputPortIdsForNode(node).filter((portId) => !isVideoModelUnsupportedInput(node, portId));
  }

  return inputPortIdsForNode(node);
}

function outputPortIdsForNode(node) {
  return outputPortDefinitionsForNode(node).map((port) => port.id);
}

function portDefinitionForNode(node, portId, role) {
  const ports = role === "input" ? inputPortDefinitionsForNode(node) : outputPortDefinitionsForNode(node);
  return ports.find((port) => port.id === portId) || null;
}

function portKindFromColor(color) {
  return Object.entries(portColors).find(([, value]) => value === color)?.[0] || "";
}

function portKindForNodePort(node, portId, role) {
  if (!node || !portId) return "";
  if (role === "input" && node.type === "preview" && portId === "sourceIn") return "preview";
  if (role === "input" && isComposerCharacterInputPort(portId, node)) return "character";
  if (role === "output" && node.type === "storyboard" && storyboardFrameIdFromOutputPort(portId)) return "image";
  if (role === "output" && node.type === "autoAspect" && autoAspectRatioFromOutputPort(portId)) return "image";
  if (role === "output" && node.type === "utility" && portId === "utilityOut") return utilityOutputType(node) === "video" ? "video" : "image";
  if (role === "output" && node.type === "text" && portId === "promptOut") return "prompt";
  return portKindFromColor(portDefinitionForNode(node, portId, role)?.color);
}

function acceptedInputPortKinds(node, portId) {
  const inputKind = portKindForNodePort(node, portId, "input");
  if (inputKind === "preview") return ["image", "video", "model3d", "transfer", "character"];
  return inputKind ? [inputKind] : [];
}

function portsAreCompatible(source, fromPort, target, toPort) {
  const outputKind = portKindForNodePort(source, fromPort, "output");
  const acceptedKinds = acceptedInputPortKinds(target, toPort);
  return Boolean(outputKind && acceptedKinds.includes(outputKind));
}

function getPortCompatibilityError(source, fromPort, target, toPort) {
  if (portsAreCompatible(source, fromPort, target, toPort)) return "";
  const outputKind = portKindForNodePort(source, fromPort, "output");
  const inputKind = portKindForNodePort(target, toPort, "input");
  if (inputKind === "preview") return "Preview accepts image, video, 3D, Mood Board, or Character outputs";
  if (!outputKind || !inputKind) return "Choose a valid connection";
  return `Connect matching port colors only: ${humanPortKindLabel(inputKind)} inputs do not accept ${humanPortKindLabel(outputKind)} outputs`;
}

function humanPortKindLabel(kind) {
  return {
    prompt: "Prompt",
    image: "Image",
    camera: "Camera",
    style: "Style",
    transfer: "Mood Board",
    character: "Character",
    director: "Film Director",
    video: "Video",
    audio: "Audio",
    model3d: "3D",
    preview: "Preview"
  }[kind] || "matching";
}

function storyboardFrameOutputPortsForNode(node) {
  if (node?.type !== "storyboard") return [];
  return normalizedStoryboardFrames(node.data?.storyboardFrames).map((frame, index) => ({
    id: storyboardFrameOutputPortId(frame.id),
    label: `Frame ${String(index + 1).padStart(2, "0")}`,
    color: portColors.image,
    disabled: !frame.resultUrl,
    disabledReason: "Generate this storyboard frame before connecting it"
  }));
}

function storyboardFrameOutputPortId(frameId) {
  return `frameOut:${frameId}`;
}

function storyboardFrameIdFromOutputPort(portId) {
  const value = String(portId || "");
  return value.startsWith("frameOut:") ? value.slice("frameOut:".length) : "";
}

function storyboardFrameForOutputPort(node, portId) {
  const frameId = storyboardFrameIdFromOutputPort(portId);
  if (!frameId) return null;
  return normalizedStoryboardFrames(node?.data?.storyboardFrames).find((frame) => frame.id === frameId) || null;
}

function autoAspectOutputPortsForNode(node) {
  if (node?.type !== "autoAspect") return [];
  return autoAspectTargetsForData(node.data).map((target) => {
    const result = autoAspectResultForTarget(node, target);
    const label = target.aspectRatio;
    return {
      id: autoAspectOutputPortId(target),
      label,
      color: portColors.image,
      disabled: !result?.url,
      disabledReason: `Generate ${label} before connecting it`
    };
  });
}

function autoAspectOutputPortId(target) {
  return `aspectOut:${typeof target === "string" ? target : autoAspectTargetKey(target)}`;
}

function autoAspectRatioFromOutputPort(portId) {
  const key = autoAspectTargetKeyFromOutputPort(portId);
  return key ? key.split("|")[0] : "";
}

function autoAspectTargetKeyFromOutputPort(portId) {
  const value = String(portId || "");
  return value.startsWith("aspectOut:") ? value.slice("aspectOut:".length) : "";
}

function autoAspectTargetKey(target = {}) {
  const aspectRatio = String(target?.aspectRatio || "").trim();
  return aspectRatio;
}

function autoAspectTargetsForData(data = {}) {
  return normalizedAutoAspectRatios(data).map((ratio) => autoAspectTargetsForRatio(ratio)[0]).filter(Boolean);
}

function autoAspectTargetsForRatio(ratio) {
  const cleanRatio = String(ratio || "").trim();
  if (!cleanRatio) return [];
  return [{
    key: cleanRatio,
    aspectRatio: cleanRatio
  }];
}

function normalizedAutoAspectRatios(data = {}) {
  const source = Array.isArray(data.selectedAspectRatios) ? data.selectedAspectRatios : autoAspectDefaultRatios;
  const ratios = [...new Set(source.map((ratio) => String(ratio || "").trim()).filter((ratio) => openAiImageAspectRatios.includes(ratio)))];
  return ratios;
}

function normalizedAutoAspectResults(data = {}) {
  return (Array.isArray(data.autoAspectResults) ? data.autoAspectResults : [])
    .map((result) => {
      const aspectRatio = String(result?.aspectRatio || "").trim();
      const normalized = {
        key: autoAspectTargetKey({ aspectRatio }),
        aspectRatio,
        url: result?.url || "",
        label: result?.label || "",
        text: result?.text || "",
        cost: result?.cost ?? null,
        sourceUrl: result?.sourceUrl || ""
      };
      return {
        ...normalized,
        key: normalized.key || autoAspectTargetKey(normalized)
      };
    })
    .filter((result) => openAiImageAspectRatios.includes(result.aspectRatio) && result.url);
}

function autoAspectResultForTarget(node, target) {
  const targetKey = typeof target === "string" ? target : autoAspectTargetKey(target);
  return normalizedAutoAspectResults(node?.data).find((result) => result.key === targetKey) || null;
}

function autoAspectResultItems(data = {}) {
  return normalizedAutoAspectResults(data).map((result) => ({
    url: result.url,
    type: "image",
    label: result.label || `${result.aspectRatio} Auto Aspect`,
    text: result.text || "",
    cost: result.cost,
    aspectRatio: result.aspectRatio,
    key: result.key,
    sourceUrl: result.sourceUrl
  }));
}

function autoAspectOutputItem(source, edge) {
  const targetKey = autoAspectTargetKeyFromOutputPort(edge?.from?.port);
  if (!targetKey) return null;
  const result = autoAspectResultForTarget(source, targetKey);
  if (!result?.url) return null;
  return {
    url: result.url,
    type: "image",
    label: result.label || `${result.aspectRatio} Auto Aspect`,
    text: result.text || "",
    cost: result.cost,
    aspectRatio: result.aspectRatio,
    key: result.key,
    sourceUrl: result.sourceUrl
  };
}

function resetAutoAspectOutputPatch() {
  return {
    autoAspectResults: [],
    resultItems: [],
    resultUrl: "",
    resultText: "",
    selectedResultIndex: 0,
    status: "",
    error: ""
  };
}

function composerCharacterInputPortIdsForNode(node) {
  return composerCharacterInputPortsForNode(node).map((port) => port.id);
}

function composerCharacterInputPortsForNode(node) {
  if (node?.type !== "composer") return [];
  return normalizedComposerScene(node.data?.composerScene).maquettes.map((maquette, index) => ({
    id: composerCharacterPortId(maquette.id),
    label: composerMaquetteLabel(maquette, index),
    color: portColors.character,
    maquetteId: maquette.id
  }));
}

function composerCharacterPortId(maquetteId) {
  return `${composerCharacterPortPrefix}${maquetteId}`;
}

function composerMaquetteIdFromCharacterPort(portId) {
  const value = String(portId || "");
  return value.startsWith(composerCharacterPortPrefix) ? value.slice(composerCharacterPortPrefix.length) : "";
}

function isComposerCharacterInputPort(portId, node = null) {
  const maquetteId = composerMaquetteIdFromCharacterPort(portId);
  if (!maquetteId) return false;
  if (!node || node.type !== "composer") return true;
  return normalizedComposerScene(node.data?.composerScene).maquettes.some((maquette) => maquette.id === maquetteId);
}

function composerMaquetteLabel(maquette = {}, index = 0) {
  return String(maquette.name || `Maquette ${index + 1}`).trim() || `Maquette ${index + 1}`;
}

function configTitleFallback(type) {
  return nodeTypeLabel(type);
}

function nodeResultMediaType(node) {
  if (!node?.data?.resultUrl && !Array.isArray(node?.data?.resultItems)) return "";
  if (node.type === "utility") return utilityResultType(node);
  if (node.type === "image" || node.type === "video" || node.type === "audio" || node.type === "model3d") return node.type;
  if (node.type === "videoModel") return "video";
  if (node.type === "imageModel" || node.type === "autoAspect" || node.type === "camera" || node.type === "composer" || node.type === "frameIt" || node.type === "character" || node.type === "storyboard") return "image";
  return "";
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
    const highlightIncoming = node.type === "storyboard" ? expandStoryboardDirectorIncoming(incoming, incomingByNode) : incoming;
    const prompt = node.type === "storyboard"
      ? [
          storyboardSceneDescriptionForNode(node, highlightIncoming),
          ...normalizedStoryboardFrames(node.data.storyboardFrames).map((frame) => frame.prompt || "")
        ].join("\n")
      : connectedText(incoming.promptIn) || node.data.prompt || "";
    const matches = node.type === "imageModel" && !isSam3ImageModel(node.data.model) && !isImageModelUnsupportedInput(node, "characterIn")
      ? imageModelCharacterTagMatches(prompt, incoming.characterIn)
      : node.type === "videoModel" && !isWanFunControlModel(node.data.model) && videoModelSupportsCharacterInput(node.data.model)
        ? videoModelReferenceTagMatches(prompt, incoming)
        : node.type === "storyboard"
          ? storyboardSceneTagMatches(prompt, node, highlightIncoming, incomingByNode)
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
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const activeNodeIds = new Set(nodes.filter((node) => node.data?.status === "running").map((node) => node.id));
  const activeEdgeIds = new Set();
  const activeImageModelComposerIds = new Set();

  edges.forEach((edge) => {
    if (!activeNodeIds.has(edge.to.nodeId)) return;

    activeEdgeIds.add(edge.id);

    const source = nodeMap.get(edge.from.nodeId);
    const target = nodeMap.get(edge.to.nodeId);
    if (source?.type === "composer" && target?.type === "imageModel" && edge.from.port === "imageOut") {
      activeImageModelComposerIds.add(source.id);
    }
  });

  if (activeImageModelComposerIds.size) {
    edges.forEach((edge) => {
      const target = nodeMap.get(edge.to.nodeId);
      if (target?.type === "composer" && activeImageModelComposerIds.has(target.id) && isComposerCharacterInputPort(edge.to.port, target)) {
        activeEdgeIds.add(edge.id);
      }
    });
  }

  return activeEdgeIds;
}

function buildInactiveEdgeIds(nodes, edges) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return new Set(
    edges
      .filter((edge) => {
        const source = nodeMap.get(edge.from.nodeId);
        const target = nodeMap.get(edge.to.nodeId);
        if (isImageModelUnsupportedInput(target, edge.to.port)) return true;
        if (isImageModelUnsupportedSource(target, source)) return true;
        if (isVideoModelUnsupportedInput(target, edge.to.port)) return true;
        if (source?.type === "autoAspect" && !autoAspectOutputItem(source, edge)?.url) return true;
        if (source?.type === "frameIt" && !source.data?.resultUrl) return true;
        if (source?.type === "skillDirector" && (!source.data?.skillDirectorBuilt || !source.data?.resultText)) return true;
        return (
          (source?.type === "transfer" || source?.type === "character") &&
          (!source.data?.locked || !source.data?.activated || !source.data?.resultUrl)
        );
      })
      .map((edge) => edge.id)
  );
}

function connectedText(items = []) {
  return items
    .map(({ source }) => {
      if (source.type === "text") return source.data.resultText || source.data.text;
      if (source.type === "skillDirector") return source.data.resultText || source.data.text;
      if (source.type === "plainText") return source.data.text;
      if (source.type === "imageModel" || source.type === "videoModel" || source.type === "utility") return source.data.resultText;
      return source.data.title;
    })
    .filter(Boolean)
    .join("\n");
}

function directorPackageConnections(items = []) {
  return items.filter(({ source, edge }) => {
    return (
      source?.type === "skillDirector" &&
      edge?.from?.port === "directorOut" &&
      source.data?.skillDirectorBuilt &&
      source.data?.resultText
    );
  });
}

function connectedDirectorPackageText(items = []) {
  return directorPackageConnections(items)
    .map(({ source }) => source.data.resultText)
    .filter(Boolean)
    .join("\n\n");
}

function connectedDirectorPackageSource(items = []) {
  return directorPackageConnections(items)[0]?.source || null;
}

function directorPackageForVideo(source = null, incomingByNode = {}) {
  if (!source?.data?.skillDirectorBuilt || !source.data.resultText) return null;
  const directorIncoming = incomingByNode[source.id] || {};
  const references = [
    ...(directorIncoming.characterIn || []).map(({ source: itemSource, edge }) => ({
      type: "character",
      tag: characterTag(itemSource),
      url: connectedOutputUrl(itemSource, edge)
    })),
    ...(directorIncoming.locationIn || []).map(({ source: itemSource, edge }) => ({
      type: "location",
      tag: cleanPromptTag(itemSource.data?.title || sourceLabel(itemSource)),
      url: connectedOutputUrl(itemSource, edge)
    })),
    ...(directorIncoming.imageIn || []).map(({ source: itemSource, edge }) => ({
      type: "prop",
      tag: cleanPromptTag(itemSource.data?.title || sourceLabel(itemSource)),
      url: connectedOutputUrl(itemSource, edge)
    }))
  ].filter((item) => item.tag && item.url);
  return {
    sceneName: source.data.sceneName || "",
    durationSeconds: source.data.skillDurationSeconds || "15",
    styleDirection: source.data.styleDirection || "",
    cameraDirection: source.data.motionDirection || "",
    sceneOverview: source.data.sceneOverview || "",
    shotList: source.data.shotList || "",
    shotListNotes: source.data.shotListNotes || "",
    finalPrompt: source.data.resultText || "",
    references
  };
}

function directorPackageStoryboardSceneDescription(source = null) {
  if (!source?.data) return "";
  const data = source.data;
  return [
    data.sceneName ? `Scene: ${data.sceneName}` : "",
    data.sceneOverview ? `Scene overview:\n${data.sceneOverview}` : "",
    data.motionDirection ? `Camera and blocking direction:\n${data.motionDirection}` : "",
    data.shotList ? `Shot list:\n${data.shotList}` : "",
    !data.shotList && data.resultText ? `Film Director shot plan:\n${stripDirectorVisualStyleForStoryboard(data.resultText)}` : ""
  ].filter(Boolean).join("\n\n");
}

function stripDirectorVisualStyleForStoryboard(value = "") {
  return String(value || "")
    .split(/\n{2,}/)
    .filter((block) => !/^(Style Direction|Scene rules|Camera rules):/i.test(block.trim()))
    .join("\n\n")
    .replace(/\b(cinematic naturalism|premium live-action realism|feature film quality|real cine lens language|motivated light|24fps smooth motion|natural ambience|environmental SFX only)\b[, ]*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function directorPackageShotCount(source = null) {
  if (!source?.data) return 0;
  const direct = Number.parseInt(source.data.skillShotCount || source.data.lastRunShotCount || source.data.lastRunActualShotCount || "", 10);
  if (Number.isFinite(direct) && direct > 0) return Math.min(storyboardMaxFrameCount, direct);
  const cuts = String(source.data.shotList || source.data.resultText || "").match(/\bCUT\s+\d+\b/gi);
  return Math.min(storyboardMaxFrameCount, cuts?.length || 0);
}

function uniqueConnectionItems(items = []) {
  const seen = new Set();
  return items.filter(({ source, edge }) => {
    const key = `${source?.id || ""}:${edge?.from?.port || ""}:${edge?.to?.port || ""}`;
    if (!source || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function expandVideoDirectorPackageIncoming(incoming = {}, incomingByNode = {}, options = {}) {
  const directorItems = directorPackageConnections(incoming.directorIn || []);
  if (!directorItems.length) return incoming;

  const referenceImageIn = [...(incoming.referenceImageIn || [])];
  const characterIn = [...(incoming.characterIn || [])];
  const includeCharacters = options.includeCharacters !== false;

  directorItems.forEach(({ source }) => {
    const directorIncoming = incomingByNode?.[source.id] || {};
    referenceImageIn.push(...(directorIncoming.locationIn || []), ...(directorIncoming.imageIn || []));
    if (includeCharacters) characterIn.push(...(directorIncoming.characterIn || []));
  });

  return {
    ...incoming,
    referenceImageIn: uniqueConnectionItems(referenceImageIn),
    characterIn: includeCharacters ? uniqueConnectionItems(characterIn) : incoming.characterIn || []
  };
}

function expandStoryboardDirectorIncoming(incoming = {}, incomingByNode = {}) {
  const directorItems = directorPackageConnections(incoming.directorIn || []);
  if (!directorItems.length) return incoming;

  const sceneReferenceIn = [];
  const characterIn = [];

  directorItems.forEach(({ source }) => {
    const directorIncoming = incomingByNode?.[source.id] || {};
    sceneReferenceIn.push(...(directorIncoming.locationIn || []), ...(directorIncoming.imageIn || []));
    characterIn.push(...(directorIncoming.characterIn || []));
  });

  return {
    ...incoming,
    sceneDescriptionIn: [],
    sceneReferenceIn: uniqueConnectionItems(sceneReferenceIn),
    characterIn: uniqueConnectionItems(characterIn)
  };
}

function connectedOutputItem(source, edge) {
  if (source?.type === "storyboard") return storyboardOutputItem(source, edge);
  if (source?.type === "autoAspect") return autoAspectOutputItem(source, edge);
  const url = source?.data?.resultUrl || "";
  if (!url) return null;
  return {
    url,
    type: previewMediaType(source, edge || { from: { port: "" }, to: { port: "" } }),
    label: sourceLabel(source),
    text: source?.data?.resultText || ""
  };
}

function connectedOutputUrl(source, edge) {
  return connectedOutputItem(source, edge)?.url || "";
}

function connectedAssetUrls(items = []) {
  return items.map(({ source, edge }) => connectedOutputUrl(source, edge)).filter(Boolean);
}

function connectedAssetItems(items = []) {
  return items
    .map(({ source, edge }) => {
      const outputItem = connectedOutputItem(source, edge);
      const url = outputItem?.url || connectedOutputUrl(source, edge);
      if (!url) return null;
      return {
        url,
        type: outputItem?.type || previewMediaType(source, edge || { from: { port: "" }, to: { port: "" } }),
        label: outputItem?.label || sourceLabel(source)
      };
    })
    .filter(Boolean);
}

function uniqueAssetItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function connectedAssetLabels(items = []) {
  return items
    .filter(({ source, edge }) => connectedOutputUrl(source, edge))
    .map(({ source, edge }) => connectedOutputItem(source, edge)?.label || source.data.title || sourceLabel(source));
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

function imageModelCharacterTagMatches(prompt, items = [], incomingByNode = null) {
  const text = String(prompt || "");
  return activeConnectedCharacterSources(items, incomingByNode)
    .map((source, index) => ({
      nodeId: source.id,
      tag: characterTag(source),
      color: portColors.character || referenceTagPalette[index % referenceTagPalette.length],
      type: "character"
    }))
    .filter((match) => promptHasTag(text, match.tag));
}

function storyboardCharacterTagMatches(prompt, node, externalItems = [], incomingByNode = null) {
  const text = String(prompt || "");
  const internalCandidates = storyboardUsesInternalCharacters(node)
    ? normalizedStoryboardCharacters(node.data?.storyboardCharacters)
        .filter((character) => character.name || character.portrait?.localUrl)
        .map((character, index) => ({
          nodeId: `${node.id}:${character.id}`,
          tag: storyboardCharacterTag(character),
          color: referenceTagPalette[index % referenceTagPalette.length],
          type: "character"
        }))
    : [];
  const externalCandidates = activeConnectedCharacterSources(externalItems, incomingByNode)
    .map((source, index) => ({
      nodeId: source.id,
      tag: characterTag(source),
      color: referenceTagPalette[(internalCandidates.length + index) % referenceTagPalette.length],
      type: "character"
    }));
  const uniqueCandidates = new Map();

  [...internalCandidates, ...externalCandidates].forEach((candidate) => {
    if (!candidate.tag) return;
    uniqueCandidates.set(candidate.tag.toLowerCase(), candidate);
  });

  return [...uniqueCandidates.values()].filter((match) => promptHasTag(text, match.tag));
}

function storyboardSceneReferenceTagMatches(prompt, items = [], colorOffset = 0) {
  const text = String(prompt || "");
  return items
    .map(({ source, edge }, index) => {
      const outputItem = connectedOutputItem(source, edge);
      const url = outputItem?.url || connectedOutputUrl(source, edge);
      if (!url) return null;
      const label = cleanImageReferenceLabel(source.data?.title || outputItem?.label || sourceLabel(source) || `Reference ${index + 1}`) || `Reference ${index + 1}`;
      return {
        nodeId: source.id,
        tag: cleanPromptTag(source.data?.title || label) || `Reference${index + 1}`,
        color: portColors.image || referenceTagPalette[(colorOffset + index) % referenceTagPalette.length],
        type: "scene-reference"
      };
    })
    .filter(Boolean)
    .filter((match) => promptHasTag(text, match.tag));
}

function storyboardSceneTagMatches(prompt, node, incoming = {}, incomingByNode = null) {
  const characterMatches = storyboardCharacterTagMatches(prompt, node, incoming.characterIn, incomingByNode);
  const referenceMatches = storyboardSceneReferenceTagMatches(prompt, incoming.sceneReferenceIn || [], characterMatches.length);
  const uniqueMatches = new Map();

  [...characterMatches, ...referenceMatches].forEach((match) => {
    if (!match.tag) return;
    uniqueMatches.set(`${match.nodeId}:${match.tag}`.toLowerCase(), match);
  });

  return [...uniqueMatches.values()];
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
  if (!imageUrl) throw new Error("Connect an image to the Utility node.");

  const { response, data } = await nodeApi.qwenCameraEdit({
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
  });
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

  if (isUtilityQwenCameraEditModel(modelName)) {
    return [await runCameraQwenEdit({ node, incoming, projectId, projectName, workflowContext })];
  }

  const imageUrl = connectedAssetUrls(incoming.imageIn).at(-1);
  if (!imageUrl) throw new Error("Connect an image to the Utility node.");
  const model = normalizedUtilityImageModelName(node.data.utilityImageModel);

  if (isUtilityColorIdMatteModel(model)) {
    return [await runColorIdMatteUtilityImage({ node, imageUrl, projectId, projectName, workflowContext })];
  }

  const { response, data } = await nodeApi.utilityImage({
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

  const { response, data } = await nodeApi.colorIdMatteForm(form);
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

    const { response, data } = await nodeApi.uploadAsset(form, "Still frame upload");
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

async function runVideoModelGeneration({ node, prompt, incoming, incomingByNode, projectId, projectName, workflowContext, index }) {
  const characterConnections = videoModelSupportsCharacterInput(node.data.model) ? incoming.characterIn : [];
  const characterReferences = connectedCharacterReferences(characterConnections);
  const characterVoices = connectedCharacterVoiceUrls(characterConnections);
  const referenceImageItems = uniqueAssetItems([
    ...connectedAssetItems(incoming.referenceImageIn),
    ...characterReferences.map((item) => ({ url: item.url, label: item.label, type: "image" }))
  ]);
  const referenceVideoItems = uniqueAssetItems(connectedAssetItems(incoming.referenceVideoIn));
  const directorSource = videoModelSupportsFilmDirector(node.data.model) ? connectedDirectorPackageSource(incoming.directorIn) : null;
  const { response, data } = await nodeApi.generateVideo(buildVideoGenerationRequest({
    node,
    prompt,
    workflowContext,
    projectId,
    projectName,
    startFrameUrls: connectedAssetUrls(incoming.startFrameIn),
    endFrameUrls: connectedAssetUrls(incoming.endFrameIn),
    referenceImageUrls: referenceImageItems.map((item) => item.url),
    referenceImageLabels: referenceImageItems.map((item) => item.label),
    characterReferenceUrls: characterReferences.map((item) => item.url),
    characterReferenceLabels: characterReferences.map((item) => item.label),
    referenceVideoUrls: referenceVideoItems.map((item) => item.url),
    referenceVideoLabels: referenceVideoItems.map((item) => item.label),
    referenceAudioUrls: [...new Set([...connectedAudioUrls(incoming.referenceAudioIn), ...characterVoices])],
    filmDirector: directorPackageForVideo(directorSource, incomingByNode)
  }));
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Video generation failed."}`);

  return normalizeVideoGenerationResult(data, index);
}

async function runUtilityVideoGeneration({ node, prompt, incoming, projectId, projectName, workflowContext, index }) {
  const model = normalizedUtilityVideoModelName(node.data.utilityVideoModel || utilityVideoModelNames.wanFunControl);
  const selectedColor = normalizeColorIdMatteColor(node.data.colorIdMatteColor);
  const { response, data } = await nodeApi.utilityVideo(buildUtilityVideoRequest({
    node,
    prompt,
    model,
    workflowContext,
    projectId,
    projectName,
    referenceImageUrls: connectedAssetUrls(incoming.referenceImageIn),
    referenceVideoUrls: connectedAssetUrls(incoming.referenceVideoIn),
    maskVideoUrls: connectedAssetUrls(incoming.maskVideoIn),
    colorIdMatte: {
      selectedColor: selectedColor ? rgbToHex(selectedColor) : "",
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
    voidNumFrames: normalizeVoidVideoFrameCount(node.data.voidNumFrames)
  }), "Utility video");
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Utility video failed."}`);

  return normalizeUtilityVideoGenerationResult(data, index);
}

function connectedPreviewSources(items = []) {
  return items
    .map(({ source, edge }) => {
      const sourceType = previewMediaType(source, edge);
      const resultItems = previewSourceResultItems(source, edge, sourceType);
      if (!resultItems.length) return null;
      const outputSpecificLabel = (source.type === "storyboard" || source.type === "autoAspect") && resultItems.length === 1 ? resultItems[0]?.label : "";
      const sourceName = outputSpecificLabel || sourceLabel(source);
      const selectedResultIndex = Math.trunc(Number(source.data.selectedResultIndex));
      return {
        id: `${source.id}:${edge.from.port}`,
        sourceNodeId: source.id,
        sourcePort: edge.from.port,
        label: sourceName,
        type: sourceType,
        items: resultItems.map((item, index, allItems) => ({
          ...item,
          sourceNodeId: source.id,
          sourceResultIndex: index,
          sourceSelectedResult: index === selectedResultIndex || item.url === source.data.resultUrl,
          type: item.type || sourceType,
          label: allItems.length > 1 ? `${sourceName} ${index + 1}` : sourceName
        }))
      };
    })
    .filter(Boolean);
}

function previewSourceResultItems(source, edge, sourceType = "image") {
  if (!source) return [];
  if (source.type === "storyboard" || source.type === "autoAspect") {
    const outputItem = connectedOutputItem(source, edge);
    return outputItem?.url ? [{ ...outputItem, type: outputItem.type || sourceType }] : [];
  }

  const resultItems = normalizedResultItems(source.data?.resultItems, source.data?.resultUrl, sourceType);
  if (resultItems.length) return resultItems;

  const outputItem = connectedOutputItem(source, edge);
  if (outputItem?.url) return [{ ...outputItem, type: outputItem.type || sourceType }];

  const localUrl = source.data?.localUrl || source.data?.asset?.localUrl || "";
  if (!localUrl) return [];
  return [{
    url: localUrl,
    type: sourceType,
    label: sourceLabel(source),
    fileName: source.data?.fileName || fileNameFromLocalUrl(localUrl),
    mimeType: source.data?.mimeType || mimeForOutputItem({ url: localUrl, type: sourceType })
  }];
}

function normalizedPreviewLayoutItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const url = String(item?.url || "").trim();
      if (!url) return null;
      const width = previewLayoutDimension(item?.width || item?.naturalWidth);
      const height = previewLayoutDimension(item?.height || item?.naturalHeight);
      const sourceUrl = String(item?.sourceUrl || url).trim();
      return {
        id: String(item?.id || `layout-${index}-${url}`).slice(0, 120),
        url,
        sourceUrl,
        thumbnailUrl: String(item?.thumbnailUrl || "").trim(),
        type: "image",
        label: item?.label || item?.fileName || fileNameFromLocalUrl(url) || `Layout image ${index + 1}`,
        fileName: item?.fileName || fileNameFromLocalUrl(url),
        mimeType: item?.mimeType || mimeForOutputItem({ url, type: "image" }),
        ...(width && height ? { width, height } : {})
      };
    })
    .filter(Boolean);
}

function createPreviewLayoutItem(item) {
  const url = String(item?.url || "").trim();
  const width = previewLayoutDimension(item?.width || item?.naturalWidth);
  const height = previewLayoutDimension(item?.height || item?.naturalHeight);
  const sourceUrl = String(item?.sourceUrl || url).trim();
  return {
    id: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    sourceUrl,
    thumbnailUrl: String(item?.thumbnailUrl || "").trim(),
    type: "image",
    label: item?.label || item?.fileName || fileNameFromLocalUrl(url) || "Layout image",
    fileName: item?.fileName || fileNameFromLocalUrl(url),
    mimeType: item?.mimeType || mimeForOutputItem({ url, type: "image" }),
    ...(width && height ? { width, height } : {})
  };
}

function normalizedPreviewLayoutHiddenUrls(urls = []) {
  return [...new Set((Array.isArray(urls) ? urls : [])
    .map((url) => String(url || "").trim())
    .filter(Boolean))];
}

function previewLayoutImageItems(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.type === "image" && item.url)
    .map((item) => ({ ...item, sourceUrl: item.sourceUrl || item.url }))
    .filter((item) => {
      const key = String(item.sourceUrl || item.url || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function previewLayoutSourceItems(source = null) {
  const items = Array.isArray(source?.items) ? source.items : [];
  const storyboardLayoutItems = items.flatMap((item) => (
    Array.isArray(item?.layoutItems) ? item.layoutItems : []
  ));
  return previewLayoutImageItems(storyboardLayoutItems.length ? storyboardLayoutItems : items);
}

function mergePreviewImagesIntoLayout(layoutItems = [], sourceItems = [], hiddenUrls = []) {
  const hidden = new Set(normalizedPreviewLayoutHiddenUrls(hiddenUrls));
  const existing = new Set();
  const nextItems = normalizedPreviewLayoutItems(layoutItems);
  nextItems.forEach((item) => {
    if (item.url) existing.add(item.url);
    if (item.sourceUrl) existing.add(item.sourceUrl);
  });

  previewLayoutImageItems(sourceItems).forEach((item) => {
    const sourceUrl = String(item.sourceUrl || item.url || "").trim();
    if (!sourceUrl || hidden.has(sourceUrl) || hidden.has(item.url) || existing.has(sourceUrl) || existing.has(item.url)) return;
    const nextItem = createPreviewLayoutItem({ ...item, sourceUrl });
    nextItems.push(nextItem);
    existing.add(nextItem.url);
    existing.add(nextItem.sourceUrl);
  });

  return nextItems;
}

function previewLayoutDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function previewLayoutAspectValue(item = {}) {
  const width = previewLayoutDimension(item.width);
  const height = previewLayoutDimension(item.height);
  return width && height ? `${width} / ${height}` : "16 / 9";
}

function previewLayoutColumnCount(items = []) {
  return Math.max(1, Math.min(3, items.length || 1));
}

function previewLayoutExportCaption(item, index = 0) {
  const label = String(item?.label || "").replace(/\s+/g, " ").trim();
  if (isUsefulPreviewLayoutCaption(label, item)) return label;
  return `Frame ${index + 1}.`;
}

function isUsefulPreviewLayoutCaption(label = "", item = {}) {
  if (!label) return false;
  const fileName = String(item?.fileName || fileNameFromLocalUrl(item?.url) || "").trim();
  const fileBase = fileName ? fileName.replace(/\.[A-Za-z0-9]+$/, "") : "";
  if (label === fileName || label === fileBase) return false;
  if (/\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i.test(label)) return false;
  if (/^20\d{2}-\d{2}-\d{2}T\d{2}/.test(label)) return false;
  if (/\bgenerated\s+(image|video)\s*,?\s+unique\s+id\b/i.test(label)) return false;
  return true;
}

function samePreviewLayoutItems(first = [], second = []) {
  if (first.length !== second.length) return false;
  return first.every((item, index) => item.id === second[index]?.id && item.url === second[index]?.url && item.label === second[index]?.label);
}

async function createEditedPreviewLayoutImageBlob(sourceUrl, edit = {}) {
  const image = await loadCanvasImage(sourceUrl);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) throw new Error("Could not read layout image dimensions.");

  const crop = edit.type === "crop"
    ? previewCropRectToPixels(edit.cropRect, imageWidth, imageHeight)
    : { x: 0, y: 0, width: imageWidth, height: imageHeight };
  const canvas = document.createElement("canvas");
  const rotateClockwise = edit.type === "rotateClockwise";
  canvas.width = Math.max(1, Math.round(rotateClockwise ? crop.height : crop.width));
  canvas.height = Math.max(1, Math.round(rotateClockwise ? crop.width : crop.height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image editor.");

  const flipX = edit.type === "flipHorizontal";
  const flipY = edit.type === "flipVertical";
  context.save();
  if (rotateClockwise) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  } else {
    context.translate(flipX ? canvas.width : 0, flipY ? canvas.height : 0);
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  }
  context.restore();

  if (edit.type === "curves") {
    applyPreviewCurveToCanvas(context, canvas.width, canvas.height, edit.points);
  }

  if (edit.type === "tone") {
    applyPreviewToneAdjustmentsToCanvas(context, canvas.width, canvas.height, edit.adjustments);
    applyPreviewCurveToCanvas(context, canvas.width, canvas.height, edit.points);
  }

  if (edit.type === "text") {
    drawPreviewTextOverlay(context, canvas.width, canvas.height, edit.overlay);
  }

  return canvasToBlob(canvas, "image/png", "Could not update layout image.");
}

async function createInpaintCompositePreviewLayoutBlob(sourceUrl, generatedUrl, maskDataUrl) {
  const [sourceImage, generatedImage, maskImage] = await Promise.all([
    loadCanvasImage(sourceUrl),
    loadCanvasImage(generatedUrl),
    loadCanvasImage(maskDataUrl)
  ]);
  const width = sourceImage.naturalWidth || sourceImage.width;
  const height = sourceImage.naturalHeight || sourceImage.height;
  if (!width || !height) throw new Error("Could not read inpaint image dimensions.");

  const originalCanvas = document.createElement("canvas");
  originalCanvas.width = width;
  originalCanvas.height = height;
  const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
  if (!originalContext) throw new Error("Could not prepare original image layer.");
  originalContext.drawImage(sourceImage, 0, 0, width, height);

  const generatedCanvas = document.createElement("canvas");
  generatedCanvas.width = width;
  generatedCanvas.height = height;
  const generatedContext = generatedCanvas.getContext("2d", { willReadFrequently: true });
  if (!generatedContext) throw new Error("Could not prepare generated image layer.");
  drawImageCover(generatedContext, generatedImage, 0, 0, width, height);

  const maskCanvas = createSoftInpaintMaskCanvas(maskImage, width, height);
  const originalData = originalContext.getImageData(0, 0, width, height);
  const generatedData = generatedContext.getImageData(0, 0, width, height);
  const maskData = maskCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
  if (!maskData) throw new Error("Could not prepare inpaint mask.");

  for (let index = 0; index < originalData.data.length; index += 4) {
    const alpha = maskData.data[index + 3] / 255;
    if (alpha <= 0) continue;
    const inverse = 1 - alpha;
    originalData.data[index] = generatedData.data[index] * alpha + originalData.data[index] * inverse;
    originalData.data[index + 1] = generatedData.data[index + 1] * alpha + originalData.data[index + 1] * inverse;
    originalData.data[index + 2] = generatedData.data[index + 2] * alpha + originalData.data[index + 2] * inverse;
    originalData.data[index + 3] = 255;
  }

  originalContext.putImageData(originalData, 0, 0);
  return canvasToBlob(originalCanvas, "image/png", "Could not blend inpaint edit.");
}

function createSoftInpaintMaskCanvas(maskImage, width, height) {
  const binaryCanvas = document.createElement("canvas");
  binaryCanvas.width = width;
  binaryCanvas.height = height;
  const binaryContext = binaryCanvas.getContext("2d", { willReadFrequently: true });
  if (!binaryContext) throw new Error("Could not prepare inpaint mask.");
  binaryContext.drawImage(maskImage, 0, 0, width, height);
  const imageData = binaryContext.getImageData(0, 0, width, height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = (imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2]) / 3;
    const masked = imageData.data[index + 3] > 8 && luminance > 24;
    imageData.data[index] = 255;
    imageData.data[index + 1] = 255;
    imageData.data[index + 2] = 255;
    imageData.data[index + 3] = masked ? 255 : 0;
  }
  binaryContext.clearRect(0, 0, width, height);
  binaryContext.putImageData(imageData, 0, 0);

  const feather = Math.max(2, Math.min(12, Math.round(Math.min(width, height) * 0.004)));
  const softCanvas = document.createElement("canvas");
  softCanvas.width = width;
  softCanvas.height = height;
  const softContext = softCanvas.getContext("2d");
  if (!softContext) throw new Error("Could not feather inpaint mask.");
  softContext.filter = `blur(${feather}px)`;
  softContext.drawImage(binaryCanvas, 0, 0);
  softContext.filter = "none";
  softContext.globalCompositeOperation = "destination-in";
  softContext.drawImage(binaryCanvas, 0, 0);
  softContext.globalCompositeOperation = "source-over";
  return softCanvas;
}

function normalizePreviewTextOverlay(overlay = {}) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(String(overlay?.color || "")) ? String(overlay.color) : "#f4f0e8";
  const safeFont = String(overlay?.font || "Inter").replace(/[^\w\s"',-]/g, "").trim() || "Inter";
  return {
    text: String(overlay?.text || "").slice(0, 220),
    x: clamp(Number(overlay?.x) || 50, 0, 100),
    y: clamp(Number(overlay?.y) || 50, 0, 100),
    size: clamp(Number(overlay?.size) || 7, 2, 24),
    color: safeColor,
    font: safeFont
  };
}

function wrapCanvasTextLines(context, text, maxWidth, maxLines = 8) {
  const output = [];
  const paragraphs = String(text || "").split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        output.push(line);
        line = word;
      } else {
        line = candidate;
      }
      if (output.length >= maxLines) break;
    }
    if (output.length >= maxLines) break;
    if (line) output.push(line);
    if (output.length >= maxLines) break;
  }
  return output.slice(0, maxLines);
}

function drawPreviewTextOverlay(context, width, height, overlay = {}) {
  const normalized = normalizePreviewTextOverlay(overlay);
  if (!normalized.text.trim()) return;
  const fontSize = Math.max(10, Math.round(Math.min(width, height) * (normalized.size / 100)));
  const x = (normalized.x / 100) * width;
  const y = (normalized.y / 100) * height;
  const maxWidth = width * 0.86;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${fontSize}px "${normalized.font}", Arial, sans-serif`;
  const lines = wrapCanvasTextLines(context, normalized.text, maxWidth, 8);
  const lineHeight = fontSize * 1.14;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  context.fillStyle = normalized.color;
  lines.forEach((line, index) => {
    context.fillText(line, x, startY + index * lineHeight, maxWidth);
  });
  context.restore();
}

function applyPreviewToneAdjustmentsToCanvas(context, width, height, adjustments = {}) {
  const imageData = context.getImageData(0, 0, width, height);
  const brightness = clamp(Number(adjustments?.brightness) || 0, -100, 100);
  const contrast = clamp(Number(adjustments?.contrast) || 0, -100, 100);
  const saturation = clamp(Number(adjustments?.saturation) || 0, -100, 100);
  const brightnessOffset = brightness * 2.55;
  const contrastValue = contrast * 2.55;
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturationFactor = 1 + saturation / 100;
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    let red = contrastFactor * (pixels[index] - 128) + 128 + brightnessOffset;
    let green = contrastFactor * (pixels[index + 1] - 128) + 128 + brightnessOffset;
    let blue = contrastFactor * (pixels[index + 2] - 128) + 128 + brightnessOffset;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = luminance + (red - luminance) * saturationFactor;
    green = luminance + (green - luminance) * saturationFactor;
    blue = luminance + (blue - luminance) * saturationFactor;
    pixels[index] = clamp(red, 0, 255);
    pixels[index + 1] = clamp(green, 0, 255);
    pixels[index + 2] = clamp(blue, 0, 255);
  }
  context.putImageData(imageData, 0, 0);
}

function applyPreviewCurveToCanvas(context, width, height, points = []) {
  const imageData = context.getImageData(0, 0, width, height);
  const lookup = previewCurveLookup(points);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = lookup[pixels[index]];
    pixels[index + 1] = lookup[pixels[index + 1]];
    pixels[index + 2] = lookup[pixels[index + 2]];
  }
  context.putImageData(imageData, 0, 0);
}

function previewCurveLookup(points = []) {
  const normalized = previewCurveControlPoints(points);
  const lookup = new Uint8ClampedArray(256);
  for (let input = 0; input < 256; input += 1) {
    lookup[input] = previewInterpolatedCurveOutput(normalized, input);
  }
  return lookup;
}

function previewInterpolatedCurveOutput(points, input) {
  if (points.length < 2) return input;
  let segmentIndex = 0;
  while (segmentIndex < points.length - 2 && input > points[segmentIndex + 1].input) {
    segmentIndex += 1;
  }
  const p0 = points[Math.max(0, segmentIndex - 1)];
  const p1 = points[segmentIndex];
  const p2 = points[Math.min(segmentIndex + 1, points.length - 1)];
  const p3 = points[Math.min(segmentIndex + 2, points.length - 1)];
  const range = Math.max(1, p2.input - p1.input);
  const t = clamp((input - p1.input) / range, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const output = 0.5 * (
    (2 * p1.output) +
    (-p0.output + p2.output) * t +
    (2 * p0.output - 5 * p1.output + 4 * p2.output - p3.output) * t2 +
    (-p0.output + 3 * p1.output - 3 * p2.output + p3.output) * t3
  );
  return Math.round(clamp(output, 0, 255));
}

function previewCurveControlPoints(points = []) {
  const safePoints = Array.isArray(points) && points.length ? points : [{ x: 0, y: 100 }, { x: 100, y: 0 }];
  const normalized = safePoints
    .map((point) => ({
      x: clamp(Number(point?.x) || 0, 0, 100),
      y: clamp(Number(point?.y) || 0, 0, 100)
    }))
    .sort((a, b) => a.x - b.x);
  const middle = normalized.filter((point) => point.x > 0.5 && point.x < 99.5);
  const first = normalized.find((point) => point.x <= 0.5) || { x: 0, y: 100 };
  const last = [...normalized].reverse().find((point) => point.x >= 99.5) || { x: 100, y: 0 };
  return [
    { input: 0, output: Math.round(clamp(100 - first.y, 0, 100) * 2.55) },
    ...middle.map((point) => ({
      input: Math.round(clamp(point.x, 0, 100) * 2.55),
      output: Math.round(clamp(100 - point.y, 0, 100) * 2.55)
    })),
    { input: 255, output: Math.round(clamp(100 - last.y, 0, 100) * 2.55) }
  ].filter((point, index, all) => index === 0 || point.input !== all[index - 1].input);
}

function previewCropRectToPixels(rect, imageWidth, imageHeight) {
  const source = rect && typeof rect === "object" ? rect : {};
  const widthPct = clamp(Number(source.width) || 100, 1, 100);
  const heightPct = clamp(Number(source.height) || 100, 1, 100);
  const xPct = clamp(Number(source.x) || 0, 0, 100 - widthPct);
  const yPct = clamp(Number(source.y) || 0, 0, 100 - heightPct);
  return {
    x: Math.round((xPct / 100) * imageWidth),
    y: Math.round((yPct / 100) * imageHeight),
    width: Math.max(1, Math.round((widthPct / 100) * imageWidth)),
    height: Math.max(1, Math.round((heightPct / 100) * imageHeight))
  };
}

function previewVideoSourceForNode(node, incomingByNode) {
  if (node?.type !== "preview") return null;
  const previewSources = connectedPreviewSources(incomingByNode?.[node.id]?.sourceIn || []);
  const { item } = previewSelectionForNode(node, previewSources);
  return item?.type === "video" ? item : null;
}

function previewSelectionForNode(node, previewSources = []) {
  if (!previewSources.length) return { source: null, item: null, itemIndex: 0 };
  const data = node?.data || {};
  const source =
    selectedPreviewSource(previewSources, data.previewSourceId) ||
    previewSources.find((previewSource) => previewSource.items.some((item) => item.sourceSelectedResult)) ||
    previewSources.at(-1);
  const itemIndex = previewSelectedItemIndexForSource(node, source);
  return {
    source,
    item: source?.items?.[itemIndex] || null,
    itemIndex
  };
}

function previewSelectedItemIndexForSource(node, source) {
  const items = source?.items || [];
  const sourceSelectedIndex = items.findIndex((item) => item.sourceSelectedResult);
  return sourceSelectedIndex >= 0 ? sourceSelectedIndex : 0;
}

function selectedPreviewSource(sources = [], selectedId) {
  if (!sources.length) return null;
  return sources.find((source) => source.id === selectedId) || sources.at(-1);
}

function previewMediaType(source, edge) {
  if (source.type === "storyboard" && storyboardOutputItem(source, edge)) return "image";
  if (source.type === "autoAspect" && autoAspectOutputItem(source, edge)) return "image";
  if (source.type === "utility") return utilityResultType(source);
  if (source.type === "model3d") return "model3d";
  if (source.type === "video" || source.type === "videoModel") return "video";
  if (/\.(glb|gltf)$/i.test(source.data.resultUrl || "")) return "model3d";
  if (/\.(mp4|mov|webm)$/i.test(source.data.resultUrl || "")) return "video";
  return "image";
}

function connectedImagePromptItems(items = [], incomingByNode = null, options = {}) {
  const includeComposerCharacterBindings = options.includeComposerCharacterBindings !== false;
  const namedCharacterReferences = includeComposerCharacterBindings && activeConnectedCharacterSources(items, incomingByNode).length > 1;
  const uniqueItems = new Map();

  items
    .flatMap(({ source, edge }) => {
      const outputItem = connectedOutputItem(source, edge);
      const outputUrl = outputItem?.url || connectedOutputUrl(source, edge);
      if (!outputUrl) return null;
      if (source.type === "character") {
        return { url: outputUrl, label: characterReferenceLabel(source, namedCharacterReferences) };
      }
      if (source.type === "composer") {
        if (!includeComposerCharacterBindings) {
          return { url: outputUrl, label: sourceLabel(source) };
        }
        return [
          { url: outputUrl, label: "Input guide image" },
          ...composerCharacterBindingsForSource(source, incomingByNode).map((binding) => ({
            url: binding.source.data.resultUrl,
            label: composerCharacterReferenceLabel(binding, namedCharacterReferences)
          }))
        ];
      }
      return {
        url: outputUrl,
        label: source.type === "transfer" ? moodBoardOutputFileName : outputItem?.label || sourceLabel(source)
      };
    })
    .filter(Boolean)
    .forEach((item) => {
      uniqueItems.set(`${item.url}|${item.label}`, item);
    });

  return [...uniqueItems.values()];
}

function composerCharacterBindingsForItems(items = [], incomingByNode = null) {
  const bindings = new Map();
  items.forEach(({ source }) => {
    composerCharacterBindingsForSource(source, incomingByNode).forEach((binding) => {
      bindings.set(`${source.id}:${binding.maquette.id}:${binding.source.id}`, binding);
    });
  });
  return [...bindings.values()];
}

function composerCharacterBindingsForSource(source, incomingByNode = null) {
  if (!isActiveComposerSource(source) || !incomingByNode) return [];
  const incoming = incomingByNode[source.id] || {};
  const maquettes = normalizedComposerScene(source.data?.composerScene).maquettes;

  return maquettes
    .map((maquette, index) => {
      const portId = composerCharacterPortId(maquette.id);
      const connection = (incoming[portId] || [])
        .filter(({ source: characterSource, edge }) =>
          edge.from.port !== "voiceOut" &&
          characterSource.type === "character" &&
          characterSource.data.locked &&
          characterSource.data.activated &&
          characterSource.data.resultUrl
        )
        .at(-1);
      if (!connection) return null;
      return {
        composer: source,
        maquette,
        maquetteIndex: index,
        maquetteLabel: composerMaquetteLabel(maquette, index),
        source: connection.source
      };
    })
    .filter(Boolean);
}

function composerCharacterReferenceLabel(binding, namedCharacterReferences = false) {
  const characterName = characterTag(binding.source);
  const characterLabel = namedCharacterReferences ? `${characterName} character identity sheet` : "Character identity sheet";
  return cleanImageReferenceLabel(`Maquette ${binding.maquetteLabel} uses ${characterLabel}`);
}

function composerCharacterMappingPromptPieces(items = [], incomingByNode = null, namedCharacterReferences = false) {
  return composerCharacterBindingsForItems(items, incomingByNode)
    .flatMap((binding) => [
      `COMPOSER CHARACTER MAPPING: In the input guide image, the maquette named "${binding.maquetteLabel}" must be rendered as the character reference labeled "${composerCharacterReferenceLabel(binding, namedCharacterReferences)}". Identify the correct maquette by this Composer placement descriptor: ${composerMaquetteSpatialDescriptor(binding.maquette, binding.maquetteIndex)} Use the descriptor and placeholder color only to identify the correct guide figure, not as final appearance. Preserve that maquette's exact pose, placement, body orientation, scale, crop, silhouette, occlusion, and foreground/background relationship. Replace only the placeholder maquette identity with that character's identity, wardrobe, body proportions, face, and styling. The character reference for this maquette is identity-only; do not copy its pose, stance, portrait posture, camera angle, crop, expression, lighting, or background. Retarget the character onto the maquette's exact visible body layout, including head angle, shoulder line, torso direction, arm angles, hand positions, leg angles, foot positions, body balance, and silhouette footprint.`,
      characterGenerationPhysicalDetailsPrompt(binding.source.data),
      characterTraitPrompt(binding.source.data)
    ])
    .filter(Boolean);
}

function composerMaquetteSpatialDescriptor(maquette = {}, index = 0) {
  const x = finiteNumber(maquette.x, 0);
  const y = finiteNumber(maquette.y, 0);
  const z = finiteNumber(maquette.z, 0);
  const scale = finiteNumber(maquette.scale, 1);
  const rotationY = finiteNumber(maquette.rotY, 0);
  const horizontal = x <= -0.75 ? "left side" : x >= 0.75 ? "right side" : Math.abs(x) <= 0.25 ? "center" : x < 0 ? "slightly left of center" : "slightly right of center";
  const depth = z <= -0.75 ? "front/foreground area" : z >= 0.75 ? "back/background area" : Math.abs(z) <= 0.25 ? "middle depth" : z < 0 ? "front-middle depth" : "back-middle depth";
  const height = y <= -0.35 ? "low in the scene" : y >= 0.35 ? "high in the scene" : "near ground level";
  const color = maquette.color ? ` visible placeholder color ${maquette.color},` : "";
  return `maquette ${index + 1},${color} ${horizontal}, ${depth}, ${height}, scene position x ${x.toFixed(2)}, y ${y.toFixed(2)}, z ${z.toFixed(2)}, scale ${scale.toFixed(2)}, y rotation ${rotationY.toFixed(0)} degrees.`;
}

function cleanImageReferenceLabel(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_. -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function resolveImageModelAspectRatio(node, incoming = {}) {
  const configuredAspectRatio = node.data.aspectRatio || "16:9";
  if (!isAutoImageAspectRatio(configuredAspectRatio)) {
    return normalizeImageModelAspectRatio(configuredAspectRatio, node.data.model);
  }

  const imageUrl = imageModelAutoAspectInputUrls(incoming, node.data.model)[0];
  if (!imageUrl) {
    throw new Error("Auto aspect ratio needs a connected image.");
  }

  const dimensions = await imageDimensionsFromUrl(imageUrl);
  if (!dimensions) {
    throw new Error("Could not read the connected image size for Auto aspect ratio.");
  }

  return closestAspectRatio(dimensions.width / Math.max(1, dimensions.height), imageModelSupportedAspectRatios(node.data.model));
}

function imageModelAutoAspectInputUrls(incoming = {}, model = "") {
  const unsupportedPorts = imageModelUnsupportedInputPorts(model);
  const unsupportedSources = imageModelUnsupportedSourceTypes(model);
  const portIds = [
    "imagePromptIn",
    ...(!unsupportedPorts.has("cameraIn") ? ["cameraIn"] : []),
    ...(!unsupportedPorts.has("transferIn") ? ["transferIn"] : [])
  ];
  return portIds
    .flatMap((portId) => incoming[portId] || [])
    .map(({ source, edge }) => {
      if (unsupportedSources.has(source?.type)) return "";
      const url = connectedOutputUrl(source, edge);
      if (!url) return "";
      return previewMediaType(source, edge) === "image" ? url : "";
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

function normalizeChoice(value, options = [], fallback) {
  return options.includes(value) ? value : fallback;
}

function activeImageInstructionLabels(items = [], incomingByNode = null) {
  return [
    ...new Set(
      items
        .filter(({ source }) => isActiveComposerSource(source) || promptPiecesForSource(source).length)
        .map(({ source }) => ({
          camera: "Camera",
          composer: composerCharacterBindingsForSource(source, incomingByNode).length ? "Composer guide + character map" : "Composer guide",
          style: "Style",
          transfer: "Mood Board",
          character: "Character identity"
        })[source.type])
        .filter(Boolean)
    )
  ];
}

function buildEffectiveImagePrompt(prompt, items = [], aspectRatio, incomingByNode = null) {
  const hasTransferReference = items.some(({ source }) => source.type === "transfer" && source.data.resultUrl);
  const hasComposerGuide = items.some(({ source }) => isActiveComposerSource(source));
  const characterSources = activeConnectedCharacterSources(items, incomingByNode);
  const namedCharacterReferences = characterSources.length > 1;
  const resolvedPrompt = resolveImageCharacterMentions(prompt, characterSources, namedCharacterReferences);
  const supportingInstructions = items
    .filter(({ source }) => source.type !== "camera" && !isActiveComposerSource(source))
    .flatMap(({ source }) => promptPiecesForSource(source, { namedCharacterReferences }))
    .filter(Boolean);
  const composerCharacterInstructions = composerCharacterMappingPromptPieces(items, incomingByNode, namedCharacterReferences);
  const cameraInstructions = items
    .filter(({ source }) => source.type === "camera")
    .flatMap(({ source }) => promptPiecesForSource(source, { namedCharacterReferences }))
    .filter(Boolean);

  if (!hasComposerGuide && !supportingInstructions.length && !cameraInstructions.length) return resolvedPrompt;

  const ratio = extractAspectRatio(aspectRatio);
  const aspectInstruction = hasTransferReference && ratio
    ? `Generate the final image in the Image Model node's selected ${ratio} aspect ratio. Do not copy ${moodBoardOutputFileName}'s collage layout or aspect ratio into the final image.`
    : "";
  const writtenPrompt = [resolvedPrompt, ...supportingInstructions, ...composerCharacterInstructions].filter(Boolean).join("\n\n");
  const finalPrompt = hasComposerGuide ? composerReferencePrompt(writtenPrompt) : writtenPrompt;

  return [finalPrompt, aspectInstruction, ...cameraInstructions].filter(Boolean).join("\n\n");
}

function isActiveComposerSource(source) {
  return source?.type === "composer" && Boolean(source.data?.resultUrl);
}

function promptPiecesForSource(source, { namedCharacterReferences = false } = {}) {
  if (source.type === "camera") {
    return cameraPromptPieces(source);
  }

  if (source.type === "style") {
    const selectedPreset = source.data.stylePreset || "None";
    return [
      stylePresetPrompts[selectedPreset] || "",
      selectedPreset === "Custom Palette" ? customPalettePromptPiece(source.data) : ""
    ].filter(Boolean);
  }

  if (source.type === "composer") {
    return [];
  }

  if (source.type === "character" && source.data.locked && source.data.activated && source.data.resultUrl) {
    return characterImagePromptPieces(source, namedCharacterReferences);
  }

  if (source.type !== "transfer" || !source.data.activated || !source.data.resultUrl) return [];

  return [source.data.hiddenPrompt || transferPromptSuffix].filter(Boolean);
}

async function extractCustomPaletteFromFile(file) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadCanvasImage(dataUrl);
  const colors = extractDominantPaletteColors(image, 10);
  if (!colors.length) throw new Error("No usable colors found in that image.");
  return {
    colors,
    previewUrl: renderCustomPalettePreview(image, colors)
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read palette image."));
    reader.readAsDataURL(file);
  });
}

function extractDominantPaletteColors(image, limit = 10) {
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, 220 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const buckets = new Map();
  const bucketSize = 24;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 32) continue;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const key = [
      Math.min(255, Math.round(r / bucketSize) * bucketSize),
      Math.min(255, Math.round(g / bucketSize) * bucketSize),
      Math.min(255, Math.round(b / bucketSize) * bucketSize)
    ].join(",");
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.count, 0) || 1;
  const candidates = [...buckets.values()]
    .map((bucket) => customPaletteColorFromRgb(
      Math.round(bucket.r / bucket.count),
      Math.round(bucket.g / bucket.count),
      Math.round(bucket.b / bucket.count),
      Math.round((bucket.count / total) * 1000) / 10
    ))
    .sort((first, second) => second.percent - first.percent);

  const selected = [];
  candidates.forEach((candidate) => {
    if (selected.length >= limit) return;
    const tooClose = selected.some((color) => colorDistance(color, candidate) < 30);
    if (!tooClose) selected.push(candidate);
  });

  return selected.length >= limit ? selected : candidates.slice(0, limit);
}

function renderCustomPalettePreview(image, colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 560;
  const context = canvas.getContext("2d");
  context.fillStyle = "#101010";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawImageCover(context, image, 0, 0, canvas.width, 420);

  const swatchGap = 9;
  const swatchTop = 434;
  const swatchHeight = 110;
  const swatchWidth = Math.floor((canvas.width - swatchGap * (colors.length + 1)) / Math.max(1, colors.length));
  colors.forEach((color, index) => {
    const x = swatchGap + index * (swatchWidth + swatchGap);
    context.fillStyle = color.hex;
    context.fillRect(x, swatchTop, swatchWidth, swatchHeight);
  });

  return canvas.toDataURL("image/jpeg", 0.88);
}

function normalizedCustomPaletteColors(data = {}) {
  const textColors = parseCustomPaletteText(data.customPaletteRgbText);
  if (textColors.length) return uniqueCustomPaletteColors(textColors).slice(0, 10);
  const savedColors = Array.isArray(data.customPaletteColors) ? data.customPaletteColors : [];
  return uniqueCustomPaletteColors(savedColors.map((color) => customPaletteColorFromRgb(color.r, color.g, color.b, color.percent))).slice(0, 10);
}

function parseCustomPaletteText(text = "") {
  const chunks = String(text || "").split(/[\n;]+/).map((chunk) => chunk.trim()).filter(Boolean);
  const colors = [];
  chunks.forEach((chunk) => {
    const hexMatch = chunk.match(/#?([0-9a-f]{6})\b/i);
    if (hexMatch) {
      colors.push(customPaletteColorFromHex(hexMatch[1]));
      return;
    }
    const rgbMatch = chunk.match(/(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/);
    if (rgbMatch) {
      colors.push(customPaletteColorFromRgb(rgbMatch[1], rgbMatch[2], rgbMatch[3]));
    }
  });
  return colors;
}

function uniqueCustomPaletteColors(colors = []) {
  const seen = new Set();
  return colors
    .filter((color) => Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b))
    .map((color) => customPaletteColorFromRgb(color.r, color.g, color.b, color.percent))
    .filter((color) => {
      const key = color.hex.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function customPalettePromptPiece(data = {}) {
  const colors = normalizedCustomPaletteColors(data);
  if (!colors.length) return "";
  return `Utilize the hues and values: ${colors.map((color) => `${color.hex} RGB(${color.r}, ${color.g}, ${color.b}), hue ${color.hue} degrees, value ${color.value}%`).join("; ")}.`;
}

function styleOutputEnabled(data = {}) {
  const selectedPreset = data.stylePreset || "None";
  if (selectedPreset === "None") return false;
  if (selectedPreset === "Custom Palette") return Boolean(customPalettePromptPiece(data));
  return true;
}

function customPaletteColorFromHex(value) {
  const hex = String(value || "").replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(hex)) return customPaletteColorFromRgb(0, 0, 0);
  return customPaletteColorFromRgb(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
}

function customPaletteColorFromRgb(r, g, b, percent = null) {
  const color = {
    r: clamp(Math.round(Number(r) || 0), 0, 255),
    g: clamp(Math.round(Number(g) || 0), 0, 255),
    b: clamp(Math.round(Number(b) || 0), 0, 255),
    percent: Number.isFinite(Number(percent)) ? Number(percent) : null
  };
  color.hex = rgbToHex(color);
  const hsv = rgbToHsv(color.r, color.g, color.b);
  color.hue = hsv.hue;
  color.saturation = hsv.saturation;
  color.value = hsv.value;
  return color;
}

function customPaletteColorFromHsv(hue, saturation, value) {
  const h = ((Number(hue) || 0) % 360 + 360) % 360;
  const s = clamp(Number(saturation) || 0, 0, 100) / 100;
  const v = clamp(Number(value) || 0, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return customPaletteColorFromRgb(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  );
}

function rgbToHsv(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }

  return {
    hue,
    saturation: max === 0 ? 0 : Math.round((delta / max) * 100),
    value: Math.round(max * 100)
  };
}

function colorDistance(first, second) {
  return Math.sqrt(
    (first.r - second.r) ** 2 +
      (first.g - second.g) ** 2 +
      (first.b - second.b) ** 2
  );
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
  return [prompt, ...characterInstructions, storyboardVideoReferencePromptPiece(incoming.referenceImageIn)].filter(Boolean).join("\n\n");
}

function storyboardVideoReferencePromptPiece(items = []) {
  const hasStoryboardReference = items.some(({ source, edge }) => (
    source?.type === "storyboard" && Boolean(storyboardOutputItem(source, edge)?.url)
  ));
  return hasStoryboardReference
    ? "Use the provided storyboard reference as a loose visual guide for shot progression, framing, blocking, and continuity. Do not copy it literally; prioritize the Film Director prompt and preserve natural live-action motion."
    : "";
}

function characterImagePromptPieces(source, namedCharacterReferences = false) {
  const sheetLabel = characterReferenceLabel(source, namedCharacterReferences);
  return [
    `CHARACTER REFERENCE: The image reference labeled "${sheetLabel}" is mandatory. Use it as the only source for the character's identity, face, hair, body proportions, selected wardrobe, and recognizable details. Render this same character in the requested scene without inventing a replacement character.`,
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

function activeConnectedCharacterSources(items = [], incomingByNode = null) {
  const sources = [
    ...items
      .map(({ source }) => source)
      .filter((source) => source.type === "character" && source.data.locked && source.data.activated && source.data.resultUrl),
    ...composerCharacterBindingsForItems(items, incomingByNode).map((binding) => binding.source)
  ];
  const uniqueSources = new Map();
  sources.forEach((source) => {
    uniqueSources.set(source.id, source);
  });
  return [...uniqueSources.values()];
}

function resolveImageCharacterMentions(prompt, characterSources = [], namedCharacterReferences = false) {
  return characterSources.reduce((value, source) => {
    const replacement = namedCharacterReferences
      ? `the character from the image reference labeled "${characterReferenceLabel(source, true)}"`
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
  return namedCharacterReferences ? `${characterTag(node)} Character Sheet` : "The Character identity sheet";
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

function autoAspectSourceSummary(items = [], fallback) {
  if (!items.length) return fallback;
  if (items.length === 1) {
    const source = items[0].source;
    return source?.data?.title || nodeTypeLabel(source?.type) || fallback;
  }
  return `${items.length} connected`;
}

function sourceLabel(source) {
  if (source.type === "camera") return cameraLabel(source);
  if (source.type === "composer") return source.data.title || "Composer";
  if (source.type === "storyboard") return source.data.title || "Storyboard";
  if (source.type === "skillDirector") return source.data.title === "Skill Director" ? "Film Director" : source.data.title || "Film Director";
  if (source.type === "autoAspect") return source.data.title || "Auto Aspect";
  if (source.type === "model3d" && source.data.resultUrl) return source.data.title || "3D model";
  if (source.type === "transfer" && source.data.resultUrl) return "Style Reference";
  if (source.type === "character" && source.data.resultUrl) return `@${characterTag(source)}`;
  if (source.type === "style") return (source.data.stylePreset || "None") === "None" ? "Style" : source.data.stylePreset;
  if (source.type === "utility" && source.data.resultUrl) return utilityResultType(source) === "video" ? "Utility video" : "Utility image";
  if (source.data.resultUrl) return source.data.resultUrl.split("/").pop();
  if (source.data.fileName) return source.data.fileName;
  return source.data.title || source.type;
}

function extractAspectRatio(value) {
  return String(value || "").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "";
}

function closestAspectRatio(ratio, options = []) {
  const normalizedRatio = Number(ratio);
  const fallback = options.includes("16:9") ? "16:9" : options[0] || "16:9";
  if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) return fallback;

  return options.reduce((closest, option) => {
    const optionRatio = aspectRatioNumber(option);
    const closestRatio = aspectRatioNumber(closest);
    return Math.abs(Math.log(optionRatio / normalizedRatio)) < Math.abs(Math.log(closestRatio / normalizedRatio)) ? option : closest;
  }, fallback);
}

function aspectRatioNumber(value) {
  const [width = 16, height = 9] = extractAspectRatio(value).split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 16 / 9;
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
  return keepLatestAutoAspectInputs(dedupeEdges(edges.map((edge) => normalizeEdgeForCurrentGraph(edge, nodeMap)).filter(Boolean)), nodeMap);
}

function keepLatestAutoAspectInputs(edges = [], nodeMap = new Map()) {
  const latestAutoAspectInputIndexes = new Map();
  edges.forEach((edge, index) => {
    const target = nodeMap.get(edge.to.nodeId);
    if (target?.type === "autoAspect" && edge.to.port === "imageIn") {
      latestAutoAspectInputIndexes.set(edge.to.nodeId, index);
    }
  });
  if (!latestAutoAspectInputIndexes.size) return edges;
  return edges.filter((edge, index) => {
    const target = nodeMap.get(edge.to.nodeId);
    if (target?.type !== "autoAspect" || edge.to.port !== "imageIn") return true;
    return latestAutoAspectInputIndexes.get(edge.to.nodeId) === index;
  });
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

function splitSkillDirectorShotListForClient(shotList = "", existingNotes = "") {
  const cleanShotList = formatSkillDirectorShotListForClient(shotList)
    .replace(/^SHOT_LIST:\s*/i, "")
    .trim();
  const cleanExistingNotes = String(existingNotes || "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .trim();

  if (!cleanShotList) {
    return { shotList: "", shotListNotes: cleanExistingNotes };
  }

  const cutMatch = cleanShotList.match(/\bCUT\s+\d{1,2}\b/i);
  if (cutMatch && cutMatch.index > 0) {
    const prefix = cleanShotList.slice(0, cutMatch.index).trim();
    if (/(continuity\s+(?:rules|map|ledger)|must[-\s]*have\s+shots|must[-\s]*have\s+actions)/i.test(prefix)) {
      return {
        shotList: formatSkillDirectorShotListForClient(cleanShotList.slice(cutMatch.index)),
        shotListNotes: cleanExistingNotes || prefix
      };
    }
  }

  return { shotList: cleanShotList, shotListNotes: cleanExistingNotes };
}

function formatSkillDirectorShotListForClient(text = "") {
  return String(text || "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/\s+(?=\bCUT\s+\d{1,2}\b)/gi, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatSkillDirectorFinalPromptForClient(text = "") {
  return String(text || "")
    .replace(/(Shot List:\s*)([\s\S]*)$/i, (_match, label, body) => `${label.trim()}\n${formatSkillDirectorShotListForClient(body)}`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  if (nextNode.type === "text") {
    return {
      ...nextNode,
      data: {
        ...data,
        title: textModelTitleFromLegacy(data.title),
        text: data.text || "",
        resultText: data.resultText || ""
      }
    };
  }

  if (nextNode.type === "skillDirector") {
    const sceneOverview = data.sceneOverview ?? data.text ?? "";
    const legacyShotCount = data.skillShotCount || data.skillSceneCount || data.shotCount || "3";
    const restoredShotList = splitSkillDirectorShotListForClient(data.shotList || "", data.shotListNotes || "");
    const skillDirectorData = { ...data };
    const filmDirectorTitle = data.title && data.title !== "Skill Director" ? data.title : "Film Director";
    ["skillCategory", "skillId", "skillEditorOpen", "skillDraft", "skillSceneCount", "shotCount"].forEach((field) => {
      delete skillDirectorData[field];
    });
    return {
      ...nextNode,
      data: {
        ...createDefaultNodeData("skillDirector", filmDirectorTitle, 1),
        ...skillDirectorData,
        title: filmDirectorTitle,
        sceneName: data.sceneName || "",
        sceneOverview,
        text: sceneOverview,
        skillShotCount: legacyShotCount,
        skillDurationSeconds: data.skillDurationSeconds || data.durationSeconds || "15",
        styleDirection: data.styleDirection || "",
        motionBrief: data.motionBrief || "",
        motionDirection: data.motionDirection || "",
        shotList: restoredShotList.shotList,
        shotListNotes: restoredShotList.shotListNotes,
        resultText: formatSkillDirectorFinalPromptForClient(data.resultText || ""),
        skillDirectorLocks:
          data.skillDirectorLocks && typeof data.skillDirectorLocks === "object"
            ? {
                setup: Boolean(data.skillDirectorLocks.setup),
                style: Boolean(data.skillDirectorLocks.style),
                motion: Boolean(data.skillDirectorLocks.motion),
                scene: Boolean(data.skillDirectorLocks.scene),
                shotList: Boolean(data.skillDirectorLocks.shotList)
              }
            : { setup: false, style: false, motion: false, scene: false, shotList: false },
        skillDirectorCollapsed:
          data.skillDirectorCollapsed && typeof data.skillDirectorCollapsed === "object"
            ? {
                setup: Boolean(data.skillDirectorCollapsed.setup),
                style: Boolean(data.skillDirectorCollapsed.style),
                motion: Boolean(data.skillDirectorCollapsed.motion),
                scene: Boolean(data.skillDirectorCollapsed.scene),
                shotList: Boolean(data.skillDirectorCollapsed.shotList)
              }
            : { setup: false, style: false, motion: false, scene: false, shotList: false },
        skillDirectorBuilt: Boolean(data.skillDirectorBuilt && data.resultText),
        skillDirectorAction: "",
        skillDirectorQueuedAction: "",
        skillDirectorQueueId: "",
        skillPreviewOpen: Boolean(data.skillPreviewOpen),
        skillReferenceNotes: data.skillReferenceNotes && typeof data.skillReferenceNotes === "object" ? data.skillReferenceNotes : {},
        skillDirectorRevisionOpen: Boolean(data.skillDirectorRevisionOpen),
        skillDirectorRevisionNotes: String(data.skillDirectorRevisionNotes || ""),
        skillDirectorLastRevisionSummary: String(data.skillDirectorLastRevisionSummary || ""),
        skillDirectorRevisionHistory: Array.isArray(data.skillDirectorRevisionHistory) ? data.skillDirectorRevisionHistory.slice(-8) : []
      }
    };
  }

  if (nextNode.type === "plainText") {
    return {
      ...nextNode,
      data: {
        ...data,
        title: data.title || "Text",
        text: data.text || ""
      }
    };
  }

  if (nextNode.type === "storyboard") {
    return {
      ...nextNode,
      data: normalizeStoryboardData(data)
    };
  }

  if (nextNode.type === "composer") {
    return {
      ...nextNode,
      data: normalizeComposerData(data)
    };
  }

  if (nextNode.type === "frameIt") {
    const frameItScene = normalizeFrameItScene(data.frameItScene);
    const selectedFigureId = frameItScene.figures.some((figure) => figure.id === data.frameItSelectedFigureId)
      ? data.frameItSelectedFigureId
      : frameItScene.figures[0]?.id || "";
    return {
      ...nextNode,
      data: {
        ...createDefaultNodeData("frameIt", data.title || "Frame It", 1),
        ...data,
        frameItScene,
        frameItSelectedFigureId: selectedFigureId,
        frameItSelectedJoint: data.frameItSelectedJoint || "upperBodyRot",
        frameItSavedPoses: normalizeFrameItSavedPoses(data.frameItSavedPoses),
        frameItScale: Math.max(1, finiteNumber(data.frameItScale, 1))
      }
    };
  }

  if (nextNode.type === "imageModel") {
    return {
      ...nextNode,
      data: normalizeImageModelData(data)
    };
  }

  if (nextNode.type === "autoAspect") {
    return {
      ...nextNode,
      data: normalizeAutoAspectData(data)
    };
  }

  if (nextNode.type === "style") {
    return {
      ...nextNode,
      data: normalizeStyleData(data)
    };
  }

  if (nextNode.type === "videoModel") {
    return {
      ...nextNode,
      data: normalizeVideoModelData(data)
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

function normalizeStoryboardFrameCountValue(value) {
  const normalized = String(value ?? storyboardAutoFrameCount).trim();
  if (!normalized || /^auto$/i.test(normalized)) return storyboardAutoFrameCount;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) return storyboardAutoFrameCount;
  return String(Math.min(storyboardMaxFrameCount, Math.max(1, parsed)));
}

function storyboardFrameCountNumber(value, fallback = storyboardDefaultFrameCount) {
  const parsed = Number.parseInt(value, 10);
  const count = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(storyboardMaxFrameCount, Math.max(1, count));
}

function defaultStoryboardFrames(count = storyboardDefaultFrameCount) {
  return Array.from({ length: storyboardFrameCountNumber(count) }, (_item, index) => createStoryboardFrame(index + 1));
}

function createStoryboardFrame(number = 1, patch = {}) {
  const { id: patchId, ...framePatch } = patch;
  const id = patchId || createNodeId("frame", number);
  return {
    id,
    number,
    shot: "None",
    lens: "None",
    angle: "None",
    beat: "",
    prompt: "",
    notes: "",
    resultUrl: "",
    exportUrl: "",
    resultFallbackUrl: "",
    resultVersion: 0,
    fileName: "",
    status: "",
    error: "",
    qcPassed: null,
    qcWarning: "",
    qcSummary: "",
    qcIssues: [],
    qcRetryCount: 0,
    ...framePatch
  };
}

function normalizeStoryboardData(data = {}) {
  const frames = normalizedStoryboardFrames(data.storyboardFrames);
  const selectedFrameId = frames.some((frame) => frame.id === data.selectedFrameId)
    ? data.selectedFrameId
    : frames.find((frame) => frame.resultUrl)?.id || frames[0]?.id || "";
  const selectedFrame = frames.find((frame) => frame.id === selectedFrameId) || frames.find((frame) => frame.resultUrl);
  const legacyResolution = data.useHighResolution ? storyboardHighResolution : storyboardDefaultResolution;
  const inferredPlanSceneDescription = typeof data.storyboardPlanSceneDescription === "string"
    ? data.storyboardPlanSceneDescription
    : data.storyboardAnalysis && frames.some((frame) => String(frame.prompt || "").trim())
      ? data.sceneDescription || ""
      : "";
  return {
    ...createDefaultNodeData("storyboard", data.title || "Storyboard", 1),
    ...data,
    storyboardTab: ["setup", "view", "advanced"].includes(data.storyboardTab) ? data.storyboardTab : "setup",
    sceneName: data.sceneName || "Scene 1",
    frameCount: normalizeStoryboardFrameCountValue(data.frameCount),
    model: storyboardFixedModel,
    aspectRatio: normalizeChoice(data.aspectRatio || storyboardDefaultAspectRatio, storyboardAspectRatioOptions, storyboardDefaultAspectRatio),
    resolution: normalizeChoice(data.resolution || legacyResolution, imageResolutionOptions, storyboardDefaultResolution),
    storyboardAutoQc: data.storyboardAutoQc !== false,
    useStoryboardStyle: data.useStoryboardStyle !== false,
    useMoodBoard: data.useMoodBoard !== false,
    useInternalStoryboardCharacters: data.useInternalStoryboardCharacters !== false,
    useHighResolution: Boolean(data.useHighResolution),
    storyboardStylePreset: normalizeChoice(data.storyboardStylePreset || "None", stylePresetNames, "None"),
    storyboardMoodBoardUrl: data.storyboardMoodBoardUrl || storyboardDefaultMoodBoardUrl,
    storyboardMoodBoardFileName: data.storyboardMoodBoardFileName || storyboardMoodBoardLabel,
    storyboardCharacters: normalizedStoryboardCharacters(data.storyboardCharacters),
    storyboardPlanSceneDescription: inferredPlanSceneDescription,
    storyboardScale: Math.max(1, finiteNumber(data.storyboardScale, 1)),
    storyboardFrames: frames,
    selectedFrameId,
    resultUrl: selectedFrame?.resultUrl || data.resultUrl || "",
    resultItems: storyboardResultItems(frames),
    storyboardBoardUrl: String(data.storyboardBoardUrl || ""),
    storyboardBoardFileName: String(data.storyboardBoardFileName || ""),
    storyboardBoardStoredFileName: String(data.storyboardBoardStoredFileName || ""),
    storyboardBoardMimeType: String(data.storyboardBoardMimeType || ""),
    storyboardBoardFrames: normalizedPreviewLayoutItems(data.storyboardBoardFrames),
    storyboardBoardVersion: finiteNumber(data.storyboardBoardVersion, 0),
    selectedResultIndex: Math.max(0, frames.filter((frame) => frame.resultUrl).findIndex((frame) => frame.id === selectedFrameId))
  };
}

function normalizedStoryboardFrames(frames = []) {
  const sourceFrames = Array.isArray(frames) && frames.length ? frames : defaultStoryboardFrames(storyboardDefaultFrameCount);
  return sourceFrames.slice(0, storyboardMaxFrameCount).map((frame, index) =>
    createStoryboardFrame(index + 1, {
      ...frame,
      id: frame.id || createNodeId("frame", index + 1),
      number: index + 1,
      shot: normalizeChoice(frame.shot || "None", shotPresetNames, "None"),
      lens: normalizeChoice(frame.lens || "None", lensPresetNames, "None"),
      angle: normalizeChoice(frame.angle || "None", typePresetNames, "None"),
      prompt: String(frame.prompt || ""),
      beat: String(frame.beat || ""),
      notes: String(frame.notes || ""),
      resultUrl: frame.resultUrl || frame.url || "",
      exportUrl: frame.exportUrl || "",
      resultFallbackUrl: frame.resultFallbackUrl || "",
      resultVersion: finiteNumber(frame.resultVersion, 0),
      fileName: frame.fileName || "",
      status: frame.status || "",
      error: frame.error || "",
      qcPassed: typeof frame.qcPassed === "boolean" ? frame.qcPassed : null,
      qcWarning: frame.qcWarning || "",
      qcSummary: frame.qcSummary || "",
      qcIssues: Array.isArray(frame.qcIssues) ? frame.qcIssues.map((issue) => String(issue || "").trim()).filter(Boolean).slice(0, 6) : [],
      qcRetryCount: finiteNumber(frame.qcRetryCount, 0)
    })
  );
}

function normalizedStoryboardCharacters(characters = []) {
  return Array.isArray(characters)
    ? characters.filter(Boolean).slice(0, storyboardMaxCharacters).map((character, index) => {
        const sheetUrl = character.sheetUrl || character.resultUrl || "";
        const status = sheetUrl && character.status === "compiling" ? "ready" : character.status || "";
        return createStoryboardCharacter({
          ...character,
          id: character.id || createNodeId("storyboard-character", index + 1),
          name: String(character.name || ""),
          portrait: character.portrait?.localUrl ? character.portrait : null,
          sheetUrl,
          sheetFileName: character.sheetFileName || character.fileName || "",
          sheetVersion: finiteNumber(character.sheetVersion, 0),
          status,
          error: character.error || ""
        });
      })
    : [];
}

function createStoryboardCharacter(patch = {}) {
  return {
    id: patch.id || createNodeId("storyboard-character", 1),
    name: "",
    portrait: null,
    sheetUrl: "",
    sheetFileName: "",
    sheetVersion: 0,
    status: "",
    error: "",
    ...patch
  };
}

function storyboardCharacterNameFromFile(fileName = "", index = 1) {
  const baseName = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return baseName || `Character ${index}`;
}

function storyboardCharacterTag(character = {}) {
  return cleanPromptTag(character.name || "Character") || "Character";
}

function storyboardUsesInternalCharacters(node) {
  return node?.data?.useStoryboardStyle !== false && node?.data?.useInternalStoryboardCharacters !== false;
}

function storyboardResolutionForNode(node) {
  const fallbackResolution = node?.data?.useHighResolution ? storyboardHighResolution : storyboardDefaultResolution;
  return normalizeChoice(node?.data?.resolution || fallbackResolution, imageResolutionOptions, storyboardDefaultResolution);
}

function storyboardAspectRatioForNode(node) {
  return normalizeChoice(node?.data?.aspectRatio || storyboardDefaultAspectRatio, storyboardAspectRatioOptions, storyboardDefaultAspectRatio);
}

function storyboardCssAspectRatio(value) {
  const ratio = storyboardAspectRatioForNode({ data: { aspectRatio: value } });
  return ratio.replace(":", " / ");
}

function storyboardSceneDescriptionForNode(node, incoming = {}) {
  const directorScene = directorPackageStoryboardSceneDescription(connectedDirectorPackageSource(incoming?.directorIn || []));
  if (directorScene) return directorScene;
  return [directorScene, connectedText(incoming?.sceneDescriptionIn || []), node?.data?.sceneDescription || ""]
    .filter(Boolean)
    .join("\n\n");
}

function storyboardPlanIsCurrent(node, sceneDescriptionOverride = null) {
  const sceneDescription = String(sceneDescriptionOverride ?? storyboardSceneDescriptionForNode(node)).trim();
  if (!sceneDescription) return false;
  return String(node?.data?.storyboardPlanSceneDescription || "").trim() === sceneDescription;
}

function storyboardCharacterSheetPromptForNode(node) {
  return [
    storyboardCharacterSheetBasePrompt,
    node?.data?.useStoryboardStyle !== false ? storyboardCharacterSheetStyleInstruction : "",
    storyboardCharacterWardrobeFromPortraitPrompt
  ].filter(Boolean).join("\n\n");
}

function storyboardResultItems(frames = []) {
  return frames
    .filter((frame) => frame.exportUrl || frame.resultUrl)
    .map((frame, index) => ({
      url: frame.exportUrl || frame.resultUrl,
      type: "image",
      label: `Frame ${String(frame.number || index + 1).padStart(3, "0")}`,
      text: frame.prompt || "",
      fileName: frame.fileName || ""
    }));
}

function clearStoryboardBoardPatch() {
  return {
    storyboardBoardUrl: "",
    storyboardBoardFileName: "",
    storyboardBoardStoredFileName: "",
    storyboardBoardMimeType: "",
    storyboardBoardFrames: [],
    storyboardBoardVersion: 0
  };
}

function storyboardBoardLayoutItem(frame = {}, index = 0) {
  const url = frame.exportUrl || frame.resultUrl || "";
  return {
    id: `storyboard-board-frame-${frame.id || index}`,
    url,
    sourceUrl: url,
    type: "image",
    label: storyboardBoardFrameCaption(frame, index),
    fileName: frame.fileName || fileNameFromLocalUrl(url),
    mimeType: mimeForOutputItem({ url, type: "image" })
  };
}

function storyboardBoardFrameCaption(frame = {}, index = 0) {
  const text = String(frame.description || frame.beat || frame.prompt || "").replace(/\s+/g, " ").trim();
  return text.replace(/@([A-Za-z][\w-]*)/g, "$1") || `Frame ${index + 1}`;
}

function safeStoryboardBoardFileName(value = "storyboard") {
  return String(value || "storyboard")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "storyboard";
}

async function createStoryboardBoardImageBlob({ aspectRatio = "16:9", frames = [] } = {}) {
  const completedFrames = normalizedStoryboardFrames(frames).filter((frame) => frame.exportUrl || frame.resultUrl);
  if (!completedFrames.length) throw new Error("No completed storyboard frames to lock.");
  const columns = Math.max(1, Math.min(3, completedFrames.length));
  const compact = completedFrames.length > 18;
  const imageWidth = compact ? 340 : 430;
  const ratio = aspectRatioNumber(aspectRatio || storyboardDefaultAspectRatio);
  const imageHeight = Math.max(160, Math.round(imageWidth / Math.max(0.25, ratio)));
  const captionHeight = compact ? 58 : 72;
  const gap = compact ? 14 : 18;
  const margin = compact ? 24 : 30;
  const topPadding = margin;
  const rows = Math.ceil(completedFrames.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(columns * imageWidth + (columns - 1) * gap + margin * 2);
  canvas.height = Math.round(topPadding + rows * (imageHeight + captionHeight) + Math.max(0, rows - 1) * gap + margin);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create storyboard board image.");

  context.fillStyle = "#f2f2f2";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const images = await Promise.all(completedFrames.map(async (frame) => {
    try {
      return await loadCanvasImage(frame.exportUrl || frame.resultUrl);
    } catch {
      return null;
    }
  }));

  completedFrames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (imageWidth + gap);
    const y = topPadding + row * (imageHeight + captionHeight + gap);
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, imageWidth, imageHeight);
    const image = images[index];
    if (image) {
      drawCanvasImageContain(context, image, x, y, imageWidth, imageHeight);
    } else {
      context.fillStyle = "#d7d7d7";
      context.fillRect(x, y, imageWidth, imageHeight);
      context.fillStyle = "#555555";
      context.font = "700 18px Arial, Helvetica, sans-serif";
      context.fillText("Image unavailable", x + 18, y + imageHeight / 2 - 10);
    }
    context.strokeStyle = "#050505";
    context.lineWidth = 3;
    context.strokeRect(x, y, imageWidth, imageHeight);
    const captionY = y + imageHeight + 11;
    const numberColumnWidth = compact ? 34 : 40;
    context.fillStyle = "#111111";
    context.font = compact ? "800 15px Arial, Helvetica, sans-serif" : "800 17px Arial, Helvetica, sans-serif";
    context.textBaseline = "top";
    context.fillText(String(index + 1).padStart(2, "0"), x + 2, captionY + 1);
    context.strokeStyle = "#bbbbbb";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + numberColumnWidth - 8, captionY + 1);
    context.lineTo(x + numberColumnWidth - 8, y + imageHeight + captionHeight - 12);
    context.stroke();
    drawWrappedCanvasText(context, storyboardBoardFrameCaption(frame, index), x + numberColumnWidth, captionY, imageWidth - numberColumnWidth - 4, captionHeight - 12, {
      font: compact ? "16px Arial, Helvetica, sans-serif" : "18px Arial, Helvetica, sans-serif",
      lineHeight: compact ? 18 : 21,
      color: "#111111"
    });
  });

  return canvasToBlob(canvas, "image/png", "Could not create storyboard board image.");
}

function drawCanvasImageContain(context, image, x, y, width, height) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.min(width / Math.max(1, imageWidth), height / Math.max(1, imageHeight));
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawWrappedCanvasText(context, text, x, y, width, height, { font = "18px Arial, Helvetica, sans-serif", lineHeight = 21, color = "#111111" } = {}) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return;
  context.save();
  context.fillStyle = color;
  context.font = font;
  context.textBaseline = "top";
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= width || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((lineText, index) => {
    let output = lineText;
    if (index === maxLines - 1 && lines.length > maxLines) {
      while (output.length > 4 && context.measureText(`${output}...`).width > width) output = output.slice(0, -1);
      output = `${output.trim()}...`;
    }
    context.fillText(output, x, y + index * lineHeight);
  });
  context.restore();
}

function cacheBustedAssetUrl(url, version = 0) {
  const value = String(url || "").trim();
  if (!value) return "";
  const token = finiteNumber(version, 0);
  if (!token) return value;
  return `${value}${value.includes("?") ? "&" : "?"}v=${encodeURIComponent(token)}`;
}

function storyboardFrameImageSrc(frame = {}) {
  return previewImageUrl(cacheBustedAssetUrl(frame.thumbnailUrl || frame.resultUrl, frame.resultVersion));
}

function storyboardFrameFallbackSrc(frame = {}) {
  return cacheBustedAssetUrl(frame.resultFallbackUrl, frame.resultVersion);
}

function storyboardFrameCountForNode(node, incoming = null) {
  const directorCount = incoming ? directorPackageShotCount(connectedDirectorPackageSource(incoming.directorIn || [])) : 0;
  if (directorCount) return storyboardFrameCountNumber(directorCount);
  const value = normalizeStoryboardFrameCountValue(node?.data?.frameCount);
  if (value === storyboardAutoFrameCount) {
    return storyboardFrameCountNumber(directorCount || storyboardDefaultFrameCount);
  }
  return storyboardFrameCountNumber(value);
}

function storyboardFramesFromPlan(frames = []) {
  if (!Array.isArray(frames)) return [];
  return frames.slice(0, storyboardMaxFrameCount).map((frame, index) =>
    createStoryboardFrame(index + 1, {
      shot: normalizeChoice(frame.shot || "None", shotPresetNames, "None"),
      lens: normalizeChoice(frame.lens || "None", lensPresetNames, "None"),
      angle: normalizeChoice(frame.angle || "None", typePresetNames, "None"),
      beat: frame.beat || "",
      prompt: frame.prompt || "",
      notes: frame.notes || ""
    })
  );
}

function normalizeStoryboardQcForClient(qc = {}) {
  const issues = Array.isArray(qc.issues)
    ? qc.issues.map((issue) => String(issue || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  const pass = qc.pass !== false;
  return {
    pass,
    shouldRetry: !pass && qc.shouldRetry !== false,
    severity: qc.severity || (pass ? "ok" : "major"),
    summary: String(qc.summary || (pass ? "Frame passed QC." : "Frame may need correction.")).trim(),
    issues,
    correctionPrompt: String(qc.correctionPrompt || "").trim()
  };
}

function storyboardQcRetryPrompt(basePrompt = "", qc = {}) {
  const issues = Array.isArray(qc.issues) && qc.issues.length ? qc.issues.join("; ") : qc.summary || "physical or continuity issue";
  const correction = qc.correctionPrompt || `Correct these storyboard issues: ${issues}.`;
  return [
    basePrompt,
    "STORYBOARD QC RETRY: Regenerate this same frame, but fix only the listed problems. Preserve the intended story beat, character tags, storyboard style, and scene continuity.",
    `QC problems to fix: ${issues}.`,
    correction,
    "Do not repeat the failed composition. Keep the character side-of-room, screen direction, object contact points, perspective, and shot scale physically coherent."
  ].filter(Boolean).join("\n\n");
}

function fallbackStoryboardPlanForClient(sceneDescription = "", frameCount = storyboardDefaultFrameCount) {
  return {
    sceneTitle: "Scene 1",
    analysis: "Fallback shot plan with clear screen direction and simple editorial progression.",
    frames: defaultStoryboardFrames(frameCount).map((frame, index) => ({
      ...frame,
      shot: ["WS", "MS", "CU", "MS", "CU", "WS"][index % 6],
      lens: index === 0 ? "35mm" : "None",
      beat: storyboardFallbackBeat(index),
      prompt: `${storyboardFallbackBeat(index)} Single storyboard frame for: ${sceneDescription || "the described scene"}. Preserve screen direction, blocking, eyeline, silhouette, and continuity.`
    }))
  };
}

function storyboardFallbackBeat(index) {
  return [
    "Establish the scene geography and main subjects.",
    "Move closer to clarify action and blocking.",
    "Show the key emotional or story detail.",
    "Show the reaction or next action while preserving eyelines.",
    "Use a story-relevant insert or tighter detail.",
    "Resolve the beat in a wider contextual frame."
  ][index % 6];
}

function storyboardCharacterSummariesForNode(node, externalItems = [], incomingByNode = null, options = {}) {
  const externalCharacters = activeConnectedCharacterSources(externalItems, incomingByNode).map((source) => ({
    name: source.data.characterName || source.data.title || "Character",
    tag: characterTag(source)
  }));

  if (options.includeInternal !== false && storyboardUsesInternalCharacters(node)) {
    const internalCharacters = normalizedStoryboardCharacters(node.data?.storyboardCharacters)
      .filter((character) => character.name || character.portrait?.localUrl)
      .map((character) => ({
        name: character.name || "Character",
        tag: storyboardCharacterTag(character)
      }));
    return [...internalCharacters, ...externalCharacters];
  }

  return externalCharacters;
}

function storyboardMissingRequiredCharacterTags(node, externalItems = [], incomingByNode = null, text = "", options = {}) {
  const knownTags = storyboardCharacterSummariesForNode(node, externalItems, incomingByNode, options)
    .map((character) => character.tag)
    .filter(Boolean);
  if (!knownTags.length) return [];

  const availableTags = new Set(
    storyboardCharacterSourcesForNode(node, externalItems, incomingByNode, options)
      .map((source) => characterTag(source).toLowerCase())
      .filter(Boolean)
  );

  return knownTags
    .filter((tag) => promptHasTag(text, tag))
    .filter((tag) => !availableTags.has(tag.toLowerCase()));
}

function storyboardPreparedCharacterCount(node) {
  return normalizedStoryboardCharacters(node?.data?.storyboardCharacters)
    .filter((character) => character.sheetUrl && storyboardCharacterTag(character))
    .length;
}

function storyboardNodeWithMostPreparedCharacters(preparedNode, stateNode) {
  if (!stateNode || preparedNode?.type !== "storyboard" || stateNode.type !== "storyboard") return preparedNode || stateNode;
  if (storyboardPreparedCharacterCount(stateNode) >= storyboardPreparedCharacterCount(preparedNode)) return stateNode;
  return {
    ...stateNode,
    data: {
      ...stateNode.data,
      storyboardCharacters: normalizedStoryboardCharacters(preparedNode.data?.storyboardCharacters)
    }
  };
}

function storyboardCharacterSourcesForNode(node, externalItems = [], incomingByNode = null, options = {}) {
  const externalSources = activeConnectedCharacterSources(externalItems, incomingByNode);
  if (options.includeInternal === false || !storyboardUsesInternalCharacters(node)) {
    return externalSources;
  }

  const internalSources = normalizedStoryboardCharacters(node.data?.storyboardCharacters)
    .filter((character) => character.sheetUrl && storyboardCharacterTag(character))
    .map((character) => ({
      id: `${node.id}:${character.id}`,
      type: "character",
      data: {
        title: character.name || "Character",
        characterName: character.name || "Character",
        locked: true,
        activated: true,
        resultUrl: character.sheetUrl,
        resultItems: [{
          url: character.sheetUrl,
          type: "image",
          label: `@${storyboardCharacterTag(character)} Character Sheet`,
          fileName: character.sheetFileName || ""
        }],
        characterPhysicalDetails: "",
        characterTraits: [],
        customCharacterTraits: "",
        compiledTraitPrompt: ""
      }
    }));

  return [...internalSources, ...externalSources];
}

function storyboardCharacterReferenceItems(node, externalItems = [], incomingByNode = null, options = {}) {
  return storyboardCharacterSourcesForNode(node, externalItems, incomingByNode, options).map(storyboardCharacterReferenceItemForSource);
}

function storyboardCharacterReferenceItemForSource(source) {
  return {
    url: source.data.resultUrl,
    label: characterReferenceLabel(source, true)
  };
}

function storyboardImagePromptItems(node, incoming = {}, incomingByNode = null, options = {}) {
  const storyboardStyleEnabled = node.data.useStoryboardStyle !== false;
  const directorControlsScene = Boolean(connectedDirectorPackageSource(incoming.directorIn || []));
  const characterItems = Array.isArray(options.characterSources)
    ? options.characterSources.map(storyboardCharacterReferenceItemForSource)
    : storyboardCharacterReferenceItems(node, incoming.characterIn || [], incomingByNode, { includeInternal: !directorControlsScene });
  const sceneReferenceItems = storyboardSceneReferenceSources(incoming.sceneReferenceIn || [], incomingByNode)
    .map(({ url, label }) => ({ url, label }));
  const directMoodBoard = storyboardStyleEnabled && node.data.useMoodBoard !== false && node.data.storyboardMoodBoardUrl
    ? [{ url: node.data.storyboardMoodBoardUrl, label: storyboardMoodBoardLabel }]
    : [];
  const connectedMoodBoard = storyboardStyleEnabled ? [] : connectedImagePromptItems(incoming.transferIn || [], incomingByNode, { includeComposerCharacterBindings: false });
  return uniqueStoryboardImagePromptItems([...characterItems, ...sceneReferenceItems, ...directMoodBoard, ...connectedMoodBoard]);
}

function uniqueStoryboardImagePromptItems(items = []) {
  const uniqueItems = new Map();
  items.forEach((item) => {
    if (item?.url) uniqueItems.set(`${item.url}|${item.label || ""}`, item);
  });
  return [...uniqueItems.values()];
}

function storyboardFrameReferenceUrl(frame = {}) {
  if (frame.qcPassed === false) return "";
  return frame.exportUrl || frame.resultUrl || "";
}

function storyboardFrameContinuityText(frame = {}) {
  return [frame.beat, frame.prompt, frame.notes, frame.shot, frame.angle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isStoryboardInsertFrame(frame = {}) {
  const text = storyboardFrameContinuityText(frame);
  if (!text) return false;
  return /\b(insert|cutaway|detail|prop|object|macro|still life|phone screen|screen close|message|muffin)\b/.test(text)
    || /\b(close[-\s]?up|closeup|extreme close[-\s]?up)\b/.test(text);
}

function isStoryboardSpatialAnchorFrame(frame = {}) {
  if (!storyboardFrameReferenceUrl(frame) || isStoryboardInsertFrame(frame)) return false;
  const shot = String(frame.shot || "").toUpperCase();
  if (shot === "CU" || shot === "ECU") return false;
  return true;
}

function storyboardContinuityReferenceItems(node, frame) {
  const frames = normalizedStoryboardFrames(node?.data?.storyboardFrames);
  const frameIndex = frames.findIndex((item) => item.id === frame.id);
  if (frameIndex <= 0) return [];
  const previousFrames = [...frames.slice(0, frameIndex)].reverse();
  const previousFrame = previousFrames.find((item) => storyboardFrameReferenceUrl(item));
  if (!previousFrame) return [];

  const references = [{
    url: storyboardFrameReferenceUrl(previousFrame),
    label: storyboardPreviousFrameLabel
  }];
  const previousFrameIsSpatialAnchor = isStoryboardSpatialAnchorFrame(previousFrame);
  if (!previousFrameIsSpatialAnchor) {
    const spatialAnchorFrame = previousFrames.find((item) => isStoryboardSpatialAnchorFrame(item));
    const spatialAnchorUrl = storyboardFrameReferenceUrl(spatialAnchorFrame);
    if (spatialAnchorUrl && spatialAnchorUrl !== storyboardFrameReferenceUrl(previousFrame)) {
      references.push({
        url: spatialAnchorUrl,
        label: storyboardSpatialAnchorLabel
      });
    }
  }
  return references;
}

function storyboardImagePromptItemsForFrame(baseItems = [], continuityReferenceItems = []) {
  return uniqueStoryboardImagePromptItems([
    ...baseItems,
    ...continuityReferenceItems
  ]);
}

function storyboardCharacterReferenceMapPrompt(characterSources = []) {
  if (!characterSources.length) return "";
  const mappings = characterSources
    .map((source) => `@${characterTag(source)} = uploaded image reference labeled "${characterReferenceLabel(source, true)}"`)
    .join("; ");
  return `Character reference map: ${mappings}. When a scene or frame mentions one of these @tags, use the matching character sheet exactly for that character's face, hair, body proportions, selected wardrobe, and recognizable details. Keep each named character visually distinct and do not substitute one character sheet for another.`;
}

function storyboardSceneReferenceSources(items = [], incomingByNode = null) {
  const uniqueSources = new Map();

  items.forEach(({ source, edge }, index) => {
    const outputItem = connectedOutputItem(source, edge);
    const url = outputItem?.url || connectedOutputUrl(source, edge);
    if (!url) return;

    const rawLabel = source.data?.title || outputItem?.label || sourceLabel(source) || `Reference ${index + 1}`;
    const label = cleanImageReferenceLabel(rawLabel) || `Reference ${index + 1}`;
    const tag = cleanPromptTag(source.data?.title || label) || `Reference${index + 1}`;
    uniqueSources.set(`${url}|${tag}`, {
      url,
      label,
      tag,
      nodeId: source.id
    });
  });

  return [...uniqueSources.values()];
}

function storyboardSceneReferenceMapPrompt(referenceSources = []) {
  if (!referenceSources.length) return "";
  const mappings = referenceSources
    .map((source) => `@${source.tag} = uploaded image reference labeled "${source.label}"`)
    .join("; ");
  return `Scene reference map: ${mappings}. When a scene or frame mentions one of these @tags, use the matching uploaded image reference for that product, prop, object, location, environment, brand detail, texture, or design cue. Preserve the Storyboard node's final drawing style; use scene references for visual continuity and referenced details only, not as a photorealistic rendering style. If a connected scene reference is not named or clearly relevant, do not force it into every frame.`;
}

function storyboardSceneReferenceSummaries(items = [], incomingByNode = null) {
  return storyboardSceneReferenceSources(items, incomingByNode)
    .map((source) => ({
      tag: source.tag,
      label: source.label
    }));
}

function storyboardCharacterSourcesTaggedInText(characterSources = [], text = "") {
  const uniqueSources = new Map();
  characterSources.forEach((source) => {
    const tag = characterTag(source);
    if (tag && promptHasTag(text, tag)) uniqueSources.set(tag.toLowerCase(), source);
  });
  return [...uniqueSources.values()];
}

function storyboardRequiredCharacterSourcesForFrame(node, frame, sceneDescription = "", incoming = {}, incomingByNode = null, options = {}) {
  const directorControlsScene = Boolean(connectedDirectorPackageSource(incoming.directorIn || []));
  const characterSources = storyboardCharacterSourcesForNode(node, incoming.characterIn || [], incomingByNode, { includeInternal: options.includeInternal ?? !directorControlsScene });
  const framePrompt = frame.prompt || frame.beat || "";
  const frameTagText = [framePrompt, frame.beat, frame.notes].filter(Boolean).join("\n");
  const frameTaggedCharacterSources = storyboardCharacterSourcesTaggedInText(characterSources, frameTagText);
  if (frameTaggedCharacterSources.length) return frameTaggedCharacterSources;

  const sceneTaggedCharacterSources = storyboardCharacterSourcesTaggedInText(characterSources, sceneDescription);
  if (characterSources.length === 1 && /\b(character|person|subject|hero|protagonist|man|woman|boy|girl|he|she|they|their|him|her)\b/i.test(frameTagText || sceneDescription)) {
    return characterSources;
  }

  return !frameTagText.trim() ? sceneTaggedCharacterSources : [];
}

function storyboardRequiredCastPrompt(requiredSources = []) {
  if (!requiredSources.length) return "";
  const cast = requiredSources
    .map((source) => `@${characterTag(source)} must use "${characterReferenceLabel(source, true)}"`)
    .join("; ");
  return `Required character cast for this frame: ${cast}. Every @tag named in this frame must be represented by its own matching character sheet. Do not omit, merge, swap, gender-shift, age-shift, or replace these tagged characters. If a tagged character is described as off-screen, keep them off-screen but preserve the correct eyeline and screen direction.`;
}

function storyboardFrameCharacterIsolationPrompt(activeSources = [], allSources = []) {
  if (!activeSources.length) return "";
  const activeKeys = new Set(activeSources.map((source) => characterTag(source).toLowerCase()).filter(Boolean));
  const activeList = activeSources
    .map((source) => `@${characterTag(source)} = "${characterReferenceLabel(source, true)}"`)
    .join("; ");
  const inactiveList = allSources
    .filter((source) => {
      const tag = characterTag(source);
      return tag && !activeKeys.has(tag.toLowerCase());
    })
    .map((source) => `@${characterTag(source)}`)
    .filter(Boolean)
    .join(", ");
  return [
    `Frame character lock: active character sheets for this frame are ${activeList}.`,
    "Use only these active sheets for visible character identity, face, hair, body proportions, wardrobe, and recognizable details.",
    inactiveList ? `Ignore inactive character sheets for this frame: ${inactiveList}.` : "",
    "Do not borrow, merge, swap, or blend faces, hair, wardrobe, body type, or names between character sheets. Verify every visible @tag matches its own sheet before output."
  ].filter(Boolean).join(" ");
}

function resolveStoryboardCharacterMentions(prompt, characterSources = []) {
  return characterSources.reduce((value, source) => {
    const tag = characterTag(source);
    const replacement = `@${tag} (the character from uploaded reference "${characterReferenceLabel(source, true)}")`;
    return replacePromptTag(value, tag, replacement);
  }, String(prompt || ""));
}

function buildStoryboardFramePrompt(node, frame, sceneDescription = "", incoming = {}, incomingByNode = null, options = {}) {
  const directorControlsScene = Boolean(connectedDirectorPackageSource(incoming.directorIn || []));
  const characterSources = storyboardCharacterSourcesForNode(node, incoming.characterIn || [], incomingByNode, { includeInternal: !directorControlsScene });
  const sceneReferenceSources = storyboardSceneReferenceSources(incoming.sceneReferenceIn || [], incomingByNode);
  const namedCharacterReferences = characterSources.length > 0;
  const framePrompt = frame.prompt || frame.beat || sceneDescription || "Storyboard frame";
  const aspectRatio = storyboardAspectRatioForNode(node);
  const scenePlanningNote = directorControlsScene ? "" : String(node.data.storyboardNotes || "").trim();
  const frameTagText = [framePrompt, frame.beat, frame.notes].filter(Boolean).join("\n");
  const requiredCharacterSources = Array.isArray(options.requiredCharacterSources)
    ? options.requiredCharacterSources
    : storyboardRequiredCharacterSourcesForFrame(node, frame, sceneDescription, incoming, incomingByNode, { includeInternal: !directorControlsScene });
  const activeCharacterSources = Array.isArray(options.activeCharacterSources)
    ? options.activeCharacterSources
    : (requiredCharacterSources.length ? requiredCharacterSources : characterSources);
  const resolvedPrompt = resolveStoryboardCharacterMentions(framePrompt, characterSources);
  const resolvedSceneDescription = resolveStoryboardCharacterMentions(sceneDescription, characterSources);
  const characterReferenceMap = storyboardCharacterReferenceMapPrompt(activeCharacterSources);
  const sceneReferenceMap = storyboardSceneReferenceMapPrompt(sceneReferenceSources);
  const requiredCastPrompt = storyboardRequiredCastPrompt(requiredCharacterSources);
  const characterIsolationPrompt = storyboardFrameCharacterIsolationPrompt(activeCharacterSources, characterSources);
  const cameraPieces = [
    shotPresetPrompts[frame.shot] || "",
    lensPresetPrompts[frame.lens] || "",
    typePresetPrompts[frame.angle] || ""
  ].filter(Boolean);
  const characterPieces = activeCharacterSources.flatMap((source) => characterImagePromptPieces(source, namedCharacterReferences));
  const storyboardStyleEnabled = node.data.useStoryboardStyle !== false;
  const moodBoardConnected = Boolean(storyboardStyleEnabled && node.data.useMoodBoard !== false && node.data.storyboardMoodBoardUrl);
  const stylePieces = storyboardStyleEnabled
    ? [stylePresetPrompts.Storyboard, storyboardBaseInstruction]
    : (incoming.styleIn || []).flatMap(({ source }) => promptPiecesForSource(source));
  const moodBoardPieces = storyboardStyleEnabled
    ? (moodBoardConnected ? [storyboardMoodBoardStyleInstruction] : [])
    : (incoming.transferIn || []).flatMap(({ source }) => promptPiecesForSource(source));
  const sceneContinuityPieces = [
    resolvedSceneDescription
      ? `Scene continuity bible: ${resolvedSceneDescription}. Preserve the same environment, lighting source and direction, recurring objects, wardrobe, and spatial geography across the sequence. Use the current frame prompt for the exact camera angle and story moment.`
      : "",
    options.hasPreviousFrameReference
      ? `If an uploaded image labeled ${storyboardPreviousFrameLabel} is present, use it as the last approved continuity frame for the immediately preceding story beat, lighting direction, character identity, wardrobe, and recurring objects. Do not copy its rendering style if it looks photographic or overly realistic. Do not let an insert, cutaway, object close-up, or detail shot redefine the room geography, character screen position, or 180 degree line.`
      : "",
    options.hasSpatialAnchorReference
      ? `If an uploaded image labeled ${storyboardSpatialAnchorLabel} is present, use it as the approved spatial anchor for room layout, character side of frame, screen direction, eyelines, blocking, lighting direction, and object placement. Use the anchor for geography only, not rendering style. The current frame prompt still controls the new shot size, camera angle, and story moment; do not copy the anchor's exact composition unless requested.`
      : ""
  ].filter(Boolean);
  const frameHeader = [
    `Scene: ${node.data.sceneName || "Scene 1"}.`,
    `Frame ${String(frame.number || 1).padStart(3, "0")}.`,
    `Native frame aspect ratio: ${aspectRatio}. Compose specifically for ${aspectRatio}; do not crop, letterbox, pillarbox, add borders, or force this image into any other aspect ratio.`,
    frame.beat ? `Story beat: ${frame.beat}` : "",
    scenePlanningNote ? `Scene-level planning note: ${scenePlanningNote}` : "",
    frame.notes ? `Continuity note: ${frame.notes}` : ""
  ].filter(Boolean).join(" ");

  return [
    frameHeader,
    resolvedPrompt,
    ...cameraPieces,
    storyboardContinuityInstruction,
    characterReferenceMap,
    sceneReferenceMap,
    requiredCastPrompt,
    characterIsolationPrompt,
    ...sceneContinuityPieces,
    ...stylePieces,
    ...moodBoardPieces,
    ...characterPieces,
    storyboardStyleEnabled ? storyboardReferenceStyleGuard : "",
    storyboardStyleEnabled ? storyboardFinalStyleClamp : "",
    "Output only the image. Do not include captions, labels, panel borders, numbering, or text unless specifically requested in the frame prompt."
  ].filter(Boolean).join("\n\n");
}

function storyboardOutputItem(source, edge) {
  if (source?.type !== "storyboard") return null;
  if (edge?.from?.port === storyboardBoardOutputPortId) return storyboardBoardOutputItem(source);
  return storyboardFrameOutputItem(source, edge);
}

function storyboardBoardOutputItem(source) {
  const url = String(source?.data?.storyboardBoardUrl || "").trim();
  if (!url) return null;
  const layoutItems = normalizedPreviewLayoutItems(source.data?.storyboardBoardFrames);
  return {
    url,
    type: "image",
    label: source.data?.sceneName || source.data?.title || "Storyboard",
    text: source.data?.storyboardAnalysis || "",
    fileName: source.data?.storyboardBoardFileName || fileNameFromLocalUrl(url),
    mimeType: source.data?.storyboardBoardMimeType || "image/png",
    layoutItems
  };
}

function storyboardFrameOutputItem(source, edge) {
  if (source?.type !== "storyboard") return null;
  const frame = storyboardFrameForOutputPort(source, edge?.from?.port);
  if (!frame?.resultUrl) return null;
  return {
    url: frame.exportUrl || frame.resultUrl,
    type: "image",
    label: `Frame ${String(frame.number || 1).padStart(3, "0")}`,
    text: frame.prompt || "",
    fileName: frame.fileName || ""
  };
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
  const model = data.model || imageModelNames.openAiImage2;
  const isSeedream5 = isSeedream5ImageModel(model);
  const isNanoBanana2 = isNanoBanana2Model(model);
  return {
    ...data,
    title: data.title || "Image Model",
    model,
    prompt: data.prompt || "",
    aspectRatio: normalizeImageModelAspectRatio(data.aspectRatio, model),
    resolution: isSeedream5
      ? normalizeChoice(String(data.resolution || "2K").toUpperCase(), seedream5ResolutionOptions, "2K")
      : isNanoBanana2
        ? normalizeNanoBanana2Resolution(data.resolution)
        : normalizeImageModelResolution(data.resolution),
    quality: normalizeOpenAiImage2Quality(data.quality),
    kreaCreativity: normalizeKrea2Creativity(data.kreaCreativity),
    seedreamLayers: isSeedream5 ? Boolean(data.seedreamLayers) : false,
    batchCount: isSeedream5 && data.seedreamLayers ? "1" : data.batchCount || "1",
    settingsOpen: data.settingsOpen !== false
  };
}

function normalizeAutoAspectData(data = {}) {
  const selectedAspectRatios = normalizedAutoAspectRatios(data);
  const activeKeys = new Set(autoAspectTargetsForData({ selectedAspectRatios }).map(autoAspectTargetKey));
  const autoAspectResults = normalizedAutoAspectResults(data).filter((result) => activeKeys.has(result.key));
  const resultItems = autoAspectResultItems({ autoAspectResults });
  const selectedResultIndex = Math.min(
    Math.max(0, Math.trunc(Number(data.selectedResultIndex) || 0)),
    Math.max(0, resultItems.length - 1)
  );
  return {
    ...createDefaultNodeData("autoAspect", data.title || "Auto Aspect", 1),
    ...data,
    title: data.title || "Auto Aspect",
    selectedAspectRatios,
    autoAspectResults,
    resultItems,
    resultUrl: resultItems[selectedResultIndex]?.url || resultItems[0]?.url || data.resultUrl || "",
    selectedResultIndex,
    model: normalizeAutoAspectModel(data.model),
    resolution: normalizeImageModelResolution(data.resolution || "2K"),
    removeTextGraphics: Boolean(data.removeTextGraphics),
    advancedOpen: Boolean(data.advancedOpen)
  };
}

function normalizeStyleData(data = {}) {
  const defaultData = createDefaultNodeData("style", data.title || "Style", 1);
  const customPaletteColors = normalizedCustomPaletteColors(data);
  return {
    ...defaultData,
    ...data,
    title: data.title || "Style",
    stylePreset: normalizeChoice(data.stylePreset || "None", stylePresetNames, "None"),
    customPaletteRgbText: String(data.customPaletteRgbText || ""),
    customPalettePicker: /^#[0-9a-f]{6}$/i.test(String(data.customPalettePicker || "")) ? data.customPalettePicker : "#ddc631",
    customPaletteColors,
    customPalettePreviewUrl: String(data.customPalettePreviewUrl || ""),
    customPaletteSourceName: String(data.customPaletteSourceName || ""),
    customPaletteStatus: "",
    customPaletteError: ""
  };
}

function normalizeVideoModelData(data = {}) {
  const model = data.model || videoModelNames.seedance;
  return {
    ...createDefaultNodeData("videoModel", data.title || "Video Model", 1),
    ...data,
    ...videoModelSelectionPatch(data, model),
    title: data.title || "Video Model",
    prompt: data.prompt || "",
    batchCount: data.batchCount || "1"
  };
}

function normalizeComposerData(data = {}) {
  const { prompt: _legacyPrompt, ...composerData } = data;
  const composerScene = normalizedComposerScene(data.composerScene);
  const selectedStillExists = data.composerSelectedId === "camera" || [...composerScene.maquettes, ...composerScene.props, ...composerScene.imagePlanes].some((item) => item.id === data.composerSelectedId);
  return {
    ...composerData,
    title: data.title || "Composer",
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

function textModelTitleFromLegacy(title) {
  const value = String(title || "").trim();
  if (!value) return "Smart Text Model";
  const match = value.match(/^(?:Text(?: Model)?|Smart Text(?: Model)?)( \d+)?$/i);
  return match ? `Smart Text Model${match[1] || ""}` : value;
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
          typePreset: data.typePreset || "None"
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
    if (!hasCameraPreset(source)) return null;
    nextEdge.from.port = "cameraOut";
    nextEdge.color = portColors.camera;
  }

  if (source.type === "style") {
    nextEdge.from.port = "styleOut";
    nextEdge.color = portColors.style;
  }

  if (source.type === "skillDirector") {
    nextEdge.from.port = "directorOut";
    if (target?.type === "videoModel" && nextEdge.to.port === "promptIn") nextEdge.to.port = "directorIn";
    if (target?.type === "storyboard" && nextEdge.to.port === "sceneDescriptionIn") nextEdge.to.port = "directorIn";
    nextEdge.color = portColors.director;
  }

  if (source.type === "utility") {
    nextEdge.from.port = "utilityOut";
    nextEdge.color = utilityOutputType(source) === "video" ? portColors.video : portColors.image;
  }

  if (source.type === "autoAspect") {
    if (!autoAspectOutputItem(source, nextEdge)) return null;
    nextEdge.color = portColors.image;
  }

  if (source.type === "composer") {
    if (nextEdge.from.port === "promptOut" || nextEdge.to.port === "promptIn") return null;
    nextEdge.from.port = "imageOut";
    nextEdge.color = portColors.image;
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

  if (target?.type === "composer" && isComposerCharacterInputPort(nextEdge.to.port, target)) {
    if (source.type !== "character" || nextEdge.from.port === "voiceOut") return null;
    nextEdge.from.port = "characterOut";
    nextEdge.color = portColors.character;
  }

  if (!inputPortIdsForNode(target).includes(nextEdge.to.port)) return null;
  if (!outputPortIdsForNode(source).includes(nextEdge.from.port)) return null;
  if (isImageModelUnsupportedInput(target, nextEdge.to.port)) return null;
  if (isImageModelUnsupportedSource(target, source)) return null;
  if (isVideoModelUnsupportedInput(target, nextEdge.to.port)) return null;
  if (!portsAreCompatible(source, nextEdge.from.port, target, nextEdge.to.port)) return null;

  return nextEdge;
}

function transferTitleFromLegacy(title) {
  if (!title) return "Mood Board";
  return String(title).replace(/^(Style|Direction|Transfer)\b/, "Mood Board");
}

function roundPreviewScale(value) {
  return Math.round(value * 100) / 100;
}

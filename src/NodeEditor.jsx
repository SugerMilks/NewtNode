import React from "react";
import * as THREE from "three";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileAudio,
  FileImage,
  Film,
  FolderOpen,
  MonitorPlay,
  ImagePlus,
  Lock,
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
  { type: "style", label: "Style", icon: Palette },
  { type: "transfer", label: "Mood Board", icon: Compass },
  { type: "utility", label: "Utility", icon: Wrench },
  { type: "video", label: "Video", icon: Video },
  { type: "audio", label: "Audio", icon: FileAudio },
  { type: "preview", label: "Preview", icon: MonitorPlay },
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
const transferPromptSuffix =
  "Only use the uploaded collage reference image labeled MOOD_BOARD.png as a mood board reference for color grading, grain style, texture, lighting, and camera qualities. The generated image should NOT take content, layout, subjects, or composition from MOOD_BOARD.png directly; only use it as a visual guide.";
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
const minZoom = 0.35;
const maxZoom = 1.9;
const nodeDraftStorageKey = "seedance-node-editor-draft-v1";
const previewBaseWidth = 330;
const groupPalette = ["#3d85ff", "#f0c83b", "#58ce63", "#9b5cff", "#ff4fb3", "#ff8b35"];
const referenceTagPalette = ["#4d8dff", "#ff4fb3", "#9b5cff", "#58ce63", "#ff8b35", "#f0c83b"];
const groupPadding = { x: 42, top: 62, bottom: 42 };
const groupMinWidth = 260;
const groupMinHeight = 190;
const imageRunStaggerMs = 850;
const videoModelNames = {
  seedance: "Seedance 2.0",
  seedanceFast: "Seedance 2.0 Fast",
  wanFunControl: "Wan Fun Control",
  aurora: "Creatify Aurora",
  sam3Video: "SAM 3 Video"
};
const utilityImageModelNames = {
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
  sam3Video: "SAM 3 Video",
  voidVideoInpainting: "VOID Video Inpainting",
  birefnetVideo: "BiRefNet Video"
};
const birefnetModelOptions = ["General Use (Light)", "General Use (Light 2K)", "General Use (Heavy)", "Matting", "Portrait", "General Use (Dynamic)"];
const birefnetResolutionOptions = ["1024x1024", "2048x2048", "2304x2304"];
const utilityModelDescriptions = {
  [utilityImageModelNames.stillFrame]: "Extracts a still PNG frame from a connected video locally, without an API call.",
  [utilityImageModelNames.dwpose]: "Creates pose/control maps from a source image for character and body-guided generation.",
  [utilityImageModelNames.depthAnything]: "Extracts a depth map from an image for depth-aware control and composition.",
  [utilityImageModelNames.patina]: "Generates PBR texture maps such as basecolor, normal, roughness, metalness, and height.",
  [utilityImageModelNames.sam3Image]: "Segments prompted objects in an image and returns the masked result.",
  [utilityImageModelNames.birefnetImage]: "Removes an image background with BiRefNet and can optionally return the mask.",
  [utilityVideoModelNames.wanFunControl]: "Uses a control video, optional reference image, and prompt to guide a new video.",
  [utilityVideoModelNames.sam3Video]: "Segments prompted objects through a video and returns the masked result.",
  [utilityVideoModelNames.voidVideoInpainting]: "Removes an object from a video and inpaints the affected background over time.",
  [utilityVideoModelNames.birefnetVideo]: "Removes a video background with BiRefNet and can optionally return the mask video."
};
const sam3SegmentationModelsEnabled = false; // Flip back to true when revisiting SAM 3 segmentation.

export default function NodeEditor({ active = true } = {}) {
  const canvasRef = React.useRef(null);
  const projectMenuRef = React.useRef(null);
  const workflowFileInputRef = React.useRef(null);
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
  const [projects, setProjects] = React.useState([]);
  const [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [toolbarCollapsed, setToolbarCollapsed] = React.useState(true);
  const [saveStatus, setSaveStatus] = React.useState("");
  const [compilingTransferNodeId, setCompilingTransferNodeId] = React.useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState(null);

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
  const selectedProjectName = projects.find((project) => project.id === projectId)?.name;

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
          savedProjectName
        })
      );
    } catch {
      // Local persistence should never interrupt the node editor.
    }
  }, [nodes, edges, groups, viewport, projectId, projectName, savedProjectName]);

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
  }, [active, selectedNodeIds, selectedEdgeId, nodes, edges, groups, viewport, projectId, projectName, savedProjectName, selectedProjectName]);

  React.useEffect(() => {
    if (!active) return undefined;
    function handlePointerDown(event) {
      if (!projectMenuRef.current?.contains(event.target)) {
        setProjectMenuOpen(false);
      }
      if (!event.target.closest?.(".node-context-menu")) {
        setContextMenu(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [active]);

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

  function addNode(type, position) {
    const count = nodes.filter((node) => node.type === type).length + 1;
    const spec = nodeCatalog.find((item) => item.type === type);
    const nodePosition = position || defaultNodePosition(count);
    pushUndoSnapshot();
    setSelectedEdgeId(null);
    setNodes((current) => [
      ...current,
      {
        id: createNodeId(type),
        type,
        x: nodePosition.x,
        y: nodePosition.y,
        data: createDefaultNodeData(type, spec?.label || "Node", count)
      }
    ]);
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
      width: Math.round(Math.max(groupMinWidth, bounds.width + groupPadding.x * 2)),
      height: Math.round(Math.max(groupMinHeight, bounds.height + groupPadding.top + groupPadding.bottom)),
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
      nodesRef.current = nextNodes;
      return nextNodes;
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

    pushUndoSnapshot();
    updateNode(node.id, {
      fileName: file.name,
      status: "uploading",
      error: "",
      resultUrl: ""
    });

    const form = new FormData();
    form.append("asset", file);
    form.append("nodeType", node.type);

    try {
      const response = await fetch("/api/node/upload-asset", {
        method: "POST",
        body: form
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");

      updateNode(node.id, {
        fileName: data.asset.fileName,
        storedFileName: data.asset.storedFileName,
        mimeType: data.asset.mimeType,
        mediaType: data.asset.mediaType,
        resultUrl: data.asset.localUrl,
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
        form.append("asset", file);
        form.append("nodeType", "transfer");

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
      compiledPortraitUrl: "",
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
              projectId,
              projectName
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
        compiledPortraitUrl: portrait.localUrl,
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
      compiledPortraitUrl: "",
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
    form.append("asset", file);
    form.append("nodeType", nodeType);
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
      form.append("asset", transferFile);
      form.append("nodeId", node.id);

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
                width: Math.round(clamp(dragState.group.width + deltaX, groupMinWidth, 4200)),
                height: Math.round(clamp(dragState.group.height + deltaY, groupMinHeight, 3200))
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
      const nextScale = Math.max(1, dragState.startScale + Math.max(deltaX, deltaY) / previewBaseWidth);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const menuPosition = clampContextMenuPosition(event.clientX - rect.left, event.clientY - rect.top, rect);
    setContextMenu({
      x: menuPosition.x,
      y: menuPosition.y,
      scene: screenToScene(event.clientX, event.clientY)
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

    if (event.ctrlKey || event.metaKey) {
      setViewport((current) => {
        const zoomFactor = Math.exp(-event.deltaY * 0.006);
        const nextScale = clamp(current.scale * zoomFactor, minZoom, maxZoom);
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
      return;
    }

    setViewport((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY
    }));
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
    }

    setDraftEdge(null);
    stopNodeDrag();
  }

  function canCreateEdge(from, to) {
    return !getConnectionError(from, to);
  }

  function getConnectionError(from, to) {
    const source = nodes.find((node) => node.id === from.nodeId);
    const target = nodes.find((node) => node.id === to.nodeId);

    if (!source || !target) return "Choose a valid connection";

    if (source.type === "camera") {
      if (from.port === "imageOut") {
        if (target.type === "preview" && to.port === "sourceIn") return "";
        if (target.type === "camera" && to.port === "imageIn") return "";
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
      if (target.type === "imageModel" && to.port === "styleIn") return "";
      return "Style presets connect to Style inputs";
    }

    if (source.type === "transfer") {
      if (!source.data.activated || !source.data.resultUrl) return `Lock Mood Board to enable ${moodBoardOutputFileName} output`;
      if (
        (target.type === "imageModel" && to.port === "transferIn") ||
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
        if (target.type === "videoModel" && to.port === "referenceVideoIn") return "";
        if (target.type === "utility" && ["referenceVideoIn", "maskVideoIn"].includes(to.port)) return "";
        return "Utility video output connects to video inputs";
      }

      if (target.type === "preview" && to.port === "sourceIn") return "";
      if (target.type === "camera" && to.port === "imageIn") return "";
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

    if (target?.type === "preview") {
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

  async function saveProject() {
    try {
      const cleanProjectName = String(projectName || "").trim() || "Untitled node project";
      const lastSavedName = String(savedProjectName || selectedProjectName || "").trim();
      const shouldCreateNewProject = Boolean(projectId && lastSavedName && cleanProjectName !== lastSavedName);

      setSaveStatus("Saving...");
      const response = await fetch("/api/saved-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: shouldCreateNewProject ? null : projectId,
          name: cleanProjectName,
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
      setSaveStatus(project.fileName ? `Saved ${project.fileName}` : shouldCreateNewProject ? "Saved as new workflow" : "Saved");
      await loadProjects();
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  function applyWorkflow(project, sourceLabel = "Loaded") {
    const graph = normalizeEditorGraph(project.graph?.nodes || [], project.graph?.edges || [], project.graph?.groups || []);
    setProjectId(project.id || null);
    setProjectName(project.name || "Untitled node project");
    setSavedProjectName(project.name || null);
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

      applyWorkflow(
        {
          ...project,
          id: project.id || null,
          name: project.name || file.name.replace(/\.json$/i, "") || "Untitled node project",
          fileName: file.name
        },
        "Opened"
      );
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
    const basePrompt = connectedText(incoming.promptIn) || currentNode.data.prompt;
    const isSingleRunSegmentation =
      (currentNode.type === "imageModel" && isSam3ImageModel(currentNode.data.model)) ||
      (currentNode.type === "videoModel" && isSam3VideoModel(currentNode.data.model)) ||
      (currentNode.type === "utility" &&
        utilityMode(currentNode) === "video" &&
        (isUtilitySam3VideoModel(currentNode.data.utilityVideoModel) || isUtilityBirefnetVideoModel(currentNode.data.utilityVideoModel)));
    const batchCount = isSingleRunSegmentation ? 1 : nodeBatchCount(currentNode);

    try {
      updateNode(currentNode.id, { status: "running", error: "", resultUrl: "", resultItems: [], selectedResultIndex: 0 });

      if (currentNode.type === "camera") {
        const generated = await runCameraQwenEdit({ node: currentNode, incoming, projectId, projectName });
        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: generated.url,
          resultItems: [generated],
          selectedResultIndex: 0,
          resultText: generated.prompt || "",
          seed: generated.seed,
          error: ""
        });
        return { status: "complete" };
      }

      if (currentNode.type === "utility") {
        if (utilityMode(currentNode) === "image") {
          const generatedItems = await runUtilityImageGeneration({
            node: currentNode,
            prompt: basePrompt,
            incoming,
            projectId,
            projectName
          });
          if (!generatedItems.length) throw new Error("Utility image returned no image.");
          const generated = generatedItems[0];
          updateNode(currentNode.id, {
            status: "complete",
            resultUrl: generated.url,
            resultItems: generatedItems,
            selectedResultIndex: 0,
            resultText: generatedItems.map((item) => item.text).filter(Boolean).join("\n\n"),
            resultType: "image",
            error: ""
          });
          return { status: "complete" };
        }

        const runs = Array.from({ length: batchCount }, (_, index) =>
          runUtilityVideoGeneration({
            node: currentNode,
            prompt: basePrompt,
            incoming,
            projectId,
            projectName,
            index
          })
        );
        const settled = await Promise.allSettled(runs);
        const successes = settled
          .filter((item) => item.status === "fulfilled")
          .flatMap((item) => (Array.isArray(item.value) ? item.value : [item.value]));
        const failures = settled.filter((item) => item.status === "rejected");
        if (!successes.length) throw new Error(failures[0]?.reason?.message || "Utility video failed.");

        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: successes[0].url,
          resultItems: successes,
          selectedResultIndex: 0,
          resultText: "",
          resultType: "video",
          error: failures.length ? nodeBatchStatusMessage("video", batchCount, successes.length, failures) : ""
        });
        return { status: "complete" };
      }

      if (currentNode.type === "imageModel") {
        const isSegmentation = isSam3ImageModel(currentNode.data.model);
        const imagePromptItems = connectedImagePromptItems(isSegmentation ? incoming.imagePromptIn || [] : [...(incoming.imagePromptIn || []), ...(incoming.transferIn || []), ...(incoming.characterIn || [])]);
        const prompt = isSegmentation
          ? basePrompt
          : buildEffectiveImagePrompt(basePrompt, [...(incoming.cameraIn || []), ...(incoming.styleIn || []), ...(incoming.transferIn || []), ...(incoming.characterIn || [])], currentNode.data.aspectRatio);
        const runIndexes = Array.from({ length: batchCount }, (_, index) => index);
        const settled = await settleSequential(runIndexes, (index) =>
          runImageModelGeneration({
            node: currentNode,
            prompt,
            imagePromptItems,
            projectId,
            projectName,
            index
          }),
          imageRunStaggerMs
        );
        const successes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
        const failures = settled.filter((item) => item.status === "rejected");
        if (!successes.length) throw new Error(failures[0]?.reason?.message || "Image generation failed.");

        updateNode(currentNode.id, {
          status: "complete",
          resultUrl: successes[0].url,
          resultItems: successes,
          selectedResultIndex: 0,
          resultText: successes.map((item) => item.text).filter(Boolean).join("\n\n"),
          error: failures.length ? nodeBatchStatusMessage("image", batchCount, successes.length, failures) : ""
        });
        return { status: "complete" };
      }

      const prompt = buildEffectiveVideoPrompt(basePrompt, incoming);
      const runs = Array.from({ length: batchCount }, (_, index) =>
        runVideoModelGeneration({
          node: currentNode,
          prompt,
          incoming,
          projectId,
          projectName,
          index
        })
      );
      const settled = await Promise.allSettled(runs);
      const successes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
      const failures = settled.filter((item) => item.status === "rejected");
      if (!successes.length) throw new Error(failures[0]?.reason?.message || "Video generation failed.");

      updateNode(currentNode.id, {
        status: "complete",
        resultUrl: successes[0].url,
        resultItems: successes,
        selectedResultIndex: 0,
        resultText: "",
        error: failures.length ? nodeBatchStatusMessage("video", batchCount, successes.length, failures) : ""
      });
      return { status: "complete" };
    } catch (error) {
      updateNode(currentNode.id, { status: "error", error: error.message });
      return { status: "error", error };
    }
  }

  async function runSelectedNodes() {
    const selectedIds = new Set(selectedNodeIds);
    const runnable = nodesRef.current.filter((node) => selectedIds.has(node.id) && isRunnableNode(node) && node.data.status !== "running");
    if (!runnable.length) {
      setSaveStatus("No runnable selected nodes");
      return;
    }

    setSaveStatus(`Running ${runnable.length} selected node${runnable.length === 1 ? "" : "s"}...`);
    const result = await runNodesByDependencyOrder(runnable);
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
            runnableCount={selectedRunnableNodes.length}
            onRunAll={runSelectedNodes}
            onGroup={createGroupFromSelection}
          />
        )}
        {contextMenu && (
          <div className="node-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {nodeCatalog.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.type} onClick={() => addNode(item.type, contextMenu.scene)}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="zoom-readout">{Math.round(viewport.scale * 100)}%</div>
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
      <button onClick={onRunAll} disabled={!runnableCount} title={runnableCount ? `Run ${runnableCount} selected node${runnableCount === 1 ? "" : "s"}` : "No runnable selected nodes"}>
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
  running,
  transferCompiling,
  selected,
  tagHighlight
}) {
  const config = getNodeConfig(node.type);
  const Icon = config.icon;
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
      className={`node-card ${node.type} ${selected ? "selected" : ""} ${tagHighlight ? "reference-tag-highlighted" : ""} ${moodBoardScalable ? "mood-board-scalable" : ""}`}
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        "--preview-scale": node.data.previewScale || 1,
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
        </span>
        <button onClick={() => onRemove(node.id)} title="Remove node">
          <X size={14} />
        </button>
      </div>

      <NodeBody
        node={node}
        onUpdate={onUpdate}
        incoming={incoming}
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
        <video src={node.data.resultUrl} controls muted />
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
  transferCompiling
}) {
  const config = getNodeConfig(node.type);
  const outputPort = config.output[0];

  if (node.type === "text") {
    return (
      <div className="node-body text-node-body">
        <OutputPortRow node={node} port={outputPort} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
        <div className="text-single-panel">
          <label className="text-field-group">
            <textarea aria-label="Text node prompt" value={node.data.text} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
          </label>
        </div>
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
    const previewSources = connectedPreviewSources(incoming.sourceIn);
    const previewSource = selectedPreviewSource(previewSources, node.data.previewSourceId);
    const previewItems = previewSource?.items || [];
    const previewIndex = Math.min(Math.max(Number(node.data.previewItemIndex) || 0, 0), Math.max(previewItems.length - 1, 0));
    const previewItem = previewItems[previewIndex];
    const sourcePort = config.input.find((port) => port.id === "sourceIn");
    function selectPreviewOffset(offset) {
      if (!previewItems.length) return;
      const nextIndex = (previewIndex + offset + previewItems.length) % previewItems.length;
      onUpdate(node.id, { previewItemIndex: nextIndex });
    }
    return (
      <div className="node-body preview-node-body">
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
            <button className={previewSource ? "connected-field" : ""}>{previewSource ? previewSource.label : "Connect image or video"}</button>
          )}
        </NodeRow>
        <div className={`preview-stage ${previewItem ? "has-preview" : ""}`}>
          {previewItem?.type === "image" && <img src={previewItem.url} alt={previewItem.label || previewSource.label} />}
          {previewItem?.type === "video" && <video src={previewItem.url} controls />}
          {!previewItem && <span>Preview will appear here</span>}
        </div>
        {previewItems.length > 1 && (
          <div className="preview-result-browser" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => selectPreviewOffset(-1)} title="Previous preview">
              <ChevronLeft size={15} />
            </button>
            <div className="preview-thumb-strip">
              {previewItems.map((item, index) => (
                <button
                  key={`${previewSource.id}-${item.url}-${index}`}
                  type="button"
                  className={index === previewIndex ? "active" : ""}
                  onClick={() => onUpdate(node.id, { previewItemIndex: index })}
                  title={item.label || `${previewSource.label} ${index + 1}`}
                >
                  {item.type === "image" && <img src={item.url} alt={item.label || `Preview ${index + 1}`} />}
                  {item.type === "video" && <video src={item.url} muted preload="metadata" />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => selectPreviewOffset(1)} title="Next preview">
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
    const isDepthAnything = isDepthAnythingModel(utilityImageModel);
    const isPatina = isPatinaModel(utilityImageModel);
    const isStillFrame = isUtilityStillFrameModel(utilityImageModel);
    const isSam3Image = isUtilitySam3ImageModel(utilityImageModel);
    const isBirefnetImage = isUtilityBirefnetImageModel(utilityImageModel);
    const isSam3Video = isUtilitySam3VideoModel(utilityVideoModel);
    const isVoidVideo = isUtilityVoidVideoModel(utilityVideoModel);
    const isBirefnetVideo = isUtilityBirefnetVideoModel(utilityVideoModel);
    const stillFrameVideoUrl = isStillFrame ? connectedAssetUrls(incoming.referenceVideoIn).at(-1) || "" : "";
    const utilityOutputPort = {
      ...config.output[0],
      label: isVideoMode ? "Video output" : "Image output",
      color: isVideoMode ? portColors.video : portColors.image
    };
    const promptValue = connectedText(incoming.promptIn) || node.data.prompt || "";
    const promptConnected = Boolean(connectedText(incoming.promptIn));
    const collapsedPorts = isVideoMode
      ? utilityInputPortIds("video", utilityImageModel, utilityVideoModel)
          .map((portId) => config.input.find((port) => port.id === portId))
          .filter(Boolean)
      : utilityInputPortIds("image", utilityImageModel, utilityVideoModel)
          .map((portId) => config.input.find((port) => port.id === portId))
          .filter(Boolean);
    const resultType = node.data.resultType || mode;
    const canRun = isVideoMode
      ? Boolean(incoming.referenceVideoIn?.length) && (isBirefnetVideo || Boolean(promptValue.trim()))
      : isStillFrame
        ? Boolean(incoming.referenceVideoIn?.length)
        : Boolean(incoming.imageIn?.length) && (!isSam3Image || Boolean(promptValue.trim()));
    const utilityRunLabel = isVideoMode
      ? isSam3Video
        ? "Run SAM 3 Video"
        : isVoidVideo
          ? "Run VOID"
          : isBirefnetVideo
            ? "Run BiRefNet Video"
            : "Run Wan Fun Control"
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

    function setMode(nextMode) {
      if (mode === nextMode) return;
      onUpdate(node.id, {
        utilityMode: nextMode,
        resultUrl: "",
        resultItems: [],
        selectedResultIndex: 0,
        resultText: "",
        resultType: nextMode,
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
                <select value={utilityVideoModel} onChange={(event) => onUpdate(node.id, { utilityVideoModel: event.target.value, resultUrl: "", resultItems: [], resultType: "video", error: "" })}>
                  <option>{utilityVideoModelNames.wanFunControl}</option>
                  <option>{utilityVideoModelNames.voidVideoInpainting}</option>
                  <option>{utilityVideoModelNames.birefnetVideo}</option>
                  <option>{utilityVideoModelNames.sam3Video}</option>
                </select>
              </NodeRow>
              {!isBirefnetVideo && (
                <NodeRow label="Prompt" inputPort={settingsOpen ? promptPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <textarea className={promptConnected ? "connected-field" : ""} value={promptValue} readOnly={promptConnected} onChange={(event) => onUpdate(node.id, { prompt: event.target.value })} />
                </NodeRow>
              )}
              {!isSam3Video && !isBirefnetVideo && (
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
              <NodeRow label={isSam3Video || isBirefnetVideo ? "Video" : isVoidVideo ? "Source Video" : "Control Video"} inputPort={settingsOpen ? referenceVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button className={incoming.referenceVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.referenceVideoIn, "Add video")}</button>
              </NodeRow>
              {isSam3Video ? (
                <NodeRow label="Threshold">
                  <input type="number" min="0" max="1" step="0.05" value={node.data.sam3VideoDetectionThreshold ?? 0.5} onChange={(event) => onUpdate(node.id, { sam3VideoDetectionThreshold: event.target.value })} />
                </NodeRow>
              ) : isVoidVideo ? (
                <>
                  <NodeRow label="Mask Video" inputPort={settingsOpen ? maskVideoPort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                    <button className={incoming.maskVideoIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.maskVideoIn, "Optional mask")}</button>
                  </NodeRow>
                  <NodeRow label="Mask Prompt">
                    <input value={node.data.voidMaskPrompt || ""} onChange={(event) => onUpdate(node.id, { voidMaskPrompt: event.target.value })} placeholder="Object to remove" />
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
                    <input type="number" min="69" max="197" step="8" value={node.data.voidNumFrames || 85} onChange={(event) => onUpdate(node.id, { voidNumFrames: event.target.value })} />
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
                <NodeRow label="Image" inputPort={settingsOpen ? imagePort : null} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                  <button className={incoming.imageIn?.length ? "connected-field" : ""}>{connectedSummary(incoming.imageIn, "Add image")}</button>
                </NodeRow>
              )}
              {isStillFrame ? null : isPatina ? (
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
        </details>
        <p className="utility-model-description">{utilityDescription}</p>
      </div>
    );
  }

  if (node.type === "imageModel") {
    const promptValue = connectedText(incoming.promptIn) || node.data.prompt;
    const promptConnected = Boolean(connectedText(incoming.promptIn));
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
            <select value={node.data.model} onChange={(event) => onUpdate(node.id, { model: event.target.value })}>
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
                  <option>21:9</option>
                  <option>16:9</option>
                  <option>1:1</option>
                  <option>9:16</option>
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

  const promptValue = connectedText(incoming.promptIn) || node.data.prompt;
  const promptConnected = Boolean(connectedText(incoming.promptIn));
  const promptPort = config.input.find((port) => port.id === "promptIn");
  const startFramePort = config.input.find((port) => port.id === "startFrameIn");
  const endFramePort = config.input.find((port) => port.id === "endFrameIn");
  const referenceImagePort = config.input.find((port) => port.id === "referenceImageIn");
  const referenceVideoPort = config.input.find((port) => port.id === "referenceVideoIn");
  const referenceAudioPort = config.input.find((port) => port.id === "referenceAudioIn");
  const characterPort = config.input.find((port) => port.id === "characterIn");
  const isWanFunControl = isWanFunControlModel(node.data.model);
  const isAurora = isAuroraModel(node.data.model);
  const isSam3Video = isSam3VideoModel(node.data.model);
  const tagMatches = isWanFunControl || isAurora || isSam3Video ? [] : videoModelReferenceTagMatches(promptValue, incoming);
  const characterConnected = Boolean(incoming.characterIn?.length);
  const settingsOpen = Boolean(node.data.settingsOpen);
  const collapsedPorts = isWanFunControl
    ? [promptPort, referenceVideoPort, referenceImagePort, characterPort]
    : isAurora
      ? [promptPort, referenceImagePort, referenceAudioPort, characterPort]
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
          <select value={node.data.model} onChange={(event) => onUpdate(node.id, { model: event.target.value })}>
            <option>{videoModelNames.seedance}</option>
            <option>{videoModelNames.seedanceFast}</option>
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
      {isSam3Video && <small className="upload-status model-status-note">segmentation model</small>}
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

  return (
    <div className={`result-pane ${items.length ? "has-result" : ""} ${items.length > 1 ? "multi-result" : ""}`}>
      {activeItem && (
        <div className="result-carousel" onPointerDown={(event) => event.stopPropagation()}>
          <div className="result-item" key={activeItem.url}>
            {activeItem.type === "image" && <img src={activeItem.url} alt={activeItem.label || `Generated image ${activeIndex + 1}`} />}
            {activeItem.type === "video" && <video src={activeItem.url} controls />}
          </div>
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
      input: [],
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
      compiledPortraitUrl: "",
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
      sam3VideoDetectionThreshold: 0.5,
      prompt: "",
      batchCount: "1",
      preprocessVideo: true,
      preprocessType: "depth",
      matchInputNumFrames: true,
      numFrames: 81,
      matchInputFps: true,
      fps: 16,
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
    batchCount: "1"
  };
}

function isWanFunControlModel(model) {
  return String(model || "").toLowerCase().includes("wan");
}

function isAuroraModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("aurora") || normalized.includes("creatify");
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

function isUtilityVoidVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("void") || normalized.includes("inpaint");
}

function utilityMode(node) {
  return node?.data?.utilityMode === "image" ? "image" : "video";
}

function utilityOutputType(node) {
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
  if (isUtilityVoidVideoModel(videoModel)) return ["promptIn", "referenceVideoIn", "maskVideoIn"];
  return isUtilitySam3VideoModel(videoModel) ? ["promptIn", "referenceVideoIn"] : ["promptIn", "referenceImageIn", "referenceVideoIn"];
}

function normalizedUtilityImageModelName(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("still") || normalized.includes("frame")) return utilityImageModelNames.stillFrame;
  if (normalized.includes("sam") && normalized.includes("image")) return utilityImageModelNames.sam3Image;
  if (normalized.includes("birefnet")) return utilityImageModelNames.birefnetImage;
  if (normalized.includes("depth") || normalized.includes("anything")) return utilityImageModelNames.depthAnything;
  if (normalized.includes("patina")) return utilityImageModelNames.patina;
  return utilityImageModelNames.dwpose;
}

function normalizedUtilityVideoModelName(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("sam") && normalized.includes("video")) return utilityVideoModelNames.sam3Video;
  if (normalized.includes("birefnet")) return utilityVideoModelNames.birefnetVideo;
  if (normalized.includes("void") || normalized.includes("inpaint")) return utilityVideoModelNames.voidVideoInpainting;
  return utilityVideoModelNames.wanFunControl;
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

function outputPortIdsForNode(node) {
  return (getNodeConfig(node?.type)?.output || []).map((port) => port.id);
}

function estimatedNodeWidth(type) {
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

function connectedText(items = []) {
  return items
    .map(({ source }) => {
      if (source.type === "text") return source.data.text;
      if (source.type === "imageModel" || source.type === "videoModel" || source.type === "utility") return source.data.resultText;
      return source.data.title;
    })
    .filter(Boolean)
    .join("\n");
}

function connectedAssetUrls(items = []) {
  return items.map(({ source }) => source.data.resultUrl).filter(Boolean);
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

async function runCameraQwenEdit({ node, incoming, projectId, projectName }) {
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
      projectId,
      projectName,
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

async function runUtilityImageGeneration({ node, prompt, incoming, projectId, projectName }) {
  const modelName = normalizedUtilityImageModelName(node.data.utilityImageModel);
  if (isUtilityStillFrameModel(modelName)) {
    const videoUrl = connectedAssetUrls(incoming.referenceVideoIn).at(-1);
    if (!videoUrl) throw new Error("Connect a video to the Utility node.");
    const still = await grabStillFrameFromVideo({
      videoUrl,
      requestedTime: node.data.stillFrameTime,
      nodeTitle: node.data.title
    });
    return [still];
  }

  const imageUrl = connectedAssetUrls(incoming.imageIn).at(-1);
  if (!imageUrl) throw new Error("Connect an image to the Utility node.");

  const { response, data } = await fetchJsonApi("/api/node/utility-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: modelName,
      imageUrls: [imageUrl],
      dwposeDrawMode: node.data.dwposeDrawMode || "body-pose",
      patinaMaps: patinaMapsForData(node.data),
      patinaOutputFormat: node.data.patinaOutputFormat || "png",
      patinaSeed: node.data.patinaSeed || "",
      projectId,
      projectName,
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

async function grabStillFrameFromVideo({ videoUrl, requestedTime, nodeTitle }) {
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
  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    throw new Error(`${label} failed. Could not reach the local app server. Restart npm run dev and try again. ${error.message || ""}`.trim());
  }

  try {
    return {
      response,
      data: await readJsonResponse(response, label)
    };
  } catch (error) {
    if (!error.htmlApiResponse || !canRetryLocalApi(path)) throw error;

    try {
      const healthResponse = await fetch("http://127.0.0.1:3333/api/health");
      const healthData = await readJsonResponse(healthResponse, "Server health");
      const routeKey = path.includes("utility-image") ? "utilityImage" : path.includes("utility-video") ? "utilityVideo" : "";
      if (!healthResponse.ok || (routeKey && !healthData?.routes?.[routeKey])) {
        throw new Error("The backend is running, but it does not have the updated Utility routes.");
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
    const error = new Error(
      `${label} failed. ${
        looksLikeHtml
          ? "The server returned an HTML page instead of API data. Restart npm run dev so the updated backend route is active."
          : "The server returned a response that was not valid JSON."
      }`
    );
    error.htmlApiResponse = looksLikeHtml;
    throw error;
  }
}

function canRetryLocalApi(path) {
  if (!String(path || "").startsWith("/api/")) return false;
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";
  return isLocalhost && window.location.port !== "3333";
}

async function runImageModelGeneration({ node, prompt, imagePromptItems, projectId, projectName, index }) {
  const { response, data } = await fetchJsonApi("/api/node/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: node.data.model,
      aspectRatio: node.data.aspectRatio,
      resolution: node.data.resolution,
      imagePromptUrls: imagePromptItems.map((item) => item.url),
      imagePromptLabels: imagePromptItems.map((item) => item.label),
      projectId,
      projectName,
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

async function runCharacterSheetGeneration({ node, prompt, portrait, wardrobe, projectId, projectName }) {
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
      projectId,
      projectName,
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

async function runVideoModelGeneration({ node, prompt, incoming, projectId, projectName, index }) {
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
      startFrameUrls: connectedAssetUrls(incoming.startFrameIn),
      endFrameUrls: connectedAssetUrls(incoming.endFrameIn),
      referenceImageUrls: [...connectedAssetUrls(incoming.referenceImageIn), ...characterReferences.map((item) => item.url)],
      referenceImageLabels: [...connectedAssetLabels(incoming.referenceImageIn), ...characterReferences.map((item) => item.label)],
      referenceVideoUrls: connectedAssetUrls(incoming.referenceVideoIn),
      referenceVideoLabels: connectedAssetLabels(incoming.referenceVideoIn),
      referenceAudioUrls: [...new Set([...connectedAudioUrls(incoming.referenceAudioIn), ...characterVoices])],
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
      projectId,
      projectName,
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

async function runUtilityVideoGeneration({ node, prompt, incoming, projectId, projectName, index }) {
  const { response, data } = await fetchJsonApi("/api/node/utility-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: node.data.utilityVideoModel || utilityVideoModelNames.wanFunControl,
      referenceImageUrls: connectedAssetUrls(incoming.referenceImageIn),
      referenceVideoUrls: connectedAssetUrls(incoming.referenceVideoIn),
      maskVideoUrls: connectedAssetUrls(incoming.maskVideoIn),
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
      voidVideoInpainting: {
        maskPrompt: node.data.voidMaskPrompt || "",
        enablePass2Refinement: Boolean(node.data.voidPass2Refinement),
        negativePrompt: node.data.voidNegativePrompt || "",
        numInferenceSteps: node.data.voidNumInferenceSteps || 30,
        guidanceScale: node.data.voidGuidanceScale || 1,
        strength: node.data.voidStrength || 1,
        numFrames: node.data.voidNumFrames || 85,
        enableSafetyChecker: node.data.voidEnableSafetyChecker !== false,
        seed: node.data.voidSeed || ""
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
      projectId,
      projectName,
      nodeId: node.id,
      nodeTitle: node.data.title
    })
  }, "Utility video");
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Utility video failed."}`);

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
  if (items.length) return items.map((item, index) => ({ type, label: `${type === "image" ? "Image" : "Video"} ${index + 1}`, ...item }));
  return resultUrl ? [{ url: resultUrl, type, label: type === "image" ? "Image 1" : "Video 1" }] : [];
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
    .map(({ source, edge }) => {
      const type = previewMediaType(source, edge);
      const resultItems = normalizedResultItems(source.data.resultItems, source.data.resultUrl, type);
      if (!resultItems.length) return null;
      const label = source.type === "camera" && edge.from.port === "imageOut" ? "Camera image" : sourceLabel(source);
      return {
        id: `${source.id}:${edge.from.port}`,
        label,
        type,
        items: resultItems.map((item, index) => ({
          ...item,
          label: resultItems.length > 1 ? `${label} ${index + 1}` : label
        }))
      };
    })
    .filter(Boolean);
}

function selectedPreviewSource(sources = [], selectedId) {
  if (!sources.length) return null;
  return sources.find((source) => source.id === selectedId) || sources.at(-1);
}

function previewMediaType(source, edge) {
  if (source.type === "utility") return utilityResultType(source);
  if (source.type === "video" || source.type === "videoModel") return "video";
  if (/\.(mp4|mov|webm)$/i.test(source.data.resultUrl || "")) return "video";
  return "image";
}

function connectedImagePromptItems(items = []) {
  const namedCharacterReferences = activeConnectedCharacterSources(items).length > 1;

  return items
    .flatMap(({ source }) => {
      if (!source.data.resultUrl) return null;
      if (source.type === "character") {
        const portraitUrl = source.data.compiledPortraitUrl || source.data.characterPortrait?.localUrl;
        return [
          ...(portraitUrl
            ? [{ url: portraitUrl, label: characterPortraitReferenceLabel(source, namedCharacterReferences) }]
            : []),
          { url: source.data.resultUrl, label: characterReferenceLabel(source, namedCharacterReferences) }
        ];
      }
      return {
        url: source.data.resultUrl,
        label: source.type === "transfer" ? moodBoardOutputFileName : sourceLabel(source)
      };
    })
    .filter(Boolean);
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
  const portraitLabel = (source.data.compiledPortraitUrl || source.data.characterPortrait?.localUrl) ? characterPortraitReferenceLabel(source, namedCharacterReferences) : "";
  const identitySource = portraitLabel
    ? `Use "${portraitLabel}" as the identity authority for the character's face and recognizable physical appearance. Use "${sheetLabel}" for the selected wardrobe and supporting body proportions.`
    : `Use "${sheetLabel}" as the identity, selected wardrobe, and body-proportion authority for the character.`;
  return [
    `CHARACTER REFERENCE: ${identitySource} Render this same recognizable character in the requested scene and keep the selected outfit consistent.`,
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
      ? `the character in the reference images labeled "${characterReferenceLabel(source, true)}"`
      : "the character in the connected reference images";
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

function characterPortraitReferenceLabel(node, namedCharacterReferences = false) {
  return namedCharacterReferences ? `${characterTag(node)} primary portrait reference` : "The Character primary portrait reference";
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

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRunnableNode(node) {
  return ["imageModel", "videoModel", "utility"].includes(node.type) || (node.type === "camera" && node.data.qwenCameraOpen);
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
  if (node?.type === "utility") return 3;
  if (node?.type === "videoModel") return 3;
  return 3;
}

function runStageLabel(type) {
  if (type === "text") return "text";
  if (type === "camera") return "camera";
  if (type === "imageModel") return "image";
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
    savedProjectName: null
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
      savedProjectName: parsed.savedProjectName || null
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
        width: Math.max(groupMinWidth, finiteNumber(group?.width, groupMinWidth)),
        height: Math.max(groupMinHeight, finiteNumber(group?.height, groupMinHeight)),
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
  return {
    ...data,
    title: data.title || "Utility",
    utilityMode: data.utilityMode === "image" ? "image" : "video",
    model: videoModelNames.wanFunControl,
    utilityImageModel: normalizedUtilityImageModelName(data.utilityImageModel),
    utilityVideoModel: normalizedUtilityVideoModelName(data.utilityVideoModel),
    dwposeDrawMode: data.dwposeDrawMode || "body-pose",
    patinaMaps: patinaMapsForData(data),
    patinaOutputFormat: data.patinaOutputFormat || "png",
    patinaSeed: data.patinaSeed || "",
    stillFrameTime: data.stillFrameTime ?? 0,
    sam3VideoDetectionThreshold: data.sam3VideoDetectionThreshold ?? 0.5,
    batchCount: data.batchCount || "1",
    preprocessVideo: data.preprocessVideo !== false,
    preprocessType: data.preprocessType || "depth",
    matchInputNumFrames: data.matchInputNumFrames !== false,
    numFrames: data.numFrames || 81,
    matchInputFps: data.matchInputFps !== false,
    fps: data.fps || 16,
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
  if (!target) return null;

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
  if (target?.type === "camera" && edge.to.port === "imageIn") return true;
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

function clampContextMenuPosition(x, y, rect) {
  const maxX = Math.max(contextMenuSize.inset, rect.width - contextMenuSize.width - contextMenuSize.inset);
  const maxY = Math.max(contextMenuSize.inset, rect.height - contextMenuSize.height - contextMenuSize.inset);

  return {
    x: clamp(x, contextMenuSize.inset, maxX),
    y: clamp(y, contextMenuSize.inset, maxY)
  };
}

function positiveModulo(value, divisor) {
  if (!divisor) return 0;
  return ((value % divisor) + divisor) % divisor;
}

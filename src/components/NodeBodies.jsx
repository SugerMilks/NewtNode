import { useEffect, useRef } from "react";
import { Box, ChevronDown, ChevronRight, History, Lock, MessageSquareText, Plus, Unlock, WandSparkles, X } from "lucide-react";
import { allowFileDrop, firstAcceptedFile, fullResolutionImageProps, mediaAccept, outputItemFromDataTransfer, previewImageUrl } from "../mediaAssets.js";
import { updateFilmDirectorRevisionVersionSnapshot } from "../filmDirectorRevision.js";
import { applyFilmDirectorAudioPolicyToPrompt, filmDirectorAudioModeOptions, normalizeFilmDirectorAudioMode } from "../filmDirectorAudio.js";
import { filmDirectorAspectRatioOptions, normalizeFilmDirectorAspectRatio } from "../filmDirectorAspectRatios.js";
import { filmDirectorDurationOptions } from "../filmDirectorDurations.js";
import { filmDirectorResolutionOptions, normalizeFilmDirectorResolution } from "../filmDirectorResolutions.js";
import {
  filmDirectorVideoModelOptions,
  normalizeFilmDirectorVideoModel
} from "../filmDirectorVideoModels.js";
import {
  applyFilmDirectorReferenceChanges,
  filmDirectorInputSourceSignature,
  filmDirectorSetupInputChanges,
  filmDirectorSetupManifestChanges,
  filmDirectorStageNeedsDraft,
  markFilmDirectorStagesStale,
  unlockFilmDirectorStages,
  updateFilmDirectorStageLock
} from "../filmDirectorStageLocks.js";
import {
  addFilmDirectorScene,
  filmDirectorReferencedTags,
  filmDirectorSceneLimit,
  filmDirectorSceneTabs,
  filmDirectorUsesReference,
  removeFilmDirectorScene,
  switchFilmDirectorScene
} from "../filmDirectorScenes.js";
import { MediaPreview, UploadIcon } from "./MediaViews.jsx";
import { NodeRow, OutputPortRow, PortHandle } from "./NodePorts.jsx";

export function PlainTextNodeBody({ node, outputPort, onUpdate, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div className="node-body text-node-body plain-text-node-body">
      <OutputPortRow node={node} port={outputPort} label="" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
      <div className="text-single-panel">
        <label className="text-field-group">
          <textarea aria-label="Text prompt" value={node.data.text || ""} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
        </label>
      </div>
    </div>
  );
}

export function TextModelNodeBody({ node, config, outputPort, incoming, onUpdate, onRun, running, onConnectStart, onDisconnectInput, connectedPortKeys }) {
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
      <div className="text-input-port-stack" aria-label="Smart Text Model node inputs">
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
          <textarea aria-label="Smart Text Model prompt" value={node.data.text || ""} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
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
        {running ? "Running..." : "Run Smart Text Model"}
      </button>
      {node.data.lastRunModel && <small className="upload-status">Processed with {node.data.lastRunModel}</small>}
      {node.data.error && <small className="upload-error">{node.data.error}</small>}
    </div>
  );
}

const skillDirectorShotCounts = Array.from({ length: 25 }, (_value, index) => String(index + 1));
const skillDirectorDefaultCameraDirection =
  "Use restrained handheld coverage with natural eye-level framing, subtle push-ins only during emotional beats, and clean continuity of screen direction across cuts.";

function formatSkillDirectorShotListDisplay(text = "") {
  return String(text || "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/\s+(?=\bCUT\s+\d{1,2}\b)/gi, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatSkillDirectorFinalPromptDisplay(text = "") {
  return String(text || "")
    .replace(/(Shot List:\s*)([\s\S]*)$/i, (_match, label, body) => `${label.trim()}\n${formatSkillDirectorShotListDisplay(body)}`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function connectedInputCount(incoming = {}, ports = []) {
  return ports.reduce((total, port) => total + (incoming[port]?.length || 0), 0);
}

function connectedInputSummary(items = [], fallback = "Add input") {
  if (!items?.length) return fallback;
  if (items.length > 1) return `${items.length} connected`;
  const source = items[0]?.source;
  const label = source?.data?.title || source?.data?.fileName || source?.data?.resultUrl?.split("/").pop() || "Connected";
  return String(label).replace(/\.[a-z0-9]+$/i, "").slice(0, 42);
}

function skillDirectorReferenceTag(label) {
  const cleaned = String(label || "Reference")
    .replace(/^@+/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim();
  const compact = cleaned
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
  return `@${compact || "Reference"}`;
}

function skillDirectorReferenceKey(source) {
  return `${source?.id || "source"}:${source?.data?.resultUrl || source?.data?.fileName || ""}`;
}

function skillDirectorCharacterDescription(source) {
  const tag = skillDirectorReferenceTag(source?.data?.characterName || source?.data?.title || "Character").slice(1);
  const details = String(source?.data?.characterPhysicalDetails || "").trim().replace(/[.!?]+$/, "");
  const traits = [
    ...(Array.isArray(source?.data?.characterTraits) ? source.data.characterTraits : []),
    ...String(source?.data?.customCharacterTraits || "")
      .split(",")
      .map((trait) => trait.trim())
      .filter(Boolean)
  ];
  return [
    `The ${tag} character identity sheet. Use this character's face, body proportions, selected wardrobe, and recognizable details consistently.`,
    details ? `The character has ${details.charAt(0).toLowerCase()}${details.slice(1)}.` : "",
    traits.length ? `Character traits: ${[...new Set(traits)].join(", ")}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function skillDirectorDefaultLocks(locks) {
  return {
    setup: false,
    style: false,
    motion: false,
    scene: false,
    shotList: false,
    ...(locks && typeof locks === "object" ? locks : {})
  };
}

function skillDirectorDefaultCollapsed(collapsed) {
  return {
    setup: false,
    style: false,
    motion: false,
    scene: false,
    shotList: false,
    ...(collapsed && typeof collapsed === "object" ? collapsed : {})
  };
}

function skillDirectorInvalidationPatch() {
  return {
    skillDirectorBuilt: false,
    skillDirectorOutputStale: true,
    resultText: "",
    lastRunShotCount: "",
    lastRunActualShotCount: 0,
    skillPreviewOpen: false
  };
}

function SkillDirectorLockButton({ locked, disabled, onClick, label }) {
  return (
    <button type="button" className={`skill-director-lock ${locked ? "locked" : ""}`} disabled={disabled} onClick={onClick} aria-label={label}>
      {locked ? <Lock size={13} /> : <Unlock size={13} />}
    </button>
  );
}

function SkillDirectorCollapseButton({ collapsed, onClick, label }) {
  return (
    <button type="button" className="skill-director-collapse" onClick={onClick} aria-label={label}>
      {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
    </button>
  );
}

export function SkillDirectorNodeBody({
  node,
  config,
  outputPort,
  incoming,
  onUpdate,
  onRun,
  running,
  sourceLabel,
  onConnectStart,
  onDisconnectInput,
  connectedPortKeys
}) {
  const inputPorts = ["characterIn", "locationIn", "imageIn", "styleIn"]
    .map((id) => config.input.find((port) => port.id === id))
    .filter(Boolean);
  const characterInputPort = inputPorts.find((port) => port.id === "characterIn");
  const locationInputPort = inputPorts.find((port) => port.id === "locationIn");
  const elementInputPort = inputPorts.find((port) => port.id === "imageIn");
  const styleInputPort = inputPorts.find((port) => port.id === "styleIn");
  const connectedCount = connectedInputCount(incoming, inputPorts.map((port) => port.id));
  const styleInputSourceSignature = filmDirectorInputSourceSignature(incoming.styleIn, "style-inputs");
  const assetInputSourceSignature = filmDirectorInputSourceSignature([
    ...(incoming.characterIn || []),
    ...(incoming.locationIn || []),
    ...(incoming.imageIn || [])
  ], "scene-assets");
  const sceneTabs = filmDirectorSceneTabs(node.data);
  const activeSceneId = node.data.skillDirectorActiveSceneId || sceneTabs.find((scene) => scene.active)?.id || sceneTabs[0]?.id || "scene-1";
  const referencedTags = filmDirectorReferencedTags(node.data);
  const referencedTagSignature = [...referencedTags].sort().join("|");
  const locks = skillDirectorDefaultLocks(node.data.skillDirectorLocks);
  const collapsed = skillDirectorDefaultCollapsed(node.data.skillDirectorCollapsed);
  const referenceItems = [
    ...(incoming.characterIn || []).map((entry) => {
      const { source } = entry;
      if (!source?.data?.resultUrl) return null;
      const label = source.data.characterName || source.data.title || sourceLabel?.(source) || "Character";
      return {
        key: skillDirectorReferenceKey(source),
        tag: skillDirectorReferenceTag(label),
        label,
        group: "Character",
        type: "character",
        sourceId: source.id,
        sourceSignature: filmDirectorInputSourceSignature([entry], "character"),
        defaultDescription: skillDirectorCharacterDescription(source)
      };
    }),
    ...(incoming.locationIn || []).map((entry) => {
      const { source } = entry;
      if (!source?.data?.resultUrl) return null;
      const label = source.data.title || sourceLabel?.(source) || source.data.fileName || source.data.resultUrl.split("/").pop() || "Location";
      return {
        key: skillDirectorReferenceKey(source),
        tag: skillDirectorReferenceTag(label),
        label,
        group: "Location",
        type: "location",
        sourceId: source.id,
        sourceSignature: filmDirectorInputSourceSignature([entry], "location"),
        defaultDescription: "Scene location reference. Use this for environment, layout, production design, lighting, and geography."
      };
    }),
    ...(incoming.imageIn || []).map((entry) => {
      const { source } = entry;
      if (!source?.data?.resultUrl) return null;
      const label = source.data.title || sourceLabel?.(source) || source.data.fileName || source.data.resultUrl.split("/").pop() || "Props";
      return {
        key: skillDirectorReferenceKey(source),
        tag: skillDirectorReferenceTag(label),
        label,
        group: "Props",
        type: "element",
        sourceId: source.id,
        sourceSignature: filmDirectorInputSourceSignature([entry], "element"),
        defaultDescription: "Scene prop reference. Use this as a specific object, product, set dressing, wardrobe item, or visual asset in the scene."
      };
    })
  ].filter(Boolean);
  const assetInputManifest = referenceItems.map((reference) => ({
    sourceId: reference.sourceId,
    category: reference.type,
    tag: reference.tag,
    label: reference.label,
    signature: reference.sourceSignature
  }));
  const styleConnected = Boolean(incoming.styleIn?.length);
  const finalPromptOpen = node.data.skillPreviewOpen !== false;
  const shotValue = node.data.skillShotCount || node.data.shotCount || "3";
  const autoPlannedShotCount = Number.parseInt(node.data.lastRunActualShotCount || node.data.lastRunShotCount || "", 10);
  const durationValue = node.data.skillDurationSeconds || node.data.durationSeconds || "15";
  const videoModelValue = normalizeFilmDirectorVideoModel(node.data.skillVideoModel);
  const resolutionValue = normalizeFilmDirectorResolution(node.data.skillResolution);
  const aspectRatioValue = normalizeFilmDirectorAspectRatio(node.data.skillAspectRatio);
  const audioModeValue = normalizeFilmDirectorAudioMode(node.data.skillDirectorAudioMode);
  const sceneName = node.data.sceneName || "";
  const sceneOverview = node.data.sceneOverview ?? node.data.text ?? "";
  const styleDirection = node.data.styleDirection || "";
  const motionDirection = node.data.motionDirection || node.data.motionBrief || "";
  const shotList = formatSkillDirectorShotListDisplay(node.data.shotList || "");
  const built = Boolean(node.data.skillDirectorBuilt && node.data.resultText);
  const revisionOpen = Boolean(node.data.skillDirectorRevisionOpen);
  const revisionNotes = node.data.skillDirectorRevisionNotes || "";
  const revisionHistory = Array.isArray(node.data.skillDirectorRevisionHistory) ? node.data.skillDirectorRevisionHistory : [];
  const revisionVersions = revisionHistory.filter((entry) => entry?.snapshot && entry?.id);
  const selectedRevisionId = node.data.skillDirectorRevisionSelectedId || revisionVersions.at(-1)?.id || "";
  const directorOutputPort = config.output.find((port) => port.id === "directorOut") || outputPort;
  const setupReady = Boolean(sceneName.trim()) || connectedCount > 0;
  const styleReady = Boolean(styleDirection.trim());
  const sceneReady = Boolean(sceneOverview.trim());
  const shotListReady = Boolean(shotList.trim());
  const styleStageEnabled = locks.setup && (!running || styleReady);
  const canBuild = locks.setup && locks.style && locks.motion && locks.scene && locks.shotList;
  const invalidate = skillDirectorInvalidationPatch();
  const queuedRunRef = useRef("");

  const selectScene = (sceneId) => {
    if (running || sceneId === activeSceneId) return;
    onUpdate(node.id, switchFilmDirectorScene(node.data, sceneId));
  };
  const addScene = () => {
    if (running || sceneTabs.length >= filmDirectorSceneLimit) return;
    onUpdate(node.id, addFilmDirectorScene(node.data));
  };
  const removeScene = (event, sceneId) => {
    event.preventDefault();
    event.stopPropagation();
    if (running || sceneTabs.length <= 1) return;
    onUpdate(node.id, removeFilmDirectorScene(node.data, sceneId));
  };

  const updateUnlocked = (patch, affectedStages = []) => {
    const shotListChanged = Object.prototype.hasOwnProperty.call(patch, "shotList");
    const rebuildAfterShotList = (affectedStages.includes("shotList") || shotListChanged) && Boolean(
      node.data.skillDirectorBuilt || node.data.skillDirectorRebuildAfterShotList
    );
    const rebuildAfterStyle = Object.prototype.hasOwnProperty.call(patch, "styleDirection") && Boolean(
      node.data.skillDirectorBuilt || node.data.skillDirectorOutputStale || node.data.resultText || node.data.skillDirectorRebuildAfterStyle
    );
    onUpdate(node.id, {
      ...patch,
      ...invalidate,
      ...(rebuildAfterShotList ? { skillDirectorRebuildAfterShotList: true } : {}),
      ...(affectedStages.includes("shotList") && Object.prototype.hasOwnProperty.call(patch, "motionDirection")
        ? { skillDirectorRefreshShotListAfterMotion: true }
        : {}),
      ...(rebuildAfterStyle ? { skillDirectorRebuildAfterStyle: true } : {}),
      ...(affectedStages.length ? {
        skillDirectorLocks: unlockFilmDirectorStages(locks, affectedStages),
        skillDirectorCollapsed: unlockFilmDirectorStages(collapsed, affectedStages),
        skillDirectorStaleStages: markFilmDirectorStagesStale(node.data.skillDirectorStaleStages, affectedStages)
      } : {})
    });
  };
  const isStageCollapsed = (key) => Boolean(locks[key] && collapsed[key]);
  const toggleStageCollapsed = (key) => {
    onUpdate(node.id, {
      skillDirectorCollapsed: {
        ...collapsed,
        [key]: !collapsed[key]
      }
    });
  };
  const runAction = (action, dataOverrides = {}) => {
    onRun({
      ...node,
      data: {
        ...node.data,
        motionDirection,
        motionBrief: motionDirection,
        ...dataOverrides,
        skillDirectorAction: action
      }
    });
  };
  const queuedActionPatch = (action) => ({
    skillDirectorQueuedAction: action,
    skillDirectorQueueId: `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });
  const updateAudioMode = (value) => {
    const nextAudioMode = normalizeFilmDirectorAudioMode(value);
    onUpdate(node.id, {
      skillDirectorAudioMode: nextAudioMode,
      ...(built ? { resultText: applyFilmDirectorAudioPolicyToPrompt(node.data.resultText, nextAudioMode) } : {})
    });
  };
  const queuedAction = node.data.skillDirectorQueuedAction || "";
  const queuedRunKey = `${node.id}:${node.data.skillDirectorQueueId || ""}:${queuedAction}`;
  useEffect(() => {
    if (!queuedAction || running) return;
    const readyToRun =
      (queuedAction === "style" && locks.setup) ||
      (queuedAction === "motion" && locks.setup && locks.style) ||
      (queuedAction === "shotList" && locks.scene && Boolean(sceneOverview.trim())) ||
      (queuedAction === "build" && canBuild);
    if (!readyToRun) return;
    if (queuedRunRef.current === queuedRunKey) return;
    queuedRunRef.current = queuedRunKey;
    onUpdate(node.id, { skillDirectorQueuedAction: "" });
    runAction(queuedAction);
  });

  useEffect(() => {
    if (!locks.setup || running || !node.data.skillDirectorLockedInputManifestInitialized) return;
    const setupChanges = filmDirectorSetupInputChanges(node.data, {
      style: styleInputSourceSignature,
      assets: assetInputSourceSignature,
      hasStyleInputs: styleConnected
    });
    const manifestChanges = filmDirectorSetupManifestChanges(
      node.data.skillDirectorLockedInputManifest,
      assetInputManifest,
      referencedTags
    );
    const directionAssetsChanged = manifestChanges.characterChanged || manifestChanges.locationChanged;
    const referencedAssetsChanged = directionAssetsChanged || manifestChanges.propsChanged;
    if (!setupChanges.styleChanged && !referencedAssetsChanged) return;

    const canRefreshPlan = Boolean(sceneOverview.trim());
    const refreshMotion = directionAssetsChanged && canRefreshPlan;
    const refreshShotList = referencedAssetsChanged && canRefreshPlan;
    const hadBuiltOutput = Boolean(node.data.skillDirectorBuilt && node.data.resultText);
    const rebuildAfterStyle = setupChanges.styleChanged && Boolean(
      hadBuiltOutput || node.data.skillDirectorOutputStale || node.data.resultText || node.data.skillDirectorRebuildAfterStyle
    );
    const refreshAfterStyle = refreshMotion ? "motion" : refreshShotList ? "shotList" : rebuildAfterStyle ? "build" : "";
    const firstRefreshAction = setupChanges.styleChanged ? "style" : refreshMotion ? "motion" : refreshShotList ? "shotList" : "";
    if (!firstRefreshAction) return;

    const referenceChangePatch = ["sceneOverview", "text", "motionDirection", "motionBrief", "shotList", "shotListNotes", "resultText"]
      .reduce((patch, key) => ({
        ...patch,
        [key]: applyFilmDirectorReferenceChanges(
          key === "text" ? sceneOverview : node.data[key],
          manifestChanges
        )
      }), {});
    const staleStages = markFilmDirectorStagesStale(node.data.skillDirectorStaleStages, [
      ...(setupChanges.styleChanged ? ["style"] : []),
      ...(directionAssetsChanged ? ["motion", "shotList"] : []),
      ...(manifestChanges.propsChanged ? ["shotList"] : [])
    ]);
    onUpdate(node.id, {
      skillDirectorLockedStyleInputSignature: styleInputSourceSignature,
      skillDirectorLockedAssetInputSignature: assetInputSourceSignature,
      skillDirectorLockedInputManifest: assetInputManifest,
      skillDirectorStaleStages: staleStages,
      ...(manifestChanges.replacements.length || manifestChanges.disconnectedTags.length ? referenceChangePatch : {}),
      skillDirectorLocks: {
        ...locks,
        ...(setupChanges.styleChanged ? { style: false } : {}),
        ...(refreshMotion ? { motion: false } : {}),
        ...(refreshShotList ? { shotList: false } : {})
      },
      skillDirectorCollapsed: {
        ...collapsed,
        ...(setupChanges.styleChanged ? { style: false } : {}),
        ...(refreshMotion ? { motion: false } : {}),
        ...(refreshShotList ? { shotList: false } : {})
      },
      ...(hadBuiltOutput ? { skillDirectorBuilt: false, skillDirectorOutputStale: true } : {}),
      ...(rebuildAfterStyle ? { skillDirectorRebuildAfterStyle: true } : {}),
      ...(setupChanges.styleChanged && refreshAfterStyle ? { skillDirectorRefreshAfterStyle: refreshAfterStyle } : {}),
      ...(refreshMotion && refreshShotList ? { skillDirectorRefreshShotListAfterMotion: true } : {}),
      ...(refreshShotList && hadBuiltOutput ? { skillDirectorRebuildAfterShotList: true } : {}),
      ...queuedActionPatch(firstRefreshAction)
    });
  }, [assetInputSourceSignature, referencedTagSignature, styleInputSourceSignature]);

  const handleSetupLock = () => {
    if (locks.setup) {
      onUpdate(node.id, {
        skillDirectorLocks: updateFilmDirectorStageLock(locks, "setup", false),
        skillDirectorCollapsed: { ...collapsed, setup: false },
        skillDirectorLockedStyleInputSignature: node.data.skillDirectorLockedStyleInputSignature || styleInputSourceSignature,
        skillDirectorLockedAssetInputSignature: node.data.skillDirectorLockedAssetInputSignature || assetInputSourceSignature,
        skillDirectorLockedInputManifest: node.data.skillDirectorLockedInputManifestInitialized && Array.isArray(node.data.skillDirectorLockedInputManifest)
          ? node.data.skillDirectorLockedInputManifest
          : assetInputManifest,
        skillDirectorLockedInputManifestInitialized: true
      });
      return;
    }
    const setupChanges = filmDirectorSetupInputChanges(node.data, {
      style: styleInputSourceSignature,
      assets: assetInputSourceSignature,
      hasStyleInputs: styleConnected
    });
    const manifestChanges = filmDirectorSetupManifestChanges(
      node.data.skillDirectorLockedInputManifest,
      assetInputManifest,
      referencedTags
    );
    const legacyAssetChange = setupChanges.assetsChanged && !node.data.skillDirectorLockedInputManifestInitialized;
    const directionAssetsChanged = manifestChanges.characterChanged || manifestChanges.locationChanged || legacyAssetChange;
    const referencedAssetsChanged = directionAssetsChanged || manifestChanges.propsChanged;
    const referenceChangePatch = ["sceneOverview", "text", "motionDirection", "motionBrief", "shotList", "shotListNotes", "resultText"]
      .reduce((patch, key) => ({
        ...patch,
        [key]: applyFilmDirectorReferenceChanges(
          key === "text" ? sceneOverview : node.data[key],
          manifestChanges
        )
      }), {});
    const staleStages = markFilmDirectorStagesStale(node.data.skillDirectorStaleStages, [
      ...(setupChanges.styleChanged ? ["style"] : []),
      ...(directionAssetsChanged ? ["motion", "shotList"] : []),
      ...(manifestChanges.propsChanged ? ["shotList"] : [])
    ]);
    const needsStyleDraft = filmDirectorStageNeedsDraft("style", {
      styleDirection,
      skillDirectorStaleStages: staleStages
    });
    const hadBuiltOutput = Boolean(node.data.skillDirectorBuilt && node.data.resultText);
    const canRebuildFromLockedStages = Boolean(locks.style && locks.motion && locks.scene && locks.shotList);
    const canRefreshPlan = Boolean(sceneOverview.trim());
    const refreshMotion = directionAssetsChanged && canRefreshPlan;
    const refreshShotList = referencedAssetsChanged && canRefreshPlan;
    const rebuildAfterStyle = setupChanges.styleChanged && Boolean(
      hadBuiltOutput || node.data.skillDirectorOutputStale || node.data.resultText || node.data.skillDirectorRebuildAfterStyle
    );
    const rebuildForAssetChange = setupChanges.assetsChanged && hadBuiltOutput && canRebuildFromLockedStages && !refreshShotList;
    const refreshAfterStyle = refreshMotion ? "motion" : refreshShotList ? "shotList" : rebuildAfterStyle ? "build" : "";
    const firstRefreshAction = needsStyleDraft ? "style" : refreshMotion ? "motion" : refreshShotList ? "shotList" : rebuildForAssetChange ? "build" : "";
    const nextLocks = {
      ...updateFilmDirectorStageLock(locks, "setup", true),
      ...(needsStyleDraft ? { style: false } : {}),
      ...(refreshMotion ? { motion: false } : {}),
      ...(refreshShotList ? { shotList: false } : {})
    };
    const resetPatch = {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, setup: false, ...(needsStyleDraft ? { style: false } : {}) },
      skillDirectorLockedStyleInputSignature: styleInputSourceSignature,
      skillDirectorLockedAssetInputSignature: assetInputSourceSignature,
      skillDirectorLockedInputManifest: assetInputManifest,
      skillDirectorLockedInputManifestInitialized: true,
      ...(setupChanges.styleChanged || referencedAssetsChanged ? { skillDirectorStaleStages: staleStages } : {}),
      ...(manifestChanges.replacements.length || manifestChanges.disconnectedTags.length ? referenceChangePatch : {}),
      ...(needsStyleDraft && refreshAfterStyle ? { skillDirectorRefreshAfterStyle: refreshAfterStyle } : {}),
      ...(refreshMotion && refreshShotList ? { skillDirectorRefreshShotListAfterMotion: true } : {}),
      ...(refreshShotList && hadBuiltOutput ? { skillDirectorRebuildAfterShotList: true } : {}),
      ...(referencedAssetsChanged && hadBuiltOutput ? {
        skillDirectorBuilt: false,
        skillDirectorOutputStale: true
      } : {}),
      ...(rebuildAfterStyle ? {
        skillDirectorBuilt: false,
        skillDirectorOutputStale: true,
        skillDirectorRebuildAfterStyle: true
      } : {}),
      ...(rebuildForAssetChange ? {
        skillDirectorBuilt: false,
        skillDirectorOutputStale: true
      } : {}),
      ...(firstRefreshAction
        ? queuedActionPatch(firstRefreshAction)
        : { skillDirectorQueuedAction: "", skillDirectorQueueId: "" })
    };
    onUpdate(node.id, resetPatch);
  };
  const handleStyleLock = () => {
    if (locks.style) {
      onUpdate(node.id, {
        skillDirectorLocks: updateFilmDirectorStageLock(locks, "style", false),
        skillDirectorCollapsed: { ...collapsed, style: false }
      });
      return;
    }
    const nextLocks = updateFilmDirectorStageLock(locks, "style", true);
    const refreshAfterStyle = node.data.skillDirectorRefreshAfterStyle || "";
    const rebuildAfterStyle = Boolean(
      node.data.skillDirectorRebuildAfterStyle && locks.motion && locks.scene && locks.shotList
    );
    onUpdate(node.id, {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, style: true },
      ...(refreshAfterStyle
        ? {
            ...queuedActionPatch(refreshAfterStyle),
            skillDirectorRefreshAfterStyle: "",
            ...(refreshAfterStyle === "build" ? { skillDirectorRebuildAfterStyle: false } : {})
          }
        : rebuildAfterStyle
        ? {
            ...queuedActionPatch("build"),
            skillDirectorRebuildAfterStyle: false
          }
        : {
            skillDirectorQueuedAction: "",
            skillDirectorQueueId: ""
          })
    });
  };
  const handleMotionLock = () => {
    if (locks.motion) {
      onUpdate(node.id, {
        skillDirectorLocks: updateFilmDirectorStageLock(locks, "motion", false),
        skillDirectorCollapsed: { ...collapsed, motion: false }
      });
      return;
    }
    const nextLocks = updateFilmDirectorStageLock(locks, "motion", true);
    const nextMotionDirection = motionDirection.trim() || skillDirectorDefaultCameraDirection;
    const refreshShotList = Boolean(node.data.skillDirectorRefreshShotListAfterMotion && locks.scene && sceneOverview.trim());
    onUpdate(node.id, {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, motion: true },
      motionDirection: nextMotionDirection,
      motionBrief: nextMotionDirection,
      ...(refreshShotList
        ? {
            ...queuedActionPatch("shotList"),
            skillDirectorRefreshShotListAfterMotion: false
          }
        : {
            skillDirectorQueuedAction: "",
            skillDirectorQueueId: ""
          })
    });
  };
  const handleSceneLock = () => {
    if (locks.scene) {
      onUpdate(node.id, {
        skillDirectorLocks: updateFilmDirectorStageLock(locks, "scene", false),
        skillDirectorCollapsed: { ...collapsed, scene: false }
      });
      return;
    }
    const needsShotListDraft = filmDirectorStageNeedsDraft("shotList", {
      ...node.data,
      sceneOverview,
      text: sceneOverview,
      motionDirection,
      motionBrief: motionDirection,
      skillShotCount: shotValue,
      shotList,
      skillDirectorStaleStages: node.data.skillDirectorStaleStages
    });
    const nextLocks = {
      ...updateFilmDirectorStageLock(locks, "scene", true),
      ...(needsShotListDraft ? { shotList: false } : {})
    };
    const lockPatch = {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, scene: true, ...(needsShotListDraft ? { shotList: false } : {}) },
      ...(needsShotListDraft
        ? queuedActionPatch("shotList")
        : { skillDirectorQueuedAction: "", skillDirectorQueueId: "" })
    };
    onUpdate(node.id, lockPatch);
  };
  const handleShotListLock = () => {
    if (locks.shotList) {
      onUpdate(node.id, {
        skillDirectorLocks: updateFilmDirectorStageLock(locks, "shotList", false),
        skillDirectorCollapsed: { ...collapsed, shotList: false }
      });
      return;
    }
    const rebuildAfterShotList = Boolean(node.data.skillDirectorRebuildAfterShotList && locks.setup && locks.style && locks.motion && locks.scene);
    onUpdate(node.id, {
      skillDirectorLocks: updateFilmDirectorStageLock(locks, "shotList", true),
      skillDirectorCollapsed: { ...collapsed, shotList: true },
      ...(rebuildAfterShotList
        ? {
            ...queuedActionPatch("build"),
            skillDirectorRebuildAfterShotList: false
          }
        : {})
    });
  };
  const applyRevisionNotes = () => {
    if (!built || running || !revisionNotes.trim()) return;
    runAction("revise", { skillDirectorRevisionNotes: revisionNotes.trim() });
  };
  const restoreRevisionVersion = (event) => {
    const versionId = event.target.value;
    if (!versionId || versionId === selectedRevisionId) return;
    const refreshedHistory = updateFilmDirectorRevisionVersionSnapshot(
      revisionHistory,
      selectedRevisionId,
      node.data
    );
    const version = refreshedHistory.find((entry) => entry?.id === versionId && entry?.snapshot);
    if (!version) return;
    onUpdate(node.id, {
      ...version.snapshot,
      status: "complete",
      error: "",
      skillDirectorAction: "",
      skillDirectorQueuedAction: "",
      skillDirectorQueueId: "",
      skillDirectorRevisionHistory: refreshedHistory,
      skillDirectorRevisionSelectedId: versionId,
      skillDirectorRevisionNotes: "",
      skillDirectorLastRevisionSummary: version.summary || version.label || "Revision restored"
    });
  };

  return (
    <div className="node-body text-node-body skill-director-node-body">
      <div className="skill-director-scene-tabs" aria-label="Film Director scenes">
        <div className="skill-director-scene-tab-list">
          {sceneTabs.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`skill-director-scene-tab ${scene.active ? "active" : ""}`}
              disabled={running}
              title={scene.label}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => selectScene(scene.id)}
            >
              <span className={`skill-director-scene-status ${scene.built ? "built" : ""}`} aria-hidden="true" />
              <span>{scene.label}</span>
              {sceneTabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="skill-director-scene-remove"
                  aria-label={`Remove ${scene.label}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => removeScene(event, scene.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") removeScene(event, scene.id);
                  }}
                >
                  <X size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="skill-director-scene-add"
          disabled={running || sceneTabs.length >= filmDirectorSceneLimit}
          aria-label="Add Film Director scene"
          title="Add scene"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={addScene}
        >
          <Plus size={14} />
        </button>
      </div>

      <OutputPortRow
        node={node}
        port={built ? directorOutputPort : { ...directorOutputPort, disabled: true, disabledReason: "Build this scene before connecting Film Director output" }}
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />

      <div className={`skill-director-stage-card ${locks.setup ? "locked" : ""}`}>
        <div className="skill-director-stage-heading">
          <div>
            <strong>1. Scene Setup</strong>
            <small>{locks.setup ? "Locked" : "Add scene basics and references first"}</small>
          </div>
          <div className="skill-director-stage-actions">
            <SkillDirectorLockButton locked={locks.setup} disabled={running || (!setupReady && !locks.setup)} label={locks.setup ? "Unlock scene setup" : "Lock scene setup"} onClick={handleSetupLock} />
          </div>
        </div>

        <>
            <div className="skill-director-grid">
              <label className="node-row">
                <span>Scene Name</span>
                <input value={sceneName} disabled={running || locks.setup} onChange={(event) => onUpdate(node.id, { sceneName: event.target.value })} />
              </label>
              <label className="node-row">
                <span>Duration</span>
                <select value={durationValue} disabled={running} onChange={(event) => onUpdate(node.id, { skillDurationSeconds: event.target.value, durationSeconds: event.target.value })}>
                  {filmDirectorDurationOptions.map((duration) => (
                    <option key={duration} value={duration}>
                      {duration}s
                    </option>
                  ))}
                </select>
              </label>
              <label className="node-row skill-director-model-row">
                <span>Video Model</span>
                <select value={videoModelValue} disabled={running} onChange={(event) => onUpdate(node.id, { skillVideoModel: normalizeFilmDirectorVideoModel(event.target.value) })}>
                  <option value="">Connected Model</option>
                  {filmDirectorVideoModelOptions.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
              <label className="node-row">
                <span>Resolution</span>
                <select value={resolutionValue} disabled={running} onChange={(event) => onUpdate(node.id, { skillResolution: event.target.value })}>
                  {filmDirectorResolutionOptions.map((resolution) => (
                    <option key={resolution} value={resolution}>
                      {resolution}
                    </option>
                  ))}
                </select>
              </label>
              <label className="node-row">
                <span>Aspect Ratio</span>
                <select value={aspectRatioValue} disabled={running} onChange={(event) => onUpdate(node.id, { skillAspectRatio: event.target.value })}>
                  {filmDirectorAspectRatioOptions.map((aspectRatio) => (
                    <option key={aspectRatio} value={aspectRatio}>
                      {aspectRatio}
                    </option>
                  ))}
                </select>
              </label>
              <label className="node-row">
                <span>Shots</span>
                <select
                  value={shotValue}
                  disabled={running || locks.setup}
                  onChange={(event) => updateUnlocked({ skillShotCount: event.target.value }, ["shotList"])}
                >
                  <option value="Auto">
                    {shotValue === "Auto" && autoPlannedShotCount > 0 ? `Auto (${autoPlannedShotCount} planned)` : "Auto"}
                  </option>
                  {skillDirectorShotCounts.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <label className="node-row skill-director-audio-row">
                <span>Audio</span>
                <select value={audioModeValue} disabled={running} onChange={(event) => updateAudioMode(event.target.value)}>
                  {filmDirectorAudioModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="skill-director-input-rows" aria-label="Film Director inputs">
              <NodeRow label="Character" inputPort={characterInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button type="button" disabled={running} className={incoming.characterIn?.length ? "connected-field" : ""}>
                  {connectedInputSummary(incoming.characterIn, "Add character")}
                </button>
              </NodeRow>
              <NodeRow label="Location" inputPort={locationInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button type="button" disabled={running} className={incoming.locationIn?.length ? "connected-field" : ""}>
                  {connectedInputSummary(incoming.locationIn, "Add location")}
                </button>
              </NodeRow>
              <NodeRow label="Props" inputPort={elementInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button type="button" disabled={running} className={incoming.imageIn?.length ? "connected-field" : ""}>
                  {connectedInputSummary(incoming.imageIn, "Add props")}
                </button>
              </NodeRow>
              <NodeRow label="Mood Board" inputPort={styleInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button type="button" disabled={running || locks.setup} className={styleConnected ? "connected-field" : ""}>
                  {connectedInputSummary(incoming.styleIn, "Add mood board")}
                </button>
              </NodeRow>
            </div>

            {referenceItems.length > 0 && (
              <div className="skill-director-reference-setup">
                <div className="skill-director-reference-heading">
                  <span>Reference setup</span>
                  <small>These tags lead the final prompt.</small>
                </div>
                {referenceItems.map((reference) => {
                  const referenceNotes = node.data.skillReferenceNotes || {};
                  const hasCustomNote = Object.prototype.hasOwnProperty.call(referenceNotes, reference.key);
                  const noteValue = hasCustomNote ? referenceNotes[reference.key] : "";
                  const referenceUsed = filmDirectorUsesReference(node.data, {
                    tag: reference.tag,
                    label: reference.label,
                    type: reference.type,
                    categoryCount: referenceItems.filter((item) => item.type === reference.type).length
                  });
                  const hasReferenceSelection = Boolean(
                    node.data.skillDirectorBuilt ||
                    referencedTags.size ||
                    (Array.isArray(node.data.lastRunReferenceTags) && node.data.lastRunReferenceTags.length)
                  );
                  return (
                    <label
                      key={reference.key}
                      className={`skill-director-reference-row ${hasReferenceSelection && !referenceUsed ? "unused" : "used"}`}
                    >
                      <span title={`${reference.group}: ${reference.label}`}>{reference.tag}</span>
                      <input
                        value={noteValue}
                        disabled={running || locks.setup}
                        placeholder="Optional note"
                        onChange={(event) =>
                          updateUnlocked({
                            skillReferenceNotes: {
                              ...(node.data.skillReferenceNotes || {}),
                              [reference.key]: event.target.value
                            }
                          }, ["shotList"])
                        }
                      />
                    </label>
                  );
                })}
              </div>
            )}
        </>
      </div>

      <div className={`skill-director-stage-card ${locks.style ? "locked" : ""} ${styleStageEnabled || running ? "" : "disabled"} ${isStageCollapsed("style") ? "collapsed" : ""}`}>
        <div className="skill-director-stage-heading">
          <div>
            <strong>2. Style Direction</strong>
            <small>
              {running && locks.setup
                ? "Refreshing from Scene Setup and Mood Board..."
                : styleReady
                  ? "LLM draft ready. Edit, then lock."
                  : locks.setup
                    ? "Generate Style to continue."
                    : "Lock Scene Setup to generate this draft."}
            </small>
          </div>
          <div className="skill-director-stage-actions">
            {locks.style && (
              <SkillDirectorCollapseButton
                collapsed={isStageCollapsed("style")}
                label={isStageCollapsed("style") ? "Expand style direction" : "Collapse style direction"}
                onClick={() => toggleStageCollapsed("style")}
              />
            )}
            <SkillDirectorLockButton locked={locks.style} disabled={running || !styleReady || !locks.setup} label={locks.style ? "Unlock style direction" : "Lock style direction"} onClick={handleStyleLock} />
          </div>
        </div>
        {!isStageCollapsed("style") && (
          <>
            <label className="text-field-group">
              <textarea
                aria-label="Film Director style direction"
                value={styleDirection}
                readOnly={running || !styleStageEnabled || locks.style}
                placeholder="Generated style, tone, pacing, lighting, and performance texture appears here."
                onChange={(event) => updateUnlocked({ styleDirection: event.target.value })}
              />
            </label>
            <button type="button" className="skill-director-secondary-run" onClick={() => runAction("style")} disabled={running || !locks.setup || locks.style}>
              {running && locks.setup ? "Refreshing Style..." : "Regenerate Style"}
            </button>
          </>
        )}
      </div>

      <div className={`skill-director-stage-card ${locks.motion ? "locked" : ""} ${locks.style ? "" : "disabled"} ${isStageCollapsed("motion") ? "collapsed" : ""}`}>
        <div className="skill-director-stage-heading">
          <div>
            <strong>3. Camera Direction</strong>
            <small>Write the camera motion and framing direction, then lock.</small>
          </div>
          <div className="skill-director-stage-actions">
            {locks.motion && (
              <SkillDirectorCollapseButton
                collapsed={isStageCollapsed("motion")}
                label={isStageCollapsed("motion") ? "Expand camera direction" : "Collapse camera direction"}
                onClick={() => toggleStageCollapsed("motion")}
              />
            )}
            <SkillDirectorLockButton locked={locks.motion} disabled={running || !locks.style} label={locks.motion ? "Unlock camera direction" : "Lock camera direction"} onClick={handleMotionLock} />
          </div>
        </div>
        {!isStageCollapsed("motion") && (
          <label className="text-field-group">
            <textarea
              aria-label="Film Director camera direction"
              value={motionDirection}
              readOnly={running || !locks.style || locks.motion}
              placeholder="Describe camera movement, framing, blocking, lens feel, or coverage."
              onChange={(event) => updateUnlocked({ motionDirection: event.target.value, motionBrief: event.target.value }, ["shotList"])}
            />
          </label>
        )}
      </div>

      <div className={`skill-director-stage-card ${locks.scene ? "locked" : ""} ${locks.motion ? "" : "disabled"} ${isStageCollapsed("scene") ? "collapsed" : ""}`}>
        <div className="skill-director-stage-heading">
          <div>
            <strong>4. Scene Overview</strong>
            <small>Write the scene, then lock to generate the Shot List.</small>
          </div>
          <div className="skill-director-stage-actions">
            {locks.scene && (
              <SkillDirectorCollapseButton
                collapsed={isStageCollapsed("scene")}
                label={isStageCollapsed("scene") ? "Expand scene overview" : "Collapse scene overview"}
                onClick={() => toggleStageCollapsed("scene")}
              />
            )}
            <SkillDirectorLockButton locked={locks.scene} disabled={running || !sceneReady || !locks.motion} label={locks.scene ? "Unlock scene overview" : "Lock scene overview"} onClick={handleSceneLock} />
          </div>
        </div>
        {!isStageCollapsed("scene") && (
          <label className="text-field-group">
            <span>Scene Overview</span>
            <textarea
              aria-label="Film Director scene overview"
              value={sceneOverview}
              readOnly={running || !locks.motion || locks.scene}
              placeholder="Summarize the scene, continuity rules, required moments, dialogue beats, or actions."
              onChange={(event) => updateUnlocked({ sceneOverview: event.target.value, text: event.target.value }, ["shotList"])}
            />
          </label>
        )}
      </div>

      <div className={`skill-director-stage-card ${locks.shotList ? "locked" : ""} ${locks.scene ? "" : "disabled"} ${isStageCollapsed("shotList") ? "collapsed" : ""}`}>
        <div className="skill-director-stage-heading">
          <div>
            <strong>5. Shot List</strong>
            <small>{running && locks.scene ? "Refreshing from Scene Overview..." : shotListReady ? "Generated CUT list ready. Edit, then lock." : locks.scene ? "Generating from Scene Overview..." : "Lock Scene Overview to generate this draft."}</small>
          </div>
          <div className="skill-director-stage-actions">
            {locks.shotList && (
              <SkillDirectorCollapseButton
                collapsed={isStageCollapsed("shotList")}
                label={isStageCollapsed("shotList") ? "Expand shot list" : "Collapse shot list"}
                onClick={() => toggleStageCollapsed("shotList")}
              />
            )}
            <SkillDirectorLockButton locked={locks.shotList} disabled={running || !shotListReady || !locks.scene} label={locks.shotList ? "Unlock shot list" : "Lock shot list"} onClick={handleShotListLock} />
          </div>
        </div>
        {!isStageCollapsed("shotList") && (
          <>
            <label className="text-field-group">
              <span>Shot List</span>
              <textarea
                aria-label="Film Director shot list"
                className="skill-director-shot-list-textarea"
                value={shotList}
                readOnly={running || !locks.scene || locks.shotList}
                placeholder="Generated CUT list appears here. Editable."
                onChange={(event) => updateUnlocked({ shotList: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="skill-director-secondary-run"
              onClick={() => runAction("shotList", {
                skillDirectorForceFreshShotList: true,
                skillDirectorRebuildAfterShotList: true
              })}
              disabled={running || !locks.scene || locks.shotList || !sceneOverview.trim()}
            >
              {running ? "Running..." : "Regenerate Shot List"}
            </button>
          </>
        )}
      </div>

      <button className="run-node-button" onClick={() => runAction("build")} disabled={running || !canBuild}>
        {running ? "Running..." : built ? "Rebuild Scene" : "Build Scene"}
      </button>

      {built && (
        <details
          className="skill-director-output"
          open={finalPromptOpen}
          onToggle={(event) => onUpdate(node.id, { skillPreviewOpen: event.currentTarget.open })}
        >
          <summary>Final prompt output</summary>
          <textarea
            value={formatSkillDirectorFinalPromptDisplay(node.data.resultText || "")}
            placeholder={running ? "Running..." : "Output will appear here"}
            onChange={(event) => onUpdate(node.id, { resultText: event.target.value })}
          />
        </details>
      )}

      {built && (
        revisionVersions.length > 1 && (
          <label className="skill-director-version-history">
            <span><History size={14} /> Revision History</span>
            <select value={selectedRevisionId} disabled={running} onChange={restoreRevisionVersion}>
              {revisionVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label || "Saved Setup"}{version.summary ? ` — ${version.summary}` : ""}
                </option>
              ))}
            </select>
          </label>
        )
      )}

      {built && (
        <section className={`skill-director-revision-drawer ${revisionOpen ? "open" : ""}`}>
          <button
            type="button"
            className="skill-director-revision-tab"
            aria-expanded={revisionOpen}
            onClick={() => onUpdate(node.id, { skillDirectorRevisionOpen: !revisionOpen })}
          >
            <span><MessageSquareText size={14} /> Revision Notes</span>
            {revisionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {revisionOpen && (
            <div className="skill-director-revision-panel">
              <textarea
                aria-label="Film Director revision notes"
                value={revisionNotes}
                disabled={running}
                placeholder="Ask the Director to adjust shots, remove dialogue, change pacing, or address notes from the latest video."
                onChange={(event) => onUpdate(node.id, { skillDirectorRevisionNotes: event.target.value })}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    applyRevisionNotes();
                  }
                }}
              />
              <button type="button" className="skill-director-apply-revision" disabled={running || !revisionNotes.trim()} onClick={applyRevisionNotes}>
                <WandSparkles size={14} />
                {running ? "Applying Notes..." : "Apply Notes"}
              </button>
              {node.data.skillDirectorLastRevisionSummary && (
                <p className="skill-director-revision-summary">{node.data.skillDirectorLastRevisionSummary}</p>
              )}
            </div>
          )}
        </section>
      )}

      {node.data.error && <small className="upload-error">{node.data.error}</small>}
    </div>
  );
}

export function MediaAssetNodeBody({ node, outputPort, onUpload, onOutputImport, onPreviewOpen, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div
      className="node-body media-node-body"
      onDragOver={allowFileDrop}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const outputItem = outputItemFromDataTransfer(event.dataTransfer);
        if (outputItem) {
          onOutputImport?.(node, outputItem);
          return;
        }
        const file = firstAcceptedFile(event.dataTransfer.files, node.type);
        if (file) onUpload(node, file);
      }}
    >
      <OutputPortRow node={node} port={outputPort} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
      <MediaPreview node={node} onPreviewOpen={onPreviewOpen} />
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

export function ComposerNodeBody({ node, imageOutputPort, composerInputPorts, onOpenComposer, onConnectStart, onDisconnectInput, connectedPortKeys }) {
  return (
    <div className="node-body composer-node-body">
      {imageOutputPort && <OutputPortRow node={node} port={imageOutputPort} label="Frame output" onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />}
      <div className={`composer-node-preview ${node.data.resultUrl ? "" : "empty"}`}>
        {node.data.resultUrl ? (
          <img {...fullResolutionImageProps(node.data.resultUrl, node.data.fileName)} src={previewImageUrl(node.data.resultUrl, node.data.thumbnailUrl)} alt="Composer frame" />
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
      <div className="composer-input-list" aria-label="Composer inputs">
        {composerInputPorts.map((port) => (
          <div key={port.id} className="composer-input-row">
            <PortHandle
              node={node}
              port={port}
              side="input"
              onConnectStart={onConnectStart}
              onDisconnectInput={onDisconnectInput}
              connectedPortKeys={connectedPortKeys}
            />
            <span title={port.label}>{port.label}</span>
          </div>
        ))}
      </div>
      {node.data.status === "uploading" && <small className="upload-status">Capturing...</small>}
      {node.data.error && <small className="upload-error">{node.data.error}</small>}
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Box, ChevronDown, ChevronRight, Lock, MessageSquareText, Unlock, WandSparkles } from "lucide-react";
import { allowFileDrop, firstAcceptedFile, fullResolutionImageProps, mediaAccept, outputItemFromDataTransfer, previewImageUrl } from "../mediaAssets.js";
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

const skillDirectorDurations = ["5", "10", "15", "20", "30"];
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
  const locks = skillDirectorDefaultLocks(node.data.skillDirectorLocks);
  const collapsed = skillDirectorDefaultCollapsed(node.data.skillDirectorCollapsed);
  const referenceItems = [
    ...(incoming.characterIn || []).map(({ source }) => {
      if (!source?.data?.resultUrl) return null;
      const label = sourceLabel?.(source) || `@${skillDirectorReferenceTag(source.data.characterName || source.data.title || "Character").slice(1)}`;
      return {
        key: skillDirectorReferenceKey(source),
        tag: skillDirectorReferenceTag(label),
        label,
        group: "Character",
        defaultDescription: skillDirectorCharacterDescription(source)
      };
    }),
    ...(incoming.locationIn || []).map(({ source }) => {
      if (!source?.data?.resultUrl) return null;
      const label = source.data.title || sourceLabel?.(source) || source.data.fileName || source.data.resultUrl.split("/").pop() || "Location";
      return {
        key: skillDirectorReferenceKey(source),
        tag: skillDirectorReferenceTag(label),
        label,
        group: "Location",
        defaultDescription: "Scene location reference. Use this for environment, layout, production design, lighting, and geography."
      };
    }),
    ...(incoming.imageIn || []).map(({ source }) => {
      if (!source?.data?.resultUrl) return null;
      const label = source.data.title || sourceLabel?.(source) || source.data.fileName || source.data.resultUrl.split("/").pop() || "Props";
      return {
        key: skillDirectorReferenceKey(source),
        tag: skillDirectorReferenceTag(label),
        label,
        group: "Props",
        defaultDescription: "Scene prop reference. Use this as a specific object, product, set dressing, wardrobe item, or visual asset in the scene."
      };
    })
  ].filter(Boolean);
  const styleConnected = Boolean(incoming.styleIn?.length);
  const finalPromptOpen = node.data.skillPreviewOpen !== false;
  const shotValue = node.data.skillShotCount || node.data.shotCount || "3";
  const autoPlannedShotCount = Number.parseInt(node.data.lastRunActualShotCount || node.data.lastRunShotCount || "", 10);
  const durationValue = node.data.skillDurationSeconds || node.data.durationSeconds || "15";
  const sceneName = node.data.sceneName || "";
  const sceneOverview = node.data.sceneOverview ?? node.data.text ?? "";
  const styleDirection = node.data.styleDirection || "";
  const motionDirection = node.data.motionDirection || node.data.motionBrief || "";
  const shotList = formatSkillDirectorShotListDisplay(node.data.shotList || "");
  const built = Boolean(node.data.skillDirectorBuilt && node.data.resultText);
  const revisionOpen = Boolean(node.data.skillDirectorRevisionOpen);
  const revisionNotes = node.data.skillDirectorRevisionNotes || "";
  const revisionHistory = Array.isArray(node.data.skillDirectorRevisionHistory) ? node.data.skillDirectorRevisionHistory : [];
  const directorOutputPort = config.output.find((port) => port.id === "directorOut") || outputPort;
  const setupReady = Boolean(sceneName.trim()) || connectedCount > 0;
  const styleReady = Boolean(styleDirection.trim());
  const sceneReady = Boolean(sceneOverview.trim());
  const shotListReady = Boolean(shotList.trim());
  const styleStageEnabled = locks.setup && (!running || styleReady);
  const canBuild = locks.setup && locks.style && locks.motion && locks.scene && locks.shotList;
  const invalidate = skillDirectorInvalidationPatch();
  const queuedRunRef = useRef("");

  const updateUnlocked = (patch) => onUpdate(node.id, { ...patch, ...invalidate });
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
  const runActionAfterUpdate = (action, dataOverrides = {}) => {
    window.setTimeout(() => runAction(action, dataOverrides), 0);
  };
  const queuedAction = node.data.skillDirectorQueuedAction || "";
  const queuedRunKey = `${node.id}:${node.data.skillDirectorQueueId || ""}:${queuedAction}`;
  useEffect(() => {
    if (!queuedAction || running) return;
    const readyToRun =
      (queuedAction === "style" && locks.setup) ||
      (queuedAction === "shotList" && locks.scene && Boolean(sceneOverview.trim()));
    if (!readyToRun) return;
    if (queuedRunRef.current === queuedRunKey) return;
    queuedRunRef.current = queuedRunKey;
    onUpdate(node.id, { skillDirectorQueuedAction: "" });
    runAction(queuedAction);
  });

  const handleSetupLock = () => {
    if (locks.setup) {
      onUpdate(node.id, {
        skillDirectorLocks: { setup: false, style: false, motion: false, scene: false, shotList: false },
        skillDirectorCollapsed: { setup: false, style: false, motion: false, scene: false, shotList: false },
        ...invalidate
      });
      return;
    }
    const nextLocks = { setup: true, style: false, motion: false, scene: false, shotList: false };
    const resetPatch = {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { setup: true, style: false, motion: false, scene: false, shotList: false },
      skillDirectorQueuedAction: "",
      skillDirectorQueueId: "",
      ...invalidate
    };
    onUpdate(node.id, resetPatch);
    runActionAfterUpdate("style", resetPatch);
  };
  const handleStyleLock = () => {
    if (locks.style) {
      onUpdate(node.id, {
        skillDirectorLocks: { ...locks, style: false, motion: false, scene: false, shotList: false },
        skillDirectorCollapsed: { ...collapsed, style: false, motion: false, scene: false, shotList: false },
        ...invalidate
      });
      return;
    }
    const nextLocks = { ...locks, style: true, motion: false, scene: false, shotList: false };
    onUpdate(node.id, {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, style: true, motion: false, scene: false, shotList: false },
      skillDirectorQueuedAction: "",
      skillDirectorQueueId: "",
      ...invalidate
    });
  };
  const handleMotionLock = () => {
    if (locks.motion) {
      onUpdate(node.id, {
        skillDirectorLocks: { ...locks, motion: false, scene: false, shotList: false },
        skillDirectorCollapsed: { ...collapsed, motion: false, scene: false, shotList: false },
        ...invalidate
      });
      return;
    }
    const nextLocks = { ...locks, motion: true, scene: false, shotList: false };
    const nextMotionDirection = motionDirection.trim() || skillDirectorDefaultCameraDirection;
    onUpdate(node.id, {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, motion: true, scene: false, shotList: false },
      motionDirection: nextMotionDirection,
      motionBrief: nextMotionDirection,
      skillDirectorQueuedAction: "",
      skillDirectorQueueId: "",
      ...invalidate
    });
  };
  const handleSceneLock = () => {
    if (locks.scene) {
      onUpdate(node.id, {
        skillDirectorLocks: { ...locks, scene: false, shotList: false },
        skillDirectorCollapsed: { ...collapsed, scene: false, shotList: false },
        ...invalidate
      });
      return;
    }
    const nextLocks = { ...locks, scene: true, shotList: false };
    onUpdate(node.id, {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, scene: true, shotList: false },
      skillDirectorQueuedAction: "",
      skillDirectorQueueId: "",
      ...invalidate
    });
    runActionAfterUpdate("shotList", {
      skillDirectorLocks: nextLocks,
      skillDirectorCollapsed: { ...collapsed, scene: true, shotList: false },
      skillDirectorQueuedAction: "",
      skillDirectorQueueId: "",
      ...invalidate
    });
  };
  const handleShotListLock = () => {
    if (locks.shotList) {
      onUpdate(node.id, {
        skillDirectorLocks: { ...locks, shotList: false },
        skillDirectorCollapsed: { ...collapsed, shotList: false },
        ...invalidate
      });
      return;
    }
    onUpdate(node.id, {
      skillDirectorLocks: { ...locks, shotList: true },
      skillDirectorCollapsed: { ...collapsed, shotList: true }
    });
  };
  const applyRevisionNotes = () => {
    if (!built || running || !revisionNotes.trim()) return;
    runAction("revise", { skillDirectorRevisionNotes: revisionNotes.trim() });
  };

  return (
    <div className="node-body text-node-body skill-director-node-body">
      {built && (
        <OutputPortRow node={node} port={directorOutputPort} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys} />
      )}

      <div className={`skill-director-stage-card ${locks.setup ? "locked" : ""} ${isStageCollapsed("setup") ? "collapsed" : ""}`}>
        <div className="skill-director-stage-heading">
          <div>
            <strong>1. Scene Setup</strong>
            <small>{locks.setup ? "Locked" : "Add scene basics and references first"}</small>
          </div>
          <div className="skill-director-stage-actions">
            {locks.setup && (
              <SkillDirectorCollapseButton
                collapsed={isStageCollapsed("setup")}
                label={isStageCollapsed("setup") ? "Expand scene setup" : "Collapse scene setup"}
                onClick={() => toggleStageCollapsed("setup")}
              />
            )}
            <SkillDirectorLockButton locked={locks.setup} disabled={running || (!setupReady && !locks.setup)} label={locks.setup ? "Unlock scene setup" : "Lock scene setup"} onClick={handleSetupLock} />
          </div>
        </div>

        {!isStageCollapsed("setup") && (
          <>
            <div className="skill-director-grid">
              <label className="node-row">
                <span>Scene Name</span>
                <input value={sceneName} disabled={running || locks.setup} onChange={(event) => updateUnlocked({ sceneName: event.target.value })} />
              </label>
              <label className="node-row">
                <span>Duration</span>
                <select value={durationValue} disabled={running || locks.setup} onChange={(event) => updateUnlocked({ skillDurationSeconds: event.target.value, durationSeconds: event.target.value })}>
                  {skillDirectorDurations.map((duration) => (
                    <option key={duration} value={duration}>
                      {duration}s
                    </option>
                  ))}
                </select>
              </label>
              <label className="node-row">
                <span>Shots</span>
                <select
                  value={shotValue}
                  disabled={running || locks.setup}
                  onChange={(event) => updateUnlocked({ skillShotCount: event.target.value })}
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
            </div>

            <div className="skill-director-input-rows" aria-label="Film Director inputs">
              <NodeRow label="Character" inputPort={characterInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button type="button" disabled={running || locks.setup} className={incoming.characterIn?.length ? "connected-field" : ""}>
                  {connectedInputSummary(incoming.characterIn, "Add character")}
                </button>
              </NodeRow>
              <NodeRow label="Location" inputPort={locationInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button type="button" disabled={running || locks.setup} className={incoming.locationIn?.length ? "connected-field" : ""}>
                  {connectedInputSummary(incoming.locationIn, "Add location")}
                </button>
              </NodeRow>
              <NodeRow label="Props" inputPort={elementInputPort} node={node} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
                <button type="button" disabled={running || locks.setup} className={incoming.imageIn?.length ? "connected-field" : ""}>
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
                  return (
                    <label key={reference.key} className="skill-director-reference-row">
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
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </>
        )}
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
              onChange={(event) => updateUnlocked({ motionDirection: event.target.value, motionBrief: event.target.value })}
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
              onChange={(event) => updateUnlocked({ sceneOverview: event.target.value, text: event.target.value })}
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
            <button type="button" className="skill-director-secondary-run" onClick={() => runAction("shotList")} disabled={running || !locks.scene || locks.shotList || !sceneOverview.trim()}>
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
              {revisionHistory.length > 0 && (
                <details className="skill-director-revision-history">
                  <summary>Previous revisions ({revisionHistory.length})</summary>
                  <div>
                    {[...revisionHistory].reverse().map((entry, index) => (
                      <article key={`${entry.createdAt || "revision"}-${index}`}>
                        <strong>{entry.summary || "Revision applied"}</strong>
                        <span>{entry.notes}</span>
                      </article>
                    ))}
                  </div>
                </details>
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

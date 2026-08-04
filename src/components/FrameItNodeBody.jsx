import React from "react";
import {
  Aperture,
  Bird,
  Camera,
  EyeOff,
  Focus,
  Grid3X3,
  LandPlot,
  Save,
  Trash2,
  Undo2,
  UserRoundPlus
} from "lucide-react";
import {
  defaultFrameItFigure,
  defaultFrameItPoseId,
  defaultFrameItScene,
  frameItApplyPose,
  frameItAspectRatios,
  frameItFigureColors,
  frameItFigureCompositionSnapshot,
  frameItFigurePositionPatch,
  frameItJointLabels,
  frameItJointPatch,
  frameItJointRange,
  frameItJointRotation,
  frameItPosePresets,
  frameItPoseSnapshot,
  frameItShotPreset,
  frameItShotPresetScene,
  frameItShotPresets,
  normalizeFrameItCamera,
  normalizeFrameItSavedPoses,
  normalizeFrameItScene,
  normalizeFrameItViewMode
} from "../frameItState.js";
import { FrameItBirdsEye } from "./FrameItBirdsEye.jsx";
import { FrameItViewport } from "./FrameItViewport.jsx";
import { OutputPortRow } from "./NodePorts.jsx";

export function FrameItNodeBody({
  node,
  outputPort,
  onUpdate,
  onCapture,
  onUndoSnapshot,
  onCanvasPanStart,
  onResizeStart,
  onConnectStart,
  onDisconnectInput,
  connectedPortKeys
}) {
  const viewportRef = React.useRef(null);
  const editSessionRef = React.useRef("");
  const [poseName, setPoseName] = React.useState("");
  const scene = normalizeFrameItScene(node.data.frameItScene);
  const selectedFigure = scene.figures.find((figure) => figure.id === node.data.frameItSelectedFigureId) || scene.figures[0];
  const selectedJoint = frameItJointLabels[node.data.frameItSelectedJoint] ? node.data.frameItSelectedJoint : "upperBodyRot";
  const selectedRotation = frameItJointRotation(selectedFigure, selectedJoint);
  const selectedPosition = frameItFigurePositionPatch(selectedFigure);
  const savedPoses = normalizeFrameItSavedPoses(node.data.frameItSavedPoses);
  const aspectRatio = frameItAspectRatios.includes(node.data.frameItAspectRatio) ? node.data.frameItAspectRatio : "16:9";
  const useLimits = node.data.frameItUseLimits !== false;
  const showGrid = node.data.frameItShowGrid !== false;
  const showFloor = node.data.frameItShowFloor !== false;
  const showGuides = node.data.frameItShowGuides !== false;
  const showShotLabel = Boolean(node.data.frameItShowShotLabel);
  const viewMode = normalizeFrameItViewMode(node.data.frameItViewMode);
  const shotPresetId = frameItShotPreset(node.data.frameItShotPreset).id;

  function updateNodeData(patch, { undo = true } = {}) {
    if (undo) onUndoSnapshot?.();
    onUpdate(node.id, patch);
  }

  function beginContinuousEdit(key) {
    if (editSessionRef.current === key) return;
    editSessionRef.current = key;
    onUndoSnapshot?.();
  }

  function endContinuousEdit(key) {
    if (!key || editSessionRef.current === key) editSessionRef.current = "";
  }

  function updateScene(nextScene, { undo = false } = {}) {
    if (undo) onUndoSnapshot?.();
    onUpdate(node.id, { frameItScene: normalizeFrameItScene(nextScene) });
  }

  function patchSelectedFigure(patch, { undo = true } = {}) {
    if (!selectedFigure) return;
    updateScene({
      ...scene,
      figures: scene.figures.map((figure) => figure.id === selectedFigure.id ? { ...figure, ...patch } : figure)
    }, { undo });
  }

  function setSelection({ figureId, jointId }) {
    onUpdate(node.id, {
      frameItSelectedFigureId: figureId,
      frameItSelectedJoint: jointId
    });
  }

  function addFigure() {
    if (scene.figures.length >= 6) return;
    const nextFigure = defaultFrameItFigure(scene.figures.length + 1);
    nextFigure.x = (scene.figures.length % 2 ? 1 : -1) * (0.62 + Math.floor(scene.figures.length / 2) * 0.24);
    updateScene({ ...scene, figures: [...scene.figures, nextFigure] }, { undo: true });
    onUpdate(node.id, { frameItSelectedFigureId: nextFigure.id, frameItSelectedJoint: "upperBodyRot" });
  }

  function removeFigure() {
    if (!selectedFigure || scene.figures.length <= 1) return;
    const nextFigures = scene.figures.filter((figure) => figure.id !== selectedFigure.id);
    updateScene({ ...scene, figures: nextFigures }, { undo: true });
    onUpdate(node.id, { frameItSelectedFigureId: nextFigures[0]?.id || "", frameItSelectedJoint: "upperBodyRot" });
  }

  function resetScene() {
    const nextScene = defaultFrameItScene();
    updateNodeData({
      frameItScene: nextScene,
      frameItSelectedFigureId: nextScene.figures[0].id,
      frameItSelectedJoint: "upperBodyRot",
      frameItSelectedPoseId: defaultFrameItPoseId,
      frameItShotPreset: "medium",
      frameItViewMode: "shot",
      frameItAspectRatio: "16:9"
    });
  }

  function applyShotPreset(presetId) {
    const nextScene = frameItShotPresetScene(scene, presetId);
    updateNodeData({
      frameItScene: nextScene,
      frameItShotPreset: presetId,
      frameItViewMode: "shot",
      frameItSelectedFigureId: nextScene.figures[0]?.id || selectedFigure?.id || ""
    });
  }

  function setViewMode(nextMode) {
    if (nextMode === viewMode) return;
    updateNodeData({ frameItViewMode: nextMode });
  }

  function applyPose(value) {
    if (!selectedFigure) return;
    const builtIn = frameItPosePresets.find((preset) => preset.id === value);
    const custom = savedPoses.find((pose) => pose.id === value);
    const preset = builtIn || custom;
    if (!preset) return;
    if (preset.scene) {
      const restoredScene = normalizeFrameItScene(preset.scene);
      updateNodeData({
        frameItScene: restoredScene,
        frameItSelectedFigureId: preset.selectedFigureId || restoredScene.figures[0]?.id || "",
        frameItSelectedPoseId: value,
        frameItAspectRatio: preset.aspectRatio || aspectRatio
      });
      return;
    }
    const nextFigure = frameItApplyPose(selectedFigure, preset.pose, preset.figurePatch || {});
    updateNodeData({
      frameItScene: normalizeFrameItScene({
        ...scene,
        camera: preset.camera ? normalizeFrameItCamera(preset.camera) : scene.camera,
        figures: scene.figures.map((figure) => figure.id === selectedFigure.id ? nextFigure : figure)
      }),
      frameItSelectedPoseId: value,
      frameItAspectRatio: preset.aspectRatio || aspectRatio
    });
  }

  function savePose() {
    if (!selectedFigure) return;
    const name = poseName.trim() || `Pose ${savedPoses.length + 1}`;
    const pose = {
      id: `frame-it-pose-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      pose: frameItPoseSnapshot(selectedFigure),
      figurePatch: frameItFigureCompositionSnapshot(selectedFigure),
      camera: normalizeFrameItCamera(scene.camera),
      scene: normalizeFrameItScene(scene),
      selectedFigureId: selectedFigure.id,
      aspectRatio
    };
    updateNodeData({ frameItSavedPoses: [...savedPoses, pose].slice(0, 40) });
    setPoseName("");
  }

  function deleteSavedPose() {
    const selectedPoseId = node.data.frameItSelectedPoseId || "";
    if (!savedPoses.some((pose) => pose.id === selectedPoseId)) return;
    updateNodeData({
      frameItSavedPoses: savedPoses.filter((pose) => pose.id !== selectedPoseId),
      frameItSelectedPoseId: ""
    });
  }

  function updatePositionAxis(axis, value) {
    patchSelectedFigure(frameItFigurePositionPatch({ ...selectedPosition, [axis]: value }), { undo: false });
  }

  function updateRotationAxis(axis, value) {
    patchSelectedFigure(frameItJointPatch(selectedJoint, { ...selectedRotation, [axis]: value }, useLimits), { undo: false });
  }

  async function captureFrame() {
    try {
      const imageDataUrl = viewportRef.current?.capture?.();
      if (!imageDataUrl) throw new Error("Frame It viewport is not ready.");
      await onCapture?.(node, imageDataUrl);
    } catch (error) {
      onUpdate(node.id, { status: "error", error: error.message || "Frame capture failed." });
    }
  }

  return (
    <div
      className="node-body frame-it-node-body frame-it-v2"
      onPointerDown={(event) => {
        if (event.target.closest("input, textarea, select, button, label, summary, details, a, .node-port-row, .frame-it-stage, .preview-resize-handle")) event.stopPropagation();
      }}
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) editSessionRef.current = "";
      }}
    >
      <OutputPortRow
        node={node}
        port={outputPort}
        label="Composition guide"
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />

      <div className="frame-it-view-tabs" role="tablist" aria-label="Frame It view">
        <button type="button" className={viewMode === "shot" ? "active" : ""} onClick={() => setViewMode("shot")}><Focus size={14} />Shot View</button>
        <button type="button" className={viewMode === "bird" ? "active" : ""} onClick={() => setViewMode("bird")}><Bird size={14} />Bird&apos;s-eye</button>
      </div>

      <div className="frame-it-workspace">
        <section className="frame-it-canvas-panel">
          <div className="frame-it-canvas-hud">
            <div className="frame-it-canvas-display">
              <button type="button" className={showGuides ? "active" : ""} onClick={() => updateNodeData({ frameItShowGuides: !showGuides })} title="Composition guides"><Grid3X3 size={15} /></button>
              <button type="button" className={showShotLabel ? "active" : ""} onClick={() => updateNodeData({ frameItShowShotLabel: !showShotLabel })} title="Burn shot label"><span>Aa</span></button>
            </div>
          </div>
          <FrameItViewport
            ref={viewportRef}
            sceneData={scene}
            aspectRatio={aspectRatio}
            selectedFigureId={selectedFigure?.id}
            selectedJoint={selectedJoint}
            showGrid={showGrid}
            showFloor={showFloor}
            showGuides={showGuides}
            showShotLabel={showShotLabel}
            shotLabel={node.data.title || "Frame It"}
            useLimits={useLimits}
            onSceneChange={(nextScene) => updateScene(nextScene)}
            onSelectionChange={setSelection}
            onInteractionStart={onUndoSnapshot}
            onCanvasPanStart={onCanvasPanStart}
          />
          {viewMode === "bird" && (
            <FrameItBirdsEye
              sceneData={scene}
              selectedFigureId={selectedFigure?.id}
              onSceneChange={(nextScene) => updateScene(nextScene)}
              onSelectionChange={setSelection}
              onInteractionStart={onUndoSnapshot}
            />
          )}
        </section>

        <aside className="frame-it-controls">
          <section className="frame-it-control-section frame-it-shot-section">
            <div className="frame-it-section-title"><span>Shot</span><Camera size={14} /></div>
            <div className="frame-it-shot-presets">
              {frameItShotPresets.map((preset) => (
                <button key={preset.id} type="button" className={shotPresetId === preset.id ? "active" : ""} onClick={() => applyShotPreset(preset.id)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="frame-it-control-section">
            <div className="frame-it-section-title">
              <span>Subject</span>
              <div>
                <button type="button" onClick={addFigure} disabled={scene.figures.length >= 6} title="Add subject"><UserRoundPlus size={14} /></button>
                <button type="button" onClick={removeFigure} disabled={scene.figures.length <= 1} title="Remove subject"><Trash2 size={14} /></button>
              </div>
            </div>
            <label className="frame-it-field">
              <span>Active</span>
              <select value={selectedFigure?.id || ""} onChange={(event) => updateNodeData({ frameItSelectedFigureId: event.target.value })}>
                {scene.figures.map((figure) => <option key={figure.id} value={figure.id}>{figure.name}</option>)}
              </select>
            </label>
            <label className="frame-it-field">
              <span>Name</span>
              <input value={selectedFigure?.name || ""} onFocus={() => beginContinuousEdit("figure-name")} onBlur={() => endContinuousEdit("figure-name")} onChange={(event) => patchSelectedFigure({ name: event.target.value }, { undo: false })} />
            </label>
            <div className="frame-it-color-swatches" aria-label="Subject color">
              {frameItFigureColors.map((color) => (
                <button key={color.id} type="button" className={selectedFigure?.color?.toLowerCase() === color.value ? "active" : ""} style={{ "--frame-it-swatch": color.value }} onClick={() => patchSelectedFigure({ color: color.value })} title={color.label} />
              ))}
            </div>
            <label className="frame-it-field">
              <span>Pose</span>
              <select value={node.data.frameItSelectedPoseId || ""} onChange={(event) => applyPose(event.target.value)}>
                <option value="">Choose pose</option>
                <optgroup label="Built in">{frameItPosePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                {savedPoses.length > 0 && <optgroup label="Saved">{savedPoses.map((pose) => <option key={pose.id} value={pose.id}>{pose.name}</option>)}</optgroup>}
              </select>
            </label>
            <label className="frame-it-field compact pose-save">
              <input data-frame-it-local-draft value={poseName} onChange={(event) => setPoseName(event.target.value)} placeholder="Save composition" />
              <button type="button" onClick={savePose} title="Save composition"><Save size={14} /></button>
              <button type="button" onClick={deleteSavedPose} disabled={!savedPoses.some((pose) => pose.id === node.data.frameItSelectedPoseId)} title="Delete saved composition"><Trash2 size={14} /></button>
            </label>
            <details className="frame-it-details">
              <summary>Transform data</summary>
              <div className="frame-it-transform-data">
                <FrameItTransformColumn title="Position" mode="position" axes={selectedPosition} onChange={updatePositionAxis} onEditStart={beginContinuousEdit} onEditEnd={endContinuousEdit} />
                <FrameItTransformColumn
                  title="Joint rotation"
                  mode="joint"
                  axes={selectedRotation}
                  ranges={Object.fromEntries(["x", "y", "z"].map((axis) => [axis, frameItJointRange(selectedJoint, axis, useLimits)]))}
                  onChange={updateRotationAxis}
                  onEditStart={beginContinuousEdit}
                  onEditEnd={endContinuousEdit}
                  suffix="°"
                />
              </div>
              <label className="frame-it-toggle-row"><span>Joint limits</span><button type="button" className={`node-toggle ${useLimits ? "enabled" : ""}`} onClick={() => updateNodeData({ frameItUseLimits: !useLimits })}><span /></button></label>
            </details>
          </section>

          <section className="frame-it-control-section">
            <div className="frame-it-section-title"><span>Camera</span><Aperture size={14} /></div>
            <label className="frame-it-field"><span>Frame</span><select value={aspectRatio} onChange={(event) => updateNodeData({ frameItAspectRatio: event.target.value })}>{frameItAspectRatios.map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label>
            <FrameItSlider label="Lens" value={scene.camera.fov} min={14} max={90} onChange={(value) => updateScene({ ...scene, camera: { ...scene.camera, fov: value } })} onEditStart={() => beginContinuousEdit("camera-lens")} onEditEnd={() => endContinuousEdit("camera-lens")} onUndoStep={onUndoSnapshot} />
            <div className="frame-it-display-toggles">
              <button type="button" className={showGrid ? "active" : ""} onClick={() => updateNodeData({ frameItShowGrid: !showGrid })} title="Floor grid"><Grid3X3 size={14} /></button>
              <button type="button" className={showFloor ? "active" : ""} onClick={() => updateNodeData({ frameItShowFloor: !showFloor })} title={showFloor ? "Hide floor" : "Show floor"}>{showFloor ? <LandPlot size={14} /> : <EyeOff size={14} />}</button>
              <button type="button" className="frame-it-reset-button" onClick={resetScene}><Undo2 size={14} /><span>Reset</span></button>
            </div>
            <button type="button" className="frame-it-secondary-button" onClick={captureFrame}><Camera size={14} />Capture guide</button>
          </section>
        </aside>
      </div>
      {node.data.error && <small className="upload-error">{node.data.error}</small>}
      <button className="preview-resize-handle frame-it-resize-handle" onPointerDown={(event) => onResizeStart?.(event, node, "frameItScale")} title="Resize Frame It" aria-label="Resize Frame It" />
    </div>
  );
}

function FrameItTransformColumn({ title, mode, axes, ranges, onChange, onEditStart, onEditEnd, suffix = "" }) {
  return (
    <div className="frame-it-transform-column">
      <strong>{title}</strong>
      {["x", "y", "z"].map((axis) => (
        <FrameItAxisInput
          key={axis}
          axis={axis}
          value={axes[axis]}
          min={ranges?.[axis]?.min ?? (mode === "position" && axis === "y" ? -1.5 : mode === "position" ? -12 : -360)}
          max={ranges?.[axis]?.max ?? (mode === "position" && axis === "y" ? 4 : mode === "position" ? 12 : 360)}
          step={mode === "position" ? 0.05 : 1}
          scrubStep={mode === "position" ? 0.01 : 0.35}
          suffix={suffix}
          onChange={(value) => onChange(axis, value)}
          onEditStart={() => onEditStart(`${mode}-${axis}`)}
          onEditEnd={() => onEditEnd(`${mode}-${axis}`)}
        />
      ))}
    </div>
  );
}

function FrameItAxisInput({ axis, value, min, max, step, scrubStep, suffix = "", onChange, onEditStart, onEditEnd }) {
  const activeRef = React.useRef(false);
  const scrubRef = React.useRef(null);
  const onChangeRef = React.useRef(onChange);
  const [draft, setDraft] = React.useState(() => formatFrameItAxisValue(value));
  onChangeRef.current = onChange;

  React.useEffect(() => {
    if (!activeRef.current) setDraft(formatFrameItAxisValue(value));
  }, [value]);

  function boundedValue(nextValue) {
    return Math.min(max, Math.max(min, Number(nextValue) || 0));
  }

  function applyValue(nextValue) {
    const bounded = boundedValue(nextValue);
    setDraft(formatFrameItAxisValue(bounded));
    onChangeRef.current?.(bounded);
  }

  function finishEdit() {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) applyValue(parsed);
    else setDraft(formatFrameItAxisValue(value));
    activeRef.current = false;
    onEditEnd?.();
  }

  function handleScrubStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activeRef.current = true;
    scrubRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: Number(value) || 0, lastValue: Number(value) || 0 };
    onEditStart?.();
  }

  function handleScrubMove(event) {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const precision = event.shiftKey ? 0.1 : 1;
    const nextValue = boundedValue(scrub.startValue + (event.clientX - scrub.startX) * scrubStep * precision);
    scrub.lastValue = nextValue;
    applyValue(nextValue);
  }

  function handleScrubEnd(event) {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    scrubRef.current = null;
    setDraft(formatFrameItAxisValue(scrub.lastValue));
    activeRef.current = false;
    onEditEnd?.();
  }

  return (
    <label className={`frame-it-axis-input axis-${axis}`}>
      <button type="button" onPointerDown={handleScrubStart} onPointerMove={handleScrubMove} onPointerUp={handleScrubEnd} onPointerCancel={handleScrubEnd} title={`Drag ${axis.toUpperCase()} horizontally`}>{axis.toUpperCase()}</button>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => { activeRef.current = true; onEditStart?.(); }}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(parsed)) onChangeRef.current?.(boundedValue(parsed));
        }}
        onBlur={finishEdit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setDraft(formatFrameItAxisValue(value)); event.currentTarget.blur(); }
        }}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

function formatFrameItAxisValue(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function FrameItSlider({ label, value, min, max, onChange, onEditStart, onEditEnd, onUndoStep }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <label className="frame-it-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={rounded}
        onPointerDown={onEditStart}
        onPointerUp={onEditEnd}
        onPointerCancel={onEditEnd}
        onBlur={onEditEnd}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) onUndoStep?.();
        }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{rounded}</strong>
    </label>
  );
}

import React from "react";
import {
  Bone,
  Camera,
  Grid3X3,
  LandPlot,
  Maximize2,
  Move3D,
  MoveHorizontal,
  MoveVertical,
  Rotate3D,
  Save,
  Trash2,
  Undo2,
  UserRoundPlus
} from "lucide-react";
import {
  defaultFrameItFigure,
  defaultFrameItScene,
  frameItApplyPose,
  frameItAspectRatios,
  frameItFigureCompositionSnapshot,
  frameItFigureColors,
  frameItJointLabels,
  frameItJointPatch,
  frameItJointRange,
  frameItJointRotation,
  frameItPosePresets,
  frameItPoseSnapshot,
  normalizeFrameItCamera,
  normalizeFrameItSavedPoses,
  normalizeFrameItScene
} from "../frameItState.js";
import { FrameItViewport } from "./FrameItViewport.jsx";
import { OutputPortRow } from "./NodePorts.jsx";

const frameItTools = [
  { id: "bend", label: "Bend", icon: Bone },
  { id: "tilt", label: "Tilt", icon: MoveHorizontal },
  { id: "rotate", label: "Rotate", icon: Rotate3D },
  { id: "moveVertical", label: "Move up/down", icon: MoveVertical },
  { id: "moveFloor", label: "Move on floor", icon: Move3D }
];

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
  const savedPoses = normalizeFrameItSavedPoses(node.data.frameItSavedPoses);
  const tool = frameItTools.some((item) => item.id === node.data.frameItTool) ? node.data.frameItTool : "bend";
  const aspectRatio = frameItAspectRatios.includes(node.data.frameItAspectRatio) ? node.data.frameItAspectRatio : "16:9";
  const useLimits = node.data.frameItUseLimits !== false;
  const showGrid = node.data.frameItShowGrid !== false;
  const showFloor = node.data.frameItShowFloor !== false;
  const showGuides = node.data.frameItShowGuides !== false;
  const bendRange = frameItJointRange(selectedJoint, "x", useLimits);
  const rotateRange = frameItJointRange(selectedJoint, "y", useLimits);
  const tiltRange = frameItJointRange(selectedJoint, "z", useLimits);

  function invalidateCapturePatch() {
    return {
      resultUrl: "",
      resultItems: [],
      fileName: "",
      status: "",
      error: ""
    };
  }

  function updateNodeData(patch, { undo = true, invalidate = false } = {}) {
    if (undo) onUndoSnapshot?.();
    onUpdate(node.id, {
      ...patch,
      ...(invalidate ? invalidateCapturePatch() : {})
    });
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
    onUpdate(node.id, {
      frameItScene: normalizeFrameItScene(nextScene),
      ...invalidateCapturePatch()
    });
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
    const offset = (scene.figures.length - (scene.figures.length - 1) / 2) * 0.72;
    nextFigure.x = offset;
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
    updateScene(nextScene, { undo: true });
    onUpdate(node.id, {
      frameItSelectedFigureId: nextScene.figures[0].id,
      frameItSelectedJoint: "upperBodyRot"
    });
  }

  function applyPreset(value) {
    if (!selectedFigure) return;
    const builtIn = frameItPosePresets.find((preset) => preset.id === value);
    const custom = savedPoses.find((pose) => pose.id === value);
    if (!builtIn && !custom) return;
    const preset = builtIn || custom;
    if (custom?.scene) {
      const restoredScene = normalizeFrameItScene(custom.scene);
      updateNodeData({
        frameItScene: restoredScene,
        frameItSelectedFigureId: custom.selectedFigureId || restoredScene.figures[0]?.id || "",
        frameItSelectedPoseId: value,
        frameItAspectRatio: custom.aspectRatio || aspectRatio
      }, { invalidate: true });
      return;
    }
    const pose = preset.pose;
    const figurePatch = preset.figurePatch || {};
    const nextFigure = frameItApplyPose(selectedFigure, pose, figurePatch);
    let nextCamera = scene.camera;
    if (builtIn?.camera) {
      const { targetYOffset = 1.25, ...cameraPatch } = builtIn.camera;
      nextCamera = normalizeFrameItCamera({
        ...scene.camera,
        ...cameraPatch,
        targetX: nextFigure.x,
        targetY: nextFigure.y + targetYOffset,
        targetZ: nextFigure.z
      });
    } else if (custom?.camera) {
      nextCamera = normalizeFrameItCamera(custom.camera);
    }
    updateNodeData({
      frameItScene: normalizeFrameItScene({
        ...scene,
        camera: nextCamera,
        figures: scene.figures.map((figure) => figure.id === selectedFigure.id ? nextFigure : figure)
      }),
      frameItSelectedPoseId: value,
      frameItAspectRatio: preset.aspectRatio || aspectRatio
    }, { invalidate: true });
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
    onUndoSnapshot?.();
    onUpdate(node.id, { frameItSavedPoses: [...savedPoses, pose].slice(0, 40) });
    setPoseName("");
  }

  function deleteSavedPose() {
    const selectedPoseId = node.data.frameItSelectedPoseId || "";
    if (!selectedPoseId) return;
    onUndoSnapshot?.();
    onUpdate(node.id, {
      frameItSavedPoses: savedPoses.filter((pose) => pose.id !== selectedPoseId),
      frameItSelectedPoseId: ""
    });
  }

  function setJointAxis(axis, value) {
    const rotation = { ...selectedRotation, [axis]: Number(value) };
    patchSelectedFigure(frameItJointPatch(selectedJoint, rotation, useLimits), { undo: false });
  }

  function setCameraView(yaw, pitch = 3) {
    updateScene({
      ...scene,
      camera: {
        ...scene.camera,
        yaw,
        pitch,
        targetX: selectedFigure?.x || 0,
        targetY: (selectedFigure?.y || 0) + 1.25,
        targetZ: selectedFigure?.z || 0
      }
    }, { undo: true });
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
      className="node-body frame-it-node-body"
      onPointerDown={(event) => {
        if (event.target.closest("input, textarea, select, button, label, summary, details, a, .node-port-row, .frame-it-stage, .preview-resize-handle")) {
          event.stopPropagation();
        }
      }}
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) editSessionRef.current = "";
      }}
    >
      <OutputPortRow
        node={node}
        port={outputPort}
        label="Frame output"
        onConnectStart={onConnectStart}
        onDisconnectInput={onDisconnectInput}
        connectedPortKeys={connectedPortKeys}
      />

      <div className="frame-it-workspace">
        <section className="frame-it-canvas-panel">
          <div className="frame-it-tool-rail" aria-label="Pose tools">
            {frameItTools.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={tool === item.id ? "active" : ""}
                  onClick={() => updateNodeData({ frameItTool: item.id })}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
          <FrameItViewport
            ref={viewportRef}
            sceneData={scene}
            aspectRatio={aspectRatio}
            selectedFigureId={selectedFigure?.id}
            selectedJoint={selectedJoint}
            tool={tool}
            showGrid={showGrid}
            showFloor={showFloor}
            showGuides={showGuides}
            useLimits={useLimits}
            onSceneChange={(nextScene) => updateScene(nextScene)}
            onSelectionChange={setSelection}
            onInteractionStart={onUndoSnapshot}
            onCanvasPanStart={onCanvasPanStart}
          />
        </section>

        <aside className="frame-it-controls">
          <section className="frame-it-control-section">
            <div className="frame-it-section-title">
              <span>Figure</span>
              <div>
                <button type="button" onClick={addFigure} disabled={scene.figures.length >= 6} title="Add figure" aria-label="Add figure"><UserRoundPlus size={14} /></button>
                <button type="button" onClick={removeFigure} disabled={scene.figures.length <= 1} title="Remove figure" aria-label="Remove figure"><Trash2 size={14} /></button>
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
              <input
                value={selectedFigure?.name || ""}
                onFocus={() => beginContinuousEdit("figure-name")}
                onBlur={() => endContinuousEdit("figure-name")}
                onChange={(event) => patchSelectedFigure({ name: event.target.value }, { undo: false })}
              />
            </label>
            <div className="frame-it-color-swatches" aria-label="Figure color">
              {frameItFigureColors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  className={selectedFigure?.color?.toLowerCase() === color.value ? "active" : ""}
                  style={{ "--frame-it-swatch": color.value }}
                  onClick={() => patchSelectedFigure({ color: color.value })}
                  title={color.label}
                  aria-label={`${color.label} figure color`}
                />
              ))}
            </div>
          </section>

          <section className="frame-it-control-section">
            <div className="frame-it-section-title"><span>Pose</span><strong>{frameItJointLabels[selectedJoint]}</strong></div>
            <label className="frame-it-field">
              <span>Preset</span>
              <select
                value={node.data.frameItSelectedPoseId || ""}
                onChange={(event) => {
                  const value = event.target.value;
                  applyPreset(value);
                }}
              >
                <option value="">Choose pose</option>
                <optgroup label="Built in">
                  {frameItPosePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                </optgroup>
                {savedPoses.length > 0 && (
                  <optgroup label="Saved">
                    {savedPoses.map((pose) => <option key={pose.id} value={pose.id}>{pose.name}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <FrameItSlider label="Bend" value={selectedRotation.x} min={bendRange.min} max={bendRange.max} onChange={(value) => setJointAxis("x", value)} onEditStart={() => beginContinuousEdit("joint-bend")} onEditEnd={() => endContinuousEdit("joint-bend")} onUndoStep={onUndoSnapshot} />
            <FrameItSlider label="Rotate" value={selectedRotation.y} min={rotateRange.min} max={rotateRange.max} onChange={(value) => setJointAxis("y", value)} onEditStart={() => beginContinuousEdit("joint-rotate")} onEditEnd={() => endContinuousEdit("joint-rotate")} onUndoStep={onUndoSnapshot} />
            <FrameItSlider label="Tilt" value={selectedRotation.z} min={tiltRange.min} max={tiltRange.max} onChange={(value) => setJointAxis("z", value)} onEditStart={() => beginContinuousEdit("joint-tilt")} onEditEnd={() => endContinuousEdit("joint-tilt")} onUndoStep={onUndoSnapshot} />
            <label className="frame-it-field compact pose-save">
              <input data-frame-it-local-draft value={poseName} onChange={(event) => setPoseName(event.target.value)} placeholder="Pose name" />
              <button type="button" onClick={savePose} title="Save current pose" aria-label="Save current pose"><Save size={14} /></button>
              <button type="button" onClick={deleteSavedPose} disabled={!savedPoses.some((pose) => pose.id === node.data.frameItSelectedPoseId)} title="Delete saved pose" aria-label="Delete saved pose"><Trash2 size={14} /></button>
            </label>
            <label className="frame-it-toggle-row">
              <span>Joint limits</span>
              <button type="button" className={`node-toggle ${useLimits ? "enabled" : ""}`} onClick={() => updateNodeData({ frameItUseLimits: !useLimits })}><span /></button>
            </label>
          </section>

          <section className="frame-it-control-section">
            <div className="frame-it-section-title"><span>Frame</span><Camera size={14} /></div>
            <label className="frame-it-field">
              <span>Ratio</span>
              <select value={aspectRatio} onChange={(event) => updateNodeData({ frameItAspectRatio: event.target.value }, { invalidate: true })}>
                {frameItAspectRatios.map((ratioOption) => <option key={ratioOption}>{ratioOption}</option>)}
              </select>
            </label>
            <div className="frame-it-view-buttons" aria-label="Camera views">
              <button type="button" onClick={() => setCameraView(0)}>Front</button>
              <button type="button" onClick={() => setCameraView(-90)}>Left</button>
              <button type="button" onClick={() => setCameraView(90)}>Right</button>
              <button type="button" onClick={() => setCameraView(0, 72)}>Top</button>
            </div>
            <FrameItSlider label="Lens" value={scene.camera.fov} min={18} max={80} onChange={(value) => updateScene({ ...scene, camera: { ...scene.camera, fov: value } })} onEditStart={() => beginContinuousEdit("camera-lens")} onEditEnd={() => endContinuousEdit("camera-lens")} onUndoStep={onUndoSnapshot} />
            <div className="frame-it-display-toggles">
              <button type="button" className={showGuides ? "active" : ""} onClick={() => updateNodeData({ frameItShowGuides: !showGuides })} title="Framing guides"><Maximize2 size={14} /></button>
              <button type="button" className={showGrid ? "active" : ""} onClick={() => updateNodeData({ frameItShowGrid: !showGrid }, { invalidate: true })} title="Floor grid"><Grid3X3 size={14} /></button>
              <button type="button" className={showFloor ? "active" : ""} onClick={() => updateNodeData({ frameItShowFloor: !showFloor }, { invalidate: true })} title={showFloor ? "Hide floor" : "Show floor"} aria-label={showFloor ? "Hide floor" : "Show floor"}><LandPlot size={14} /></button>
              <button type="button" className="frame-it-reset-button" onClick={resetScene} title="Reset scene"><Undo2 size={14} /><span>Reset</span></button>
            </div>
            <button type="button" className="run-node-button frame-it-capture" onClick={captureFrame} disabled={node.data.status === "uploading"}>
              <Camera size={15} />
              {node.data.status === "uploading" ? "Capturing..." : "Capture Frame"}
            </button>
          </section>
        </aside>
      </div>

      {node.data.error && <small className="upload-error">{node.data.error}</small>}
      <button className="preview-resize-handle frame-it-resize-handle" onPointerDown={(event) => onResizeStart?.(event, node, "frameItScale")} title="Resize Frame It" aria-label="Resize Frame It" />
    </div>
  );
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

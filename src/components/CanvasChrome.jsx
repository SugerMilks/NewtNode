import React from "react";
import { Hand, Play, Plus, Save } from "lucide-react";
import { normalizeRect } from "../nodeGeometry.js";

export const EdgePath = React.memo(function EdgePath({ edgeId, from, to, color, draft, selected, active, inactive, onSelect }) {
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
});

export const SelectionMarquee = React.memo(function SelectionMarquee({ start, current }) {
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
});

export const SelectionActionBar = React.memo(function SelectionActionBar({ bounds, viewport, selectedCount, runnableCount, onRunAll, onGroup, onSavePreset, onMoveStart }) {
  const x = viewport.x + (bounds.left + bounds.width / 2) * viewport.scale;
  const y = viewport.y + bounds.top * viewport.scale - 54;

  return (
    <div className="selection-action-bar" style={{ left: x, top: y }} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className="selection-move-handle" onPointerDown={onMoveStart} title="Move selected nodes" aria-label="Move selected nodes">
        <Hand size={19} />
      </button>
      <span className="selection-action-divider" aria-hidden="true" />
      <button onClick={onRunAll} disabled={!runnableCount} title={runnableCount ? `Run or play ${runnableCount} selected node${runnableCount === 1 ? "" : "s"}` : "No runnable selected nodes"}>
        <Play size={18} />
        <span>Run All</span>
      </button>
      <button onClick={onGroup} disabled={selectedCount < 2} title="Group selected nodes">
        <Plus size={17} />
        <span>Group</span>
      </button>
      <button onClick={onSavePreset} title="Save selected nodes as a Newt Preset"><Save size={17} /><span>Newt Preset</span></button>
    </div>
  );
});

export function UnsavedWorkflowPrompt({ actionLabel, saving = false, error = "", onDecision }) {
  const dialogRef = React.useRef(null);
  React.useEffect(() => { dialogRef.current?.focus(); }, []);
  React.useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) onDecision("cancel");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDecision, saving]);

  return (
    <div className="workflow-prompt-backdrop" role="presentation" onPointerDown={(event) => {
      if (!saving && event.target === event.currentTarget) onDecision("cancel");
    }}>
      <section ref={dialogRef} tabIndex={-1} className="workflow-prompt" role="dialog" aria-modal="true" aria-busy={saving} aria-labelledby="workflow-prompt-title" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        const nextIndex = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[nextIndex]?.focus();
      }}>
        <h2 id="workflow-prompt-title">Unsaved workflow</h2>
        <p>Save changes before you {actionLabel || "change workflows"}?</p>
        {saving && <p role="status">Saving your project and its assets before continuing...</p>}
        {error && <p className="workflow-prompt-error" role="alert">{error}</p>}
        <div className="workflow-prompt-actions">
          <button type="button" className="primary" disabled={saving} onClick={() => onDecision("save")}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" disabled={saving} onClick={() => onDecision("discard")}>Don't Save</button>
          <button type="button" disabled={saving} onClick={() => onDecision("cancel")}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

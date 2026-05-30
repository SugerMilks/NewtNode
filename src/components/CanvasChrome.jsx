import React from "react";
import { Play, Plus } from "lucide-react";
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

export const SelectionActionBar = React.memo(function SelectionActionBar({ bounds, viewport, selectedCount, runnableCount, onRunAll, onGroup }) {
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
});

export function UnsavedWorkflowPrompt({ actionLabel, onDecision }) {
  React.useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onDecision("cancel");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDecision]);

  return (
    <div className="workflow-prompt-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onDecision("cancel");
    }}>
      <section className="workflow-prompt" role="dialog" aria-modal="true" aria-labelledby="workflow-prompt-title" onPointerDown={(event) => event.stopPropagation()}>
        <h2 id="workflow-prompt-title">Unsaved workflow</h2>
        <p>Save changes before you {actionLabel || "change workflows"}?</p>
        <div className="workflow-prompt-actions">
          <button type="button" className="primary" onClick={() => onDecision("save")}>Save</button>
          <button type="button" onClick={() => onDecision("discard")}>Don't Save</button>
          <button type="button" onClick={() => onDecision("cancel")}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

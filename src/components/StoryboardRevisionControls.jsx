import React from "react";
import { Download, FileImage, FileText, Info, Loader2, RotateCcw, ScanEye, WandSparkles, X } from "lucide-react";
import { storyboardPanelEditingLocked } from "../storyboardWorkflow.js";

export function StoryboardExportMenu({ disabled, exporting, onExport }) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef(null);
  const trigger = React.useRef(null);
  React.useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  React.useEffect(() => {
    if (!open) return;
    const close = event => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      else if (event.type === "pointerdown" && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return <div className="storyboard-export-menu" ref={root} onPointerDown={event => event.stopPropagation()}>
    <button type="button" ref={trigger} className="icon-only" aria-label="Export storyboard" title="Export storyboard" aria-expanded={open && !disabled} disabled={disabled} onClick={() => setOpen(value => !value)}>{exporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}</button>
    {open && !disabled && <div className="storyboard-export-options" role="group" aria-label="Export format">
      <button type="button" onClick={() => { setOpen(false); onExport("frames"); }}><FileImage size={14} />Export Frames</button>
      <button type="button" onClick={() => { setOpen(false); onExport("pdf"); }}><FileText size={14} />Export PDF</button>
    </div>}
  </div>;
}

export function StoryboardPlanButton({ busy, disabled, planning, hasPlan, protectedCount, onPlan }) {
  const [confirming, setConfirming] = React.useState(false);
  if (confirming) return <div className="storyboard-plan-confirm" role="alert">
    <span>Replace the current plan and panels?</span>
    <button type="button" disabled={busy || disabled || protectedCount > 0} onClick={() => { setConfirming(false); onPlan({ replace: true }); }}>Create New Plan</button>
    <button type="button" className="icon-only" aria-label="Cancel new plan" onClick={() => setConfirming(false)}><X size={14} /></button>
  </div>;
  return <button type="button" disabled={busy || disabled || protectedCount > 0} title={protectedCount ? "Unprotect panels before replacing the plan" : "Create a new scene plan"} onClick={() => hasPlan ? setConfirming(true) : onPlan()}>{planning ? "Planning..." : "Create New Plan"}</button>;
}

export function StoryboardRevisionControls({ node, frames, busy, editingLocked = busy, setupChanged, onUpdate, onRevise, onGenerate, onReview }) {
  const ids = (node.data.storyboardSelectedFrameIds || []).filter(id => frames.some(frame => frame.id === id));
  const protectedSelection = frames.some(frame => ids.includes(frame.id) && frame.protected);
  const instruction = node.data.storyboardRevisionInstruction || "";
  const review = node.data.storyboardSequenceReview;
  const editableFrames = frames.filter(frame => !frame.protected && !storyboardPanelEditingLocked(node, frame));
  return <section className="storyboard-revision-controls" aria-label="Storyboard revisions" onPointerDown={event => event.stopPropagation()}>
    <div className="storyboard-revision-toolbar">
      <label><input type="checkbox" aria-label="Select all editable panels" disabled={editingLocked || !editableFrames.length} checked={editableFrames.length > 0 && editableFrames.every(frame => ids.includes(frame.id))} onChange={event => onUpdate(node.id, { storyboardSelectedFrameIds: event.target.checked ? editableFrames.map(frame => frame.id) : [] })} />{ids.length ? `${ids.length} selected` : `${frames.length} panels`}</label>
      {ids.length > 0 && <><button type="button" disabled={busy || protectedSelection} title="Generate new images for selected panels using their current directions" onClick={() => onGenerate(node, ids)}><RotateCcw size={14} />Regenerate Selected</button><button type="button" className="icon-only" aria-label="Clear panel selection" title="Clear panel selection" disabled={editingLocked} onClick={() => onUpdate(node.id, { storyboardSelectedFrameIds: [] })}><X size={14} /></button></>}
      <span className="storyboard-toolbar-spacer" />
      {setupChanged && <span className="storyboard-setup-change" title="Scene setup changed. Existing panels are preserved; revise only the panels that need updating." aria-label="Scene setup changed"><Info size={14} /></span>}
      <button type="button" className="icon-only" aria-label="Review Sequence" disabled={busy || !frames.some(frame => frame.prompt)} title="Review sequence logic without regenerating images" onClick={() => onReview(node)}>{node.data.status === "reviewing-sequence" ? <Loader2 size={14} className="spin" /> : <ScanEye size={14} />}</button>
    </div>
    {ids.length > 0 && <div className="storyboard-revision-input">
      <textarea aria-label="Selected panel revision" placeholder="Revision for selected panels" value={instruction} disabled={editingLocked} onChange={event => onUpdate(node.id, { storyboardRevisionInstruction: event.target.value })} />
      <button type="button" disabled={busy || !ids.length || ids.length > 8 || protectedSelection || !instruction.trim()} title="Revise directions and generate replacements for up to eight selected panels" onClick={() => onRevise(node, ids, instruction)}><WandSparkles size={14} />{node.data.status === "revising" ? "Revising directions..." : "Revise Selected"}</button>
    </div>}
    {node.data.storyboardRevisionWarning && <p role="status">{node.data.storyboardRevisionWarning}</p>}
    {review && <details className="storyboard-sequence-review"><summary>{review.summary}</summary>{review.issues.map((issue, i) => <p key={i}>Panels {issue.frameIds.map(id => frames.find(frame => frame.id === id)?.number).filter(Boolean).join(", ") || "all"}: {issue.message}</p>)}</details>}
  </section>;
}

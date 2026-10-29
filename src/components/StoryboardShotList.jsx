import React from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Clapperboard, Lock, Unlock, Play, CircleCheck, CircleAlert } from "lucide-react";
import { storyboardShotCameraChoices, storyboardShotNeedsPlan } from "../storyboardShotList.js";
import { StoryboardScriptSource } from "./StoryboardScriptImport.jsx";

export function StoryboardShotList({ frames, busy, onAdd, onUpdate, onRemove, onMove, onProtect, onRun, onPreview, renderDescription, context }) {
  return <section className="storyboard-shot-list storyboard-scroll-surface" aria-label="Shot list" onPointerDown={event => event.stopPropagation()}>
    <header><strong>Shot List</strong><span>{frames.length} / 35</span><button type="button" onClick={onAdd} disabled={busy || frames.length >= 35}><Plus size={14} />Add Shot</button></header>
    {context}
    <ol>
      {frames.map((frame, index) => {
        const locked = busy || frame.protected, needsPlan = storyboardShotNeedsPlan(frame);
        return <li key={frame.id} className="storyboard-shot-row" data-shot-id={frame.id}>
          <div className="storyboard-shot-heading">
            <strong>Shot {String(index + 1).padStart(2, "0")}</strong>
            <span className="storyboard-shot-state" title={needsPlan ? "Needs planning" : "Ready to generate"} aria-label={needsPlan ? "Needs planning" : "Ready to generate"}>{needsPlan ? <CircleAlert size={13} /> : <CircleCheck size={13} />}</span>
            <div className="storyboard-shot-actions">
              <button type="button" title="Move shot up" aria-label={`Move shot ${index + 1} up`} disabled={locked || index === 0 || frames[index - 1]?.protected} onClick={() => onMove(frame.id, frames[index - 1].id)}><ArrowUp size={14} /></button>
              <button type="button" title="Move shot down" aria-label={`Move shot ${index + 1} down`} disabled={locked || index === frames.length - 1 || frames[index + 1]?.protected} onClick={() => onMove(frame.id, frames[index + 1].id)}><ArrowDown size={14} /></button>
              <button type="button" title={frame.protected ? "Unprotect shot" : "Protect shot"} aria-label={`${frame.protected ? "Unprotect" : "Protect"} shot ${index + 1}`} aria-pressed={frame.protected === true} disabled={busy} onClick={() => onProtect(frame.id, !frame.protected)}>{frame.protected ? <Lock size={14} /> : <Unlock size={14} />}</button>
              <button type="button" title={needsPlan ? "Plan this shot before generating" : "Generate this shot"} aria-label={`Generate shot ${index + 1}`} disabled={locked || needsPlan} onClick={() => onRun(frame.id)}><Play size={14} /></button>
              <button type="button" title="Delete shot" aria-label={`Delete shot ${index + 1}`} disabled={locked || frames.length <= 1} onClick={() => onRemove(frame.id)}><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="storyboard-shot-cameras">
            {Object.entries(storyboardShotCameraChoices).map(([key, choices]) => <label key={key}><span>{key === "shot" ? "Framing" : key === "lens" ? "Lens" : "Angle"}</span>
              <select aria-label={`Shot ${index + 1} ${key === "shot" ? "framing" : key}`} value={frame[key] || "None"} disabled={locked} onChange={event => onUpdate(frame.id, { [key]: event.target.value })}>
                {choices.map(value => <option key={value} value={value}>{value === "None" ? "Auto" : value}</option>)}
              </select></label>)}
          </div>
          <div className="storyboard-shot-content">
            <button type="button" className="storyboard-shot-thumbnail" aria-label={`Preview shot ${index + 1}`} title="Preview shot" disabled={!(frame.exportUrl || frame.resultUrl)} onClick={event => onPreview(frame, event)}>
              {frame.exportUrl || frame.resultUrl ? <img src={frame.exportUrl || frame.resultUrl} alt={`Shot ${index + 1}`} loading="lazy" draggable={false} /> : <Clapperboard size={22} />}
            </button>
            {renderDescription(frame, locked)}
          </div>
          {frame.error && <small className="upload-error">{frame.error}</small>}
          <StoryboardScriptSource source={frame.sourceScript} />
        </li>;
      })}
    </ol>
    <button type="button" className="storyboard-shot-add" onClick={onAdd} disabled={busy || frames.length >= 35}><Plus size={14} />Add Shot</button>
  </section>;
}

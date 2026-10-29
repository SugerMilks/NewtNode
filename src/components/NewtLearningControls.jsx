import { useState } from "react";
import { BookOpen, Eye, Pause, Play, Square, MessageSquarePlus, X } from "lucide-react";

export function NewtLearningControls({ learning, compact = false }) {
  const [noteOpen, setNoteOpen] = useState(false), [note, setNote] = useState("");
  if (!learning) return null;
  const { recording, hasSession, busy } = learning;
  return <div className={`newt-learning-controls${compact ? " compact" : ""}`} onPointerDown={event => event.stopPropagation()}>
    <div className="newt-learning-actions">
      {compact ? <span className="newt-learning-state" role="status"><Eye size={14} />Watch Me · {recording ? "Recording" : "Paused"} · {learning.count}</span>
        : <button type="button" aria-pressed={recording} title={recording ? "Pause Watch Me" : "Record this project's creative actions locally"} disabled={busy || (!recording && !learning.canStart)} onClick={recording ? learning.pause : learning.start}><Eye size={15} />{recording ? "Watching" : hasSession ? "Resume watching" : "Watch Me"}</button>}
      {compact && <button type="button" title={recording ? "Pause recording" : "Resume recording"} aria-label={recording ? "Pause Watch Me" : "Resume Watch Me"} disabled={busy || (!recording && !learning.canStart)} onClick={recording ? learning.pause : learning.start}>{recording ? <Pause size={15} /> : <Play size={15} />}</button>}
      {hasSession && <>
        <button type="button" title="Remember why this choice matters" aria-label="Remember this" disabled={busy} onClick={() => setNoteOpen(value => !value)}><MessageSquarePlus size={15} /></button>
        <button type="button" title="Finish recording and review" aria-label="Finish Watch Me" disabled={busy} onClick={learning.finish}><Square size={15} /></button>
      </>}
      <button type="button" title="Review recordings and approved lessons" aria-label="Learning library" onClick={learning.open}><BookOpen size={15} />{!compact && "Learning"}</button>
    </div>
    {noteOpen && <form className="newt-learning-note" onSubmit={async event => { event.preventDefault(); if (await learning.remember(note)) { setNote(""); setNoteOpen(false); } }}>
      <label>Reason to remember<textarea value={note} maxLength={1200} aria-label="Reason to remember" onChange={event => setNote(event.target.value)} autoFocus /></label>
      <div className="newt-learning-actions"><button type="submit" disabled={busy || !note.trim()}><MessageSquarePlus size={14} />Save note</button><button type="button" aria-label="Close note" title="Close note" onClick={() => setNoteOpen(false)}><X size={14} /></button></div>
    </form>}
    {learning.error && <p className="newt-learning-error" role="alert">{learning.error}</p>}
  </div>;
}

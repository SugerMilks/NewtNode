import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, X } from "lucide-react";
import { exportLearningSkill, learningRecap, lessonKinds, learningAnalysisRetryToken } from "../myNewt/learning.js";
import { displayMediaUrl } from "../mediaAssets.js";
import "./newtLearning.css";

const labels = { procedure: "Procedure", preference: "Creative preference", project: "Project constraint", example: "Example" };
function lessonDraft(item) { return { title: item.title, guidance: item.guidance, kind: item.kind, scope: item.scope || "project", tags: item.tags.join(", "), enabled: item.enabled !== false }; }

export default function NewtLearningDialog({ learning }) {
  const { api, projectId } = learning;
  const [library, setLibrary] = useState({ sessions: [], lessons: [] }), [tab, setTab] = useState("sessions"), [session, setSession] = useState(null);
  const [editing, setEditing] = useState(null), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const dialog = useRef(null), alive = useRef(true), operation = useRef(false);
  const dirty = !!note.trim() || editing && JSON.stringify(draft) !== JSON.stringify(lessonDraft(editing.item));
  const mayLeave = () => !dirty || window.confirm("Discard unsaved lesson changes?");
  async function act(fn) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setStatus("");
    try { await fn(); } catch (cause) { if (alive.current) setError(cause.message || "Could not load learning."); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  const readLibrary = async () => { const value = await api("list", { projectId }); if (alive.current) setLibrary(value); return value; };
  const readSession = async id => { const value = await api("get", { projectId }, id); if (alive.current) setSession(value); };
  useEffect(() => {
    alive.current = true; const previous = document.activeElement;
    dialog.current.showModal();
    void act(async () => { const value = await readLibrary(); if (learning.reviewId || value.sessions[0]) await readSession(learning.reviewId || value.sessions[0].id); });
    return () => { alive.current = false; if (previous?.isConnected) previous.focus(); };
  }, []);
  const close = () => { if (!busy && mayLeave()) learning.close(); };
  const edit = (item, approved) => { if (mayLeave()) { setEditing({ item, approved }); setDraft(lessonDraft(item)); setStatus(""); } };
  const reload = () => { if (mayLeave()) void act(async () => { await readLibrary(); if (session) await readSession(session.id); setEditing(null); }); };
  async function save() {
    const value = { ...draft, tags: draft.tags.split(",").map(tag => tag.trim()).filter(Boolean), projectId };
    if (value.scope === "personal" && editing.item.scope !== "personal" && !window.confirm("Make this guidance available to new tasks in ALL projects on this computer? Remove client-specific names or requirements before sharing it across projects.")) return;
    await act(async () => {
      await api(editing.approved ? "update" : "approve", editing.approved ? { ...value, expectedRevision: editing.item.revision }
        : { ...value, suggestionId: editing.item.id }, editing.approved ? editing.item.id : session.id);
      await readLibrary(); setEditing(null); setStatus("Saved for relevant new Newt tasks. Existing tasks are unchanged.");
    });
  }
  const exportSkills = () => {
    const items = library.lessons.filter(item => item.enabled);
    if (!items.length || !window.confirm("Export enabled lessons as SKILL.md? This includes reviewed text only, not media. Check project-specific or client information before sharing the file.")) return;
    const url = URL.createObjectURL(new Blob([exportLearningSkill(items)], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = "SKILL.md"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const approvedIds = new Set(library.lessons.filter(item => item.sessionId === session?.id).map(item => item.suggestionId));
  const retryToken = learningAnalysisRetryToken(session?.analysis);
  return createPortal(<dialog ref={dialog} className="newt-learning-dialog" aria-labelledby="newt-learning-title"
    onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => { event.stopPropagation(); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (editing && !busy) void save(); } }} onPointerDown={event => event.stopPropagation()}>
    <header><h2 id="newt-learning-title">Newt Learning</h2><div className="newt-learning-actions">
      <button type="button" title="Reload library" aria-label="Reload learning library" disabled={busy} onClick={reload}><RefreshCw size={16} /></button>
      <button type="button" title="Export enabled lessons as SKILL.md" aria-label="Export creative skill" disabled={busy || !library.lessons.some(item => item.enabled)} onClick={exportSkills}><Download size={16} /></button>
      <button type="button" title="Close learning" aria-label="Close learning" disabled={busy} onClick={close}><X size={18} /></button>
    </div></header>
    <nav aria-label="Learning views">{[["sessions", "Sessions"], ["lessons", "Approved lessons"]].map(([id, label]) => <button type="button" aria-pressed={tab === id} key={id} disabled={busy} onClick={() => { if (mayLeave()) { setTab(id); setEditing(null); } }}>{label}</button>)}</nav>
    {error && <p className="newt-learning-error" role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    <div className="newt-learning-layout" aria-busy={busy}>
      <aside aria-label={tab === "sessions" ? "Recorded sessions" : "Approved lessons"}>
        {(tab === "sessions" ? library.sessions : library.lessons).map(item => <button type="button" key={item.id} disabled={busy}
          aria-pressed={tab === "sessions" ? session?.id === item.id : editing?.item.id === item.id}
          onClick={() => { if (!mayLeave()) return; if (tab === "sessions") void act(async () => { setEditing(null); setNote(""); await readSession(item.id); }); else edit(item, true); }}>
          <strong>{item.title}</strong><small>{tab === "sessions" ? `${item.recap.count} observations · ${item.finished ? "Review" : "Unfinished"}` : `${item.scope === "personal" ? "All projects" : "This project"} · v${item.revision}${item.enabled ? "" : " · Disabled"}`}</small>
        </button>)}
        {!(tab === "sessions" ? library.sessions : library.lessons).length && <p>{busy ? "Loading..." : tab === "sessions" ? "No recorded sessions." : "No approved lessons."}</p>}
      </aside>
      <main>
        {editing && draft ? <form className="newt-lesson-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
          <label>Title<input aria-label="Lesson title" maxLength={100} value={draft.title} disabled={busy} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></label>
          <div className="newt-lesson-fields"><label>Kind<select aria-label="Lesson kind" value={draft.kind} disabled={busy} onChange={event => setDraft(value => ({ ...value, kind: event.target.value }))}>{lessonKinds.map(kind => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></label>
            <label>Scope<select aria-label="Lesson scope" value={draft.scope} disabled={busy} onChange={event => setDraft(value => ({ ...value, scope: event.target.value }))}><option value="project">This project</option><option value="personal">All my projects</option></select></label></div>
          <label>Guidance<textarea aria-label="Lesson guidance" maxLength={1800} rows={7} value={draft.guidance} disabled={busy} onChange={event => setDraft(value => ({ ...value, guidance: event.target.value }))} /></label>
          <label>Topics<input aria-label="Lesson topics" value={draft.tags} maxLength={450} disabled={busy} onChange={event => setDraft(value => ({ ...value, tags: event.target.value }))} /></label>
          {editing.approved && <label className="newt-learning-check"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={event => setDraft(value => ({ ...value, enabled: event.target.checked }))} />Enabled for new tasks</label>}
          <Evidence events={editing.approved ? editing.item.evidence : session.events.filter(event => editing.item.evidenceIds.includes(event.id))} />
          <div className="newt-learning-actions"><button type="submit" className="primary" disabled={busy || !draft.title.trim() || !draft.guidance.trim() || !draft.tags.trim()}>{editing.approved ? <Save size={15} /> : <Check size={15} />}{editing.approved ? "Save lesson" : "Approve lesson"}</button>
            <button type="button" disabled={busy} onClick={() => { if (mayLeave()) setEditing(null); }}>Cancel</button>
            {editing.approved && <button type="button" title="Delete lesson" aria-label="Delete lesson" disabled={busy} onClick={() => { if (window.confirm("Delete this lesson? Future tasks will no longer use it. Tasks already started keep their captured guidance.")) void act(async () => { await api("update", { projectId, expectedRevision: editing.item.revision, action: "delete" }, editing.item.id); setEditing(null); await readLibrary(); }); }}><Trash2 size={15} /></button>}
          </div>
          {editing.approved && !!editing.item.history?.length && <label>Previous versions<select aria-label="Restore lesson revision" value="" disabled={busy} onChange={event => { const revision = Number(event.target.value); if (revision && window.confirm(`Restore version ${revision}? Current guidance will remain in revision history.`)) void act(async () => { await api("update", { projectId, action: "restore", expectedRevision: editing.item.revision, restoreRevision: revision }, editing.item.id); await readLibrary(); setEditing(null); }); }}><option value="">Choose a version to restore</option>{editing.item.history.map(item => <option key={item.revision} value={item.revision}>Version {item.revision} · {item.title}</option>)}</select></label>}
        </form> : tab === "sessions" && session ? <>
          <div className="newt-learning-session-title"><h3>{session.title}</h3><button type="button" title="Delete session and its lessons" aria-label="Delete session" disabled={busy || learning.hasSession && learning.recording || session.analysis?.status === "running"} onClick={() => { if (window.confirm("Delete this recording AND the lessons approved from it? Media, projects and existing task history will not be deleted.")) void act(async () => { await api("delete", { projectId }, session.id); learning.forgetSession(session.id); setSession(null); await readLibrary(); }); }}><Trash2 size={16} /></button></div>
          <p className="newt-learning-meta">{session.events.length} observations · {learningRecap(session.events).canvases.join(", ") || "Project"}</p>
          {session.summary && <p>{session.summary}</p>}
          {!session.finished && <button type="button" disabled={busy || learning.hasSession} onClick={() => void act(async () => { await api("finish", { projectId }, session.id); await readSession(session.id); await readLibrary(); })}><Check size={15} />Finish session</button>}
          {session.finished && (!session.analysis || retryToken) && <button type="button" disabled={busy || learning.localOnly} title={learning.localOnly ? "AI suggestions are disabled while Local actions only is enabled in Newt." : "Request one paid text analysis"} onClick={() => {
            if (learning.localOnly || !window.confirm(`${retryToken ? "Try this saved recording again after the request-format rejection? Billing for the earlier request is unconfirmed. This is a new, potentially paid request. " : "Request one paid AI analysis? "}A bounded selection of recorded prompt text, settings and notes will be sent through your enabled Newt LLM provider. No images, screen recordings or files are sent. Cost varies and appears separately in History, outside the task budget. Suggestions still need your approval. This request is never automatically retried.`)) return;
            void act(async () => { try { const result = await api("analyze", { projectId, consent: true, localOnly: learning.localOnly, ...(retryToken ? { retryToken } : {}) }, session.id); if (alive.current) setSession(result); } finally { await readLibrary(); await readSession(session.id); } });
          }}><Sparkles size={15} />{retryToken ? "Try analysis again" : "Suggest lessons"}</button>}
          {["running", "interrupted"].includes(session.analysis?.status) && <p role="status">{session.analysis.status === "running" ? "Analysis was requested. Reload to check for results." : "Analysis was interrupted and may have been billed. Your recording is preserved; you can add your own takeaway."} It will not be submitted again.</p>}
          {session.analysis?.status === "failed" && <p className="newt-learning-error">{session.analysis.error}</p>}
          <div className="newt-learning-suggestions">{session.suggestions.filter(item => !item.dismissed).map(item => <div className="newt-learning-suggestion" key={item.id}><div><strong>{item.title}</strong><small>{item.source} · {labels[item.kind]}{approvedIds.has(item.id) ? " · Approved" : " · Not yet applied"}</small></div>
            <div className="newt-learning-actions"><button type="button" disabled={busy || approvedIds.has(item.id)} onClick={() => edit(item, false)}>Review</button>{!approvedIds.has(item.id) && <button type="button" title="Dismiss suggestion" aria-label={`Dismiss ${item.title}`} disabled={busy} onClick={() => void act(async () => { await api("dismiss", { projectId, suggestionId: item.id }, session.id); await readSession(session.id); })}><X size={15} /></button>}</div></div>)}</div>
          {session.finished && <form className="newt-learning-note" onSubmit={event => { event.preventDefault(); void act(async () => { await api("note", { projectId, id: crypto.randomUUID(), detail: note }, session.id); await readSession(session.id); setNote(""); }); }}><label>My takeaway<textarea aria-label="My takeaway" maxLength={1200} rows={3} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label><button type="submit" disabled={busy || !note.trim()}><Plus size={15} />Add lesson draft</button></form>}
          <details className="newt-learning-observations"><summary>Recorded observations ({session.events.length})</summary><Evidence events={session.events} /></details>
        </> : <p>{busy ? "Loading..." : tab === "lessons" ? "Select an approved lesson." : "Start Watch Me in Newt to record a session."}</p>}
      </main>
    </div>
    {busy && <div className="newt-learning-progress" role="status"><Loader2 size={15} className="newt-learning-spinner" />Working...</div>}
  </dialog>, document.body);
}

function Evidence({ events = [] }) {
  return <ol className="newt-learning-evidence">{events.map(event => <li key={event.id}>
    {event.asset && /\.(png|jpe?g|webp)$/i.test(event.asset) && <img src={displayMediaUrl(event.asset)} alt={`${event.title} reference`} loading="lazy" onError={e => { e.currentTarget.hidden = true; }} />}
    <div><small>{event.canvas} · {event.kind} · {event.title}</small><p>{event.detail}</p></div>
  </li>)}</ol>;
}

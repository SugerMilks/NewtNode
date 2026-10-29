import React from "react";
import { FileUp, FileText, Loader2, Plus, Check, RotateCcw, X, ExternalLink } from "lucide-react";
import { nodeApi } from "../api/newtApi.js";
import { appendWorkflowContextFormFields } from "../workflowContext.js";
import { normalizeStoryboardCameraPersonality } from "../storyboardCinematography.js";
import { scriptPagesLabel, scriptFileByteLimit, scriptPageWarning, validateScriptSelection, scriptImportBuildRequest, scriptImportFrames, mergeImportedScriptFrames, safeScriptUrl } from "../storyboardScriptImport.js";

export function StoryboardScriptSource({ source }) {
  if (!source) return null;
  return <details className="storyboard-script-source" onClick={event => event.stopPropagation()}>
    <summary><FileText size={13} />Source: {source.scene || source.title} · p. {scriptPagesLabel(source.pages)}</summary>
    {safeScriptUrl(source.url) && <a href={`${source.url}#page=${source.pages?.[0] || 1}`} target="_blank" rel="noreferrer">{source.fileName || "Source PDF"}<ExternalLink size={12} /></a>}
    <dl>{[["Dialogue", source.dialogue], ["Voiceover", source.voiceover], ["On-screen text", source.onScreenText], ["Timing", source.timing], ["Production notes", source.productionNotes]].filter(([, value]) => value).map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
  </details>;
}

export function StoryboardScriptImport({ node, frames, busy, workflowContext = {}, onUpdate, onApply, api = nodeApi }) {
  const state = node.data.storyboardScriptImport || {};
  const [working, setWorking] = React.useState("");
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  const fileInput = React.useRef(null), alive = React.useRef(true), pending = React.useRef(false), current = React.useRef();
  current.current = { state, frames, onUpdate, onApply, busy, cameraPersonality: node.data.storyboardCameraPersonality };
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => { setConfirmReplace(false); }, [frames, state.draft]);
  const update = patch => {
    if (!alive.current) return;
    const next = { ...current.current.state, ...patch };
    current.current.state = next;
    current.current.onUpdate({ storyboardScriptImport: next });
  };
  const document = state.document;
  const scripts = state.catalog?.scripts || [];
  const candidate = state.candidate !== "" && state.candidate != null ? scripts[Number(state.candidate)] : null;
  const locked = busy || Boolean(working);
  const request = extra => ({ ...workflowContext, nodeId: node.id, nodeTitle: node.data.title, ...extra });
  async function perform(label, action) {
    if (pending.current || current.current.busy) return;
    pending.current = true;
    setWorking(label); update({ error: "" });
    try { await action(); }
    catch (reason) { update({ error: reason.message }); }
    finally { pending.current = false; if (alive.current) setWorking(""); }
  }
  function applyDraft(draft, source, selection, replace = false) {
    if (!alive.current) return;
    if (current.current.busy) { update({ phase: "ready" }); return; }
    const imported = scriptImportFrames(draft, source, selection, () => `frame-${crypto.randomUUID()}`);
    let merged;
    try { merged = mergeImportedScriptFrames(current.current.frames, imported, replace ? "replace" : "append", replace && confirmReplace); }
    catch (reason) { update({ phase: "ready", error: reason.message }); return; }
    current.current.onApply(merged);
    update({ phase: "complete", draft: null, appliedTitle: draft.title, addedShots: imported.length, error: "" });
  }
  async function build(source, script, confirmed = false) {
    // Script limits apply to the detected script, never to the surrounding deck.
    try { validateScriptSelection(script.pages, source.pageCount, true); }
    catch (reason) { update({ phase: "blocked", error: reason.message }); return; }
    if (script.pages.length > scriptPageWarning && !confirmed) { update({ phase: "confirm-long" }); return; }
    const body = { ...scriptImportBuildRequest(source, script, confirmed), storyboardCameraPersonality: normalizeStoryboardCameraPersonality(current.current.cameraPersonality) };
    if (!alive.current || current.current.busy) return;
    setWorking("Building shot list"); update({ phase: "build" });
    const result = await api.storyboardScript("build", request(body));
    if (!alive.current) return;
    if (result.draft.needsNarrowing) {
      update({ phase: "blocked", error: result.draft.warnings.join(" ") || "This script needs a shorter scene or a clearer PDF before it can become a shot list." });
      return;
    }
    update({ draft: result.draft, draftSelection: body.selection, phase: "ready" });
    applyDraft(result.draft, source, body.selection);
  }
  async function selectScript(source, catalog, index) {
    const script = catalog.scripts[index];
    if (!script) return;
    update({ candidate: String(index), draft: null, phase: "build", appliedTitle: "", addedShots: 0, error: "" });
    await build(source, script);
  }
  async function discover(source) {
    if (!alive.current || current.current.busy) return;
    setWorking("Finding scripts"); update({ phase: "analyze" });
    const result = await api.storyboardScript("analyze", request({ url: source.url, digest: source.digest, allowPaidAnalysis: true }));
    if (!alive.current) return;
    update({ catalog: result.catalog, candidate: "", draft: null, phase: "choose" });
    if (result.catalog.scripts.length === 1) await selectScript(source, result.catalog, 0);
    else if (!result.catalog.scripts.length) update({ phase: "blocked", error: "No readable script was found in this PDF. Try a document containing the script itself." });
  }
  const upload = file => perform("Reading script", async () => {
    if (!file || !/\.pdf$/i.test(file.name) || file.size > scriptFileByteLimit) throw new Error("Choose a PDF no larger than 40 MB.");
    const form = new FormData(); form.append("asset", file);
    appendWorkflowContextFormFields(form, workflowContext);
    const result = await api.uploadAsset(form, "Script PDF upload");
    if (!result.response.ok) throw new Error(result.data.error || "PDF upload failed.");
    const url = result.data.asset.localUrl;
    if (!alive.current) return;
    const inspected = await api.storyboardScript("inspect", request({ url }));
    if (!alive.current) return;
    const source = { ...inspected, url, fileName: file.name };
    update({ document: source, catalog: null, candidate: "", draft: null, phase: "analyze", appliedTitle: "", addedShots: 0 });
    await discover(source);
  });
  const addPrepared = replace => perform("Adding shots", async () => applyDraft(state.draft, document, state.draftSelection, replace));
  const needsContinue = document && !working && !state.draft && !["complete", "blocked", "confirm-long"].includes(state.phase) && (!state.catalog || candidate || scripts.length === 1);
  const resume = () => perform("Reading script", async () => {
    if (!state.catalog) await discover(document);
    else await selectScript(document, state.catalog, candidate ? Number(state.candidate) : 0);
  });
  return <div className="storyboard-script-import" onPointerDown={event => event.stopPropagation()}>
    <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) upload(file); }} />
    <div className="storyboard-script-toolbar">
      <button type="button" disabled={locked} title="Import a PDF script and build its shot list using your enabled AI provider. Provider charges apply." onClick={() => fileInput.current?.click()}><FileUp size={14} />Import Script PDF</button>
      {working ? <span role="status"><Loader2 className="spin" size={14} />{working}...</span> : state.phase === "complete" ? <span role="status"><Check size={14} />{state.addedShots} shots added</span> : document && <span className="storyboard-script-filename" title={document.fileName}>{document.fileName}</span>}
      {needsContinue && <button type="button" disabled={locked} onClick={resume}><RotateCcw size={14} />{state.error ? "Retry import" : "Continue import"}</button>}
    </div>
    {scripts.length > 1 && <div className="storyboard-script-selection">
      <label>Choose a script<select aria-label="Choose a script" value={state.candidate ?? ""} disabled={locked} onChange={event => { const index = Number(event.target.value); if (event.target.value !== "") perform("Reading script", () => selectScript(document, state.catalog, index)); }}>
        <option value="" disabled>{scripts.length} scripts found</option>
        {scripts.map((script, index) => <option key={index} value={String(index)}>{script.title}{script.version ? ` · ${script.version}` : ""}{script.duration ? ` · ${script.duration}` : ""}</option>)}
      </select></label>
      {candidate && state.phase !== "complete" && <p>{candidate.summary}</p>}
    </div>}
    {state.phase === "confirm-long" && candidate && !working && <div className="storyboard-script-confirm">
      <p className="storyboard-script-notice">This script is {candidate.pages.length} pages. Scripts over 30 pages take longer and may cost more to process.</p>
      <div className="storyboard-script-toolbar"><button type="button" disabled={locked} onClick={() => perform("Building shot list", () => build(document, candidate, true))}><Check size={14} />Continue</button>
        <button type="button" disabled={locked} onClick={() => update({ phase: "blocked", error: "" })}><X size={14} />Cancel</button></div>
    </div>}
    {state.draft && !state.draft.needsNarrowing && !working && <div className="storyboard-script-confirm">
      <p>{state.draft.shots.length} shots ready. Your existing shot list is unchanged.</p>
      <div className="storyboard-script-toolbar">
        <button type="button" disabled={locked} onClick={() => addPrepared(false)}><Plus size={14} />Add shots</button>
        {!frames.some(frame => frame.protected) && <button type="button" disabled={locked} onClick={() => setConfirmReplace(true)}><RotateCcw size={14} />Replace shot list...</button>}
      </div>
      {confirmReplace && <div className="storyboard-script-confirm"><p>Replace all existing shots? Saved media will stay on disk.</p><div className="storyboard-script-toolbar">
        <button type="button" disabled={locked} onClick={() => addPrepared(true)}><Check size={14} />Confirm replacement</button>
        <button type="button" disabled={locked} onClick={() => setConfirmReplace(false)}><X size={14} />Cancel</button>
      </div></div>}
    </div>}
    {state.error && <p className="upload-error" role="alert">{state.error}</p>}
  </div>;
}

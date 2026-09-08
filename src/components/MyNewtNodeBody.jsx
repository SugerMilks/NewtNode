import { Check, Pause, Play, Plus, RefreshCw, Send, ShieldCheck, Square, Trash2, Undo2, Unlock, X } from "lucide-react";
import { NodeRow } from "./NodePorts.jsx";
import { myNewtSettings } from "../myNewt/contract.js";
import { myNewtIntelligenceLevels, myNewtReasoningModes } from "../myNewt/intelligence.js";
import { useMyNewtVoice } from "../myNewt/useMyNewtVoice.js";
import { applyMyNewtVoiceTranscript } from "../myNewt/voiceCommands.js";
import { useRef, useState } from "react";
import { MyNewtVoiceButton } from "./MyNewtVoiceButton.jsx";
import { MyNewtTaskDetails } from "./MyNewtTaskDetails.jsx";
import { newtPresetDisplayName } from "../myNewt/presets.js";
import { MyNewtRemoteSettings } from "./MyNewtRemoteSettings.jsx";
import { imageModelOptions, videoModelOptions } from "../modelOptions.js";

export function MyNewtNodeBody({ node, config, incoming, onUpdate, onConnectStart, onDisconnectInput, connectedPortKeys, controller }) {
  const [voiceMessage, setVoiceMessage] = useState({ scope: "", text: "" });
  const voiceDraft = useRef(null);
  const note = node.data.myNewtNote || "";
  const setNote = (value) => {
    const next = typeof value === "function" ? value(voiceDraft.current.note) : value;
    voiceDraft.current.note = next;
    onUpdate(node.id, { myNewtNote: next });
  };
  const { job, error, busy, control, presets, projectId, projectName, history = [], selectTask, focusNode, localPreview, protectedNodes = [], releaseProtection } = controller || {};
  const selectedPreset = presets?.items.find((item) => item.id === presets.selectedId);
  const summary = job?.id === node.data.jobId && job?.nodeId === node.id ? job : node.data.myNewtSummary;
  const status = summary?.status || "ready";
  const terminal = !node.data.jobId || ["complete", "stopped"].includes(status);
  const completedBrief = job?.status === "complete" && node.data.brief?.trim() === job.brief?.trim();
  const voiceScope = JSON.stringify([projectId, node.id, node.data.jobId, terminal]);
  voiceDraft.current = { scope: voiceScope, note };
  const running = status === "running";
  const settings = myNewtSettings(node.data);
  const intelligenceIndex = myNewtIntelligenceLevels.findIndex((level) => level.value === settings.intelligence);
  const patch = (value) => onUpdate(node.id, value);
  const voice = useMyNewtVoice({
    scope: voiceScope,
    context: { projectId, projectName, nodeId: node.id },
    disabled: busy || settings.localOnly,
    onTranscript: (text) => {
      const target = terminal && !job ? "brief" : "note";
      void applyMyNewtVoiceTranscript({ transcript: text, current: target === "brief" ? node.data.brief : note,
        target, terminal, busy, control, setDraft: (value) => target === "brief" ? patch({ brief: value }) : setNote(value),
        clearDraft: (expected) => { if (voiceDraft.current.scope === voiceScope && voiceDraft.current.note === expected) setNote(""); }
      }).then((text) => setVoiceMessage({ scope: voiceScope, text })).catch((err) => setVoiceMessage({ scope: voiceScope, text: err.message || "Direction saved. Could not submit the task." }));
    }
  });
  return <div className="node-body my-newt-body">
    {presets && <div className="my-newt-presets">
      <label htmlFor={`${node.id}-preset`} title="Insert a saved workflow without LLM calls or automatic generation.">Preset Workflow</label>
      <div className="my-newt-preset-controls">
        <select id={`${node.id}-preset`} aria-label="Newt preset" value={presets.selectedId} disabled={presets.busy} onChange={(event) => presets.select(event.target.value)}>
          <option value="">{presets.items.length ? "Select preset" : "No saved presets"}</option>
          {presets.items.map((preset) => <option key={preset.id} value={preset.id}>{newtPresetDisplayName(preset)}</option>)}
        </select>
        <button className="my-newt-icon" title="Insert preset" aria-label="Insert Newt Preset" disabled={!presets.selectedId || presets.busy || busy || running} onClick={presets.insert}><Plus size={15} /></button>
        <button className="my-newt-icon" title={selectedPreset?.isSystem ? "System presets cannot be deleted" : "Delete user preset"} aria-label="Delete Newt Preset" disabled={selectedPreset?.isSystem !== false || presets.busy} onClick={presets.remove}><Trash2 size={15} /></button>
        {presets.error && <button className="my-newt-icon" title="Reload presets" aria-label="Reload Newt Presets" disabled={presets.busy} onClick={presets.refresh}><RefreshCw size={15} /></button>}
      </div>
      {(selectedPreset?.slots || []).map((slot) => <label className="my-newt-preset-binding" key={slot.nodeId}><span>{slot.label} ({slot.role})</span><select aria-label={`Preset input ${slot.label}`} disabled={presets.busy || running} value={presets.bindings[slot.nodeId] || ""} onChange={(event) => presets.bind(slot.nodeId, event.target.value)}><option value="">Saved asset</option>{presets.candidates.filter((item) => item.type === slot.type).map((item) => <option key={item.id} value={item.id}>{item.data?.characterName || item.data?.title || slot.role}</option>)}</select></label>)}
      {presets.error && !presets.draft && <p className="my-newt-message error" role="alert">{presets.error}</p>}
    </div>}
    {!!history.length && <label className="my-newt-history">Task history<select aria-label="Newt task history" value={node.data.jobId || ""} disabled={busy || !terminal} onChange={(event) => selectTask(event.target.value)}><option value="">New task</option>{history.map((item) => <option key={item.id} value={item.id}>{new Date(item.startedAt).toLocaleDateString()} - {item.brief.slice(0, 80)}</option>)}</select></label>}
    <div className="my-newt-brief"><textarea aria-label="Newt brief" placeholder="What would you like to create?" value={node.data.brief || ""} onChange={(event) => patch({ brief: event.target.value })} readOnly={!terminal} />{terminal && !job && !settings.localOnly && <MyNewtVoiceButton voice={voice} disabled={busy} />}</div>
    {terminal && !completedBrief && localPreview?.route === "blocked" && <p className="my-newt-message error" role="status">{localPreview.error}</p>}
    {(voice.active || voice.error) && <div className="my-newt-voice-status"><p className={`my-newt-message${voice.error ? " error" : ""}`} role={voice.error ? "alert" : "status"}>{voice.error || (voice.phase === "requesting" ? "Waiting for microphone..." : voice.phase === "recording" ? "Listening..." : "Transcribing...")}</p>{voice.active && <button type="button" className="my-newt-icon" title="Cancel dictation" aria-label="Cancel dictation" onClick={voice.cancel}><X size={15} /></button>}</div>}
    {!voice.active && voiceMessage.scope === voiceScope && voiceMessage.text && <p className="my-newt-message" role="status">{voiceMessage.text}</p>}
    <div className="my-newt-inputs">{config.input.map((port) => <NodeRow key={port.id} node={node} inputPort={port} label={port.label} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}><span className="my-newt-asset-label" title={(incoming[port.id] || []).map((item) => item.source?.data?.characterName || item.source?.data?.title || "Asset").join(", ")}>{(incoming[port.id] || []).map((item) => item.source?.data?.characterName || item.source?.data?.title || "Asset").join(", ") || "0"}</span></NodeRow>)}</div>
    <MyNewtTaskDetails job={job} focusNode={focusNode} />
    <div className="my-newt-controls">
      {terminal ? <button className="node-run" disabled={busy || voice.active || !node.data.brief?.trim() || localPreview?.route === "blocked"} onClick={() => control("start")}><Play size={15} />Start task</button>
        : running ? <button className="node-run" disabled={busy} onClick={() => control("pause")}><Pause size={15} />Pause</button>
          : <button className="node-run" disabled={busy || voice.active || !job || (status === "approval" && !job.pending?.preview && !note.trim())} onClick={async () => { if (await control(status === "plan-approval" ? "approve-plan" : status === "approval" ? "approve" : "resume", note)) setNote(""); }}>{["approval", "plan-approval"].includes(status) ? <Check size={15} /> : <Play size={15} />}{note.trim() ? "Update direction" : status === "plan-approval" ? "Approve plan" : status === "approval" ? "Approve run" : "Resume"}</button>}
      {!terminal && <button className="my-newt-icon" title="Stop task" aria-label="Stop Newt task" disabled={busy} onClick={() => control("stop")}><Square size={15} /></button>}
      {error && !job && node.data.jobId && <button className="my-newt-icon" title="Clear unavailable task connection" aria-label="Clear unavailable Newt task" onClick={() => patch({ jobId: "", myNewtSummary: null })}><RefreshCw size={15} /></button>}
      {job?.checkpoint && !running && <button className="my-newt-icon" title={`Restore checkpoint: ${job.checkpoint.name}`} aria-label="Restore task checkpoint" disabled={busy} onClick={() => control("restore")}><Undo2 size={15} /></button>}
    </div>
    {(error || summary?.message) && <p className={error ? "my-newt-message error" : "my-newt-message"} role="status">{error || summary.message}</p>}
    {(!terminal || job) && <div className="my-newt-note"><textarea aria-label="Newt additional direction" placeholder={terminal ? "Continue this task..." : "Add a note..."} value={note} onChange={(event) => setNote(event.target.value)} />{!settings.localOnly && <MyNewtVoiceButton voice={voice} disabled={busy} />}<button className="my-newt-icon" title={terminal ? "Continue task with a new budget allowance" : "Send note"} aria-label={terminal ? "Continue Newt task" : "Send Newt note"} disabled={busy || voice.active || !note.trim()} onClick={async () => { if (await control(terminal ? "continue" : "note", note)) setNote(""); }}><Send size={15} /></button></div>}
    <details><summary>Settings</summary><div className="my-newt-settings">
      <MyNewtRemoteSettings remote={controller?.remote} />
      {!!protectedNodes.length && <div className="my-newt-approved" aria-label="Approved work">
        <strong>Approved work</strong>
        {protectedNodes.map((item) => <div key={item.id} className="my-newt-approved-row">
          <ShieldCheck size={15} aria-hidden="true" />
          <span title={item.data.title || item.type}>{item.data.title || item.type}</span>
          <button type="button" className="my-newt-icon" title="Release protection from Newt" aria-label={`Release protection for ${item.data.title || item.type}`} disabled={busy || !["ready", "paused", "waiting", "complete", "stopped"].includes(status)} onClick={() => releaseProtection(item.id)}><Unlock size={15} /></button>
        </div>)}
      </div>}
      <label title="Only exact local shortcuts may run. Unsupported or creative requests stay in the draft; no paid AI fallback."><input type="checkbox" checked={settings.localOnly} onChange={(event) => patch({ localOnly: event.target.checked })} />Local actions only</label>
      <label>Reasoning mode<select aria-label="Newt reasoning mode" value={settings.reasoningMode} title="Auto uses Luna for clearly routine tasks and Astra for complex creative work. Economy stays on Luna. Best uses Astra. Media generation settings are unchanged." onChange={(event) => patch({ reasoningMode: event.target.value })}>{myNewtReasoningModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
      {job?.profile && <div className="my-newt-model" title={job.profile.reason}>{job.profile.model} - {job.profile.effort}</div>}
      <label className="my-newt-intelligence" htmlFor={`${node.id}-intelligence`}>
        <span>Creative reasoning <output>{myNewtIntelligenceLevels[intelligenceIndex].label}</output></span>
        <input id={`${node.id}-intelligence`} aria-label="Newt intelligence" type="range" min="0" max="4" step="1" value={intelligenceIndex} disabled={settings.reasoningMode === "economy"} aria-valuetext={myNewtIntelligenceLevels[intelligenceIndex].label} title="Astra reasoning effort. Routine Economy operations use Luna Medium. Image/video quality settings remain unchanged." onChange={(event) => patch({ intelligence: myNewtIntelligenceLevels[Number(event.target.value)].value })} />
      </label>
      {[["allowExisting", "Edit existing nodes"], ["allowImages", "Generate images"], ["allowVideos", "Generate videos"], ["allowMediaInspection", "Inspect attached media"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => patch({ [key]: event.target.checked })} />{label}</label>)}
      <label>Estimated budget ($)<input aria-label="Newt budget" type="number" min="0.25" max="1000" step="0.25" value={settings.budget} onChange={(event) => patch({ budget: Number(event.target.value) })} /></label>
      <label>Step limit<input type="number" min="1" max="100" value={settings.maxSteps} onChange={(event) => patch({ maxSteps: Number(event.target.value) })} /></label>
      <label>Time limit (minutes)<input type="number" min="1" max="240" value={settings.maxMinutes} onChange={(event) => patch({ maxMinutes: Number(event.target.value) })} /></label>
      <details className="my-newt-advanced"><summary>Advanced</summary><div className="my-newt-review-settings">
        {[["favoriteImageModel", "Favorite image model", imageModelOptions, controller?.modelOptions?.image], ["favoriteVideoModel", "Favorite video model", videoModelOptions, controller?.modelOptions?.video]].map(([key, label, models, enabledModels = models]) => <label className="my-newt-favorite-model" key={key} title="Preferred for new compatible nodes only. Existing nodes, workflow presets, and explicitly requested models stay unchanged.">
          <span>{label}</span><select aria-label={label} value={settings[key]} onChange={(event) => patch({ [key]: event.target.value })}>
            <option value="">No preference</option>
            {models.map((model) => <option key={model} value={model} disabled={!enabledModels.includes(model)}>{model}{enabledModels.includes(model) ? "" : " (disabled)"}</option>)}
          </select>
        </label>)}
        <label title="Automatically proceed through plans and runs within your budget and permissions. Missing requirements and uncertain provider charges still pause the task."><input type="checkbox" checked={settings.autoReview} onChange={(event) => patch({ autoReview: event.target.checked })} />Auto Review</label>
        {[["approvePlan", "Approve workflow plan"], ["approveRuns", "Approve each node run"]].map(([key, label]) => <label key={key} className={settings.autoReview ? "my-newt-review-disabled" : undefined}><input type="checkbox" checked={!settings.autoReview && settings[key]} disabled={settings.autoReview} onChange={(event) => patch({ [key]: event.target.checked })} />{label}</label>)}
      </div></details>
    </div></details>
    {!!job?.activity?.length && <details><summary>Activity ({job.steps} steps)</summary><ol className="my-newt-activity">{job.activity.map((item) => <li key={item.id}><time>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{item.text}</li>)}</ol></details>}
  </div>;
}

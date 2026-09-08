import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Circle, Link, LogOut, Pause, Play, RefreshCw, Send, Square } from "lucide-react";
import "./remote.css";

const money = (value) => Number.isFinite(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value) : "Not priced";
async function request(path, body, csrf) {
  const response = await fetch(`/remote-api/${path}`, {
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json", "X-Newt-Remote": "1", ...(csrf ? { "X-Newt-CSRF": csrf } : {}) }, body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000), credentials: "same-origin", cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Remote request failed (${response.status}).`), { status: response.status });
  return data;
}

export function MyNewtRemotePage() {
  const [state, setState] = useState(null);
  const [pair, setPair] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("My phone");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(null); pendingRef.current = pending;
  const refreshing = useRef(false);
  const [connected, setConnected] = useState(false);
  const projectConnection = useRef(null);
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await request("status");
      if (projectConnection.current !== null && projectConnection.current !== next.connectionId) {
        setDraft(""); setPending(null); pendingRef.current = null; setError("");
      }
      projectConnection.current = next.connectionId;
      setState(next); setPair(false); setConnected(true); setConnectionError("");
      const receipt = next.commands.find((item) => item.id === pendingRef.current?.id);
      if (receipt && !["queued", "delivered"].includes(receipt.status)) {
        if (receipt.status === "accepted") { const original = pendingRef.current?.draft; setDraft((value) => value === original ? "" : value); setError(""); }
        else setError(receipt.message || "The command was not completed. Review task progress.");
        setPending(null);
      }
    } catch (err) {
      setConnected(false);
      if (err.status === 401) { setPair(true); setState(null); setPending(null); setConnectionError(""); }
      else setConnectionError(err.message);
    } finally { refreshing.current = false; }
  }
  useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, []);
  async function pairDevice(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await request("pair", { code, name }); setCode(""); await refresh(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function command(action) {
    if (busy || pending || state?.requiresConfirmation || !state?.connectionId) return;
    setBusy(true); setError("");
    const note = ["start", "continue", "note"].includes(action) ? draft.trim() : "";
    const id = crypto.randomUUID();
    setPending({ id, draft: note ? draft : "" });
    try {
      await request("command", { id, connectionId: state.connectionId, budget: state.budget, action, note, jobId: state.job?.id || "", version: state.job?.controlVersion || "" }, state.csrf);
      await refresh();
    } catch (err) {
      if (err.status) setPending(null);
      setError(err.status ? err.message : "Command delivery is uncertain. Check task activity before sending anything again. No automatic retry will occur.");
    } finally { setBusy(false); }
  }
  async function connectProject() {
    if (busy || !state?.online) return;
    setBusy(true); setError("");
    try { await request("connect", { connectionId: state.connectionId }, state.csrf); await refresh(); }
    catch (err) { setError(err.message); await refresh(); }
    finally { setBusy(false); }
  }
  const job = state?.job;
  const terminal = !job || ["complete", "stopped"].includes(job.status);
  const awaiting = !!pending || state?.commands.some((item) => ["queued", "delivered"].includes(item.status));
  const disabled = busy || !connected || !state?.online || state?.requiresConfirmation || !state?.connectionId || awaiting;
  const preview = job?.pending?.preview;
  return <main>
    <header><img src="/newt-mark.png" alt="" /><h1>Newt <span>Remote</span></h1><button className="icon" title="Refresh task" aria-label="Refresh task" onClick={refresh}><RefreshCw size={19} /></button>{state && <button className="icon" title="Forget this device" aria-label="Forget this device" onClick={async () => { try { await request("logout", {}, state.csrf); setState(null); setPair(true); setPending(null); setDraft(""); } catch (err) { setError(err.message); } }}><LogOut size={19} /></button>}</header>
    {(error || connectionError) && <p className="error" role="alert">{error || connectionError}</p>}
    {pair ? <form className="pair" onSubmit={pairDevice}>
      <h2>Pair Device</h2>
      <p className="message">Trusted on this Mac for 30 days.</p>
      <label>Device name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label>
      <label>Pairing code<input value={code} maxLength={100} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} required /></label>
      <button className="primary" disabled={busy || !code.trim()}><Link size={18} />Pair with home editor</button>
    </form> : !state ? <p role="status">Connecting to home...</p> : <>
      <section className="project"><div><h2>{state.projectName || "No open project"}</h2><p className={connected && state.online ? "online" : "offline"}><Circle size={10} fill="currentColor" />{connected && state.online ? "Home editor online" : "Home editor offline"}</p></div><span className="task-status">{state.requiresConfirmation ? "Confirm project" : !state.connectionId ? "Waiting" : job?.status?.replaceAll("-", " ") || "Ready"}</span></section>
      {!state.connectionId ? <p className="message" role="status">Waiting for an open project with Newt.</p> : state.requiresConfirmation ? <section className="project-confirmation">
        <h3>Connect to {state.projectName || "this project"}?</h3>
        <p className="estimate">Task budget: {money(state.budget)}</p>
        <button className="primary" disabled={busy || !connected || !state.online} onClick={connectProject}><Link size={18} />Connect to this project</button>
      </section> : <>
      <dl className="costs"><div><dt>Budget</dt><dd>{money(job?.budget ?? state.budget)}</dd></div><div><dt>Spent</dt><dd>{money(job?.spent ?? 0)}</dd></div><div><dt>Reserved</dt><dd>{money(job?.reserved ?? 0)}</dd></div><div><dt>Remaining</dt><dd>{money(job?.remaining ?? state.budget)}</dd></div></dl>
      {job && <section className="task"><h3>Current Task</h3><p>{job.brief}</p>{job.message && <p className="message" role="status">{job.message}</p>}</section>}
      {job?.plan && <section><h3>Workflow Plan</h3><p>{job.plan.summary}</p><ol className="steps">{job.plan.steps.map((step) => <li key={step.id}>{step.status === "complete" ? <Check size={16} /> : <Circle size={14} />}<span>{step.title}</span></li>)}</ol><p className="estimate">{job.execution === "local" ? "Local action: $0.00" : `Media estimate: ${money(job.plan.estimatedGenerationCost)} + reasoning usage`}</p></section>}
      {preview && <section><h3>Next Generation</h3><strong>{preview.title}</strong><p>{[preview.model, preview.provider, preview.count ? `${preview.count} output${preview.count === 1 ? "" : "s"}` : "", preview.resolution, preview.aspectRatio, preview.duration, preview.audio].filter(Boolean).join(" | ")}</p>
        {!!preview.references.length && <ul>{preview.references.map((label, index) => <li key={index}>{label}</li>)}</ul>}
        <p className="estimate">Estimated run: {preview.upperBound ? "up to " : ""}{money(preview.estimatedCost)}{preview.additionalUsage ? " + additional usage" : ""}</p>
        {preview.prompt && <details><summary>Prompt</summary><p>{preview.prompt}</p></details>}
      </section>}
      {!terminal && <div className="actions">
        {job.status === "plan-approval" && <button className="primary" disabled={disabled} onClick={() => command("approve-plan")}><Check size={18} />Approve plan</button>}
        {job.status === "approval" && <button className="primary" disabled={disabled || !preview} onClick={() => command("approve")}><Check size={18} />Approve run{preview?.estimatedCost != null ? ` (${money(preview.estimatedCost)})` : ""}</button>}
        {["paused", "waiting"].includes(job.status) && <button className="primary" disabled={disabled} onClick={() => command("resume")}><Play size={18} />Resume</button>}
        {job.status === "running" && <button disabled={disabled} onClick={() => command("pause")}><Pause size={18} />Pause</button>}
        <button disabled={disabled} onClick={() => command("stop")}><Square size={17} />Stop</button>
      </div>}
      {awaiting && <p className="message" role="status">Waiting for home acknowledgement...</p>}
      {pending && connected && error && !state.commands.some((item) => item.id === pending.id) && <button onClick={() => { if (window.confirm("Confirm you have checked the current task and activity. Clearing this notice does not cancel a command that may already have arrived.")) { setPending(null); setError(""); } }}>Clear pending notice</button>}
      <section className="direction"><label htmlFor="direction">{terminal ? "New direction" : "Additional direction"}</label><textarea id="direction" value={draft} maxLength={16000} rows={4} placeholder={terminal ? "What would you like to create?" : "Add a revision or answer..."} onChange={(event) => setDraft(event.target.value)} />
        {terminal && <p className="estimate">Next task budget: {money(state.budget)}</p>}
        <div className="actions"><button className="primary" disabled={disabled || !draft.trim()} onClick={() => command(terminal ? job ? "continue" : "start" : "note")}><Send size={18} />{terminal ? job ? "Continue task" : "Start task" : "Send direction"}</button>{terminal && job && <button disabled={disabled || !draft.trim()} onClick={() => command("start")}><Play size={18} />New task</button>}</div>
      </section>
      {!!job?.outputs?.length && <section><h3>Results</h3><div className="results">{job.outputs.map((output, index) => <figure key={index}>{output.mediaUrl && (output.mediaType === "video" ? <video controls preload="metadata" src={output.mediaUrl} /> : output.mediaType === "audio" ? <audio controls preload="metadata" src={output.mediaUrl} /> : <a href={output.mediaUrl} target="_blank" rel="noreferrer"><img src={output.mediaUrl} alt={output.label} loading="lazy" /></a>)}<figcaption>{output.label}</figcaption>{output.text && <p>{output.text}</p>}</figure>)}</div></section>}
      {!!state.commands.length && <details><summary>Remote Commands</summary><ul>{state.commands.slice().reverse().map((item) => <li key={item.id}><strong>{item.action}: {item.status}</strong>{item.message && <p>{item.message}</p>}</li>)}</ul></details>}
      {!!job?.activity.length && <details><summary>Task Activity</summary><ol className="activity">{job.activity.slice().reverse().map((item) => <li key={item.id}><time>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><p>{item.text}</p></li>)}</ol></details>}
      </>}
    </>}
  </main>;
}

createRoot(document.getElementById("root")).render(<MyNewtRemotePage />);

import { useEffect, useRef, useState } from "react";
import { newtLearningApi } from "../api/newtApi.js";
import { LearningRecorder } from "./learningRecorder.js";
import { learningText } from "./learning.js";

const keyFor = id => `newt-learning-outbox-v1:${id}`;
export function useNewtLearning({ projectId, projectName, nodes, edges, canvases, activeCanvasId, selectedNodeIds, agentBusy, available = true, localOnly = false, api = newtLearningApi }) {
  const [, redraw] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(false), [dialog, setDialog] = useState(false), [reviewId, setReviewId] = useState("");
  const recorder = useRef(null), live = useRef(null), operation = useRef(false), mounted = useRef(true);
  live.current = { projectId, projectName, nodes, edges, canvases, activeCanvasId, selectedNodeIds, agentBusy, available };
  const changed = () => { if (mounted.current) redraw(value => value + 1); };
  const attach = session => new LearningRecorder({ session, send: api,
    persist: value => { sessionStorage.setItem(keyFor(session.projectId), JSON.stringify(value)); }, onChange: changed });
  const report = (cause, current = recorder.current) => {
    if (current) { current.recording = false; try { current.save(); } catch { /* Preserve the in-memory outbox if browser storage is full. */ } }
    if (mounted.current && (!current || current === recorder.current)) setError(cause.message || "Could not save observations. Recording is paused; retry before closing this project.");
  };
  const suspend = current => {
    current.recording = false;
    try { current.save(); void current.flush().catch(cause => report(cause, current)); }
    catch (cause) { report(cause, current); }
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (recorder.current) recorder.current.recording = false; };
  }, []);
  useEffect(() => {
    const old = recorder.current;
    if (old) { old.recording = false; void old.flush().catch(() => {}); }
    recorder.current = null; setError(""); setDialog(false); setReviewId("");
    try {
      const saved = JSON.parse(sessionStorage.getItem(keyFor(projectId)) || "null");
      if (saved?.projectId === projectId && saved.id) recorder.current = attach(saved);
    } catch { setError("The local recording buffer could not be restored. Saved sessions are still in the learning library."); }
    changed();
    // A project switch never starts or resumes observation.
  }, [projectId]);
  useEffect(() => {
    const current = recorder.current;
    if (!current?.recording) return;
    if (agentBusy || !available) {
      suspend(current); return;
    }
    const timer = setTimeout(() => {
      if (current !== recorder.current || !current.recording) return;
      try { current.observe(live.current); void current.flush().catch(cause => report(cause, current)); }
      catch (cause) { report(cause, current); }
    }, 700);
    return () => clearTimeout(timer);
  }, [nodes, edges, canvases, agentBusy, available]);
  useEffect(() => {
    const visibility = () => {
      const current = recorder.current;
      if (document.hidden && current?.recording) suspend(current);
    };
    const unload = event => { if (recorder.current?.recording || recorder.current?.pending.length) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("beforeunload", unload);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("beforeunload", unload); };
  }, []);
  const act = async fn => {
    if (operation.current) return false;
    operation.current = true; setBusy(true); setError(""); const owner = projectId;
    try { await fn(owner); return true; }
    catch (cause) { if (live.current.projectId === owner) report(cause); return false; }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  };
  const start = () => act(async owner => {
    if (!available || agentBusy) throw new Error("Finish or pause Newt's task before recording your own work.");
    const existing = recorder.current;
    if (existing) {
      await existing.flush();
      const saved = await api("get", { projectId: owner }, existing.session.id);
      if (saved.finished) { sessionStorage.removeItem(keyFor(owner)); recorder.current = null; throw new Error("This session has already finished. Start a new recording."); }
      if (live.current.projectId === owner && !live.current.agentBusy && live.current.available && !document.hidden) existing.start(live.current);
      return;
    }
    if (!window.confirm("Watch Me records creative settings, prompt changes, connections, result references and your notes inside this project. No screen, microphone, other apps or credentials are recorded. It stays local unless you request AI suggestions. Nothing is learned permanently without your approval. Start recording?")) return;
    const session = { id: crypto.randomUUID(), projectId: owner, projectName: learningText(projectName, 100), title: `${learningText(projectName, 65) || "Project"} - ${new Date().toLocaleDateString()}` };
    await api("create", session);
    if (live.current.projectId !== owner || !mounted.current || live.current.agentBusy || !live.current.available || document.hidden) return;
    const current = attach(session); recorder.current = current; current.start(live.current);
    current.add(current.baseline.nodes.slice(0, 40).map(node => ({ id: crypto.randomUUID(), at: Date.now(), kind: "context", nodeType: node.type,
      title: node.title, canvas: node.canvas, detail: `Existing at session start: ${JSON.stringify(node.inputs)}`, asset: node.selectedUrl })));
    current.add(current.baseline.edges.slice(0, 40).map(edge => ({ id: crypto.randomUUID(), at: Date.now(), kind: "context", nodeType: edge.type,
      title: edge.to, canvas: edge.canvas, detail: `Existing connection: ${edge.from} -> ${edge.to} (${edge.port})` })));
    await current.flush(); changed();
  });
  const pause = () => act(async () => {
    const current = recorder.current; if (!current) return;
    try { if (current.recording) current.observe(live.current); } finally { current.pause(); }
    await current.flush();
  });
  const finish = () => act(async owner => {
    const current = recorder.current; if (!current) return;
    try { if (current.recording && !live.current.agentBusy) current.observe(live.current); } finally { current.pause(); }
    await current.flush(); await api("finish", { projectId: owner }, current.session.id);
    sessionStorage.removeItem(keyFor(owner));
    if (live.current.projectId === owner) { recorder.current = null; setReviewId(current.session.id); setDialog(true); changed(); }
  });
  const remember = text => act(async () => {
    const current = recorder.current; if (!current) throw new Error("Start a Watch Me session first.");
    const selected = live.current.nodes.filter(node => live.current.selectedNodeIds.includes(node.id) && node.type !== "myNewt");
    current.note(text, selected.length === 1 ? selected[0] : null, live.current.canvases.find(canvas => canvas.id === live.current.activeCanvasId)?.name);
    await current.flush();
  });
  const forgetSession = id => {
    if (recorder.current?.session.id === id) { recorder.current = null; sessionStorage.removeItem(keyFor(projectId)); changed(); }
  };
  return { projectId, busy, error, localOnly, recording: !!recorder.current?.recording, hasSession: !!recorder.current,
    count: (recorder.current?.count || 0) + (recorder.current?.pending.length || 0), start, pause, finish, remember, api, forgetSession,
    canStart: available && !agentBusy, dialog, reviewId, open: () => setDialog(true), close: () => setDialog(false) };
}

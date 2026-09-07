import { useEffect, useRef, useState } from "react";
import { myNewtApi } from "../api/newtApi.js";
import { myNewtInputSignature, myNewtLocalActionSignature, myNewtSettings, myNewtSnapshot, snapshotAssetUrls, validateMyNewtPatch } from "./contract.js";
import { withMyNewtRequestScope } from "./requestScope.js";
import { notifyGenerationTaskComplete } from "../generationChime.js";
import { createMyNewtCompletionTracker, MY_NEWT_BURST_MS, myNewtTaskKey } from "./completion.js";
import { myNewtCheckpoint, restoreMyNewtCheckpoint } from "./recovery.js";
import { myNewtLocalAction, validateLocalUpdate } from "./localActions.js";

export function useMyNewt(adapter) {
  const live = useRef(adapter); live.current = adapter;
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const controlling = useRef(false);
  const [completionBurst, setCompletionBurst] = useState("");
  const completionTracker = useRef(createMyNewtCompletionTracker());
  const clientId = useRef(crypto.randomUUID());
  const executing = useRef(null);
  const agent = adapter.nodes.find((node) => node.type === "myNewt");
  const jobId = agent?.data.jobId || "";
  const identity = { projectId: adapter.projectId, nodeId: agent?.id };
  const taskKey = myNewtTaskKey({ ...identity, id: jobId });
  useEffect(() => {
    const currentTask = { ...identity, id: jobId };
    if (myNewtTaskKey(job) === taskKey) currentTask.status = job?.status;
    if (completionTracker.current(currentTask)) {
      notifyGenerationTaskComplete();
      setCompletionBurst(taskKey);
    }
  }, [job, taskKey]);
  useEffect(() => {
    if (!completionBurst) return;
    const timer = setTimeout(() => setCompletionBurst(""), MY_NEWT_BURST_MS);
    return () => clearTimeout(timer);
  }, [completionBurst]);
  const snapshot = () => myNewtSnapshot({ ...live.current.getGraph(), projectId: live.current.projectId, projectName: live.current.projectName, catalog: live.current.catalog, presets: live.current.presets });
  const settingsKey = JSON.stringify(myNewtSettings(agent?.data));
  const localPreview = myNewtLocalAction(agent?.data.brief, { ...adapter.getGraph(), catalog: adapter.catalog, presets: adapter.presets }, agent?.data);
  useEffect(() => {
    if (!jobId || !agent) return;
    const timer = setTimeout(() => {
      myNewtApi.control(jobId, { ...identity, action: "settings", settings: JSON.parse(settingsKey) }).then(accept).catch((err) => setError(err.message));
    }, 400);
    return () => clearTimeout(timer);
  }, [jobId, agent?.id, adapter.projectId, settingsKey]);

  function accept(next, starting = false) {
    const current = live.current.nodes.find((node) => node.type === "myNewt");
    if (current?.id !== next.nodeId || live.current.projectId !== next.projectId) return;
    if (!starting && current.data.jobId !== next.id) return;
    setJob((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    const summary = { status: next.status, message: next.message, spent: next.spent, reserved: next.reserved, steps: next.steps };
    if (JSON.stringify(current.data.myNewtSummary) !== JSON.stringify(summary)) live.current.update(current.id, { myNewtSummary: summary });
  }

  useEffect(() => {
    let cancelled = false;
    if (!agent) { setHistory([]); return; }
    myNewtApi.history(identity).then((items) => { if (!cancelled) setHistory(items); }).catch(() => {});
    return () => { cancelled = true; };
  }, [adapter.projectId, agent?.id, jobId, job?.status]);

  useEffect(() => {
    setJob(null); setError("");
    if (!jobId || !agent) return;
    let cancelled = false, syncing = false, timer, lastSnapshot = "";
    const owner = { projectId: adapter.projectId, nodeId: agent.id };
    const tick = async () => {
      if (syncing || cancelled) return;
      syncing = true;
      try {
        const graph = snapshot(), serialized = JSON.stringify(graph);
        let next = await myNewtApi.sync(jobId, { ...owner, ...(serialized !== lastSnapshot ? { snapshot: graph } : {}), clientId: clientId.current,
          actionId: executing.current?.actionId || "" });
        lastSnapshot = serialized;
        if (cancelled) return;
        accept(next);
        if (next.pending?.operation === "run" && !next.pending.preview && !next.pending.claimed) {
          const target = live.current.getGraph().nodes.find((node) => node.id === next.pending.payload.nodeId);
          if (!target) throw new Error("The planned node no longer exists.");
          const preview = live.current.describeRun(target, next.pending.payload.stage);
          next = await myNewtApi.prepare(jobId, { ...owner, actionId: next.pending.id, preview });
          if (cancelled) return;
        }
        accept(next); setError("");
        if (["complete", "stopped"].includes(next.status)) { clearInterval(timer); return; }
        if (next.status === "running" && next.pending && !next.pending.claimed && !executing.current) {
          const action = await myNewtApi.claim(jobId, { ...owner, clientId: clientId.current, actionId: next.pending.id });
          if (!action) return;
          if (cancelled) return;
          executing.current = { jobId, actionId: action.id };
          // Do not block heartbeat polling while an existing node waits on its provider.
          execute(action, next, owner, jobId).finally(() => { executing.current = null; });
        }
      } catch (err) { if (!cancelled) setError(err.message); }
      finally { syncing = false; }
    };
    timer = setInterval(tick, 2000); tick();
    return () => {
      cancelled = true; clearInterval(timer);
      myNewtApi.control(jobId, { ...owner, action: "pause" }).catch(() => {});
    };
  }, [jobId, agent?.id, adapter.projectId]);

  async function execute(action, task, owner, id) {
    let result;
    try {
      if (live.current.projectId !== owner.projectId) throw new Error("Project changed before the action started.");
      const a = live.current;
      const permissions = myNewtSettings(a.nodes.find((item) => item.id === owner.nodeId)?.data);
      const graph = a.getGraph();
      const p = action.payload || {};
      if (task.execution === "local" && myNewtLocalActionSignature(action.expected, action) !== myNewtLocalActionSignature(snapshot(), action)) throw new Error("The project or referenced nodes changed after planning. Start a fresh command using the current project.");
      const node = graph.nodes.find((item) => item.id === p.nodeId);
      const guard = (target, allowLockedRun = false) => {
        if (!target) throw new Error("This node no longer exists.");
        if (!task.createdIds.includes(target.id) && !permissions.allowExisting) throw new Error("Enable edits to existing nodes before modifying or running this node.");
        if (!allowLockedRun && target.data?.locked) throw new Error("This node is locked. Ask the user to unlock it.");
        if (["running", "planning", "compiling", "uploading"].includes(target.data?.status)) throw new Error("This node is already busy.");
        const expected = action.expected.nodes.find((item) => item.id === target.id);
        const current = snapshot().nodes.find((item) => item.id === target.id);
        if (expected && JSON.stringify(expected.data) !== JSON.stringify(current?.data)) throw new Error("The user changed this node after planning. Read the current project and reconsider this action.");
      };
      if (action.operation === "workflow" && task.execution === "local") {
        result = await a.insertLocalWorkflow(p.workflowId, p);
      } else if (action.operation === "duplicate" && task.execution === "local") {
        result = await a.duplicateLocal(p.nodeIds, p.count);
      } else if (action.operation === "save-project" && task.execution === "local") {
        if (!await a.saveProject()) throw new Error("The project could not be saved. Check the File menu save status before retrying.");
        result = { saved: true };
      } else if (action.operation === "rename-project" && task.execution === "local") {
        a.renameProject(p.name); result = { renamed: true };
      } else if (action.operation === "report" && task.execution === "local") {
        result = { reported: true };
      } else if (action.operation === "create") {
        if (!a.catalog.some((entry) => entry.type === p.type) || p.type === "myNewt") throw new Error("Choose a supported node type from the catalog.");
        const created = await a.create(p.type, p);
        result = { createdId: created.id };
      } else if (action.operation === "preset") {
        if (!a.presets.some((preset) => preset.id === p.presetId)) throw new Error("Choose an existing Newt Preset from the library.");
        result = await a.insertPreset(p.presetId, p.bindings || {});
      } else if (action.operation === "update") {
        guard(node);
        if (task.execution === "local") validateLocalUpdate(node, p.patch, graph, permissions, task.createdIds);
        const patch = validateMyNewtPatch(node, p.patch, permissions, task.createdIds);
        a.validateOptions(node.type, patch, node.data);
        a.snapshot(); a.update(node.id, patch); result = { updatedId: node.id };
      } else if (action.operation === "connect") {
        const target = graph.nodes.find((item) => item.id === p.to?.nodeId);
        guard(target);
        if (target.type === "skillDirector" && target.data?.skillDirectorLocks?.setup) throw new Error("Director Scene Setup is locked. Ask the user to unlock it before connecting assets.");
        const error = a.connectionError(p.from, p.to, graph.nodes);
        if (error) throw new Error(error);
        a.snapshot(); a.connect(p.from, p.to); result = { connected: true };
      } else if (action.operation === "assign") {
        guard(node);
        if (!snapshotAssetUrls(snapshot()).has(p.url)) throw new Error("Choose an existing managed asset from this project.");
        a.snapshot(); a.assign(node, p.url, p.role); result = { assigned: true };
      } else if (action.operation === "run") {
        guard(node, node?.type === "skillDirector");
        if (myNewtInputSignature(action.expected, node.id) !== myNewtInputSignature(snapshot(), node.id)) throw new Error("Connected assets or inputs changed after this run was planned. Read the updated project before generating.");
        if (node.type === "myNewt" || !["text", "imageModel", "videoModel", "coverage", "character", "skillDirector", "storyboard"].includes(node.type)) throw new Error("This node needs manual operation in this version.");
        const hasImages = ["imageModel", "coverage", "character"].includes(node.type) || (node.type === "storyboard" && p.stage === "generate");
        if (permissions.approveRuns && !action.approved) throw new Error("Approve this run before generation.");
        if (hasImages && !permissions.allowImages) throw new Error("Image generation is disabled in My Newt Settings.");
        if (node.type === "videoModel" && !permissions.allowVideos) throw new Error("Video generation is disabled in My Newt Settings.");
        if (node.type === "skillDirector" && p.stage !== "revise" && node.data.skillDirectorLocks?.[p.stage]) throw new Error("That Director section is locked.");
        a.snapshot();
        await withMyNewtRequestScope(node.id, async (route, body, sequence) => {
          if (live.current.projectId !== owner.projectId) throw new Error("Project changed. No additional generations will be submitted.");
          const reply = await myNewtApi.request(id, { ...owner, actionId: action.id, clientId: clientId.current, sequence, route, body });
          return { response: { ok: reply.status >= 200 && reply.status < 300, status: reply.status }, data: reply.data };
        }, () => a.run(node, p.stage));
        if (task.newIds?.includes(node.id)) await a.settlePlacement(node.id);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const latest = a.getGraph().nodes.find((item) => item.id === node.id);
        result = { nodeId: node.id, status: latest?.data.status, error: latest?.data.error || "", resultUrl: latest?.data.resultUrl || "", resultText: latest?.data.resultText || "" };
      } else throw new Error("Unsupported editor action.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err) { result = { error: err.message || "Could not complete this step." }; }
    try {
      const sameProject = live.current.projectId === owner.projectId;
      const next = await myNewtApi.complete(id, { ...owner, actionId: action.id, clientId: clientId.current, result,
        snapshot: sameProject ? snapshot() : action.expected });
      if (sameProject) accept(next);
    } catch (err) { setError(`${err.message} The action will not be automatically repeated.`); }
  }

  async function control(action, note = "") {
    if (controlling.current || !agent) return false;
    controlling.current = true;
    setBusy(true); setError("");
    try {
      if (action === "start" || action === "continue") {
        const brief = String(action === "continue" ? note : note || agent.data.brief || "").trim();
        if (!brief) throw new Error("Enter a task brief first.");
        const graph = snapshot();
        const route = myNewtLocalAction(brief, graph, agent.data, action === "continue" ? job?.createdIds : []);
        if (route.route === "blocked") throw new Error(route.error);
        const next = await myNewtApi.start({ ...identity, brief, executionRoute: route.route, parentId: action === "continue" ? jobId : undefined, settings: agent.data, snapshot: graph, checkpoint: myNewtCheckpoint(live.current.getGraph(), `Before: ${brief.slice(0, 100)}`) });
        if (live.current.projectId !== identity.projectId || !live.current.nodes.some((node) => node.id === identity.nodeId)) {
          await myNewtApi.control(next.id, { ...identity, action: "pause" }); return false;
        }
        live.current.update(agent.id, { jobId: next.id, brief, myNewtNote: "" }); accept(next, true);
      } else if (action === "restore") {
        if (!window.confirm("Restore the canvas to this task's starting checkpoint? Later canvas edits will be replaced. Generated files and provider charges will remain unchanged.")) return false;
        const result = await myNewtApi.recover(jobId, identity);
        if (live.current.projectId !== identity.projectId) return false;
        live.current.restore(restoreMyNewtCheckpoint(result.checkpoint, live.current.getGraph()));
        accept(result.job);
      } else {
        accept(await myNewtApi.control(jobId, { ...identity, action, note, settings: myNewtSettings(agent.data) }));
      }
      return live.current.projectId === identity.projectId && live.current.nodes.some((node) => node.id === identity.nodeId);
    } catch (err) { setError(err.message); return false; } finally { controlling.current = false; setBusy(false); }
  }
  function selectTask(id) {
    if (busy || executing.current || (job && !["complete", "stopped"].includes(job.status))) return;
    if (!id) { live.current.update(agent.id, { jobId: "", brief: "", myNewtNote: "", myNewtSummary: null }); return; }
    const item = history.find((item) => item.id === id);
    if (item) live.current.update(agent.id, { jobId: id, brief: item.brief, myNewtSummary: { status: item.status, spent: item.spent } });
  }
  const celebrating = !!completionBurst && completionBurst === taskKey && job?.status === "complete";
  return { job, error, busy, control, history, selectTask, localPreview, focusNode: (id) => live.current.focusNode(id), celebrating, projectId: adapter.projectId, projectName: adapter.projectName };
}

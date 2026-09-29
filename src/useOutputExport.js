import React from "react";
import { outputApi } from "./api/newtApi.js";
import { normalizeOutputSettings, outputCandidates, pendingOutputCandidates, mergeOutputReceipts, outputMediaTypes } from "./outputNode.js";

const terminalStatuses = new Set(["complete", "partial", "failed", "canceled"]);
const resumableStatuses = new Set([undefined, "queued", "running"]);
const message = error => error?.message || String(error || "The server did not return an export result.");
const settingsSignature = settings => JSON.stringify({ ...settings, autoExport: false });
const sourceIdentity = item => JSON.stringify([item.url, item.type, item.version || ""]);
const emptySources = [], emptyContext = {};

export function outputOwnerKey(node, context = {}) {
  return JSON.stringify([node.id, context.projectId || "", context.workflowPackageId || "", context.workflowPackagePath || "",
    context.projectId ? "" : context.projectName || context.workflowName || ""]);
}

// The same controller runs in React and the mock-only regression tests.
export function createOutputExportController({ initial, api = outputApi, onUpdate, isCurrent = () => true,
  schedule = setTimeout, unschedule = clearTimeout, uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  let input = initial, external = initial.node.data || {};
  let settings = normalizeOutputSettings(external.outputSettings);
  let receipts = external.outputReceipts || [], job = external.outputJob || null;
  let active = false, epoch = 0, timer, pollVersion = 0, operation = "", pickerVersion = 0;
  let error = job?.error || "", progress = Number(job?.progress) || 0;
  let autoArmed = settings.autoExport && !["uncertain", "failed", "partial", "canceled"].includes(job?.status);
  const listeners = new Set(), eligible = new Set(), attempted = new Set((job?.items || []).map(sourceIdentity));
  const candidates = () => outputCandidates(input.sources || [], settings,
    input.workflowContext?.projectName || input.workflowContext?.workflowName || "Untitled node project");
  const readySources = () => (input.sources || []).filter(item => item.url && item.ready !== false && outputMediaTypes.includes(item.type));
  // Media identity, not the destination/name-dependent receipt key. Never shrink this baseline as receipts age out.
  const seenReady = new Set(readySources().map(sourceIdentity));
  let view;
  const live = token => active && isCurrent() && (token == null || token === epoch);
  const busy = () => operation === "submitting" || operation === "canceling" || Boolean(job?.id && resumableStatuses.has(job.status));
  function emit() {
    view = { settings, receipts, job, error, progress, busy: busy(), operation,
      candidates: candidates(), lastSaved: receipts.filter(item => item.status === "saved" && item.filePath)
        .sort((a, b) => String(a.completedAt || "").localeCompare(String(b.completedAt || ""))).at(-1) };
    if (live()) for (const listener of listeners) listener();
  }
  function persist(patch, acknowledge = false) {
    if (!live()) return;
    const token = epoch;
    if (patch.outputSettings) settings = patch.outputSettings;
    if (patch.outputReceipts) receipts = patch.outputReceipts;
    if (Object.hasOwn(patch, "outputJob")) job = patch.outputJob;
    emit();
    const failed = failure => {
      if (!live(token)) return;
      if (acknowledge) throw failure;
      stopPolling(); operation = ""; pauseAuto();
      error = `Output state could not be saved: ${message(failure)} Check the destination before exporting again.`;
      if (job) job = { ...job, status: "uncertain", error };
      emit();
    };
    try {
      const result = onUpdate(patch);
      return result?.then ? result.catch(failed) : result;
    } catch (failure) { return failed(failure); }
  }
  function stopPolling() { unschedule(timer); timer = undefined; pollVersion++; }
  function pauseAuto() { autoArmed = false; eligible.clear(); settings = { ...settings, autoExport: false }; }
  function uncertain(failure, prefix = "Export status could not be confirmed") {
    stopPolling(); operation = ""; pauseAuto();
    error = `${prefix}: ${message(failure)} Check the destination before exporting another copy. This request will not be resubmitted automatically.`;
    const additions = (job?.items || []).filter(item => !receipts.some(receipt => receipt.key === item.key && receipt.requestId === job.id
      && ["saved", "skipped", "failed"].includes(receipt.status))).map(item => ({ key: item.key, sourceUrl: item.url, type: item.type,
      requestId: job.id, status: "uncertain", error, completedAt: now() }));
    persist({ outputJob: job ? { ...job, status: "uncertain", error } : null,
      outputReceipts: mergeOutputReceipts(receipts, additions), outputSettings: settings });
  }
  function accept(state) {
    if (!state?.id || state.id !== job?.id || (!terminalStatuses.has(state.status) && state.status !== "running")) {
      throw new Error("The server returned an invalid or mismatched export job.");
    }
    const done = terminalStatuses.has(state.status), used = new Set();
    const results = Array.isArray(state.results) ? state.results : [];
    const additions = job.items.flatMap(item => {
      const index = results.findIndex((result, i) => !used.has(i) && result.sourceUrl === item.url && result.type === item.type);
      const result = results[index];
      if (index >= 0) used.add(index);
      const previous = receipts.find(receipt => receipt.key === item.key && receipt.requestId === job.id);
      if (!result && (!done || ["saved", "skipped", "failed"].includes(previous?.status))) return [];
      const status = ["saved", "skipped", "failed"].includes(result?.status) ? result.status : state.status === "failed" ? "failed" : "uncertain";
      const resultError = result?.error || (status === "uncertain" ? "No confirmed result was returned for this file." : status === "failed" ? state.error || "The file could not be exported." : "");
      if (previous?.status === status && previous.filePath === result?.filePath && (previous.error || "") === resultError) return [];
      return [{ key: item.key, sourceUrl: item.url, type: item.type, requestId: job.id, status,
        filePath: result?.filePath || "", fileName: result?.fileName || item.name, error: resultError, completedAt: now() }];
    });
    receipts = mergeOutputReceipts(receipts, additions);
    const incomplete = job.items.some(item => receipts.some(receipt => receipt.key === item.key && receipt.requestId === job.id
      && ["failed", "uncertain"].includes(receipt.status)));
    progress = Math.max(0, Math.min(1, Number(state.progress) || (done ? 1 : 0)));
    job = { ...job, status: state.status, progress, warning: state.warning || "" };
    if (done) {
      stopPolling(); operation = "";
      error = state.error || (incomplete ? "Some files were not confirmed saved. Check the destination before exporting again." : "");
      if (state.status !== "complete" || incomplete) pauseAuto();
      job = { ...job, error };
    }
    if (done || additions.length) persist({ outputJob: job, outputReceipts: receipts, ...(done ? { outputSettings: settings } : {}) });
    else emit();
    return done;
  }
  function queuePoll(delay = 1000) {
    stopPolling();
    const token = epoch, version = pollVersion, id = job?.id;
    timer = schedule(async () => {
      if (!live(token) || pollVersion !== version || job?.id !== id) return;
      try {
        const state = await api.job(id);
        if (!live(token) || pollVersion !== version || job?.id !== id) return;
        if (!accept(state)) queuePoll();
        else maybeAuto();
      } catch (failure) {
        if (live(token) && pollVersion === version && job?.id === id) uncertain(failure);
      }
    }, delay);
  }
  function maybeAuto() {
    if (!live() || busy() || operation || !autoArmed || !settings.autoExport) return;
    const pending = pendingOutputCandidates(candidates(), receipts).filter(item => eligible.has(sourceIdentity(item)) && !attempted.has(sourceIdentity(item)));
    if (pending.length) void startExport(pending);
  }
  async function startExport(items = candidates()) {
    if (!live() || busy() || operation || !items.length) return;
    if (items.length > 100) {
      error = `${items.length} files are ready. Export supports at most 100 files per batch; narrow the connected results or use Selected.`;
      pauseAuto(); persist({ outputSettings: settings }); return;
    }
    const missing = [...new Set(items.filter(item => !settings.destinations[item.type]?.path?.trim()).map(item => item.type))];
    if (missing.length || (settings.nameMode === "custom" && !settings.customName.trim())) {
      error = missing.length ? `Choose a destination folder for ${missing.join(", ")}.` : "Enter a custom name before exporting.";
      pauseAuto(); persist({ outputSettings: settings }); return;
    }
    const token = epoch, settingsVersion = pickerVersion;
    const destinations = structuredClone(settings.destinations);
    operation = "validating"; error = ""; progress = 0; emit();
    try {
      const validation = await api.validate({ destinations, types: [...new Set(items.map(item => item.type))] });
      if (!live(token)) return;
      if (validation?.valid !== true && validation?.ok !== true) throw new Error(validation?.error || "The server did not confirm the destination folders.");
      const currentKeys = new Set(candidates().map(item => item.key));
      if (settingsVersion !== pickerVersion || items.some(item => !currentKeys.has(item.key))) {
        throw new Error("Settings or source results changed while checking folders. Review them before exporting again.");
      }
    } catch (failure) {
      if (live(token)) {
        operation = ""; pauseAuto(); error = `Destination check failed: ${message(failure)} No export was submitted.`;
        persist({ outputSettings: settings });
      }
      return;
    }
    operation = "submitting"; emit();
    let dispatched = false;
    try {
      const requestId = uuid();
      const ownedJob = { id: requestId, items: items.map(item => ({ ...item })), status: "queued", progress: 0, startedAt: now() };
      const body = { ...input.workflowContext, nodeId: input.node.id, nodeTitle: input.node.data?.title || "Output", requestId,
        items: items.map(({ url, type, name }) => ({ url, type, name })),
        destinations, collision: settings.collision };
      for (const item of items) { eligible.delete(sourceIdentity(item)); attempted.add(sourceIdentity(item)); }
      // Record ownership before the only POST. An async persistence callback may acknowledge durable storage.
      await persist({ outputJob: ownedJob, outputReceipts: mergeOutputReceipts(receipts, items.map(item => ({ key: item.key,
        sourceUrl: item.url, type: item.type, requestId, status: "queued", queuedAt: now() }))) }, true);
      if (!live(token)) return;
      dispatched = true;
      const state = await api.export(body);
      if (!live(token)) return;
      operation = "";
      if (!accept(state)) queuePoll();
      else maybeAuto();
    } catch (failure) {
      if (!live(token)) return;
      if (dispatched && [400, 401, 403, 404, 409, 413, 422, 429].includes(Number(failure?.status))) {
        operation = ""; pauseAuto(); error = `Export request was rejected: ${message(failure)} It will not be retried automatically.`;
        persist({ outputJob: { ...job, status: "failed", error }, outputSettings: settings,
          outputReceipts: mergeOutputReceipts(receipts, items.map(item => ({ key: item.key, sourceUrl: item.url, type: item.type,
            requestId: job.id, status: "failed", error, completedAt: now() }))) });
      } else uncertain(failure, dispatched ? "Export submission could not be confirmed" : "Export ownership could not be saved; no request was sent");
    }
  }
  function changeSettings(patch) {
    if (!live()) return;
    pickerVersion++; pauseAuto(); error = "";
    const next = normalizeOutputSettings({ ...settings, ...patch, autoExport: false });
    persist({ outputSettings: next });
  }
  function toggleAuto(enabled) {
    if (!live()) return;
    pickerVersion++; eligible.clear(); error = ""; autoArmed = enabled;
    for (const item of readySources()) seenReady.add(sourceIdentity(item));
    if (enabled) for (const item of pendingOutputCandidates(candidates(), receipts)) eligible.add(sourceIdentity(item));
    persist({ outputSettings: { ...settings, autoExport: enabled } });
    maybeAuto();
  }
  async function selectFolder(type) {
    if (!live() || operation) return;
    changeSettings({});
    const token = epoch, version = pickerVersion;
    operation = "picking"; emit();
    try {
      const result = await api.selectFolder({ ...input.workflowContext, title: `Choose ${type} export folder`, defaultPath: settings.destinations[type].path });
      if (!live(token) || version !== pickerVersion || result?.canceled || !result?.path) return;
      changeSettings({ destinations: { ...settings.destinations, [type]: { ...settings.destinations[type], path: result.path } } });
    } catch (failure) { if (live(token) && version === pickerVersion) { error = `Could not choose a folder: ${message(failure)}`; emit(); } }
    finally { if (live(token)) { operation = ""; emit(); } }
  }
  async function cancel() {
    if (!live() || !job?.id || operation || !busy()) return;
    stopPolling(); pauseAuto();
    const token = epoch, id = job.id;
    operation = "canceling"; persist({ outputSettings: settings });
    try {
      const state = await api.cancel(id);
      if (!live(token) || job?.id !== id) return;
      operation = "";
      if (!accept(state)) queuePoll();
    } catch (failure) { if (live(token) && job?.id === id) uncertain(failure, "Cancellation could not be confirmed; the export may still be running"); }
  }
  function checkStatus() {
    if (!live() || !job?.id || busy() || operation) return;
    error = ""; job = { ...job, status: "running", error: "" }; emit(); queuePoll(0);
  }
  async function reveal() {
    const path = view.lastSaved?.filePath;
    if (!live() || !path || operation) return;
    const token = epoch;
    operation = "revealing"; emit();
    try { await api.reveal(path); }
    catch (failure) { if (live(token)) error = `Could not reveal ${path}: ${message(failure)}`; }
    finally { if (live(token)) { operation = ""; emit(); maybeAuto(); } }
  }
  emit();
  return {
    getSnapshot: () => view,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    activate() { active = true; epoch++; if (job?.id && resumableStatuses.has(job.status)) queuePoll(0); },
    dispose() { active = false; epoch++; pickerVersion++; stopPolling(); },
    observe(next) {
      if (!live()) return;
      const data = next.node.data || {};
      if (data.outputSettings !== external.outputSettings) {
        const normalized = normalizeOutputSettings(data.outputSettings);
        if (settingsSignature(normalized) !== settingsSignature(settings)) {
          settings = normalized; pauseAuto(); pickerVersion++;
          if (normalized.autoExport) persist({ outputSettings: settings });
        } else {
          settings = normalized;
          if (!settings.autoExport) { autoArmed = false; eligible.clear(); }
        }
      }
      if (data.outputReceipts !== external.outputReceipts) receipts = mergeOutputReceipts(receipts, data.outputReceipts || []);
      external = data; input = next;
      for (const item of readySources()) {
        const identity = sourceIdentity(item);
        if (!seenReady.has(identity) && autoArmed && settings.autoExport) eligible.add(identity);
        seenReady.add(identity);
      }
      emit(); maybeAuto();
    },
    startExport: () => startExport(), changeSettings, toggleAuto, selectFolder, cancel, checkStatus, reveal
  };
}

export function useOutputExport({ node, sources = emptySources, workflowContext = emptyContext, onUpdate, api = outputApi }) {
  const owner = outputOwnerKey(node, workflowContext), latest = React.useRef({ owner, onUpdate });
  latest.current = { owner, onUpdate };
  const controller = React.useMemo(() => createOutputExportController({ initial: { node, sources, workflowContext }, api,
    isCurrent: () => latest.current.owner === owner,
    onUpdate: patch => latest.current.onUpdate(node.id, patch)
  }), [owner, api]);
  React.useLayoutEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  React.useLayoutEffect(() => { controller.observe({ node, sources, workflowContext }); }, [controller, node, sources, workflowContext]);
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...state, controller };
}

import test from "node:test";
import assert from "node:assert/strict";
import { createOutputExportController, outputOwnerKey } from "../src/useOutputExport.js";
import { normalizeOutputSettings, outputCandidates, mergeOutputReceipts } from "../src/outputNode.js";

const source = (name = "one", patch = {}) => ({ url: `/outputs/${name}.png`, type: "image", label: name,
  sourceName: "Image Model", sourceNodeId: "image-node", selected: true, ready: true, ...patch });
const defaults = patch => normalizeOutputSettings({ destinations: { image: { path: "/mock/images" }, video: { path: "/mock/video" }, audio: { path: "/mock/audio" } }, ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const running = body => ({ id: body.requestId, status: "running", progress: 0, results: [] });
const complete = body => ({ id: body.requestId, status: "complete", progress: 1,
  results: body.items.map(item => ({ sourceUrl: item.url, type: item.type, status: "saved", fileName: `${item.name}.png`, filePath: `/mock/images/${item.name}.png` })) });

function harness({ sources = [source()], settings = defaults(), data = {}, api = {}, current = () => true, persist } = {}) {
  let input = { node: { id: "output", data: { title: "Output", outputSettings: settings, resultUrl: "untouched", ...data } }, sources,
    workflowContext: { projectId: "project-a", projectName: "Mock project" } };
  const calls = [], writes = [], validations = [], timers = new Map();
  let id = 0, timerId = 0;
  const mock = {
    validate: async body => { validations.push(body); return api.validate ? api.validate(body) : { valid: true }; },
    export: async body => { calls.push(["export", body]); return api.export ? api.export(body) : running(body); },
    job: async jobId => { calls.push(["job", jobId]); return api.job ? api.job(jobId) : { id: jobId, status: "running", progress: .25, results: [] }; },
    cancel: async jobId => { calls.push(["cancel", jobId]); return api.cancel ? api.cancel(jobId) : { id: jobId, status: "canceled", progress: 1, results: [] }; },
    selectFolder: async body => { calls.push(["folder", body]); return api.selectFolder ? api.selectFolder(body) : { path: "/mock/chosen" }; },
    reveal: async path => { calls.push(["reveal", path]); return api.reveal ? api.reveal(path) : {}; }
  };
  const controller = createOutputExportController({ initial: input, api: mock, isCurrent: current,
    uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    onUpdate: patch => {
      writes.push(structuredClone(patch)); input = { ...input, node: { ...input.node, data: { ...input.node.data, ...patch } } };
      return persist?.(patch);
    },
    schedule: fn => { const key = ++timerId; timers.set(key, fn); return key; }, unschedule: key => timers.delete(key)
  });
  controller.activate();
  return { controller, calls, writes, validations, timers, get input() { return input; }, get view() { return controller.getSnapshot(); },
    sync(patch = {}) { input = { ...input, ...patch }; controller.observe(input); },
    async tick() { const [key, fn] = timers.entries().next().value || []; assert.ok(fn, "Expected a scheduled read-only poll"); timers.delete(key); await fn(); await flush(); }
  };
}

test("manual export journals UUID ownership and all queued receipts before dispatch; double-click cannot duplicate", async () => {
  const response = deferred(); let h;
  h = harness({ sources: [source(), source("two", { selected: false })], api: { export: body => {
    assert.equal(h.input.node.data.outputJob.id, body.requestId);
    assert.equal(h.input.node.data.outputReceipts[0].status, "queued");
    assert.equal(h.input.node.data.outputReceipts[0].requestId, body.requestId);
    assert.deepEqual(Object.keys(body.items[0]), ["url", "type", "name"]);
    assert.equal(body.nodeId, "output"); assert.equal(body.projectId, "project-a");
    return response.promise;
  } } });
  const first = h.controller.startExport();
  await h.controller.startExport(); await flush();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][1].items.length, 1);
  response.resolve(complete(h.calls[0][1])); await first;
  assert.equal(h.view.receipts[0].status, "saved"); assert.equal(h.view.busy, false);
  assert.equal(h.input.node.data.resultUrl, "untouched");
  assert.ok(h.writes.every(patch => Object.keys(patch).every(key => ["outputJob", "outputReceipts", "outputSettings"].includes(key))));
});

test("a pending persistence acknowledgement gates the POST, and unmount never clears ownership or cancels", async () => {
  const ack = deferred();
  const h = harness({ persist: () => ack.promise });
  const pending = h.controller.startExport(); await flush();
  assert.equal(h.calls.length, 0); assert.equal(h.input.node.data.outputJob.status, "queued");
  h.controller.dispose(); ack.resolve(); await pending;
  assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 1);
});

test("persistence rejection prevents dispatch and handles subsequent failed error-state writes", async () => {
  for (const asynchronous of [false, true]) {
    const h = harness({ persist: () => {
      if (asynchronous) return Promise.reject(new Error("Storage unavailable"));
      throw new Error("Storage unavailable");
    } });
    await h.controller.startExport(); await flush();
    assert.equal(h.calls.length, 0); assert.equal(h.view.busy, false); assert.equal(h.view.settings.autoExport, false);
    assert.match(h.view.error, /Storage unavailable/);
  }
});

test("reload resumes an existing queued/running job using GET only and never submits its batch", async () => {
  const settings = defaults(), items = outputCandidates([source()], settings, "Mock project");
  for (const status of [undefined, "queued", "running"]) {
    const h = harness({ data: { outputJob: { id: "owned-job", items, status } }, api: { job: () => complete({ requestId: "owned-job", items }) } });
    await h.tick();
    assert.deepEqual(h.calls, [["job", "owned-job"]]); assert.equal(h.view.receipts[0].status, "saved"); assert.equal(h.timers.size, 0);
  }
});

test("manual Export deliberately makes another copy with a new UUID even when a receipt exists", async () => {
  const h = harness({ api: { export: complete } });
  await h.controller.startExport(); h.sync(); await h.controller.startExport();
  assert.equal(h.calls.length, 2); assert.notEqual(h.calls[0][1].requestId, h.calls[1][1].requestId);
  assert.equal(h.view.receipts.length, 1);
});

test("saved Auto Export observes an initial cumulative baseline, including selected-only contact sheets", async () => {
  const old = source(), board = source("board", { all: false }), unready = source("pending", { ready: false });
  const h = harness({ settings: defaults({ autoExport: true }), sources: [old, board, unready], api: { export: complete } });
  h.sync(); h.sync({ sources: [old, { ...board, selected: false }, unready] }); await flush();
  assert.equal(h.calls.length, 0);
  h.sync({ sources: [old, board, { ...unready, ready: true }] }); await flush();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0][1].items.map(item => item.url), [unready.url]);
  h.sync({ sources: [] }); h.sync({ sources: [old, board, { ...unready, ready: true }] }); await flush();
  assert.equal(h.calls.length, 1);
});

test("selection, naming metadata, numbering shifts and unrelated rerenders do not turn old sources into new arrivals", async () => {
  const one = source(), two = source("two", { selected: false });
  const h = harness({ settings: defaults({ autoExport: true, numbering: true, nameMode: "source" }), sources: [one, two], api: { export: complete } });
  h.sync({ sources: [{ ...two, selected: true, sourceName: "Renamed" }, { ...one, selected: false }] });
  h.sync({ workflowContext: { projectId: "project-a", projectName: "Renamed project" } }); await flush();
  assert.equal(h.calls.length, 0);
});

test("an explicit Auto Export toggle may export existing unreceipted results, once; settings edits pause it", async () => {
  const h = harness({ api: { export: complete } });
  h.controller.toggleAuto(true); await flush(); h.sync();
  assert.equal(h.calls.length, 1);
  h.controller.changeSettings({ customName: "a" }); h.sync({ sources: [source(), source("two")] }); await flush();
  assert.equal(h.calls.length, 1); assert.equal(h.view.settings.autoExport, false);
  h.controller.toggleAuto(true); await flush(); assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1][1].items.map(item => item.url), [source("two").url]);
});

test("external settings changes pause saved Auto Export without writing files", async () => {
  const h = harness({ settings: defaults({ autoExport: true }), api: { export: complete } });
  h.sync({ node: { ...h.input.node, data: { ...h.input.node.data, outputSettings: defaults({ autoExport: true, collision: "skip" }) } }, sources: [source(), source("two")] });
  await flush(); assert.equal(h.view.settings.autoExport, false); assert.equal(h.calls.length, 0);
});

test("new arrivals during an active job wait and are batched after completion", async () => {
  let last;
  const h = harness({ settings: defaults({ autoExport: true }), api: { export: body => { last = body; return running(body); }, job: () => complete(last) } });
  h.sync({ sources: [source(), source("two")] }); await flush();
  h.sync({ sources: [source(), source("two"), source("three"), source("four")] });
  assert.equal(h.calls.filter(([name]) => name === "export").length, 1);
  await h.tick();
  assert.equal(h.calls.filter(([name]) => name === "export").length, 2);
  assert.deepEqual(last.items.map(item => item.url), [source("three").url, source("four").url]);
});

test("cumulative identity history outlives the 2000-receipt cap and prevents old-source replay", async () => {
  const h = harness({ settings: defaults({ autoExport: true, scope: "all" }), sources: [], api: { export: complete } });
  const all = Array.from({ length: 2001 }, (_, i) => source(`item-${i}`));
  for (let offset = 0; offset < all.length; offset += 100) { h.sync({ sources: all.slice(offset, offset + 100) }); await flush(); }
  assert.equal(h.view.receipts.length, 2000);
  const before = h.calls.length;
  h.sync({ sources: all }); await flush();
  assert.equal(h.calls.length, before);
  h.controller.toggleAuto(false); h.controller.toggleAuto(true); await flush();
  assert.equal(h.calls.length, before);
});

test("failed, uncertain and queued receipts all block Auto Export, including after explicit re-arming", async () => {
  for (const status of ["failed", "uncertain", "queued", "skipped", "saved"]) {
    const settings = defaults(), [item] = outputCandidates([source()], settings, "Mock project");
    const h = harness({ settings, data: { outputReceipts: [{ key: item.key, status }] } });
    h.controller.toggleAuto(true); h.sync(); await flush(); assert.equal(h.calls.length, 0, status);
  }
});

test("POST failure and missing/failed status reads leave durable uncertain receipts with no retry loop", async () => {
  for (const phase of ["export", "job"]) {
    const h = harness({ api: { [phase]: () => { throw new Error(phase === "job" ? "404: Export job no longer available" : "Network disconnected"); } } });
    h.controller.toggleAuto(true); await flush();
    if (phase === "job") await h.tick();
    assert.equal(h.view.job.status, "uncertain"); assert.equal(h.view.receipts[0].status, "uncertain");
    assert.match(h.view.error, /will not be resubmitted automatically/); assert.equal(h.view.settings.autoExport, false);
    h.sync({ sources: [source(), source("two")] }); await flush();
    assert.equal(h.calls.filter(([name]) => name === "export").length, 1); assert.equal(h.timers.size, 0);
  }
});

test("uncertain jobs stay idle on reopen; explicit Check status is read-only and recovers completed receipts", async () => {
  const items = outputCandidates([source()], defaults(), "Mock project");
  const h = harness({ data: { outputJob: { id: "old", status: "uncertain", items, error: "Connection lost" } }, api: { job: () => complete({ requestId: "old", items }) } });
  assert.equal(h.timers.size, 0); h.controller.checkStatus(); await h.tick();
  assert.deepEqual(h.calls, [["job", "old"]]); assert.equal(h.view.receipts[0].status, "saved");
});

test("partial results preserve successful paths and pause Auto Export without losing failed receipts", async () => {
  const h = harness({ sources: [source(), source("two")], api: { export: body => {
    const result = complete(body); result.status = "partial"; result.results[1] = { sourceUrl: body.items[1].url, type: "image", status: "failed", error: "Permission denied" }; return result;
  } } });
  h.controller.toggleAuto(true); await flush();
  assert.deepEqual(h.view.receipts.map(item => item.status), ["saved", "failed"]);
  assert.match(h.view.receipts[1].error, /Permission denied/); assert.equal(h.view.settings.autoExport, false);
  await h.controller.reveal(); assert.deepEqual(h.calls.at(-1), ["reveal", "/mock/images/one.png"]);
});

test("a terminal response missing result entries is uncertain, never successful by inference", async () => {
  const h = harness({ api: { export: body => ({ ...complete(body), results: [] }) } });
  await h.controller.startExport(); assert.equal(h.view.receipts[0].status, "uncertain"); assert.ok(h.view.error);
});

test("unchanged read-only progress polls do not repeatedly persist the graph", async () => {
  const h = harness(); await h.controller.startExport();
  const writes = h.writes.length;
  await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.writes.length, writes); assert.equal(h.view.progress, .25);
});

test("Cancel is explicit, invalidates late polls, retains receipts and never runs on unmount", async () => {
  const response = deferred(); const h = harness({ api: { job: () => response.promise } });
  await h.controller.startExport();
  const poll = h.tick(); await flush(); await h.controller.cancel();
  const writes = h.writes.length;
  response.resolve(complete(h.calls[0][1])); await poll;
  assert.equal(h.writes.length, writes); assert.equal(h.view.job.status, "canceled"); assert.equal(h.view.receipts[0].status, "uncertain");
  h.controller.dispose(); assert.equal(h.calls.filter(([name]) => name === "cancel").length, 1);
});

test("late POST, GET and folder callbacks cannot publish after unmount or a project change", async () => {
  for (const action of ["export", "job", "selectFolder"]) for (const unmount of [true, false]) {
    const response = deferred(); let current = true;
    const h = harness({ current: () => current, api: { [action]: () => response.promise } });
    let pending;
    if (action === "job") { await h.controller.startExport(); pending = h.tick(); }
    else pending = action === "export" ? h.controller.startExport() : h.controller.selectFolder("image");
    await flush(); const writes = h.writes.length;
    if (unmount) h.controller.dispose(); else current = false;
    response.resolve(action === "selectFolder" ? { path: "/late-folder" } : complete(h.calls.find(([name]) => name === "export")[1]));
    await pending; assert.equal(h.writes.length, writes); assert.equal(h.calls.filter(([name]) => name === "cancel").length, 0);
  }
});

test("canceling folder selection is silent, and a later picker cannot overwrite newer settings", async () => {
  const canceled = harness({ api: { selectFolder: () => ({ canceled: true, path: "" }) } });
  await canceled.controller.selectFolder("image"); assert.equal(canceled.view.settings.destinations.image.path, "/mock/images"); assert.equal(canceled.view.error, "");
  assert.equal(canceled.calls[0][1].defaultPath, "/mock/images"); assert.equal(canceled.calls[0][1].path, undefined);
  const response = deferred(), h = harness({ api: { selectFolder: () => response.promise } });
  const pending = h.controller.selectFolder("image");
  h.controller.changeSettings({ destinations: { ...h.view.settings.destinations, image: { ...h.view.settings.destinations.image, path: "/typed" } } });
  response.resolve({ path: "/stale-picked" }); await pending;
  assert.equal(h.view.settings.destinations.image.path, "/typed");
});

test("missing, unwritable or unconfirmed destinations fail preflight without job ownership or queued receipts", async () => {
  for (const validate of [() => { throw new Error("Folder does not exist: /mock/images"); }, () => ({ valid: false, error: "Permission denied" }), () => ({})]) {
    const h = harness({ api: { validate } });
    h.controller.toggleAuto(true); await flush();
    assert.equal(h.validations.length, 1); assert.equal(h.calls.length, 0);
    assert.equal(h.input.node.data.outputJob, undefined); assert.equal(h.input.node.data.outputReceipts, undefined);
    assert.equal(h.view.settings.autoExport, false); assert.match(h.view.error, /No export was submitted/);
    h.sync({ sources: [source(), source("two")] }); await flush(); assert.equal(h.validations.length, 1);
  }
});

test("validation blocks manual double-clicks and manual Export while an auto-start is in flight", async () => {
  for (const auto of [false, true]) {
    const response = deferred(), h = harness({ api: { validate: () => response.promise, export: complete } });
    const first = auto ? h.controller.toggleAuto(true) : h.controller.startExport();
    await h.controller.startExport(); await h.controller.startExport(); await flush();
    assert.equal(h.validations.length, 1); assert.equal(h.calls.length, 0);
    assert.equal(h.input.node.data.outputJob, undefined);
    response.resolve({ valid: true }); await first; await flush();
    assert.equal(h.calls.length, 1);
  }
});

test("settings changes, newly unready media and scope changes invalidate pending preflight", async () => {
  for (const mutate of [h => h.controller.changeSettings({ customName: "new name" }), h => h.sync({ sources: [source("one", { ready: false })] }),
    h => h.sync({ sources: [source("one", { selected: false })] })]) {
    const response = deferred(), h = harness({ api: { validate: () => response.promise } });
    const pending = h.controller.startExport(); mutate(h); response.resolve({ valid: true }); await pending;
    assert.equal(h.calls.length, 0); assert.equal(h.input.node.data.outputJob, undefined); assert.match(h.view.error, /changed while checking/);
  }
});

test("late preflight cannot dispatch or persist across unmount/project switches", async () => {
  for (const unmount of [true, false]) {
    let current = true;
    const response = deferred(), h = harness({ current: () => current, api: { validate: () => response.promise } });
    const pending = h.controller.startExport();
    if (unmount) h.controller.dispose(); else current = false;
    response.resolve({ valid: true }); await pending;
    assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  }
});

test("known POST rejections are failed, not uncertain, and never retry automatically", async () => {
  const h = harness({ api: { export: () => { throw Object.assign(new Error("Destination changed after validation"), { status: 400 }); } } });
  h.controller.toggleAuto(true); await flush();
  assert.equal(h.view.job.status, "failed"); assert.equal(h.view.receipts[0].status, "failed");
  assert.match(h.view.error, /request was rejected/); assert.equal(h.view.settings.autoExport, false);
  h.sync({ sources: [source(), source("two")] }); await flush(); assert.equal(h.calls.length, 1);
});

test("blank custom names, missing destinations and batches above 100 fail without dispatch or truncation", async () => {
  for (const settings of [defaults({ nameMode: "custom", customName: "  " }), defaults({ destinations: {} })]) {
    const h = harness({ settings }); await h.controller.startExport(); assert.equal(h.calls.length, 0); assert.ok(h.view.error); assert.equal(h.view.busy, false);
  }
  const h = harness({ sources: Array.from({ length: 101 }, (_, i) => source(String(i))) });
  h.controller.toggleAuto(true); await flush();
  assert.equal(h.calls.length, 0); assert.match(h.view.error, /101.*at most 100/); assert.equal(h.view.settings.autoExport, false);
});

test("owner identity guards node, project and package changes while tolerating ordinary project renames", () => {
  const node = { id: "output" }, context = { projectId: "one", projectName: "First", workflowPackagePath: "/first" };
  const key = outputOwnerKey(node, context);
  assert.equal(key, outputOwnerKey(node, { ...context, projectName: "Second" }));
  assert.notEqual(key, outputOwnerKey({ id: "other" }, context));
  assert.notEqual(key, outputOwnerKey(node, { ...context, projectId: "two" }));
  assert.notEqual(key, outputOwnerKey(node, { ...context, workflowPackagePath: "/second" }));
});

test("baseline also survives incoming receipt eviction without changing any existing source files", async () => {
  const old = source(), settings = defaults({ autoExport: true });
  const [item] = outputCandidates([old], settings, "Mock project");
  const existing = [{ key: item.key, status: "saved" }];
  const h = harness({ settings, data: { outputReceipts: existing }, api: { export: complete } });
  const evicted = mergeOutputReceipts(existing, Array.from({ length: 2000 }, (_, i) => ({ key: `other-${i}`, status: "saved" })));
  h.sync({ node: { ...h.input.node, data: { ...h.input.node.data, outputReceipts: evicted } } });
  h.sync({ sources: [{ ...old, label: "New label" }] }); await flush(); assert.equal(h.calls.length, 0);
});

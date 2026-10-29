export function needsVectorLayerSetup(item, operations = []) {
  return Boolean(item?.svgUrl && !item.vectorLayersPrepared && !item.vectorSourceSvgUrl && !item.vectorBackgroundKeys?.length && !operations.length);
}

export function needsVectorGroupSetup(item) {
  return Boolean(item?.svgUrl && item.vectorGroupsPrepared !== true);
}

export function prepareVectorLayerState(data, svgUrl, operation, { background = true, groups = false } = {}) {
  const item = data.resultItems?.find(item => item.svgUrl === svgUrl);
  const operations = data.vectorLayerDrafts?.find(draft => draft.svgUrl === svgUrl)?.operations || [];
  const prepareBackground = background && needsVectorLayerSetup(item, operations), prepareGroups = groups && needsVectorGroupSetup(item);
  if (!prepareBackground && !prepareGroups) return {};
  return { resultItems: data.resultItems.map(item => item.svgUrl === svgUrl ? { ...item, ...(prepareBackground ? { vectorLayersPrepared: true } : {}), ...(prepareGroups ? { vectorGroupsPrepared: true } : {}) } : item),
    ...(operation ? { vectorLayerDrafts: [...(data.vectorLayerDrafts || []).filter(draft => draft.svgUrl !== svgUrl), { svgUrl, operations: [...operations, operation] }] } : {}) };
}

export function vectorLayerRole(layer) {
  if (layer.background) return "Background";
  if (layer.kind === "text") return "Text";
  // Trust explicit SVG labels, not the prompt, paint color, or a guessed silhouette.
  if (/^(?:background|backdrop|bg)(?:$|[\s_:-]|\d)/i.test(layer.name || "")) return "Background";
  if (/^(?:text|lettering|letters?|glyphs?|typography|headline|caption|word)(?:$|[\s_:-]|\d)/i.test(layer.name || "")) return "Text";
  return "";
}

export function vectorAutomaticGroupOperation(layers, createId, maxOperations = 100) {
  const byKey = new Map(layers.map(layer => [layer.key, layer])), parents = new Map();
  for (const layer of layers) { if (!parents.has(layer.parentKey)) parents.set(layer.parentKey, []); parents.get(layer.parentKey).push(layer); }
  const runs = [];
  for (const [parentKey, siblings] of parents) {
    const parentRole = vectorLayerRole(byKey.get(parentKey) || {});
    let run = [], role = "";
    const flush = () => { if (run.length) runs.push({ role, layers: run }); run = []; role = ""; };
    for (const layer of siblings.sort((a, b) => a.index - b.index)) {
      const nextRole = vectorLayerRole(layer);
      if (layer.kind === "g" || !nextRole || nextRole === parentRole || layer.locked || layer.parentLocked || layer.parentHidden || (layer.hidden && nextRole !== "Background")) { flush(); continue; }
      if (run.length && (nextRole !== role || run.length >= 1000)) flush();
      role = nextRole; run.push(layer);
    }
    flush();
  }
  const operations = [], names = new Set(layers.filter(layer => layer.kind === "g").map(layer => layer.name));
  const background = new Set(layers.filter(layer => layer.background).map(layer => layer.key));
  let groups = 0, changedBackground = false;
  for (const run of runs) {
    if (groups >= 32 || layers.length + groups >= 5000) break;
    const hidden = run.role === "Background" && run.layers.every(layer => layer.hidden);
    const cost = 1 + (hidden ? 2 : 0);
    if (operations.length + cost + (changedBackground || run.role === "Background" ? 1 : 0) > Math.min(100, maxOperations)) break;
    let name = run.role, number = 2; while (names.has(name)) name = `${run.role} ${number++}`;
    const keys = run.layers.map(layer => layer.key), id = `newt-group-${createId()}`;
    if (run.role === "Background" && background.size - keys.filter(key => background.has(key)).length + 1 > 1000) continue;
    operations.push({ type: "group", keys, id, name, singleton: true }); names.add(name); groups++;
    if (run.role === "Background") {
      for (const key of keys) background.delete(key);
      background.add(id); changedBackground = true;
      // Put all-hidden background visibility on the folder, so its eye/switch
      // can restore the contents without a second hidden state underneath it.
      if (hidden) operations.push({ type: "visibility", keys, visible: true }, { type: "visibility", keys: [id], visible: false });
    }
  }
  if (changedBackground) operations.push({ type: "background", keys: [...background] });
  return operations.length ? { type: "batch", operations } : null;
}

// Only adjacent siblings enter a folder: moving unrelated paint-order entries
// into the same SVG group can change overlaps, even before the user moves it.
export function vectorOrganizationRuns(layers) {
  const runs = []; let current = [];
  const flush = () => { if (current.length > 1) runs.push(current); current = []; };
  for (const layer of layers.filter(layer => !layer.parentKey).sort((a, b) => a.index - b.index)) {
    if (layer.kind === "g" || layer.background || layer.hidden || layer.locked) { flush(); continue; }
    if (current.length && ((layer.kind === "text") !== (current[0].kind === "text") || current.length >= 1000)) flush();
    current.push(layer);
  }
  flush(); return runs.slice(0, Math.min(32, Math.max(0, 5000 - layers.length)));
}

export function vectorOrganizationOperation(layers, createId) {
  const usedNames = new Set(layers.map(layer => layer.name));
  const operations = vectorOrganizationRuns(layers).map(run => {
    const prefix = run[0].kind === "text" ? "Lettering" : "Artwork";
    let number = 1; while (usedNames.has(`${prefix} ${number}`)) number++;
    const name = `${prefix} ${number}`; usedNames.add(name);
    return { type: "group", keys: run.map(layer => layer.key), id: `newt-group-${createId()}`, name };
  });
  return operations.length ? { type: "batch", operations } : null;
}

export function vectorLayerRange(layers, anchor, target) {
  const start = layers.find(layer => layer.key === anchor), end = layers.find(layer => layer.key === target);
  if (!start || !end || start.parentKey !== end.parentKey) return [target];
  return layers.filter(layer => layer.parentKey === start.parentKey && layer.index >= Math.min(start.index, end.index) && layer.index <= Math.max(start.index, end.index)).map(layer => layer.key);
}

// Explicit grouping gathers the selection at its frontmost branch. Automatic
// organization still uses adjacent runs and never changes stacking order.
export function vectorSelectionGroup(layers, keys) {
  const byKey = new Map(layers.map(layer => [layer.key, layer])), selected = new Set(keys);
  const reject = reason => ({ keys: [], reason });
  if (keys.some(key => !byKey.has(key))) return reject("The selection has changed. Select the layers again.");
  const ancestors = layer => {
    const result = [];
    for (let parent = layer.parentKey; parent; parent = byKey.get(parent)?.parentKey) result.push(parent);
    return result;
  };
  const roots = layers.filter(layer => selected.has(layer.key) && !ancestors(layer).some(key => selected.has(key)));
  if (roots.length < 2) return reject("Select at least two layers or groups. A folder already includes its children.");
  if (keys.length > 1000) return reject("Select up to 1,000 layers to group.");
  if (layers.length >= 5000) return reject("Save or simplify this artwork before adding more groups.");
  const rootKeys = new Set(roots.map(layer => layer.key));
  if (roots.some(layer => layer.locked || layer.parentLocked) || layers.some(layer => layer.locked && ancestors(layer).some(key => rootKeys.has(key)))) return reject("Unlock the selected layers, their folders, and any locked contents before grouping.");
  const paths = roots.map(layer => [...ancestors(layer), ""]);
  const parentKey = paths[0].find(key => paths.every(path => path.includes(key)));
  const branches = [];
  for (const layer of roots) {
    let branch = layer;
    while (branch.parentKey !== parentKey) {
      branch = byKey.get(branch.parentKey);
      if (!branch?.canReparent) return reject("A containing folder has clipping or appearance settings. Select that whole folder, or group its layers inside it.");
    }
    branches.push(branch);
  }
  return { keys: roots.map(layer => layer.key), parentKey, anchorKey: branches.sort((a, b) => b.index - a.index)[0].key, reason: "" };
}

export function vectorRowSelection(layers, selected, anchor, target, { shift = false, toggle = false } = {}) {
  const start = layers.find(layer => layer.key === anchor), end = layers.find(layer => layer.key === target);
  if (shift && start && end && start.parentKey === end.parentKey) {
    const range = vectorLayerRange(layers, anchor, target);
    return toggle ? [...new Set([...selected, ...range])] : range;
  }
  if (shift) return [...new Set([...selected, target])];
  return toggle ? selected.includes(target) ? selected.filter(key => key !== target) : [...selected, target] : [target];
}

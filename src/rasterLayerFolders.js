export const sameRasterFolders = (a = [], b = []) => a.length === b.length && a.every((folder, index) =>
  ["id", "name", "visible", "locked", "collapsed", "parentId"].every(key => folder[key] === b[index][key]));

export const layerFolder = (layer, folders = []) => folders.find(folder => folder.id === layer.folderId);
export function rasterFolderAncestors(id, folders = []) {
  const result = [], seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id); const folder = folders.find(item => item.id === id);
    if (!folder) break;
    result.push(folder); id = folder.parentId;
  }
  return result;
}
export const rasterFolderMembers = (layers, folders, id) => layers.filter(layer => rasterFolderAncestors(layer.folderId, folders).some(folder => folder.id === id));
export const rasterLayerLocked = (layer, folders = []) => layer.locked || rasterFolderAncestors(layer.folderId, folders).some(folder => folder.locked);
export const rasterLayerVisible = (layer, folders = []) => layer.visible !== false && rasterFolderAncestors(layer.folderId, folders).every(folder => folder.visible !== false);
export const pruneRasterFolders = (layers, folders = []) => folders.filter(folder => rasterFolderMembers(layers, folders, folder.id).length);
const withoutFolder = layer => { const { folderId, ...rest } = layer; return rest; };

export function rasterStackEntries(layers, folders = [], parentId = "") {
  const seen = new Set();
  return layers.flatMap(layer => {
    const chain = rasterFolderAncestors(layer.folderId, folders);
    const folder = chain.find(item => (item.parentId || "") === parentId);
    if (!folder) return (layer.folderId || "") === parentId ? [{ layer }] : [];
    if (seen.has(folder.id)) return [];
    seen.add(folder.id);
    return [{ folder, layers: rasterFolderMembers(layers, folders, folder.id) }];
  });
}

export function groupRasterLayers(document, ids, id) {
  const { layers, folders = [] } = document;
  const members = layers.filter(layer => ids.includes(layer.id));
  if (!members.length || members.some(layer => rasterLayerLocked(layer, folders))) return document;
  const names = new Set(folders.map(folder => folder.name));
  let number = 1; while (names.has(`Folder ${number}`)) number++;
  // Place the new contiguous group at the highest selected layer, keeping its internal stack order.
  const top = layers.indexOf(members.at(-1));
  const below = layers.slice(0, top + 1).filter(layer => !ids.includes(layer.id));
  const next = [...below, ...members.map(layer => ({ ...layer, folderId: id })), ...layers.slice(top + 1)];
  const parentId = members.every(layer => layer.folderId === members[0].folderId) ? members[0].folderId : "";
  const nextFolders = [...folders, { id, name: `Folder ${number}`, visible: true, locked: false, collapsed: false, ...(parentId ? { parentId } : {}) }];
  return { ...document, layers: makeFoldersContiguous(next, nextFolders), folders: pruneRasterFolders(next, nextFolders) };
}

function makeFoldersContiguous(layers, folders) {
  const flatten = parentId => rasterStackEntries(layers, folders, parentId).flatMap(entry => entry.layer ? [entry.layer] : flatten(entry.folder.id));
  return flatten("");
}

export function ungroupRasterFolder(document, id) {
  const folder = document.folders?.find(folder => folder.id === id);
  if (!folder || rasterLayerLocked({ folderId: id }, document.folders)) return document;
  return { ...document, layers: document.layers.map(layer => layer.folderId === id ? folder.parentId ? { ...layer, folderId: folder.parentId } : withoutFolder(layer) : layer),
    folders: document.folders.filter(item => item.id !== id).map(item => {
      if (item.parentId !== id) return item;
      const { parentId, ...rest } = item; return folder.parentId ? { ...rest, parentId: folder.parentId } : rest;
    }) };
}

export function duplicateRasterFolder(document, id, createId) {
  const folder = document.folders?.find(item => item.id === id);
  const members = rasterFolderMembers(document.layers, document.folders, id);
  if (!folder || !members.length || members.some(layer => rasterLayerLocked(layer, document.folders))) return document;
  const subtree = document.folders.filter(item => rasterFolderAncestors(item.id, document.folders).some(parent => parent.id === id));
  const ids = new Map(subtree.map(item => [item.id, createId()])), folderId = ids.get(id);
  const copies = members.map(layer => ({ ...layer, id: createId(), folderId: ids.get(layer.folderId) }));
  const layers = [...document.layers]; layers.splice(layers.indexOf(members.at(-1)) + 1, 0, ...copies);
  return { ...document, layers, folders: [...document.folders, ...subtree.map(item => ({ ...item, id: ids.get(item.id), ...(item.parentId ? { parentId: ids.get(item.parentId) || item.parentId } : {}), name: item.id === id ? `${item.name} copy`.slice(0, 100) : item.name }))], selectedIds: copies.map(layer => layer.id), selectedFolderId: folderId };
}

export function moveRasterLayersToFolder(document, ids, folderId = "") {
  const { layers, folders = [] } = document;
  const target = folders.find(folder => folder.id === folderId);
  if (folderId && (!target || rasterLayerLocked({ folderId }, folders))) return document;
  const members = layers.filter(layer => ids.includes(layer.id));
  if (!members.length || members.some(layer => rasterLayerLocked(layer, folders))) return document;
  if (members.every(layer => (layer.folderId || "") === folderId)) return document;
  const remaining = layers.filter(layer => !ids.includes(layer.id));
  const moved = members.map(layer => folderId ? { ...layer, folderId } : withoutFolder(layer));
  // Dropping outside a folder puts the selection directly above its former stack position.
  const anchor = folderId ? layers.indexOf(rasterFolderMembers(layers, folders, folderId).at(-1)) : layers.indexOf(members.at(-1));
  const insertion = layers.slice(0, anchor + 1).filter(layer => !ids.includes(layer.id)).length;
  remaining.splice(insertion, 0, ...moved);
  const next = makeFoldersContiguous(remaining, folders);
  return { ...document, layers: next, folders: pruneRasterFolders(next, folders) };
}

export function moveRasterStackToRoot(document, ids, { folderId = "", anchorId = "", edge = "top" } = {}) {
  const { layers, folders = [] } = document;
  const members = layers.filter(layer => ids.includes(layer.id));
  if (!members.length || members.some(layer => rasterLayerLocked(layer, folders))) return document;
  if (!["top", "bottom", "above"].includes(edge)) return document;
  if (folderId) {
    const descendants = rasterFolderMembers(layers, folders, folderId);
    if (!folders.some(folder => folder.id === folderId) || descendants.length !== members.length || descendants.some(layer => !ids.includes(layer.id))) return document;
  }
  const remaining = layers.filter(layer => !ids.includes(layer.id));
  let insertion = edge === "bottom" ? 0 : remaining.length;
  if (edge === "above") {
    const entry = rasterStackEntries(layers, folders).find(item => (item.folder?.id || item.layer?.id) === anchorId);
    if (!entry) return document;
    const anchor = entry.layer || entry.layers.at(-1);
    insertion = layers.slice(0, layers.indexOf(anchor) + 1).filter(layer => !ids.includes(layer.id)).length;
  }
  const moved = folderId ? members : members.map(withoutFolder);
  remaining.splice(insertion, 0, ...moved);
  const nextFolders = folderId ? folders.map(folder => {
    if (folder.id !== folderId) return folder;
    const { parentId, ...rootFolder } = folder; return rootFolder;
  }) : folders;
  return { ...document, layers: remaining, folders: pruneRasterFolders(remaining, nextFolders) };
}

export function reorderRasterStack(document, ids, targetId, folderId = "") {
  const { layers, folders = [] } = document;
  const targetFolder = folders.find(folder => folder.id === targetId);
  const target = layers.find(layer => layer.id === targetId);
  if ((!target && !targetFolder) || (targetFolder && rasterLayerLocked({ folderId: targetId }, folders)) || (target && rasterLayerLocked(target, folders))) return document;
  const members = layers.filter(layer => ids.includes(layer.id));
  if (!members.length || members.some(layer => rasterLayerLocked(layer, folders))) return document;
  const destination = folderId ? (targetFolder?.id || target?.folderId || targetId) : targetId;
  const targetMembers = folders.some(folder => folder.id === destination) ? rasterFolderMembers(layers, folders, destination) : layers.filter(layer => layer.id === destination);
  if (!targetMembers.length || targetMembers.some(layer => ids.includes(layer.id))) return document;
  const remaining = layers.filter(layer => !ids.includes(layer.id));
  const after = layers.indexOf(members[0]) < layers.indexOf(targetMembers[0]);
  const anchor = after ? targetMembers.at(-1) : targetMembers[0];
  const moved = folderId ? members : members.map(layer => target?.folderId ? { ...layer, folderId: target.folderId } : withoutFolder(layer));
  remaining.splice(remaining.indexOf(anchor) + Number(after), 0, ...moved);
  const nextFolders = folderId ? folders.map(folder => {
    if (folder.id !== folderId) return folder;
    const { parentId, ...rest } = folder;
    const parent = targetFolder?.parentId || (target?.folderId && target.folderId !== folderId ? target.folderId : "");
    return parent ? { ...rest, parentId: parent } : rest;
  }) : folders;
  const next = makeFoldersContiguous(remaining, nextFolders);
  return { ...document, layers: next, folders: pruneRasterFolders(next, nextFolders) };
}

import { useEffect, useRef, useState } from "react";
import { newtPresetsApi } from "../api/newtApi.js";

export function useNewtPresets(adapter) {
  const live = useRef(adapter); live.current = adapter;
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [bindings, setBindings] = useState({});
  const operation = useRef(false);
  useEffect(() => {
    let cancelled = false;
    newtPresetsApi.list().then((result) => { if (!cancelled) setItems(result); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { setDraft(null); setBindings({}); }, [adapter.projectId]);

  async function perform(action) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (err) { setError(err.message); }
    finally { operation.current = false; setBusy(false); }
  }
  const refresh = () => perform(async () => setItems(await newtPresetsApi.list()));
  function beginSave() {
    if (operation.current) return;
    try { setError(""); setDraft(live.current.capture()); }
    catch (err) { live.current.onStatus(err.message); }
  }
  const save = (name, slots = []) => perform(async () => {
    const preset = await newtPresetsApi.save({ name, graph: { ...draft, slots } });
    setItems((current) => [...current, { id: preset.id, name: preset.name, nodeCount: preset.graph.nodes.length, slots: preset.graph.slots || [], isSystem: false }].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(preset.id); setDraft(null);
    live.current.onStatus(`Newt Preset saved: ${preset.name}`);
  });
  const insert = (id = selectedId, replacements = bindings) => perform(async () => {
    if (!id) return;
    const projectId = live.current.projectId;
    const canvasId = live.current.canvasId;
    const preset = await newtPresetsApi.get(id);
    if (projectId !== live.current.projectId) throw new Error("Project changed. Select the preset again in this project.");
    if (canvasId !== live.current.canvasId) throw new Error("Canvas changed. Select the preset again on the intended canvas.");
    await live.current.insert(preset.graph, replacements);
    live.current.onStatus(`Inserted Newt Preset: ${preset.name}`);
  });
  const remove = (id = selectedId) => {
    if (operation.current) return;
    const selected = items.find((item) => item.id === id);
    if (selected?.isSystem !== false) return;
    if (!selected || !window.confirm(`Delete Newt Preset "${selected.name}"? Nodes already placed in projects will be kept.`)) return;
    return perform(async () => {
      await newtPresetsApi.remove(selected.id);
      setItems((current) => current.filter((item) => item.id !== selected.id)); setSelectedId("");
    });
  };
  const insertForAgent = async (id, replacements = {}, expectedRevision) => {
    if (operation.current) throw new Error("The preset library is busy.");
    const projectId = live.current.projectId;
    const preset = await newtPresetsApi.get(id);
    if (projectId !== live.current.projectId) throw new Error("Project changed before preset insertion.");
    if (expectedRevision && preset.revision !== expectedRevision) throw new Error("The preset changed after Newt inspected it. Read the updated preset before inserting; no nodes were added.");
    return live.current.insert(preset.graph, replacements, { agent: true });
  };
  const insertGraphForAgent = (graph, options = {}) => {
    if (operation.current) throw new Error("The preset library is busy.");
    return live.current.insert(graph, {}, { ...options, agent: true });
  };
  return { items, selectedId, select: (id) => { setSelectedId(id); setBindings({}); }, busy, error, draft, beginSave, save, insert, insertForAgent, remove, refresh,
    insertGraphForAgent, bindings, bind: (id, value) => setBindings((current) => ({ ...current, [id]: value })), candidates: adapter.getNodes?.() || [],
    cancel: () => { if (!operation.current) { setDraft(null); setError(""); } } };
}

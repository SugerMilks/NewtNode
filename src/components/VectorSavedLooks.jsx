import React from "react";
import { Save, Trash2, Check, X } from "lucide-react";
import { vectorDesignLook } from "../vectorDesignLooks.js";
import { ideogramVectorApi } from "../api/newtApi.js";

export default function VectorSavedLooks({ data, moodBoards, update, api = ideogramVectorApi }) {
  const [looks, setLooks] = React.useState([]), [selected, setSelected] = React.useState(""), [name, setName] = React.useState(""), [naming, setNaming] = React.useState(false), [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const alive = React.useRef(true), loaded = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function load() {
    if (!api.looks || loaded.current) return;
    loaded.current = true;
    try { const result = await api.looks(); if (alive.current) setLooks(current => [...new Map([...result.looks, ...current].map(look => [look.id, look])).values()].sort((a, b) => a.name.localeCompare(b.name))); }
    catch (e) { loaded.current = false; if (alive.current) setError(e.message); }
  }
  async function save(event) {
    event.preventDefault(); if (busy || !name.trim() || !api.saveLook) return;
    setBusy(true); setError("");
    try { const { look } = await api.saveLook({ id: crypto.randomUUID(), name: name.trim(), settings: vectorDesignLook(data, moodBoards.length ? moodBoards : data.vectorSavedMoodBoards) });
      if (alive.current) { setLooks(current => [...current, look].sort((a, b) => a.name.localeCompare(b.name))); setSelected(look.id); setNaming(false); setName(""); }
    } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); }
  }
  async function remove() {
    if (!selected || busy || !api.removeLook || !window.confirm("Remove this saved look? Existing artwork and applied references are kept.")) return;
    setBusy(true); setError("");
    try { await api.removeLook(selected); if (alive.current) { setLooks(current => current.filter(item => item.id !== selected)); setSelected(""); } }
    catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); }
  }
  return <div className="vector-saved-looks">
    <div className="vector-look-row"><select aria-label="Saved design look" value={selected} onFocus={() => void load()} disabled={busy} onChange={event => {
      const look = looks.find(item => item.id === event.target.value); setSelected(event.target.value); if (look) update(vectorDesignLook(look.settings));
    }}><option value="">Saved looks</option>{looks.map(look => <option key={look.id} value={look.id}>{look.name}</option>)}</select>
      <button type="button" className="vector-icon" aria-label="Save design look" title="Save palette, lettering, references and generation settings; excludes the brief and generated artwork" disabled={busy || !api.saveLook} onClick={() => { void load(); setNaming(true); }}><Save size={16} /></button>
      {selected && <button type="button" className="vector-icon" aria-label="Delete saved look" title="Remove this saved look, keeping all artwork" disabled={busy} onClick={() => void remove()}><Trash2 size={16} /></button>}
    </div>
    {naming && <form className="vector-look-row" onSubmit={save}><input autoFocus aria-label="Design look name" placeholder="Look name" maxLength="80" value={name} onChange={event => setName(event.target.value)} /><button type="submit" className="vector-icon" aria-label="Confirm save look" disabled={busy || !name.trim()}><Check size={16} /></button><button type="button" className="vector-icon" aria-label="Cancel saving look" disabled={busy} onClick={() => setNaming(false)}><X size={16} /></button></form>}
    {error && <span className="node-error" role="alert">{error}</span>}
  </div>;
}

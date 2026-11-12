import React from "react";
import { FolderOpen, Loader2, Save } from "lucide-react";
import { looksApi, outputApi } from "../api/newtApi.js";

export default function SharedLooksFolder({ directory, onChange }) {
  const [value, setValue] = React.useState(directory), [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const working = React.useRef(false), live = React.useRef(true);
  React.useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  React.useEffect(() => setValue(directory), [directory]);
  async function run(action) {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    try { await action(); } catch (e) { if (live.current) setError(e.message); }
    finally { working.current = false; if (live.current) setBusy(false); }
  }
  return <>
    <form className="looks-folder" onSubmit={event => { event.preventDefault(); run(async () => { const result = await looksApi.connectShared(value); if (live.current) onChange(result.directory); }); }}>
      <label htmlFor="looks-shared-folder">Shared User Looks</label>
      <input id="looks-shared-folder" placeholder="Not connected" value={value} disabled={busy} onChange={event => setValue(event.target.value)} title="Use the same shared or synced folder as your collaborator, separate from the main image catalog. An empty path disconnects sharing without deleting looks." />
      <button type="button" className="look-icon" title="Browse Shared User Looks" disabled={busy} onClick={() => run(async () => { const result = await outputApi.selectFolder({ title: "Choose Shared User Looks folder", defaultPath: value }); if (live.current && !result.canceled && result.path) setValue(result.path); })}><FolderOpen size={18} /></button>
      <button type="submit" disabled={busy || value === directory} title="Connect this folder without moving or sharing existing local looks">{busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}Save</button>
    </form>
    {error && <p className="look-error" role="alert">{error}</p>}
  </>;
}

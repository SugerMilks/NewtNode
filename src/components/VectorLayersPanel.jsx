import React from "react";
import { Layers, Save, LoaderCircle, RefreshCw } from "lucide-react";

export function VectorLayersPanel({ onToggle, editor }) {
  const { dirty, pending, saving, doc, error } = editor;
  return <section className="vector-layers">
    <div className="vector-layers-header">
      <button type="button" className="vector-layers-heading" aria-haspopup="dialog" onClick={onToggle}><Layers size={16} />Edit Artwork{dirty && <span className="vector-dirty" title="Unsaved layer edits" />}</button>
      {dirty && <button type="button" className="vector-save-version" disabled={pending || saving || !doc || Boolean(error)} title="Save the current layer edits as a new draggable image. Keeps the original; no AI generation." onClick={() => editor.save()}><Save size={14} />Save Version</button>}
    </div>
    {(pending || saving) && !error && <span className="vector-layer-status" role="status"><LoaderCircle size={14} />{saving ? "Saving artwork..." : "Updating layers..."}</span>}
    {error && <div className="vector-layer-error"><span role="alert">{error}</span><button type="button" className="vector-icon" title="Reload vector layers" aria-label="Reload vector layers" disabled={saving} onClick={editor.retry}><RefreshCw size={14} /></button></div>}
  </section>;
}

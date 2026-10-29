import { useState } from "react";
import { Workflow, RefreshCw, Trash2 } from "lucide-react";
import { newtPresetDisplayName } from "../myNewt/presets.js";
import { SidebarMenu } from "./SidebarMenu.jsx";

export function PresetWorkflowPicker({ controller: presets, insertionDisabled = false }) {
  const [open, setOpen] = useState(false);
  const error = presets.error && !presets.draft;
  return <SidebarMenu label="Preset Workflows" icon={Workflow} open={open} onOpenChange={setOpen} busy={presets.busy} disabled={presets.busy} error={Boolean(error)}
    title={error ? `Preset Workflows: ${presets.error}` : insertionDisabled ? "Preset Workflows - pause Newt before inserting a preset" : "Preset Workflows"} menuClassName="preset-workflow-menu">
      {!presets.items.length && <small>No saved presets</small>}
      {presets.items.map(preset => <div className="preset-workflow-row" role="none" key={preset.id}>
        <button type="button" role="menuitem" className="preset-workflow-load" aria-label={`Insert ${newtPresetDisplayName(preset)}`}
          title={insertionDisabled ? "Pause Newt before inserting a preset" : `Insert ${newtPresetDisplayName(preset)}`}
          disabled={presets.busy || insertionDisabled} onClick={() => { presets.insert(preset.id, {}); }}>
          <span>{preset.name}</span><small>({preset.isSystem ? "System" : "User"})</small>
        </button>
        {preset.isSystem === false && <button type="button" role="menuitem" className="preset-workflow-delete"
          title={`Delete ${preset.name}`} aria-label={`Delete ${preset.name}`} disabled={presets.busy}
          onClick={() => { presets.remove(preset.id); }}><Trash2 size={14} aria-hidden="true" /></button>}
      </div>)}
    {error && <div className="preset-workflow-error-row">
      <p className="preset-workflow-error" role="alert">{presets.error}</p>
      <button type="button" role="menuitem" data-menu-keep-open title="Reload presets" aria-label="Reload presets" disabled={presets.busy} onClick={presets.refresh}><RefreshCw size={15} /></button>
    </div>}
  </SidebarMenu>;
}

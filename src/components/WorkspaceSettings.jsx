import React from "react";
import { RotateCcw } from "lucide-react";

export function WorkspaceSettings({ enabled, onToggle, toggleDisabled, restarting, restartRequested, onRestart, restartDisabled }) {
  return <section className="stats-panel settings-panel settings-workspace-panel">
    <h2>Workspace</h2>
    <div className="settings-workspace-row">
      <span>Newt <small><em>Access to an automation agent node</em></small></span>
      <button type="button" className={`settings-key-toggle ${enabled ? "enabled" : ""}`} role="switch"
        aria-label="Show Newt in node menus" aria-checked={enabled} disabled={toggleDisabled}
        title="Show or hide Newt in the node menus. Existing project nodes stay available."
        onClick={() => onToggle(!enabled)}>
        <span className="settings-key-toggle-track" aria-hidden="true"><span /></span>
        <em>{enabled ? "Enabled" : "Disabled"}</em>
      </button>
    </div>
    <div className="settings-workspace-row">
      <span>Server <small role="status">{restarting ? "Restarting" : restartRequested ? "Queued" : "Ready"}</small></span>
      <div className="settings-actions">
        <button type="button" onClick={onRestart} disabled={restartDisabled} title="Restart local server">
          <RotateCcw className={restarting ? "spin" : ""} size={15} />
          <span>{restarting ? "Restarting" : "Restart"}</span>
        </button>
      </div>
    </div>
  </section>;
}

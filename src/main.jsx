import React from "react";
import { createRoot } from "react-dom/client";
import { Loader2 } from "lucide-react";
import { settingsApi } from "./api/newtApi.js";
import { nodePreferencesEvent, normalizeNodePreferences } from "./nodePreferences.js";
import { installClientDiagnostics, reportClientDiagnostic } from "./clientDiagnostics.js";
import { installGenerationChimeUnlock } from "./generationChime.js";
import { FullResolutionImageContextMenu } from "./components/FullResolutionImageContextMenu.jsx";
import { defaultModelPreferences, normalizeModelPreferences } from "./modelOptions.js";
import "./styles.css";
import { usePricingSync } from "./usePricing.js";

installClientDiagnostics();
installGenerationChimeUnlock();

const NodeEditor = React.lazy(() => import("./NodeEditor.jsx"));
const StatsDashboard = React.lazy(() => import("./StatsDashboard.jsx"));
const SettingsPage = React.lazy(() => import("./SettingsPage.jsx"));

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportClientDiagnostic("react-error-boundary", {
      message: error?.message,
      stack: [error?.stack, info?.componentStack].filter(Boolean).join("\n")
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-recovery-screen">
        <strong>NewtNode hit a display error.</strong>
        <span>Your local project files and completed generations are still available.</span>
        <button type="button" onClick={() => window.location.reload()}>Reload NewtNode</button>
      </main>
    );
  }
}


function normalizeNodeStatus(status) {
  if (!status) return { title: "", message: "", workflowPath: "", workflowState: "" };
  if (typeof status === "string") return { title: status, message: status, workflowPath: "", workflowState: "" };

  const message = String(status.message || "").trim();
  const workflowPath = String(status.workflowPath || "").trim();
  const workflowState = status.workflowState === "unsaved" ? "unsaved" : status.workflowState === "saved" ? "saved" : "";
  const title = workflowPath ? `${workflowState === "unsaved" ? "Unsaved" : "Saved"} ${workflowPath}${message ? ` - ${message}` : ""}` : message;

  return {
    title,
    message,
    workflowPath,
    workflowState
  };
}

function App() {
  usePricingSync();
  const [modelPreferences, setModelPreferences] = React.useState(defaultModelPreferences);
  const [modelPreferencesLoaded, setModelPreferencesLoaded] = React.useState(false);
  const [nodePreferences, setNodePreferences] = React.useState(() => normalizeNodePreferences());
  const nodePreferencesUpdatedRef = React.useRef(false);
  const [workspaceMode, setWorkspaceMode] = React.useState("nodes");
  const [nodeStatus, setNodeStatus] = React.useState("");
  const nodeStatusInfo = normalizeNodeStatus(nodeStatus);

  React.useEffect(() => {
    refreshModelPreferences();
  }, []);

  React.useEffect(() => {
    const update = (event) => {
      nodePreferencesUpdatedRef.current = true;
      setNodePreferences(normalizeNodePreferences(event.detail));
    };
    window.addEventListener(nodePreferencesEvent, update);
    return () => window.removeEventListener(nodePreferencesEvent, update);
  }, []);

  React.useEffect(() => {
    function handleModelSettingsUpdated(event) {
      const nextPreferences = normalizeModelPreferences(event.detail);
      setModelPreferences(nextPreferences);
      setModelPreferencesLoaded(true);
    }

    window.addEventListener("newtnode:model-settings-updated", handleModelSettingsUpdated);
    return () => window.removeEventListener("newtnode:model-settings-updated", handleModelSettingsUpdated);
  }, []);

  async function refreshModelPreferences() {
    try {
      const data = await settingsApi.load();
      setModelPreferences(normalizeModelPreferences(data.modelPreferences));
      if (!nodePreferencesUpdatedRef.current) setNodePreferences(normalizeNodePreferences(data.nodePreferences));
    } catch {
      setModelPreferences(defaultModelPreferences);
    } finally {
      setModelPreferencesLoaded(true);
    }
  }

  return (
    <main className={`app-shell ${workspaceMode === "nodes" ? "node-app-shell" : ""}`}>
      <FullResolutionImageContextMenu />
      <div className="topbar">
        <div className="brand-lockup" aria-label="Versus NewtNode">
          <img src="/newtnode-logo.png" alt="Versus NewtNode" />
        </div>
        <nav className="mode-switch" aria-label="Workspace">
          <button className={workspaceMode === "nodes" ? "active" : ""} aria-current={workspaceMode === "nodes" ? "page" : undefined} onClick={() => setWorkspaceMode("nodes")}>
            Projects
          </button>
          <button className={workspaceMode === "stats" ? "active" : ""} aria-current={workspaceMode === "stats" ? "page" : undefined} onClick={() => setWorkspaceMode("stats")}>
            Stats
          </button>
          <button className={workspaceMode === "settings" ? "active" : ""} aria-current={workspaceMode === "settings" ? "page" : undefined} onClick={() => setWorkspaceMode("settings")}>
            Settings
          </button>
        </nav>
        {workspaceMode === "nodes" && nodeStatusInfo.title && (
          <div className={`topbar-status ${nodeStatusInfo.workflowState ? `workflow-${nodeStatusInfo.workflowState}` : ""}`} role="status" title={nodeStatusInfo.title}>
            {nodeStatusInfo.workflowPath ? (
              <span className="topbar-status-state">{nodeStatusInfo.workflowState === "unsaved" ? "Unsaved" : "Saved"}</span>
            ) : (
              nodeStatusInfo.title
            )}
          </div>
        )}
      </div>

      {workspaceMode === "stats" ? (
        <React.Suspense fallback={<WorkspaceFallback label="Loading stats" />}>
          <StatsDashboard />
        </React.Suspense>
      ) : workspaceMode === "settings" ? (
        <React.Suspense fallback={<WorkspaceFallback label="Loading settings" />}>
          <SettingsPage />
        </React.Suspense>
      ) : null}

      <div className={`nodes-tab-keepalive ${workspaceMode === "nodes" ? "active" : ""}`} aria-hidden={workspaceMode !== "nodes"}>
        <React.Suspense fallback={<WorkspaceFallback label="Loading projects" />}>
          <NodeEditor active={workspaceMode === "nodes"} onStatusChange={setNodeStatus} modelPreferences={modelPreferences} modelPreferencesReady={modelPreferencesLoaded} nodePreferences={nodePreferences} />
        </React.Suspense>
      </div>
    </main>
  );
}

function WorkspaceFallback({ label }) {
  return (
    <div className="status-panel generating">
      <span className="status-icon"><Loader2 className="spin" size={18} /></span>
      <span>{label}</span>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

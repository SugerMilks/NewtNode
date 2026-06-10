import React from "react";
import {
  Eye,
  EyeOff,
  GitPullRequest,
  KeyRound,
  RefreshCcw,
  RotateCcw,
  Save
} from "lucide-react";
import { settingsApi } from "./api/newtApi.js";
import {
  defaultModelPreferences,
  imageModelOptions,
  normalizeModelPreferences,
  videoModelOptions
} from "./modelOptions.js";

export default function SettingsPage() {
  const [settings, setSettings] = React.useState(null);
  const [falKey, setFalKey] = React.useState("");
  const [falKeyVisible, setFalKeyVisible] = React.useState(false);
  const [googleApiKey, setGoogleApiKey] = React.useState("");
  const [googleApiKeyVisible, setGoogleApiKeyVisible] = React.useState(false);
  const [repository, setRepository] = React.useState("");
  const [modelPreferences, setModelPreferences] = React.useState(defaultModelPreferences);
  const [status, setStatus] = React.useState("loading");
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [updateLog, setUpdateLog] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const initialSecretsRef = React.useRef({ falKey: "", googleApiKey: "" });
  const actionsDisabled = status === "loading" || Boolean(busy);

  React.useEffect(() => {
    refreshSettings();
  }, []);

  async function refreshSettings() {
    try {
      setStatus((current) => (current === "loading" ? "loading" : "refreshing"));
      const data = await settingsApi.load();
      applyLoadedSettings(data);
      setStatus("ready");
      setMessage(data.apiKeysFound ? "" : "No API keys found.");
      setLastUpdated(new Date());
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not load settings.");
    }
  }

  async function saveSettings() {
    setBusy("save");
    setMessage("");
    setUpdateLog("");
    try {
      const initialSecrets = initialSecretsRef.current;
      const nextModelPreferences = normalizeModelPreferences(modelPreferences);
      const payload = { repository, modelPreferences: nextModelPreferences };
      if (falKey !== initialSecrets.falKey) payload.falKey = falKey;
      if (googleApiKey !== initialSecrets.googleApiKey) payload.googleApiKey = googleApiKey;

      const savedData = await settingsApi.save(payload);
      const loadedData = await settingsApi.load();
      const savedModelPreferences = hasModelPreferences(loadedData)
        ? normalizeModelPreferences(loadedData.modelPreferences)
        : hasModelPreferences(savedData)
          ? normalizeModelPreferences(savedData.modelPreferences)
          : nextModelPreferences;
      const data = {
        ...(loadedData || {}),
        modelPreferences: savedModelPreferences
      };
      applyLoadedSettings(data);
      dispatchModelPreferences(savedModelPreferences);
      setMessage(data.apiKeysFound ? "Settings saved." : "No API keys found.");
      setLastUpdated(new Date());
    } catch (error) {
      setMessage(error.message || "Could not save settings.");
    } finally {
      setBusy("");
    }
  }

  async function updateFromRepository() {
    setBusy("update");
    setMessage("");
    setUpdateLog("");
    try {
      const data = await settingsApi.update({ repository });
      const output = [data.stdout, data.stderr].filter(Boolean).join("\n").trim() || "Already up to date.";
      setSettings((current) => ({
        ...(current || {}),
        repository: data.repository || repository,
        branch: data.branch || current?.branch || "",
        branchStatus: data.branchStatus || current?.branchStatus,
        updateInProgress: false
      }));
      setRepository(data.repository || repository);
      setUpdateLog(output);
      setMessage(data.branchStatus?.label || `Updated ${data.branch || "current branch"}.`);
      setLastUpdated(new Date());
    } catch (error) {
      setMessage(error.message || "Update failed.");
    } finally {
      setBusy("");
    }
  }

  async function restartServer() {
    setBusy("restart");
    setMessage("Restarting server...");
    setUpdateLog("");
    try {
      await settingsApi.restart();
    } catch (error) {
      setMessage(`${error.message || "Restart request did not return."} Waiting for the server...`);
    }
    await waitForServerAndReload();
  }

  function applyLoadedSettings(data) {
    const secrets = {
      falKey: data.secrets?.falKey || "",
      googleApiKey: data.secrets?.googleApiKey || ""
    };
    initialSecretsRef.current = secrets;
    setSettings(data);
    setFalKey(secrets.falKey);
    setGoogleApiKey(secrets.googleApiKey);
    setRepository(data.repository || "");
    setModelPreferences(normalizeModelPreferences(data.modelPreferences));
  }

  function updateModelPreference(kind, model, enabled) {
    setModelPreferences((current) =>
      normalizeModelPreferences({
        ...current,
        [kind]: {
          ...(current?.[kind] || {}),
          [model]: enabled
        }
      })
    );
  }

  return (
    <section className="stats-page settings-page">
      <header className="stats-hero settings-hero">
        <div>
          <span className="stats-kicker">Runtime</span>
          <h1>Settings</h1>
        </div>
        <button onClick={refreshSettings} disabled={status === "loading" || status === "refreshing" || Boolean(busy)} title="Refresh settings">
          <RefreshCcw className={status === "refreshing" ? "spin" : ""} size={17} />
          <span>{lastUpdated ? `Updated ${timeLabel(lastUpdated)}` : "Syncing"}</span>
        </button>
      </header>

      <div className="stats-metrics settings-metrics">
        <SettingsMetric icon={<KeyRound size={20} />} label="Fal Key" value={settings?.falKeyConfigured ? "Configured" : "Not set"} detail={keyDetail(settings?.keySources?.fal, status)} tone={settings?.falKeyConfigured ? "good" : ""} />
        <SettingsMetric icon={<KeyRound size={20} />} label="Google API" value={settings?.googleApiKeyConfigured ? "Configured" : "Not set"} detail={keyDetail(settings?.keySources?.google, status)} tone={settings?.googleApiKeyConfigured ? "good" : ""} />
        <SettingsMetric icon={<GitPullRequest size={20} />} label="Branch" value={branchMetricValue(settings)} detail={branchMetricDetail(settings)} tone={settings?.branchStatus?.state === "up-to-date" ? "good" : settings?.branchStatus?.state === "update-available" ? "warn" : ""} />
        <SettingsMetric icon={<RotateCcw size={20} />} label="Server" value={settings?.restartRequested ? "Restarting" : "Running"} detail="Local app" tone={settings?.restartRequested ? "warn" : "good"} />
      </div>

      <div className="settings-grid">
        <section className="stats-panel settings-panel wide">
          <SettingsPanelTitle title="API Keys" aside="Stored locally" />
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Fal Key</span>
              <div className="settings-input-row secret">
                <KeyRound size={15} />
                <input
                  type={falKeyVisible ? "text" : "password"}
                  value={falKey}
                  onChange={(event) => setFalKey(event.target.value)}
                  placeholder={secretPlaceholder(settings?.keySources?.fal, "Fal")}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="settings-secret-toggle"
                  onClick={() => setFalKeyVisible((value) => !value)}
                  disabled={!falKey}
                  title={falKeyVisible ? "Hide Fal key" : "Show Fal key"}
                  aria-label={falKeyVisible ? "Hide Fal key" : "Show Fal key"}
                >
                  {falKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            <label className="settings-field">
              <span>Google API</span>
              <div className="settings-input-row secret">
                <KeyRound size={15} />
                <input
                  type={googleApiKeyVisible ? "text" : "password"}
                  value={googleApiKey}
                  onChange={(event) => setGoogleApiKey(event.target.value)}
                  placeholder={secretPlaceholder(settings?.keySources?.google, "Google API")}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="settings-secret-toggle"
                  onClick={() => setGoogleApiKeyVisible((value) => !value)}
                  disabled={!googleApiKey}
                  title={googleApiKeyVisible ? "Hide Google API key" : "Show Google API key"}
                  aria-label={googleApiKeyVisible ? "Hide Google API key" : "Show Google API key"}
                >
                  {googleApiKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={saveSettings} disabled={actionsDisabled}>
              <Save size={15} />
              <span>{busy === "save" ? "Saving" : "Save"}</span>
            </button>
          </div>
        </section>

        <section className="stats-panel settings-panel wide">
          <SettingsPanelTitle title="Enabled Models" aside="Dropdown visibility" />
          <div className="settings-model-grid">
            <ModelToggleGroup
              title="Image Models"
              kind="image"
              options={imageModelOptions}
              values={modelPreferences.image}
              onToggle={updateModelPreference}
            />
            <ModelToggleGroup
              title="Video Models"
              kind="video"
              options={videoModelOptions}
              values={modelPreferences.video}
              onToggle={updateModelPreference}
            />
          </div>
          <div className="settings-actions">
            <button type="button" onClick={saveSettings} disabled={actionsDisabled}>
              <Save size={15} />
              <span>{busy === "save" ? "Saving" : "Save Models"}</span>
            </button>
          </div>
        </section>

        <section className="stats-panel settings-panel">
          <SettingsPanelTitle title="Repository" aside={settings?.branch || "Current branch"} />
          <label className="settings-field">
            <span>Repository Field</span>
            <input
              className="settings-repository-input"
              type="text"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              placeholder="https://github.com/kungfukoi/Newt_Node"
            />
          </label>
          <div className="settings-actions">
            <button type="button" onClick={updateFromRepository} disabled={actionsDisabled || !repository.trim()}>
              <RefreshCcw className={busy === "update" ? "spin" : ""} size={15} />
              <span>{busy === "update" ? "Updating" : "Update"}</span>
            </button>
          </div>
        </section>

        <section className="stats-panel settings-panel">
          <SettingsPanelTitle title="Restart" aside={settings?.restartRequested ? "Queued" : "Ready"} />
          <div className="settings-restart-panel">
            <RotateCcw size={28} />
            <strong>{busy === "restart" ? "Restarting" : "Server restart"}</strong>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={restartServer} disabled={actionsDisabled}>
              <RotateCcw className={busy === "restart" ? "spin" : ""} size={15} />
              <span>{busy === "restart" ? "Restarting" : "Restart"}</span>
            </button>
          </div>
        </section>

        {(message || updateLog) && (
          <section className="stats-panel settings-panel wide">
            <SettingsPanelTitle title="Status" aside={busy || status} />
            {message && <p className="settings-message">{message}</p>}
            {updateLog && <pre className="settings-log">{updateLog}</pre>}
          </section>
        )}
      </div>
    </section>
  );
}

function ModelToggleGroup({ title, kind, options, values = {}, onToggle }) {
  return (
    <div className="settings-model-group">
      <strong>{title}</strong>
      <div className="settings-model-list">
        {options.map((model) => {
          const enabled = Boolean(values?.[model]);
          return (
            <label key={model} className={`settings-model-toggle ${enabled ? "enabled" : ""}`}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onToggle(kind, model, event.target.checked)}
              />
              <span className="node-toggle compact">
                <span />
              </span>
              <em>{model}</em>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function dispatchModelPreferences(preferences) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("newtnode:model-settings-updated", {
    detail: normalizeModelPreferences(preferences)
  }));
}

function hasModelPreferences(data) {
  return data?.modelPreferences && typeof data.modelPreferences === "object";
}

function SettingsMetric({ icon, label, value, detail, tone = "" }) {
  return (
    <article className={`metric-card settings-metric ${tone ? `tone-${tone}` : ""}`}>
      <span className="metric-icon">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function keyDetail(source, status) {
  if (source === "env") return ".env";
  if (source === "settings") return "Settings";
  return statusLabel(status);
}

function secretPlaceholder(source, label) {
  if (source === "env") return "Using .env key";
  if (source === "settings") return "Settings override";
  return `Paste ${label} key`;
}

function branchMetricValue(settings) {
  if (!settings?.branchStatus) return settings?.branch || "Unknown";
  return settings.branchStatus.label || settings.branch || "Unknown";
}

function branchMetricDetail(settings) {
  const branchDetail = settings?.branchStatus
    ? settings.branchStatus.detail || settings.branch || "Ready"
    : settings?.updateInProgress ? "Updating" : "Ready";
  const version = versionLabel(settings?.version);
  return version ? `${branchDetail} / ${version}` : branchDetail;
}

function versionLabel(version) {
  const value = String(version || "").trim();
  if (!value) return "";
  return value.startsWith("v") ? value : `v${value}`;
}

function SettingsPanelTitle({ title, aside }) {
  return (
    <div className="panel-title">
      <span>{title}</span>
      {aside && <small>{aside}</small>}
    </div>
  );
}

function statusLabel(status) {
  if (status === "loading") return "Loading";
  if (status === "error") return "Check server";
  return "Ready";
}

function timeLabel(date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

async function waitForServerAndReload() {
  const healthUrl = localServerHealthUrl();
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    await delay(900);
    try {
      const response = await fetch(`${healthUrl}?restart=${Date.now()}`, { cache: "no-store" });
      if (response.ok && Date.now() - startedAt > 1600) {
        window.location.reload();
        return;
      }
    } catch {
      // Keep polling while the server process is between shutdown and startup.
    }
  }
  window.location.reload();
}

function localServerHealthUrl() {
  if (typeof window === "undefined") return "/api/health";
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  if (localHosts.has(window.location.hostname)) return "http://127.0.0.1:3336/api/health";
  return "/api/health";
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

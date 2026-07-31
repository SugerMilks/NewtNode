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

const defaultProviderPreferences = Object.freeze({ fal: true, google: true, krea: true, openAi: true });

export default function SettingsPage() {
  const [settings, setSettings] = React.useState(null);
  const [falKey, setFalKey] = React.useState("");
  const [falKeyVisible, setFalKeyVisible] = React.useState(false);
  const [googleApiKey, setGoogleApiKey] = React.useState("");
  const [googleApiKeyVisible, setGoogleApiKeyVisible] = React.useState(false);
  const [kreaApiKey, setKreaApiKey] = React.useState("");
  const [kreaApiKeyVisible, setKreaApiKeyVisible] = React.useState(false);
  const [openAiApiKey, setOpenAiApiKey] = React.useState("");
  const [openAiApiKeyVisible, setOpenAiApiKeyVisible] = React.useState(false);
  const [repository, setRepository] = React.useState("");
  const [modelPreferences, setModelPreferences] = React.useState(defaultModelPreferences);
  const [providerPreferences, setProviderPreferences] = React.useState(defaultProviderPreferences);
  const [status, setStatus] = React.useState("loading");
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [updateLog, setUpdateLog] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const initialSecretsRef = React.useRef({ falKey: "", googleApiKey: "", kreaApiKey: "", openAiApiKey: "" });
  const modelPreferencesRef = React.useRef(defaultModelPreferences);
  const providerPreferencesRef = React.useRef(defaultProviderPreferences);
  const preferenceSaveQueueRef = React.useRef(Promise.resolve());
  const falKeyInputRef = React.useRef(null);
  const googleApiKeyInputRef = React.useRef(null);
  const kreaApiKeyInputRef = React.useRef(null);
  const openAiApiKeyInputRef = React.useRef(null);
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
    const submittedSecrets = {
      falKey: falKeyInputRef.current?.value ?? falKey,
      googleApiKey: googleApiKeyInputRef.current?.value ?? googleApiKey,
      kreaApiKey: kreaApiKeyInputRef.current?.value ?? kreaApiKey,
      openAiApiKey: openAiApiKeyInputRef.current?.value ?? openAiApiKey
    };
    setBusy("save");
    setMessage("");
    setUpdateLog("");
    try {
      const initialSecrets = initialSecretsRef.current;
      const nextModelPreferences = normalizeModelPreferences(modelPreferences);
      const payload = {
        repository,
        modelPreferences: nextModelPreferences,
        providerPreferences: normalizeProviderPreferences(providerPreferences)
      };
      if (submittedSecrets.falKey !== initialSecrets.falKey) payload.falKey = submittedSecrets.falKey;
      if (submittedSecrets.googleApiKey !== initialSecrets.googleApiKey) payload.googleApiKey = submittedSecrets.googleApiKey;
      if (submittedSecrets.kreaApiKey !== initialSecrets.kreaApiKey) payload.kreaApiKey = submittedSecrets.kreaApiKey;
      if (submittedSecrets.openAiApiKey !== initialSecrets.openAiApiKey) payload.openAiApiKey = submittedSecrets.openAiApiKey;

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
      googleApiKey: data.secrets?.googleApiKey || "",
      kreaApiKey: data.secrets?.kreaApiKey || "",
      openAiApiKey: data.secrets?.openAiApiKey || ""
    };
    initialSecretsRef.current = secrets;
    setSettings(data);
    setFalKey(secrets.falKey);
    setGoogleApiKey(secrets.googleApiKey);
    setKreaApiKey(secrets.kreaApiKey);
    setOpenAiApiKey(secrets.openAiApiKey);
    setRepository(data.repository || "");
    const nextModelPreferences = normalizeModelPreferences(data.modelPreferences);
    const nextProviderPreferences = normalizeProviderPreferences(data.providerPreferences);
    modelPreferencesRef.current = nextModelPreferences;
    providerPreferencesRef.current = nextProviderPreferences;
    setModelPreferences(nextModelPreferences);
    setProviderPreferences(nextProviderPreferences);
  }

  function updateModelPreference(kind, model, enabled) {
    const nextPreferences = normalizeModelPreferences({
      ...modelPreferencesRef.current,
      [kind]: {
        ...(modelPreferencesRef.current?.[kind] || {}),
        [model]: enabled
      }
    });
    modelPreferencesRef.current = nextPreferences;
    setModelPreferences(nextPreferences);
    dispatchModelPreferences(nextPreferences);
    queuePreferenceSave({ modelPreferences: nextPreferences });
  }

  function updateProviderPreference(provider, enabled) {
    const nextPreferences = {
      ...normalizeProviderPreferences(providerPreferencesRef.current),
      [provider]: enabled
    };
    providerPreferencesRef.current = nextPreferences;
    setProviderPreferences(nextPreferences);
    queuePreferenceSave({ providerPreferences: nextPreferences });
  }

  function queuePreferenceSave(payload) {
    setMessage("");
    setUpdateLog("");
    const saveTask = preferenceSaveQueueRef.current
      .catch(() => {})
      .then(() => settingsApi.save(payload));
    preferenceSaveQueueRef.current = saveTask;
    saveTask
      .then((data) => {
        setSettings((current) => ({ ...(current || {}), ...(data || {}) }));
        setLastUpdated(new Date());
      })
      .catch((error) => {
        setMessage(error.message || "Could not save preference.");
      });
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
        <SettingsMetric icon={<KeyRound size={20} />} label="Fal Key" value={providerMetricValue(settings?.falKeyConfigured, providerPreferences.fal)} detail={keyDetail(settings?.keySources?.fal, status, providerPreferences.fal)} tone={providerMetricTone(settings?.falKeyConfigured, providerPreferences.fal)} />
        <SettingsMetric icon={<KeyRound size={20} />} label="Google API" value={providerMetricValue(settings?.googleApiKeyConfigured, providerPreferences.google)} detail={keyDetail(settings?.keySources?.google, status, providerPreferences.google)} tone={providerMetricTone(settings?.googleApiKeyConfigured, providerPreferences.google)} />
        <SettingsMetric icon={<KeyRound size={20} />} label="Krea API" value={providerMetricValue(settings?.kreaApiKeyConfigured, providerPreferences.krea)} detail={keyDetail(settings?.keySources?.krea, status, providerPreferences.krea)} tone={providerMetricTone(settings?.kreaApiKeyConfigured, providerPreferences.krea)} />
        <SettingsMetric icon={<KeyRound size={20} />} label="OpenAI API" value={providerMetricValue(settings?.openAiApiKeyConfigured, providerPreferences.openAi)} detail={keyDetail(settings?.keySources?.openAi, status, providerPreferences.openAi)} tone={providerMetricTone(settings?.openAiApiKeyConfigured, providerPreferences.openAi)} />
        <SettingsMetric icon={<GitPullRequest size={20} />} label="Branch" value={branchMetricValue(settings)} detail={branchMetricDetail(settings)} tone={settings?.branchStatus?.state === "up-to-date" ? "good" : settings?.branchStatus?.state === "update-available" ? "warn" : ""} />
        <SettingsMetric icon={<RotateCcw size={20} />} label="Server" value={settings?.restartRequested ? "Restarting" : "Running"} detail="Local app" tone={settings?.restartRequested ? "warn" : "good"} />
      </div>

      <div className="settings-grid">
        <section className="stats-panel settings-panel wide">
          <SettingsPanelTitle title="API Keys" aside="Stored locally" />
          <div className="settings-form-grid">
            <div className="settings-field">
              <SettingsKeyHeading label="Fal Key" enabled={providerPreferences.fal} onToggle={(enabled) => updateProviderPreference("fal", enabled)} />
              <div className="settings-input-row secret">
                <KeyRound size={15} />
                <input
                  ref={falKeyInputRef}
                  type={falKeyVisible ? "text" : "password"}
                  value={falKey}
                  onInput={(event) => setFalKey(event.currentTarget.value)}
                  onChange={(event) => setFalKey(event.target.value)}
                  placeholder={secretPlaceholder(settings?.keySources?.fal, "Fal")}
                  autoComplete="off"
                  spellCheck="false"
                  aria-label="Fal Key"
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
            </div>

            <div className="settings-field">
              <SettingsKeyHeading label="Google API" enabled={providerPreferences.google} onToggle={(enabled) => updateProviderPreference("google", enabled)} />
              <div className="settings-input-row secret">
                <KeyRound size={15} />
                <input
                  ref={googleApiKeyInputRef}
                  type={googleApiKeyVisible ? "text" : "password"}
                  value={googleApiKey}
                  onInput={(event) => setGoogleApiKey(event.currentTarget.value)}
                  onChange={(event) => setGoogleApiKey(event.target.value)}
                  placeholder={secretPlaceholder(settings?.keySources?.google, "Google API")}
                  autoComplete="off"
                  spellCheck="false"
                  aria-label="Google API"
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
            </div>

            <div className="settings-field">
              <SettingsKeyHeading label="Krea API" enabled={providerPreferences.krea} onToggle={(enabled) => updateProviderPreference("krea", enabled)} />
              <div className="settings-input-row secret">
                <KeyRound size={15} />
                <input
                  ref={kreaApiKeyInputRef}
                  type={kreaApiKeyVisible ? "text" : "password"}
                  value={kreaApiKey}
                  onInput={(event) => setKreaApiKey(event.currentTarget.value)}
                  onChange={(event) => setKreaApiKey(event.target.value)}
                  placeholder={secretPlaceholder(settings?.keySources?.krea, "Krea API")}
                  autoComplete="off"
                  spellCheck="false"
                  aria-label="Krea API"
                />
                <button
                  type="button"
                  className="settings-secret-toggle"
                  onClick={() => setKreaApiKeyVisible((value) => !value)}
                  disabled={!kreaApiKey}
                  title={kreaApiKeyVisible ? "Hide Krea API key" : "Show Krea API key"}
                  aria-label={kreaApiKeyVisible ? "Hide Krea API key" : "Show Krea API key"}
                >
                  {kreaApiKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="settings-field">
              <SettingsKeyHeading label="OpenAI API" enabled={providerPreferences.openAi} onToggle={(enabled) => updateProviderPreference("openAi", enabled)} />
              <div className="settings-input-row secret">
                <KeyRound size={15} />
                <input
                  ref={openAiApiKeyInputRef}
                  type={openAiApiKeyVisible ? "text" : "password"}
                  value={openAiApiKey}
                  onInput={(event) => setOpenAiApiKey(event.currentTarget.value)}
                  onChange={(event) => setOpenAiApiKey(event.target.value)}
                  placeholder={secretPlaceholder(settings?.keySources?.openAi, "OpenAI API")}
                  autoComplete="off"
                  spellCheck="false"
                  aria-label="OpenAI API"
                />
                <button
                  type="button"
                  className="settings-secret-toggle"
                  onClick={() => setOpenAiApiKeyVisible((value) => !value)}
                  disabled={!openAiApiKey}
                  title={openAiApiKeyVisible ? "Hide OpenAI API key" : "Show OpenAI API key"}
                  aria-label={openAiApiKeyVisible ? "Hide OpenAI API key" : "Show OpenAI API key"}
                >
                  {openAiApiKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
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

function SettingsKeyHeading({ label, enabled, onToggle }) {
  return (
    <div className="settings-key-heading">
      <span>{label}</span>
      <button
        type="button"
        className={`settings-key-toggle ${enabled ? "enabled" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
        title={`${enabled ? "Disable" : "Enable"} ${label}`}
        onClick={() => onToggle(!enabled)}
      >
        <span className="settings-key-toggle-track" aria-hidden="true"><span /></span>
        <em>{enabled ? "Enabled" : "Disabled"}</em>
      </button>
    </div>
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

function normalizeProviderPreferences(value = {}) {
  const incoming = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(defaultProviderPreferences).map(([provider, defaultValue]) => [provider, Boolean(incoming[provider] ?? defaultValue)])
  );
}

function providerMetricValue(configured, enabled) {
  if (!enabled) return "Disabled";
  return configured ? "Configured" : "Not set";
}

function providerMetricTone(configured, enabled) {
  return configured && enabled ? "good" : "";
}

function keyDetail(source, status, enabled = true) {
  if (!enabled) return "Key retained locally";
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

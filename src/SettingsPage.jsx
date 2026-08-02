import React from "react";
import {
  Eye,
  EyeOff,
  GitPullRequest,
  KeyRound,
  Minus,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save
} from "lucide-react";
import { settingsApi } from "./api/newtApi.js";
import {
  activateApiKeyVersion,
  addApiKeyVersion,
  apiKeyProviderIds,
  apiKeyProviderPreferences,
  normalizeApiKeyVersions,
  removeApiKeyVersion
} from "./apiKeyVersions.js";
import {
  defaultModelPreferences,
  imageModelOptions,
  normalizeModelPreferences,
  videoModelOptions
} from "./modelOptions.js";

const defaultProviderPreferences = Object.freeze({ fal: true, google: true, krea: true, openAi: true });
const apiKeyProviders = Object.freeze([
  Object.freeze({ id: "fal", label: "Fal Key", placeholder: "Fal" }),
  Object.freeze({ id: "google", label: "Google API", placeholder: "Google API" }),
  Object.freeze({ id: "krea", label: "Krea API", placeholder: "Krea API" }),
  Object.freeze({ id: "openAi", label: "OpenAI API", placeholder: "OpenAI API" })
]);

export default function SettingsPage() {
  const [settings, setSettings] = React.useState(null);
  const [apiKeyVersions, setApiKeyVersions] = React.useState(() => normalizeApiKeyVersions());
  const [visibleApiKeys, setVisibleApiKeys] = React.useState({});
  const [repository, setRepository] = React.useState("");
  const [modelPreferences, setModelPreferences] = React.useState(defaultModelPreferences);
  const [providerPreferences, setProviderPreferences] = React.useState(defaultProviderPreferences);
  const [status, setStatus] = React.useState("loading");
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [updateLog, setUpdateLog] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState(null);
  const modelPreferencesRef = React.useRef(defaultModelPreferences);
  const providerPreferencesRef = React.useRef(defaultProviderPreferences);
  const preferenceSaveQueueRef = React.useRef(Promise.resolve());
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
      const nextModelPreferences = normalizeModelPreferences(modelPreferences);
      const payload = {
        repository,
        modelPreferences: nextModelPreferences,
        apiKeyVersions: serializableApiKeyVersions(apiKeyVersions)
      };

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
    const nextApiKeyVersions = hydrateApiKeyVersions(data);
    setSettings(data);
    setApiKeyVersions(nextApiKeyVersions);
    setVisibleApiKeys({});
    setRepository(data.repository || "");
    const nextModelPreferences = normalizeModelPreferences(data.modelPreferences);
    const nextProviderPreferences = apiKeyProviderPreferences(nextApiKeyVersions);
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

  function updateApiKeyValue(provider, versionIndex, value) {
    setApiKeyVersions((current) => ({
      ...current,
      [provider]: current[provider].map((entry, index) => index === versionIndex ? { ...entry, value } : entry)
    }));
  }

  function updateApiKeyEnabled(provider, versionIndex, enabled) {
    const nextVersions = activateApiKeyVersion(apiKeyVersions, provider, versionIndex, enabled);
    persistApiKeyVersions(nextVersions);
  }

  function addApiKey(provider) {
    persistApiKeyVersions(addApiKeyVersion(apiKeyVersions, provider));
  }

  function removeApiKey(provider, versionIndex) {
    persistApiKeyVersions(removeApiKeyVersion(apiKeyVersions, provider, versionIndex));
    setVisibleApiKeys((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${provider}:`)) delete next[key];
      }
      return next;
    });
  }

  function persistApiKeyVersions(nextVersions) {
    const nextPreferences = apiKeyProviderPreferences(nextVersions);
    setApiKeyVersions(nextVersions);
    providerPreferencesRef.current = nextPreferences;
    setProviderPreferences(nextPreferences);
    queuePreferenceSave({ apiKeyVersions: serializableApiKeyVersions(nextVersions) });
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
        <SettingsMetric icon={<KeyRound size={20} />} label="Fal Key" value={providerMetricValue(settings?.falKeyConfigured, providerPreferences.fal)} detail={providerKeyDetail(settings, "fal", status, providerPreferences.fal)} tone={providerMetricTone(settings?.falKeyConfigured, providerPreferences.fal)} />
        <SettingsMetric icon={<KeyRound size={20} />} label="Google API" value={providerMetricValue(settings?.googleApiKeyConfigured, providerPreferences.google)} detail={providerKeyDetail(settings, "google", status, providerPreferences.google)} tone={providerMetricTone(settings?.googleApiKeyConfigured, providerPreferences.google)} />
        <SettingsMetric icon={<KeyRound size={20} />} label="Krea API" value={providerMetricValue(settings?.kreaApiKeyConfigured, providerPreferences.krea)} detail={providerKeyDetail(settings, "krea", status, providerPreferences.krea)} tone={providerMetricTone(settings?.kreaApiKeyConfigured, providerPreferences.krea)} />
        <SettingsMetric icon={<KeyRound size={20} />} label="OpenAI API" value={providerMetricValue(settings?.openAiApiKeyConfigured, providerPreferences.openAi)} detail={providerKeyDetail(settings, "openAi", status, providerPreferences.openAi)} tone={providerMetricTone(settings?.openAiApiKeyConfigured, providerPreferences.openAi)} />
        <SettingsMetric icon={<GitPullRequest size={20} />} label="Branch" value={branchMetricValue(settings)} detail={branchMetricDetail(settings)} tone={settings?.branchStatus?.state === "up-to-date" ? "good" : settings?.branchStatus?.state === "update-available" ? "warn" : ""} />
        <SettingsMetric icon={<RotateCcw size={20} />} label="Server" value={settings?.restartRequested ? "Restarting" : "Running"} detail="Local app" tone={settings?.restartRequested ? "warn" : "good"} />
      </div>

      <div className="settings-grid">
        <section className="stats-panel settings-panel wide">
          <SettingsPanelTitle title="API Keys" aside="Stored locally" />
          <div className="settings-form-grid">
            {apiKeyProviders.map((provider) => (
              <ApiKeyStack
                key={provider.id}
                provider={provider}
                versions={apiKeyVersions[provider.id]}
                visibleApiKeys={visibleApiKeys}
                onVisibilityChange={setVisibleApiKeys}
                onValueChange={updateApiKeyValue}
                onToggle={updateApiKeyEnabled}
                onAdd={addApiKey}
                onRemove={removeApiKey}
              />
            ))}
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

function ApiKeyStack({
  provider,
  versions = [],
  visibleApiKeys,
  onVisibilityChange,
  onValueChange,
  onToggle,
  onAdd,
  onRemove
}) {
  return (
    <div className="settings-key-stack">
      {versions.map((entry, versionIndex) => {
        const visibilityKey = provider.id + ":" + versionIndex;
        const visible = Boolean(visibleApiKeys[visibilityKey]);
        const label = provider.label + " V" + (versionIndex + 1);
        return (
          <div key={entry.id} className="settings-key-version">
            <SettingsKeyHeading
              label={label}
              enabled={entry.enabled}
              toggleDisabled={!entry.value && !entry.configured}
              onToggle={(enabled) => onToggle(provider.id, versionIndex, enabled)}
              onAdd={versionIndex === 0 ? () => onAdd(provider.id) : null}
              onRemove={versionIndex > 0 ? () => onRemove(provider.id, versionIndex) : null}
            />
            <div className="settings-input-row secret">
              <KeyRound size={15} />
              <input
                type={visible ? "text" : "password"}
                value={entry.value}
                onChange={(event) => onValueChange(provider.id, versionIndex, event.target.value)}
                placeholder={secretPlaceholder(entry.source, provider.placeholder + " V" + (versionIndex + 1))}
                autoComplete="off"
                spellCheck="false"
                aria-label={label}
              />
              <button
                type="button"
                className="settings-secret-toggle"
                onClick={() => onVisibilityChange((current) => ({ ...current, [visibilityKey]: !visible }))}
                disabled={!entry.value}
                title={(visible ? "Hide " : "Show ") + label}
                aria-label={(visible ? "Hide " : "Show ") + label}
              >
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingsKeyHeading({ label, enabled, toggleDisabled, onToggle, onAdd, onRemove }) {
  return (
    <div className="settings-key-heading">
      <span className="settings-key-label">
        <span>{label}</span>
        {onAdd && (
          <button type="button" className="settings-key-version-action" onClick={onAdd} title={"Add another " + label.replace(/ V\d+$/, "")} aria-label={"Add another " + label.replace(/ V\d+$/, "")}>
            <Plus size={13} />
          </button>
        )}
        {onRemove && (
          <button type="button" className="settings-key-version-action remove" onClick={onRemove} title={"Remove " + label} aria-label={"Remove " + label}>
            <Minus size={13} />
          </button>
        )}
      </span>
      <button
        type="button"
        className={`settings-key-toggle ${enabled ? "enabled" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
        title={`${enabled ? "Disable" : "Enable"} ${label}`}
        disabled={toggleDisabled}
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

function hydrateApiKeyVersions(data = {}) {
  const publicVersions = data.apiKeyVersions && typeof data.apiKeyVersions === "object" ? data.apiKeyVersions : {};
  const savedVersions = data.secrets?.apiKeyVersions && typeof data.secrets.apiKeyVersions === "object"
    ? data.secrets.apiKeyVersions
    : {};
  const legacyValues = {
    fal: data.secrets?.falKey || "",
    google: data.secrets?.googleApiKey || "",
    krea: data.secrets?.kreaApiKey || "",
    openAi: data.secrets?.openAiApiKey || ""
  };
  const combined = Object.fromEntries(
    apiKeyProviderIds.map((provider) => {
      const metadata = Array.isArray(publicVersions[provider]) ? publicVersions[provider] : [];
      const saved = Array.isArray(savedVersions[provider]) ? savedVersions[provider] : [];
      const count = Math.max(metadata.length, saved.length, 1);
      return [
        provider,
        Array.from({ length: count }, (_value, index) => ({
          value: saved[index]?.value ?? (index === 0 ? legacyValues[provider] : ""),
          enabled: metadata[index]?.enabled ?? saved[index]?.enabled ?? data.providerPreferences?.[provider] ?? true
        }))
      ];
    })
  );
  const normalized = normalizeApiKeyVersions(combined);

  return Object.fromEntries(
    apiKeyProviderIds.map((provider) => [
      provider,
      normalized[provider].map((entry, index) => ({
        ...entry,
        configured: Boolean(publicVersions[provider]?.[index]?.configured || entry.value),
        source: publicVersions[provider]?.[index]?.source || (entry.value ? "settings" : "")
      }))
    ])
  );
}

function serializableApiKeyVersions(value) {
  const normalized = normalizeApiKeyVersions(value);
  return Object.fromEntries(
    apiKeyProviderIds.map((provider) => [
      provider,
      normalized[provider].map(({ id, value, enabled }) => ({ id, value, enabled }))
    ])
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

function providerKeyDetail(settings, provider, status, enabled) {
  if (!enabled) return "Keys retained locally";
  const versions = Array.isArray(settings?.apiKeyVersions?.[provider]) ? settings.apiKeyVersions[provider] : [];
  const active = versions.find((entry) => entry.enabled && entry.configured);
  if (!active) return statusLabel(status);
  return `V${active.version || 1} / ${keyDetail(active.source, status, true)}`;
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

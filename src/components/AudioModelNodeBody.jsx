import React from "react";
import { RefreshCw, Upload, X } from "lucide-react";
import { audioModelApi } from "../api/newtApi.js";
import { audioInputEnabled, audioModelId, audioModels, audioModes, audioOutputFormats, audioRunLabel, estimateAudioCost, normalizeAudioModelData } from "../audioModel.js";
import { isLocalDraggableMediaUrl, outputItemFromDataTransfer } from "../mediaAssets.js";
import { NodeRow, OutputPortRow, PortHandle } from "./NodePorts.jsx";
import { ResultPane } from "./MediaViews.jsx";

export function AudioModelNodeBody({ node, config, prompt, promptConnected, sourceAudio, audioConnected, onUpdate, onRun, onUpload, onPreviewOpen, showApiCosts = false, ...ports }) {
  const d = normalizeAudioModelData(node.data);
  const [catalog, setCatalog] = React.useState(null);
  const [voiceError, setVoiceError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sourceDuration, setSourceDuration] = React.useState(null);
  const sequence = React.useRef(0);
  const latest = React.useRef({ node, onUpdate });
  latest.current = { node, onUpdate };
  const busy = ["running", "uploading"].includes(d.status);
  const voiceMode = ["tts", "sts"].includes(d.audioMode);
  const open = d.settingsOpen !== false;
  const audioUrl = audioConnected ? sourceAudio?.url || "" : d.sourceAudioUrl;
  const voice = catalog?.voices.find((item) => item.id === d.voiceId);
  const model = audioModelId(d);
  const voiceUnavailable = voiceMode && catalog && !voice;
  const patch = (value) => onUpdate(node.id, value);
  const refresh = React.useCallback(async (force = false) => {
    const request = ++sequence.current;
    setLoading(true);
    setVoiceError("");
    setCatalog(null);
    try {
      const data = await audioModelApi.voices(force);
      if (sequence.current !== request) return;
      setCatalog(data);
      if (!latest.current.node.data.voiceId && data.voices?.length) {
        const first = data.voices.find((item) => item.group === "Default") || data.voices[0];
        latest.current.onUpdate(latest.current.node.id, { voiceId: first.id, voiceName: first.name, voiceGroup: first.group });
      }
    } catch (error) {
      if (sequence.current === request) setVoiceError(error.message);
    } finally { if (sequence.current === request) setLoading(false); }
  }, []);
  React.useEffect(() => {
    if (!open) return undefined;
    void refresh();
    const update = () => { void refresh(true); };
    window.addEventListener("newtnode:provider-settings-updated", update);
    window.addEventListener("focus", update);
    return () => { sequence.current += 1; window.removeEventListener("newtnode:provider-settings-updated", update); window.removeEventListener("focus", update); };
  }, [open, refresh]);
  React.useEffect(() => { setSourceDuration(null); }, [audioUrl]);
  const quote = estimateAudioCost(d, { prompt, batchCount: d.batchCount, rates: catalog?.pricing,
    ...(d.audioMode === "sts" ? { durationSeconds: sourceDuration } : {}),
    customVoiceRate: voiceMode && (!voice || voice.customRate) });
  const inputPorts = config.input.map((port) => ({ ...port, disabled: !audioInputEnabled(d.audioMode, port.id), disabledReason: port.id === "audioIn" ? "Audio input is used by Speech to Speech" : "Speech to Speech uses the source recording" }));
  const numeric = (label, field, min, max, step = 0.05) => <NodeRow label={label}>
    <div className="audio-number-control">
      <input aria-label={label} type="range" min={min} max={max} step={step} value={d[field]} onChange={(event) => patch({ [field]: Number(event.target.value) })} disabled={busy} />
      <output>{Number(d[field]).toFixed(step < 1 ? 2 : 0)}</output>
    </div>
  </NodeRow>;
  const toggle = (label, field) => <NodeRow label={label}><input aria-label={label} type="checkbox" checked={d[field] === true} onChange={(event) => patch({ [field]: event.target.checked })} disabled={busy} /></NodeRow>;

  return <div className="node-body model-node-body audio-model-body">
    <ResultPane label="Audio will appear here" resultUrl={d.resultUrl} resultItems={d.resultItems} selectedIndex={d.selectedResultIndex} type="audio" status={d.status} error={d.error}
      onSelectResult={(index, item) => patch({ selectedResultIndex: index, resultUrl: item.url })} onPreviewOpen={onPreviewOpen} />
    <OutputPortRow node={node} port={config.output[0]} label="Audio output" {...ports} />
    {!open && <div className="model-input-port-stack" aria-label="Audio model inputs">{inputPorts.map((port) => <PortHandle key={port.id} node={node} port={port} side="input" {...ports} />)}</div>}
    <button className="run-node-button" onClick={() => onRun(node)} disabled={busy || Boolean(voiceUnavailable) || (voiceMode && !d.voiceId)} title={quote.pricingBasis}>
      {busy ? d.status === "uploading" ? "Uploading..." : `Running ${d.batchCount} gen${d.batchCount === "1" ? "" : "s"}...` : showApiCosts ? audioRunLabel(quote) : "Run Audio"}
    </button>
    <details className="model-settings-drawer" open={open} onToggle={(event) => { if (event.currentTarget.open !== open) patch({ settingsOpen: event.currentTarget.open }); }}>
      <summary>Settings</summary>
      <NodeRow label="Mode"><select aria-label="Audio mode" value={d.audioMode} disabled={busy} onChange={(event) => patch({ audioMode: event.target.value })}>{audioModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></NodeRow>
      <NodeRow label={d.audioMode === "tts" ? "Text" : "Prompt"} node={node} inputPort={open ? inputPorts[0] : null} {...ports}>
        <textarea aria-label="Audio prompt" value={prompt || ""} readOnly={promptConnected} disabled={busy || d.audioMode === "sts"} className={promptConnected ? "connected-field" : ""}
          placeholder={d.audioMode === "tts" ? "Text to speak" : d.audioMode === "sfx" ? "Describe the sound" : d.audioMode === "music" ? "Describe the music, mood, instruments or lyrics" : "Source recording controls speech"}
          onChange={(event) => patch({ prompt: event.target.value })} />
      </NodeRow>
      <NodeRow label="Audio" node={node} inputPort={open ? inputPorts[1] : null} {...ports}>
        <div className="audio-source-controls" onDragOver={(event) => { if (d.audioMode === "sts" && !busy && !audioConnected) { event.preventDefault(); event.stopPropagation(); } }}
          onDrop={(event) => {
            if (d.audioMode !== "sts" || busy || audioConnected) return;
            event.preventDefault(); event.stopPropagation();
            const item = outputItemFromDataTransfer(event.dataTransfer);
            if (item?.type === "audio" && isLocalDraggableMediaUrl(item.url)) patch({ sourceAudioUrl: item.url, sourceAudioName: item.label || item.fileName || "Audio" });
            else if (event.dataTransfer.files[0]) onUpload(node, event.dataTransfer.files[0]);
          }}>
          <label className={`audio-upload-label ${d.audioMode !== "sts" || audioConnected || busy ? "disabled" : ""}`}>
            <Upload size={14} />
            <span>{audioConnected ? sourceAudio?.label || "Connected audio" : d.sourceAudioName || "Upload speech"}</span>
            <input type="file" aria-label="Upload speech" accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a" disabled={busy || audioConnected || d.audioMode !== "sts"}
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(node, file); }} />
          </label>
          {!audioConnected && d.sourceAudioUrl && <button type="button" aria-label="Remove source audio" title="Remove source audio" disabled={busy} onClick={() => patch({ sourceAudioUrl: "", sourceAudioName: "" })}><X size={14} /></button>}
        </div>
      </NodeRow>
      {d.audioMode === "sts" && audioUrl && <audio key={audioUrl} className="audio-source-player" src={audioUrl} controls preload="metadata" onLoadedMetadata={(event) => setSourceDuration(Number.isFinite(event.target.duration) ? event.target.duration : null)} />}
      <NodeRow label="Model"><select aria-label="Audio model" disabled={busy} value={model} onChange={(event) => patch({ [d.audioMode === "sts" ? "stsModel" : d.audioMode === "music" ? "musicModel" : "ttsModel"]: event.target.value })}>{audioModels[d.audioMode].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></NodeRow>
      {voiceMode && <>
        <NodeRow label="Voice">
          <div className="audio-voice-controls">
            <select aria-label="ElevenLabs voice" value={d.voiceId} disabled={busy || loading} onChange={(event) => {
              const next = catalog?.voices.find((item) => item.id === event.target.value);
              if (next) patch({ voiceId: next.id, voiceName: next.name, voiceGroup: next.group });
            }}>
              <option value="">{loading ? "Loading voices..." : "Choose voice"}</option>
              {d.voiceId && !voice && <option value={d.voiceId}>{d.voiceName || d.voiceId}{catalog ? " (unavailable)" : ""}</option>}
              {["Default", "Mine"].map((group) => <optgroup key={group} label={group}>{(catalog?.voices || []).filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}
            </select>
            <button type="button" title="Refresh ElevenLabs voices" aria-label="Refresh ElevenLabs voices" disabled={loading || busy} onClick={() => refresh(true)}><RefreshCw size={14} /></button>
          </div>
        </NodeRow>
        {voiceError && <small className="audio-model-message" role="alert">{voiceError}</small>}
        {voiceUnavailable && <small className="audio-model-message" role="alert">Choose a voice available on the current ElevenLabs key.</small>}
        {catalog && !catalog.voices.length && <small className="audio-model-message">No voices found. Add a voice to your ElevenLabs account, then refresh.</small>}
        {voice?.previewUrl && <audio key={voice.id} aria-label="Voice sample" className="audio-source-player" src={voice.previewUrl} controls preload="none" />}
      </>}
      {d.audioMode === "sfx" || d.audioMode === "music" ? <>
        {toggle("Auto duration", "autoDuration")}
        {!d.autoDuration && <NodeRow label="Seconds"><input aria-label="Audio duration in seconds" type="number" min={d.audioMode === "sfx" ? 0.5 : 3} max={d.audioMode === "sfx" ? 30 : 600} step={d.audioMode === "sfx" ? 0.5 : 1} value={d.audioMode === "sfx" ? d.durationSeconds : d.musicDurationSeconds} disabled={busy} onChange={(event) => patch({ [d.audioMode === "sfx" ? "durationSeconds" : "musicDurationSeconds"]: event.target.value })} /></NodeRow>}
        {d.audioMode === "sfx" ? toggle("Loop", "loop") : toggle("Instrumental", "forceInstrumental")}
      </> : null}
      <NodeRow label="Generations"><select aria-label="Audio generations" disabled={busy} value={d.batchCount} onChange={(event) => patch({ batchCount: event.target.value })}>{[1, 2, 3, 4].map((count) => <option key={count}>{count}</option>)}</select></NodeRow>
      <details className="audio-advanced"><summary>Advanced</summary>
        <NodeRow label="Format"><select aria-label="Audio output format" disabled={busy} value={d.outputFormat} onChange={(event) => patch({ outputFormat: event.target.value })}>{audioOutputFormats.map((format) => <option key={format.value} value={format.value}>{format.label}</option>)}</select></NodeRow>
        {voiceMode && <>
          {model === "eleven_v3" ? <NodeRow label="Stability"><select aria-label="Voice stability" value={d.stability < 0.25 ? 0 : d.stability > 0.75 ? 1 : 0.5} disabled={busy} onChange={(event) => patch({ stability: Number(event.target.value) })}><option value={0}>Creative</option><option value={0.5}>Natural</option><option value={1}>Robust</option></select></NodeRow> : <>
            {numeric("Stability", "stability", 0, 1)}{numeric("Similarity", "similarityBoost", 0, 1)}{numeric("Style", "style", 0, 1)}
            {d.audioMode === "tts" && numeric("Speed", "speed", 0.7, 1.2)}{toggle("Speaker boost", "speakerBoost")}
          </>}
          {d.audioMode === "sts" && toggle("Remove noise", "removeBackgroundNoise")}
          <NodeRow label="Seed"><input aria-label="Audio seed" type="number" min="0" max="4294967295" step="1" value={d.seed} placeholder="Random" disabled={busy} onChange={(event) => patch({ seed: event.target.value })} /></NodeRow>
        </>}
        {d.audioMode === "sfx" && numeric("Prompt influence", "promptInfluence", 0, 1)}
      </details>
    </details>
  </div>;
}

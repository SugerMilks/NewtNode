import React from "react";
import { Download, FolderOpen, Image, Film, Music2, ChevronDown, X, RefreshCw, Loader2 } from "lucide-react";
import { NodeRow } from "./NodePorts.jsx";
import { outputMediaTypes, outputFormatOptions, outputNameModes } from "../outputNode.js";
import { outputOwnerKey, useOutputExport } from "../useOutputExport.js";
import "../outputNode.css";

const emptySources = [], emptyContext = {}, emptyPorts = new Set();
const mediaLabels = { image: "Images", video: "Video", audio: "Audio" };
const resultLabels = { image: ["image", "images"], video: ["video", "videos"], audio: ["audio file", "audio files"] };
const mediaIcons = { image: Image, video: Film, audio: Music2 };
const interactive = "button,input,select,textarea,label,summary,[role='tab']";

function stopControlPointer(event) {
  if (event.target.closest(interactive)) event.stopPropagation();
}

function OutputBody({ node, config, sources = emptySources, workflowContext = emptyContext, onUpdate,
  onConnectStart, onDisconnectInput, connectedPortKeys = emptyPorts, api }) {
  const { settings, candidates, receipts, job, progress, busy, operation, error, lastSaved, controller } = useOutputExport({ node, sources, workflowContext, onUpdate, api });
  const [chosenTab, setChosenTab] = React.useState(null), [advanced, setAdvanced] = React.useState(false);
  const firstType = sources.find(source => outputMediaTypes.includes(source.type))?.type || "image";
  const tab = chosenTab || firstType, destination = settings.destinations[tab];
  const tabId = React.useId(), customId = React.useId(), folderId = React.useId();
  const input = config?.input?.find(port => port.id === "mediaIn");
  const thumbnail = sources.find(source => source.type === "image" && source.url && source.ready !== false);
  const ready = sources.filter(source => source.ready !== false && source.url && outputMediaTypes.includes(source.type));
  const counts = outputMediaTypes.map(type => ({ type, count: ready.filter(source => source.type === type).length })).filter(item => item.count);
  const summary = counts.length ? counts.map(({ type, count }) => `${count} ${resultLabels[type][count === 1 ? 0 : 1]}`).join(" / ")
    : sources.length ? "Waiting for results" : "Not connected";
  const update = patch => controller.changeSettings(patch);
  const updateDestination = patch => update({ destinations: { ...settings.destinations, [tab]: { ...destination, ...patch } } });
  const jobReceipts = receipts.filter(receipt => receipt.requestId === job?.id);
  const saved = jobReceipts.filter(receipt => receipt.status === "saved").length;
  const skipped = jobReceipts.filter(receipt => receipt.status === "skipped").length;
  const failures = jobReceipts.filter(receipt => receipt.status === "failed" || receipt.status === "uncertain");
  const completed = job && ["complete", "partial", "failed", "canceled", "uncertain"].includes(job.status);
  const quality = destination.format !== "original" && (tab !== "image" || ["jpeg", "webp"].includes(destination.format));
  const options = (values = []) => values.map(option => typeof option === "string"
    ? <option value={option} key={option}>{option.toUpperCase()}</option>
    : <option value={option.value} key={option.value}>{option.label}</option>);
  const field = (label, control) => <label className="output-field"><span>{label}</span>{control}</label>;
  return <div className="node-body output-body" onPointerDown={stopControlPointer}
    onDoubleClick={event => { if (event.target.closest(interactive)) event.stopPropagation(); }}
    onKeyDown={event => {
      if (event.target.closest(interactive) && !(event.metaKey || event.ctrlKey)) event.stopPropagation();
    }}>
    <NodeRow node={node} label="Media" inputPort={input} onConnectStart={onConnectStart} onDisconnectInput={onDisconnectInput} connectedPortKeys={connectedPortKeys}>
      <div className="output-source" title={sources.map(source => source.sourceName || source.label || source.fileName).filter(Boolean).join("\n")}>
        {thumbnail && <img src={thumbnail.url} alt="" width="36" height="36" loading="lazy" draggable={false} />}
        <span>{summary}</span>
      </div>
    </NodeRow>
    {field("Name", <select aria-label="Export name" value={settings.nameMode} onChange={event => update({ nameMode: event.target.value })}>{options(outputNameModes)}</select>)}
    {settings.nameMode === "custom" && <label className="output-field" htmlFor={customId}><span>Custom name</span>
      <input id={customId} value={settings.customName} onChange={event => update({ customName: event.target.value })} /></label>}
    <div className="output-field output-scope"><span>Results</span><div className="output-segments" role="group" aria-label="Export result scope">
      <button type="button" aria-pressed={settings.scope === "selected"} onClick={() => update({ scope: "selected" })}>Selected</button>
      <button type="button" aria-pressed={settings.scope === "all"} onClick={() => update({ scope: "all" })}>All</button>
    </div></div>

    <section className="output-destinations" aria-label="Export destinations">
      <div className="output-tabs" role="tablist" aria-label="Destination media type">
        {outputMediaTypes.map(type => {
          const Icon = mediaIcons[type];
          return <button type="button" role="tab" key={type} id={`${tabId}-${type}`} aria-controls={`${tabId}-panel`} aria-selected={tab === type}
            tabIndex={tab === type ? 0 : -1} onClick={() => setChosenTab(type)} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const index = outputMediaTypes.indexOf(type), next = event.key === "Home" ? 0 : event.key === "End" ? outputMediaTypes.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + outputMediaTypes.length) % outputMediaTypes.length;
              setChosenTab(outputMediaTypes[next]);
              event.currentTarget.parentElement.children[next].focus();
            }}><Icon size={14} /><span>{mediaLabels[type]}</span></button>;
        })}
      </div>
      <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} className="output-destination-fields">
        <div className="output-field"><label htmlFor={folderId}>Folder</label><div className="output-folder">
          <input id={folderId} aria-label={`${mediaLabels[tab]} folder`} value={destination.path} title={destination.path}
            onChange={event => updateDestination({ path: event.target.value })} spellCheck={false} placeholder="Choose folder" />
          <button type="button" className="output-icon" aria-label={`Choose ${tab} folder`} title="Choose a folder on the computer running the NewtNode server"
            disabled={Boolean(operation)} onClick={() => void controller.selectFolder(tab)}>{operation === "picking" ? <Loader2 className="output-spin" size={16} /> : <FolderOpen size={16} />}</button>
        </div></div>
        {field("Subfolder", <input aria-label={`${mediaLabels[tab]} subfolder`} value={destination.subfolder} placeholder="Optional"
          onChange={event => updateDestination({ subfolder: event.target.value })} spellCheck={false} />)}
        <div className="output-format-row">
          {field("Format", <select aria-label={`${mediaLabels[tab]} format`} title="Original copies the source unchanged. Conversions preserve the original file."
            value={destination.format} onChange={event => updateDestination({ format: event.target.value })}>{options(outputFormatOptions[tab])}</select>)}
          {quality && field("Quality", tab === "image"
            ? <input aria-label="Image quality" type="number" min="1" max="100" step="1" value={destination.quality} onChange={event => updateDestination({ quality: Number(event.target.value) })} />
            : <select aria-label={`${mediaLabels[tab]} quality`} value={destination.quality} onChange={event => updateDestination({ quality: event.target.value })}><option value="high">High</option><option value="standard">Standard</option></select>)}
        </div>
      </div>
    </section>

    <div className="output-advanced">
      <button type="button" className="output-disclosure" aria-expanded={advanced} aria-controls={`${tabId}-advanced`} onClick={() => setAdvanced(value => !value)}><ChevronDown size={14} />Advanced</button>
      {advanced && <div id={`${tabId}-advanced`} className="output-advanced-fields">
        <label className="output-check"><input type="checkbox" checked={settings.numbering} onChange={event => update({ numbering: event.target.checked })} /><span>Number files</span></label>
        {settings.numbering && <div className="output-format-row">
          {field("Start", <input aria-label="Start number" type="number" min="1" step="1" value={settings.startNumber} onChange={event => update({ startNumber: Number(event.target.value) })} />)}
          {field("Padding", <input aria-label="Number padding" type="number" min="1" max="6" step="1" value={settings.padding} onChange={event => update({ padding: Number(event.target.value) })} />)}
        </div>}
        {field("Existing files", <select aria-label="Existing files" value={settings.collision} onChange={event => update({ collision: event.target.value })}><option value="number">Number new copies</option><option value="skip">Skip existing</option></select>)}
        <label className="output-check" title="Export ready results once. Reloading only watches for new results; changing settings pauses Auto Export.">
          <input type="checkbox" role="switch" aria-label="Auto Export" checked={settings.autoExport} disabled={Boolean(operation)} onChange={event => controller.toggleAuto(event.target.checked)} /><span>Auto Export</span>
        </label>
      </div>}
    </div>
    <div className="output-actions">
      <button type="button" className="output-export" disabled={busy || Boolean(operation) || !candidates.length}
        title="Export copies to the chosen folders. Originals stay unchanged. Export again to intentionally create another copy."
        onClick={() => void controller.startExport()}><Download size={16} /><span>{operation === "validating" ? "Checking folders" : busy ? "Exporting" : "Export"}</span><span className="output-count">{busy ? job?.items?.length || candidates.length : candidates.length}</span></button>
      {busy && <button type="button" className="output-icon" aria-label="Cancel export" title="Cancel export" disabled={Boolean(operation)} onClick={() => void controller.cancel()}><X size={16} /></button>}
    </div>
    {busy && <div className="output-progress" role="status"><progress max="1" value={progress} aria-label="Export progress" /><span>{Math.round(progress * 100)}%</span></div>}
    {completed && <div className="output-status" role="status">{job.status === "canceled" ? "Canceled. " : ""}{saved} saved{skipped ? ` / ${skipped} skipped` : ""}{failures.length ? ` / ${failures.length} unconfirmed or failed` : ""}</div>}
    {error && <div className="output-error" role="alert">{error}</div>}
    {job?.warning && <div className="output-error" role="status">{job.warning}</div>}
    {job?.status === "uncertain" && <button type="button" className="output-status-check" disabled={Boolean(operation)} onClick={() => controller.checkStatus()} title="Read this job's status without submitting another export"><RefreshCw size={14} />Check status</button>}
    {failures.length > 0 && <details className="output-file-errors"><summary>File errors ({failures.length})</summary><ul>{failures.map(receipt => <li key={receipt.key}><strong>{receipt.fileName || receipt.sourceUrl}</strong><span>{receipt.error}</span></li>)}</ul></details>}
    {lastSaved && <div className="output-saved-path"><span>{lastSaved.filePath}</span><button type="button" className="output-icon" aria-label="Reveal last saved file" title="Reveal the last saved file on the server computer"
      disabled={Boolean(operation)} onClick={() => void controller.reveal()}><FolderOpen size={16} /></button></div>}
  </div>;
}

export function OutputNodeBody(props) {
  return <OutputBody key={outputOwnerKey(props.node, props.workflowContext)} {...props} />;
}

export default OutputNodeBody;

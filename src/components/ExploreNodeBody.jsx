import React from "react";
import { Compass, GitBranch, Sparkles, Pencil, Combine, Pause, Play, Star, Trash2, ChevronDown, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { NodeRow, OutputPortRow, CollapsedInputPorts } from "./NodePorts.jsx";
import { exploreTasks, exploreInfluences, exploreModels, exploreGrades, exploreStyleFamilies, exploreMaxDirections, normalizeExploreData, exploreSelectionPatch, exploreReferenceDescription } from "../explore.js";
import { estimateImageRunCost, formatPricedRunLabel } from "../generationPricing.js";
import "../explore.css";

export function handleExploreGalleryWheel(event, gallery) {
  if (event.ctrlKey || event.metaKey || event.altKey || !gallery) return;
  // A native listener consumes the gesture before the canvas's native pan listener.
  event.preventDefault();
  event.stopPropagation();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  const unit = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? gallery.clientWidth : 1;
  gallery.scrollLeft = Math.max(0, Math.min(gallery.scrollWidth - gallery.clientWidth, gallery.scrollLeft + delta * unit));
}

export function ExploreNodeBody({ node, config, incoming, prompt, onUpdate, onRun, onPreviewOpen,
  onConnectStart, onDisconnectInput, connectedPortKeys, imageModels, ratios, resolutions, qualities, modelPatch,
  provider, showApiCosts = false }) {
  const data = normalizeExploreData(node.data);
  const [combineIndexes, setCombineIndexes] = React.useState([]);
  const [branchMode, setBranchMode] = React.useState("");
  const [note, setNote] = React.useState("");
  const [details, setDetails] = React.useState(false);
  const [referencesOpen, setReferencesOpen] = React.useState(false);
  const galleryRef = React.useRef(null);
  const galleryBrowserRef = React.useRef(null);
  const [galleryScroll, setGalleryScroll] = React.useState({ left: 0, maximum: 0 });
  const syncGalleryScroll = React.useCallback(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const maximum = Math.max(0, gallery.scrollWidth - gallery.clientWidth);
    const left = Math.max(0, Math.min(maximum, gallery.scrollLeft));
    setGalleryScroll(current => current.left === left && current.maximum === maximum ? current : { left, maximum });
  }, []);
  React.useEffect(() => {
    const gallery = galleryRef.current;
    const browser = galleryBrowserRef.current;
    if (!gallery || !browser) return;
    const wheel = event => handleExploreGalleryWheel(event, gallery);
    browser.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(syncGalleryScroll);
    observer.observe(gallery);
    syncGalleryScroll();
    return () => { browser.removeEventListener("wheel", wheel); observer.disconnect(); };
  }, [data.resultItems.length, syncGalleryScroll]);
  const scrollGallery = direction => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    gallery.scrollLeft += direction * Math.max(168, gallery.clientWidth - 178);
    syncGalleryScroll();
  };
  React.useEffect(() => {
    const gallery = galleryRef.current;
    const item = gallery?.children[data.selectedResultIndex];
    if (!item) return;
    const frame = gallery.getBoundingClientRect();
    const bounds = item.getBoundingClientRect();
    const scale = frame.width / gallery.offsetWidth || 1;
    const left = (bounds.left - frame.left) / scale;
    const right = (bounds.right - frame.left) / scale;
    const offset = left < 3 ? left - 3 : right > gallery.clientWidth - 3 ? right - gallery.clientWidth + 3 : 0;
    if (offset) gallery.scrollTo({ left: gallery.scrollLeft + offset });
  }, [data.selectedResultIndex, data.resultItems.length]);
  const busy = data.status === "running";
  const selected = data.resultItems[data.selectedResultIndex];
  const update = patch => onUpdate(node.id, patch);
  const ports = { node, onConnectStart, onDisconnectInput, connectedPortKeys };
  const enabledModels = imageModels.filter(model => exploreModels.includes(model));
  const settingsValid = enabledModels.includes(data.model) && ratios.includes(data.aspectRatio) && resolutions.includes(data.resolution);
  const count = data.directionCount;
  const referenceCount = ["imageIn", "characterIn", "transferIn"].reduce((sum, key) => sum + (incoming[key]?.length || 0), 0);
  const imageCost = estimateImageRunCost({ ...data, batchCount: count, provider, referenceCount });
  const price = (label, action) => {
    if (!showApiCosts) return label;
    const estimate = action === "more" ? estimateImageRunCost({ ...data, batchCount: 1, provider, referenceCount: referenceCount + 1 }) : null;
    return estimate == null ? `${label} (Variable cost)` : formatPricedRunLabel(label, estimate);
  };
  const run = (action, parentIndexes = [], directionNote = "") => {
    if (busy) return;
    setBranchMode("");
    onRun({ ...node, data: { ...node.data, exploreAction: action, exploreParentIndexes: parentIndexes, exploreNote: directionNote, exploreStopRequested: false } });
  };
  const toggleCombine = index => setCombineIndexes(current => current.includes(index) ? current.filter(value => value !== index) : [...current.slice(-1), index]);
  const pending = data.exploreQueue.filter(item => ["pending", "failed"].includes(item.status)).length;
  const uncertain = data.exploreQueue.some(item => item.status === "uncertain" || item.status === "running");
  const row = (label, control) => <label className="explore-setting"><span>{label}</span>{control}</label>;
  const select = (field, options) => <select aria-label={{ creativeTask: "Creative task", styleFamily: "Style family", referenceInfluence: "Reference influence", gradePreset: "Grade" }[field]} value={data[field]} onChange={event => update({ [field]: event.target.value })}>{options.map(option => <option key={option}>{option}</option>)}</select>;
  const referencePorts = config.input.filter(port => port.id !== "promptIn");
  const imageOutput = config.output.find(port => port.id === "imageOut");
  return <div className="node-body explore-body">
    {data.resultItems.length > 0 && <section ref={galleryBrowserRef} className="explore-gallery-browser" aria-label="Creative directions" onPointerDown={event => event.stopPropagation()}>
      <div ref={galleryRef} className="explore-gallery" onScroll={syncGalleryScroll}>
      {data.resultItems.map((item, index) => <article key={`${item.url}:${index}`} className={`explore-result ${index === data.selectedResultIndex ? "selected" : ""}`}>
        <button className="explore-image" aria-label={`Select ${item.label}`} aria-pressed={index === data.selectedResultIndex} disabled={busy}
          onClick={() => update(exploreSelectionPatch(data, index))} onDoubleClick={() => onPreviewOpen?.(item)}>
          <img src={item.url} alt={item.label} draggable={false} loading="lazy" />
        </button>
        <div className="explore-result-label"><span title={item.label}>{item.label}</span>
          <input type="checkbox" aria-label={`Combine ${item.label}`} checked={combineIndexes.includes(index)} disabled={busy} onChange={() => toggleCombine(index)} />
          <button className="explore-icon" title={item.favorite ? "Unmark favorite" : "Mark favorite"} aria-label={`Favorite ${item.label}`} aria-pressed={Boolean(item.favorite)} disabled={busy}
            onClick={() => update({ resultItems: data.resultItems.map((value, i) => i === index ? { ...value, favorite: !value.favorite } : value) })}><Star size={14} fill={item.favorite ? "currentColor" : "none"} /></button>
        </div>
      </article>)}
      </div>
      {galleryScroll.maximum > 1 && <div className="explore-gallery-navigation" onKeyDown={event => event.stopPropagation()}>
        <button className="explore-gallery-arrow" aria-label="Scroll thumbnails left" title="Scroll thumbnails left" disabled={galleryScroll.left <= 1} onClick={() => scrollGallery(-1)}><ChevronLeft size={18} /></button>
        <input className="explore-gallery-scroll" type="range" aria-label="Scroll thumbnails" title="Scroll thumbnails" min="0" max={galleryScroll.maximum} step="1" value={galleryScroll.left}
          aria-valuetext={`${Math.round(galleryScroll.left / galleryScroll.maximum * 100)}% through thumbnails`}
          onChange={event => { galleryRef.current.scrollLeft = Number(event.target.value); syncGalleryScroll(); }} />
        <button className="explore-gallery-arrow" aria-label="Scroll thumbnails right" title="Scroll thumbnails right" disabled={galleryScroll.left >= galleryScroll.maximum - 1} onClick={() => scrollGallery(1)}><ChevronRight size={18} /></button>
      </div>}
    </section>}
    {imageOutput && <div className="explore-image-output" title="Connect to Preview for all images. Other image inputs use the selected image.">
      <OutputPortRow {...ports} port={imageOutput} label={`Images output${data.resultItems.length ? ` (${data.resultItems.length})` : ""}`} />
    </div>}

    {selected && <>
      <div className="explore-tools">
        <button disabled={busy || !settingsValid} title="Generate variations within the selected direction; no new planning call" onClick={() => run("more", [data.selectedResultIndex])}><GitBranch size={15} />{price("More Like This", "more")}</button>
        <button disabled={busy || !settingsValid} title="Develop a more adventurous child direction" onClick={() => run("push", [data.selectedResultIndex])}><Sparkles size={15} />{price("Push Further", "push")}</button>
        <button disabled={busy || !settingsValid} onClick={() => { setBranchMode("refine"); setNote(""); }}><Pencil size={15} />Refine</button>
        <button className="explore-icon" title="Combine the two checked results" aria-label="Combine selected directions" disabled={busy || combineIndexes.length !== 2 || !settingsValid} onClick={() => { setBranchMode("combine"); setNote(""); }}><Combine size={16} /></button>
        <button className="explore-icon" title="Direction details" aria-label="Direction details" aria-expanded={details} onClick={() => setDetails(!details)}><Info size={16} /></button>
        <button className="explore-icon" title="Remove selected result from this node; keep the local file" aria-label="Remove selected result" disabled={busy} onClick={() => {
          const resultItems = data.resultItems.filter((_, i) => i !== data.selectedResultIndex);
          update({ resultItems, ...exploreSelectionPatch({ resultItems }, Math.max(0, data.selectedResultIndex - 1)) }); setCombineIndexes([]);
        }}><Trash2 size={16} /></button>
      </div>
      {details && <div className="explore-details"><strong>{selected.label}</strong><p>{selected.direction?.concept}</p><p>{data.resultText}</p><details><summary>Image prompt</summary><p>{selected.prompt}</p></details></div>}
    </>}
    {branchMode && <div className="explore-branch"><textarea aria-label="Branch direction" value={note} maxLength={2000} placeholder={branchMode === "combine" ? "Which qualities should these two directions contribute?" : "What should change?"} onChange={event => setNote(event.target.value)} />
      <button disabled={busy || !note.trim()} onClick={() => run(branchMode, branchMode === "combine" ? combineIndexes : [data.selectedResultIndex], note)}><Play size={14} />{price(branchMode === "combine" ? "Combine" : "Refine", branchMode)}</button>
      <button onClick={() => setBranchMode("")}>Cancel</button></div>}

    <NodeRow {...ports} label="Brief" inputPort={config.input[0]}><textarea aria-label="Creative brief" value={prompt || ""} readOnly={Boolean(incoming.promptIn?.length)} disabled={busy} maxLength={7999}
      placeholder="What are we exploring?" onChange={event => update({ prompt: event.target.value })} /></NodeRow>
    <div className="explore-run-row">
      <button className="primary-button explore-run" disabled={busy || !prompt?.trim() || !settingsValid || count > exploreMaxDirections}
        title={showApiCosts ? `${count} images. ${imageCost == null ? "Image cost varies." : `Estimated images: $${imageCost.toFixed(2)}.`} Planning is billed separately; total cost varies.` : `${count} images`}
        onClick={() => run("explore")}><Compass size={17} />{busy ? "Exploring..." : price(`Explore ${count} image${count === 1 ? "" : "s"}`, "explore")}</button>
      {busy && <button className="explore-icon" title="Stop after the current request finishes" aria-label="Stop remaining generations" disabled={data.exploreStopRequested} onClick={() => update({ exploreStopRequested: true })}><Pause size={18} /></button>}
      {!busy && pending > 0 && !uncertain && <button title="Resume only unsubmitted or failed images using the saved plan and settings" onClick={() => run("retry")}><Play size={15} />Resume {pending}</button>}
    </div>
    {data.exploreProgress && <div className="explore-progress" role="status">{data.exploreStopRequested ? "Stopping after the current request..." : data.exploreProgress}</div>}
    {data.error && <div className="explore-error" role="alert">{data.error}</div>}
    {!busy && uncertain && <div className="explore-error" role="alert">An interrupted image may still be generating. Check History and the provider before starting another run; it will not be retried automatically.</div>}
    {!settingsValid && <div className="explore-error" role="alert">Choose an enabled model and supported format in Settings.</div>}

    <div className="explore-settings-heading"><button aria-expanded={data.settingsOpen} onClick={() => update({ settingsOpen: !data.settingsOpen })}><ChevronDown size={15} />Settings</button>
      <label className="explore-mode" title="On: contrasting camera, framing, palette, lighting and art direction within the chosen style. Off: restrained variations. Image / Product content and composition stay fixed unless the brief explicitly changes them.">
        <input aria-label="Explore Mode" type="checkbox" checked={data.exploreMode} disabled={busy} onChange={event => update({ exploreMode: event.target.checked })} />Explore Mode
      </label>
    </div>
    {data.settingsOpen &&
      <fieldset className="explore-settings" disabled={busy}>
        {row("Creative Task", select("creativeTask", exploreTasks))}
        {row("Style Family", select("styleFamily", exploreStyleFamilies))}
        {row("Creative Range", <div className="explore-range"><input aria-label="Creative range" type="range" min="0" max="100" step="5" value={data.creativeRange} onChange={event => update({ creativeRange: Number(event.target.value) })} /><output>{data.creativeRange}</output></div>)}
        {row("Reference Influence", select("referenceInfluence", exploreInfluences))}
        {row("Directions", <input aria-label="Directions" type="number" min="1" max={exploreMaxDirections} value={data.directionCount} onChange={event => update({ directionCount: Number(event.target.value) })} />)}
        {row("Grade", select("gradePreset", exploreGrades))}
        {row("Image Model", <select aria-label="Explore image model" value={data.model} onChange={event => update(modelPatch(event.target.value))}>{!enabledModels.includes(data.model) && <option disabled>{data.model}</option>}{enabledModels.map(model => <option key={model}>{model}</option>)}</select>)}
        {row("Aspect Ratio", <select aria-label="Aspect ratio" value={data.aspectRatio} onChange={event => update({ aspectRatio: event.target.value })}>{!ratios.includes(data.aspectRatio) && <option disabled>{data.aspectRatio}</option>}{ratios.map(ratio => <option key={ratio}>{ratio}</option>)}</select>)}
        {row("Resolution", <select aria-label="Resolution" value={data.resolution} onChange={event => update({ resolution: event.target.value })}>{!resolutions.includes(data.resolution) && <option disabled>{data.resolution}</option>}{resolutions.map(value => <option key={value}>{value}</option>)}</select>)}
        {qualities?.length > 0 && row("Quality", <select aria-label="Quality" value={data.quality} onChange={event => update({ quality: event.target.value })}>{qualities.map(value => <option key={value}>{value}</option>)}</select>)}
      </fieldset>}
    <section className="explore-references" aria-label="References">
      <div className="explore-settings-heading explore-reference-heading">
        {!referencesOpen && <CollapsedInputPorts node={node} ports={referencePorts} connectedPortKeys={connectedPortKeys} onExpand={() => setReferencesOpen(true)} />}
        <button aria-expanded={referencesOpen} onClick={() => setReferencesOpen(!referencesOpen)}><ChevronDown size={15} />References</button>
      </div>
      {referencesOpen && <div className="explore-inputs">{referencePorts.map(port => <NodeRow key={port.id} {...ports} label={port.label} inputPort={port}>
        <textarea readOnly rows={2} aria-label={`${port.label} reference`} disabled={!incoming[port.id]?.length}
          placeholder="Not connected" value={exploreReferenceDescription(port.id, incoming[port.id])} />
      </NodeRow>)}</div>}
    </section>
  </div>;
}

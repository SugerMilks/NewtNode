import React from "react";
import { Pencil, Play, RefreshCw, Square, Spline, Type, X, Columns2 } from "lucide-react";
import { NodeRow, OutputPortRow } from "./NodePorts.jsx";
import { useVectorGeneration } from "./useVectorGeneration.js";
import { useVectorLayers } from "./useVectorLayers.js";
import { VectorLayersPanel } from "./VectorLayersPanel.jsx";
import { ideogramVectorCost, normalizeVectorRates, removeVectorResult, vectorAspectRatios, vectorBatchOptions, vectorDesignPresets } from "../ideogramVector.js";
import { ideogramVectorApi } from "../api/newtApi.js";
import { setOutputItemDragData, finishOutputItemDragData } from "../mediaAssets.js";
import { vectorReferences } from "../vectorGuidance.js";
import "../vectorNode.css";
import VectorSavedLooks from "./VectorSavedLooks.jsx";

const VectorGuidanceDialog = React.lazy(() => import("./VectorGuidanceDialog.jsx"));
const VectorLayersDialog = React.lazy(() => import("./VectorLayersDialog.jsx"));
const VectorCompareDialog = React.lazy(() => import("./VectorCompareDialog.jsx"));
const IconButton = ({ title, children, ...props }) => <button type="button" className="vector-icon" title={title} aria-label={title} {...props}>{children}</button>;

export function VectorNodeBody({ node, config, prompt = "", promptConnected = false, imageInputs = [], imageConnected = false,
  moodBoardInputs = [], moodBoardConnected = false,
  onUpdate, workflowContext, onPreviewOpen, onConnectStart, onDisconnectInput, connectedPortKeys = new Set(), showApiCosts = false, api }) {
  const { data, update, working, start, check, stopWaiting, release } = useVectorGeneration({ node, onUpdate, workflowContext, api });
  const [layerEditor, setLayerEditor] = React.useState(null);
  const layerScope = JSON.stringify([node.id, workflowContext?.projectId, workflowContext?.workflowPackageId, workflowContext?.workflowPackagePath, data.resultItems[data.selectedResultIndex]?.svgUrl]);
  const layers = useVectorLayers({ node, data, update, workflowContext, api, open: layerEditor === layerScope });
  const layerBaseline = React.useRef([]);
  const [showSource, setShowSource] = React.useState(false);
  const [pricing, setPricing] = React.useState(null);
  const [guideEditor, setGuideEditor] = React.useState(null);
  const [compare, setCompare] = React.useState(false);
  const variantsRef = React.useRef(null), deletionFocus = React.useRef(null);
  const guideScope = JSON.stringify([node.id, workflowContext?.projectId, workflowContext?.workflowPackageId, workflowContext?.workflowPackagePath]);
  const guideScopeRef = React.useRef(guideScope); guideScopeRef.current = guideScope;
  React.useEffect(() => { setGuideEditor(null); setCompare(false); }, [guideScope]);
  const pricingScope = JSON.stringify([node.id, workflowContext?.projectId, workflowContext?.workflowPackageId, workflowContext?.workflowPackagePath, showApiCosts]);
  const pricingScopeRef = React.useRef(pricingScope), apiRef = React.useRef(api);
  pricingScopeRef.current = pricingScope; apiRef.current = api;
  React.useEffect(() => {
    let active = true;
    setPricing(null);
    if (showApiCosts) {
      Promise.resolve().then(() => (apiRef.current || ideogramVectorApi).pricing()).then(response => {
        if (active && pricingScopeRef.current === pricingScope) setPricing({ scope: pricingScope, rates: normalizeVectorRates(response?.rates) });
      }).catch(() => { /* Unavailable prices stay unknown and never trigger a generation. */ });
    }
    return () => { active = false; };
  }, [pricingScope, showApiCosts]);
  const item = data.resultItems[data.selectedResultIndex];
  const source = imageInputs[0];
  const vectorize = data.vectorMode === "vectorize";
  const references = vectorReferences(data, imageInputs, moodBoardInputs);
  const displayed = showSource && source?.url ? source : item;
  const previewBlocked = !showSource && layers.dirty;
  const canPreview = Boolean(displayed?.url && onPreviewOpen && !previewBlocked);
  const openPreview = event => {
    event.stopPropagation();
    if (canPreview) onPreviewOpen(displayed);
  };
  const ports = { node, onConnectStart, onDisconnectInput, connectedPortKeys };
  const price = ideogramVectorCost({ mode: data.vectorMode, quality: data.quality, referenceCount: references.length, batchCount: data.batchCount }, pricing?.scope === pricingScope ? pricing.rates : {});
  const actionLabel = vectorize ? data.batchCount === "1" ? "Vectorize Image" : `Vectorize Image (${data.batchCount})` : data.batchCount === "1" ? "Generate SVG" : `Generate ${data.batchCount} SVGs`;
  const title = showApiCosts ? price.amountUsd == null ? "Current local pricing is unavailable. Generation may still be billed by Fal." : `${price.pricingBasis} ${price.source === "Configured estimate" ? "" : `Verified ${price.checkedAt}. `}${price.pricingSource}` : `Create ${data.batchCount} SVG${data.batchCount === "1" ? "" : "s"} through the enabled Fal account.`;
  const currentPrompt = promptConnected ? prompt : data.prompt;
  const missingInput = references.some(image => !image?.url);
  const canRun = !data.vectorJob && !working && !missingInput && (vectorize ? imageInputs.length === 1 : currentPrompt.trim().length > 0 && references.length <= 5);
  const select = index => { setShowSource(false); update({ selectedResultIndex: index, resultUrl: data.resultItems[index]?.url || "" }); };
  const deleteVariation = event => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    // Consume deletion even in the empty strip, so it cannot delete the canvas node.
    event.preventDefault(); event.stopPropagation();
    if (event.repeat || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || layers.saving) return;
    if (layerEditor === layerScope || guideEditor || compare || event.currentTarget.ownerDocument.querySelector("dialog[open], [aria-modal='true']")) return;
    const url = event.target.closest("button[data-vector-result-url]")?.dataset.vectorResultUrl;
    if (!url || url !== item?.url) return;
    if (layers.dirty && !window.confirm("Remove this image from the node and discard its unsaved artwork edits? The saved files will remain in History.")) return;
    update(current => {
      if (current.resultItems[current.selectedResultIndex]?.url !== url) return null;
      const patch = removeVectorResult(current, url);
      if (patch) deletionFocus.current = { scope: guideScope, url: patch.resultUrl };
      return patch;
    });
    setShowSource(false);
  };
  React.useLayoutEffect(() => {
    const target = deletionFocus.current;
    if (!target) return;
    deletionFocus.current = null;
    if (target.scope !== guideScope) return;
    const button = [...(variantsRef.current?.querySelectorAll("button[data-vector-result-url]") || [])].find(element => element.dataset.vectorResultUrl === target.url);
    (button || variantsRef.current)?.focus({ preventScroll: true });
  }, [data.resultItems, guideScope]);
  const comparable = data.resultItems.filter(result => !data.vectorLayerDrafts.some(draft => draft.svgUrl === result.svgUrl && draft.operations.length));
  const dragProps = (result, blocked = false) => ({
    draggable: Boolean(result?.url && !blocked),
    onPointerDown: event => event.stopPropagation(),
    onDragStart: event => {
      event.stopPropagation();
      if (!result?.url || blocked) { event.preventDefault(); return; }
      setOutputItemDragData(event.dataTransfer, { ...result, type: "image" });
    },
    onDragEnd: event => { event.stopPropagation(); finishOutputItemDragData({ ...result, type: "image" }, event); }
  });
  React.useEffect(() => { if (!source?.url) setShowSource(false); }, [source?.url]);

  return <div className="node-body vector-node-body">
    <div className="vector-monitor vector-background-checker" onWheel={event => event.stopPropagation()}>
      {displayed?.url ? <div className="vector-image-stage">
        <img src={!showSource && layers.previewUrl ? layers.previewUrl : !showSource && displayed.svgUrl ? displayed.svgUrl : displayed.url} alt={showSource ? source.label || "Source image" : item?.label || "Vector artwork"}
          role={onPreviewOpen ? "button" : undefined} aria-haspopup={onPreviewOpen ? "dialog" : undefined} aria-disabled={onPreviewOpen ? !canPreview : undefined} tabIndex={canPreview ? 0 : undefined}
          title={previewBlocked ? "Save layer edits before expanding or dragging this image" : canPreview ? "Double-click to expand; drag image onto the canvas" : "Drag image onto the canvas"}
          onDoubleClick={openPreview} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPreview(event); } }}
          {...dragProps(displayed, previewBlocked)} />
      </div> : <div className="vector-empty"><Spline size={32} /><span>Scalable artwork from a brief or image</span></div>}
    </div>
    <div className="vector-results-bar">
      <div ref={variantsRef} className="vector-variants" role="group" tabIndex={-1} aria-label="Saved vector variations" onKeyDown={deleteVariation} onWheel={event => event.stopPropagation()}>
        {data.resultItems.map((result, index) => {
          const dirty = data.vectorLayerDrafts.some(draft => draft.svgUrl === result.svgUrl && draft.operations.length > 0);
          return <button key={result.svgUrl || result.url} type="button" aria-label={`Select ${result.label || `Vector ${index + 1}`}`} aria-pressed={data.selectedResultIndex === index}
            data-vector-result-url={result.url} aria-keyshortcuts="Delete Backspace"
            title={`${dirty ? "Save layer edits before dragging this image" : `${result.label || `Vector ${index + 1}`} - drag image onto the canvas`}. Select and press Delete to remove from this node; saved files stay in History.`}
            onClick={event => { event.currentTarget.focus({ preventScroll: true }); select(index); }} {...dragProps(result, dirty)}>
            <img src={result.thumbnailUrl || result.url} alt="" draggable={false} loading="lazy" /><span>{index + 1}</span>
          </button>;
        })}
      </div>
      <div className="vector-result-actions">
        {data.resultItems.length > 1 && <IconButton title="Compare saved versions" disabled={comparable.length < 2} onClick={() => setCompare(true)}><Columns2 size={17} /></IconButton>}
        {source?.url && item && <button type="button" className="vector-icon vector-source-toggle" aria-pressed={showSource} title="Compare with the currently connected source image" onClick={() => setShowSource(value => !value)}>{showSource ? "SVG" : "Source"}</button>}
        {item?.svgUrl && <VectorLayersPanel onToggle={() => { layerBaseline.current = layers.operations; setShowSource(false); setLayerEditor(layerScope); }} editor={layers} />}
      </div>
      <OutputPortRow {...ports} port={config.output[0]} label="Image output" />
    </div>
    {item?.svgUrl && layerEditor === layerScope && <React.Suspense fallback={<span role="status">Opening Layers...</span>}><VectorLayersDialog key={layerScope} item={item} editor={layers} openingOperations={layerBaseline.current} nodeId={node.id} nodeTitle={data.title || "Vector Node"} workflowContext={workflowContext} api={api} onClose={() => setLayerEditor(null)} /></React.Suspense>}
    {compare && <React.Suspense fallback={null}><VectorCompareDialog items={comparable} currentUrl={item?.url} update={update} onChoose={url => select(data.resultItems.findIndex(result => result.url === url))} onClose={() => setCompare(false)} /></React.Suspense>}
    <div className="vector-controls">
      <section className="vector-compose" aria-label="Brief and connections">
        <label className="vector-mode">Task<select aria-label="Vector task" value={data.vectorMode} onChange={event => { setShowSource(false); update({ vectorMode: event.target.value }); }}><option value="generate">Text to vector</option><option value="vectorize">Vectorize image</option></select></label>
        {!vectorize && <textarea className="vector-brief" aria-label="Design brief" placeholder="Describe the artwork, composition and style…" value={currentPrompt} readOnly={promptConnected} onChange={event => update({ prompt: event.target.value })} />}
        {vectorize && <div className="vector-source-summary" role="status">{imageInputs.length === 1 && source?.url ? source.label || "Connected image" : "Connect one PNG, JPEG or WebP image."}</div>}
        <div className="vector-inputs">
          <NodeRow {...ports} label="Brief" inputPort={{ ...config.input.find(port => port.id === "promptIn"), disabled: vectorize, disabledReason: "Image vectorization uses the source image without a prompt." }}><span className="vector-input-summary">{vectorize ? "Not used" : promptConnected ? "Connected text" : "Use the design brief above"}</span></NodeRow>
          <NodeRow {...ports} label={vectorize ? "Source image" : "References"} inputPort={config.input.find(port => port.id === "imageIn")}><span className="vector-input-summary">{imageConnected ? `${imageInputs.length} connected` : vectorize ? "Required · 1 image" : "Optional · up to 5"}</span></NodeRow>
          <NodeRow {...ports} label="Mood Board" inputPort={{ ...config.input.find(port => port.id === "transferIn"), disabled: vectorize, disabledReason: "Mood Board guides Text to vector only. Image vectorization converts its source without style guidance." }}><span className="vector-input-summary" title={vectorize ? "The connection is preserved but is not sent when vectorizing." : "Visual direction only: palette, shapes, linework and texture, not the board's subjects or collage layout. Shares the five-reference limit."}>{vectorize ? "Not used" : moodBoardConnected ? moodBoardInputs.map(board => board.label || "Mood Board").join(", ") : "Optional"}</span></NodeRow>
          {!vectorize && data.vectorSavedMoodBoards?.length > 0 && <div className="vector-look-references"><span>{moodBoardInputs.length ? "Saved look references (connected boards take priority)" : `Saved look: ${data.vectorSavedMoodBoards.map(board => board.label || "Mood Board").join(", ")}`}</span><button type="button" className="vector-icon" title="Remove saved look mood boards" aria-label="Remove saved look mood boards" onClick={() => update({ vectorSavedMoodBoards: [] })}><X size={14} /></button></div>}
        </div>
      </section>
      <section className="vector-settings" aria-label="Design settings">
      {!vectorize && <VectorSavedLooks key={guideScope} data={data} moodBoards={moodBoardInputs} update={update} api={api} />}
      {vectorize ? <label>Conversion detail<select aria-label="Conversion detail" value={data.vectorizeMode} onChange={event => update({ vectorizeMode: event.target.value })}><option value="default">Standard</option><option value="simple">Simple shapes</option></select></label> : <>
        <label>Design direction<select aria-label="Design direction" value={data.designPreset} onChange={event => update({ designPreset: event.target.value })}>{vectorDesignPresets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
        <div className="vector-field-grid">
          <label title="Added to the prompt as lettering guidance. Check generated spelling before production.">Lettering<input aria-label="Lettering" placeholder="Optional exact words" value={data.lettering} onChange={event => update({ lettering: event.target.value })} /></label>
          <label title="Creative prompt guidance, not a guaranteed color constraint. Edit SVG fills in a vector editor for exact production colors.">Palette<input aria-label="Palette" placeholder="e.g. navy, cream, coral" value={data.palette} onChange={event => update({ palette: event.target.value })} /></label>
        </div>
        <div className="vector-guidance" aria-label="Vector creative references">
          {[["font", "fontReference", "Font Reference", Type], ["layout", "layoutReference", "Draw Layout", Pencil]].map(([kind, key, label, Icon]) => <div key={kind} className="vector-guide-row">
            <button type="button" className="vector-guide-open" onClick={() => setGuideEditor({ kind, key, scope: guideScope })} title={kind === "font" ? "Reference lettering shapes with an image or a locally rendered font sample. Exact font reproduction is not guaranteed." : "Draw composition and shape guidance. Applying saves the sketch without generating."}>
              {data[key]?.url ? <img src={data[key].url} alt="" /> : <Icon size={17} />}<span>{label}</span>
            </button>
            {data[key] && <><input type="checkbox" aria-label={`Use ${label}`} title={`Include ${label} in generation`} checked={data[key].enabled !== false} onChange={e => update({ [key]: { ...data[key], enabled: e.target.checked } })} /><IconButton title={`Remove ${label}`} onClick={() => update({ [key]: null })}><X size={14} /></IconButton></>}
          </div>)}
        </div>
        <div className="vector-setting-grid">
          <label>Quality<select aria-label="Vector quality" value={data.quality} onChange={event => update({ quality: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label>Aspect ratio<select aria-label="Vector aspect ratio" value={data.aspectRatio} onChange={event => update({ aspectRatio: event.target.value })}>{vectorAspectRatios.map(ratio => <option key={ratio} value={ratio}>{ratio === "auto" ? "Auto" : ratio}</option>)}</select></label>
          <label title="Blank uses random seeds. Batches start with this seed and advance by one for each generation.">Seed<input aria-label="Vector seed" type="number" min="0" max="2147483647" step="1" placeholder="Random" value={data.seed} onChange={event => update({ seed: event.target.value })} /></label>
        </div>
      </>}
      </section>
    </div>
    <div className="vector-footer">
      <div className="vector-feedback">
        {missingInput && <div className="node-error">A connected image or Mood Board has no saved output yet.</div>}
        {references.length > (vectorize ? 1 : 5) && <div className="node-error">{vectorize ? "Connect exactly one image to vectorize." : "Use at most five references in total, including Mood Boards, font and layout. Disable or disconnect an extra reference."}</div>}
        {data.vectorJob && <div className="vector-job">
          <span role="status">{working ? data.vectorJob.batchCount > 1 ? `Generating ${data.vectorJob.batchIndex} of ${data.vectorJob.batchCount}` : "Waiting for vector…" : `Request ${data.vectorJob.status}`}</span>
          {working ? <IconButton title="Stop waiting; provider work may still finish and be billed" onClick={stopWaiting}><Square size={14} /></IconButton> : <>
            <IconButton title="Check existing request; does not generate again" onClick={check}><RefreshCw size={15} /></IconButton>
            <IconButton title="Release request after checking History; does not cancel provider work" onClick={release}><X size={15} /></IconButton>
          </>}
          {data.vectorJob.error && <p className="node-error" role="alert">{data.vectorJob.error}</p>}
        </div>}
        {data.error && <div className="node-error" role="alert">{data.error}</div>}
        {data.vectorWarning && <div className="vector-warning" role="status">{data.vectorWarning}</div>}
      </div>
      <div className="vector-run-controls">
        <label>Generations<select aria-label="Vector generations" value={data.batchCount} onChange={event => update({ batchCount: event.target.value })}>{vectorBatchOptions.map(count => <option key={count} value={count}>{count}</option>)}</select></label>
        <button type="button" className="vector-generate" disabled={!canRun} title={title} onClick={() => start({ prompt: currentPrompt, images: imageInputs, moodBoards: moodBoardInputs })}><Play size={16} />{actionLabel}{showApiCosts ? price.amountUsd == null ? " · Price unavailable" : ` · Est. $${price.amountUsd.toFixed(2)}` : ""}</button>
      </div>
    </div>
    {guideEditor?.scope === guideScope && <React.Suspense fallback={<span role="status">Opening reference editor...</span>}>
      <VectorGuidanceDialog key={`${guideScope}:${guideEditor.kind}`} kind={guideEditor.kind} value={data[guideEditor.key]} lettering={data.lettering} aspectRatio={data.aspectRatio}
        images={[...imageInputs.filter(image => image.role !== "moodBoard"), ...(item ? [{ ...item, label: "Current artwork" }] : [])]}
        workflowContext={workflowContext} upload={api?.uploadGuidance} onClose={() => setGuideEditor(null)} onApply={guide => {
          if (guideScopeRef.current !== guideEditor.scope) return;
          update({ [guideEditor.key]: guide }); setGuideEditor(null);
        }} />
    </React.Suspense>}
  </div>;
}

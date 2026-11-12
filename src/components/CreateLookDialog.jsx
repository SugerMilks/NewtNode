import React from "react";
import { X, Upload, Sparkles, Loader2, Save, ChevronLeft, ChevronRight, Trash2, Plus } from "lucide-react";
import { looksApi, nodeApi } from "../api/newtApi.js";
import LookImage from "./LookImage.jsx";
import { lookStyleSections, lookStylePriorities, lookStyleBlocks, compileLookStyle, lookCategories, lookTags } from "../createLookStyle.js";

export default function CreateLookDialog({ onClose, onSaved, sharedDirectory = "", categories = [] }) {
  const dialog = React.useRef(null), input = React.useRef(null), working = React.useRef(false);
  const [id, setId] = React.useState(() => `user-look-${crypto.randomUUID()}`);
  const [name, setName] = React.useState(""), [tags, setTags] = React.useState([]), [tag, setTag] = React.useState("");
  const [prompt, setPrompt] = React.useState(""), [examples, setExamples] = React.useState([]), [index, setIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(""), [error, setError] = React.useState("");
  const [destination, setDestination] = React.useState(sharedDirectory ? "shared" : "local");
  const [analysis, setAnalysis] = React.useState(null), [blocks, setBlocks] = React.useState(() => lookStyleBlocks()), [palette, setPalette] = React.useState([]);
  const options = lookCategories(categories), compiled = compileLookStyle(blocks), hasSections = blocks.some(block => block.text.trim());
  const imageLimit = 6, byteLimit = 16;
  React.useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  React.useEffect(() => setId(`user-look-${crypto.randomUUID()}`), [name, prompt, examples, tags, tag, blocks, palette, destination]);
  const body = () => {
    const savedTags = lookTags([...tags, ...tag.split(",")]);
    return { id, name, category: savedTags.find(value => options.includes(value)) || "Various", tags: savedTags,
      prompt: hasSections ? compiled : prompt.trim(), notes: prompt, examples, destination, sharedDirectory, styleBoardVersion: 1, styleBlocks: blocks, palette };
  };
  function changeImages(images) {
    setExamples(images); setIndex(current => Math.min(current, Math.max(0, images.length - 1)));
    if (analysis) {
      if (prompt === analysis.stylePrompt) setPrompt("");
      setBlocks(lookStyleBlocks()); setPalette([]); setTags(current => current.filter(value => !analysis.tags.includes(value))); setAnalysis(null);
    }
  }
  function changeBlock(id, patch) { setBlocks(current => current.map(block => block.id === id ? { ...block, ...patch } : block)); }
  function addTag() { setTags(current => lookTags([...current, ...tag.split(",")])); setTag(""); }
  async function action(kind, run) {
    if (working.current) return;
    working.current = true; setBusy(kind); setError("");
    try { await run(); } catch (e) { setError(e.message); }
    finally { working.current = false; setBusy(""); }
  }
  async function upload(files) {
    if (!files.length) return;
    await action("upload", async () => {
      if (files.length + examples.length > imageLimit) throw Error(`Choose up to ${imageLimit} reference images for this destination.`);
      if (files.some(file => !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > byteLimit * 1024 * 1024)) throw Error(`Use PNG, JPEG, WebP or AVIF images up to ${byteLimit} MB each.`);
      const images = [...examples];
      for (const file of files) {
        const form = new FormData(); form.append("asset", file); form.append("nodeType", "transfer");
        const { response, data } = await nodeApi.uploadAsset(form, "Look reference upload");
        if (!response.ok || !data?.asset?.localUrl) throw Error(data?.error || "Could not upload this image. References already uploaded are preserved.");
        images.push({ ...data.asset, id: crypto.randomUUID() }); changeImages([...images]);
      }
    });
  }
  function move(direction) {
    const next = index + direction;
    // Reordering the same reference set changes the cover, not its extracted treatment.
    setExamples(current => { const items = [...current]; [items[index], items[next]] = [items[next], items[index]]; return items; });
    setIndex(next);
  }
  async function extract() {
    await action("analyze", async () => {
      const result = await looksApi.analyze({ ...body(), prompt, categories: categories.slice(0, 40) });
      if (!prompt.trim() || prompt === analysis?.stylePrompt) setPrompt(result.stylePrompt);
      setAnalysis(result); setBlocks(lookStyleBlocks(result.styleBlocks)); setPalette(result.palette); setTags(result.tags);
    });
  }
  return <dialog ref={dialog} className="look-detail look-create" aria-labelledby="create-look-title" onCancel={event => { if (working.current) event.preventDefault(); else onClose(); }}>
    <header><div><h2 id="create-look-title">Create Look</h2></div><button className="look-icon" title="Close Create Look" disabled={Boolean(busy)} onClick={onClose}><X size={20} /></button></header>
    <div className="look-detail-body">
      <div className="look-detail-images" onDragOver={event => { if ([...event.dataTransfer.types].includes("Files")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!working.current) upload([...event.dataTransfer.files]); }}>
        <div className="look-detail-main">{examples.length ? <LookImage image={examples[index]} alt={`Look reference ${index + 1}`} /> : <button disabled={Boolean(busy)} onClick={() => input.current.click()}><Upload size={18} />Add references</button>}</div>
        <div className="look-detail-thumbs">{examples.map((image, i) => <button key={image.id} aria-label={`Reference ${i + 1}`} aria-pressed={index === i} onClick={() => setIndex(i)}><LookImage image={image} alt="" thumbnail /></button>)}</div>
        <div className="look-reference-tools">
          <button onClick={() => input.current.click()} disabled={Boolean(busy) || examples.length >= imageLimit}><Upload size={16} />{busy === "upload" ? "Uploading..." : "Add images"}</button>
          <span>{examples.length} / {imageLimit}</span>
          <button className="look-icon" title="Move reference earlier" disabled={Boolean(busy) || index === 0} onClick={() => move(-1)}><ChevronLeft size={16} /></button>
          <button className="look-icon" title="Move reference later" disabled={Boolean(busy) || index >= examples.length - 1} onClick={() => move(1)}><ChevronRight size={16} /></button>
          <button className="look-icon" title="Remove reference" disabled={Boolean(busy) || !examples.length} onClick={() => changeImages(examples.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
        </div>
        <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif" aria-label="Look reference images" hidden onChange={event => { upload([...event.target.files]); event.target.value = ""; }} />
      </div>
      <aside>
        {sharedDirectory && <label>Save to<select value={destination} disabled={Boolean(busy)} onChange={event => setDestination(event.target.value)}><option value="shared">Shared User Looks</option><option value="local">My Looks</option></select></label>}
        <label>Look name<input value={name} onChange={e => setName(e.target.value)} maxLength={120} disabled={Boolean(busy)} autoFocus /></label>
        <button disabled={Boolean(busy) || !examples.length} title="Analyze all references with your enabled AI provider. Billed separately. Editing, saving and reuse do not call AI." onClick={extract}>{busy === "analyze" ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}{busy === "analyze" ? "Extracting style..." : analysis ? "Extract Again (AI)" : "Extract Style (AI)"}</button>
        {palette.length > 0 && <fieldset className="look-create-palette"><legend>Reference palette</legend>{palette.map((color, i) => <label key={i} title={color.name}><input aria-label={`Reference color ${i + 1}`} type="color" value={color.hex} disabled={Boolean(busy)} onChange={event => setPalette(current => current.map((item, index) => index === i ? { name: "Custom", hex: event.target.value } : item))} /></label>)}</fieldset>}
        <label htmlFor="create-look-description">Short description</label>
        <textarea id="create-look-description" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} disabled={Boolean(busy)} />
        <section className="look-style-board" aria-label="Visual style board"><h3>Style board</h3><div>{blocks.map(block => {
          const section = lookStyleSections.find(item => item.id === block.id);
          return <article key={block.id} className={block.enabled ? "" : "is-excluded"}><header><h4>{section.label}</h4><label><input type="checkbox" aria-label={`Include ${section.label}`} checked={block.enabled} disabled={Boolean(busy)} onChange={event => changeBlock(block.id, { enabled: event.target.checked })} /></label></header>
            <select aria-label={`${section.label} priority`} value={block.weight} disabled={Boolean(busy) || !block.enabled} onChange={event => changeBlock(block.id, { weight: event.target.value })}>{lookStylePriorities.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select>
            <textarea aria-label={section.label} placeholder={section.placeholder} maxLength={600} value={block.text} disabled={Boolean(busy) || !block.enabled} onChange={event => changeBlock(block.id, { text: event.target.value })} />
          </article>;
        })}</div></section>
        <div className="look-create-tags" aria-label="Look tags">{tags.map(value => <button key={value} title={`Remove tag ${value}`} disabled={Boolean(busy)} onClick={() => setTags(current => current.filter(item => item !== value))}>{value}<X size={13} /></button>)}</div>
        <div className="look-tag-entry"><input aria-label="New look tag" placeholder="Category or tag" list="create-look-tags" maxLength={80} value={tag} disabled={Boolean(busy) || tags.length >= 16} onChange={event => setTag(event.target.value)} onKeyDown={event => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); } }} /><datalist id="create-look-tags">{options.map(value => <option key={value} value={value} />)}</datalist><button className="look-icon" title="Add tag" disabled={Boolean(busy) || !tag.trim() || tags.length >= 16} onClick={addTag}><Plus size={16} /></button></div>
        {(compiled || prompt.trim()) && <details className="look-create-prompt"><summary>Style prompt</summary><pre>{hasSections ? compiled : prompt.trim()}</pre></details>}
      </aside>
    </div>
    <footer className="look-create-footer">{error && <p className="look-error" role="alert">{error}</p>}<button className="look-primary" disabled={Boolean(busy) || !name.trim() || !examples.length || (hasSections ? compiled.length < 80 : !prompt.trim())} onClick={() => action("save", async () => { const data = await looksApi.create(body()); onSaved(data.look); })}>{busy === "save" ? <Loader2 className="spin" size={17} /> : <Save size={17} />}Save Look</button></footer>
  </dialog>;
}

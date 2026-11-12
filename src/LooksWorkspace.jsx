import React from "react";
import { Search, FolderOpen, RefreshCw, Star, X, Loader2, Plus, FolderPlus, Trash2, Share2, ArrowUpRight, ChevronDown, Check } from "lucide-react";
import { looksApi, outputApi } from "./api/newtApi.js";
import { lookSnapshot } from "./looks.js";
import { filmStillPalette } from "./filmStillGrade.js";
import { lookTransferChoices, lookTransferError, prepareLookTransfer } from "./lookTransfer.js";
import LookImage from "./components/LookImage.jsx";
import LookShuttle from "./components/LookShuttle.jsx";
import LookGallery from "./components/LookGallery.jsx";
import useLooksFeed from "./useLooksFeed.js";
import CreateLookDialog from "./components/CreateLookDialog.jsx";
import SharedLooksFolder from "./components/SharedLooksFolder.jsx";
import "./looks.css";

function LookDetail({ look, starred, onStar, onClose, onUse, onRemoved }) {
  const dialog = React.useRef(null), working = React.useRef(false);
  const [prompt, setPrompt] = React.useState(() => lookSnapshot(look).prompt);
  const [index, setIndex] = React.useState(0), [busy, setBusy] = React.useState(""), [error, setError] = React.useState("");
  const [transferOpen, setTransferOpen] = React.useState(false), [selectedKinds, setSelectedKinds] = React.useState({});
  const transferPanel = React.useRef(null);
  React.useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  React.useEffect(() => {
    if (!transferOpen) return;
    const timer = setTimeout(() => transferPanel.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" }), 220);
    return () => clearTimeout(timer);
  }, [transferOpen]);
  const examples = look.examples || [];
  const displayedPalette = filmStillPalette(examples[index]?.filmStillPalette)?.colors.map(hex => ({ hex, name: "Hand-picked color" })) || look.colours || [];
  const transferError = lookTransferError(look, prompt, selectedKinds);
  const transferTitles = {
    text: "Copy this exact description into a Text node. No AI call.",
    moodBoard: "Copy all reference images into a Mood Board. No AI call.",
    style: look.custom ? "Use the saved description as an editable unique style. No AI call." : `Analyze all ${examples.length} images for an editable unique style. Analysis is billed; unchanged looks reuse saved analysis.`,
    grade: "Use the first image for Custom Grade. Keep the other images available to replace it. No AI call."
  };
  async function apply() {
    if (working.current) return;
    working.current = true; setBusy("apply"); setError("");
    try {
      const entries = await prepareLookTransfer({ look, prompt, selected: selectedKinds }, looksApi);
      onUse("batch", entries);
      onClose();
    }
    catch (e) { setError(e.message); }
    finally { working.current = false; setBusy(""); }
  }
  async function remove() {
    if (working.current || !window.confirm(`Delete "${look.name}" from ${look.shared ? "Shared User Looks for everyone" : "My Looks"}? Existing canvas nodes and image files will be kept.`)) return;
    working.current = true; setBusy("remove"); setError("");
    try { await (look.shared ? looksApi.removeShared(look.id, look.sharedDirectory) : looksApi.remove(look.id)); onRemoved(look.id); onClose(); }
    catch (e) { setError(e.message); }
    finally { working.current = false; setBusy(""); }
  }
  return <dialog ref={dialog} className="look-detail" aria-labelledby="look-detail-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header><div><h2 id="look-detail-title">{look.name}</h2><span>{look.category}</span></div><button className="look-icon" title={starred ? "Remove favorite" : "Favorite look"} aria-pressed={starred} onClick={onStar}><Star size={19} fill={starred ? "currentColor" : "none"} /></button><button className="look-icon" title="Close look" disabled={Boolean(busy)} onClick={onClose}><X size={20} /></button></header>
    <div className="look-detail-body">
      <div className="look-detail-images">
        <div className="look-detail-main"><LookImage image={examples[index]} alt={`${look.name} example ${index + 1}`} /></div>
        <div className="look-detail-thumbs">{examples.map((image, i) => <button key={image.id || i} aria-label={`Example ${i + 1}`} aria-pressed={index === i} onClick={() => setIndex(i)}><LookImage image={image} thumbnail alt="" /></button>)}</div>
      </div>
      <aside>
        <label className="look-description-label" htmlFor="look-description">Style description</label>
        <textarea id="look-description" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={12000} disabled={Boolean(busy)} placeholder="Describe the visual treatment" />
        {displayedPalette.length > 0 && <div className="look-palette" aria-label="Look palette">{displayedPalette.filter(color => /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(color.hex)).map((color, i) => <span key={i} style={{ background: color.hex }} title={`${color.name || "Color"} ${color.hex}`} />)}</div>}
        {look.tags?.length > 0 && <div className="look-tags">{look.tags.slice(0, 40).join(" / ")}</div>}
        {error && <p className="look-error" role="alert">{error}</p>}
        <div className="look-transfer">
          <div className="look-detail-actions">
            <button className="look-primary look-transfer-trigger" aria-expanded={transferOpen} aria-controls="look-transfer-options" disabled={Boolean(busy)} onClick={() => setTransferOpen(value => !value)}><ArrowUpRight size={17} />Transfer Look<ChevronDown size={16} /></button>
            {look.custom && <button className="look-icon" title="Delete created look" disabled={Boolean(busy)} onClick={remove}><Trash2 size={17} /></button>}
          </div>
          <div className={`look-transfer-reveal ${transferOpen ? "is-open" : ""}`} inert={!transferOpen}>
            <div><section id="look-transfer-options" ref={transferPanel} aria-label="Transfer Look options" aria-hidden={!transferOpen}>
              {lookTransferChoices.map(({ id, label }) => <label key={id} className="look-transfer-option" title={transferTitles[id]}>
                <span>{label}</span><input type="checkbox" role="switch" aria-label={label} checked={Boolean(selectedKinds[id])} disabled={Boolean(busy) || (id === "text" ? !prompt.trim() : !examples.length || (id === "style" && look.custom && !prompt.trim()))} onChange={event => setSelectedKinds(current => ({ ...current, [id]: event.target.checked }))} />
              </label>)}
              <button className="look-primary look-apply-nodes" disabled={Boolean(busy) || Boolean(transferError)} title={transferError || (selectedKinds.style ? transferTitles.style : "Add the selected nodes to the current canvas")} onClick={apply}>
                {busy === "apply" ? <Loader2 size={17} className="spin" /> : <Check size={17} />}{busy === "apply" ? selectedKinds.style && !look.custom ? "Preparing style..." : "Preparing nodes..." : "Apply Nodes"}
              </button>
            </section></div>
          </div>
        </div>
      </aside>
    </div>
  </dialog>;
}

export default function LooksWorkspace({ onUse, active = true }) {
  const [status, setStatus] = React.useState(null), [query, setQuery] = React.useState(""), [category, setCategory] = React.useState("");
  const [starredOnly, setStarredOnly] = React.useState(false), [refresh, setRefresh] = React.useState(0);
  const [error, setError] = React.useState(""), [visibleIds, setVisibleIds] = React.useState([]);
  const [folderOpen, setFolderOpen] = React.useState(false), [folder, setFolder] = React.useState(""), [connecting, setConnecting] = React.useState(false);
  const [selected, setSelected] = React.useState(null), [opening, setOpening] = React.useState(""), [starring, setStarring] = React.useState(false);
  const [library, setLibrary] = React.useState({ customCount: 0, categories: [], collections: [] });
  const [sharedDirectory, setSharedDirectory] = React.useState("");
  const [source, setSource] = React.useState("all"), [creating, setCreating] = React.useState(false), [checked, setChecked] = React.useState([]);
  const [destination, setDestination] = React.useState(""), [collectionName, setCollectionName] = React.useState(""), [newCollection, setNewCollection] = React.useState(false), [organizing, setOrganizing] = React.useState(false);
  const detailVersion = React.useRef(0), favoriteBusy = React.useRef(false);
  const wasActive = React.useRef(active);
  const [visit, setVisit] = React.useState(0);
  const searchRef = React.useRef(null), gallery = React.useRef(null), organizeBusy = React.useRef(false);
  const collectionId = source.startsWith("collection-") ? source : "";
  const canBrowse = source !== "catalog" || Boolean(status?.ready);
  const discovery = source === "all" && !query.trim() && !category && !starredOnly;
  const feed = useLooksFeed({ q: query, category, starred: starredOnly, ...(!collectionId ? { source } : { collection: collectionId }) }, canBrowse,
    [refresh, status?.directory, sharedDirectory, starredOnly ? status?.favorites : null, visit], { randomStart: discovery });
  const { loading } = feed;
  React.useEffect(() => {
    if (active && !wasActive.current && discovery && !checked.length && !selected && !creating) {
      detailVersion.current++; setOpening(""); setVisit(value => value + 1);
    }
    wasActive.current = active;
  }, [active, discovery, checked.length, selected, creating]);
  React.useEffect(() => {
    let cancelled = false;
    looksApi.status().then(data => { if (!cancelled) { setStatus(data); setFolder(data.directory); if (!data.directory) setFolderOpen(true); } }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; detailVersion.current++; };
  }, [refresh]);
  React.useEffect(() => {
    let cancelled = false;
    looksApi.library().then(data => { if (!cancelled) setLibrary(data); }).catch(e => { if (!cancelled) setError(e.message); });
    looksApi.shared().then(data => { if (!cancelled) setSharedDirectory(data.directory); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [refresh]);
  React.useEffect(() => { if (active) searchRef.current?.focus({ preventScroll: true }); }, [active]);
  React.useEffect(() => { detailVersion.current++; setOpening(""); }, [source, query, category, starredOnly]);
  const favorites = new Set(status?.favorites || []);
  async function open(look) {
    const version = ++detailVersion.current;
    setOpening(look.id); setError("");
    try { const data = await looksApi.detail(look.id); if (version === detailVersion.current) setSelected(data.look); }
    catch (e) { if (version === detailVersion.current) setError(e.message); }
    finally { if (version === detailVersion.current) setOpening(""); }
  }
  async function star(look) {
    if (favoriteBusy.current) return;
    favoriteBusy.current = true; setStarring(true); setError("");
    try { const data = await looksApi.favorite(look.id, !favorites.has(look.id)); setStatus(current => ({ ...current, ...data })); }
    catch (e) { setError(e.message); }
    finally { favoriteBusy.current = false; setStarring(false); }
  }
  async function connect(directory = folder) {
    setConnecting(true); setError("");
    try { const data = await looksApi.connect(directory); detailVersion.current++; setStatus(data); setFolder(data.directory); setFolderOpen(false); setCategory(""); setSelected(null); setChecked([]); }
    catch (e) { setError(e.message); }
    finally { setConnecting(false); }
  }
  async function browse() {
    setError("");
    try { const result = await outputApi.selectFolder({ title: "Choose Looks catalog folder", defaultPath: folder }); if (!result.canceled && result.path) { setFolder(result.path); await connect(result.path); } }
    catch (e) { setError(e.message); }
  }
  function filter(set, value) { set(value); setError(""); }
  function chooseSource(value) { setSource(value); setCategory(""); setQuery(""); setChecked([]); setError(""); }
  function toggle(look) { setChecked(current => current.includes(look.id) ? current.filter(id => id !== look.id) : current.length < 500 ? [...current, look.id] : current); }
  async function organize(run) {
    if (organizeBusy.current) return;
    organizeBusy.current = true; setOrganizing(true); setError("");
    try { await run(); setRefresh(value => value + 1); }
    catch (e) { setError(e.message); }
    finally { organizeBusy.current = false; setOrganizing(false); }
  }
  async function createCollection(event) {
    event.preventDefault();
    await organize(async () => {
      const { collection } = await looksApi.createCollection(collectionName);
      setLibrary(current => ({ ...current, collections: [...current.collections, collection] }));
      setDestination(collection.id); setNewCollection(false); setCollectionName("");
      if (checked.length) await looksApi.updateCollection(collection.id, { ids: checked, action: "add" });
      setChecked([]);
    });
  }
  const categories = ["all", "shared", "film-stills"].includes(source) ? feed.categories : source === "catalog" ? status?.categories || [] : source === "custom" ? library.categories : [...new Set([...(status?.categories || []), ...library.categories])].sort();
  return <section className="looks-workspace" aria-label="Looks library">
    <div className="looks-heading"><h1>Looks</h1><span>{!loading && canBrowse ? `${feed.indexed.toLocaleString()} looks` : ""}</span><div className="looks-heading-actions"><button className="look-primary" onClick={() => setCreating(true)}><Plus size={18} />Create Look</button><button className="look-icon" title="Refresh catalog" onClick={() => { setError(""); setRefresh(value => value + 1); }}><RefreshCw size={18} /></button><button className="look-icon" title="Looks folder" aria-expanded={folderOpen} onClick={() => setFolderOpen(value => !value)}><FolderOpen size={19} /></button></div></div>
    {folderOpen && <form className="looks-folder" onSubmit={event => { event.preventDefault(); connect(); }}><label htmlFor="looks-folder">Catalog folder</label><input id="looks-folder" value={folder} onChange={e => setFolder(e.target.value)} placeholder="Path to Looks" disabled={connecting} /><button type="button" title="Browse for Looks folder" className="look-icon" onClick={browse} disabled={connecting}><FolderOpen size={18} /></button><button type="submit" disabled={connecting || !folder.trim()}>{connecting && <Loader2 className="spin" size={16} />}Connect</button></form>}
    {folderOpen && <SharedLooksFolder directory={sharedDirectory} onChange={value => { setSharedDirectory(value); setError(""); setRefresh(current => current + 1); if (!value && source === "shared") chooseSource("custom"); }} />}
    {status?.message && source !== "all" && <p className="look-error" role="alert">{status.message}</p>}
    {feed.warnings.map(message => <p key={message} className="look-error" role="alert">{message}</p>)}
    {error && <p className="look-error" role="alert">{error}</p>}
    {feed.error && <div className="looks-load-error" role="alert"><span className="look-error">{feed.error}</span><button onClick={feed.retry}><RefreshCw size={16} />Retry loading</button></div>}
    <div className="looks-filters">
      <select aria-label="Look library" value={source} onChange={event => chooseSource(event.target.value)}><option value="all">All Looks</option><option value="catalog">Catalog</option><option value="film-stills">Film Stills</option><option value="custom">My Looks ({library.customCount})</option>{sharedDirectory && <option value="shared">Shared User Looks</option>}{library.collections.length > 0 && <optgroup label="Collections">{library.collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select>
      <label className="looks-search"><Search size={18} /><input ref={searchRef} aria-label="Search looks" placeholder="Search looks" value={query} onChange={e => filter(setQuery, e.target.value)} /></label>
      <select aria-label="Look category" value={category} onChange={e => filter(setCategory, e.target.value)}><option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
      <button className="looks-favorites" aria-pressed={starredOnly} onClick={() => filter(setStarredOnly, !starredOnly)}><Star size={16} fill={starredOnly ? "currentColor" : "none"} />Favorites</button>
      <button className="look-icon" title="New collection" aria-expanded={newCollection} onClick={() => setNewCollection(value => !value)}><FolderPlus size={19} /></button>
      {collectionId && <button className="look-icon" title="Delete collection" disabled={organizing} onClick={() => { if (window.confirm("Delete this collection? The looks and image files will be kept.")) organize(async () => { await looksApi.removeCollection(collectionId); chooseSource("all"); }); }}><Trash2 size={18} /></button>}
    </div>
    {newCollection && <form className="looks-collection-form" onSubmit={createCollection}><input aria-label="Collection name" placeholder="Collection name" value={collectionName} maxLength={120} onChange={event => setCollectionName(event.target.value)} disabled={organizing} autoFocus /><button type="submit" disabled={organizing || !collectionName.trim()}><FolderPlus size={16} />{checked.length ? "Create and add selected" : "Create collection"}</button><button type="button" className="look-icon" title="Cancel collection" disabled={organizing} onClick={() => setNewCollection(false)}><X size={16} /></button></form>}
    <div className="looks-selection-bar">
      {checked.length > 0 && sharedDirectory && source !== "shared" && <button title="Copy selected looks and their images into Shared User Looks. Originals stay here. Up to six images per look; no AI call." disabled={organizing} onClick={() => organize(async () => { await looksApi.share(checked, sharedDirectory); setChecked([]); chooseSource("shared"); })}><Share2 size={16} />Share</button>}
      <label><input type="checkbox" aria-label="Select visible looks" disabled={loading || !visibleIds.length || organizing || (checked.length >= 500 && !visibleIds.some(id => checked.includes(id)))} checked={Boolean(visibleIds.length) && visibleIds.every(id => checked.includes(id))} ref={element => { if (element) element.indeterminate = visibleIds.some(id => checked.includes(id)) && !visibleIds.every(id => checked.includes(id)); }} onChange={event => { const selected = event.target.checked; setChecked(current => selected ? [...new Set([...current, ...visibleIds])].slice(0, 500) : current.filter(id => !visibleIds.includes(id))); }} /><span>{checked.length ? `${checked.length} selected` : "Select"}</span></label>
      {checked.length > 0 && <><select aria-label="Destination collection" value={destination} onChange={event => setDestination(event.target.value)} disabled={organizing}><option value="">Choose collection</option>{library.collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={organizing || !destination} onClick={() => organize(async () => { await looksApi.updateCollection(destination, { ids: checked, action: "add" }); setChecked([]); })}><FolderPlus size={16} />Add</button>{collectionId && <button disabled={organizing} onClick={() => organize(async () => { await looksApi.updateCollection(collectionId, { ids: checked, action: "remove" }); setChecked([]); })}><Trash2 size={16} />Remove from collection</button>}<button className="look-icon" title="Clear selection" disabled={organizing} onClick={() => setChecked([])}><X size={16} /></button></>}
      <div className="looks-results-status" role="status">{loading || organizing ? <><Loader2 className="spin" size={15} />{organizing ? "Saving collection" : "Loading looks"}</> : canBrowse ? <>{feed.loadingMore && <Loader2 className="spin" size={15} aria-label="Loading more looks" />}{feed.total.toLocaleString()} results</> : ""}</div>
    </div>
    <LookGallery viewport={gallery} feed={feed} active={active && !selected && !creating} checked={checked} favorites={favorites} organizing={organizing} starring={starring} opening={opening} onOpen={open} onSelect={toggle} onStar={star} onVisible={setVisibleIds} />
    <LookShuttle viewport={gallery} count={feed.styles.length} resetKey={feed.key} active={active && !selected && !creating} />
    {canBrowse && !loading && !feed.styles.length && !error && !feed.error && <p className="looks-empty">{starredOnly ? "No favorite looks match." : "No matching looks."}</p>}
    {selected && <LookDetail key={selected.id} look={selected} starred={favorites.has(selected.id)} onStar={() => star(selected)} onClose={() => setSelected(null)} onUse={onUse} onRemoved={id => { setChecked(current => current.filter(value => value !== id)); setRefresh(value => value + 1); }} />}
    {creating && <CreateLookDialog sharedDirectory={sharedDirectory} categories={status?.categories || []} onClose={() => setCreating(false)} onSaved={look => { setCreating(false); setStarredOnly(false); chooseSource(look.shared ? "shared" : "custom"); setRefresh(value => value + 1); }} />}
  </section>;
}

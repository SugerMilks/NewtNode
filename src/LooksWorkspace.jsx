import React from "react";
import { Search, FolderOpen, RefreshCw, Star, X, ChevronLeft, ChevronRight, Palette, Images, Loader2, ExternalLink, ImageOff } from "lucide-react";
import { looksApi, outputApi } from "./api/newtApi.js";
import { portableLookPrompt } from "./looks.js";
import "./looks.css";

function imageUrl(image, thumbnail = false) {
  const url = image?.url || "";
  if (!url.startsWith("/api/style-library/stylefinder-image?")) return "";
  return looksApi.imageUrl(`${url}${thumbnail ? "&thumbnail=1" : ""}`);
}
function LookImage({ image, thumbnail, ...props }) {
  const src = imageUrl(image, thumbnail), [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img {...props} src={src} onError={() => setFailed(true)} loading="lazy" decoding="async" /> : <span className="look-image-missing" title="Local image unavailable"><ImageOff size={24} /></span>;
}

function LookDetail({ look, starred, onStar, onClose, onUse }) {
  const dialog = React.useRef(null);
  const [prompt, setPrompt] = React.useState(() => portableLookPrompt(look.styleAnalysis?.stylePrompt || look.prompt));
  const [index, setIndex] = React.useState(0), [busy, setBusy] = React.useState(""), [error, setError] = React.useState("");
  React.useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  const examples = look.examples || [];
  async function use(kind) {
    setBusy(kind); setError("");
    try { const data = await (kind === "style" ? looksApi.createStyle : looksApi.import)({ id: look.id, prompt }); onUse(kind, data.look); onClose(); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
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
        {look.colours?.length > 0 && <div className="look-palette" aria-label="Look palette">{look.colours.filter(color => /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(color.hex)).map((color, i) => <span key={i} style={{ background: color.hex }} title={`${color.name || "Color"} ${color.hex}`} />)}</div>}
        {look.tags?.length > 0 && <div className="look-tags">{look.tags.slice(0, 16).join(" / ")}</div>}
        {look.notes && <details><summary>About this look</summary><p>{look.notes}</p></details>}
        {/^https:\/\/(?:midlibrary\.io|styleref\.io)\//.test(look.sourceUrl) && <a href={look.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={13} /></a>}
        {error && <p className="look-error" role="alert">{error}</p>}
        <div className="look-detail-actions">
          <button className="look-primary" disabled={Boolean(busy) || !examples.length} onClick={() => use("style")} title={`Analyze all ${examples.length} images with your enabled AI provider and add a Style node. Analysis is billed; unchanged looks reuse the saved analysis.`}>{busy === "style" ? <Loader2 className="spin" size={17} /> : <Palette size={17} />}{busy === "style" ? `Analyzing ${examples.length} images...` : "Add Style"}</button>
          <button disabled={Boolean(busy) || !examples.length} onClick={() => use("transfer")} title="Copy these local references into a Mood Board on the current canvas">{busy === "transfer" ? <Loader2 className="spin" size={17} /> : <Images size={17} />}Add Mood Board</button>
        </div>
      </aside>
    </div>
  </dialog>;
}

export default function LooksWorkspace({ onUse, active = true }) {
  const [status, setStatus] = React.useState(null), [query, setQuery] = React.useState(""), [category, setCategory] = React.useState("");
  const [starredOnly, setStarredOnly] = React.useState(false), [offset, setOffset] = React.useState(0), [refresh, setRefresh] = React.useState(0);
  const [page, setPage] = React.useState({ styles: [], total: 0 }), [loading, setLoading] = React.useState(true), [error, setError] = React.useState("");
  const [folderOpen, setFolderOpen] = React.useState(false), [folder, setFolder] = React.useState(""), [connecting, setConnecting] = React.useState(false);
  const [selected, setSelected] = React.useState(null), [opening, setOpening] = React.useState(""), [starring, setStarring] = React.useState(false);
  const detailVersion = React.useRef(0), favoriteBusy = React.useRef(false);
  const searchRef = React.useRef(null);
  React.useEffect(() => {
    let cancelled = false;
    looksApi.status().then(data => { if (!cancelled) { setStatus(data); setFolder(data.directory); if (!data.directory) setFolderOpen(true); } }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; detailVersion.current++; };
  }, [refresh]);
  React.useEffect(() => {
    if (!status?.ready) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = setTimeout(() => {
      looksApi.search({ q: query, category, offset, starred: starredOnly }, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setPage(data); })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [status, query, category, offset, starredOnly]);
  React.useEffect(() => { if (active) searchRef.current?.focus({ preventScroll: true }); }, [active]);
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
    try { const data = await looksApi.favorite(look.id, !favorites.has(look.id)); setStatus(current => ({ ...current, ...data })); if (starredOnly) setOffset(0); }
    catch (e) { setError(e.message); }
    finally { favoriteBusy.current = false; setStarring(false); }
  }
  async function connect(directory = folder) {
    setConnecting(true); setError("");
    try { const data = await looksApi.connect(directory); setStatus(data); setFolder(data.directory); setFolderOpen(false); setOffset(0); setCategory(""); setSelected(null); }
    catch (e) { setError(e.message); }
    finally { setConnecting(false); }
  }
  async function browse() {
    setError("");
    try { const result = await outputApi.selectFolder({ title: "Choose Looks catalog folder", defaultPath: folder }); if (!result.canceled && result.path) { setFolder(result.path); await connect(result.path); } }
    catch (e) { setError(e.message); }
  }
  function filter(set, value) { set(value); setOffset(0); }
  return <section className="looks-workspace" aria-label="Looks library">
    <div className="looks-heading"><h1>Looks</h1><span>{status?.ready ? `${status.indexed.toLocaleString()} looks` : "Local catalog"}</span><div className="looks-heading-actions"><button className="look-icon" title="Refresh catalog" onClick={() => { setRefresh(value => value + 1); setOffset(0); }}><RefreshCw size={18} /></button><button className="look-icon" title="Looks folder" aria-expanded={folderOpen} onClick={() => setFolderOpen(value => !value)}><FolderOpen size={19} /></button></div></div>
    {folderOpen && <form className="looks-folder" onSubmit={event => { event.preventDefault(); connect(); }}><label htmlFor="looks-folder">Catalog folder</label><input id="looks-folder" value={folder} onChange={e => setFolder(e.target.value)} placeholder="Path to Looks" disabled={connecting} /><button type="button" title="Browse for Looks folder" className="look-icon" onClick={browse} disabled={connecting}><FolderOpen size={18} /></button><button type="submit" disabled={connecting || !folder.trim()}>{connecting && <Loader2 className="spin" size={16} />}Connect</button></form>}
    {status?.message && <p className="look-error" role="alert">{status.message}</p>}
    {error && <p className="look-error" role="alert">{error}</p>}
    <div className="looks-filters">
      <label className="looks-search"><Search size={18} /><input ref={searchRef} aria-label="Search looks" placeholder="Search looks" value={query} onChange={e => filter(setQuery, e.target.value)} /></label>
      <select aria-label="Look category" value={category} onChange={e => filter(setCategory, e.target.value)}><option value="">All categories</option>{(status?.categories || []).map(item => <option key={item}>{item}</option>)}</select>
      <button className="looks-favorites" aria-pressed={starredOnly} onClick={() => filter(setStarredOnly, !starredOnly)}><Star size={16} fill={starredOnly ? "currentColor" : "none"} />Favorites</button>
    </div>
    <div className="looks-results-status" role="status">{loading ? <><Loader2 className="spin" size={15} />Loading looks</> : status?.ready ? `${page.total.toLocaleString()} results` : ""}</div>
    <div className="looks-grid" aria-busy={loading}>
      {(status?.ready ? page.styles : []).map(look => <article className="look-tile" key={look.id}>
        <button className="look-tile-open" title={`View ${look.name}`} onClick={() => open(look)}><div className="look-tile-image"><LookImage image={look.examples?.[0]} thumbnail alt={look.name} />{opening === look.id && <Loader2 className="look-opening spin" size={22} />}</div><strong>{look.name}</strong><small>{look.category}</small></button>
        <button className="look-star look-icon" title={favorites.has(look.id) ? `Unfavorite ${look.name}` : `Favorite ${look.name}`} aria-pressed={favorites.has(look.id)} disabled={starring} onClick={() => star(look)}><Star size={17} fill={favorites.has(look.id) ? "currentColor" : "none"} /></button>
      </article>)}
    </div>
    {status?.ready && !loading && !page.styles.length && !error && <p className="looks-empty">{starredOnly ? "No favorite looks match." : "No matching looks."}</p>}
    {status?.ready && <footer className="looks-pagination"><button className="look-icon" title="Previous page" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 48))}><ChevronLeft size={19} /></button><span>{page.total ? `${Math.min(offset + 1, page.total)}-${Math.min(offset + 48, page.total)} of ${page.total.toLocaleString()}` : "0 results"}</span><button className="look-icon" title="Next page" disabled={loading || offset + 48 >= page.total} onClick={() => { setOffset(value => value + 48); window.scrollTo({ top: 0 }); }}><ChevronRight size={19} /></button></footer>}
    {selected && <LookDetail key={selected.id} look={selected} starred={favorites.has(selected.id)} onStar={() => star(selected)} onClose={() => setSelected(null)} onUse={onUse} />}
  </section>;
}

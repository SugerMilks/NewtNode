import React from "react";
import { Star, Loader2 } from "lucide-react";
import LookImage from "./LookImage.jsx";

export default function LookGallery({ viewport, feed, active, checked, favorites, organizing, starring, opening, onOpen, onSelect, onStar, onVisible }) {
  const [view, setView] = React.useState({ left: 0, width: 1, rows: 2, gap: 16 });
  React.useLayoutEffect(() => {
    const element = viewport.current;
    const measure = () => {
      const css = getComputedStyle(element);
      setView({ left: element.scrollLeft, width: element.clientWidth, rows: Number(css.getPropertyValue("--look-rows")) || 2, gap: Number(css.getPropertyValue("--look-gap")) || 16 });
    };
    element.scrollTo({ left: 0, behavior: "instant" }); measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    const wheel = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      if ((delta > 0 && element.scrollLeft < element.scrollWidth - element.clientWidth - 1) || (delta < 0 && element.scrollLeft > 0)) {
        event.preventDefault(); element.scrollBy({ left: delta, behavior: "instant" });
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("scroll", measure); element.removeEventListener("wheel", wheel); };
  }, [viewport, feed.key]);
  const stride = 240 + view.gap, columns = Math.ceil(feed.styles.length / view.rows);
  const first = Math.floor(view.left / stride), last = Math.ceil((view.left + view.width) / stride);
  const start = Math.max(0, first - 2) * view.rows, end = Math.min(feed.styles.length, (last + 2) * view.rows);
  React.useEffect(() => {
    const ids = feed.styles.slice(first * view.rows, last * view.rows).map(look => look.id);
    onVisible(current => current.length === ids.length && current.every((id, i) => id === ids[i]) ? current : ids);
  }, [feed.styles, first, last, view.rows, onVisible]);
  React.useEffect(() => {
    if (active && feed.hasMore && !feed.loading && !feed.loadingMore && !feed.error && columns * stride - view.left - view.width < Math.max(900, view.width)) feed.loadMore();
  }, [active, feed.hasMore, feed.loading, feed.loadingMore, feed.error, feed.loadMore, columns, stride, view.left, view.width]);
  return <div ref={viewport} className="looks-grid" role="list" aria-label="Look images" aria-busy={feed.loading || feed.loadingMore} tabIndex={0} data-loaded={feed.styles.length} data-start-offset={feed.startOffset} onKeyDown={event => {
    if (event.target !== event.currentTarget) return;
    const element = event.currentTarget;
    const left = { Home: 0, End: element.scrollWidth, ArrowLeft: element.scrollLeft - stride, ArrowRight: element.scrollLeft + stride, PageUp: element.scrollLeft - element.clientWidth, PageDown: element.scrollLeft + element.clientWidth }[event.key];
    if (left !== undefined) { event.preventDefault(); element.scrollTo({ left, behavior: "instant" }); }
  }}>
    <div className="looks-grid-track" role="presentation" style={{ width: Math.max(0, columns * stride - view.gap) }}>
      {feed.styles.slice(start, end).map((look, i) => { const position = start + i; return <article className={`look-tile${checked.includes(look.id) ? " is-selected" : ""}`} key={look.id} role="listitem" aria-posinset={position + 1} aria-setsize={feed.total} data-look-id={look.id} style={{ left: Math.floor(position / view.rows) * stride, top: (position % view.rows) * (238 + view.gap) }}>
        <button className="look-tile-open" title={`View ${look.name}`} onClick={() => onOpen(look)}><div className="look-tile-image"><LookImage image={look.examples?.[0]} thumbnail alt={look.name} />{opening === look.id && <Loader2 className="look-opening spin" size={22} />}</div><strong>{look.name}</strong><small>{look.category}</small></button>
        <label className="look-select" title={`Select ${look.name}`}><input type="checkbox" aria-label={`Select ${look.name}`} checked={checked.includes(look.id)} disabled={organizing || (!checked.includes(look.id) && checked.length >= 500)} onChange={() => onSelect(look)} /></label>
        <button className="look-star look-icon" title={favorites.has(look.id) ? `Unfavorite ${look.name}` : `Favorite ${look.name}`} aria-pressed={favorites.has(look.id)} disabled={starring} onClick={() => onStar(look)}><Star size={17} fill={favorites.has(look.id) ? "currentColor" : "none"} /></button>
      </article>; })}
    </div>
  </div>;
}

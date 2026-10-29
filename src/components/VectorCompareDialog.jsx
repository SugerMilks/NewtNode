import React from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import { updateVectorResultLabel } from "../vectorDesignLooks.js";

export default function VectorCompareDialog({ items, currentUrl, update, onChoose, onClose }) {
  const modal = React.useRef(null), previous = React.useRef(null);
  const [count, setCount] = React.useState(2), [slots, setSlots] = React.useState(() => [...(items.some(item => item.url === currentUrl) ? [currentUrl] : []), ...items.filter(item => item.url !== currentUrl).map(item => item.url)].slice(0, 4));
  React.useEffect(() => { setSlots(current => [...current.filter(url => items.some(item => item.url === url)), ...items.filter(item => !current.includes(item.url)).map(item => item.url)].slice(0, 4)); }, [items]);
  React.useEffect(() => { previous.current = document.activeElement; modal.current.showModal(); return () => previous.current?.focus?.(); }, []);
  return createPortal(<dialog className="vector-compare-dialog" ref={modal} aria-label="Compare vector versions" onCancel={event => { event.preventDefault(); onClose(); }} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <header><h2>Compare Versions</h2><div role="group" aria-label="Comparison layout">{[2, 4].map(value => <button key={value} type="button" aria-pressed={count === value} disabled={items.length < value} onClick={() => setCount(value)}>{value}</button>)}</div><button type="button" aria-label="Close comparison" onClick={onClose}><X size={18} /></button></header>
    <div className={`vector-compare-grid count-${count}`}>{slots.slice(0, count).map((url, slot) => {
      const item = items.find(item => item.url === url) || items[slot]; if (!item) return null;
      return <section key={slot}><select aria-label={`Comparison version ${slot + 1}`} value={item.url} onChange={event => setSlots(current => current.map((value, i) => i === slot ? event.target.value : value))}>{items.map((result, i) => <option key={result.url} value={result.url}>{i + 1}. {result.label || "Vector"}</option>)}</select>
        <div className="vector-compare-image"><img src={item.url} alt={item.label || "Vector artwork"} draggable={false} /></div>
        <input key={item.url} aria-label={`Version ${slot + 1} name`} defaultValue={item.label || "Vector"} maxLength="120" onBlur={event => update(current => updateVectorResultLabel(current, item.url, event.target.value))} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        <div><button type="button" aria-pressed={item.vectorApproved === true} title="Mark this version as approved without changing the selected node output" onClick={() => update(current => ({ resultItems: current.resultItems.map(result => ({ ...result, vectorApproved: result.url === item.url ? !item.vectorApproved : false })) }))}><Check size={15} />{item.vectorApproved ? "Approved" : "Approve"}</button><button type="button" onClick={() => { onChoose(item.url); onClose(); }}>Use Version</button></div>
      </section>;
    })}</div>
  </dialog>, document.body);
}

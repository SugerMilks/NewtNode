import { useEffect, useRef, useState } from "react";
import { newtPresetInputRoles } from "../myNewt/presets.js";

export function NewtPresetDialog({ controller }) {
  const [name, setName] = useState("");
  const [slots, setSlots] = useState([]);
  const form = useRef(null);
  const { busy, error, save, cancel } = controller;
  const reusableNodes = (controller.draft?.nodes || []).filter((node) => newtPresetInputRoles[node.type]);
  useEffect(() => {
    const previous = document.activeElement;
    form.current?.querySelector("input")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  function keyDown(event) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); cancel(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(form.current.querySelectorAll("input:not(:disabled), select:not(:disabled), button:not(:disabled), summary")).filter((element) => element.getClientRects().length);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="workflow-prompt-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) cancel(); }}>
    <form ref={form} className="workflow-prompt newt-preset-dialog" role="dialog" aria-modal="true" aria-labelledby="newt-preset-title" onKeyDown={keyDown} onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (name.trim() && !busy) save(name, slots); }}>
      <h2 id="newt-preset-title">Newt Preset</h2>
      <label>Preset name<input aria-label="Preset name" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      {!!reusableNodes.length && <details className="newt-preset-advanced">
        <summary>Advanced</summary>
        <fieldset className="newt-preset-slots" disabled={busy}><legend>Reusable inputs</legend>{reusableNodes.map((node) => {
        const slot = slots.find((item) => item.nodeId === node.id), roles = newtPresetInputRoles[node.type];
        return <div key={node.id}><label><input type="checkbox" checked={!!slot} onChange={(event) => setSlots((current) => event.target.checked ? [...current, { nodeId: node.id, role: roles[0], label: node.data.title || roles[0] }] : current.filter((item) => item.nodeId !== node.id))} />{node.data.title || roles[0]}</label>{slot && <select aria-label={`Role for ${slot.label}`} value={slot.role} onChange={(event) => setSlots((current) => current.map((item) => item.nodeId === node.id ? { ...item, role: event.target.value } : item))}>{roles.map((role) => <option key={role}>{role}</option>)}</select>}</div>;
        })}</fieldset>
      </details>}
      {error && <p role="alert">{error}</p>}
      <div className="workflow-prompt-actions"><button type="button" onClick={cancel} disabled={busy}>Cancel</button><button className="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "Saving..." : "Save"}</button></div>
    </form>
  </div>;
}

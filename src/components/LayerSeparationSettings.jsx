import React from "react";

export default function LayerSeparationSettings({ data, onChange, disabled, maximum = 24 }) {
  return <fieldset disabled={disabled} className="layer-separation-settings">
    <label>Separation instructions<textarea aria-label="Separation instructions" maxLength={4000} rows={4} placeholder="Automatic, or specify elements to separate" value={data.layersPrompt || ""} onChange={event => onChange({ layersPrompt: event.target.value })} /></label>
    <label>Layer limit<input aria-label="Layer limit" type="number" min={2} max={maximum} value={data.layersLimit} onChange={event => onChange({ layersLimit: Math.min(maximum, Math.max(2, Math.trunc(Number(event.target.value)) || 8)) })} /></label>
    <label>Resolution<select aria-label="Layers resolution" value={data.layersResolution} onChange={event => onChange({ layersResolution: event.target.value })}>{["auto", "1k", "1.5k", "2k"].map(value => <option key={value} value={value}>{value === "auto" ? "Auto" : value.toUpperCase()}</option>)}</select></label>
  </fieldset>;
}

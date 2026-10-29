import React from "react";
import { AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Type, Crop, Check, X } from "lucide-react";
import { vectorTextDefaults, validateVectorText } from "../vectorArtwork.js";
import { loadVectorLocalFonts, vectorGenericFonts } from "../vectorFonts.js";

const Tool = ({ title, children, ...props }) => <button type="button" title={title} aria-label={title} {...props}>{children}</button>;
const alignmentTools = [["left", "Align left", AlignHorizontalJustifyStart], ["center", "Align centers horizontally", AlignHorizontalJustifyCenter], ["right", "Align right", AlignHorizontalJustifyEnd], ["top", "Align top", AlignVerticalJustifyStart], ["middle", "Align centers vertically", AlignVerticalJustifyCenter], ["bottom", "Align bottom", AlignVerticalJustifyEnd], ["distributeX", "Distribute horizontal spacing", AlignHorizontalDistributeCenter], ["distributeY", "Distribute vertical spacing", AlignVerticalDistributeCenter]];

export default function VectorArtworkProperties({ doc, documentKey, keys, editable, busy, onEdit, onTransform, onAlign, onFit, onText, onTextPreview, onError, textRequest, onTextClose }) {
  const [all, setAll] = React.useState(false), [color, setColor] = React.useState(null), [replacement, setReplacement] = React.useState("#202020");
  const [angle, setAngle] = React.useState(15), [padding, setPadding] = React.useState(24), [text, setText] = React.useState(null), [fonts, setFonts] = React.useState([]);
  const layers = doc?.layers || [], selected = layers.filter(layer => keys.includes(layer.key));
  const selection = JSON.stringify(keys), byKey = new Map(layers.map(layer => [layer.key, layer]));
  const previousSelection = React.useRef(selection);
  const textScope = React.useRef(null);
  const descendants = layers.filter(layer => { let current = layer; while (current) { if (keys.includes(current.key)) return true; current = byKey.get(current.parentKey); } return false; });
  const palette = all || !keys.length ? doc?.palette || [] : [...new Set(descendants.flatMap(layer => layer.paints || []))].sort();
  const textLayer = selected.length === 1 && selected[0].text ? selected[0] : null;
  React.useEffect(() => { if (previousSelection.current !== selection) { previousSelection.current = selection; setColor(null); if (!textRequest) { setText(null); onTextClose(); } } }, [selection]);
  function beginText(value) {
    textScope.current = { documentKey, selection, textRequest, key: textRequest ? null : textLayer?.key, replaceKeys: textRequest ? [] : keys };
    setText({ ...value });
  }
  React.useEffect(() => { if (textRequest) beginText(vectorTextDefaults); }, [textRequest]);
  React.useEffect(() => {
    const scope = textScope.current;
    if (!text || scope?.documentKey !== documentKey || scope.selection !== selection || scope.textRequest !== textRequest) { onTextPreview(null); if (text) setText(null); return; }
    // Keep the last valid preview while a number is temporarily empty/invalid.
    try { onTextPreview({ ...scope, text: validateVectorText(text) }); } catch { /* Incomplete field; validate on Apply. */ }
  }, [text, documentKey, selection, textRequest, onTextPreview]);
  React.useEffect(() => () => { onTextPreview(null); onTextClose(); }, [onTextPreview, onTextClose]);
  React.useEffect(() => {
    if (!text) return;
    const controller = new AbortController();
    loadVectorLocalFonts(undefined, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setFonts(value); });
    return () => controller.abort();
  }, [Boolean(text)]);
  const closeText = () => { setText(null); onTextPreview(null); onTextClose(); };
  const field = (label, control) => <label><span>{label}</span>{control}</label>;
  return <div className="vle-properties" aria-label="Artwork properties">
    {keys.length > 0 && !text && <div className="vle-transform-tools" role="group" aria-label="Selection layout">
      <div className="vle-property-tools">
        <Tool title="Rotate counterclockwise" disabled={busy || !editable} onClick={() => onTransform("rotate", -Number(angle))}><RotateCcw size={15} /></Tool>
        <input type="number" aria-label="Rotation degrees" min="0" max="360" value={angle} onChange={event => setAngle(event.target.value)} />
        <Tool title="Rotate clockwise" disabled={busy || !editable} onClick={() => onTransform("rotate", Number(angle))}><RotateCw size={15} /></Tool>
        <Tool title="Flip horizontally" disabled={busy || !editable} onClick={() => onTransform("flipX")}><FlipHorizontal2 size={15} /></Tool>
        <Tool title="Flip vertically" disabled={busy || !editable} onClick={() => onTransform("flipY")}><FlipVertical2 size={15} /></Tool>
      </div>
      <div className="vle-property-tools">{alignmentTools.map(([mode, title, Icon]) => <Tool key={mode} title={title} disabled={busy || !editable || (mode.startsWith("distribute") && keys.length < 3)} onClick={() => onAlign(mode)}><Icon size={15} /></Tool>)}</div>
    </div>}
    {!text && <><div className="vle-palette-heading"><strong>Colors</strong>{keys.length > 0 && <select aria-label="Color edit scope" value={all ? "all" : "selection"} onChange={event => { setAll(event.target.value === "all"); setColor(null); }}><option value="selection">Selection</option><option value="all">All artwork</option></select>}</div>
    <div className="vle-swatches" aria-label="Solid artwork colors">{palette.slice(0, 64).map(value => <button key={value} type="button" aria-label={`Replace color ${value}`} title={`Replace ${value}; solid fills and strokes only`} aria-pressed={color === value} style={{ backgroundColor: value }} disabled={busy} onClick={() => { setColor(value); setReplacement(value.slice(0, 7)); }} />)}</div>
    {color && <form className="vle-color-edit" onSubmit={event => { event.preventDefault(); if (!/^#[a-f0-9]{6}$/i.test(replacement)) { onError("Enter a six-digit hex color."); return; } onEdit({ type: "paint", keys, all: all || !keys.length, from: color, to: replacement }); setColor(null); }}>
      <input type="color" aria-label="Replacement color" value={/^#[a-f0-9]{6}$/i.test(replacement) ? replacement : "#000000"} onChange={event => setReplacement(event.target.value)} />
      <input aria-label="Replacement hex color" value={replacement} maxLength="7" onChange={event => setReplacement(event.target.value)} />
      <Tool title="Apply color" type="submit" disabled={busy}><Check size={15} /></Tool><Tool title="Cancel color change" onClick={() => setColor(null)}><X size={15} /></Tool>
    </form>}
    <div className="vle-property-tools">
      {textLayer ? <button type="button" disabled={busy || !editable} onClick={() => beginText(textLayer.text)}><Type size={15} />Edit Text</button>
        : keys.length > 0 && <button type="button" disabled={busy || !editable} title="Hide the selected outlines and add editable text; original outlines remain in the layer tree" onClick={() => beginText(vectorTextDefaults)}><Type size={15} />Replace with Text</button>}
    </div></>}
    {text && <form className="vle-text-editor" aria-label="Text properties" onSubmit={event => { event.preventDefault(); try { const value = validateVectorText(text); onText(value, textLayer?.key, textRequest ? [] : keys); closeText(); } catch (error) { onError(error.message); } }}>
      <textarea aria-label="Editable text" value={text.content} maxLength="2000" onChange={event => setText({ ...text, content: event.target.value })} />
      {field("Font", <select aria-label="Text font" value={text.family} title="SVG text uses installed fonts; another computer may substitute a missing font. The PNG keeps the rendered appearance." onChange={event => setText({ ...text, family: event.target.value })}>
        {vectorGenericFonts.map(font => <option key={font.family} value={font.family}>{font.label}</option>)}
        {fonts.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}
        {!fonts.some(font => font.id === text.family) && !vectorGenericFonts.some(font => font.family === text.family) && <option value={text.family}>{text.family} (saved font)</option>}
      </select>)}
      <div className="vle-property-grid">
        {field("Size", <input type="number" aria-label="Text size" min="1" max="1000" step="any" value={text.size} onChange={event => setText({ ...text, size: event.target.value === "" ? "" : Number(event.target.value) })} />)}
        {field("Weight", <select aria-label="Text weight" value={text.weight} onChange={event => setText({ ...text, weight: event.target.value })}>{["300", "400", "500", "600", "700", "800", "900"].map(value => <option key={value}>{value}</option>)}</select>)}
        {field("Spacing", <input type="number" aria-label="Text spacing" min="-100" max="100" value={text.spacing} onChange={event => setText({ ...text, spacing: Number(event.target.value) })} />)}
        {field("Line height", <input type="number" aria-label="Text line height" min=".5" max="4" step=".1" value={text.lineHeight} onChange={event => setText({ ...text, lineHeight: Number(event.target.value) })} />)}
        {field("Alignment", <select aria-label="Text alignment" value={text.align} onChange={event => setText({ ...text, align: event.target.value })}><option value="start">Left</option><option value="middle">Center</option><option value="end">Right</option></select>)}
        {field("Color", <input type="color" aria-label="Text color" value={text.fill} onChange={event => setText({ ...text, fill: event.target.value })} />)}
      </div>
      <div className="vle-property-tools"><button type="submit" disabled={busy || (!textRequest && !editable)}>Apply Text</button><button type="button" onClick={closeText}>Cancel</button></div>
    </form>}
    {!keys.length && !text && <div className="vle-fit-canvas">{field("Padding", <input type="number" aria-label="Canvas padding" value={padding} min="0" max="1024" onChange={event => setPadding(Number(event.target.value))} />)}<button type="button" disabled={busy || !doc} onClick={() => onFit(padding)} title="Fit to visible artwork with padding; hidden layers and the original file remain intact"><Crop size={15} />Fit Canvas</button></div>}
  </div>;
}

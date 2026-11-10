import React from "react";
import { X } from "lucide-react";
import { displayMediaUrl, fullResolutionImageProps, setOutputItemDragData, finishOutputItemDragData } from "../mediaAssets.js";
import "../looks.css";

export default function LibraryLookPreview({ look, onChange }) {
  return <section className="library-look-preview">
    <div className="library-look-heading"><strong>{look.name}</strong><button type="button" title="Remove catalog look" onClick={() => onChange(null)}><X size={15} /></button></div>
    {look.examples?.length > 0 && <div className="library-look-images">{look.examples.map((image, index) => {
      const item = { ...image, type: "image", url: image.localUrl, label: `${look.name} reference ${index + 1}` };
      return <img key={image.id || image.localUrl} {...fullResolutionImageProps(image)} src={displayMediaUrl(image.localUrl)} alt={`Look reference ${index + 1}`} loading="lazy" draggable
        title="Drag onto Custom Grade to replace its reference image"
        onPointerDown={event => event.stopPropagation()}
        onDragStart={event => { event.stopPropagation(); setOutputItemDragData(event.dataTransfer, item); }}
        onDragEnd={event => { event.stopPropagation(); finishOutputItemDragData(item, event); }} />;
    })}</div>}
    <textarea aria-label="Look style description" value={look.prompt} onChange={e => onChange({ ...look, prompt: e.target.value })} maxLength={12000} />
  </section>;
}

import { Compass, X } from "lucide-react";
import { allowFileDrop, outputItemFromDataTransfer, previewImageUrl } from "../mediaAssets.js";
import { useNewtNodeImageFallback } from "./MediaViews.jsx";

export function StyleCollage({ images, locked, outputUrl, outputLabel = "MOOD_BOARD.png", onRemove, onDropImages, onDropOutput }) {
  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const outputItem = outputItemFromDataTransfer(event.dataTransfer);
    if (outputItem) {
      onDropOutput?.(outputItem);
      return;
    }
    onDropImages?.(event.dataTransfer.files);
  }

  if (locked && outputUrl) {
    return (
      <div className="style-collage transfer-output-preview locked">
        <div className="style-collage-cell">
          <img src={previewImageUrl(outputUrl)} alt={outputLabel} onError={useNewtNodeImageFallback} />
          <span>{outputLabel}</span>
        </div>
      </div>
    );
  }

  if (!images.length) {
    return (
      <div className="style-collage empty" onDragOver={allowFileDrop} onDrop={handleDrop}>
        <Compass size={24} />
        <span>Drop mood board images here</span>
      </div>
    );
  }

  return (
    <div className={`style-collage count-${images.length} ${locked ? "locked" : ""}`} onDragOver={allowFileDrop} onDrop={handleDrop}>
      {images.map((image) => (
        <div className="style-collage-cell" key={image.id}>
          <img src={previewImageUrl(image)} alt={image.fileName || "Mood board reference"} onError={useNewtNodeImageFallback} />
          {!locked && (
            <button onClick={() => onRemove(image.id)} title="Remove image">
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

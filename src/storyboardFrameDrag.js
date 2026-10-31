export function setStoryboardFrameDragImage(event, frameNumber) {
  const card = event.currentTarget;
  const media = card.querySelector(".storyboard-frame-media");
  const rect = media?.getBoundingClientRect();
  if (!rect?.width || !rect.height || !event.dataTransfer?.setDragImage) return;

  // Chrome can include neighboring grid cards in a native drag snapshot inside
  // the transformed node canvas. Rasterize only this frame at its visible size.
  const scale = Math.min(1, 360 / Math.max(rect.width, rect.height));
  const preview = card.ownerDocument.createElement("canvas");
  preview.width = Math.max(1, Math.round(rect.width * scale));
  preview.height = Math.max(1, Math.round(rect.height * scale));
  const context = preview.getContext("2d");
  if (!context) return;
  context.fillStyle = "#080808";
  context.fillRect(0, 0, preview.width, preview.height);
  const image = media.querySelector("img");
  if (image?.complete && image.naturalWidth && image.naturalHeight) {
    const fit = Math.min(preview.width / image.naturalWidth, preview.height / image.naturalHeight);
    const width = image.naturalWidth * fit, height = image.naturalHeight * fit;
    context.drawImage(image, (preview.width - width) / 2, (preview.height - height) / 2, width, height);
  }
  if (preview.width >= 40 && preview.height >= 24) {
    context.fillStyle = "rgba(0, 0, 0, 0.7)";
    context.fillRect(4, 4, 28, 18);
    context.fillStyle = "#fff";
    context.font = "bold 11px sans-serif";
    context.textAlign = "center";
    context.fillText(String(frameNumber || 1).padStart(2, "0"), 18, 17, 24);
  }
  const x = Math.max(0, Math.min(preview.width - 1, (event.clientX - rect.left) * scale));
  const y = Math.max(0, Math.min(preview.height - 1, (event.clientY - rect.top) * scale));
  const document = card.ownerDocument;
  const view = document.defaultView;
  // Unlike an <img>, a canvas needs a rendered layout box for Chrome's native
  // drag snapshot. Mount outside the zoomed grid until that snapshot is taken.
  Object.assign(preview.style, {
    position: "fixed",
    left: `${Math.max(0, Math.min(rect.left, view.innerWidth - preview.width))}px`,
    top: `${Math.max(0, Math.min(rect.top, view.innerHeight - preview.height))}px`,
    width: `${preview.width}px`,
    height: `${preview.height}px`,
    pointerEvents: "none",
    zIndex: "2147483647",
    contain: "strict"
  });
  preview.setAttribute("aria-hidden", "true");
  preview.setAttribute("data-storyboard-drag-preview", "");
  document.body.append(preview);
  preview.getBoundingClientRect();

  let animationFrame;
  const cleanup = () => {
    preview.remove();
    view.cancelAnimationFrame(animationFrame);
    document.removeEventListener("dragend", cleanup, true);
    document.removeEventListener("drop", cleanup, true);
    view.removeEventListener("pagehide", cleanup);
  };
  document.addEventListener("dragend", cleanup, true);
  document.addEventListener("drop", cleanup, true);
  view.addEventListener("pagehide", cleanup);
  try {
    event.dataTransfer.setDragImage(preview, x, y);
    animationFrame = view.requestAnimationFrame(cleanup);
  } catch {
    cleanup();
  }
}

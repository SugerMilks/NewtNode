import React from "react";
import { clampImagePreviewViewport, imagePreviewWheelFactor, zoomImagePreviewAt } from "../mediaPreviewLayout.js";

const fittedView = { x: 0, y: 0, scale: 1 };

export function useImagePreviewViewport({ stageRef, imageSize, enabled, sourceKey, canPan, isEditing }) {
  const [view, setView] = React.useState(fittedView);
  const [panning, setPanning] = React.useState(false);
  const viewRef = React.useRef(fittedView);
  const dragRef = React.useRef(null);
  const gestureRef = React.useRef(null);
  function update(next) { viewRef.current = next; setView(next); }
  function bounds() {
    const stage = stageRef.current;
    const rect = stage.getBoundingClientRect();
    const styles = window.getComputedStyle(stage);
    return { rect, size: {
      width: stage.clientWidth - (parseFloat(styles.paddingLeft) || 0) - (parseFloat(styles.paddingRight) || 0),
      height: stage.clientHeight - (parseFloat(styles.paddingTop) || 0) - (parseFloat(styles.paddingBottom) || 0)
    } };
  }
  function finishPan(cancel = false) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setPanning(false);
    if (cancel) update(drag.view);
    if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
  }
  function reset() { finishPan(); gestureRef.current = null; update(fittedView); }
  function zoom(factor, clientX, clientY) {
    if (!enabled || !imageSize.width || dragRef.current || isEditing()) return;
    const { rect, size } = bounds();
    const point = {
      x: Number.isFinite(clientX) ? clientX - rect.left - rect.width / 2 : 0,
      y: Number.isFinite(clientY) ? clientY - rect.top - rect.height / 2 : 0
    };
    update(zoomImagePreviewAt(viewRef.current, factor, point, imageSize, size));
  }

  React.useLayoutEffect(() => { reset(); }, [enabled, sourceKey]);
  React.useLayoutEffect(() => {
    if (!enabled || !stageRef.current || !imageSize.width) return;
    const clampToStage = () => {
      finishPan();
      update(clampImagePreviewViewport(viewRef.current, imageSize, bounds().size));
    };
    clampToStage();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(clampToStage) : null;
    observer?.observe(stageRef.current);
    return () => observer?.disconnect();
  }, [enabled, imageSize.width, imageSize.height, canPan]);

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!enabled || !stage) return;
    function wheel(event) {
      event.preventDefault(); event.stopPropagation();
      stage.focus({ preventScroll: true });
      if (!gestureRef.current) zoom(imagePreviewWheelFactor(event, stage.clientHeight), event.clientX, event.clientY);
    }
    function gesture(event) {
      event.preventDefault(); event.stopPropagation();
      if (event.type === "gestureend") { gestureRef.current = null; return; }
      if (event.type === "gesturestart") { gestureRef.current = event.scale || 1; return; }
      const previous = gestureRef.current;
      if (previous && event.scale > 0) zoom(event.scale / previous, event.clientX, event.clientY);
      gestureRef.current = event.scale || previous;
    }
    function blur() { finishPan(true); gestureRef.current = null; }
    stage.addEventListener("wheel", wheel, { passive: false });
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) stage.addEventListener(type, gesture, { passive: false });
    window.addEventListener("blur", blur);
    return () => {
      stage.removeEventListener("wheel", wheel);
      for (const type of ["gesturestart", "gesturechange", "gestureend"]) stage.removeEventListener(type, gesture);
      window.removeEventListener("blur", blur);
      finishPan(); gestureRef.current = null;
    };
  }, [enabled, imageSize.width, imageSize.height]);

  function pointerDown(event) {
    if (!enabled || !canPan || event.button !== 0 || dragRef.current || !imageSize.width || isEditing()) return;
    if (event.target.closest("button, input, a, .output-crop-box, .output-text-overlay")) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, element: event.currentTarget, x: event.clientX, y: event.clientY, view: viewRef.current };
    setPanning(true);
  }
  function pointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    update(clampImagePreviewViewport({ ...drag.view, x: drag.view.x + event.clientX - drag.x, y: drag.view.y + event.clientY - drag.y }, imageSize, bounds().size));
  }
  function pointerEnd(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.type === "pointerup") pointerMove(event);
    finishPan(event.type !== "pointerup");
  }
  function keyboard(event) {
    if (event.target !== stageRef.current || event.altKey || event.metaKey || event.ctrlKey) return;
    if (!["+", "=", "-", "0"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "0") reset();
    else zoom(event.key === "-" ? 1 / 1.2 : 1.2);
  }
  function cancelPan() { if (!dragRef.current) return false; finishPan(true); return true; }
  return {
    view, panning, cancelPan,
    handlers: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerEnd,
      onPointerCancel: pointerEnd, onLostPointerCapture: pointerEnd, onKeyDown: keyboard, onBlur: () => finishPan(true) }
  };
}

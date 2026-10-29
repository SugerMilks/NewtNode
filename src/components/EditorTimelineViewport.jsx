import React from "react";
import { editorScrollbarGeometry, editorZoomScrollLeft, editorTrackHeaderWidth } from "../editorViewport.js";
import { normalizeEditorZoom } from "../editorTimeline.js";

export function useEditorTimelineViewport({ scroller, zoom, fps, frame, contentEnd }) {
  const previous = React.useRef({ zoom, scrollLeft: 0 });
  const [viewport, setViewport] = React.useState({ scrollLeft: 0, viewportWidth: 0, scrollWidth: 0 });
  const sync = React.useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const next = { scrollLeft: element.scrollLeft, viewportWidth: element.clientWidth, scrollWidth: element.scrollWidth };
    previous.current.scrollLeft = next.scrollLeft;
    setViewport(value => Object.keys(next).every(key => value[key] === next[key]) ? value : next);
  }, [scroller]);
  const scrollTo = React.useCallback(value => {
    if (scroller.current) scroller.current.scrollLeft = value;
    sync();
  }, [scroller, sync]);

  React.useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (zoom !== previous.current.zoom) {
      // Use the pre-zoom offset: shrinking the DOM may already have clamped scrollLeft.
      element.scrollLeft = editorZoomScrollLeft({ frame, fps, zoom, previousZoom: previous.current.zoom,
        scrollLeft: previous.current.scrollLeft, viewportWidth: element.clientWidth, scrollWidth: element.scrollWidth });
    }
    previous.current.zoom = zoom;
    sync();
  }, [zoom, fps, frame, contentEnd, viewport.viewportWidth, scroller, sync]);

  React.useLayoutEffect(() => {
    const element = scroller.current;
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    observer.observe(element.firstElementChild);
    element.addEventListener("scroll", sync, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", sync); };
  }, [scroller, sync]);

  function prepareFit(nextZoom) {
    previous.current.zoom = normalizeEditorZoom(nextZoom);
    scrollTo(0);
  }
  return { viewport, scrollTo, prepareFit };
}

export function EditorTimelineScrollbar({ viewport, scrollTo, controls }) {
  const rail = React.useRef(null), drag = React.useRef(null);
  const [trackWidth, setTrackWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const observer = new ResizeObserver(() => setTrackWidth(rail.current.clientWidth));
    observer.observe(rail.current);
    setTrackWidth(rail.current.clientWidth);
    return () => observer.disconnect();
  }, []);
  const { maxScroll, thumbWidth, travel, left } = editorScrollbarGeometry({ ...viewport, trackWidth });
  function pointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    if (!maxScroll || !travel) return;
    const rect = rail.current.getBoundingClientRect(), scale = rect.width / trackWidth;
    const start = event.target === rail.current ? ((event.clientX - rect.left) / scale - thumbWidth / 2) / travel * maxScroll : viewport.scrollLeft;
    const scrollLeft = Math.min(maxScroll, Math.max(0, start));
    scrollTo(scrollLeft);
    drag.current = { pointerId: event.pointerId, x: event.clientX, scrollLeft, scale, maxScroll, travel };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.stopPropagation();
    scrollTo(state.scrollLeft + (event.clientX - state.x) / state.scale / state.travel * state.maxScroll);
  }
  function pointerEnd(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.stopPropagation();
  }
  function keyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    const page = Math.max(40, viewport.viewportWidth - editorTrackHeaderWidth) * 0.9;
    const next = { ArrowLeft: viewport.scrollLeft - 40, ArrowRight: viewport.scrollLeft + 40,
      PageUp: viewport.scrollLeft - page, PageDown: viewport.scrollLeft + page, Home: 0, End: maxScroll }[event.key];
    if (next === undefined) return;
    event.preventDefault(); event.stopPropagation(); scrollTo(next);
  }
  return <div className="editor-scrollbar-row">
    <div ref={rail} className="editor-scrollbar" role="scrollbar" tabIndex={0} aria-label="Scroll timeline horizontally"
      aria-controls={controls} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={Math.round(maxScroll)}
      aria-valuenow={Math.round(viewport.scrollLeft)} aria-disabled={!maxScroll} title="Scroll timeline horizontally"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={keyDown}>
      <span className="editor-scrollbar-thumb" aria-hidden="true" style={{ width: thumbWidth, left }} />
    </div>
  </div>;
}

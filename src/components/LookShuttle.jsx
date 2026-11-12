import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Adapted from kungfukoi/Newt_Node's LookbookShuttle: velocity, not a finite page position.
export default function LookShuttle({ viewport, count, resetKey, active }) {
  const handle = React.useRef(null), gesture = React.useRef(null);
  const [offset, setOffset] = React.useState(0), [bounds, setBounds] = React.useState({ left: false, right: false });
  const stop = React.useCallback(() => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null; cancelAnimationFrame(current.animation);
    if (current.pointerId != null && handle.current?.hasPointerCapture(current.pointerId)) handle.current.releasePointerCapture(current.pointerId);
    setOffset(0);
  }, []);
  React.useLayoutEffect(() => {
    const element = viewport.current;
    const measure = () => setBounds({ left: element.scrollLeft > 1, right: element.scrollLeft < element.scrollWidth - element.clientWidth - 1 });
    const observer = new ResizeObserver(measure); observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", measure, { passive: true }); measure();
    return () => { observer.disconnect(); element.removeEventListener("scroll", measure); };
  }, [viewport, count]);
  React.useEffect(() => { stop(); }, [resetKey, active, stop]);
  React.useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", hide); stop(); };
  }, [stop]);
  function tick(time) {
    const current = gesture.current;
    if (!current) return;
    const distance = current.remainder + current.speed * Math.max(0, Math.min(time - current.lastTime, 34)) / 1000;
    current.lastTime = time; current.remainder = distance - Math.trunc(distance);
    if (Math.trunc(distance)) viewport.current.scrollBy({ left: Math.trunc(distance), behavior: "instant" });
    current.animation = requestAnimationFrame(tick);
  }
  function start(input) {
    const maxOffset = Math.max(1, (handle.current.parentElement.clientWidth - handle.current.offsetWidth) / 2 - 4);
    gesture.current = { ...input, maxOffset, speed: 0, remainder: 0, lastTime: performance.now(), animation: requestAnimationFrame(tick) };
  }
  function deflect(travel) {
    const current = gesture.current, amount = Math.max(-1, Math.min(1, travel));
    const speed = Math.sign(amount) * 4200 * (Math.max(0, (Math.abs(amount) - .04) / .96) ** 1.6);
    if (Math.sign(speed) !== Math.sign(current.speed)) current.remainder = 0;
    current.speed = speed; setOffset(amount * current.maxOffset);
  }
  const end = event => { if (gesture.current?.pointerId === event.pointerId) stop(); };
  const move = direction => viewport.current.scrollBy({ left: direction * Math.max(240, viewport.current.clientWidth * .7), behavior: "smooth" });
  return <div className="looks-scrollbar">
    <button className="look-icon" title="Scroll looks left" disabled={!bounds.left} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
    <div className="looks-shuttle-track"><button ref={handle} className="looks-shuttle-handle" aria-label="Scroll looks shuttle" aria-keyshortcuts="ArrowLeft ArrowRight Escape" title="Drag left or right to scroll. Pull farther to go faster. Release to stop, or hold an arrow key."
      disabled={!bounds.left && !bounds.right} data-dragging={offset !== 0} style={{ transform: `translateX(${offset}px)` }}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || gesture.current) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
        start({ pointerId: event.pointerId, startX: event.clientX });
      }} onPointerMove={event => {
        const current = gesture.current;
        if (current?.pointerId !== event.pointerId) return;
        if (event.pointerType === "mouse" && !event.buttons) { stop(); return; }
        deflect((event.clientX - current.startX) / current.maxOffset);
      }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onBlur={stop}
      onKeyDown={event => {
        if (event.key === "Escape") { stop(); return; }
        const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (!direction) return;
        event.preventDefault();
        if (event.repeat || gesture.current?.pointerId != null) return;
        if (!gesture.current) start({});
        gesture.current.key = event.key; viewport.current.scrollBy({ left: direction * 36, behavior: "instant" }); deflect(direction * .5);
      }} onKeyUp={event => { if (gesture.current?.key === event.key) stop(); }}><ChevronLeft size={15} /><ChevronRight size={15} /></button></div>
    <button className="look-icon" title="Scroll looks right" disabled={!bounds.right} onClick={() => move(1)}><ChevronRight size={18} /></button>
  </div>;
}

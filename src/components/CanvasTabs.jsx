import React from "react";
import { Plus, List, Copy, Pencil, Trash2, ArrowRightToLine, CopyPlus, LoaderCircle, CircleAlert, PanelRightOpen } from "lucide-react";
import { canvasTabDropTarget } from "../projectCanvases.js";
import "../projectCanvases.css";

export function CanvasTabs({ canvases, activeId, activity, selectedCount, outputsCollapsed, onShowOutputs, onSelect, onAdd, onRename, onReorder, onDuplicate, onDelete, onTransfer }) {
  const [renameId, setRenameId] = React.useState(null), [name, setName] = React.useState("");
  const [menu, setMenu] = React.useState(null), [listOpen, setListOpen] = React.useState(false), [search, setSearch] = React.useState("");
  const [dragging, setDragging] = React.useState(null), [drop, setDrop] = React.useState(null);
  const root = React.useRef(null), dragId = React.useRef(null), menuRef = React.useRef(null), focusMenu = React.useRef(false);
  const dragPointer = React.useRef(null), scrollFrame = React.useRef(null), ignoreDragClick = React.useRef(false);
  function endDrag() {
    dragId.current = null; dragPointer.current = null;
    cancelAnimationFrame(scrollFrame.current); scrollFrame.current = null;
    setDragging(null); setDrop(null);
  }
  function updateDrop(clientX) {
    const strip = root.current?.querySelector('.canvas-tab-strip');
    if (!strip || !dragId.current) return null;
    const rects = [...strip.children].map(element => ({ id: element.dataset.canvasId, ...element.getBoundingClientRect().toJSON() }));
    const target = canvasTabDropTarget(rects, dragId.current, clientX);
    if (!target) return null;
    const bounds = strip.getBoundingClientRect(), toolbar = root.current.getBoundingClientRect();
    const next = { ...target, left: Math.max(bounds.left, Math.min(bounds.right - 2, target.markerX)) - toolbar.left, top: bounds.top - toolbar.top, height: bounds.height };
    setDrop(current => current && current.index === next.index && current.left === next.left && current.top === next.top && current.height === next.height ? current : next);
    return target;
  }
  function autoScroll() {
    const strip = root.current?.querySelector('.canvas-tab-strip'), pointer = dragPointer.current;
    if (!strip || !dragId.current) return;
    if (pointer) {
      const bounds = strip.getBoundingClientRect();
      if (pointer.y >= bounds.top && pointer.y <= bounds.bottom) {
        const edge = Math.min(32, bounds.width / 4);
        const step = pointer.x < bounds.left + edge ? -8 : pointer.x > bounds.right - edge ? 8 : 0;
        const before = strip.scrollLeft;
        strip.scrollLeft += step;
        if (before !== strip.scrollLeft) updateDrop(pointer.x);
      }
    }
    scrollFrame.current = requestAnimationFrame(autoScroll);
  }
  React.useEffect(() => {
    window.addEventListener('blur', endDrag);
    return () => { window.removeEventListener('blur', endDrag); cancelAnimationFrame(scrollFrame.current); };
  }, []);
  const menuAnchor = () => [...(root.current?.querySelectorAll('.canvas-tab-item') || [])].find(element => element.dataset.canvasId === menu);
  React.useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) { setMenu(null); setListOpen(false); } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  React.useEffect(() => {
    const selected = root.current?.querySelector('.canvas-tab-item.active');
    const reveal = () => selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    reveal();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    const strip = root.current?.querySelector('.canvas-tab-strip');
    if (strip) observer.observe(strip);
    if (selected) observer.observe(selected);
    return () => observer.disconnect();
  }, [activeId, canvases.length]);
  React.useLayoutEffect(() => {
    const anchor = menuAnchor(), popover = menuRef.current, toolbar = root.current;
    if (!anchor || !popover || !toolbar) return;
    const strip = toolbar.querySelector('.canvas-tab-strip');
    const position = () => {
      const tabRect = anchor.getBoundingClientRect(), toolbarRect = toolbar.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      if (tabRect.right <= stripRect.left || tabRect.left >= stripRect.right) { setMenu(null); return; }
      popover.style.left = `${Math.max(0, Math.min(tabRect.left - toolbarRect.left, toolbar.clientWidth - popover.offsetWidth))}px`;
      popover.style.top = `${tabRect.bottom - toolbarRect.top + 6}px`;
      popover.style.maxHeight = `${Math.max(80, window.innerHeight - tabRect.bottom - 14)}px`;
    };
    position();
    if (focusMenu.current) { focusMenu.current = false; popover.querySelector('[role="menuitem"]:not(:disabled)')?.focus(); }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(toolbar); observer?.observe(anchor); observer?.observe(popover);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { observer?.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [menu, canvases, outputsCollapsed]);
  const rename = item => { setRenameId(item.id); setName(item.name); setMenu(null); };
  const finishRename = () => { if (renameId && name.trim()) onRename(renameId, name); setRenameId(null); };
  const select = id => { onSelect(id); setListOpen(false); setMenu(null); };
  const item = canvases.find(item => item.id === menu);
  const invoke = action => { setMenu(null); action(); };
  return <div ref={root} className="project-canvas-tabs" onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape") { endDrag(); menuAnchor()?.querySelector('[role="tab"]')?.focus(); setMenu(null); setListOpen(false); setRenameId(null); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setMenu(null); setListOpen(false); } }}>
    <div className="canvas-tab-strip" role="tablist" aria-label="Project canvases"
      onDragOver={event => {
        if (!dragId.current) return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
        dragPointer.current = { x: event.clientX, y: event.clientY }; updateDrop(event.clientX);
      }} onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) { dragPointer.current = null; setDrop(null); }
      }} onDrop={event => {
        if (!dragId.current) return;
        event.preventDefault(); event.stopPropagation();
        const id = dragId.current, target = updateDrop(event.clientX);
        if (target && target.index !== canvases.findIndex(canvas => canvas.id === id)) onReorder(id, target.index);
        endDrag();
      }}>
      {canvases.map((canvas, index) => <div key={canvas.id} data-canvas-id={canvas.id} className={`canvas-tab-item ${canvas.id === activeId ? "active" : ""} ${dragging === canvas.id ? "is-dragging" : ""}`}>
        {renameId === canvas.id ? <input autoFocus aria-label="Canvas name" maxLength={80} value={name} onFocus={event => event.target.select()}
          onChange={event => setName(event.target.value)} onBlur={finishRename} onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); finishRename(); }
            if (event.key === "Escape") { event.stopPropagation(); setRenameId(null); }
          }} /> : <button type="button" role="tab" aria-selected={canvas.id === activeId} tabIndex={canvas.id === activeId ? 0 : -1}
          aria-label={canvas.name} aria-description={activity?.[canvas.id]?.running ? "Generating" : activity?.[canvas.id]?.error ? "Needs attention" : undefined}
          aria-haspopup="menu" aria-expanded={menu === canvas.id}
          aria-controls="project-active-canvas" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" title={canvas.name} draggable={canvases.length > 1}
          onPointerDown={() => { ignoreDragClick.current = false; }}
          onDragStart={event => {
            setMenu(null); setListOpen(false); dragId.current = canvas.id; setDragging(canvas.id); ignoreDragClick.current = true;
            event.dataTransfer.setData("application/x-newtnode-canvas", canvas.id); event.dataTransfer.effectAllowed = "move";
            dragPointer.current = { x: event.clientX, y: event.clientY }; scrollFrame.current = requestAnimationFrame(autoScroll);
          }} onDragEnd={endDrag}
          onClick={event => {
            if (ignoreDragClick.current && event.detail) return;
            if (canvas.id !== activeId) { select(canvas.id); return; }
            setListOpen(false); setMenu(menu === canvas.id ? null : canvas.id);
          }} onDoubleClick={() => rename(canvas)} onContextMenu={event => { event.preventDefault(); setMenu(canvas.id); setListOpen(false); }}
          onKeyDown={event => { if (event.key === "F2") { event.preventDefault(); rename(canvas); }
            if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
              event.preventDefault(); setMenu(null); setListOpen(false);
              onReorder(canvas.id, Math.max(0, Math.min(canvases.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))); return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault(); setListOpen(false);
              if (menu === canvas.id) menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
              else { focusMenu.current = true; setMenu(canvas.id); }
            }
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? canvases.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + canvases.length) % canvases.length;
              select(canvases[next].id); root.current.querySelectorAll('[role="tab"]')[next]?.focus();
            } }}>
          <span>{canvas.name}</span>{activity?.[canvas.id]?.running ? <LoaderCircle size={13} className="canvas-working" aria-label="Generating" /> : activity?.[canvas.id]?.error ? <CircleAlert size={13} aria-label="Needs attention" /> : null}
        </button>}
      </div>)}
    </div>
    {dragging && drop && <div className="canvas-tab-drop-indicator" aria-hidden="true" style={{ left: drop.left, top: drop.top, height: drop.height }} />}
    <button className="canvas-tab-tool" aria-label="Add canvas" title="Add canvas" onClick={() => { setMenu(null); setListOpen(false); onAdd(); }}><Plus size={17} /></button>
    <button className="canvas-tab-tool" aria-label="Find canvas" title="Find canvas" aria-expanded={listOpen} onClick={() => { setListOpen(!listOpen); setMenu(null); setSearch(""); }}><List size={17} /></button>
    {outputsCollapsed && <button type="button" className="canvas-tab-tool" aria-label="Show project outputs" title="Show project outputs" onClick={() => { setListOpen(false); setMenu(null); onShowOutputs(); }}><PanelRightOpen size={17} /></button>}
    {listOpen && <div className="canvas-tab-popover"><input autoFocus aria-label="Search canvases" placeholder="Search canvases" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="canvas-search-results">{canvases.filter(canvas => canvas.name.toLowerCase().includes(search.toLowerCase())).map(canvas => <button key={canvas.id} onClick={() => select(canvas.id)} aria-current={canvas.id === activeId ? "page" : undefined}>{canvas.name}</button>)}</div>
    </div>}
    {item && <div ref={menuRef} className="canvas-tab-popover canvas-tab-context-menu" role="menu" aria-label={`${item.name} options`} onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const choices = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')], index = choices.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
      choices[next]?.focus();
    }}>
      <button role="menuitem" onClick={() => rename(item)}><Pencil size={15} />Rename</button>
      <button role="menuitem" disabled={Boolean(activity?.[item.id]?.running)} onClick={() => invoke(() => onDuplicate(item.id))}><Copy size={15} />Duplicate canvas</button>
      {selectedCount > 0 && item.id !== activeId && <>
        <button role="menuitem" onClick={() => invoke(() => onTransfer(item.id, false))}><ArrowRightToLine size={15} />Move selection here</button>
        <button role="menuitem" onClick={() => invoke(() => onTransfer(item.id, true))}><CopyPlus size={15} />Copy selection here</button>
      </>}
      <button role="menuitem" disabled={canvases.length === 1 || Boolean(activity?.[item.id]?.running)} onClick={() => invoke(() => onDelete(item.id))}><Trash2 size={15} />Delete canvas</button>
    </div>}
  </div>;
}

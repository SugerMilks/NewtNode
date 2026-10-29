import { useEffect, useId, useRef } from "react";

export function SidebarMenu({ label, title = label, icon: Icon, open, onOpenChange, disabled = false, busy = false, error = false, menuClassName = "", children }) {
  const root = useRef(null), trigger = useRef(null), menu = useRef(null), initialFocus = useRef("first");
  const menuId = useId();
  const items = () => [...(menu.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
  useEffect(() => {
    if (!open) return;
    const choices = items();
    (initialFocus.current === "last" ? choices.at(-1) : choices[0])?.focus();
    if (!choices.length) menu.current?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) onOpenChange(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onOpenChange]);
  useEffect(() => {
    // A reload can remove its own focused error action from the menu.
    if (open && document.activeElement === document.body) (items()[0] || menu.current)?.focus();
  }, [open, children]);
  function close() { onOpenChange(false); trigger.current?.focus(); }
  function keyboard(event) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); initialFocus.current = event.key === "ArrowUp" ? "last" : "first"; onOpenChange(true);
      }
      return;
    }
    event.preventDefault(); event.stopPropagation();
    const choices = items(), index = choices.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
    choices[next]?.focus();
  }
  return <div className="sidebar-menu" ref={root} onKeyDown={keyboard}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false); }}>
    <button type="button" className="sidebar-menu-trigger" ref={trigger} aria-label={label} title={title}
      aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-busy={busy} disabled={disabled} data-error={error || undefined}
      onClick={() => { initialFocus.current = "first"; onOpenChange(!open); }}><Icon size={17} aria-hidden="true" /></button>
    <div className={`project-menu sidebar-menu-list ${menuClassName}`} role="menu" aria-label={label} id={menuId} ref={menu} tabIndex={-1} hidden={!open}
      onClickCapture={event => {
        const action = event.target.closest('[role="menuitem"]');
        if (action && !action.disabled && !action.hasAttribute("data-menu-keep-open")) close();
      }}>{children}</div>
  </div>;
}

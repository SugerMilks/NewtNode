import React from "react";
import { Download } from "lucide-react";

const menuWidth = 228;
const menuHeight = 46;
const menuMargin = 10;

export function FullResolutionImageContextMenu() {
  const [menu, setMenu] = React.useState(null);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    function openMenu(event) {
      const image = event.target?.closest?.("img[data-full-resolution-url]");
      if (!image) return;

      const url = String(image.dataset.fullResolutionUrl || "").trim();
      if (!url) return;

      event.preventDefault();
      event.stopPropagation();
      setMenu({
        x: clamp(event.clientX, menuMargin, window.innerWidth - menuWidth - menuMargin),
        y: clamp(event.clientY, menuMargin, window.innerHeight - menuHeight - menuMargin),
        url,
        fileName: String(image.dataset.fullResolutionFileName || "image").trim() || "image"
      });
    }

    function closeMenu(event) {
      if (menuRef.current?.contains(event.target)) return;
      setMenu(null);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setMenu(null);
    }

    window.addEventListener("contextmenu", openMenu, true);
    window.addEventListener("pointerdown", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("contextmenu", openMenu, true);
      window.removeEventListener("pointerdown", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, []);

  function downloadOriginal() {
    if (!menu?.url) return;
    const link = document.createElement("a");
    link.href = menu.url;
    link.download = menu.fileName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setMenu(null);
  }

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="full-resolution-context-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label="Image actions"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={downloadOriginal}>
        <Download size={15} />
        <span>Download full resolution</span>
      </button>
    </div>
  );
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

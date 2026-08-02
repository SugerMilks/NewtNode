import React from "react";
import {
  fullResolutionContextPreparedAttribute,
  prepareFullResolutionImageForNativeSave,
  restoreFullResolutionImagePreview
} from "../mediaAssets.js";

const restoreDelayMs = 60_000;

export function FullResolutionImageContextMenu() {
  React.useEffect(() => {
    let restoreTimer = 0;

    function restorePreparedImages() {
      window.clearTimeout(restoreTimer);
      restoreTimer = 0;
      document.querySelectorAll(`img[${fullResolutionContextPreparedAttribute}="true"]`).forEach(restoreFullResolutionImagePreview);
    }

    function prepareNativeImageMenu(event) {
      restorePreparedImages();

      const image = event.target?.closest?.("img[data-full-resolution-url]");
      if (!image) return;

      if (!prepareFullResolutionImageForNativeSave(image)) return;

      // Native Save Image As reads the image's current src. Keep the original
      // attached while the system menu is open, then restore the lightweight
      // preview on the user's next page interaction.
      restoreTimer = window.setTimeout(restorePreparedImages, restoreDelayMs);
    }

    window.addEventListener("contextmenu", prepareNativeImageMenu, true);
    window.addEventListener("pointerdown", restorePreparedImages, true);
    window.addEventListener("keydown", restorePreparedImages, true);
    window.addEventListener("pagehide", restorePreparedImages);
    return () => {
      window.removeEventListener("contextmenu", prepareNativeImageMenu, true);
      window.removeEventListener("pointerdown", restorePreparedImages, true);
      window.removeEventListener("keydown", restorePreparedImages, true);
      window.removeEventListener("pagehide", restorePreparedImages);
      restorePreparedImages();
    };
  }, []);

  return null;
}

import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { scriptDocumentPageLimit } from "../src/storyboardScriptImport.js";

const root = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const task = getDocument({ data: new Uint8Array(workerData.buffer), isEvalSupported: false, disableFontFace: true,
  useSystemFonts: false, cMapUrl: `${root}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}/standard_fonts/`, wasmUrl: `${root}/wasm/`,
  stopAtErrors: true, maxImageSize: 16_000_000, verbosity: 0 });
try {
  const pdf = await task.promise;
  if (pdf.numPages > scriptDocumentPageLimit) throw new Error(`PDFs can contain up to ${scriptDocumentPageLimit} pages. Export a smaller document first.`);
  if (workerData.page) {
    const page = await pdf.getPage(workerData.page);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1400 / Math.max(base.width, base.height) });
    const canvas = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.context, viewport }).promise;
    parentPort.postMessage({ image: canvas.canvas.toBuffer("image/png") });
    pdf.canvasFactory.destroy(canvas);
  } else {
    const pages = [];
    let length = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Preserve PDF geometry: AV columns and screenplay indentation carry meaning.
      const items = content.items.filter(item => item.str?.trim()).map(item => ({ text: item.str,
        x: Math.round(item.transform[4]), y: Math.round(viewport.height - item.transform[5]) }));
      items.sort((a, b) => a.y - b.y || a.x - b.x);
      const text = items.map(item => `[${item.x},${item.y}] ${item.text}`).join("\n");
      length += text.length;
      if (text.length > 45000 || length > 900000) throw new Error("This PDF has too much text. Export a smaller script or deck first.");
      const characters = items.reduce((sum, item) => sum + item.text.length, 0);
      const operators = characters < 600 ? await page.getOperatorList() : null;
      const hasImage = operators?.fnArray.some(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op));
      pages.push({ number, text, needsOcr: characters < 80 || (characters < 600 && hasImage === true) });
      page.cleanup();
    }
    parentPort.postMessage({ pageCount: pdf.numPages, pages });
  }
} catch (error) {
  parentPort.postMessage({ error: error.name === "PasswordException" ? "This PDF is password protected. Export an unlocked copy first." : error.message || "Could not read this PDF." });
} finally {
  await task.destroy();
}

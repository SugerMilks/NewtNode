import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { createServer } from "vite";
import { registerLooksRoutes } from "../server/routes/looks.js";
import { createLookAnalyzer } from "../server/looks-analysis.js";
import { nodeDraftStorageKey } from "../src/useNodeEditorDraft.js";

const catalog = process.env.LOOKS_QA_CATALOG;
assert.ok(catalog, "Set LOOKS_QA_CATALOG to a read-only compact catalog for this browser check.");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-looks-qa-"));
const app = express(); app.use(express.json());
const options = { directory: path.join(directory, "data"), assetDirectory: path.join(directory, "uploads"), thumbnailDirectory: path.join(directory, "thumbnails") };
const analyses = [], history = [];
options.analyzeLook = createLookAnalyzer({ directory: path.join(directory, "analyses"), analyze: async body => {
  analyses.push(body);
  return { text: JSON.stringify({ stylePrompt: "QA visual treatment: painted texture and sculpted soft light. Dimensional soft shadows and tactile brush strokes support the chosen blocking without borrowing reference subjects or assigning colors.", referenceCount: body.inputs.length, anchorReference: 2, signatureFeature: "Use a compact subject silhouette low in the frame with generous uninterrupted negative space above, keeping foreground and distant planes clearly separated." }), provider: "mock", model: "test-vision", usages: [] };
}, recordHistory: async entry => history.push(entry), estimateCost: () => ({ amountUsd: null }) });
const library = registerLooksRoutes(app, options);
await library.configure(catalog);
app.use("/uploads/looks", express.static(options.assetDirectory));
const api = app.listen(0, "127.0.0.1"); await new Promise(resolve => api.once("listening", resolve));
const vite = await createServer({ server: { host: "127.0.0.1", port: 0, open: false } }); await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}`, apiUrl = `http://127.0.0.1:${api.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [], unexpected = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/(api|uploads|outputs|workflow-assets)\//, async route => {
    const request = route.request(), parsed = new URL(request.url()), pathname = parsed.pathname;
    if (pathname === "/api/media-thumbnail" && parsed.searchParams.get("url")?.startsWith("/uploads/looks/")) {
      const response = await fetch(apiUrl + parsed.searchParams.get("url"));
      return route.fulfill({ status: response.status, contentType: response.headers.get("content-type"), body: Buffer.from(await response.arrayBuffer()) });
    }
    if (pathname.startsWith("/api/looks") || pathname === "/api/style-library/stylefinder-image" || pathname.startsWith("/uploads/looks/")) {
      const response = await fetch(apiUrl + pathname + parsed.search, { method: request.method(), headers: { "Content-Type": "application/json" }, body: request.method() === "GET" ? undefined : request.postData() });
      return route.fulfill({ status: response.status, contentType: response.headers.get("content-type") || "application/json", body: Buffer.from(await response.arrayBuffer()) });
    }
    const data = {
      "/api/health": { ok: true, routes: { looksLibrary: true, looksStyleAnalysis: true, systemNewtPresets: true, newtPresets: true } },
      "/api/settings": { apiKeysFound: false, modelPreferences: {}, nodePreferences: {} },
      "/api/pricing": { enabled: false, sources: {}, catalog: null },
      "/api/saved-workflows": [], "/api/newt-presets": [], "/api/history": []
    };
    if (pathname in data && request.method() === "GET") return route.fulfill({ json: data[pathname] });
    unexpected.push(`${request.method()} ${pathname}`);
    return route.fulfill({ status: 403, json: { error: "Outside isolated Looks QA" } });
  });
  const draft = { nodes: [{ id: "sentinel", type: "plainText", canvasId: "canvas-a", x: 40, y: 40, data: { title: "Preserved brief", text: "Do not change" } }], edges: [], groups: [],
    canvases: [{ id: "canvas-a", name: "Existing", viewport: { x: 0, y: 0, scale: 1 } }, { id: "canvas-b", name: "Look test", viewport: { x: 0, y: 0, scale: 1 } }],
    activeCanvasId: "canvas-b", viewport: { x: 0, y: 0, scale: 1 }, projectName: "Isolated Looks QA", projectId: "looks-qa" };
  await page.addInitScript(({ key, draft }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft)); }, { key: nodeDraftStorageKey, draft });
  await page.goto(url);
  await page.locator(".node-canvas").waitFor();
  const nav = page.getByRole("navigation", { name: "Workspace", exact: true });
  await nav.getByRole("button", { name: "Looks", exact: true }).click();
  const tiles = page.locator(".look-tile-open");
  await tiles.first().waitFor();
  await page.waitForFunction(() => { const images = [...document.querySelectorAll(".look-tile-image img")].filter(image => image.getBoundingClientRect().top < innerHeight); return images.length >= 18 && images.every(image => image.complete && image.naturalWidth > 0); });
  assert.equal(await tiles.count(), 48);
  await page.screenshot({ path: path.join(directory, "looks-desktop.png") });
  const firstName = await tiles.first().locator("strong").innerText();
  await page.locator(".look-star").first().click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".look-tile").length === 1);
  assert.equal(await tiles.first().locator("strong").innerText(), firstName);
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await page.getByRole("textbox", { name: "Search looks", exact: true }).fill(firstName);
  await page.waitForFunction(() => document.querySelector(".looks-grid")?.getAttribute("aria-busy") === "false");
  await page.getByTitle(`View ${firstName}`, { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelector(".look-detail-main img")?.naturalWidth > 0);
  assert.ok(await dialog.evaluate(element => { const image = element.querySelector(".look-detail-main img").getBoundingClientRect(), strip = element.querySelector(".look-detail-thumbs").getBoundingClientRect(); return image.bottom <= strip.top; }), "Preview must not overlap thumbnails");
  await dialog.screenshot({ path: path.join(directory, "look-detail-desktop.png") });
  const prompt = dialog.getByRole("textbox", { name: "Style description", exact: true });
  await prompt.fill("QA visual treatment: painted texture and sculpted soft light.");
  await dialog.getByRole("button", { name: "Add Style", exact: true }).click();
  await page.locator(".library-look-preview").waitFor();
  assert.equal(analyses.length, 1); assert.equal(analyses[0].inputs.length, 4); assert.equal(history.length, 1);
  const style = page.locator(".node-type-style"), stylePreset = style.getByRole("combobox", { name: "Style preset", exact: true });
  assert.equal(await stylePreset.inputValue(), "None");
  assert.equal(await style.getByRole("combobox", { name: "Grade preset", exact: true }).inputValue(), "Custom");
  assert.equal(await stylePreset.locator('option[value="Catalog Look"]').count(), 0);
  assert.ok(await style.evaluate(element => element.querySelector(".library-look-preview").getBoundingClientRect().top >= element.querySelector(".custom-palette-panel").getBoundingClientRect().bottom), "Look prompt and thumbnails stay below grade controls");
  await stylePreset.selectOption("Painterly 3D");
  assert.match(await page.getByRole("textbox", { name: "Look style description" }).inputValue(), /QA visual treatment/);
  assert.match(await page.getByRole("textbox", { name: "Look style description" }).inputValue(), /^Defining visual feature: Use a compact subject silhouette/);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), nodeDraftStorageKey);
  assert.equal(saved.nodes.length, 2); assert.equal(saved.nodes.find(node => node.type === "style").canvasId, "canvas-b");
  assert.equal(saved.nodes.find(node => node.id === "sentinel").data.text, "Do not change");
  const initialStyle = saved.nodes.find(node => node.type === "style").data;
  assert.equal(initialStyle.customPalettePreviewUrl, initialStyle.libraryStyle.examples[0].localUrl);
  assert.ok(initialStyle.customPaletteColors.length > 0);
  await style.screenshot({ path: path.join(directory, "look-style-before-drag.png") });
  await style.locator(".library-look-images img").nth(1).dragTo(style.locator(".custom-palette-image-drop"));
  await page.waitForFunction(() => document.querySelector(".custom-palette-preview")?.getAttribute("data-full-resolution-url")?.startsWith("data:image/jpeg"));
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const afterDrag = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), nodeDraftStorageKey);
  const draggedStyle = afterDrag.nodes.find(node => node.type === "style").data;
  assert.equal(afterDrag.nodes.length, 2, "Dragging to grade must not add a canvas image");
  assert.equal(draggedStyle.customPaletteSourceName, initialStyle.libraryStyle.examples[1].fileName);
  assert.equal(draggedStyle.libraryStyle.prompt, initialStyle.libraryStyle.prompt);
  assert.equal(draggedStyle.stylePreset, "Painterly 3D");
  assert.notDeepEqual(draggedStyle.customPaletteColors, initialStyle.customPaletteColors);
  assert.equal(analyses.length, 1, "Changing grade needs no AI call");
  await style.screenshot({ path: path.join(directory, "look-style-after-drag.png") });
  const gradePreset = style.getByRole("combobox", { name: "Grade preset", exact: true });
  assert.deepEqual(await gradePreset.locator("option").allTextContents(), ["None", "Warm Grade", "Cool Grade", "Bright Fashion", "Modern Vintage", "Precise Color", "Custom"]);
  const readStyle = async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    return page.evaluate(key => JSON.parse(localStorage.getItem(key)).nodes.find(node => node.type === "style").data, nodeDraftStorageKey);
  };
  for (const name of ["Warm Grade", "Cool Grade", "Bright Fashion", "Modern Vintage"]) {
    await gradePreset.selectOption(name);
    assert.equal((await readStyle()).gradePreset, name);
    assert.equal(await style.locator(".custom-palette-panel").count(), 0);
  }
  await gradePreset.selectOption("Precise Color");
  assert.equal(await style.locator(".custom-palette-image-wrap").count(), 0, "Manual picker has no thumbnail or upload");
  assert.equal(await style.locator(".custom-palette-swatches span").count(), 0, "Manual palette starts independently of image colors");
  await style.getByTitle("Add selected color", { exact: true }).click();
  assert.equal(await style.locator(".custom-palette-swatches span").count(), 1);
  await style.getByTitle("Choose hue", { exact: true }).click({ position: { x: 5, y: 40 } });
  await style.getByTitle("Pick a palette color", { exact: true }).click({ position: { x: 55, y: 65 } });
  await style.getByTitle("Add selected color", { exact: true }).click();
  assert.equal(await style.locator(".custom-palette-swatches span").count(), 2);
  await page.evaluate(() => { window.EyeDropper = class { async open() { return { sRGBHex: "#1a65cf" }; } }; });
  await style.getByTitle("Use eye dropper", { exact: true }).click();
  await style.getByTitle("Add selected color", { exact: true }).click();
  assert.ok((await readStyle()).precisePalette.colors.some(color => color.hex.toLowerCase() === "#1a65cf"));
  await style.getByTitle("Clear palette colors", { exact: true }).click();
  assert.equal((await readStyle()).precisePalette.colors.length, 0);
  assert.deepEqual((await readStyle()).customPaletteColors, draggedStyle.customPaletteColors);
  await style.getByTitle("Add selected color", { exact: true }).click();
  await style.screenshot({ path: path.join(directory, "style-precise-picker.png") });
  assert.ok(await style.evaluate(element => {
    const panel = element.querySelector(".custom-palette-panel"), select = element.querySelector('[aria-label="Grade preset"]');
    return panel.scrollWidth <= panel.clientWidth + 1 && select.scrollWidth <= select.clientWidth + 1;
  }), "Grade controls fit the node");
  await gradePreset.selectOption("Custom");
  assert.equal(await style.locator(".custom-palette-inline-picker").count(), 0, "Image grade has no manual picker");
  assert.equal((await readStyle()).customPalettePreviewUrl, draggedStyle.customPalettePreviewUrl);
  await style.getByTitle("Clear extracted palette", { exact: true }).click();
  assert.equal(await style.locator(".custom-palette-inline-picker").count(), 0, "Clearing the image does not reveal manual controls");
  assert.equal(await style.locator(".custom-palette-image-drop input[type=file]").count(), 1);
  assert.equal((await readStyle()).precisePalette.colors.length, 1, "Clearing Custom keeps picked colors");
  await gradePreset.selectOption("Precise Color");
  await readStyle();
  await page.reload(); await page.locator(".library-look-preview").waitFor();
  assert.match(await page.getByRole("textbox", { name: "Look style description" }).inputValue(), /QA visual treatment/);
  assert.equal(await stylePreset.inputValue(), "Painterly 3D");
  assert.equal(await gradePreset.inputValue(), "Precise Color");
  assert.equal(await style.locator(".custom-palette-swatches span").count(), 1);
  assert.equal(await style.locator(".custom-palette-image-wrap").count(), 0);
  assert.equal(analyses.length, 1, "Manual grade controls need no AI calls");
  await nav.getByRole("button", { name: "Looks", exact: true }).click();
  await tiles.first().waitFor();
  await page.getByTitle(`View ${firstName}`, { exact: true }).click();
  await dialog.getByRole("button", { name: "Add Mood Board", exact: true }).click();
  await page.locator(".node-type-transfer").waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), nodeDraftStorageKey);
  const mood = saved.nodes.find(node => node.type === "transfer");
  assert.equal(mood.canvasId, "canvas-b"); assert.ok(mood.data.transferImages.length > 0);
  assert.ok(mood.data.transferImages.every(image => image.localUrl.startsWith("/uploads/looks/")));
  assert.equal(analyses.length, 1, "Mood Board must not trigger analysis");
  await nav.getByRole("button", { name: "Looks", exact: true }).click();
  await page.getByRole("textbox", { name: "Search looks", exact: true }).fill("");
  await page.waitForFunction(() => document.querySelector(".looks-grid")?.getAttribute("aria-busy") === "false");
  await page.getByTitle("Next page", { exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".looks-pagination")?.textContent.includes("49-96"));
  await page.getByTitle("Previous page", { exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".looks-pagination")?.textContent.includes("1-48"));
  await page.getByRole("combobox", { name: "Look category" }).selectOption("Photographers");
  await page.waitForFunction(() => [...document.querySelectorAll(".look-tile-open small")].every(element => element.textContent === "Photographers"));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.waitForFunction(() => { const images = [...document.querySelectorAll(".look-tile-image img")].filter(image => image.getBoundingClientRect().top < innerHeight); return images.length >= 4 && images.every(image => image.complete && image.naturalWidth > 0); });
    await page.screenshot({ path: path.join(directory, `looks-${width}.png`) });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal overflow");
    await tiles.first().click(); await dialog.waitFor();
    await dialog.screenshot({ path: path.join(directory, `look-detail-${width}.png`) });
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "Detail fits viewport");
    await dialog.getByTitle("Close look", { exact: true }).click();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ ok: true, directory, paidCalls: 0, checks: ["real local catalog", "search/category/favorites/paging", "desktop/mobile gallery and modal", "four-image analysis", "first-image Custom Grade", "independent Style preset", "native thumbnail drag replaces only grade", "renamed and reordered Grade choices", "Precise Color without thumbnail", "spectrum/hue/eyedropper/add/clear", "independent image and manual palettes", "managed copies", "current canvas insertion", "save/load", "unchanged Mood Board", "existing project untouched"] }, null, 2));
} catch (error) { console.error({ directory, errors, unexpected }); throw error; }
finally { await browser.close(); await vite.close(); await new Promise(resolve => api.close(resolve)); }

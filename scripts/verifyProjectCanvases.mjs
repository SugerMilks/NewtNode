import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { nodeDraftStorageKey } from "../src/useNodeEditorDraft.js";
import { projectGraphForStorage } from "../src/projectCanvases.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-canvases-qa-"));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [], unexpected = [], saves = [];
let generation, submitted = 0, page;
const legacy = { nodes: [
  { id: "brief", type: "plainText", x: 40, y: 70, data: { title: "Creative Brief", text: "A cinematic forest" } },
  { id: "model", type: "imageModel", x: 500, y: 70, data: { title: "Image Model", model: "Nano Banana Pro", prompt: "A cinematic forest", aspectRatio: "16:9", resolution: "1K", quality: "medium", status: "ready", batchCount: "1", settingsOpen: false } }
], edges: [{ id: "wire", from: { nodeId: "brief", port: "textOut" }, to: { nodeId: "model", port: "promptIn" }, color: "#ddc128" }], groups: [], viewport: { x: 0, y: 0, scale: 0.65 }, projectId: "qa", projectName: "Canvases QA", savedProjectName: "Canvases QA" };
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ key, legacy }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(legacy)); }, { key: nodeDraftStorageKey, legacy });
  // Never allow an API request through to the running app or any provider.
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname === "/api/media-thumbnail") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#397557"/></svg>' });
    if (pathname === "/api/node/generate-image" && request.method() === "POST") { submitted++; generation = route; return; }
    if (pathname === "/api/saved-workflows" && request.method() === "POST") {
      const body = request.postDataJSON();
      const saved = { id: body.id || "qa", name: body.name, fileName: "qa.json", version: 2, graph: projectGraphForStorage(body) };
      saves.push(saved); return route.fulfill({ json: saved });
    }
    if (pathname === "/api/system/open-workflow-file" && request.method() === "POST") return route.fulfill({ json: { id: "import", name: "Existing task", graph: { nodes: [{ ...legacy.nodes[0], id: "imported-brief" }], edges: [], groups: [], viewport: { x: 0, y: 0, scale: 0.8 } } } });
    const responses = {
      "/api/health": { ok: true, routes: { systemNewtPresets: true, newtPresets: true, projectCanvases: true, nanoBanana21: true } },
      "/api/settings": { apiKeysFound: false, modelPreferences: {}, nodePreferences: {}, generationProvider: "fal" },
      "/api/pricing": { enabled: false, sources: {}, catalog: null }, "/api/pricing/quote": { amountUsd: null },
      "/api/saved-workflows": saves.at(-1) ? [saves.at(-1)] : [], "/api/newt-presets": [], "/api/history": [],
      "/api/saved-workflows/qa.json": saves.at(-1)
    };
    if (!(pathname in responses)) unexpected.push(`${request.method()} ${pathname}`);
    await route.fulfill({ json: responses[pathname] ?? {} });
  });
  await page.route(/\/(?:outputs|uploads)\//, route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#255a41"/><path d="M0 360L200 60L420 360Z" fill="#81a77f"/></svg>' }));
  await page.goto(process.env.CANVAS_QA_URL || "http://127.0.0.1:5185/");
  const tabs = page.getByRole("tablist", { name: "Project canvases" });
  const tab = name => tabs.getByRole("tab", { name, exact: true });
  const visible = page.locator("[data-node-card-id]:visible");
  const card = id => page.locator(`[data-node-card-id="${id}"]`);
  const button = name => page.getByRole("button", { name, exact: true });
  const draft = async () => { await page.evaluate(() => window.dispatchEvent(new Event("pagehide"))); return page.evaluate(key => JSON.parse(localStorage.getItem(key)), nodeDraftStorageKey); };
  const rename = async (old, next) => { await tab(old).dblclick(); await page.getByLabel("Canvas name", { exact: true }).fill(next); await page.getByLabel("Canvas name", { exact: true }).press("Enter"); };
  const menu = async name => { await tab(name).click({ button: "right" }); await page.getByRole("menu", { name: `${name} options` }).waitFor(); };
  const action = name => page.getByRole("menuitem", { name, exact: true });
  const dragTab = async (source, target, side = 'before') => {
    const from = await tab(source).boundingBox(), to = await tab(target).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 3 });
    await page.mouse.move(to.x + (side === 'before' ? 2 : to.width - 2), to.y + to.height / 2, { steps: 12 });
    await page.locator('.canvas-tab-drop-indicator').waitFor();
  };
  const switchTo = async name => {
    const wasActive = await tab(name).getAttribute('aria-selected') === 'true';
    await tab(name).click();
    assert.equal(await tab(name).getAttribute('aria-selected'), 'true');
    if (wasActive) {
      await page.getByRole('menu', { name: `${name} options` }).waitFor();
      await page.keyboard.press('Escape');
    } else {
      assert.equal(await page.locator('.canvas-tab-context-menu').count(), 0);
      assert.equal(await tab(name).getAttribute('aria-expanded'), 'false');
    }
  };
  const checkMenuPosition = async name => {
    await page.waitForFunction(name => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find(el => el.getAttribute('aria-label') === name);
      const menu = document.querySelector('.canvas-tab-context-menu');
      if (!tab || !menu) return false;
      const anchor = tab.closest('.canvas-tab-item').getBoundingClientRect(), bounds = menu.getBoundingClientRect();
      const toolbar = document.querySelector('.project-canvas-tabs').getBoundingClientRect();
      const expectedLeft = Math.max(toolbar.left, Math.min(anchor.left, toolbar.right - bounds.width));
      return Math.abs(bounds.top - anchor.bottom - 6) < 1 && Math.abs(bounds.left - expectedLeft) < 1 && bounds.right <= window.innerWidth && bounds.left >= 0;
    }, name);
  };
  const checkSidebar = async () => {
    const header = page.locator('.toolbar-header');
    const items = await header.locator('.sidebar-menu-trigger, .canvas-snap-toggle, .sidebar-hide').evaluateAll(elements => elements.map(el => ({ name: el.getAttribute('aria-label'), rect: el.getBoundingClientRect().toJSON() })));
    assert.deepEqual(items.map(item => item.name), ['File', 'Recent Projects', 'Preset Workflows', 'Snap nodes to grid', 'Hide node palette']);
    const bounds = await header.boundingBox();
    items.forEach(({ rect }, index) => {
      assert.equal(rect.width, 30); assert.equal(rect.height, 30);
      assert.ok(rect.x >= bounds.x && rect.right <= bounds.x + bounds.width + 1);
      if (index) assert.ok(rect.x >= items[index - 1].rect.right && rect.y === items[index - 1].rect.y);
    });
    assert.equal(await page.locator('.node-canvas .canvas-snap-toggle').count(), 0);
  };
  await tab("Canvas 1").waitFor(); assert.equal(await visible.count(), 2);
  assert.equal(await page.locator('.canvas-tab-menu-button').count(), 0);
  await tab('Canvas 1').click(); await action('Rename').waitFor(); await checkMenuPosition('Canvas 1');
  assert.equal(await action('Move left').count(), 0); assert.equal(await action('Move right').count(), 0);
  assert.equal(await tab('Canvas 1').getAttribute('aria-expanded'), 'true');
  await tab('Canvas 1').click(); assert.equal(await page.locator('.canvas-tab-context-menu').count(), 0);
  await tab('Canvas 1').press('ArrowDown'); await action('Rename').waitFor();
  assert.equal(await action('Rename').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('End'); assert.equal(await action('Duplicate canvas').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape'); assert.equal(await tab('Canvas 1').evaluate(el => el === document.activeElement), true);
  const tabStyle = await tab("Canvas 1").evaluate(el => {
    const pill = getComputedStyle(el.closest('.canvas-tab-item'));
    const main = getComputedStyle(document.querySelector('.mode-switch button.active'));
    return { size: getComputedStyle(el).fontSize, padding: getComputedStyle(el).paddingLeft, radius: parseFloat(pill.borderRadius), height: el.parentElement.getBoundingClientRect().height, background: pill.backgroundColor, color: getComputedStyle(el).color, mainBackground: main.backgroundColor, mainColor: main.color };
  });
  assert.equal(tabStyle.size, "12px");
  assert.equal(tabStyle.height, 26);
  assert.equal(tabStyle.padding, "8px");
  assert.ok(tabStyle.radius >= tabStyle.height / 2);
  assert.equal(tabStyle.background, tabStyle.mainBackground);
  assert.equal(tabStyle.color, tabStyle.mainColor);
  const mounted = await card("brief").elementHandle();
  assert.equal((await draft()).nodes[0].canvasId, "canvas-1");
  await rename("Canvas 1", "Look Development");
  await button("Add canvas").click(); await tab("Canvas 2").waitFor();
  assert.equal(await visible.count(), 0); assert.equal(await mounted.evaluate(el => el.isConnected), true);
  await rename("Canvas 2", "Animation");
  const shortWidth = (await tab("Animation").boundingBox()).width;
  await tab('Animation').click(); await action('Rename').waitFor();
  await switchTo("Look Development");
  assert.ok((await tab("Look Development").boundingBox()).width > shortWidth);
  await tab('Look Development').click(); await action('Rename').waitFor();
  await checkMenuPosition('Look Development');
  await menu('Animation');
  assert.equal(await tab('Look Development').getAttribute('aria-selected'), 'true');
  assert.equal(await tab('Animation').getAttribute('aria-selected'), 'false');
  await switchTo("Animation");
  await page.getByTitle("Show node palette", { exact: true }).click();
  await checkSidebar();
  assert.equal(await button('Snap nodes to grid').getAttribute('aria-pressed'), 'false');
  const graphBeforeSnap = await draft();
  await button('Snap nodes to grid').click();
  assert.equal(await button('Snap nodes to grid').getAttribute('aria-pressed'), 'true');
  assert.deepEqual((await draft()).nodes, graphBeforeSnap.nodes);
  assert.equal(await button('Snap nodes to grid').evaluate(el => getComputedStyle(el).color), 'rgb(221, 198, 49)');
  await page.locator(".node-toolbar").getByRole("button", { name: "Text", exact: true }).click();
  assert.equal(await visible.count(), 1);
  await page.getByRole("textbox", { name: "Text prompt", exact: true }).fill("Animation notes");
  await switchTo("Look Development"); assert.equal(await visible.count(), 2);
  assert.equal(await page.getByRole("textbox", { name: "Text prompt", exact: true }).inputValue(), "A cinematic forest");
  const originalView = (await draft()).viewport;
  // A background request must retain its mounted node and finish into its own canvas.
  await card("model").getByRole("button", { name: /Run Image|Run Generation/ }).click();
  await page.waitForFunction(() => document.querySelector('[role="tab"][title="Look Development"] [aria-label="Generating"]'));
  for (let i = 0; i < 100 && !generation; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(submitted, 1);
  await menu("Look Development"); assert.equal(await action("Delete canvas").isDisabled(), true); await page.keyboard.press("Escape");
  await switchTo("Animation");
  await page.getByRole("textbox", { name: "Text prompt", exact: true }).fill("Still editable while another canvas generates");
  await generation.fulfill({ json: { image: { localUrl: "/outputs/qa-finished.png" } } });
  await page.waitForFunction(() => !document.querySelector('[role="tab"][title="Look Development"] [aria-label="Generating"]'));
  assert.equal((await draft()).nodes.find(n => n.id === "model").data.resultUrl, "/outputs/qa-finished.png");
  await switchTo("Look Development"); assert.deepEqual((await draft()).viewport, originalView);
  await menu("Look Development"); await action("Duplicate canvas").click();
  await tab("Look Development Copy").waitFor(); assert.equal(await visible.count(), 2);
  const copied = await draft(); assert.equal(new Set(copied.nodes.map(n => n.id)).size, copied.nodes.length);
  await dragTab('Look Development Copy', 'Animation');
  await page.screenshot({ path: path.join(directory, 'canvas-drag-placement.png') });
  await page.mouse.up();
  assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["Look Development", "Look Development Copy", "Animation"]);
  assert.equal(await page.locator('.canvas-tab-context-menu').count(), 0);
  assert.equal(await page.locator('.canvas-tab-drop-indicator').count(), 0);
  assert.equal((await draft()).activeCanvasId, copied.activeCanvasId);
  assert.deepEqual((await draft()).nodes, copied.nodes);
  await dragTab('Look Development', 'Animation', 'after'); await page.mouse.up();
  assert.deepEqual(await tabs.getByRole('tab').allTextContents(), ['Look Development Copy', 'Animation', 'Look Development']);
  assert.equal((await draft()).activeCanvasId, copied.activeCanvasId);
  await dragTab('Look Development', 'Look Development Copy'); await page.mouse.up();
  const reorderedNames = ['Look Development', 'Look Development Copy', 'Animation'];
  assert.deepEqual(await tabs.getByRole('tab').allTextContents(), reorderedNames);
  await dragTab('Look Development Copy', 'Animation', 'after'); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await tabs.getByRole('tab').allTextContents(), reorderedNames);
  assert.equal(await page.locator('.canvas-tab-drop-indicator').count(), 0);
  await tab('Look Development Copy').focus(); await page.keyboard.press('Alt+ArrowRight');
  assert.deepEqual(await tabs.getByRole('tab').allTextContents(), ['Look Development', 'Animation', 'Look Development Copy']);
  await page.keyboard.press('Alt+ArrowLeft');
  assert.deepEqual(await tabs.getByRole('tab').allTextContents(), reorderedNames);
  // Cross-canvas clipboard carries completed media without rerunning it.
  await card("model").evaluate(() => {}); // Original remains mounted on its own canvas.
  await switchTo("Look Development"); await card("brief").locator(".node-title").click({ position: { x: 150, y: 12 } });
  await menu("Animation"); await action("Copy selection here").click();
  assert.equal(await visible.count(), 2); assert.equal(submitted, 1);
  await menu("Look Development"); await action("Move selection here").click();
  assert.equal(await visible.count(), 3);
  await menu("Animation"); await action("Move selection here").click();
  assert.equal(await visible.count(), 2); assert.equal(submitted, 1);
  await button("Show project outputs").click();
  await page.locator(".project-output-scope").getByRole("button", { name: "Project", exact: true }).click();
  assert.equal(await page.locator(".project-output-list img").count() > 0, true);
  await page.locator(".project-output-scope").getByRole("button", { name: "Canvas", exact: true }).click();
  assert.equal(await page.locator(".project-output-list img").count(), 0);
  await button("Hide project outputs").click();
  await button("File").click(); await action("Save").click();
  await page.locator('.topbar-status.workflow-saved').waitFor();
  assert.equal(saves.length, 1); assert.equal(saves[0].graph.canvases.length, 3); assert.equal(saves[0].graph.nodes.length, 6);
  assert.deepEqual(saves[0].graph.canvases.map(canvas => canvas.name), reorderedNames);
  await draft(); await page.reload(); await tab("Animation").waitFor();
  assert.equal(await tab("Animation").getAttribute("aria-selected"), "true"); assert.equal(await visible.count(), 2);
  assert.deepEqual(await tabs.getByRole('tab').allTextContents(), reorderedNames);
  await page.getByTitle("Show node palette", { exact: true }).click();
  assert.equal(await button('Snap nodes to grid').getAttribute('aria-pressed'), 'true');
  await button("File").click(); await action("Import as Canvases").click(); await tab("Existing task").waitFor(); assert.equal(await visible.count(), 1);
  await button("Find canvas").click(); await page.getByLabel("Search canvases").fill("animation");
  assert.equal(await page.locator(".canvas-search-results button").count(), 1); await page.locator(".canvas-search-results button").click();
  await menu("Look Development Copy"); page.once("dialog", dialog => dialog.accept()); await action("Delete canvas").click();
  assert.equal(await tab("Look Development Copy").count(), 0);
  await page.getByTitle("Hide node palette", { exact: true }).click();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByTitle('Show node palette', { exact: true }).click();
    await checkSidebar();
    await page.locator('.node-toolbar').screenshot({ path: path.join(directory, `sidebar-snap-${viewport.width}.png`) });
    await button('Snap nodes to grid').focus(); await page.keyboard.press('Space');
    assert.equal(await button('Snap nodes to grid').getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Space');
    await page.getByTitle('Hide node palette', { exact: true }).click();
    const bounds = await page.locator(".project-canvas-tabs").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
    const canvas = await page.locator(".node-canvas").boundingBox(); assert.ok(canvas.height > 400);
    const restore = button('Show project outputs');
    assert.equal(await page.locator('.project-canvas-tabs').getByRole('button', { name: 'Show project outputs', exact: true }).count(), 1);
    assert.equal(await page.locator('.node-canvas .outputs-restore').count(), 0);
    const restoreBounds = await restore.boundingBox();
    const addBounds = await button('Add canvas').boundingBox(), findBounds = await button('Find canvas').boundingBox();
    for (const rect of [addBounds, findBounds, restoreBounds]) {
      assert.equal(rect.width, 32); assert.equal(rect.height, 32);
      assert.ok(Math.abs(rect.y - restoreBounds.y) < 1);
      assert.ok(rect.y + rect.height < canvas.y);
    }
    assert.ok(Math.abs(findBounds.x - addBounds.x - addBounds.width - 4) < 1);
    assert.ok(Math.abs(restoreBounds.x - findBounds.x - findBounds.width - 4) < 1);
    await page.waitForFunction(() => {
      const strip = document.querySelector('.canvas-tab-strip').getBoundingClientRect();
      const selected = document.querySelector('[role="tab"][aria-selected="true"]').closest('.canvas-tab-item').getBoundingClientRect();
      return selected.x >= strip.x - 1 && selected.right <= strip.right + 1;
    });
    const paletteButton = await page.getByTitle('Show node palette', { exact: true }).boundingBox();
    const selectedTab = await page.locator('.canvas-tab-item.active').boundingBox();
    assert.ok(Math.abs(paletteButton.y + paletteButton.height / 2 - selectedTab.y - selectedTab.height / 2) < 1, 'Collapsed palette button aligns with canvas tabs');
    await page.screenshot({ path: path.join(directory, `canvases-${viewport.width}.png`) });
    await tab('Animation').click(); await action('Rename').waitFor(); await checkMenuPosition('Animation');
    await page.screenshot({ path: path.join(directory, `canvas-menu-${viewport.width}.png`) });
    if (viewport.width < 700) {
      await tabs.evaluate(el => { el.scrollLeft -= 10; });
      await checkMenuPosition('Animation');
    }
    await button('Find canvas').click(); await page.getByLabel('Search canvases').waitFor();
    assert.equal(await page.locator('.canvas-tab-context-menu').count(), 0);
    await page.keyboard.press('Escape');
    const beforeDrawer = (await draft()).viewport;
    await restore.click({ button: 'right' });
    assert.equal(await page.locator('.node-context-menu').count(), 0);
    await button('Find canvas').click(); await page.getByLabel('Search canvases').waitFor();
    await restore.focus(); await page.keyboard.press('Enter');
    await button('Hide project outputs').waitFor();
    assert.equal(await restore.count(), 0);
    assert.equal(await page.getByLabel('Search canvases').count(), 0);
    await button('Hide project outputs').click();
    await restore.waitFor();
    assert.deepEqual((await draft()).viewport, beforeDrawer);
  }
  const longName = "Animation and finishing with a deliberately long canvas name";
  await rename("Animation", longName);
  await page.waitForFunction(() => {
    const pill = document.querySelector('.canvas-tab-item.active').getBoundingClientRect();
    const strip = document.querySelector('.canvas-tab-strip').getBoundingClientRect();
    return pill.left >= strip.left - 1 && pill.right <= strip.right + 1;
  });
  const longTab = await tab(longName).evaluate(el => {
    const label = el.querySelector('span'), pill = el.closest('.canvas-tab-item').getBoundingClientRect(), strip = el.closest('.canvas-tab-strip').getBoundingClientRect();
    return { truncated: label.scrollWidth > label.clientWidth, fits: pill.left >= strip.left - 1 && pill.right <= strip.right + 1 };
  });
  assert.equal(longTab.truncated, true); assert.equal(longTab.fits, true);
  await tab(longName).click(); await action("Rename").waitFor(); await checkMenuPosition(longName);
  await page.setViewportSize({ width: 1440, height: 1000 }); await checkMenuPosition(longName);
  await action('Rename').click(); await page.getByLabel('Canvas name', { exact: true }).waitFor(); await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(directory, 'canvases-long-name.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  for (let index = 0; index < 4; index++) await button('Add canvas').click();
  const beforeOverflowDrag = await tabs.getByRole('tab').allTextContents();
  await tabs.evaluate(el => { el.scrollLeft = 0; });
  await tab('Look Development').scrollIntoViewIfNeeded();
  const first = await tab('Look Development').boundingBox(), strip = await tabs.boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 8, first.y + first.height / 2, { steps: 3 });
  await page.mouse.move(strip.x + strip.width - 2, strip.y + strip.height / 2, { steps: 8 });
  await page.waitForFunction(() => document.querySelector('.canvas-tab-strip').scrollLeft > 100);
  await page.locator('.canvas-tab-drop-indicator').waitFor();
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await tabs.getByRole('tab').allTextContents(), beforeOverflowDrag);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ ok: true, directory, paidCalls: 0, checks: ["legacy migration", "blank canvas", "rename", "mounted state", "background completion", "viewport restore", "duplicate", "reorder", "copy selection", "shared assets", "whole-project save", "reload", "import", "search", "delete", "desktop/mobile", "pill styling", "content-sized labels", "long-name overflow"] }, null, 2));
} catch (error) { console.error({ directory, errors, unexpected, saves: saves.length, submitted, body: await page?.locator('.node-workspace').innerText().catch(() => '') }); await page?.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {}); throw error; }
finally { await browser.close(); }

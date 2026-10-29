import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { nodeDraftStorageKey } from "../src/useNodeEditorDraft.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-workspace-qa-"));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [], unexpected = [], writes = [];
const history = ["image", "video"].map((mediaType, index) => ({
  id: mediaType, mediaType, modelName: "Legacy test model", createdAt: new Date().toISOString(),
  project: { id: mediaType, name: mediaType === "image" ? "Image" : "Video" },
  prompt: "Preserved history", cost: { amountUsd: index + 1 }
}));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  // Every API response is isolated; this test cannot access projects, secrets or paid providers.
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push(pathname);
      return route.fulfill({ status: 403, json: { error: "Writes disabled in navigation QA" } });
    }
    const data = {
      "/api/health": { ok: true, routes: { systemNewtPresets: true, newtPresets: true } },
      "/api/settings": { apiKeysFound: false, modelPreferences: {}, nodePreferences: {} },
      "/api/pricing": { enabled: false, sources: {}, catalog: null },
      "/api/saved-workflows": [], "/api/newt-presets": [], "/api/history": [],
      "/api/stats": { history }
    };
    if (!(pathname in data)) unexpected.push(pathname);
    await route.fulfill({ json: data[pathname] ?? {} });
  });
  await page.goto(process.env.WORKSPACE_QA_URL || "http://127.0.0.1:5185/");
  const nav = page.getByRole("navigation", { name: "Workspace", exact: true });
  const button = name => nav.getByRole("button", { name, exact: true });
  const canvas = page.locator(".node-canvas");
  await canvas.waitFor();
  assert.deepEqual(await nav.getByRole("button").allTextContents().then(labels => labels.map(label => label.trim())), ["Projects", "Stats", "Settings"]);
  assert.equal(await button("Projects").getAttribute("aria-current"), "page");
  assert.equal(await page.locator("[data-node-card-id]").count(), 0);
  await page.getByTitle("Show node palette", { exact: true }).click();
  for (const name of ["Image", "Video", "Image Model", "Video Model"]) {
    assert.equal(await page.locator(".node-toolbar").getByRole("button", { name, exact: true }).count(), 1, name);
  }
  await page.screenshot({ path: path.join(directory, "canvas-desktop.png") });
  await button("Stats").click();
  await page.getByRole("heading", { name: "Generation stats" }).waitFor();
  assert.equal(await canvas.isVisible(), false);
  assert.equal(await page.getByText("Legacy test model", { exact: true }).count() > 0, true);
  await button("Settings").click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page.getByRole("heading", { name: "API Pricing" }).waitFor();
  await button("Projects").click(); await canvas.waitFor();

  const draft = {
    nodes: [{ id: "qa-text", type: "plainText", x: 80, y: 80, data: { title: "Saved brief", text: "Existing project text" } }],
    edges: [], groups: [], viewport: { x: 0, y: 0, scale: 1 }, projectName: "Saved navigation test", projectId: "qa"
  };
  await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key: nodeDraftStorageKey, draft });
  await page.reload(); await canvas.waitFor();
  await page.getByTitle("Show node palette", { exact: true }).click();
  const prompt = page.getByRole("textbox", { name: "Text prompt", exact: true });
  await prompt.waitFor(); assert.equal(await prompt.inputValue(), "Existing project text");
  const element = await prompt.elementHandle();
  await prompt.fill("Unsaved edits survive tab changes");
  for (const tab of ["Stats", "Settings", "Projects", "Settings", "Stats", "Projects"]) {
    await button(tab).click();
    assert.equal(await button(tab).getAttribute("aria-current"), "page");
  }
  assert.equal(await element.evaluate(el => el.isConnected), true, "Tabs must not unmount the node editor");
  assert.equal(await prompt.inputValue(), "Unsaved edits survive tab changes");
  assert.equal(await page.getByRole("textbox", { name: "Project name", exact: true }).inputValue(), draft.projectName);
  // Flush this isolated browser's draft using the same event as a real page close.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.reload(); await prompt.waitFor();
  assert.equal(await prompt.inputValue(), "Unsaved edits survive tab changes");
  assert.equal(await button("Projects").getAttribute("aria-current"), "page");

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const tab of ["Stats", "Settings", "Projects"]) {
      await button(tab).click(); await page.getByRole("navigation").waitFor();
      const rect = await nav.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width, "Navigation stays inside viewport");
      for (const name of ["Projects", "Stats", "Settings"]) {
        const bounds = await button(name).boundingBox();
        assert.ok(bounds.x >= rect.x && bounds.x + bounds.width <= rect.x + rect.width);
      }
    }
    await page.locator(".topbar").screenshot({ path: path.join(directory, `navigation-${viewport.width}.png`) });
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(writes, []);
  console.log(JSON.stringify({ ok: true, directory, paidCalls: 0, checks: ["Projects default", "three tabs", "image/video nodes retained", "Stats legacy history", "Settings", "saved draft restore", "unsaved edits and mounted editor survive navigation", "reload", "desktop/mobile navigation"] }, null, 2));
} catch (error) {
  console.error({ directory, errors, unexpected, writes });
  throw error;
} finally { await browser.close(); }

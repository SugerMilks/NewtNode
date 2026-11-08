import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { createServer } from "vite";
import { nodeDraftStorageKey } from "../src/useNodeEditorDraft.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = await mkdtemp(path.join(tmpdir(), "editor-stills-browser-"));
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  const file = path.join(dir, "clip.mp4");
  await promisify(execFile)(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=orange:s=160x90:r=30:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
  const video = await readFile(file), png = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#bb6533" } }).png().toBuffer();
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [], unexpected = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => errors.push(error.message));
    let submitted = 0, pending, polls = 0;
    await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (pathname === "/api/media-thumbnail") return route.fulfill({ contentType: "image/png", body: png });
      if (pathname === "/api/editor/render") {
        assert.equal(request.method(), "POST"); assert.equal(request.postDataJSON().frame, 0);
        submitted++; return route.fulfill({ json: { id: `still-${submitted}` } });
      }
      if (pathname.startsWith("/api/editor/jobs/")) { polls++; pending = route; return; }
      const responses = {
        "/api/health": { ok: true, routes: { editorTimeline: true, editorTransitions: true, editorClipFades: true, systemNewtPresets: true, newtPresets: true } },
        "/api/settings": { apiKeysFound: false, modelPreferences: {}, nodePreferences: {}, generationProvider: "fal" },
        "/api/pricing": { enabled: false, sources: {}, catalog: null }, "/api/pricing/quote": { amountUsd: null },
        "/api/saved-workflows": [], "/api/newt-presets": [], "/api/history": []
      };
      if (!(pathname in responses)) unexpected.push(`${request.method()} ${pathname}`);
      return route.fulfill({ json: responses[pathname] ?? {} });
    });
    await page.route(/\/(?:uploads|outputs)\//, route => route.fulfill({ contentType: route.request().url().includes(".mp4") ? "video/mp4" : "image/png", body: route.request().url().includes(".mp4") ? video : png }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/editorStills.html`);
    const editor = page.locator('[data-node-card-id="editor-still-qa"]');
    const grab = editor.getByRole("button", { name: "Grab current frame as PNG", exact: true });
    await grab.waitFor();
    const draft = async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      return page.evaluate(key => JSON.parse(localStorage.getItem(key)), nodeDraftStorageKey);
    };
    const captures = graph => graph.nodes.filter(node => node.type === "image" && node.id !== "blocker");
    const start = async () => {
      pending = null; await grab.click();
      for (let i = 0; i < 150 && !pending; i++) await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(pending, "The still job is polled");
    };
    const finish = async (failed = false) => {
      await pending.fulfill({ json: failed ? { status: "failed", error: "Test render failed" } : {
        status: "complete", result: { url: `/outputs/still-${submitted}.png`, type: "image", width: 1920, height: 1080 }
      } });
      await page.waitForFunction(() => !document.querySelector('[data-node-card-id="editor-still-qa"] .editor-progress'));
    };
    await start(); await finish();
    await page.getByRole("button", { name: "Close preview", exact: true }).click();
    let graph = await draft(), first = captures(graph)[0];
    assert.ok(first); assert.equal(first.canvasId, "edit-canvas"); assert.equal(first.data.resultUrl, "/outputs/still-1.png");
    assert.ok(first.x >= 1420, "The new node clears the existing neighbor"); assert.equal(first.y, 100);
    assert.equal(graph.nodes.find(n => n.id === "editor-still-qa").data.resultUrl, "/uploads/editor-qa/red.mp4");
    const image = page.locator(`[data-node-card-id="${first.id}"] img`).first();
    await image.waitFor(); await image.evaluate(img => img.decode());
    assert.equal(await image.evaluate(img => img.naturalWidth), 1920);
    await page.screenshot({ path: path.join(dir, `capture-${width}.png`) });
    await page.locator(".node-canvas").focus(); await page.keyboard.press("Control+z");
    graph = await draft(); assert.equal(captures(graph).length, 0);
    assert.equal(graph.nodes.find(n => n.id === "editor-still-qa").data.editorStills.length, 1);
    assert.equal(graph.nodes.find(n => n.id === "editor-still-qa").data.editorExportJob, null);
    await page.waitForTimeout(1100); assert.equal(submitted, 1); assert.equal(polls, 1);
    await page.keyboard.press("Control+Shift+z"); assert.equal(captures(await draft()).length, 1);
    await start(); await finish(true); await page.getByText("Test render failed", { exact: true }).waitFor();
    assert.equal(captures(await draft()).length, 1);
    await start();
    await page.getByRole("tab", { name: "Other", exact: true }).click();
    await finish();
    await page.waitForFunction(() => !document.querySelector('[role="tab"][title="Editing"] [aria-label="Generating"]'));
    graph = await draft(); assert.equal(graph.activeCanvasId, "other-canvas"); assert.equal(captures(graph).length, 2);
    assert.equal(captures(graph)[1].canvasId, "edit-canvas");
    assert.equal(await page.getByRole("button", { name: "Close preview", exact: true }).count(), 0);
    await page.getByRole("tab", { name: "Editing", exact: true }).click();
    assert.equal(await page.locator('.node-card.image:visible').count(), 3);
    await draft(); await page.reload(); await grab.waitFor();
    graph = await draft(); assert.equal(captures(graph).length, 2); assert.equal(submitted, 3); assert.equal(polls, 3);
    assert.equal(graph.nodes.find(n => n.id === "editor-still-qa").data.editorStills.length, 2);
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(`Editor still capture passed: visible Image nodes, placement, Undo/Redo, failure, canvas switching, reload. Screenshots: ${dir}`);
} finally {
  await browser?.close(); await server.close();
}

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createServer } from "vite";
import { nodeDraftStorageKey } from "../src/useNodeEditorDraft.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = await mkdtemp(path.join(tmpdir(), "character-custom-browser-"));
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  const png = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#9f7764" } }).png().toBuffer();
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [], unexpected = [];
  for (const recovery of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
    let uploads = 0;
    await page.route(/^https?:\/\/[^/]+\/api\//, route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (pathname === "/api/media-thumbnail") return route.fulfill({ contentType: "image/png", body: png });
      if (pathname === "/api/node/upload-asset") {
        uploads++; return route.fulfill({ json: { asset: { fileName: "Custom.png", storedFileName: "custom-qa.png", mimeType: "image/png", mediaType: "image", localUrl: "/uploads/custom-qa.png" } } });
      }
      const responses = {
        "/api/health": { ok: true, routes: { systemNewtPresets: true, newtPresets: true } },
        "/api/settings": { apiKeysFound: false, modelPreferences: {}, nodePreferences: {}, generationProvider: "fal" },
        "/api/pricing": { enabled: false, sources: {}, catalog: null }, "/api/pricing/quote": { amountUsd: null },
        "/api/saved-workflows": [], "/api/newt-presets": [], "/api/history": []
      };
      if (!(pathname in responses)) unexpected.push(`${request.method()} ${pathname}`);
      return route.fulfill({ json: responses[pathname] ?? {} });
    });
    await page.route(/\/(?:uploads|outputs)\//, route => route.fulfill({ contentType: "image/png", body: png }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/characterCustomSheets.html${recovery ? "?recovery=1" : ""}`);
    const card = page.locator('[data-node-card-id="character-qa"]');
    const port = card.locator('[data-port-id="characterOut"]');
    const preview = page.locator('[data-node-card-id="preview-qa"]');
    const draft = async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      return page.evaluate(key => JSON.parse(localStorage.getItem(key)), nodeDraftStorageKey);
    };
    await card.waitFor();
    if (!recovery) {
      await card.locator('.character-sheet-library input[type="file"]').first().setInputFiles({ name: "Custom.png", mimeType: "image/png", buffer: png });
      await card.getByText("Custom sheet ready.", { exact: true }).waitFor();
      await card.getByPlaceholder("Name", { exact: true }).fill("Emma");
      const lock = card.getByTitle("Lock the selected custom character sheet", { exact: true });
      assert.equal(await lock.isDisabled(), false); await lock.click();
    }
    await port.waitFor();
    let graph = await draft(), data = graph.nodes.find(node => node.id === "character-qa").data;
    assert.equal(data.resultUrl, "/uploads/custom-qa.png"); assert.equal(data.locked, true); assert.equal(data.activated, true);
    assert.equal(data.characterBaseSheet, null); assert.deepEqual(data.characterWardrobes, []); assert.deepEqual(data.characterSheetVariants, []);
    const start = await port.boundingBox(), target = await preview.locator('[data-port-id="sourceIn"]').boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 }); await page.mouse.up();
    await preview.locator("img").first().waitFor();
    await preview.locator("img").first().evaluate(img => img.decode());
    assert.equal(await preview.locator("img").first().evaluate(img => img.naturalWidth), 1920);
    graph = await draft(); assert.equal(graph.edges.length, 1);
    await page.reload(); await port.waitFor(); await preview.locator("img").first().waitFor();
    graph = await draft(); data = graph.nodes.find(node => node.id === "character-qa").data;
    assert.equal(data.resultUrl, "/uploads/custom-qa.png"); assert.equal(graph.edges.length, 1);
    assert.equal(await card.getByRole("tab", { name: "Base", exact: true }).count(), 0);
    await card.screenshot({ path: path.join(dir, `${recovery ? "recovered" : "uploaded"}.png`) });
    await card.getByRole("tab", { name: "Character Build", exact: true }).click();
    await card.getByRole("button", { name: "Remove Custom.png", exact: true }).click();
    graph = await draft(); data = graph.nodes.find(node => node.id === "character-qa").data;
    assert.equal(data.resultUrl, ""); assert.equal(data.characterCustomSheets.length, 0);
    assert.equal(uploads, recovery ? 0 : 1);
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, [], "No generation or unmocked API calls are permitted");
  console.log(`Custom Character sheets passed: upload, local lock, output connection, Preview, reopen, recovery and removal. Screenshots: ${dir}`);
} finally {
  await browser?.close(); await server.close();
}

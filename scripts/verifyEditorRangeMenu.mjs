import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error"
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-editor-range-"));
  const errors = [], unexpected = [];
  for (const width of [1440, 390]) for (const scale of [1, 0.5]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/^https?:\/\/[^/]+\/api\//, route => {
      const endpoint = new URL(route.request().url()).pathname;
      if (endpoint === "/api/health") return route.fulfill({ json: { routes: { editorTimeline: true } } });
      if (endpoint === "/api/editor/media") return route.fulfill({ json: { url: "/uploads/editor-qa/scene-a.mp4", type: "video", duration: 20, width: 640, height: 360, hasAudio: false } });
      unexpected.push(endpoint); return route.abort();
    });
    await page.route("**/uploads/editor-qa/**", route => route.abort());
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/editor.html`);
    const state = async () => JSON.parse(await page.getByLabel("QA timeline state", { exact: true }).textContent());
    await page.waitForFunction(() => JSON.parse(document.querySelector('[aria-label="QA timeline state"]').textContent).clips.length === 1);
    await page.getByRole("button", { name: "Toggle Preview", exact: true }).click();
    if (scale !== 1) await page.getByRole("button", { name: "Toggle canvas zoom", exact: true }).click();
    const frame = page.getByRole("spinbutton", { name: "Timeline frame", exact: true });
    await frame.fill("24"); await page.getByRole("button", { name: "Set In (I)", exact: true }).click();
    await frame.fill("60"); await page.getByRole("button", { name: "Set Out (O)", exact: true }).click();
    const before = await state(); assert.equal(before.inFrame, 24); assert.equal(before.outFrame, 61);
    const position = await page.getByLabel("QA node position", { exact: true }).textContent();
    const openMenu = async () => {
      const rect = await page.locator(".editor-export-range").boundingBox();
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2, { button: "right" });
      await page.getByRole("menu", { name: "Timeline range actions", exact: true }).waitFor();
      assert.equal(await frame.inputValue(), "60", "Right-click must not move the playhead");
      assert.equal(await page.getByLabel("QA node position", { exact: true }).textContent(), position);
    };
    await openMenu();
    const menu = await page.getByRole("menu").boundingBox(), root = await page.locator(".editor-node-body").boundingBox();
    assert.ok(menu.x >= root.x && menu.x + menu.width <= root.x + root.width + 1);
    await page.locator(".node-card.editor").screenshot({ path: path.join(screenshots, `menu-${width}-${scale}.png`) });
    await page.keyboard.press("Escape"); assert.equal(await page.getByRole("menu").count(), 0);
    assert.deepEqual(await state(), before);
    await openMenu(); await page.getByRole("button", { name: "Reset node position", exact: true }).click();
    assert.equal(await page.getByRole("menu").count(), 0); assert.deepEqual(await state(), before);
    await openMenu(); await page.getByRole("menuitem", { name: "Clear In and Out", exact: true }).click();
    assert.equal(await page.getByRole("menu").count(), 0);
    assert.deepEqual(await state(), { ...before, inFrame: 0, outFrame: null });
    assert.equal(await frame.inputValue(), "60");
    await page.keyboard.press("Control+z"); assert.deepEqual(await state(), before);
    await page.keyboard.press("Control+Shift+z"); assert.deepEqual(await state(), { ...before, inFrame: 0, outFrame: null });
    await page.keyboard.press("Control+z");
    await openMenu(); await page.keyboard.press("Space");
    assert.deepEqual(await state(), { ...before, inFrame: 0, outFrame: null }, "Space activates the menu instead of playing the timeline");
    await page.getByRole("button", { name: "Save and reopen", exact: true }).click();
    assert.deepEqual(await state(), { ...before, inFrame: 0, outFrame: null });
    // The now-interactive highlight must still delegate a normal drag to ruler scrubbing.
    const ruler = await page.locator(".editor-ruler").boundingBox();
    await page.mouse.move(ruler.x + 36 * scale, ruler.y + ruler.height - 6 * scale);
    await page.mouse.down(); await page.mouse.move(ruler.x + 72 * scale, ruler.y + ruler.height - 6 * scale, { steps: 4 }); await page.mouse.up();
    assert.ok(Math.abs(Number(await frame.inputValue()) - 36) <= 1);
    assert.deepEqual((await state()).clips, before.clips);
    if (width === 1440 && scale === 1) {
      const clip = await page.locator(".editor-clip").first().boundingBox();
      await page.mouse.click(clip.x + 30, clip.y + clip.height / 2);
      for (let i = 0; i < 24; i++) await page.keyboard.press("Control+ArrowRight");
      assert.equal((await state()).clips[0].start, 24);
      const lane = await page.locator('[data-editor-track="v1"]').boundingBox();
      await page.mouse.click(lane.x + 24, lane.y + 30, { button: "right" });
      await page.getByRole("menuitem", { name: "Ripple Delete", exact: true }).click();
      assert.equal((await state()).clips[0].start, 0, "Gap ripple delete remains functional");
    }
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: true, viewports: 4, screenshots, checks: "range clear, undo/redo, playhead preservation, dismissal, keyboard activation, zoom, save/reopen, scrubbing, ripple delete" }, null, 2));
} finally { await browser?.close(); await server.close(); }

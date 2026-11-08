import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { createServer } from "vite";
const exec = promisify(execFile);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = await mkdtemp(path.join(tmpdir(), "editor-position-browser-"));
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  const media = new Map();
  for (const color of ["red", "blue"]) {
    const file = path.join(dir, `${color}.mp4`);
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=24:d=4`, "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-shortest", file]);
    media.set(`/uploads/editor-qa/${color}.mp4`, await readFile(file));
  }
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [], unexpected = [];
  for (const width of [1440, 390]) for (const scale of [1, .5]) {
    const page = await browser.newPage({ viewport: { width, height: 1200 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/^https?:\/\/[^/]+\/api\//, route => { unexpected.push(route.request().url()); return route.abort(); });
    await page.route("**/uploads/editor-qa/**", route => {
      const body = media.get(new URL(route.request().url()).pathname);
      if (!body) return route.abort();
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: "video/mp4", body: body.subarray(start, end + 1),
        headers: { "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), ...(range ? { "Content-Range": `bytes ${start}-${end}/${body.length}` } : {}) } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/editor.html?transitions=1`);
    if (scale !== 1) await page.getByRole("button", { name: "Toggle canvas zoom", exact: true }).click();
    const state = async () => JSON.parse(await page.getByLabel("QA timeline state", { exact: true }).textContent());
    const initial = await state();
    const clip = id => page.locator(`[data-editor-clip="${id}"]`);
    const select = id => clip(id).click({ position: { x: 30, y: 25 } });
    const horizontal = page.getByRole("slider", { name: "Clip horizontal position", exact: true });
    const vertical = page.getByRole("slider", { name: "Clip vertical position", exact: true });
    const settings = page.getByRole("button", { name: "Sequence settings", exact: true });
    await settings.click(); assert.equal(await horizontal.isDisabled(), true);
    await select("a1-red"); assert.equal(await vertical.isDisabled(), true);
    await select("v1-red"); assert.equal(await horizontal.isEnabled(), true);
    await page.getByRole("spinbutton", { name: "Timeline frame", exact: true }).fill("20");
    await page.waitForFunction(() => !document.querySelector(".editor-monitor-state"));
    const position = async () => JSON.parse(await page.getByLabel("QA node position", { exact: true }).textContent());
    const beforeNode = await position();
    async function drag(slider, value, cancel = false) {
      await slider.scrollIntoViewIfNeeded();
      const rect = await slider.boundingBox(), old = Number(await slider.inputValue()), before = await state();
      const x = v => rect.x + 8 * scale + (rect.width - 16 * scale) * (v + 100) / 200;
      await page.mouse.move(x(old), rect.y + rect.height / 2); await page.mouse.down();
      await page.mouse.move(x(value), rect.y + rect.height / 2, { steps: 8 });
      assert.deepEqual(await state(), before, "Dragging previews without writing the project");
      assert.ok(Math.abs(Number(await slider.inputValue()) - value) < 3, "Slider responds to pointer movement");
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
      if (cancel) assert.deepEqual(await state(), before, "Cancel leaves the project unchanged");
    }
    await drag(horizontal, 25);
    assert.ok(Math.abs((await state()).clips[0].positionX - 25) < 3);
    await page.waitForFunction(() => {
      const c = document.querySelector(".editor-monitor canvas"), ctx = c.getContext("2d");
      return ctx.getImageData(5, 45, 1, 1).data[0] < 8 && ctx.getImageData(80, 45, 1, 1).data[0] > 240;
    });
    await page.getByRole("button", { name: "Undo (Cmd/Ctrl+Z)", exact: true }).click();
    assert.deepEqual((await state()).clips, initial.clips, "Drag creates one Undo step");
    await page.getByRole("button", { name: "Redo (Cmd/Ctrl+Shift+Z)", exact: true }).click();
    await select("v1-red"); await drag(vertical, -25);
    await page.waitForFunction(() => {
      const c = document.querySelector(".editor-monitor canvas"), ctx = c.getContext("2d");
      return ctx.getImageData(80, 85, 1, 1).data[0] < 8 && ctx.getImageData(80, 45, 1, 1).data[0] > 240;
    });
    await drag(horizontal, 40, true);
    assert.deepEqual((await state()).clips.slice(1), initial.clips.slice(1), "Other clips and linked sound are unchanged");
    const afterNode = await position(); assert.equal(afterNode.x, beforeNode.x); assert.equal(afterNode.y, beforeNode.y);
    await horizontal.focus(); const beforeKey = Number(await horizontal.inputValue());
    await page.keyboard.press("ArrowRight"); assert.equal(Number(await horizontal.inputValue()), Math.round((beforeKey + .1) * 10) / 10);
    await page.getByRole("button", { name: "Lock V1", exact: true }).click(); assert.equal(await horizontal.isDisabled(), true);
    await page.getByRole("button", { name: "Unlock V1", exact: true }).click();
    const saved = await state(); await page.getByRole("button", { name: "Save and reopen", exact: true }).click();
    assert.deepEqual((await state()).clips, saved.clips);
    await select("v1-red"); await settings.click();
    assert.equal(Number(await horizontal.inputValue()), saved.clips[0].positionX);
    await page.locator(".node-card.editor").screenshot({ path: path.join(dir, `position-${width}-${scale}.png`) });
    const bounds = await page.locator(".editor-clip-position").evaluate(el => {
      const r = el.getBoundingClientRect(); return [...el.querySelectorAll("input,output,button")].every(c => { const b = c.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1; });
    }); assert.equal(bounds, true, "Position controls fit the node at narrow widths");
    await page.getByRole("button", { name: "Reset clip position", exact: true }).click(); assert.deepEqual((await state()).clips, initial.clips);
    assert.equal(await page.getByRole("alert").count(), 0);
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: true, viewports: 4, screenshots: dir, checks: "video selection, both live sliders, preview pixels, undo/redo, cancel, keyboard, locks, linked audio, persistence, reset, layout" }, null, 2));
} finally {
  await browser?.close(); await server.close();
  for (const color of ["red", "blue"]) await rm(path.join(dir, `${color}.mp4`), { force: true });
}

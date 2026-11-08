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
const dir = await mkdtemp(path.join(tmpdir(), "editor-transition-browser-"));
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  const media = new Map();
  for (const [color, frequency] of [["red", 440], ["blue", 880]]) {
    const file = path.join(dir, `${color}.mp4`);
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=24:d=4`, "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=4`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-shortest", file]);
    media.set(`/uploads/editor-qa/${color}.mp4`, await readFile(file));
  }
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [], unexpected = [];
  for (const width of [1440, 390]) for (const scale of [1, .5]) {
    const page = await browser.newPage({ viewport: { width, height: 1200 } });
    await page.addInitScript(() => {
      window.qaMedia = [];
      const create = document.createElement.bind(document);
      document.createElement = (...args) => { const el = create(...args); if (["audio", "video"].includes(args[0])) window.qaMedia.push(el); return el; };
    });
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
    const state = async () => JSON.parse(await page.getByLabel("QA timeline state", { exact: true }).textContent());
    const before = await state(); assert.equal(before.clips.length, 4);
    if (scale !== 1) await page.getByRole("button", { name: "Toggle canvas zoom", exact: true }).click();
    const frame = page.getByRole("spinbutton", { name: "Timeline frame", exact: true });
    const seek = async f => {
      await frame.fill(String(f));
      try { await page.waitForFunction(() => !document.querySelector(".editor-monitor-state"), null, { timeout: 10000 }); }
      catch (error) {
        console.log(JSON.stringify(await page.evaluate(() => ({ media: window.qaMedia.map(m => ({ src: m.src, state: m.readyState, time: m.currentTime, duration: m.duration, seeking: m.seeking, error: m.error?.message })), alerts: [...document.querySelectorAll('[role="alert"]')].map(el => el.textContent) })), null, 2));
        throw error;
      }
    };
    const pixel = async () => page.getByLabel("Editor sequence preview", { exact: true }).evaluate(c => [...c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data]);
    const openCut = async track => {
      const clip = page.locator(`[data-editor-clip="${track}-blue"]`);
      await clip.scrollIntoViewIfNeeded();
      const rect = await clip.boundingBox();
      await page.mouse.click(rect.x + scale, rect.y + 25 * scale, { button: "right" });
      try { await page.getByRole("menu", { name: "Clip transitions" }).waitFor({ timeout: 5000 }); }
      catch (error) {
        await page.screenshot({ path: path.join(dir, `failure-${width}-${scale}.png`) });
        console.log(JSON.stringify({ width, scale, rect, errors, dir, target: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML, { x: rect.x + scale, y: rect.y + 25 * scale }) })); throw error;
      }
    };
    const dragEdge = async (label, edge, delta, cancel = false) => {
      const handle = page.getByRole("button", { name: `Resize ${edge === "left" ? "start" : "end"} of ${label}`, exact: true });
      await handle.scrollIntoViewIfNeeded();
      const rect = await handle.boundingBox(), beforeDrag = await state();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
      await page.mouse.move(rect.x + rect.width / 2 + delta * 2 * scale, rect.y + rect.height / 2, { steps: 5 });
      assert.deepEqual(await state(), beforeDrag, "A resize stays local until pointer release");
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
      if (cancel) assert.deepEqual(await state(), beforeDrag, "Escape cancels without creating an edit");
    };
    await seek(48); await openCut("v1");
    assert.equal(await frame.inputValue(), "48");
    assert.equal(await page.getByRole("menuitem", { name: "Cross Fade", exact: true }).count(), 0);
    await page.locator(".node-card.editor").screenshot({ path: path.join(dir, `menu-${width}-${scale}.png`) });
    await page.getByRole("menuitem", { name: "Cross Dissolve", exact: true }).click();
    await seek(48);
    await page.waitForFunction(() => { const c = document.querySelector(".editor-monitor canvas"); const p = c.getContext("2d").getImageData(80, 45, 1, 1).data; return p[0] > 115 && p[0] < 140 && p[2] > 115 && p[2] < 140; });
    assert.deepEqual((await state()).clips, before.clips);
    assert.equal((await state()).transitions[0].type, "crossDissolve");
    await page.getByRole("button", { name: "Select Cross Dissolve", exact: true }).click();
    assert.equal(await page.getByRole("menu").count(), 0, "Click selects rather than opening a duration menu");
    await dragEdge("Cross Dissolve", "right", -6);
    assert.equal((await state()).transitions[0].duration, 12);
    await page.keyboard.press("Control+z"); assert.equal((await state()).transitions[0].duration, 24);
    await page.keyboard.press("Control+Shift+z"); assert.equal((await state()).transitions[0].duration, 12);
    await dragEdge("Cross Dissolve", "left", -6);
    assert.equal((await state()).transitions[0].duration, 24);
    await dragEdge("Cross Dissolve", "right", 4, true);
    assert.equal((await state()).transitions[0].duration, 24);
    await page.keyboard.press("Control+z"); assert.equal((await state()).transitions[0].duration, 12, "A multi-move drag is a single Undo step; cancel adds none");
    await page.keyboard.press("Control+Shift+z");
    await page.getByRole("button", { name: "Select Cross Dissolve", exact: true }).click();
    await page.locator(".node-card.editor").screenshot({ path: path.join(dir, `handles-${width}-${scale}.png`) });
    assert.equal(await page.getByRole("combobox", { name: "Transition duration", exact: true }).count(), 0);
    assert.equal(await frame.inputValue(), "48");
    await openCut("a1");
    assert.equal(await page.getByRole("menuitem", { name: "Cross Dissolve", exact: true }).count(), 0);
    await page.getByRole("menuitem", { name: "Cross Fade", exact: true }).click();
    assert.equal((await state()).transitions.length, 2);
    await dragEdge("Cross Fade", "right", -6);
    assert.equal((await state()).transitions.find(t => t.type === "crossFade").duration, 12);
    await dragEdge("Cross Fade", "left", -100);
    assert.equal((await state()).transitions.find(t => t.type === "crossFade").duration, 48, "Crossfade stops at its source limits");
    await page.getByRole("button", { name: "Save and reopen", exact: true }).click();
    assert.equal((await state()).transitions.length, 2);
    await seek(34); await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Timeline frame"]').value) >= 67);
    await page.getByRole("button", { name: "Pause (Space)", exact: true }).click();
    assert.equal(await page.getByRole("alert").count(), 0);
    await seek(48); await openCut("v1");
    await page.getByRole("menuitem", { name: "Dip to Black", exact: true }).click();
    await seek(48); assert.ok((await pixel()).slice(0, 3).every(v => v < 5));
    await dragEdge("Dip to Black", "right", -6);
    assert.equal((await state()).transitions.find(t => t.type === "dipToBlack").duration, 12);
    await page.getByRole("button", { name: "Lock V1", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Resize start of Dip to Black", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Unlock V1", exact: true }).click();
    await page.locator(".editor-transition.dipToBlack").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Remove Transition", exact: true }).click();
    assert.equal((await state()).transitions.length, 1);
    await page.getByRole("button", { name: "Lock V1", exact: true }).click();
    await openCut("v1"); assert.equal(await page.getByRole("menuitem", { name: "Cross Dissolve", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape"); assert.equal(await page.getByRole("menu").count(), 0);
    assert.deepEqual((await state()).clips, before.clips);
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: true, viewports: 4, screenshots: dir, checks: "media-specific menus, canvas pixels, playback across cut, resize both edges, source limits, cancel, single-step undo/redo, persistence, removal, locked tracks" }, null, 2));
} finally {
  await browser?.close(); await server.close();
  for (const name of ["red.mp4", "blue.mp4"]) await rm(path.join(dir, name), { force: true });
}

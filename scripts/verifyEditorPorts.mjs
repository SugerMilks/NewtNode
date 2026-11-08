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
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-editor-ports-"));
  const errors = [], checks = [];
  for (const deviceScaleFactor of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor });
    page.on("pageerror", error => errors.push(error.message));
    // No live media, project changes, exports or provider calls in this layout check.
    await page.route(/^https?:\/\/[^/]+\/api\//, route => route.fulfill({ status: 400, json: { error: "Media disabled in layout test" } }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/editor.html`);
    const node = page.locator(".node-card.editor"), ports = node.locator(".inline-port");
    await ports.first().waitFor();
    assert.equal(await ports.count(), 3);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      for (const scale of [0.5, 1, 1.75]) {
        await node.evaluate((element, value) => { element.style.transformOrigin = "top left"; element.style.transform = `scale(${value})`; }, scale);
        for (const connected of [false, true]) {
          await ports.evaluateAll((elements, value) => elements.forEach(element => element.classList.toggle("connected", value)), connected);
          const sizes = await ports.evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return { id: element.dataset.portId, width: rect.width, height: rect.height, radius: style.borderRadius, shrink: style.flexShrink, color: style.backgroundColor };
          }));
          for (const port of sizes) {
            assert.ok(Math.abs(port.width - port.height) < 0.02, `${port.id} must remain circular: ${JSON.stringify(port)}`);
            assert.ok(Math.abs(port.width - 18 * scale) < 0.02, `${port.id} must use the shared 18px port size`);
            assert.equal(port.radius, "50%"); assert.equal(port.shrink, "0");
            assert.equal(port.color, port.id === "audioIn" ? "rgb(255, 139, 53)" : "rgb(88, 206, 99)");
          }
          checks.push({ deviceScaleFactor, width, scale, connected });
        }
        if (scale === 1) await node.locator(".editor-topbar").screenshot({ path: path.join(screenshots, `ports-${width}-${deviceScaleFactor}.png`) });
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await node.evaluate(element => { element.style.transform = "none"; });
    await page.getByRole("button", { name: "Toggle Preview", exact: true }).click();
    const output = node.locator('.inline-port[data-port-id="videoOut"]');
    assert.equal(await output.evaluate(element => element.classList.contains("connected")), false);
    await output.click();
    assert.equal(await output.evaluate(element => element.classList.contains("connected")), true);
    await page.getByTitle("Disconnect Video", { exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Connect video A", exact: true }).count(), 1);
    assert.equal(await node.locator(".editor-tool").first().evaluate(element => getComputedStyle(element).borderRadius), "4px");
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: checks.length, errors, screenshots, interactions: "output connect and input disconnect preserved" }, null, 2));
} finally { await browser?.close(); await server.close(); }

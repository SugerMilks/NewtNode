import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-vector-guidance-qa-"));
const svg = await readFile(new URL("../test/fixtures/vector-design.svg", import.meta.url));
const png = await sharp(svg).png().toBuffer();
const assets = new Map();
const server = await startVectorQaServer({ svg, png, assets });
const browser = await chromium.launch({ headless: true, channel: process.env.VECTOR_BROWSER_CHANNEL || "chrome" });
const errors = [], apiCalls = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { apiCalls.push(route.request().url()); return route.abort(); });
  await page.goto(`${server.url}/test/browser/vector.html`);
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const calls = () => page.getByLabel("Provider calls").textContent().then(JSON.parse);
  const uploads = () => page.getByLabel("Guidance uploads").textContent().then(JSON.parse);
  const open = name => page.getByRole("button", { name, exact: true }).click();
  const apply = async () => { await open("Apply Reference"); await page.getByRole("dialog").waitFor({ state: "hidden" }); };
  const canvas = () => page.getByLabel("Layout drawing canvas");
  const ink = async () => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); return canvas().evaluate(c => {
    const bytes = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    return bytes.reduce((total, value, index) => total + (index % 4 === 3 && value > 0 ? 1 : 0), 0);
  }); };
  async function stroke(x1 = .2, y1 = .25, x2 = .7, y2 = .7) {
    const b = await canvas().boundingBox();
    await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1); await page.mouse.down();
    await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2, { steps: 12 }); await page.mouse.up();
  }
  await page.getByLabel("Lettering", { exact: true }).fill("NEWT STUDIO");
  await open("Font Reference");
  assert.equal(await page.getByLabel("Font sample lettering").inputValue(), "NEWT STUDIO");
  await page.getByLabel("Sample typeface").selectOption("Georgia");
  const fontNames = await page.getByLabel("Sample typeface").locator("option").evaluateAll(options => options.map(option => option.value));
  if (process.platform === "darwin") {
    assert.ok(fontNames.length >= 65, `Expected common Mac fonts; found ${fontNames.length}`);
    for (const family of ["Avenir", "Futura", "Helvetica Neue", "Baskerville", "Didot", "Menlo", "Zapfino"]) assert.ok(fontNames.includes(family), `${family} is available`);
    const images = [];
    for (const family of ["Avenir", "Didot", "Zapfino", "Menlo"]) {
      await page.getByLabel("Sample typeface").selectOption(family);
      assert.equal(await page.locator(".vg-file-label").textContent(), family);
      images.push(await page.getByLabel("Font sample preview").evaluate(async c => { await new Promise(requestAnimationFrame); return c.toDataURL(); }));
      assert.equal(await page.evaluate(() => [...document.fonts].filter(font => font.family.startsWith("VectorGuideLocal")).length), 1);
    }
    assert.equal(new Set(images).size, images.length, "named fonts produce different specimens, not the same fallback");
    await page.setViewportSize({ width: 420, height: 900 });
    await page.getByRole("dialog").screenshot({ path: path.join(directory, "font-narrow.png") });
    assert.equal(await page.getByRole("dialog").evaluate(el => el.scrollWidth > el.clientWidth + 2), false);
    await page.setViewportSize({ width: 1200, height: 1100 });
    await page.getByLabel("Sample typeface").selectOption("Georgia");
  }
  assert.ok(await page.getByLabel("Font sample preview").evaluate(c => c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 0 && v < 100)));
  await page.getByRole("dialog").screenshot({ path: path.join(directory, "font-desktop.png") });
  await apply();
  assert.equal(await page.evaluate(() => [...document.fonts].filter(font => font.family.startsWith("VectorGuideLocal")).length), 0);
  assert.equal((await calls()).generate, 0);
  let saved = await state();
  assert.equal(saved.fontReference.kind, "font"); assert.equal(saved.fontReference.sample, "NEWT STUDIO");
  assert.equal(saved.fontReference.label, "Georgia");
  assert.equal((await uploads())[0].type, "image/png"); assert.equal((await uploads())[0].fields.projectId, "qa-1");
  assert.ok(assets.has(saved.fontReference.url));

  await page.getByLabel("Vector aspect ratio").selectOption("16:9");
  await open("Draw Layout");
  await open("Apply Reference");
  assert.match(await page.getByRole("alert").textContent(), /Draw a layout/);
  await open("Rectangle"); await stroke();
  const pixels = await ink(); assert.ok(pixels > 100);
  await open("Undo stroke"); assert.equal(await ink(), 0);
  // Chrome may switch canvas rasterizers after readback; allow edge-antialias differences.
  await open("Redo stroke"); assert.ok(Math.abs(await ink() - pixels) / pixels < .05);
  await open("Text label"); await page.getByLabel("Drawing text label").fill("title here");
  const box = await canvas().boundingBox();
  await page.mouse.click(box.x + box.width * .2, box.y + box.height * .1);
  await page.getByRole("dialog").screenshot({ path: path.join(directory, "layout-desktop.png") });
  await apply();
  saved = await state(); assert.equal(saved.layoutReference.marks.length, 2); assert.equal(saved.layoutReference.width, 1536); assert.equal(saved.layoutReference.height, 864);
  const raw = await sharp(assets.get(saved.layoutReference.url)).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...raw.subarray(0, 4)], [255, 255, 255, 255]);
  assert.ok(raw.some((v, i) => i % 4 === 0 && v < 80));
  await open("Save / Reopen"); await open("Draw Layout"); assert.ok(await ink() > pixels);
  await open("Clear drawing"); assert.equal(await ink(), 0);
  await canvas().focus(); await page.keyboard.press("Control+z"); assert.ok(await ink() > 0);
  await open("Cancel"); assert.equal((await state()).layoutReference.marks.length, 2);
  await page.getByRole("checkbox", { name: "Connect source", exact: true }).check();
  await open("Draw Layout"); await page.getByLabel("Layout background").selectOption("/uploads/vector-qa/source.png");
  await open("Zoom in"); await open("Fit layout");
  await apply(); assert.equal((await state()).layoutReference.backgroundUrl, "/uploads/vector-qa/source.png");

  // PNG references work independently of custom font parsing.
  await open("Font Reference");
  await page.getByLabel("Font reference file").setInputFiles({ name: "type-reference.png", mimeType: "image/png", buffer: png });
  await page.getByText("type-reference.png", { exact: true }).waitFor(); await apply();
  assert.equal((await state()).fontReference.kind, "image");
  if (process.env.VECTOR_QA_FONT) {
    await open("Font Reference"); await page.getByLabel("Font reference file").setInputFiles(process.env.VECTOR_QA_FONT);
    await page.getByText(path.basename(process.env.VECTOR_QA_FONT), { exact: true }).waitFor();
    await page.getByLabel("Font sample lettering").fill("Vector type 0123"); await apply();
    assert.equal((await state()).fontReference.kind, "font");
    assert.equal(await page.evaluate(() => [...document.fonts].filter(font => font.family.startsWith("VectorGuide")).length), 0, "temporary font released after close");
  }
  await open("Font Reference");
  await page.getByLabel("Font reference file").setInputFiles({ name: "broken.ttf", mimeType: "font/ttf", buffer: Buffer.from("not a font") });
  await page.getByRole("alert").filter({ hasText: "not a supported font" }).waitFor(); await open("Cancel");
  await page.getByRole("checkbox", { name: "Fail reference save", exact: true }).check();
  const priorFont = (await state()).fontReference.url;
  await open("Font Reference"); await page.getByLabel("Sample typeface").selectOption("Arial"); await open("Apply Reference");
  await page.getByRole("alert").filter({ hasText: "Mock reference save failed" }).waitFor();
  assert.equal((await state()).fontReference.url, priorFont); await open("Cancel");
  await page.getByRole("checkbox", { name: "Fail reference save", exact: true }).uncheck();

  await page.getByRole("checkbox", { name: "Connect Mood Board", exact: true }).check();
  await page.getByRole("checkbox", { name: "Extra sources", exact: true }).check();
  assert.equal(await page.locator(".vector-generate").isDisabled(), true);
  await page.getByRole("checkbox", { name: "Use Font Reference", exact: true }).uncheck();
  assert.equal(await page.locator(".vector-generate").isEnabled(), true, "disabled guides do not consume a reference slot");
  await page.getByRole("checkbox", { name: "Use Font Reference", exact: true }).check();
  await page.getByRole("checkbox", { name: "Extra sources", exact: true }).uncheck();
  await page.getByLabel("Vector quality").selectOption("high");
  await page.waitForFunction(() => document.querySelector(".vector-generate").textContent.includes("$0.32"));
  await page.locator(".vector-generate").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).resultItems.length === 1);
  const submitted = (await calls()).last;
  assert.equal(submitted.images.length, 4);
  assert.equal(submitted.images[0].url, (await state()).layoutReference.url);
  assert.match(submitted.prompt, /Reference image 3: TYPOGRAPHY/);
  assert.match(submitted.prompt, /Reference image 4: MOOD BOARD/);
  await open("Save / Reopen"); assert.equal((await calls()).generate, 1);
  await page.locator(".node-card.vector").screenshot({ path: path.join(directory, "node-desktop.png") });
  await page.setViewportSize({ width: 420, height: 900 });
  await page.locator(".node-card.vector").screenshot({ path: path.join(directory, "node-narrow.png") });
  assert.equal(await page.locator(".node-card.vector").evaluate(el => el.scrollWidth > el.clientWidth + 2), false);
  await open("Draw Layout");
  await page.getByRole("dialog").screenshot({ path: path.join(directory, "layout-narrow.png") });
  assert.equal(await page.getByRole("dialog").evaluate(el => el.scrollWidth > el.clientWidth + 2), false);
  await open("Cancel");

  await page.getByLabel("Vector task").selectOption("vectorize");
  assert.equal(await page.getByRole("button", { name: "Draw Layout", exact: true }).count(), 0);
  await page.locator(".vector-generate").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).resultItems.length === 2);
  assert.equal((await calls()).last.images.length, 1); assert.equal((await calls()).last.prompt, undefined);
  await page.getByLabel("Vector task").selectOption("generate");
  assert.ok((await state()).layoutReference.url);
  await page.getByRole("checkbox", { name: "Slow response", exact: true }).check();
  await page.locator(".vector-generate").click();
  const currentFontUrl = (await state()).fontReference?.url;
  const capturedFont = (await calls()).last.images.find(image => image.url === currentFontUrl);
  await open("Remove Font Reference");
  await page.waitForFunction(() => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).resultItems.length === 3);
  assert.ok(capturedFont); assert.equal((await state()).fontReference, null, "generation completion preserves intervening reference removal");
  assert.equal((await calls()).generate, 3);

  // Late local saves cannot apply to a different project, even with the same node id.
  await page.setViewportSize({ width: 1200, height: 1100 });
  await page.getByRole("checkbox", { name: "Slow reference save", exact: true }).check();
  await open("Draw Layout"); await open("Ellipse"); await stroke(.3, .3, .5, .5); await open("Apply Reference");
  // Simulate a workflow switch from outside the modal, as a project replacement would do.
  await page.getByRole("button", { name: "Switch project", exact: true }).evaluate(button => button.click());
  await page.waitForTimeout(1700);
  assert.equal((await state()).layoutReference, null);
  assert.equal((await state()).fontReference, null);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal((await calls()).generate, 3);
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  console.log(JSON.stringify({ passed: true, screenshots: directory, paidProviderCalls: 0, customFontTested: Boolean(process.env.VECTOR_QA_FONT) }));
} finally { await browser.close(); await server.close(); }

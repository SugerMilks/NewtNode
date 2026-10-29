import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-sidebar-qa-"));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [], requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { requests.push(route.request().url()); return route.abort(); });
  await page.goto(`${process.env.SIDEBAR_QA_URL || 'http://127.0.0.1:5185'}/test/browser/presets.html`);
  const button = name => page.getByRole('button', { name, exact: true });
  const menu = name => page.getByRole('menu', { name, exact: true });
  const action = name => page.getByRole('menuitem', { name, exact: true });
  const open = async name => { await button(name).click(); await menu(name).waitFor(); assert.equal(await page.getByRole('menu').count(), 1); };
  const closed = () => page.waitForFunction(() => ![...document.querySelectorAll('[role="menu"]')].some(el => !el.hidden));
  const focused = label => page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label || document.activeElement?.textContent === label, label);
  const inserted = count => page.waitForFunction(count => document.querySelector('[aria-label="Insertions"]')?.textContent === String(count), count);
  const sidebar = page.locator('.node-toolbar'), header = page.locator('.toolbar-header');
  await button('Preset Workflows').waitFor();
  assert.equal(await header.innerText(), '');
  assert.equal(await button('New Project').count(), 1); assert.equal(await page.getByLabel('Project name', { exact: true }).inputValue(), 'Sidebar test');
  for (const name of ['File', 'Recent Projects', 'Preset Workflows']) {
    assert.equal(await button(name).textContent(), ''); assert.equal(await button(name).getAttribute('title'), name);
    assert.equal(await button(name).locator('svg').count(), 1);
  }
  await sidebar.screenshot({ path: path.join(directory, 'sidebar-desktop.png') });
  for (const name of ['Save', 'Save As', 'Open', 'Import']) {
    await open('File'); await action(name).click(); await closed();
    assert.equal(await page.getByLabel('File action').textContent(), name); await focused('File');
  }
  await button('File').focus(); await page.keyboard.press('ArrowDown'); await focused('Save');
  await page.keyboard.press('End'); await focused('Import'); await page.keyboard.press('Home'); await focused('Save');
  await page.keyboard.press('ArrowUp'); await focused('Import'); await page.keyboard.press('Escape'); await closed(); await focused('File');
  await page.keyboard.press('ArrowUp'); await focused('Import'); await page.keyboard.press('Escape'); await closed();
  await open('File'); await button('File').click(); await closed();
  await open('File'); await open('Recent Projects');
  await sidebar.screenshot({ path: path.join(directory, 'recent-desktop.png') });
  await action('Vector Example').click(); await closed(); assert.equal(await page.getByLabel('File action').textContent(), 'Load one');
  await open('Recent Projects'); await page.locator('.node-canvas').click({ position: { x: 30, y: 100 } }); await closed();
  await open('Recent Projects'); await page.keyboard.press('End'); await page.keyboard.press('Tab'); await closed();

  await open('Preset Workflows'); await action('Insert Cinematic Image Workflow (System)').click(); await inserted(1); await closed();
  await open('Preset Workflows'); await action('Insert A very long user workflow name for a product campaign (User)').click(); await inserted(2);
  await open('Preset Workflows'); await action('Insert Cinematic Image Workflow (System)').click(); await inserted(3);
  await page.getByLabel('Newt running').check(); await open('Preset Workflows');
  assert.equal(await action('Insert Cinematic Image Workflow (System)').isDisabled(), true);
  assert.equal(await action('Delete A very long user workflow name for a product campaign').isDisabled(), false);
  assert.equal(await menu('Preset Workflows').getByRole('menuitem', { name: /Delete.*Cinematic/ }).count(), 0);
  await page.getByLabel('Newt running').uncheck(); await page.getByLabel('Fail preset load').check();
  await open('Preset Workflows'); await action('Insert Cinematic Image Workflow (System)').click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Preset Workflows"][data-error="true"]'));
  await open('Preset Workflows'); assert.match(await page.getByRole('alert').textContent(), /Could not load/);
  await sidebar.screenshot({ path: path.join(directory, 'presets-error.png') });
  await action('Reload presets').click(); await page.getByRole('alert').waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape'); await closed(); await focused('Preset Workflows');
  await page.getByLabel('Fail preset load').uncheck();
  await page.getByLabel('Confirm deletion').uncheck(); await open('Preset Workflows');
  await action('Delete A very long user workflow name for a product campaign').click(); await closed();
  await open('Preset Workflows'); assert.equal(await action('Insert A very long user workflow name for a product campaign (User)').count(), 1);
  await page.getByLabel('Confirm deletion').check(); await open('Preset Workflows');
  await action('Delete A very long user workflow name for a product campaign').click(); await closed();
  await open('Preset Workflows'); assert.equal(await menu('Preset Workflows').getByRole('menuitem', { name: /^Delete/ }).count(), 0);
  assert.equal(await page.getByLabel('Insertions').textContent(), '3');
  await page.getByTitle('Hide node palette', { exact: true }).click(); await sidebar.waitFor({ state: 'hidden' });
  await page.getByTitle('Show node palette', { exact: true }).click(); await sidebar.waitFor(); await closed();

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); const bounds = await sidebar.boundingBox();
    assert.ok(await sidebar.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    for (const name of ['File', 'Recent Projects', 'Preset Workflows']) {
      await open(name); const rect = await menu(name).boundingBox(), icon = await button(name).boundingBox();
      assert.ok(rect.x >= bounds.x && rect.x + rect.width <= bounds.x + bounds.width + 1, `${name} stays within sidebar`);
      assert.ok(rect.y >= icon.y + icon.height, `${name} opens below icons`);
      assert.ok(await menu(name).evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      const colors = await menu(name).evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }));
      assert.equal(colors.background, 'rgb(8, 8, 8)', `${name} uses the darker opaque dropdown surface`);
      assert.equal(colors.border, 'rgba(255, 255, 255, 0.16)', `${name} has a distinct edge`);
      await sidebar.screenshot({ path: path.join(directory, `${name.toLowerCase().replaceAll(' ', '-')}-${viewport.width}.png`) });
      await page.keyboard.press('Escape'); await closed();
    }
    await sidebar.screenshot({ path: path.join(directory, `sidebar-${viewport.width}.png`) });
  }
  await open('Recent Projects'); await action('Remove Vector Example').click(); await closed();
  await open('Recent Projects'); await action('Remove A very long recent project name that should fit the sidebar').click(); await closed();
  await open('Recent Projects'); assert.equal(await menu('Recent Projects').textContent(), 'No saved workflows');
  await page.keyboard.press('Escape'); await closed(); await focused('Recent Projects');
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log(JSON.stringify({ ok: true, directory, paidCalls: 0, checks: ['icon-only header', 'File actions', 'recent projects', 'direct preset insertion', 'user-only deletion and confirmation', 'busy guard', 'errors and reload', 'keyboard and focus', 'exclusive menus', 'outside click', 'empty menu', 'collapse/restore', 'desktop/mobile bounds'] }, null, 2));
} catch (error) { console.error({ directory, errors, requests }); throw error; }
finally { await browser.close(); }

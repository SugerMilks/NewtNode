import path from "node:path";
import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import sharp from "sharp";
import { vectorDesignLook } from "../src/vectorDesignLooks.js";
import { validateOutputUrl } from "./output-export.js";
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const validId = id => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
export function createVectorLookStore({ directory, assetDirectory, assetUrl, readAsset }) {
  let queue = Promise.resolve();
  const exclusive = action => { const pending = queue.then(action); queue = pending.catch(() => {}); return pending; };
  async function list() {
    await mkdir(directory, { recursive: true });
    const files = (await readdir(directory)).filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).slice(0, 100);
    const result = [];
    for (const file of files) { const bytes = await readFile(path.join(directory, file)); if (bytes.length > 1024 * 1024) continue; try { const item = JSON.parse(bytes); if (validId(item.id) && typeof item.name === "string") result.push(item); } catch { /* Ignore incomplete external metadata. */ } }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  const save = body => exclusive(async () => {
    if (!validId(body?.id) || typeof body.name !== "string" || !body.name.trim() || body.name.length > 80 || /[\x00-\x1f]/.test(body.name)) fail("Name this look using 1-80 characters.");
    if (JSON.stringify(body.settings || {}).length > 512 * 1024) fail("This look contains too much reference data.");
    const existing = await list(), previous = existing.find(item => item.id === body.id);
    if (previous) return previous;
    if (existing.length >= 100) fail("Remove a saved look before adding more than 100.");
    const settings = vectorDesignLook(body.settings || {}), copied = new Map();
    await mkdir(path.join(assetDirectory, body.id), { recursive: true });
    async function copy(value) {
      if (Array.isArray(value)) { for (const item of value) await copy(item); return; }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (/url$/i.test(key) && typeof child === "string" && child) {
          validateOutputUrl(child);
          if (!copied.has(child)) {
            if (copied.size >= 8) fail("Use at most eight saved reference assets.");
            const bytes = await readAsset(child);
            if (bytes.length > 10 * 1024 * 1024) fail("Saved look references must be at most 10 MB each.");
            const image = sharp(bytes, { limitInputPixels: 24000000, failOn: "error" }), info = await image.metadata();
            if (!["png", "jpeg", "webp"].includes(info.format) || info.pages > 1) fail("Use PNG, JPEG or WebP look references.");
            const png = await image.rotate().png().toBuffer(), filename = `${copied.size + 1}.png`;
            if (png.length > 10 * 1024 * 1024) fail("A saved reference is too large after conversion.");
            await writeFile(path.join(assetDirectory, body.id, filename), png, { mode: 0o600 });
            copied.set(child, `${assetUrl}/${body.id}/${filename}`);
          }
          value[key] = copied.get(child);
        } else await copy(child);
      }
    }
    await copy(settings);
    const item = { id: body.id, name: body.name.trim(), settings };
    const target = path.join(directory, `${body.id}.json`), temporary = `${target}.tmp`;
    await writeFile(temporary, JSON.stringify(item), { mode: 0o600 }); await rename(temporary, target); return item;
  });
  const remove = id => exclusive(async () => { if (!validId(id)) fail("Choose a saved look."); await unlink(path.join(directory, `${id}.json`)).catch(error => { if (error.code !== "ENOENT") throw error; }); return { ok: true }; });
  return { list, save, remove };
}
export function registerVectorLookRoutes(app, options, sendError) {
  const store = createVectorLookStore(options);
  app.get("/api/vector-looks", async (_req, res) => { try { res.json({ looks: await store.list() }); } catch (e) { sendError(res, e, "Could not read saved looks."); } });
  app.post("/api/vector-looks", async (req, res) => { try { res.json({ look: await store.save(req.body) }); } catch (e) { sendError(res, e, "Could not save this look."); } });
  app.delete("/api/vector-looks/:id", async (req, res) => { try { res.json(await store.remove(req.params.id)); } catch (e) { sendError(res, e, "Could not remove this look."); } });
}

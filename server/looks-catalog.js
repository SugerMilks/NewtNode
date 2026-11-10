// Adapted from kungfukoi/Newt_Node, ca96ee494f3197ea871d6c33e50fb8f7a7b133fa.
// Read-only compact catalog support; no mirror crawling or source file retirement.
import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { selectLooksPage as selectStyleFinderPage } from "../src/looks.js";

export const curatedStyleFinderPath = /^\/uploads\/stylefinder-overrides\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(?:jpe?g|png|webp)$/i;
const mirrorImagePath = /^img\/.+\.(?:jpe?g|png|webp|html)$/i;
const mimeTypes = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const fail = (message, status = 503) => { throw Object.assign(new Error(message), { status }); };

export function compactStyleFinderBlob(directory, blob) {
  return path.join(directory, "images", blob.slice(0, 2), blob);
}

export function openCompactStyleFinder(directory, manifest, { shared = false } = {}) {
  const { version, styles, details, categories, assets } = manifest;
  if (version !== 1 || !Array.isArray(styles) || !styles.length || styles.length > 50000 ||
      !Array.isArray(categories) || !categories.every(value => typeof value === "string") ||
      !details || !assets || Array.isArray(details) || Array.isArray(assets)) throw Error("Invalid compact catalog");
  const byId = new Map(styles.map(style => [style.id, style]));
  if (byId.size !== styles.length) throw Error("Duplicate compact look ID");
  for (const [id, style] of Object.entries(details)) {
    if (!byId.has(id) || style.id !== id) throw Error("Invalid compact look detail");
  }
  for (const style of [...styles, ...Object.values(details)]) {
    if (!/^[a-z0-9-]{1,100}$/.test(style.id) || typeof style.name !== "string" ||
        !Array.isArray(style.tags) || !style.tags.every(tag => typeof tag === "string") || !Array.isArray(style.examples) || style.examples.length > 8 ||
        (style.prompt != null && typeof style.prompt !== "string")) throw Error("Invalid compact look");
    for (const field of ["category", "notes", "sourceUrl", "sref"]) {
      if (style[field] != null && typeof style[field] !== "string") throw Error("Invalid compact look text");
    }
    if (style.colours != null && (!Array.isArray(style.colours) || !style.colours.every(color => color && typeof color.hex === "string" && (color.name == null || typeof color.name === "string")))) throw Error("Invalid compact look palette");
  }
  for (const [key, blob] of Object.entries(assets)) {
    if ((!mirrorImagePath.test(key) && !curatedStyleFinderPath.test(key)) ||
        key.includes("..") || /[\\:\x00]/.test(key) ||
        !/^[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(blob)) throw Error("Invalid compact image entry");
  }

  async function findAsset(key) {
    if (!Object.hasOwn(assets, key)) return null;
    const blob = assets[key];
    const filename = await realpath(compactStyleFinderBlob(directory, blob));
    const relative = path.relative(directory, filename);
    if (relative !== path.join("images", blob.slice(0, 2), blob) || !(await stat(filename)).isFile()) {
      fail("Invalid compact StyleFinder image.", 404);
    }
    return { filename, mimeType: mimeTypes[path.extname(blob).slice(1)] };
  }

  function sharedStyle(style) {
    // Treat package images as catalog references so saving a Look imports local copies.
    const examples = style.examples.map(image => {
      const url = image?.url;
      const key = image?.localUrl || (typeof url === "string" && url.startsWith("/api/style-library/stylefinder-image?")
        ? new URL(url, "http://localhost").searchParams.get("file") : "");
      if (!key || !Object.hasOwn(assets, key)) return null;
      const { localUrl, ...reference } = image;
      return { ...reference, url: `/api/style-library/stylefinder-image?file=${encodeURIComponent(key)}&v=${assets[key]}` };
    }).filter(Boolean);
    return {
      ...style, examples, previewUrl: examples[0]?.url || style.previewUrl,
      ...(style.similarStyles ? { similarStyles: style.similarStyles.map(sharedStyle) } : {}),
    };
  }

  return {
    search(query) {
      const page = selectStyleFinderPage(styles, query);
      if (shared) page.styles = page.styles.map(sharedStyle);
      return { ...page, ready: true, populating: false, categories };
    },
    detail(id) {
      const style = Object.hasOwn(details, id) ? details[id] : byId.get(id);
      if (!style) fail("This style is not in the local catalog.", 404);
      return { style: shared ? sharedStyle(style) : style };
    },
    async asset(file, version) {
      if (typeof file !== "string" || !(mirrorImagePath.test(file) || (shared && version && curatedStyleFinderPath.test(file))) ||
          file.includes("..") || /[\\:\x00]/.test(file)) {
        fail("Invalid catalog image.", 400);
      }
      if (version !== undefined && (!shared || !Object.hasOwn(assets, file) || assets[file] !== version)) {
        fail("The shared catalog image has changed. Refresh the catalog.", 404);
      }
      return await findAsset(file) || fail("This image is not in the compact catalog.", 404);
    },
    curatedAsset: findAsset,
  };
}

export function createCompactStyleFinderReader(options) {
  let cached;
  return async function readCatalog(directory, { optional = false } = {}) {
    if (typeof directory !== "string" || !path.isAbsolute(directory)) throw Error("Invalid compact catalog path");
    const root = await realpath(directory);
    const filename = path.join(root, "catalog.json");
    const info = await stat(filename).catch(error => {
      if (optional && error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) return null;
    if (await realpath(filename) !== filename) throw Error("Catalog must be inside the selected folder");
    if (!info.isFile() || info.size > 64 * 1024 * 1024) throw Error("Invalid compact catalog file");
    const key = JSON.stringify([root, info.mtimeMs, info.size]);
    if (cached?.key !== key) {
      const catalog = readFile(filename, "utf8").then(value => openCompactStyleFinder(root, JSON.parse(value), options));
      cached = { key, catalog };
      catalog.catch(() => { if (cached?.catalog === catalog) cached = null; });
    }
    return cached.catalog;
  };
}

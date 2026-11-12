import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "./json-store.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validId = value => typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
export const isUserLookId = value => typeof value === "string" && /^user-look-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const cleanName = value => {
  if (typeof value !== "string" || !value.trim() || value.length > 120) fail("Use a name between 1 and 120 characters.");
  return value.trim();
};

// User entries are separate from the read-only source catalog and contain managed asset URLs only.
export function createLooksUserLibrary(directory) {
  const filename = path.join(directory, "user-library.json");
  let queue = Promise.resolve();
  async function read() {
    try {
      const data = JSON.parse(await readFile(filename, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.looks) || data.looks.length > 500 || !Array.isArray(data.collections) || data.collections.length > 100 ||
        data.looks.some(look => !isUserLookId(look?.id) || typeof look.name !== "string" || typeof look.prompt !== "string" || typeof look.category !== "string" || !Array.isArray(look.tags) || !Array.isArray(look.examples)) ||
        data.collections.some(item => !validId(item?.id) || typeof item.name !== "string" || !Array.isArray(item.ids) || item.ids.length > 500 || !item.ids.every(validId)) ||
        new Set(data.looks.map(item => item.id)).size !== data.looks.length || new Set(data.collections.map(item => item.id)).size !== data.collections.length) throw Error("Invalid user library");
      return data;
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, looks: [], collections: [] };
      fail("Your saved Looks library could not be read. No saved looks were changed.", 409);
    }
  }
  const change = action => {
    const next = queue.then(async () => {
      const data = await read(), result = await action(data);
      await writeJsonAtomic(filename, data, { mode: 0o600 });
      return result;
    });
    queue = next.catch(() => {});
    return next;
  };
  return {
    read,
    async summary() {
      const data = await read();
      return { customCount: data.looks.length, categories: [...new Set(data.looks.map(look => look.category))].sort(), collections: data.collections };
    },
    async detail(id) { return (await read()).looks.find(look => look.id === id) || fail("This saved look is no longer available.", 404); },
    create: look => change(data => {
      const previous = data.looks.find(item => item.id === look.id);
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(look)) fail("This look has already been saved with different details. Reopen Create Look to save another version.", 409);
        return previous;
      }
      if (!isUserLookId(look.id) || data.looks.length >= 500) fail("Use up to 500 locally created looks.");
      data.looks.unshift(look);
      return look;
    }),
    remove: id => change(data => {
      if (!isUserLookId(id)) fail("Only your own created looks can be deleted.");
      data.looks = data.looks.filter(look => look.id !== id);
      data.collections.forEach(collection => { collection.ids = collection.ids.filter(value => value !== id); });
      return { removed: id };
    }),
    createCollection: name => change(data => {
      name = cleanName(name);
      if (data.collections.length >= 100) fail("Use up to 100 collections.");
      if (data.collections.some(item => item.name.toLowerCase() === name.toLowerCase())) fail("A collection with that name already exists.", 409);
      const collection = { id: `collection-${randomUUID()}`, name, ids: [] };
      data.collections.push(collection);
      return { collection };
    }),
    updateCollection: (id, { ids, action }) => change(data => {
      const collection = data.collections.find(item => item.id === id);
      if (!collection) fail("Choose an existing collection.", 404);
      if (!["add", "remove"].includes(action) || !Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(validId)) fail("Select up to 500 looks for this collection.");
      const next = action === "add" ? [...new Set([...collection.ids, ...ids])] : collection.ids.filter(value => !ids.includes(value));
      if (next.length > 500) fail("Use up to 500 looks in one collection.");
      collection.ids = next;
      return { collection };
    }),
    removeCollection: id => change(data => {
      if (!validId(id)) fail("Choose an existing collection.");
      data.collections = data.collections.filter(item => item.id !== id);
      return { removed: id };
    })
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeJsonAtomic } from "../server/json-store.js";

test("simultaneous JSON writes use separate temporary files even within one millisecond", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "newtnode-json-test-"));
  try {
    t.mock.method(Date, "now", () => 1700000000000);
    const target = path.join(directory, "index.json");
    const values = Array.from({ length: 8 }, (_, index) => ({ index, text: "x".repeat(index * 100) }));
    const results = await Promise.allSettled(values.map((value) => writeJsonAtomic(target, value)));
    assert.equal(results.filter((result) => result.status === "rejected").length, 0);
    const saved = JSON.parse(await readFile(target, "utf8"));
    assert.deepEqual(saved, values[saved.index]);
    assert.deepEqual(await readdir(directory), ["index.json"]);
  } finally {
    t.mock.restoreAll();
    await rm(directory, { recursive: true, force: true });
  }
});

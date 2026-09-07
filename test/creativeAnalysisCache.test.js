import test from "node:test";
import assert from "node:assert/strict";
import { creativeAnalysisKey, createCreativeAnalysisCache } from "../server/creative-analysis-cache.js";

const input = () => ({ provider: "fal", model: "openai/gpt-6-astra", credential: "mock", instructions: "Describe asset identity only",
  assets: [{ tag: "@Hero", type: "character", mimeType: "image/png", buffer: Buffer.from("original pixels") }] });

test("analysis fingerprints include pixel content, tags, type, instructions, model and active key", () => {
  const original = input(), key = creativeAnalysisKey(original);
  assert.equal(creativeAnalysisKey(input()), key);
  for (const field of ["provider", "model", "credential", "instructions"]) {
    assert.notEqual(creativeAnalysisKey({ ...input(), [field]: "changed" }), key);
  }
  for (const field of ["tag", "type", "mimeType", "buffer"]) {
    const changed = input(); changed.assets[0][field] = field === "buffer" ? Buffer.from("replacement pixels at the SAME URL") : "changed";
    assert.notEqual(creativeAnalysisKey(changed), key);
  }
  assert.equal(key.includes("mock"), false);
});

test("unchanged reference analysis is reused without charging its usage a second time", async () => {
  const reuse = createCreativeAnalysisCache(); let calls = 0;
  const generate = async () => { calls++; return { descriptions: ["@Hero: dark hair"], usages: [{ cost: 0.04 }] }; };
  const first = await reuse("same", generate);
  first.descriptions[0] = "User edit";
  const second = await reuse("same", generate);
  assert.equal(calls, 1);
  assert.deepEqual(second.descriptions, ["@Hero: dark hair"]);
  assert.deepEqual(second.usages, []);
  assert.equal(second.cacheHit, true);
});

test("concurrent requests share one analysis, failed entries are retriable, and storage stays bounded", async () => {
  let release, calls = 0, now = 0;
  const reuse = createCreativeAnalysisCache({ limit: 2, ttlMs: 10, now: () => now });
  const first = reuse("same", async () => { calls++; return new Promise((resolve) => { release = resolve; }); });
  await Promise.resolve();
  const second = reuse("same", () => assert.fail("No duplicate request"));
  release({ descriptions: ["valid"], usages: [{ cost: 0.04 }] });
  assert.equal((await first).usages.length, 1);
  assert.deepEqual((await second).usages, []);
  assert.equal(calls, 1);
  await assert.rejects(reuse("bad", async () => { throw new Error("invalid analysis"); }));
  assert.equal((await reuse("bad", async () => ({ descriptions: ["repaired"], usages: [] }))).descriptions[0], "repaired");
  now = 11;
  assert.equal((await reuse("same", async () => ({ descriptions: ["expired refresh"], usages: [] }))).descriptions[0], "expired refresh");
  await reuse("new", async () => ({ descriptions: [], usages: [] }));
  assert.equal((await reuse("bad", async () => ({ descriptions: ["evicted refresh"], usages: [] }))).descriptions[0], "evicted refresh");
});

test("a shared failed analysis records paid usage only on its initiating request", async () => {
  const reuse = createCreativeAnalysisCache();
  let reject;
  const first = reuse("shared", () => new Promise((_resolve, fail) => { reject = fail; }));
  await Promise.resolve();
  const second = reuse("shared", () => assert.fail("No duplicate request"));
  const ownerError = Object.assign(new Error("Invalid result"), { llmResult: { usage: { cost: 0.04 } }, cost: { amountUsd: 0.04 } });
  reject(ownerError);
  await assert.rejects(first, (error) => error === ownerError);
  await assert.rejects(second, (error) => {
    assert.equal(error.llmResult, undefined);
    assert.equal(error.cost.amountUsd, 0);
    return true;
  });
});

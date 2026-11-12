import test from "node:test";
import assert from "node:assert/strict";
import { createLooksFeed, randomLookOffset } from "../src/useLooksFeed.js";

const batch = (offset, count, total) => ({ styles: Array.from({ length: count }, (_, i) => ({ id: `look-${offset + i}` })), total });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("continuous Looks append in bounded batches and stop at the real end", async () => {
  const calls = [], snapshots = [];
  const feed = createLooksFeed(async request => { calls.push(request); return batch(request.offset, Math.min(48, 101 - request.offset), 101); }, value => snapshots.push(value));
  await feed.reset({ q: "paint" }, "first", true, 0);
  assert.equal(snapshots.at(-1).styles.length, 48);
  await feed.loadMore(); await feed.loadMore(); await feed.loadMore();
  assert.deepEqual(calls.map(item => item.offset), [0, 48, 96]);
  assert.ok(calls.every(item => item.limit === 48 && item.q === "paint"));
  assert.equal(snapshots.at(-1).styles.length, 101); assert.equal(snapshots.at(-1).hasMore, false);
  assert.equal(new Set(snapshots.at(-1).styles.map(item => item.id)).size, 101);
  assert.ok(snapshots.some(item => item.loadingMore && item.styles.length === 48));
  feed.cancel();
});

test("repeated end-of-strip events share a single request", async () => {
  const pending = deferred(), calls = [], snapshots = [];
  const feed = createLooksFeed(request => { calls.push(request); return request.offset ? pending.promise : Promise.resolve(batch(0, 48, 100)); }, value => snapshots.push(value));
  await feed.reset({}, "all", true, 0);
  const first = feed.loadMore(); await feed.loadMore(); await feed.loadMore();
  assert.equal(calls.length, 2);
  pending.resolve(batch(48, 48, 100)); await first;
  assert.equal(snapshots.at(-1).styles.length, 96);
  feed.cancel();
});

test("filter switches cancel stale batches and cannot mix their results", async () => {
  const pending = deferred(), snapshots = [], signals = [];
  const feed = createLooksFeed((request, { signal }) => { signals.push(signal); return request.q === "old" ? pending.promise : Promise.resolve({ styles: [{ id: "new-look" }], total: 1 }); }, value => snapshots.push(value));
  const old = feed.reset({ q: "old" }, "old", true, 0);
  await feed.reset({ q: "new" }, "new", true, 0);
  assert.equal(signals[0].aborted, true);
  const count = snapshots.length; pending.resolve(batch(0, 48, 100)); await old;
  assert.equal(snapshots.length, count); assert.equal(snapshots.at(-1).key, "new");
  assert.deepEqual(snapshots.at(-1).styles.map(item => item.id), ["new-look"]);
  feed.cancel();
});

test("failed continuation preserves loaded looks and waits for explicit retry", async () => {
  let calls = 0, fail = true, state;
  const feed = createLooksFeed(async ({ offset }) => { calls++; if (offset && fail) throw Error("Offline"); return batch(offset, 48, 96); }, value => { state = value; });
  await feed.reset({}, "all", true, 0); await feed.loadMore();
  assert.equal(state.styles.length, 48); assert.equal(state.error, "Offline"); assert.equal(state.loadingMore, false);
  await feed.loadMore(); await feed.loadMore(); assert.equal(calls, 2);
  fail = false; await feed.retry();
  assert.equal(state.error, ""); assert.equal(state.styles.length, 96); assert.equal(calls, 3);
  feed.cancel();
});

test("duplicate IDs never render twice and an empty continuation stops fetching", async () => {
  let calls = 0, state;
  const feed = createLooksFeed(async () => ++calls === 1 ? batch(0, 48, 200) : calls === 2 ? batch(40, 48, 200) : batch(88, 0, 200), value => { state = value; });
  await feed.reset({}, "all", true, 0); await feed.loadMore();
  assert.equal(state.styles.length, 88);
  await feed.loadMore(); await feed.loadMore();
  assert.equal(calls, 3); assert.equal(state.hasMore, false);
  feed.cancel();
});

test("debounced filters and disabled feeds cannot make stray requests after cleanup", async () => {
  let calls = 0, state;
  const feed = createLooksFeed(async () => { calls++; return batch(0, 1, 1); }, value => { state = value; });
  feed.reset({}, "all", true, 10); feed.cancel();
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(calls, 0);
  await feed.reset({}, "off", false, 0); await feed.loadMore(); await feed.retry();
  assert.equal(calls, 0); assert.equal(state.loading, false);
  feed.cancel();
});

test("random section selection is bounded and avoids the previous section when possible", () => {
  for (const total of [0, 1, 20, 48]) assert.equal(randomLookOffset(total, -1, () => .9), 0);
  assert.equal(randomLookOffset(101, -1, () => 0), 0);
  assert.equal(randomLookOffset(101, -1, () => .5), 48);
  assert.equal(randomLookOffset(101, -1, () => .999), 53);
  for (const previous of [0, 48, 53]) for (const roll of [0, .2, .5, .999]) {
    const offset = randomLookOffset(101, previous, () => roll);
    assert.ok(offset >= 0 && offset <= 53); assert.notEqual(offset, previous);
  }
});

test("random discovery starts across the whole catalog and visits every look exactly once", async () => {
  for (const [total, roll, expected] of [[137, .5, 48], [101, .999, 53], [20, .5, 0], [0, .9, 0]]) {
    const calls = [], snapshots = [];
    const feed = createLooksFeed(async request => { calls.push(request); return batch(request.offset, Math.min(request.limit, total - request.offset), total); }, value => snapshots.push(value), () => roll);
    await feed.reset({}, "discovery", true, 0, { randomStart: true });
    let state = snapshots.at(-1);
    assert.equal(state.startOffset, expected);
    assert.equal(state.styles[0]?.id, total ? `look-${expected}` : undefined);
    assert.ok(calls.length <= 2, "Never fetch all preceding pages to choose the start");
    for (let i = 0; state.hasMore && i < 10; i++) { await feed.loadMore(); state = snapshots.at(-1); }
    assert.equal(state.hasMore, false); assert.equal(state.styles.length, total);
    assert.deepEqual(state.styles.map(look => look.id), [...batch(expected, total - expected, total).styles, ...batch(0, expected, total).styles].map(look => look.id));
    assert.ok(calls.every(request => request.limit > 0 && request.limit <= 48));
    const count = calls.length; await feed.loadMore(); assert.equal(calls.length, count);
    if (expected) assert.ok(snapshots.some(item => item.loadingMore && item.styles.length > 0), "Wrapped continuation stays a loading-more state");
    feed.cancel();
  }
});

test("new discovery visits pick fresh starts while ordinary filtered sessions still start at zero", async () => {
  let state;
  const feed = createLooksFeed(async ({ offset, limit }) => batch(offset, Math.min(limit, 240 - offset), 240), value => { state = value; }, () => .5);
  await feed.reset({}, "visit-1", true, 0, { randomStart: true }); const first = state.startOffset;
  await feed.reset({ q: "paint" }, "search", true, 0); assert.equal(state.startOffset, 0);
  await feed.reset({}, "visit-2", true, 0, { randomStart: true }); assert.notEqual(state.startOffset, first);
  feed.cancel();
});

test("failed random start retries the same section without choosing again or publishing the first page", async () => {
  let state, fail = true, rolls = 0; const calls = [];
  const feed = createLooksFeed(async request => { calls.push(request.offset); if (request.offset && fail) throw Error("Offline"); return batch(request.offset, Math.min(request.limit, 200 - request.offset), 200); }, value => { state = value; }, () => { rolls++; return .5; });
  await feed.reset({}, "visit", true, 0, { randomStart: true });
  assert.equal(state.styles.length, 0); assert.equal(state.error, "Offline"); const start = state.startOffset;
  await feed.loadMore(); assert.equal(calls.length, 2);
  fail = false; await feed.retry();
  assert.deepEqual(calls, [0, start, start]); assert.equal(rolls, 1);
  assert.equal(state.error, ""); assert.equal(state.styles[0].id, `look-${start}`);
  feed.cancel();
});

test("failed wrapped continuation retains existing images and retries offset zero once", async () => {
  let state, fail = true; const calls = [];
  const feed = createLooksFeed(async request => {
    calls.push(request.offset);
    if (request.offset === 0 && calls.length > 2 && fail) throw Error("Offline");
    return batch(request.offset, Math.min(request.limit, 101 - request.offset), 101);
  }, value => { state = value; }, () => .999);
  await feed.reset({}, "visit", true, 0, { randomStart: true });
  const ids = state.styles.map(item => item.id);
  await feed.loadMore(); await feed.loadMore();
  assert.deepEqual(calls, [0, 53, 0]); assert.deepEqual(state.styles.map(item => item.id), ids);
  fail = false; await feed.retry(); await feed.loadMore();
  assert.deepEqual(calls, [0, 53, 0, 0, 48]); assert.equal(state.styles.length, 101); assert.equal(state.hasMore, false);
  feed.cancel();
});

test("switching filters during random count lookup cannot fetch or publish a stale random section", async () => {
  const pending = deferred(), calls = []; let state;
  const feed = createLooksFeed(request => { calls.push(request); return request.q ? Promise.resolve(batch(0, 1, 1)) : pending.promise; }, value => { state = value; }, () => .5);
  const old = feed.reset({}, "old", true, 0, { randomStart: true });
  await feed.reset({ q: "new" }, "new", true, 0);
  pending.resolve(batch(0, 48, 400)); await old;
  assert.equal(state.key, "new"); assert.equal(state.styles.length, 1); assert.equal(calls.length, 2);
  feed.cancel();
});

test("a catalog that shrinks before the random page loads falls back once to available looks", async () => {
  let state; const calls = [];
  const feed = createLooksFeed(async ({ offset }) => { calls.push(offset); return calls.length === 1 ? batch(0, 48, 200) : offset ? batch(offset, 0, 3) : batch(0, 3, 3); }, value => { state = value; }, () => .5);
  await feed.reset({}, "visit", true, 0, { randomStart: true });
  assert.deepEqual(calls, [0, 96, 0]); assert.equal(state.styles.length, 3); assert.equal(state.startOffset, 0); assert.equal(state.hasMore, false);
  feed.cancel();
});

test("unified feed retains available-source notices and totals, and clears them when changing scope", async () => {
  let state;
  const feed = createLooksFeed(async ({ source, offset }) => ({ ...batch(offset, 1, 2), indexed: 90, categories: ["Cinema", "Illustration"], warnings: source === "all" ? ["Shared folder unavailable"] : [] }), value => { state = value; });
  await feed.reset({ source: "all", q: "paint" }, "all", true, 0);
  assert.equal(state.indexed, 90); assert.equal(state.total, 2);
  assert.deepEqual(state.categories, ["Cinema", "Illustration"]); assert.deepEqual(state.warnings, ["Shared folder unavailable"]);
  await feed.loadMore(); assert.equal(state.styles.length, 2); assert.equal(state.warnings.length, 1);
  await feed.reset({ source: "custom" }, "custom", true, 0);
  assert.deepEqual(state.warnings, []); feed.cancel();
});

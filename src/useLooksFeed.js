import React from "react";
import { looksApi } from "./api/newtApi.js";

const batchSize = 48;
const empty = key => ({ key, styles: [], categories: [], warnings: [], indexed: 0, total: 0, startOffset: 0, loading: false, loadingMore: false, hasMore: false, error: "" });

export function randomLookOffset(total, previous = -1, random = Math.random) {
  const last = Math.max(0, Math.trunc(total) - batchSize), sections = Math.ceil(last / batchSize) + 1;
  if (sections === 1) return 0;
  const previousSection = previous === last ? sections - 1 : previous >= 0 && previous % batchSize === 0 && previous < last ? previous / batchSize : -1;
  const choices = sections - (previousSection >= 0 ? 1 : 0);
  let section = Math.max(0, Math.min(choices - 1, Math.floor(random() * choices)));
  if (previousSection >= 0 && section >= previousSection) section++;
  return Math.min(section * batchSize, last);
}

// One request at a time, with a separate session for each filter so late replies cannot mix catalogs.
export function createLooksFeed(search, publish, random = Math.random) {
  let session, timer, lastRandomOffset = -1;
  const current = value => session === value && !value.controller.signal.aborted;
  function emit(value) {
    if (current(value)) publish({ key: value.key, styles: value.styles, categories: value.categories || [], warnings: value.warnings || [], indexed: value.indexed || 0, total: value.total, startOffset: value.startOffset, hasMore: value.hasMore,
      loading: value.busy && !value.styles.length, loadingMore: value.busy && value.styles.length > 0, error: value.error });
  }
  function validate(data) {
    if (!Array.isArray(data?.styles) || !Number.isSafeInteger(data.total) || data.total < 0) throw Error("The Looks response was incomplete. Try loading again.");
    return data;
  }
  async function fetchNext(value, retry = false) {
    if (!current(value) || value.busy || !value.hasMore || (value.error && !retry)) return;
    value.started = true; value.busy = true; value.error = ""; emit(value);
    try {
      let data;
      if (value.randomPending) {
        data = validate(await search({ ...value.params, offset: 0, limit: batchSize }, { signal: value.controller.signal }));
        if (!current(value)) return;
        value.startOffset = randomLookOffset(data.total, lastRandomOffset, random);
        value.offset = value.startOffset; value.randomPending = false;
        lastRandomOffset = value.startOffset;
        if (value.offset) data = null;
      }
      const limit = value.wrapped ? Math.min(batchSize, value.startOffset - value.offset) : batchSize;
      data ||= validate(await search({ ...value.params, offset: value.offset, limit }, { signal: value.controller.signal }));
      if (!current(value)) return;
      // A catalog can shrink between the count lookup and the random page read.
      if (!value.styles.length && value.offset && !data.styles.length) {
        value.startOffset = 0; value.offset = 0;
        data = validate(await search({ ...value.params, offset: 0, limit: batchSize }, { signal: value.controller.signal }));
        if (!current(value)) return;
      }
      const seen = new Set(value.styles.map(look => look.id));
      value.styles = [...value.styles, ...data.styles.filter(look => { if (!look?.id || seen.has(look.id)) return false; seen.add(look.id); return true; })];
      value.offset += data.styles.length;
      value.total = data.total;
      value.indexed = Number.isSafeInteger(data.indexed) && data.indexed >= 0 ? data.indexed : data.total;
      value.categories = Array.isArray(data.categories) ? data.categories.filter(item => typeof item === "string") : [];
      value.warnings = Array.isArray(data.warnings) ? data.warnings.filter(item => typeof item === "string") : [];
      if (data.styles.length && value.offset >= data.total && value.startOffset > 0 && !value.wrapped) {
        // Continue through the earlier section once, so a random start never hides looks.
        value.offset = 0; value.wrapped = true; value.hasMore = true;
      } else value.hasMore = data.styles.length > 0 && value.offset < (value.wrapped ? Math.min(value.startOffset, data.total) : data.total);
    } catch (error) { if (current(value)) value.error = error.message || "Could not load more looks."; }
    finally { value.busy = false; emit(value); }
  }
  function cancel() { clearTimeout(timer); session?.controller.abort(); session = null; }
  return {
    reset(params, key, enabled, delay = 200, { randomStart = false } = {}) {
      cancel();
      session = { params, key, controller: new AbortController(), styles: [], total: 0, offset: 0, startOffset: 0, wrapped: false, randomPending: randomStart, busy: false, started: false, hasMore: enabled, error: "" };
      publish({ ...empty(key), loading: enabled });
      if (!enabled) return;
      const value = session;
      if (!delay) return fetchNext(value);
      timer = setTimeout(() => fetchNext(value), delay);
    },
    loadMore: () => session?.started ? fetchNext(session) : undefined,
    retry: () => session ? fetchNext(session, true) : undefined,
    cancel
  };
}

export default function useLooksFeed(params, enabled, version, { randomStart = false } = {}) {
  const key = JSON.stringify([params, enabled, version, randomStart]);
  const [state, setState] = React.useState(() => empty(key));
  const feed = React.useMemo(() => createLooksFeed(looksApi.search, setState), []);
  React.useEffect(() => { feed.reset(params, key, enabled, 200, { randomStart }); return feed.cancel; }, [key, feed]);
  return { ...(state.key === key ? state : { ...empty(key), loading: enabled }), loadMore: feed.loadMore, retry: feed.retry };
}

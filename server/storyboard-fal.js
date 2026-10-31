import { setTimeout as delay } from "node:timers/promises";
import { createSingleSubmissionFalClient } from "./fal-single-submission.js";

function connectionFailure(error) {
  const seen = new Set();
  for (let cause = error; cause && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (["AbortError", "TimeoutError"].includes(cause.name)) return false;
    if (cause.name === "TypeError" && /^(fetch failed|failed to fetch|network error)$/i.test(cause.message)) return true;
    if (["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(cause.code)) return true;
  }
  return false;
}

export function createStoryboardFalClient({ credentials, endpoint, model }, { fetchImpl = fetch, wait = delay } = {}) {
  const client = createSingleSubmissionFalClient({ credentials, endpoint, model: "Storyboard" }, fetchImpl);
  return { ...client, async subscribe(id, options = {}) {
    let requestId = "", failure;
    try {
      return await client.subscribe(id, { ...options, onEnqueue: value => {
        requestId = value;
        options.onEnqueue?.(value);
      } });
    } catch (error) { failure = error; }

    // A lost status/result GET is not a failed generation. Reattach only to
    // the acknowledged request; never call subscribe/submit again.
    for (const milliseconds of [1000, 2000, 4000]) {
      if (!requestId || !connectionFailure(failure) || options.abortSignal?.aborted || options.timeout) break;
      await wait(milliseconds, undefined, { signal: options.abortSignal });
      try {
        await client.queue.subscribeToStatus(id, { requestId, mode: "polling", logs: options.logs,
          pollInterval: options.pollInterval, onQueueUpdate: options.onQueueUpdate, abortSignal: options.abortSignal });
        return await client.queue.result(id, { requestId, abortSignal: options.abortSignal });
      } catch (error) { failure = error; }
    }
    if (!connectionFailure(failure) || options.abortSignal?.aborted) throw failure;
    const message = requestId
      ? `Lost the connection to Fal while checking Storyboard request ${requestId}. It may still finish and be billed. Check Fal history before planning again; NewtNode did not resubmit it.`
      : "Fal could not confirm the Storyboard submission. It may have been billed. Check Fal history before trying again; NewtNode did not resubmit it.";
    throw Object.assign(new Error(message, { cause: failure }), { status: 502, requestId,
      llmResult: { provider: "fal", model, endpoint, text: "", usage: null } });
  } };
}

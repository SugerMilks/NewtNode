import { createFalClient } from "@fal-ai/client";

export function createSingleSubmissionFalClient({ credentials, endpoint, model }, fetchImpl = fetch) {
  let submitted = false;
  const operation = endpoint.endsWith("/edit") ? "edit" : "generation";
  // The SDK may retry queue submissions even with maxRetries: 0. Guard only
  // paid POSTs; read-only polling remains retryable.
  return createFalClient({ credentials, retry: { maxRetries: 0 }, fetch: async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = String(init.method || input?.method || "GET").toUpperCase();
    const paidSubmission = method === "POST" && url.hostname === "queue.fal.run" && url.pathname.replace(/\/$/, "") === `/${endpoint}`;
    if (paidSubmission) {
      if (submitted) throw Object.assign(new Error(`${model} submission could not be confirmed. Check Fal history before rerunning; NewtNode did not resubmit the ${operation}.`), { status: 502 });
      submitted = true;
    }
    try { return await fetchImpl(input, init); }
    catch (error) {
      if (!paidSubmission) throw error;
      throw Object.assign(new Error(`${model} submission could not be confirmed. Check Fal history before rerunning. ${error.message}`), { status: 502, cause: error });
    }
  } });
}

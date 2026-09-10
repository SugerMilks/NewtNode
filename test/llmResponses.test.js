import test from "node:test";
import assert from "node:assert/strict";
import { llmResponseBody, llmResponseEndpoints, llmResponseModel, llmUsageCost, requestLlmResponse } from "../server/llm-responses.js";

const body = { model: "gpt-6-astra", input: "Return JSON", instructions: "Keep the scene intact", reasoning: { effort: "high" }, text: { format: { type: "json_object" } }, max_output_tokens: 8000, store: false };

for (const provider of ["openai", "fal", "atlas"]) test(`${provider} sends exactly one Responses request with its own captured key`, async () => {
  let calls = 0;
  const result = await requestLlmResponse(body, { provider, key: "captured-key" }, { request: async (url, options) => {
    calls++;
    assert.equal(url, llmResponseEndpoints[provider]);
    assert.equal(options.headers.Authorization, `${provider === "fal" ? "Key" : "Bearer"} captured-key`);
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, provider === "openai" ? body.model : `openai/${body.model}`);
    assert.deepEqual(payload.reasoning, body.reasoning);
    assert.deepEqual(payload.text, body.text);
    assert.equal(payload.max_output_tokens, 8000);
    assert.equal(payload.stream, false);
    return { ok: true, status: 200, json: async () => ({ status: "completed", output: [] }) };
  } });
  assert.equal(result.status, "completed");
  assert.equal(calls, 1);
});

test("Fal Responses can use the existing logged subscription with a fixed credential", async () => {
  const result = await requestLlmResponse(body, { provider: "fal", key: "fal-key" }, {
    request: () => { throw new Error("No second transport"); },
    falRequest: async (input, key) => {
      assert.equal(key, "fal-key"); assert.equal(input.model, "openai/gpt-6-astra");
      return { data: { output: [], usage: { cost: 0.012 } } };
    }
  });
  assert.equal(result.usage.cost, 0.012);
});

test("gateway conversations keep tool pairs but omit provider-owned state and encrypted reasoning", () => {
  const original = { ...body, include: ["reasoning.encrypted_content"], previous_response_id: "old-response", input: [
    { type: "reasoning", encrypted_content: "private" },
    { type: "function_call", id: "provider-id", call_id: "call-1", name: "project_action", arguments: "{}" },
    { type: "function_call_output", call_id: "call-1", output: "done" }
  ], tools: [{ type: "function", name: "project_action", parameters: { type: "object" } }], parallel_tool_calls: false };
  for (const provider of ["fal", "atlas"]) {
    const converted = llmResponseBody(provider, original);
    assert.equal(converted.include, undefined);
    assert.equal(converted.previous_response_id, undefined);
    assert.equal(converted.input.length, 2);
    assert.equal(converted.input[0].id, undefined);
    assert.equal(converted.input[0].call_id, converted.input[1].call_id);
    assert.deepEqual(converted.tools, original.tools);
  }
  assert.equal(original.input.length, 3);
  assert.equal(llmResponseBody("openai", original).include[0], "reasoning.encrypted_content");
});

test("HTTP failures, HTML gateways and uncertain network failures never trigger paid replay", async () => {
  for (const failure of [400, 401, 403, 404, 422, 429, 500, 524, "html", "network"]) {
    let calls = 0;
    await assert.rejects(requestLlmResponse(body, { provider: "atlas", key: "test" }, { request: async () => {
      calls++;
      if (failure === "network") throw new Error("Network interrupted");
      return { ok: failure === "html", status: typeof failure === "number" ? failure : 200, json: async () => {
        if (failure === "html") throw new SyntaxError("<!DOCTYPE html>");
        return { error: { message: "Provider unavailable" } };
      } };
    } }), error => {
      assert.doesNotMatch(error.message, /<!DOCTYPE|\[object Object\]/);
      if (failure !== "network") assert.match(error.message, /Atlas Cloud.*No automatic retry/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("missing credentials and unsupported providers fail before any network request", async () => {
  for (const connection of [{ provider: "krea", key: "krea-key" }, { provider: "atlas", key: "" }]) {
    await assert.rejects(requestLlmResponse(body, connection, { request: () => { assert.fail("No network expected"); } }), /enabled compatible/);
  }
  assert.throws(() => llmResponseModel("atlas", "google/gemini"), /OpenAI model/);
  assert.equal(llmResponseModel("atlas", "openai/gpt-6-astra"), "openai/gpt-6-astra");
});

test("Atlas uses published rates and reported charges, not guessed free usage or direct-provider overrides", () => {
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", { input_tokens: 1000, output_tokens: 100 }), 0.015);
  assert.equal(llmUsageCost("atlas", "gpt-5.6-luna", { prompt_tokens: 1000, completion_tokens: 100 }), 0.00032);
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", { input_tokens: 1000, output_tokens: 100, cost: 0.02 }), 0.02);
  assert.equal(llmUsageCost("atlas", "unknown", { input_tokens: 1000, output_tokens: 100 }), null);
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", null), null);
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", { input_tokens: null, output_tokens: 100 }), null);
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", { cost: "" }), null);
  assert.equal(llmUsageCost("fal", "gpt-6-astra", { input_tokens: 1000, output_tokens: 100 }), null);
  assert.equal(llmUsageCost("fal", "gpt-6-astra", { cost: 0 }), 0);
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", { input_tokens: 272000, output_tokens: 100 }), 5.4475);
});

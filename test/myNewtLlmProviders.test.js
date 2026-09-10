import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MyNewtService } from "../server/my-newt.js";
import { atlasLlmRates, llmResponseEndpoints, requestLlmResponse } from "../server/llm-responses.js";
import { myNewtConversation } from "../src/myNewt/context.js";

const owner = { projectId: "gateway-project", nodeId: "newt" };
const snapshot = { ...owner, projectName: "Test", nodes: [{ id: "newt", type: "myNewt", data: {} }], edges: [], catalog: [] };
const response = (operation = "ask", usage = { input_tokens: 100, output_tokens: 100, cost: 0.006 }) => ({
  status: "completed", usage, output: [{ type: "function_call", call_id: "call-1", name: "project_action", arguments: JSON.stringify({ operation, payload: JSON.stringify({ message: "Ready" }), reason: "Test" }) }]
});

async function settle(service) {
  for (let i = 0; i < 300; i++) {
    if (!service.loops.size) { await Promise.all([...service.queues.values()]); return; }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Agent did not settle");
}
async function fixture(t, options) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-gateway-"));
  const service = new MyNewtService({ directory, getKey: () => "", ...options });
  await service.ready;
  t.after(async () => { await settle(service); await rm(directory, { recursive: true, force: true }); });
  return { service, directory, start: async (settings = {}) => {
    const initial = await service.start({ ...owner, snapshot, brief: "Plan a cinematic scene", settings });
    await settle(service); return service.jobs.get(initial.id);
  } };
}

for (const provider of ["fal", "atlas"]) test(`Newt can plan with ${provider} alone and retains provider billing without persisting keys`, async (t) => {
  const receipts = [];
  let calls = 0;
  const { service, directory, start } = await fixture(t, {
    getLlmConnection: () => ({ provider, key: "private-gateway-key", endpoint: llmResponseEndpoints[provider], ...(provider === "atlas" ? { rates: atlasLlmRates } : {}) }),
    invoke: async (body, key, connection) => requestLlmResponse(body, connection, { request: async (url, options) => {
      calls++;
      assert.equal(key, "private-gateway-key"); assert.equal(url, llmResponseEndpoints[provider]);
      const input = JSON.parse(options.body);
      assert.equal(input.model, "openai/gpt-6-astra");
      assert.equal(input.reasoning.effort, "high");
      assert.equal(input.tools[0].name, "project_action");
      assert.equal(input.include, undefined);
      return { ok: true, json: async () => response() };
    } }),
    recordUsage: async value => receipts.push(value)
  });
  const job = await start();
  assert.equal(calls, 1); assert.equal(job.status, "waiting"); assert.equal(job.spent, 0.006);
  assert.equal(Object.keys(job.reservations).length, 0);
  assert.equal(receipts[0].provider, provider); assert.equal(receipts[0].endpoint, llmResponseEndpoints[provider]);
  assert.doesNotMatch(JSON.stringify(service.public(job)), /private-gateway-key/);
  assert.doesNotMatch(await readFile(path.join(directory, `${job.id}.json`), "utf8"), /private-gateway-key/);
});

test("gateway failure pauses Newt with an uncertain reservation and never changes provider or replays", async (t) => {
  let calls = 0;
  const { start } = await fixture(t, {
    getLlmConnection: () => ({ provider: "atlas", key: "atlas-only", rates: atlasLlmRates }),
    invoke: async () => { calls++; throw new Error("Atlas timed out. Check provider history."); }
  });
  const job = await start();
  assert.equal(job.status, "paused"); assert.equal(calls, 1);
  assert.equal(Object.values(job.reservations)[0].state, "uncertain");
});

test("missing provider credentials and insufficient budget stop before a paid request", async (t) => {
  let calls = 0;
  const unavailable = await fixture(t, { getLlmConnection: () => ({ provider: "atlas", key: "" }), invoke: () => { calls++; } });
  await assert.rejects(unavailable.start(), /API key/);
  const limited = await fixture(t, { getLlmConnection: () => ({ provider: "atlas", key: "key", rates: atlasLlmRates }), invoke: () => { calls++; } });
  const job = await limited.start({ budget: 0.01 });
  assert.equal(job.status, "paused"); assert.match(job.message, /budget/); assert.equal(calls, 0);
  assert.equal(Object.keys(job.reservations).length, 0);
});

test("Economy keeps Luna and unknown Fal charges remain reserved, not free", async (t) => {
  const { start } = await fixture(t, {
    getLlmConnection: () => ({ provider: "fal", key: "fal-only" }),
    invoke: async body => { assert.equal(body.model, "gpt-5.6-luna"); return response("ask", { input_tokens: 100, output_tokens: 100 }); }
  });
  const job = await start({ reasoningMode: "economy" });
  assert.equal(job.status, "waiting"); assert.equal(job.spent, 0);
  assert.equal(Object.values(job.reservations)[0].state, "uncertain");
});

test("changing the selected provider clears incompatible reasoning and item IDs but preserves tool results", () => {
  const messages = [{ type: "reasoning", encrypted_content: "provider-owned" },
    { type: "function_call", id: "old-item", call_id: "pair", name: "project_action", arguments: "{}" },
    { type: "function_call_output", call_id: "pair", output: "done" }];
  const portable = myNewtConversation(messages, { modelChanged: true });
  assert.equal(portable.length, 2); assert.equal(portable[0].id, undefined);
  assert.equal(portable[0].call_id, portable[1].call_id);
});

test("Atlas-only audio inspection never sends an Atlas key to OpenAI transcription", async (t) => {
  const audioSnapshot = { ...snapshot, nodes: [...snapshot.nodes, { id: "audio", type: "audio", data: { sourceUrl: "/uploads/voice.mp3" } }] };
  let calls = 0, inspected = false;
  const { service } = await fixture(t, {
    getLlmConnection: () => ({ provider: "atlas", key: "atlas-only", rates: atlasLlmRates }),
    inspectAsset: async () => { inspected = true; },
    invoke: async () => {
      calls++;
      return { ...response(), output: [{ type: "function_call", call_id: "inspect", name: "project_action", arguments: JSON.stringify({ operation: "inspect", payload: JSON.stringify({ url: "/uploads/voice.mp3" }), reason: "Inspect audio" }) }] };
    }
  });
  const initial = await service.start({ ...owner, snapshot: audioSnapshot, brief: "Analyze the audio performance", settings: { allowMediaInspection: true } });
  await settle(service);
  const job = service.jobs.get(initial.id);
  assert.equal(calls, 1); assert.equal(inspected, false); assert.equal(job.status, "paused");
  assert.match(job.message, /OpenAI transcription key/);
  assert.equal(Object.keys(job.reservations).length, 0);
});

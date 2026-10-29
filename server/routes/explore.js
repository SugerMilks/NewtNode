import { randomUUID } from "node:crypto";
import { exploreRequest, explorePlanningPrompt, explorePlanningInstructions, validateExplorePlan, exploreMaxDirections } from "../../src/explore.js";
import { creativeOpenAiModel, creativeFalModel, creativeFinalOutputText, validateCreativeResponse } from "../creative-llm.js";

export function registerExploreRoutes(app, { runTextLlm, runMediaDescriptionLlm, recordHistory, estimateCost }) {
  let active = 0;
  app.post("/api/node/explore-plan", async (req, res) => {
    if (active >= 2) return res.status(429).json({ error: "Two Explore plans are already running. Wait for one to finish." });
    active++;
    let result;
    const body = req.body || {};
    const record = async (error = "") => {
      if (!result) return;
      await recordHistory({ id: randomUUID(), createdAt: new Date().toISOString(), mediaType: "text",
        provider: result.provider, modelName: result.model, endpoint: result.endpoint, mode: "Explore art direction",
        prompt: body.prompt, text: error ? "" : result.text, error,
        project: { id: body.projectId || "node-workspace", name: body.projectName || body.workflowName || "Node workspace" },
        node: { id: body.nodeId, title: body.nodeTitle || "Explore" },
        settings: { creativeTask: body.creativeTask, action: body.action, directions: body.count,
          styleFamily: body.styleFamily, gradePreset: body.gradePreset, exploreMode: body.exploreMode, directionLooks: body.directionLooks, directionBriefs: body.directionBriefs },
        cost: estimateCost({ provider: result.provider, usage: result.usage, helperUsages: result.usages,
          hasMainRequest: Object.hasOwn(result, "usage") }) });
    };
    try {
      if (!Array.isArray(body.references) || !Array.isArray(body.parents)) throw new Error("Explore references must be lists.");
      if (!Number.isInteger(body.count) || body.count < 1 || body.count > exploreMaxDirections) throw new Error(`Explore requires between 1 and ${exploreMaxDirections} directions.`);
      const request = exploreRequest({ data: { ...body, directionCount: body.count, variations: 1, exploreDirections: body.previousDirections },
        prompt: body.prompt, references: body.references, parents: body.parents, style: body.connectedStyle ?? body.style,
        camera: body.camera, action: body.action, note: body.note, directionLooks: body.directionLooks, directionBriefs: body.directionBriefs });
      if (!["explore", "push", "refine", "combine"].includes(request.action)) throw new Error("This action does not require a new plan.");
      const inputs = [...request.references, ...request.parents.map(item => ({ ...item, role: "direction" }))];
      if (inputs.some(item => !["product", "character", "mood", "direction"].includes(item.role) || typeof item.url !== "string" || !/^\/(?:uploads|outputs|workflow-assets|saved_workflows)\//.test(item.url) || item.url.includes(".."))) {
        throw new Error("Explore requires managed local image references with an explicit role.");
      }
      const options = { prompt: explorePlanningPrompt(request), systemPrompt: explorePlanningInstructions,
        falModel: creativeFalModel, openAiModel: creativeOpenAiModel, responseMimeType: "application/json", reasoningEffort: "medium", route: "explore-plan" };
      result = inputs.length
        ? await runMediaDescriptionLlm({ ...options, inputs: inputs.map(item => ({ url: item.url, label: `${item.role}: ${item.label || "reference"}` })), mediaType: "image" })
        : await runTextLlm(options);
      const plan = validateExplorePlan(validateCreativeResponse({}, { ...result, route: "explore-plan", text: creativeFinalOutputText(result.text) }), request.count);
      result.text = JSON.stringify(plan);
      let warning = "";
      try { await record(); } catch { warning = "Plan created, but its usage could not be added to History."; }
      res.json({ ...plan, model: result.model, warning });
    } catch (error) {
      result ||= error.llmResult;
      try { await record(error.message); } catch { /* Preserve the original failure. */ }
      res.status(400).json({ error: /^Explore\b/.test(error.message) ? error.message : `Explore: ${error.message}` });
    } finally { active--; }
  });
}

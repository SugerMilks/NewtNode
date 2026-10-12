import { nodeApi } from "../api/newtApi.js";
import { workflowContextPayload } from "../workflowContext.js";
import { normalizeExploreData, exploreRequest, exploreDirectionRequest, validateExplorePlan, exploreImagePrompt, exploreSelectionPatch, exploreMaxDirections } from "../explore.js";
import { appendedNodeResultState } from "../nodeRunner.js";
import { runImageModelGeneration } from "./mediaModels.js";

export async function runExploreGeneration({ node, prompt, references, style, camera, workflowContext,
  update, shouldStop = () => false, plan = nodeApi.planExplore, generate = runImageModelGeneration }) {
  const data = normalizeExploreData(node.data);
  const action = node.data.exploreAction || "explore";
  const parents = (node.data.exploreParentIndexes || []).map(index => data.resultItems[index]).filter(Boolean);
  let queue = data.exploreQueue.map(item => ({ ...item }));
  let directions = [...data.exploreDirections];
  let results = [...data.resultItems];
  let warning = "";
  const initialCount = results.length;
  if (action === "retry" && queue.length > exploreMaxDirections) throw new Error(`Explore supports resuming batches of up to ${exploreMaxDirections} images.`);
  if (action === "retry" && queue.some(item => ["running", "uncertain"].includes(item.status))) throw new Error("Check interrupted requests in History and with the provider first. Explore will not automatically repeat them.");
  if (action !== "retry") {
    const request = exploreRequest({ data, prompt, references, style, camera, action, parents, note: data.exploreNote });
    let planned;
    if (action === "more") {
      if (!parents[0]?.direction?.prompt) throw new Error("This result has no saved direction. Start a new exploration.");
      planned = [parents[0].direction];
    } else {
      update({ exploreProgress: "Developing art directions..." });
      const response = await plan({ ...request, ...workflowContextPayload(workflowContext), nodeId: node.id, nodeTitle: data.title });
      planned = validateExplorePlan(response, request.count).directions;
      warning = response.warning || "";
    }
    const batchId = crypto.randomUUID();
    planned = planned.map((direction, index) => ({ ...direction, id: `${batchId}:${index}`, parentUrls: parents.map(item => item.url) }));
    directions.push(...planned);
    queue = planned.flatMap((direction, index) => {
      const resolved = exploreDirectionRequest(request, index);
      return Array.from({ length: data.variations }, (_, variation) => ({
        id: `${direction.id}:${variation}`, direction, variation, request: resolved, status: "pending",
        settings: { model: data.model, resolution: data.resolution, aspectRatio: data.aspectRatio, quality: data.quality, background: data.background,
          styleFamily: resolved.styleFamily, gradePreset: resolved.gradePreset, exploreMode: resolved.exploreMode }
      }));
    });
    update({ exploreDirections: directions, exploreQueue: queue });
  }
  const eligible = queue.filter(item => ["pending", "failed"].includes(item.status));
  if (!eligible.length) throw new Error("No unfinished images are safe to resume. An interrupted request must be checked in History and with the provider before starting another run.");
  let completed = 0;
  for (const item of eligible) {
    if (shouldStop()) break;
    item.status = "running";
    item.error = "";
    update({ exploreQueue: queue.map(value => ({ ...value })), exploreProgress: `Generating ${completed + 1} of ${eligible.length}: ${item.direction.name}` });
    try {
      const imagePromptItems = [...item.request.references, ...item.request.parents.map(parent => ({ ...parent, role: "direction" }))]
        .map((reference, index) => ({ url: reference.url, label: `${index + 1}. ${reference.role}: ${reference.label || "reference"}` }));
      const generated = await generate({ node: { ...node, data: { ...data, ...item.settings } },
        prompt: exploreImagePrompt(item.request, item.direction, item.variation), aspectRatio: item.settings.aspectRatio,
        imagePromptItems, workflowContext, index: completed });
      if (!Array.isArray(generated) || !generated.length || generated.some(result => !result?.url)) throw new Error("The provider returned no usable image. Check provider History before rerunning.");
      const hasVariations = queue.some(other => other.direction.id === item.direction.id && other.variation > 0);
      const newItems = generated.map(result => ({ ...result, label: `${item.direction.name}${hasVariations ? ` ${item.variation + 1}` : ""}`,
        direction: item.direction, exploreQueueId: item.id, prompt: exploreImagePrompt(item.request, item.direction, item.variation),
        exploreSettings: item.settings }));
      results = appendedNodeResultState(results, newItems, "image").resultItems;
      item.status = "complete";
      update({ resultItems: results, ...exploreSelectionPatch({ resultItems: results }, initialCount), exploreQueue: queue.map(value => ({ ...value })) });
    } catch (error) {
      item.error = error.message;
      item.status = /interrupted|may still|check.*history|no usable image/i.test(error.message) ? "uncertain" : "failed";
      update({ exploreQueue: queue.map(value => ({ ...value })) });
      if (item.status === "uncertain") break;
    }
    completed++;
  }
  const failures = queue.filter(item => ["failed", "uncertain"].includes(item.status));
  const remaining = queue.filter(item => item.status === "pending").length;
  const succeeded = results.length - initialCount;
  const error = [warning, failures[0]?.error, remaining ? `${remaining} images remain unsubmitted.` : ""].filter(Boolean).join(" ");
  update({ status: failures.length ? "error" : remaining ? "paused" : "complete", error,
    exploreProgress: `${succeeded} new image${succeeded === 1 ? "" : "s"} complete${remaining ? `; ${remaining} remaining` : ""}.`,
    exploreAction: "", exploreStopRequested: false, exploreQueue: queue.map(item => ({ ...item })) });
  return { status: failures.length || remaining ? "error" : "complete", error: failures.length || remaining ? new Error(error) : undefined };
}

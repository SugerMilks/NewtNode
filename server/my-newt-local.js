import { randomUUID } from "node:crypto";
import { normalizeMyNewtPlan } from "../src/myNewt/plan.js";
import { verifyMyNewtLocalResult } from "../src/myNewt/localActions.js";
import { myNewtRequiresPlanApproval } from "../src/myNewt/review.js";

export function prepareMyNewtLocalJob(job, shortcut) {
  job.execution = "local";
  job.localAction = shortcut.action;
  job.localExpected = structuredClone(job.snapshot);
  job.plan = normalizeMyNewtPlan({ summary: shortcut.summary, steps: [{ id: "local", title: shortcut.summary }],
    deliverables: [{ kind: ["save-project", "rename-project", "report"].includes(shortcut.action.operation) ? "answer" : "workflow", label: shortcut.summary, nodeId: shortcut.action.payload.nodeId || "", count: 1 }], runs: [] });
  job.plan.approved = !myNewtRequiresPlanApproval(job.settings);
  job.status = job.plan.approved ? "running" : "plan-approval";
}

export function advanceMyNewtLocalJob(job, event) {
  if (job.localInvalidated) throw new Error(`${job.localInvalidated} Stop this task and start a fresh local action. No AI fallback or automatic retry was used.`);
  if (job.localResult) {
    const nodes = verifyMyNewtLocalResult(job.localAction, job.localResult, job.snapshot, job.localExpected);
    job.outputs = nodes.map((node) => ({ nodeId: node.id, label: node.data?.title || node.type, type: "workflow" }));
    job.plan.steps[0].status = "complete";
    job.status = "complete";
    const detail = job.localAction.operation === "report" || job.localAction.operation === "rename-project" ? job.plan.summary : job.localAction.operation === "save-project" ? "Project saved." : "Local action complete.";
    event(job, `${detail} $0.00 spent; no LLM or generation requests.`);
    return;
  }
  if (!job.plan?.approved) { job.status = "plan-approval"; return; }
  if (job.localDispatched) throw new Error("This local action was interrupted. Check the canvas before starting another task; it will not be repeated automatically.");
  job.localDispatched = true;
  job.steps += 1;
  job.pending = { id: randomUUID(), ...structuredClone(job.localAction), payload: { ...job.localAction.payload, stepId: "local" },
    expected: job.localExpected, noteVersion: job.noteVersion, approved: true, reason: job.plan.summary };
  event(job, job.plan.summary);
}

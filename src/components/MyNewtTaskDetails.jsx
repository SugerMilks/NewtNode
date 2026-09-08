import { Check, Circle, Focus, Loader2 } from "lucide-react";
import { formatRunCost } from "../generationPricing.js";

export function MyNewtTaskDetails({ job, focusNode }) {
  if (!job) return null;
  const preview = job.pending?.preview;
  return <>
    {job.plan && <details className="my-newt-plan" open={job.status === "plan-approval" || undefined}>
      <summary>Workflow plan</summary>
      <p>{job.plan.summary}</p>
      <ol>{job.plan.steps.map((step) => <li key={step.id} data-state={step.status}>{step.status === "complete" ? <Check size={13} /> : <Circle size={13} />}<span>{step.title}</span></li>)}</ol>
      <ul>{job.plan.deliverables.map((item, index) => <li key={index}>{item.count} {item.kind}: {item.label}</li>)}</ul>
      {job.execution === "local" ? <div className="my-newt-estimate">$0.00 · Local</div> : <div className="my-newt-estimate">Media estimate: {job.plan.estimatedGenerationCost == null ? "Unpriced" : formatRunCost(job.plan.estimatedGenerationCost)} <span title="Reasoning, quality checks, retries and variable provider usage are additional estimated costs.">+ LLM usage</span></div>}
    </details>}
    {job.pending?.operation === "run" && <section className="my-newt-run-preview" aria-label="Planned generation">
      {!preview ? <span><Loader2 size={14} /> Preparing run details...</span> : <>
        <strong>{preview.title}</strong>
        {job.pending.payload?.force === true && <div role="status">{preview.reuse ? "Unchanged inputs: additional generation" : "Requested repeat / new variant"}</div>}
        <div>{preview.model} {preview.provider ? `(${preview.provider})` : ""}</div>
        <div>{[preview.stage, preview.count ? `${preview.count} output${preview.count === 1 ? "" : "s"}` : "", preview.resolution, preview.aspectRatio, preview.duration, preview.quality, preview.audio].filter(Boolean).join(" | ")}</div>
        {!!preview.references?.length && <ul aria-label="Generation references">{preview.references.map((reference, index) => <li key={`${reference.url}-${index}`}>{reference.label || reference.url}</li>)}</ul>}
        <div className="my-newt-estimate">Estimated run: {preview.upperBound ? "up to " : ""}{preview.estimatedCost == null ? "Variable LLM usage" : formatRunCost(preview.estimatedCost)}{preview.additionalUsage && preview.estimatedCost != null ? " + LLM usage" : ""}</div>
        {preview.prompt && <details><summary>Prompt</summary><p>{preview.prompt}</p></details>}
      </>}
    </section>}
    {!!job.outputs?.length && <div className="my-newt-deliverables">{job.outputs.map((output, index) => <button type="button" key={`${output.nodeId}-${index}`} title="Show output node" onClick={() => focusNode(output.nodeId)}><Focus size={14} /><span>{output.label}</span></button>)}</div>}
  </>;
}

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function estimateOutpaintTiming(reference, generated, { stride, start, count, radius }) {
  if (!(stride > 0 && start >= 0 && count >= 3) || reference.length < (start + count) * stride) return { applied: false, offsetFrames: 0, reason: "Insufficient reference coverage" };
  const available = Math.floor(generated.length / stride);
  const candidates = [];
  for (let delta = -radius; delta <= radius; delta++) {
    if (start + delta < 0 || start + delta + count > available) continue;
    const segments = [[], [], []];
    for (let frame = 0; frame < count; frame += Math.max(1, Math.floor(count / 30))) {
      let error = 0;
      const a = (start + frame) * stride, b = (start + delta + frame) * stride;
      for (let pixel = 0; pixel < stride; pixel++) error += Math.abs(reference[a + pixel] - generated[b + pixel]);
      segments[Math.min(2, Math.floor(frame * 3 / count))].push(error / stride);
    }
    const scores = segments.map(values => values.reduce((a, b) => a + b, 0) / values.length);
    candidates.push({ delta, scores, error: scores.reduce((a, b) => a + b, 0) / 3 });
  }
  const baseline = candidates.find(c => c.delta === 0);
  const best = [...candidates].sort((a, b) => a.error - b.error)[0];
  if (!baseline || !best || !Number.isFinite(best.error)) return { applied: false, offsetFrames: 0, reason: "Insufficient frame coverage" };
  const agreement = best.scores.every((_, segment) => Math.abs([...candidates].sort((a, b) => a.scores[segment] - b.scores[segment])[0].delta - best.delta) <= 1);
  const applied = best.delta !== 0 && agreement && best.error < 12 && best.error < baseline.error * 0.75;
  return { applied, offsetFrames: applied ? best.delta : 0, baselineError: baseline.error, alignedError: best.error, reason: applied ? "Source correspondence agrees across three shot segments" : "No confident consistent timing correction" };
}

export async function alignOutpaintTiming({ referencePath, generatedPath, plan, runFfmpeg }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newt-outpaint-timing-"));
  try {
    const rect = plan.generationContentRect || { x: plan.left, y: plan.top, width: plan.sourceWidth, height: plan.sourceHeight };
    const scale = 96 / Math.max(rect.width, rect.height);
    const width = Math.max(8, Math.round(rect.width * scale)), height = Math.max(8, Math.round(rect.height * scale));
    const filter = `fps=${plan.fps},scale=${plan.width}:${plan.height},crop=${rect.width}:${rect.height}:${rect.x}:${rect.y},scale=${width}:${height},format=gray`;
    for (const [name, file] of [["source", referencePath], ["generated", generatedPath]]) {
      await runFfmpeg(["-y", "-i", file, "-vf", filter, "-frames:v", String(plan.frames), "-an", "-f", "rawvideo", path.join(directory, name)], "Align outpaint frame timing", 120000);
    }
    const reference = await readFile(path.join(directory, "source")), generated = await readFile(path.join(directory, "generated"));
    const options = { stride: width * height, start: plan.prerollFrames, count: plan.outputFrames, radius: Math.ceil(plan.fps / 2) };
    return estimateOutpaintTiming(reference, generated, options);
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("newt-outpaint-timing-")) throw new Error("Refusing cleanup outside owned timing directory");
    await rm(directory, { recursive: true, force: true });
  }
}

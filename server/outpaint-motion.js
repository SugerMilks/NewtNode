import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectOutpaintCoverage } from "./outpaint-coverage.js";
import { matchingGeometry } from "./outpaint-geometry.js";

// A conservative source-correspondence gate, not a claim to reconstruct unseen
// anatomy. Inspect each frame and local boundary patches so a small missing prop
// cannot disappear inside a whole-frame average. Never warp the original plate.
export function measureOutpaintMotion(reference, generated, { width, height, start = 0, count, offset = 0, edges = [] }) {
  const stride = width * height;
  const frames = [];
  if (![width, height, start, count, offset].every(Number.isInteger) || width < 8 || height < 8 || start < 0 || count < 1 || start + offset < 0 || reference.length < (start + count) * stride || generated.length < (start + offset + count) * stride) {
    return { status: "needs_review", reason: "Incomplete source correspondence coverage", framesChecked: 0, flaggedFrames: count, frames: [] };
  }
  const patch = Math.min(24, width, height);
  const regions = [];
  for (const edge of edges) {
    const horizontal = edge === "top" || edge === "bottom";
    const length = horizontal ? width : height;
    for (let p = 0; p <= length - patch; p += Math.max(1, Math.floor(patch / 2))) {
      regions.push({ edge, x: horizontal ? p : edge === "left" ? 0 : width - patch, y: horizontal ? edge === "top" ? 0 : height - patch : p });
    }
  }
  let total = 0;
  for (let frame = 0; frame < count; frame++) {
    const a = (start + frame) * stride, b = (start + offset + frame) * stride;
    let error = 0;
    for (let i = 0; i < stride; i++) error += Math.abs(reference[a + i] - generated[b + i]);
    error /= stride;
    total += error;
    const badEdges = new Set();
    let worstPatchError = 0;
    for (const { edge, x, y } of regions) {
      let sum = 0, squares = 0, diff = 0;
      for (let py = 0; py < patch; py++) for (let px = 0; px < patch; px++) {
        const at = (y + py) * width + x + px, value = reference[a + at];
        sum += value; squares += value * value;
        diff += Math.abs(value - generated[b + at]);
      }
      const n = patch * patch, deviation = Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2));
      const patchError = diff / n;
      worstPatchError = Math.max(worstPatchError, patchError);
      // Feature-bearing patches carry subject/prop evidence. Low contrast smoke
      // is still covered by the whole-core error, but cannot establish identity.
      if (deviation >= 8 && patchError > Math.max(15, deviation * 0.6)) badEdges.add(edge);
    }
    frames.push({ frame, error, worstPatchError, edges: [...badEdges], flagged: error > 12 || badEdges.size > 0 });
  }
  const flagged = frames.filter(frame => frame.flagged);
  return { status: flagged.length ? "needs_review" : "passed_checks", framesChecked: count, flaggedFrames: flagged.length,
    meanError: total / count, maxError: Math.max(...frames.map(frame => frame.error)), frames,
    reason: flagged.length ? "Generated source motion or boundary features differ from their corresponding original frames" : "Every source frame passed local core and boundary correspondence checks",
    scope: "Checks visible source correspondence only; cannot certify unseen anatomy, prop completion or generated background." };
}

export async function inspectOutpaintMotion({ referencePath, generatedPath, plan, offset = 0, runFfmpeg }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newt-outpaint-motion-"));
  try {
    // Include the known original pixels inside the generation overlap: they are
    // withheld from conditioning, but are ground truth for the reconstructed join.
    const rect = { x: plan.left, y: plan.top, width: plan.sourceWidth, height: plan.sourceHeight };
    const scale = 256 / Math.max(rect.width, rect.height);
    const width = Math.max(8, Math.round(rect.width * scale)), height = Math.max(8, Math.round(rect.height * scale));
    const filter = `fps=${plan.fps},scale=${plan.width}:${plan.height},crop=${rect.width}:${rect.height}:${rect.x}:${rect.y},scale=${width}:${height},format=gray`;
    for (const [name, file] of [["source", referencePath], ["generated", generatedPath]]) {
      await runFfmpeg(["-y", "-i", file, "-vf", filter, "-frames:v", String(plan.frames), "-an", "-f", "rawvideo", path.join(directory, name)], "Check every outpaint source frame and boundary", 120000);
    }
    const report = measureOutpaintMotion(await readFile(path.join(directory, "source")), await readFile(path.join(directory, "generated")), {
      width, height, start: plan.prerollFrames || 0, count: plan.outputFrames || plan.frames, offset,
      edges: [plan.top > 0 && "top", plan.top + plan.sourceHeight < plan.height && "bottom", plan.left > 0 && "left", plan.left + plan.sourceWidth < plan.width && "right"].filter(Boolean)
    });
    const geometry = matchingGeometry(plan), count = plan.outputFrames || plan.frames;
    const full = [];
    for (const [name, file, first] of [["source", referencePath, plan.prerollFrames || 0], ["generated", generatedPath, (plan.prerollFrames || 0) + offset]]) {
      const target = path.join(directory, name + ".rgb");
      const selection = `trim=start_frame=${first}:end_frame=${first + count},setpts=PTS-STARTPTS`;
      await runFfmpeg(["-y", "-i", file, "-vf", `fps=${plan.fps},${selection},scale=${geometry.width}:${geometry.height},format=rgb24`, "-an", "-f", "rawvideo", target], "Check complete outpaint coverage", 120000);
      full.push(await readFile(target));
    }
    report.coverage = full.every(data => data.length >= count * geometry.stride)
      ? inspectOutpaintCoverage(full[0], full[1], geometry, count, plan.fps, { requireFullCoverage: true })
      : { status: "needs_review", missingFillFrames: count, reason: "Incomplete coverage evidence" };
    if (report.coverage.status === "needs_review") {
      report.status = "needs_review";
      report.reason = `Possible unfilled outer bands in ${report.coverage.missingFillFrames} frames. ${report.reason}`;
    }
    return report;
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("newt-outpaint-motion-")) throw new Error("Refusing cleanup outside owned motion directory");
    await rm(directory, { recursive: true, force: true });
  }
}

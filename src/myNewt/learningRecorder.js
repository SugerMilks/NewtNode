import { learningChanges, learningLimits, learningSnapshot, learningText, learningAsset } from "./learning.js";

export class LearningRecorder {
  constructor({ session, send, persist = () => {}, onChange = () => {} }) {
    this.session = session; this.send = send; this.persist = persist; this.onChange = onChange;
    this.pending = session.pending || []; this.count = session.count || 0; this.recording = false; this.queue = Promise.resolve(); this.baseline = null;
  }
  save() { this.persist({ ...this.session, count: this.count, pending: this.pending }); this.onChange(); }
  baselineFor(graph) { this.baseline = learningSnapshot(graph.nodes, graph.edges, graph.canvases); }
  start(graph) { this.baselineFor(graph); this.recording = true; this.save(); }
  observe(graph) {
    if (!this.recording) return;
    const next = learningSnapshot(graph.nodes, graph.edges, graph.canvases);
    this.add(learningChanges(this.baseline, next)); this.baseline = next;
  }
  add(events) {
    if (this.count + this.pending.length + events.length > learningLimits.events) {
      this.recording = false; this.save(); throw new Error("600 observations reached. Finish and review this session before starting another.");
    }
    if (events.length) {
      this.pending.push(...events.map(event => ({ id: event.id, at: event.at, kind: event.kind,
        nodeType: learningText(event.nodeType, 60), title: learningText(event.title, 100), canvas: learningText(event.canvas, 100),
        detail: learningText(event.detail), asset: learningAsset(event.asset) })));
      this.save();
    }
  }
  note(text, node, canvas) {
    const detail = learningText(text);
    if (!detail) throw new Error("Add a short reason to remember.");
    this.add([{ id: crypto.randomUUID(), at: Date.now(), kind: "note", title: learningText(node?.data?.title || "Creative note", 100),
      nodeType: node?.type || "creative", canvas: learningText(canvas, 100), detail,
      asset: learningAsset(node?.data?.resultUrl || node?.data?.url || node?.data?.localUrl) }]);
  }
  pause() { this.recording = false; this.save(); }
  flush() {
    const run = this.queue.catch(() => {}).then(async () => {
      while (this.pending.length) {
        const batch = this.pending.slice(0, 100);
        const response = await this.send("append", { projectId: this.session.projectId, events: batch }, this.session.id);
        const ids = new Set(batch.map(event => event.id));
        this.pending = this.pending.filter(event => !ids.has(event.id)); this.count = response.count; this.save();
      }
    });
    this.queue = run; return run;
  }
}

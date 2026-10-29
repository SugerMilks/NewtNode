import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useNewtLearning } from "../../src/myNewt/useNewtLearning.js";
import { NewtLearningControls } from "../../src/components/NewtLearningControls.jsx";
import NewtLearningDialog from "../../src/components/NewtLearningDialog.jsx";
import { learningRecap, learningAnalysisRetryToken } from "../../src/myNewt/learning.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const data = JSON.parse(sessionStorage.getItem("qa-learning-database") || '{"sessions":[],"lessons":[],"calls":[]}');
window.qaLearning = data;
async function api(action, body = {}, id) {
  data.calls.push(action); let result;
  const session = data.sessions.find(item => item.id === id);
  if (action === "create") { result = { ...body, createdAt: new Date().toISOString(), events: [], suggestions: [] }; data.sessions.push(result); }
  if (action === "append") { const ids = new Set(session.events.map(item => item.id)); session.events.push(...body.events.filter(item => !ids.has(item.id))); result = { count: session.events.length }; }
  if (action === "get") result = session;
  if (action === "list") result = { sessions: data.sessions.filter(item => item.projectId === body.projectId).map(item => ({ ...item, recap: learningRecap(item.events) })), lessons: data.lessons.filter(item => item.scope === "personal" || item.projectId === body.projectId) };
  if (action === "finish") {
    session.finished = true; session.suggestions = session.events.filter(item => item.kind === "note").map(item => ({ id: item.id, title: item.title, guidance: item.detail, kind: "example", tags: [item.nodeType], evidenceIds: [item.id], source: "Your note" })); result = session;
  }
  if (action === "approve") {
    result = { ...body, tags: body.tags, id: crypto.randomUUID(), sessionId: id, revision: 1, evidence: session.events.filter(item => item.id === body.suggestionId), history: [] };
    data.lessons.push(result);
  }
  if (action === "update") {
    const lesson = data.lessons.find(item => item.id === id);
    if (body.action === "delete") data.lessons = data.lessons.filter(item => item.id !== id);
    else { lesson.history.push({ ...lesson, history: undefined }); Object.assign(lesson, body, { revision: lesson.revision + 1 }); }
    result = {};
  }
  if (action === "analyze") {
    const retryToken = learningAnalysisRetryToken(session.analysis);
    if (session.analysis && (!retryToken || body.retryToken !== retryToken || body.consent !== true)) throw new Error("Already analyzed");
    if (data.rejectAnalysis) {
      data.rejectAnalysis = false;
      session.analysis = { status: "failed", code: "invalid_schema", attemptId: crypto.randomUUID(), error: "The provider rejected NewtNode's analysis request format. Your recording is intact." };
      sessionStorage.setItem("qa-learning-database", JSON.stringify(data));
      throw new Error(session.analysis.error);
    }
    session.analysis = { status: "complete" }; session.summary = "The user explored a layered location composition and recorded why it worked.";
    session.suggestions.push({ id: "ai-suggestion", title: "Layered location plates", guidance: "For location coverage, establish foreground and background depth before close-ups.", kind: "procedure", tags: ["location", "coverage"], evidenceIds: [session.events[0].id], source: "AI suggestion" }); result = session;
  }
  if (action === "delete") { data.sessions = data.sessions.filter(item => item.id !== id); data.lessons = data.lessons.filter(item => item.sessionId !== id); result = {}; }
  if (action === "dismiss") { session.suggestions.find(item => item.id === body.suggestionId).dismissed = true; result = {}; }
  sessionStorage.setItem("qa-learning-database", JSON.stringify(data)); return structuredClone(result);
}
function Harness() {
  const [projectId, setProjectId] = useState("qa-project"), [prompt, setPrompt] = useState("A cinematic location"), [agentBusy, setAgentBusy] = useState(false), [canvasId, setCanvasId] = useState("main");
  const nodes = [{ id: "image", type: "imageModel", canvasId, data: { title: "Location plate", prompt, resultUrl: "/outputs/qa-plate.png", model: "Nano Banana Pro", apiKey: "never-record-me" } }];
  const learning = useNewtLearning({ projectId, projectName: "Creative Session", nodes, edges: [], canvases: [{ id: "main", name: "Look development" }, { id: "coverage", name: "Coverage" }], activeCanvasId: canvasId,
    selectedNodeIds: ["image"], agentBusy, api });
  return <div style={{ padding: 24, height: "100dvh", overflow: "auto", boxSizing: "border-box" }}>
    <h1 style={{ fontSize: 18 }}>Watch Me QA</h1>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <button onClick={() => setProjectId(value => value === "qa-project" ? "other-project" : "qa-project")}>Switch project</button>
      <button onClick={() => setCanvasId(value => value === "main" ? "coverage" : "main")}>Switch canvas</button>
      <label><input type="checkbox" checked={agentBusy} onChange={event => setAgentBusy(event.target.checked)} />Agent running</label>
    </div>
    <label style={{ display: "grid", gap: 6, marginBottom: 16 }}>Image prompt<textarea aria-label="Image prompt" value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
    {learning.hasSession && <NewtLearningControls key={`compact-${projectId}`} learning={learning} compact />}
    <div className="node-card myNewt" style={{ position: "relative", width: "min(580px, 100%)", marginTop: 16, transform: "none" }}><div className="node-body"><NewtLearningControls key={projectId} learning={learning} /></div></div>
    <output aria-label="Recording state">{learning.recording ? "recording" : "off"}</output>
    {learning.dialog && <NewtLearningDialog key={projectId} learning={learning} />}
  </div>;
}
createRoot(document.getElementById("root")).render(<Harness />);

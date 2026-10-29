import { NewtLearningStore } from "../newt-learning.js";

export function registerNewtLearningRoutes(app, options) {
  const store = new NewtLearningStore(options);
  app.use("/api/my-newt/learning", (req, res, next) => {
    let host, origin = req.headers.origin;
    try { host = new URL(`http://${req.headers.host}`).hostname; } catch { host = ""; }
    if (!origin) { try { origin = new URL(req.headers.referer).origin; } catch { origin = ""; } }
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
      || !["127.0.0.1", "localhost", "[::1]"].includes(host)
      || !options.localOrigins.includes(origin) || req.headers["x-newt-local"] !== "1") {
      return res.status(403).json({ error: "Learning is available only in the local NewtNode editor." });
    }
    if (req.method !== "GET" && (!req.is("application/json") || !req.body || typeof req.body !== "object" || Array.isArray(req.body) || Buffer.byteLength(JSON.stringify(req.body)) > 250000)) return res.status(400).json({ error: "Invalid learning request." });
    res.setHeader("Cache-Control", "no-store"); next();
  });
  const wrap = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (error) { res.status(error.status || 400).json({ error: error.message || "Could not update Newt learning." }); }
  };
  app.get("/api/my-newt/learning", wrap(req => store.list(req.query.projectId)));
  app.post("/api/my-newt/learning/sessions", wrap(req => store.create(req.body)));
  app.get("/api/my-newt/learning/sessions/:id", wrap(req => store.session(req.params.id, req.query.projectId)));
  for (const action of ["append", "finish", "analyze", "approve", "note", "dismiss"]) app.post(`/api/my-newt/learning/sessions/:id/${action}`, wrap(req => store[action](req.params.id, req.body)));
  app.post("/api/my-newt/learning/sessions/:id/delete", wrap(req => store.removeSession(req.params.id, req.body)));
  app.post("/api/my-newt/learning/lessons/:id", wrap(req => store.update(req.params.id, req.body)));
  return store;
}

import { MyNewtService } from "../my-newt.js";
import { myNewtSnapshot } from "../../src/myNewt/contract.js";
import { myNewtCheckpoint } from "../../src/myNewt/recovery.js";

export function registerMyNewtRoutes(app, dependencies) {
  const service = new MyNewtService(dependencies);
  const wrap = (method) => async (req, res) => {
    try {
      const body = req.body || {};
      if (body.snapshot) {
        if (JSON.stringify(body.snapshot).length > 8_000_000) throw new Error("The project snapshot exceeds the 8 MB safety limit.");
        body.snapshot = myNewtSnapshot(body.snapshot);
      }
      if (body.checkpoint) {
        if (JSON.stringify(body.checkpoint).length > 12_000_000) throw new Error("The checkpoint exceeds the 12 MB safety limit.");
        body.checkpoint = myNewtCheckpoint(body.checkpoint.graph, body.checkpoint.name);
      }
      const result = await (method === "start" ? service.start(body) : service[method](req.params.id, body));
      res.json(result);
    } catch (error) { res.status(400).json({ error: error.message || "Newt request failed." }); }
  };
  app.post("/api/my-newt/jobs", wrap("start"));
  app.post("/api/my-newt/history", async (req, res) => {
    try { res.json(await service.history(req.body || {})); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  for (const action of ["sync", "control", "claim", "complete", "request", "prepare", "recover"]) app.post(`/api/my-newt/jobs/:id/${action}`, wrap(action));
  return service;
}

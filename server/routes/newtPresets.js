import { NewtPresetStore } from "../newt-presets.js";

export function registerNewtPresetRoutes(app, dependencies) {
  const store = new NewtPresetStore(dependencies);
  const handle = (operation) => async (req, res) => {
    try { res.json(await operation(req)); }
    catch (error) { res.status(error.status || 400).json({ error: error.message || "Newt Preset request failed." }); }
  };
  app.get("/api/newt-presets", handle(() => store.list()));
  app.post("/api/newt-presets", handle((req) => store.save(req.body || {})));
  app.get("/api/newt-presets/:id", handle((req) => store.get(req.params.id)));
  app.delete("/api/newt-presets/:id", handle((req) => store.remove(req.params.id)));
  return store;
}

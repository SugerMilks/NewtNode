export function registerLayersRoutes(app, { service, psdService, sendError, limiter = (_req, _res, next) => next() }) {
  app.post("/api/node/image-layers-psd", async (req, res) => {
    try { res.status(202).json(psdService.start(req.body)); }
    catch (error) { error.noSubmission = true; sendError(res, error, "Could not export PSD."); }
  });
  app.get("/api/node/image-layers-psd/:id", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(psdService.inspect(req.params.id)); }
    catch (error) { sendError(res, error, "Could not check PSD export."); }
  });
  app.post("/api/node/image-layers", limiter, async (req, res) => {
    try { res.status(202).json(await service.start(req.body)); }
    catch (error) {
      // start() only throws before launching the provider request.
      if (error.status !== 409) error.noSubmission = true;
      sendError(res, error, "Could not start Layers.");
    }
  });
  app.get("/api/node/image-layers/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await service.inspect(req.params.id)); } catch (error) { sendError(res, error, "Could not check Layers."); }
  });
  app.post("/api/node/image-layers-save", limiter, async (req, res) => {
    try { res.json(await service.save(req.body)); } catch (error) { sendError(res, error, "Could not save Layers."); }
  });
}

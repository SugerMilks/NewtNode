import { createLooksLibrary } from "../looks-library.js";

export function registerLooksRoutes(app, options) {
  const library = createLooksLibrary(options);
  const localOrigin = (req, res, next) => {
    const origin = req.get("origin");
    if (origin) {
      try { const url = new URL(origin); if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw Error(); }
      catch { return res.status(403).json({ error: "Open Looks inside your local NewtNode app." }); }
    }
    next();
  };
  app.use("/api/looks", localOrigin);
  app.use("/api/style-library/stylefinder-image", localOrigin);
  const route = action => async (req, res) => {
    try { res.json(await action(req)); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : "Could not access Looks. Your catalog and canvas are unchanged." }); }
  };
  app.get("/api/looks", route(() => library.status()));
  app.post("/api/looks/folder", route(req => library.configure(req.body?.directory)));
  app.get("/api/looks/catalog", route(req => library.search(req.query)));
  app.get("/api/looks/catalog/:id", route(async req => ({ look: await library.detail(req.params.id) })));
  app.post("/api/looks/favorites/:id", route(req => library.setFavorite(req.params.id, req.body?.selected)));
  app.post("/api/looks/import", route(req => library.importLook(req.body || {})));
  app.post("/api/looks/create-style", route(req => library.createStyle(req.body || {})));
  // The catalog's original URL contract is retained; only allowlisted local raster assets are served.
  app.get("/api/style-library/stylefinder-image", async (req, res) => {
    try {
      const asset = await library.asset(req.query.file, req.query.v, req.query.thumbnail === "1");
      res.set({ "Content-Type": asset.mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300", "Content-Security-Policy": "default-src 'none'" });
      res.sendFile(asset.filename, error => { if (error && !res.headersSent) res.status(404).end(); });
    } catch (error) { if (!res.headersSent) res.status(error.status || 404).json({ error: "Look image unavailable." }); }
  });
  return library;
}

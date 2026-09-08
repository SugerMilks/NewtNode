export function registerPricingRoutes(app, pricing) {
  app.get("/api/pricing", async (_req, res) => {
    await pricing.ready;
    res.setHeader("Cache-Control", "no-store");
    res.json(pricing.status());
  });
  app.post("/api/pricing/:action", async (req, res) => {
    const origin = req.get("origin");
    const allowed = !origin || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
    const localHost = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(req.get("host") || "");
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    if (!allowed || !localHost || !loopback || req.get("X-Newt-Local") !== "1") return res.status(403).json({ error: "Pricing changes require the local NewtNode app." });
    try {
      if (req.params.action === "refresh") { await pricing.refresh(); return res.json(pricing.status()); }
      if (req.params.action === "settings") return res.json(await pricing.setEnabled(req.body.enabled));
      res.status(404).json({ error: "Unknown pricing action." });
    } catch (error) { res.status(400).json({ error: error.message || "Pricing update failed." }); }
  });
}

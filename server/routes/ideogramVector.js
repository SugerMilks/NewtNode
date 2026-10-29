import { ideogramVectorRates } from "../../src/ideogramVector.js";

// Express paths may still be URL-encoded when middleware runs. Decode once,
// matching the static-file resolver, so an encoded dot cannot bypass SVG policy.
export function secureVectorAssetResponse(req, res, next) {
  let pathname = req.path;
  try { pathname = decodeURIComponent(pathname); } catch { /* Static serving will reject malformed paths. */ }
  if (/\.svg$/i.test(pathname)) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'none'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
  next();
}

export function registerIdeogramVectorRoutes(app, { service, getRates = () => ideogramVectorRates, limiter = (_req, _res, next) => next(), sendError }) {
  app.get("/api/node/ideogram-vector-pricing", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const configured = await getRates();
      const rates = Object.fromEntries(Object.keys(ideogramVectorRates).map(key => {
        const rate = configured?.[key];
        return [key, typeof rate === "number" && Number.isFinite(rate) && rate >= 0 ? rate : null];
      }));
      res.json({ rates, checkedAt: "2026-10-26", pricingSource: "https://fal.ai/models/ideogram/vector/text-to-vector" });
    } catch (error) { sendError(res, error, "Could not read Vector estimates."); }
  });
  app.post("/api/node/ideogram-vector", limiter, async (req, res) => {
    try { res.json(await service.start(req.body)); }
    catch (error) { sendError(res, error, "Ideogram Vector failed."); }
  });
  app.get("/api/node/ideogram-vector/:requestId", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await service.inspect(req.params.requestId)); }
    catch (error) { sendError(res, error, "Could not check the Vector request."); }
  });
}

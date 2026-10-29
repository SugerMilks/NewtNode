import { createServer } from "node:http";

// Real local media delivery exercises browser downloads, which do not reliably
// pass through Playwright request interception. Never forward app API traffic.
export async function startVectorQaServer({ svg, png, assets = new Map(), service }) {
  const vite = process.env.VECTOR_QA_URL || "http://127.0.0.1:5185";
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (pathname.startsWith("/api/")) { res.writeHead(403); res.end("Real app API disabled in QA"); return; }
      if (pathname.startsWith("/outputs/vector-qa/") || pathname.startsWith("/uploads/vector-qa/")) {
        const isSvg = pathname.endsWith(".svg");
        res.writeHead(200, { "Content-Type": isSvg ? "image/svg+xml" : "image/png", "Content-Disposition": `inline; filename="${pathname.split("/").at(-1)}"` });
        res.end(assets.get(pathname) || (isSvg ? svg : png)); return;
      }
      if (pathname.startsWith("/outputs/") || pathname.startsWith("/uploads/")) { res.writeHead(404); res.end(); return; }
      if (pathname === "/vector-qa-local/guide" && req.method === "POST") {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 10 * 1024 * 1024) throw new Error("QA guide too large"); chunks.push(chunk); }
        const url = `/uploads/vector-qa/guide-${assets.size + 1}.png`;
        assets.set(url, Buffer.concat(chunks));
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ asset: { localUrl: url } })); return;
      }
      if (["/vector-qa-local/save", "/vector-qa-local/inspect"].includes(pathname) && service && req.method === "POST") {
        let body = "";
        for await (const chunk of req) { body += chunk; if (body.length > 1024 * 1024) throw new Error("QA request too large"); }
        const result = await service[pathname.endsWith("/save") ? "save" : "inspect"](JSON.parse(body));
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result)); return;
      }
      if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
      const upstream = await fetch(`${vite}${req.url}`);
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "text/plain" });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) { res.writeHead(error.status || 500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const source = fileURLToPath(new URL("../../src/NodeEditor.jsx", import.meta.url));
const virtual = source.replace("NodeEditor.jsx", "StoryboardQa.jsx");
export default defineConfig({
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react/jsx-runtime", "lucide-react", "three"] },
  plugins: [{
    name: "storyboard-qa",
    enforce: "pre",
    resolveId(id) { if (id === "virtual:storyboard-qa") return virtual; },
    async load(id) {
      if (id === virtual) { this.addWatchFile(source); return `${await readFile(source, "utf8")}\nexport { NodeBody, createDefaultNodeData };`; }
    },
    handleHotUpdate({ file, server }) {
      if (file === source) {
        const module = server.moduleGraph.getModuleById(virtual);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.startsWith("/api/media-thumbnail?")) { req.url = "/storyboard/MOOD_BOARD.png"; return next(); }
        if (req.url.startsWith("/api/")) { res.statusCode = 403; res.end("API disabled in isolated QA"); } else next();
      });
    }
  }, react()],
  server: { host: "127.0.0.1", port: 5183, strictPort: true, watch: { usePolling: true } }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react/jsx-runtime", "lucide-react"] },
  plugins: [react(), { name: "isolated-output-qa", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (/^\/outputs\/qa\/Campaign_\d+\.png$/.test(req.url)) req.url = "/storyboard/MOOD_BOARD.png";
      if (req.url.startsWith("/api/")) { res.statusCode = 403; res.end("Production API disabled in Output QA"); } else next();
    });
  } }],
  server: { host: "127.0.0.1", port: 5184, strictPort: true, watch: { usePolling: true } }
});

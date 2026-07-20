import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const clientPort = Number(process.env.VITE_CLIENT_PORT || 5176);
const apiPort = Number(process.env.VITE_API_PORT || process.env.PORT || 3336);
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, "/");
          if (!moduleId.includes("/node_modules/")) return undefined;
          if (moduleId.includes("/react/") || moduleId.includes("/react-dom/")) return "vendor-react";
          if (moduleId.includes("/three/")) return "vendor-three";
          if (moduleId.includes("/lucide-react/") || moduleId.includes("/lucide-static/")) return "vendor-icons";
          return "vendor";
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: clientPort,
    proxy: {
      "/api": apiTarget,
      "/uploads": apiTarget,
      "/outputs": apiTarget,
      "/workflow-assets": apiTarget
    }
  },
  preview: {
    host: "127.0.0.1",
    port: clientPort,
    proxy: {
      "/api": apiTarget,
      "/uploads": apiTarget,
      "/outputs": apiTarget,
      "/workflow-assets": apiTarget
    }
  }
});

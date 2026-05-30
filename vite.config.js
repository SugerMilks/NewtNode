import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3333",
      "/uploads": "http://127.0.0.1:3333",
      "/outputs": "http://127.0.0.1:3333",
      "/workflow-assets": "http://127.0.0.1:3333"
    }
  }
});

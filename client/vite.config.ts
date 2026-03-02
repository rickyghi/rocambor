import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 3000,
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
        rewrite: (p) => p.replace(/^\/ws/, ""),
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// .trim() — Windows-bat: `set VAR=value &&` оставляет trailing space в значении.
const BACKEND = (process.env.BACKEND_URL || "http://127.0.0.1:8000").trim();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
      "/storage": {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});

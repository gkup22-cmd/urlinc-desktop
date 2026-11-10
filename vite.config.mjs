import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "renderer",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "renderer/src"),
      "@workspace/api-client-react": path.resolve(__dirname, "renderer/src/workspace/api-client-react"),
      "@workspace/replit-auth-web": path.resolve(__dirname, "renderer/src/workspace/replit-auth-web"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3847",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

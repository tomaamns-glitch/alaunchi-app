import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // Two pages: the launcher and the window shown over Minecraft (src/overlay).
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        overlay: path.resolve(import.meta.dirname, "overlay.html"),
      },
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    strictPort: true,
    // electron-builder writes its output straight into release/ (unpacked app,
    // installer, etc.) — without this, its file writes look like source changes
    // and Vite spams full-page reloads for the whole duration of a build.
    watch: {
      ignored: ["**/release/**"],
    },
  },
});

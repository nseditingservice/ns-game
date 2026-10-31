import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the app works on GitHub Pages (/repo-name/) or any host.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
});

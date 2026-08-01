import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ponytail: node environment — the engine is pure functions. A DOM environment gets
  // added when a test actually needs canvas/Worker.
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});

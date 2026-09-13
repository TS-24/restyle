import { defineConfig } from "vitest/config";
import path from "path";

// Separate from vite.config.ts on purpose: the React Router plugin builds a
// route manifest and a server bundle, neither of which a unit test wants.
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
      "@": path.resolve(__dirname, "./app"),
    },
  },
  test: {
    environment: "node",
  },
});

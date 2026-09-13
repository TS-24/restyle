import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render. This emits build/server/index.js, which is what the
  // Dockerfile's `react-router-serve` entrypoint runs.
  ssr: true,
} satisfies Config;

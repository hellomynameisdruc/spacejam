import { defineConfig } from "vite";

// every built file opens with the copyright line, so copies keep the author's name
const banner = "/*! Sound Cosmos \u00a9 2026 hellomynameisdruc. All rights reserved. https://github.com/hellomynameisdruc/spacejam */";
export default defineConfig({
  base: "./",
  build: { target: "es2022", rollupOptions: { output: { banner } } },
  server: { port: 5173 },
});

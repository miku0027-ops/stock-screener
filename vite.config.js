import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
const revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"])
  .toString()
  .trim();
export default defineConfig({
  define: { __APP_REVISION__: JSON.stringify(revision) },
  plugins: [
    react(),
    {
      name: "release-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ revision, builtAt: Date.now() }),
        });
      },
    },
  ],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3001" } },
});

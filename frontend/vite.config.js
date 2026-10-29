import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Versión de esta compilación (en GitHub Actions es el commit). Se publica en version.json
// para que la app avise cuando hay una versión nueva y no se quede la vieja en caché.
const VERSION = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);

const versionFile = {
  name: "orion-version-file",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: VERSION }) });
  },
};

// GitHub Pages publica en https://orion-nova-technologies-s-a-s.github.io/orion-invest/
export default defineConfig(({ command }) => ({
  plugins: [react(), versionFile],
  base: command === "build" ? "/orion-invest/" : "/",
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  server: { port: 5173 },
}));

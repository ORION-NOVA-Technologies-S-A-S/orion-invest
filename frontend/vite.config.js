import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages publica en https://orion-nova-technologies-s-a-s.github.io/orion-invest/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/orion-invest/" : "/",
  server: { port: 5173 },
}));

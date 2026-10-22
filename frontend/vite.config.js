import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /api se reenvía al backend FastAPI, así la cookie de sesión
// queda en el mismo origen que la web.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": process.env.API_URL || "http://localhost:8000",
    },
  },
});

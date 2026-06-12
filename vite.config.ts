import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.QDCA_API_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      }
    }
  }
});

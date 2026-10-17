import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 127.0.0.1, never localhost: on Windows, Node resolves localhost to IPv6 first and loses a second per proxied request.
const apiPort = process.env.PANKI_API_PORT ?? "3001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PANKI_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}` } },
  },
});

import { defineConfig } from 'vite';
const backend=process.env.POND_BACKEND_URL??'http://127.0.0.1:5072';
export default defineConfig({ server: { port: 5173, strictPort: true, proxy: {
  '/hubs': { target: backend, ws: true },
  '/health': { target: backend }
} } });

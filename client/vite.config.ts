import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // .env.local lives at the repo root, next to convex/, because `npx convex dev`
  // reads CONVEX_DEPLOYMENT from there. Vite would otherwise look in client/ and
  // find nothing, which shows up as "VITE_CONVEX_URL is not set" on a fresh clone
  // that followed the setup instructions exactly.
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // No dev proxy any more: the Express API and its Socket.IO endpoint are gone,
    // and the client talks to Convex directly over its own protocol.
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});

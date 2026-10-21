import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.MS_API_ORIGIN ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.MS_WEB_PORT ?? 5173),
    strictPort: true,
    // Generated media and raw sources are large and rewritten by scripts; watching them
    // wastes resources and (on Windows) locks folders the media build needs to rename.
    watch: { ignored: ['**/media/**', '**/sources/**', '**/data/**', '**/shots/**', '**/test-results/**', '**/playwright-report/**'] },
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/stream': { target: API, changeOrigin: false },
      '/media': { target: API, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
} as any);

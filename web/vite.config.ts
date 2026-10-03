import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: { '/api': { target: 'http://127.0.0.1:4321', changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 1500 },
});

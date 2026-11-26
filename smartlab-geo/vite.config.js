import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/mqtt-ws': {
        target: 'ws://mqtt.vantara.my.id:9001',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mqtt-ws/, ''),
      },
    },
  },
});


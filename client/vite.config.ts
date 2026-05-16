import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 允许 ngrok 等隧道访问，否则 Host 不匹配会 403
    allowedHosts: ['.ngrok-free.dev', '.ngrok.io', '.ngrok.app', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

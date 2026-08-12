import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const envDir = path.resolve(projectRoot, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  // Default backend port: matches server default (3000). Use VITE_API_URL to override.
  const backendPort = env.PORT || '3000';
  const backendTarget = env.VITE_API_URL || `http://127.0.0.1:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: false,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/health': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  };
});

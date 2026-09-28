import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { ensureDevBackend, devBackendPlugin } from './devBackend.mjs';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const envDir = path.resolve(projectRoot, '..');

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, envDir, '');
  // Default backend port: matches server default (3000). Use VITE_API_URL to override.
  const backendPort = Number(env.PORT) || 3000;
  let backendTarget = env.VITE_API_URL || `http://127.0.0.1:${backendPort}`;
  const plugins = [react()];

  if (command === 'serve' && !process.env.VITEST) {
    const backend = await ensureDevBackend({
      defaultPort: backendPort,
      explicitTarget: env.VITE_API_URL,
      cwd: envDir,
      entry: path.join(envDir, 'server', 'server.js'),
    });
    backendTarget = backend.target;
    plugins.push(devBackendPlugin(backend.getReady));
  }

  return {
    plugins,
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
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
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

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const clientDirectory = path.dirname(fileURLToPath(import.meta.url));
  const envDirectory = path.resolve(clientDirectory, '..');
  const env = loadEnv(mode, envDirectory, '');
  const apiTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    root: clientDirectory,
    envDir: envDirectory,
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure: (proxy) => {
            // Browser requests are same-origin to Vite; do not make the API
            // depend on a hard-coded preview hostname during local development.
            proxy.on('proxyReq', (proxyRequest) => proxyRequest.removeHeader('origin'));
          },
        },
      },
    },
  };
});

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rpcHost = env.VITE_RPC_HOST || '127.0.0.1';
  const rpcPort = env.VITE_RPC_PORT || '8332';
  const rpcProtocol = env.VITE_RPC_PROTOCOL || 'http';

  return {
    plugins: [
      react(),
      nodePolyfills(),
    ],
    server: {
      proxy: {
        '/rpc': {
          target: `${rpcProtocol}://${rpcHost}:${rpcPort}`,
          changeOrigin: true,
          rewrite: () => '/',
        },
      },
    },
  };
});

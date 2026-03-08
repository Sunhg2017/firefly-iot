import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'bufferutil', 'utf-8-validate'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom')) return 'vendor-react-dom';
            if (id.includes('/react/')) return 'vendor-react';
            if (
              id.includes('@ant-design/icons') ||
              id.includes('@ant-design') ||
              id.includes('/antd/') ||
              id.includes('/rc-') ||
              id.includes('@rc-component')
            ) {
              return 'vendor-ui';
            }
            if (id.includes('zustand') || id.includes('dayjs') || id.includes('uuid')) return 'vendor-utils';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});

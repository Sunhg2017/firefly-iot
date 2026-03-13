import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const VENDOR_CHUNK_GROUPS: Array<{ chunk: string; packages: string[] }> = [
  { chunk: 'react-vendor', packages: ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'] },
  {
    chunk: 'antd-vendor',
    packages: [
      'antd',
      '@ant-design/icons',
      '@ant-design/colors',
      '@ant-design/icons-svg',
      'rc-',
      '@rc-component/',
      '@ant-design/cssinjs',
      '@emotion/',
      '@ctrl/tinycolor',
    ],
  },
  { chunk: 'pro-vendor', packages: ['@ant-design/pro-components', '@ant-design/pro-layout', '@umijs/'] },
  { chunk: 'charts-vendor', packages: ['@ant-design/charts', '@antv/'] },
  { chunk: 'xlsx-vendor', packages: ['xlsx', 'cfb', 'codepage', 'crc-32', 'ssf', 'wmf', 'word'] },
  { chunk: 'video-vendor', packages: ['flv.js'] },
  { chunk: 'editor-vendor', packages: ['@monaco-editor/react', '@monaco-editor/loader'] },
  { chunk: 'app-vendor', packages: ['axios', 'dayjs', 'zustand'] },
];

function getPackageName(id: string): string | null {
  const normalizedId = id.replace(/\\/g, '/');
  const nodeModulesIndex = normalizedId.lastIndexOf('/node_modules/');
  if (nodeModulesIndex === -1) {
    return null;
  }

  const packagePath = normalizedId.slice(nodeModulesIndex + '/node_modules/'.length);
  if (!packagePath) {
    return null;
  }

  const segments = packagePath.split('/');
  if (segments[0]?.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : segments[0];
  }

  return segments[0] || null;
}

function resolveVendorChunk(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/');
  if (normalizedId.includes('/node_modules/monaco-editor/')) {
    if (normalizedId.includes('/esm/vs/language/json/')) {
      return 'monaco-json-vendor';
    }

    if (normalizedId.includes('/esm/vs/basic-languages/')) {
      return 'monaco-basic-vendor';
    }

    if (
      normalizedId.includes('/esm/vs/base/')
      || normalizedId.includes('/esm/vs/platform/')
      || normalizedId.includes('/esm/vs/nls')
    ) {
      return 'monaco-base-vendor';
    }

    if (normalizedId.includes('/esm/vs/editor/')) {
      return 'monaco-core-vendor';
    }

    return 'monaco-vendor';
  }

  const packageName = getPackageName(id);
  if (!packageName) {
    return undefined;
  }

  const matchedGroup = VENDOR_CHUNK_GROUPS.find(({ packages }) =>
    packages.some((pkg) => packageName === pkg || packageName.startsWith(pkg)),
  );

  return matchedGroup?.chunk;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/SYSTEM': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/DEVICE': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/RULE': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/DATA': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/SUPPORT': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/MEDIA': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/CONNECTOR': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          return resolveVendorChunk(id);
        },
      },
    },
  },
});

import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  main: {
    // Bundle our ESM workspace packages into the CJS main output (Electron's
    // main can't require() ESM). The engine is still forked as a separate
    // process via require.resolve, not imported here.
    plugins: [externalizeDepsPlugin({ exclude: ['@greenroom/shared', '@greenroom/engine'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@greenroom/shared', '@greenroom/engine'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // Icons compiled to React components at build time (offline, tree-shaken) - Streamline Plump.
    plugins: [react(), Icons({ compiler: 'jsx', jsx: 'react' })],
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src') },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});

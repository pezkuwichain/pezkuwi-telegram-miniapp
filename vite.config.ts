import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import fs from 'fs';

// Read version info for build
const versionInfo = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './src/version.json'), 'utf-8')
);

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    // Copy version.json to dist for update checking
    {
      name: 'copy-version',
      closeBundle() {
        const src = path.resolve(__dirname, './src/version.json');
        const dest = path.resolve(__dirname, './dist/version.json');
        fs.copyFileSync(src, dest);
        console.log('✓ version.json copied to dist');
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.version),
    __BUILD_TIME__: JSON.stringify(versionInfo.buildTime),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom'],
          // React Query
          'vendor-query': ['@tanstack/react-query'],
          // UI components and icons
          'vendor-ui': ['lucide-react'],
          // Pezkuwi/Polkadot crypto libraries (largest chunk)
          'vendor-crypto': [
            '@pezkuwi/api',
            '@pezkuwi/keyring',
            '@pezkuwi/util-crypto',
            '@pezkuwi/util',
          ],
        },
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8787', '/media': 'http://localhost:8787' } },
});

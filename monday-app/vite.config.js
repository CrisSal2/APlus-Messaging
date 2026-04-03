import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8301,
    // Monday.com tunnels traffic to your local dev server
    // Run: npx monday-code serve (or use their tunnel tool)
  },
});

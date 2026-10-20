import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'FreshWarden',
        short_name: 'FreshWarden',
        description: 'The guardian on every shelf',
        theme_color: '#153e35',
        background_color: '#f6f8f6',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api/, /^\/health/] },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true },
      '/health': 'http://127.0.0.1:5000',
    },
  },
  test: { environment: 'jsdom', globals: true },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: (mode === 'android' || mode === 'electron') ? './' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // react-is vb. grafik yardımcıları grafiklerle birlikte kalır.
            if (/node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) {
              return 'react-vendor'
            }
            if (id.includes('zustand')) {
              return 'zustand-vendor'
            }
            if (id.includes('idb')) {
              return 'idb-vendor'
            }
          }
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon-192x192.png', 'icon-512x512.png'],
      manifest: {
        name: 'zamAn',
        short_name: 'zamAn',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [
          { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tüm uygulama paketleri zaten sürümlü precache'te. Aynı dosyaları
        // ikinci bir NetworkFirst deposuna koymak sürümleri karıştırabilir.
        // Uygulamanın ekranları kök URL'dedir; eksik JS/CSS'ye HTML döndürme.
        navigateFallbackAllowlist: [/^\/(?:index\.html)?(?:\?.*)?$/],
      },
      devOptions: {
        enabled: false, // Disable plugin in dev, use manual manifest instead
      },
    }),
  ],
}))

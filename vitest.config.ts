import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Testler .env.local içindeki gerçek Supabase yapılandırmasını yüklemez.
  envDir: false,
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
})

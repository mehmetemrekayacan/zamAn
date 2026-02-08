import type { CapacitorConfig } from '@capacitor/cli';

/** Remote mod: deploy sonrası tüm kullanıcılar anında güncelleme alır */
const USE_REMOTE = process.env.CAPACITOR_REMOTE === '1';
const APP_URL = process.env.ZAMAN_APP_URL || 'https://zam-an.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.zamanolcer.app',
  appName: 'zamAn',
  webDir: 'dist',
  ...(USE_REMOTE && {
    server: {
      url: APP_URL,
      cleartext: false,
    },
  }),
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.garagara.reader',
  appName: 'Garagara Reader',
  webDir: 'dist',
  backgroundColor: '#FAF8F3',
  ios: {
    contentInset: 'never',
    backgroundColor: '#FAF8F3',
  },
  server: {
    iosScheme: 'capacitor',
  },
};

export default config;

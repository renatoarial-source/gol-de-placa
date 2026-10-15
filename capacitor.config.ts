import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arial.goldeplaca',
  appName: 'Gol de Placa',
  webDir: 'dist',
  backgroundColor: '#0d3b1f',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#0d3b1f' },
};

export default config;

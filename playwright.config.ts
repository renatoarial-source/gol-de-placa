// Testes de ponta a ponta do jogo num celular simulado.
// Rodar: npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) },
    baseURL: 'http://localhost:4175',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

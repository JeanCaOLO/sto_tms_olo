import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // En serie: los tests comparten el mismo backend/Aurora (crean planes reales),
  // así que en paralelo se pisan el estado. 1 worker = deterministas.
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Sin `webServer`: la app ya corre en http://localhost:3000 (Vite dev) con el
  // backend en :4000. Los tests corren contra esa instancia, no la levantan.
});

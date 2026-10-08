import { defineConfig } from 'vitest/config';

// Runner de tests unitarios (lógica pura de Planificación). Los e2e siguen en
// Playwright (test:e2e). Entorno por defecto: node; los tests que necesitan
// DOM declaran `// @vitest-environment jsdom` en su cabecera.
export default defineConfig({
  // Los tests del tarifador corren contra la semilla local; sin esto leen VITE_TARIFAS_DATASOURCE de .env.local.
  define: { 'import.meta.env.VITE_TARIFAS_DATASOURCE': JSON.stringify('json') },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/pages/planificacion/**/*.{ts,tsx}'],
    },
  },
});

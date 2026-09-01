import { defineConfig } from 'vitest/config';

// Runner de tests unitarios (lógica pura de Planificación). Los e2e siguen en
// Playwright (test:e2e). Entorno por defecto: node; los tests que necesitan
// DOM declaran `// @vitest-environment jsdom` en su cabecera.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/pages/planificacion/**/*.{ts,tsx}'],
    },
  },
});

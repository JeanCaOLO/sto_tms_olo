import { test, expect, type Page } from '@playwright/test';

// E2E de rutas, redirecciones y guards.
//
// 1) "Sin sesión": corre contra la instancia real (http://localhost:3000), SIN credenciales: cualquier módulo protegido
//    o ruta antigua termina en /login.
// 2) "Con sesión (modo mock)": necesita la app levantada con VITE_MOCK_AUTH=true (`npm run dev`) y esta misma variable
//    en el entorno de Playwright (`VITE_MOCK_AUTH=true npx playwright test e2e/rutas-y-guards.spec.ts`). Se omite si no.
//    La sesión mock no sobrevive a una recarga completa, por eso las rutas se visitan navegando dentro de la app
//    (history.pushState) y no con `page.goto`.

const MODULOS_PROTEGIDOS = [
  '/', '/dashboard', '/tracking', '/reglas-tarifa', '/liquidaciones', '/proformas', '/tarifas/costos-flota', '/guias', '/devoluciones',
];
const RUTAS_ANTIGUAS = ['/planificacion', '/tarifas/flota-propia', '/tarifas/transportistas'];

test.describe('Sin sesión', () => {
  for (const ruta of [...MODULOS_PROTEGIDOS, ...RUTAS_ANTIGUAS]) {
    test(`${ruta} lleva a /login`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
    });
  }

  test('una ruta que no existe también pide iniciar sesión primero', async ({ page }) => {
    await page.goto('/esta-ruta-no-existe');
    await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
  });
});

async function entrarMock(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('usuario@empresa.com').fill('e2e@test.com');
  await page.getByPlaceholder('••••••••').fill('e2e-password');
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 });
}

/** Navega dentro de la app (sin recargar: la sesión mock se perdería). */
async function irA(page: Page, destino: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, destino);
}

test.describe('Con sesión (modo mock)', () => {
  test.skip(process.env.VITE_MOCK_AUTH !== 'true', 'requiere VITE_MOCK_AUTH=true (ver el encabezado del archivo)');

  test('la entrada "/" termina en /dashboard', async ({ page }) => {
    await entrarMock(page);
    await irA(page, '/');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('/planificacion conserva los parámetros al redirigir', async ({ page }) => {
    await entrarMock(page);
    await irA(page, '/planificacion?x=1');
    await expect(page).toHaveURL(/\/oms\/planificacion\?x=1$/);
  });

  test('/tarifas/flota-propia y /tarifas/transportistas llegan a costos de flota con su filtro', async ({ page }) => {
    await entrarMock(page);
    await irA(page, '/tarifas/flota-propia');
    await expect(page).toHaveURL(/\/tarifas\/costos-flota\?flota=propia$/);
    await irA(page, '/tarifas/transportistas?x=2');
    await expect(page).toHaveURL(/\/tarifas\/costos-flota\?x=2&flota=externa$/);
  });

  test('una ruta inexistente muestra el 404 en español con salida al inicio', async ({ page }) => {
    await entrarMock(page);
    await irA(page, '/esta-ruta-no-existe');
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await expect(page.getByText('/esta-ruta-no-existe')).toBeVisible();
    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

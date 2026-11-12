import { test, expect, type Page } from '@playwright/test';

// E2E de Tracking (solo monitoreo) en MODO MOCK: la app corre en http://localhost:3000 con VITE_MOCK_AUTH=true
// (`npm run dev`), sin túnel ni backend: el tracking habla con su backend simulado (src/pages/tracking/mock/).
// Cada test abre la app de cero, así que la simulación arranca siempre desde los escenarios de viajes-demo.json.
// No se afirma nada que dependa de OSRM (red externa): la ruta por calles es un extra visual.

async function abrirTracking(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  // Mock auth: cualquier correo/clave entra. La sesión mock no sobrevive a una recarga, por eso se navega con el menú.
  const email = page.getByPlaceholder('usuario@empresa.com');
  if (await email.isVisible().catch(() => false)) {
    await email.fill('e2e@test.com');
    await page.getByPlaceholder('••••••••').fill('e2e-password');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 });
  }
  await page.locator('a[href="/tracking"]').first().click();
  await expect(page.getByRole('heading', { name: 'Tracking de viajes' })).toBeVisible({ timeout: 15000 });
  // Sin los controles de simulación no es modo mock: estos tests no aplican contra un backend real.
  await expect(page.getByLabel('Pausar simulación'), 'requiere VITE_MOCK_AUTH=true').toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /VJ-DEMO-CR-01/ })).toBeVisible({ timeout: 15000 });
}

const tarjeta = (page: Page, viaje: string) => page.getByRole('button', { name: new RegExp(viaje) });
const panel = (page: Page, viaje: string) => page.getByRole('complementary', { name: viaje });

test.describe('Tracking — monitoreo (mock)', () => {
  test('KPIs por viaje y lista de activos', async ({ page }) => {
    await abrirTracking(page);
    const kpis = page.getByRole('group', { name: 'Resumen de viajes' });
    for (const nombre of ['En ruta', 'A tiempo', 'Retrasados', 'Sin señal', 'Completados hoy']) {
      await expect(kpis.getByRole('button', { name: new RegExp(nombre) })).toBeVisible();
    }
    await expect(kpis).not.toContainText(/Entregas|Novedades|Por revisar/);
    await expect(tarjeta(page, 'VJ-DEMO-CR-C1')).toHaveCount(0); // completado: no está en "Activos"
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    await expect(tarjeta(page, 'VJ-DEMO-CR-C1')).toBeVisible();
  });

  test('el panel es de solo lectura y muestra factura firmada y firma', async ({ page }) => {
    await abrirTracking(page);
    await tarjeta(page, 'VJ-DEMO-CR-01').click();
    const detalle = panel(page, 'VJ-DEMO-CR-01');
    await expect(detalle.getByText('Pedidos del viaje')).toBeVisible();
    await detalle.getByText('Abastos El Progreso').click();
    await expect(detalle.getByText('Factura firmada')).toBeVisible();
    await expect(detalle.getByText('Firma digital')).toBeVisible();
    await expect(detalle).not.toContainText(/Completar viaje|Marcar revisado|Novedades|Devoluciones|Google Maps|Waze/);
    await detalle.getByLabel('Cerrar').click();
    await expect(detalle).toHaveCount(0);
  });

  test('un KPI filtra la lista y otro clic quita el filtro', async ({ page }) => {
    await abrirTracking(page);
    const sinSenal = page.getByRole('group', { name: 'Resumen de viajes' }).getByRole('button', { name: /Sin señal/ });
    await sinSenal.click();
    await expect(tarjeta(page, 'VJ-DEMO-CR-03')).toBeVisible();
    await expect(tarjeta(page, 'VJ-DEMO-CR-01')).toHaveCount(0);
    await sinSenal.click();
    await expect(tarjeta(page, 'VJ-DEMO-CR-01')).toBeVisible();
  });

  test('al alejar el mapa los camiones encimados se agrupan y un clic los separa', async ({ page }) => {
    await abrirTracking(page);
    // Esperar a que el mapa encuadre la flota (lo hace al llegar los camiones); si no, ese encuadre deshace el zoom.
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);
    const alejar = page.locator('.leaflet-control-zoom-out');
    for (let i = 0; i < 3; i++) {
      await alejar.click();
      await page.waitForTimeout(400); // animación del zoom
    }
    const burbuja = page.locator('.leaflet-marker-icon', { hasText: /^\d+$/ }).first();
    await expect(burbuja).toBeVisible({ timeout: 5000 });
    const antes = await page.locator('.leaflet-marker-icon', { hasText: /^\d+$/ }).count();
    await burbuja.click();
    await expect.poll(async () => page.locator('.leaflet-marker-icon', { hasText: /^\d+$/ }).count()).toBeLessThan(antes);
  });

  test('simular que Planificación termina un viaje lo saca de Activos', async ({ page }) => {
    await abrirTracking(page);
    await tarjeta(page, 'VJ-DEMO-CR-06').click();
    const detalle = panel(page, 'VJ-DEMO-CR-06');
    await expect(detalle.getByText(/Pruebas \(mock\)/)).toBeVisible();
    await detalle.getByRole('button', { name: 'Completar' }).click();
    await expect(detalle.getByText('Completado')).toBeVisible();
    await expect(tarjeta(page, 'VJ-DEMO-CR-06')).toHaveCount(0);
  });
});

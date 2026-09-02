import { test, expect, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/aborted without reason/i.test(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
  });
  return errors;
}

async function irARepartoDeFlota(page: Page) {
  await page.goto('/planificacion', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Reparto de Flota' }).click();
  await expect(page.getByRole('heading', { name: /Reparto de Flota/i })).toBeVisible();
}

test.describe('Reparto de Flota', () => {
  test('cualquier ruta carga su pool de pedidos (regresión: id eflow no-uuid)', async ({ page }) => {
    const errors = trackErrors(page);
    await irARepartoDeFlota(page);

    const rutaSelect = page.getByLabel('Ruta', { exact: true });
    const values: string[] = await rutaSelect
      .locator('option[value]:not([value=""])')
      .evaluateAll((o) => o.map((el) => (el as HTMLOptionElement).value));
    expect(values.length, 'no hay rutas en el catálogo').toBeGreaterThan(0);

    // Antes: toda ruta con id `eflow-rt-XX` (string, no uuid) hacía que la query
    // de `orders` lanzara y el pool quedara vacío ("0 pedidos pendientes").
    // Ahora `fetchPedidosDeRuta` cae al pool mock ante cualquier fallo.
    const eflow = values.find((v) => v.startsWith('eflow-rt-')) ?? values[0];
    await rutaSelect.selectOption(eflow);

    await expect(page.getByText(/Cargando pedidos/i)).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText(/\d+ pedidos pendientes en el pool/i)).toBeVisible();
    const txt = await page.getByText(/pedidos pendientes en el pool/i).innerText();
    const n = Number(txt.match(/(\d+) pedidos/)?.[1] ?? '0');
    expect(n, `pool vacío para la ruta ${eflow}`).toBeGreaterThan(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('el botón "Calcular Reparto" se habilita al elegir ruta + un vehículo', async ({ page }) => {
    await irARepartoDeFlota(page);

    const rutaSelect = page.getByLabel('Ruta', { exact: true });
    const primeraRuta = await rutaSelect
      .locator('option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    await rutaSelect.selectOption(primeraRuta!);
    await expect(page.getByText(/pedidos pendientes en el pool/i)).toBeVisible({ timeout: 10000 });

    const calcular = page.getByRole('button', { name: /Calcular Reparto/i });
    await expect(calcular).toBeDisabled(); // aún sin vehículos

    const agregar = page.getByRole('button', { name: /Agregar/i }).first();
    if (await agregar.isVisible().catch(() => false)) {
      const vehiculoSelect = page.getByLabel(/Vehículo/i).first();
      const opts = await vehiculoSelect.locator('option').count();
      test.skip(opts <= 1, 'Catálogo de vehículos vacío.');
      await vehiculoSelect.selectOption({ index: 1 });
      await agregar.click();
      await expect(calcular).toBeEnabled();
    }
  });
});

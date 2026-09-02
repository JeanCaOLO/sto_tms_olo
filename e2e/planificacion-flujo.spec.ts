import { test, expect, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    // "signal is aborted without reason" = fetch de enriquecimiento cancelado
    // al re-render; es ruido esperado, no un fallo de la app.
    if (msg.type() === 'error' && !/aborted without reason/i.test(msg.text())) {
      errors.push(`console: ${msg.text()}`);
    }
  });
  return errors;
}

// El tab sirve viajes reales de EFLOW QA cuando `server/` (:4000) está arriba, y
// los 4 viajes mock (`VJ-MOCK-*`) cuando no. Estos helpers dejan las pruebas
// agnósticas al origen de datos: seleccionan por posición, no por etiqueta fija.

/** Valores de las <option> de viaje con value no vacío (incluye las de optgroup). */
async function viajeOptionValues(page: Page): Promise<string[]> {
  return page
    .getByLabel('Viaje (WMS)')
    .locator('option[value]:not([value=""])')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
}

async function seleccionarPrimerViaje(page: Page): Promise<string> {
  const values = await viajeOptionValues(page);
  expect(values.length, 'el selector de viaje no trae ninguna opción').toBeGreaterThan(0);
  await page.getByLabel('Viaje (WMS)').selectOption(values[0]);
  await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });
  return values[0];
}

/** ¿Estamos con los fixtures mock (`VJ-MOCK-*`) o con datos reales de QA? */
async function esDataMock(page: Page): Promise<boolean> {
  const values = await viajeOptionValues(page);
  return values.some((v) => v.startsWith('VJ-MOCK-'));
}

test.describe('Planificación — flujo de generación de ruta', () => {
  test('seleccionar viaje, incluir pedidos, optimizar y generar ruta', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/planificacion', { waitUntil: 'networkidle' });

    // 1. Seleccionar el primer viaje disponible
    await seleccionarPrimerViaje(page);
    await expect(page.getByLabel('Ruta', { exact: true })).not.toHaveValue('');

    // 2. El WMS ya agrupó los pedidos al viaje — seleccionar el viaje deja sus
    // paradas incluidas por defecto, sin click manual.
    await expect(page.getByTitle('Incluir en la ruta')).toHaveCount(0);
    const totalPedidos = await page.getByTitle('Excluir de la ruta').count();
    expect(totalPedidos, 'el viaje debería traer al menos una parada').toBeGreaterThan(0);
    await expect(page.getByText(/paradas en ruta/i)).toContainText(String(totalPedidos));

    // 3. Catálogos (EFLOW real o fallback) — conductor/vehículo
    const conductorSelect = page.getByLabel('Conductor');
    const vehiculoSelect = page.getByLabel('Vehículo');
    const conductorOptions = await conductorSelect.locator('option').count();
    const vehiculoOptions = await vehiculoSelect.locator('option').count();
    if (conductorOptions <= 1 || vehiculoOptions <= 1) {
      test.skip(true, 'Catálogos de conductor/vehículo vacíos — no se puede completar la generación.');
    }
    await conductorSelect.selectOption({ index: 1 });
    await vehiculoSelect.selectOption({ index: 1 });

    // 4. Optimizar paradas (OSRM real o fallback haversine) — solo si hay ≥2
    if (totalPedidos >= 2) {
      const optimizarBtn = page.getByRole('button', { name: /optimizar paradas/i });
      await optimizarBtn.click();
      await expect(optimizarBtn).toBeEnabled({ timeout: 15000 });
    }

    // 5. Generar ruta
    const generarBtn = page.getByRole('button', { name: /generar ruta/i });
    await expect(generarBtn).toBeEnabled({ timeout: 5000 });
    await generarBtn.click();

    // 6. Toast de éxito
    await expect(page.getByText(/ruta .* generada con \d+ paradas/i)).toBeVisible({ timeout: 10000 });

    // 7. Aparece en "Rutas Generadas"
    await page.getByRole('button', { name: /rutas generadas/i }).click();
    await expect(page.locator('body')).toContainText(/RT-MOCK-\d+|·/i);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('pedido de excepción sin coordenadas muestra su dirección real', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/planificacion', { waitUntil: 'networkidle' });

    test.skip(!(await esDataMock(page)), 'Requiere el fixture mock Viaje 2 (pedido de excepción).');

    await page.getByLabel('Viaje (WMS)').selectOption({ value: 'VJ-MOCK-002' });
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Excepción', { exact: true })).toBeVisible();
    // Regresión: exception_address_raw se capturaba pero no se renderizaba.
    // Debe aparecer en PedidoCard y en ParadaCard.
    await expect(page.getByText(/Entregar en sucursal de Tres Ríos/i)).toHaveCount(2);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('FR16 — un viaje con devolución muestra el badge "Devolución"', async ({ page }) => {
    await page.goto('/planificacion', { waitUntil: 'networkidle' });

    // `getFallbackPedidos` marca los índices 8 y 14 como devolución, así que
    // todo viaje (real o mock) que use ese pool las trae. Recorremos las
    // opciones hasta encontrar una que muestre el badge.
    const values = await viajeOptionValues(page);
    let encontrada = false;
    for (const v of values.slice(0, 5)) {
      await page.getByLabel('Viaje (WMS)').selectOption(v);
      await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });
      if (await page.getByText('Devolución', { exact: true }).first().isVisible().catch(() => false)) {
        encontrada = true;
        break;
      }
    }
    expect(encontrada, 'ningún viaje de los primeros 5 mostró el badge Devolución').toBe(true);

    // BR1.4: la distinción lleva texto visible, no solo color.
    await expect(page.getByText('Devolución', { exact: true }).first()).toBeVisible();
  });

  test('cambiar de viaje reemplaza las paradas del viaje anterior (no las acumula)', async ({ page }) => {
    await page.goto('/planificacion', { waitUntil: 'networkidle' });
    const values = await viajeOptionValues(page);
    test.skip(values.length < 2, 'Se necesitan al menos 2 viajes para esta prueba.');
    const viajeSelect = page.getByLabel('Viaje (WMS)');

    await viajeSelect.selectOption(values[0]);
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });
    const n0 = await page.getByTitle('Excluir de la ruta').count();
    expect(n0).toBeGreaterThan(0);

    // Excluyo un pedido: ese estado también debe descartarse al cambiar de viaje.
    await page.getByTitle('Excluir de la ruta').first().click();
    await expect(page.getByText(/paradas en ruta/i)).toContainText(String(n0 - 1));

    await viajeSelect.selectOption(values[1]);
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });

    // Si el reset fallara, seguiría en n0-1 (arrastrado). Debe reflejar el
    // pool completo del nuevo viaje y ningún botón "Incluir" (todo incluido).
    const n1 = await page.getByTitle('Excluir de la ruta').count();
    expect(n1).toBeGreaterThan(0);
    await expect(page.getByText(/paradas en ruta/i)).toContainText(String(n1));
    await expect(page.getByTitle('Incluir en la ruta')).toHaveCount(0);
  });
});

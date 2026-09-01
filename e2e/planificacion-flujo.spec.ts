import { test, expect, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

test.describe('Planificación — flujo de generación de ruta', () => {
  test('seleccionar viaje, optimizar y generar ruta', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/planificacion', { waitUntil: 'networkidle' });

    // 1. Seleccionar viaje
    await page.getByLabel('Viaje (WMS)').selectOption({ label: 'Viaje 1' });
    await expect(page.getByLabel('Ruta', { exact: true })).not.toHaveValue('');

    // 2. El WMS ya agrupó los pedidos al viaje (regla de negocio: "TMS no
    // reasigna ruta↔pedido", Reunión 2026-08-18) — seleccionar el viaje deja
    // sus pedidos incluidos en la ruta por defecto, sin click manual.
    // "Excluir de la ruta" solo existe en PedidoCard (panel izquierdo), así
    // que su conteo está naturalmente acotado a ese panel.
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTitle('Incluir en la ruta')).toHaveCount(0);
    const totalPedidos = await page.getByTitle('Excluir de la ruta').count();
    expect(totalPedidos).toBe(5); // fallback-viajes.ts: Viaje 1 = 5 pedidos
    await expect(page.getByText(/paradas en ruta/i)).toContainText(String(totalPedidos));

    // 3. Catálogos reales (Supabase): transportista/conductor/vehículo —
    // pueden venir vacíos si la org mock no tiene datos seedeados.
    const conductorSelect = page.getByLabel('Conductor');
    const vehiculoSelect = page.getByLabel('Vehículo');
    const conductorOptions = await conductorSelect.locator('option').allTextContents();
    const vehiculoOptions = await vehiculoSelect.locator('option').allTextContents();
    if (conductorOptions.length <= 1 || vehiculoOptions.length <= 1) {
      test.skip(true, 'Catálogos de conductor/vehículo vacíos para la organización mock — no se puede completar el flujo de generación real.');
    }

    await conductorSelect.selectOption({ index: 1 });
    await vehiculoSelect.selectOption({ index: 1 });

    // 4. Optimizar paradas (llama a OSRM o cae a haversine)
    const optimizarBtn = page.getByRole('button', { name: /optimizar paradas/i });
    await optimizarBtn.click();
    await expect(optimizarBtn).toBeEnabled({ timeout: 15000 });

    // 5. Generar ruta
    const generarBtn = page.getByRole('button', { name: /generar ruta/i });
    await expect(generarBtn).toBeEnabled({ timeout: 5000 });
    await generarBtn.click();

    // 6. Toast de éxito
    await expect(page.getByText(/ruta .* generada con \d+ paradas/i)).toBeVisible({ timeout: 10000 });

    // 7. Aparece en "Rutas Generadas" (ruta del Viaje 1 = catálogo eflow real)
    await page.getByRole('button', { name: /rutas generadas/i }).click();
    await expect(page.locator('body')).toContainText(/RT-MOCK-\d+|Casco Central/i);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('pedido de excepción sin coordenadas muestra su dirección real', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/planificacion', { waitUntil: 'networkidle' });

    await page.getByLabel('Viaje (WMS)').selectOption({ label: 'Viaje 2' });
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Excepción', { exact: true })).toBeVisible();
    // Regresión: exception_address_raw se capturaba en el pedido mock pero
    // no se renderizaba en ningún lado — el operador no veía a dónde
    // entregar realmente. Debe aparecer en PedidoCard y en ParadaCard.
    await expect(page.getByText(/Entregar en sucursal de Tres Ríos/i)).toHaveCount(2);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('FR16 — un viaje con devolución muestra el badge "Devolución" y el subtotal de capacidad', async ({ page }) => {
    await page.goto('/planificacion', { waitUntil: 'networkidle' });

    // Viaje 1 tiene una parada marcada como devolución (fallback-viajes.ts:
    // ORD-MOCK-015). BR1.4: la distinción lleva texto visible, no sólo color.
    await page.getByLabel('Viaje (WMS)').selectOption({ label: 'Viaje 1' });
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Devolución', { exact: true }).first()).toBeVisible();

    // Con vehículo seleccionado, ConfiguracionRuta muestra la línea de
    // subtotales de devoluciones bajo las barras de capacidad.
    const vehiculoSelect = page.getByLabel('Vehículo');
    const vehiculoOptions = await vehiculoSelect.locator('option').allTextContents();
    test.skip(vehiculoOptions.length <= 1, 'Catálogo de vehículos vacío para la organización mock.');
    await vehiculoSelect.selectOption({ index: 1 });
    await expect(page.getByText(/de \d+ devoluci/i)).toBeVisible({ timeout: 10000 });
  });

  test('cambiar de viaje reemplaza las paradas del viaje anterior (no las acumula)', async ({ page }) => {
    await page.goto('/planificacion', { waitUntil: 'networkidle' });
    const viajeSelect = page.getByLabel('Viaje (WMS)');

    await viajeSelect.selectOption({ label: 'Viaje 1' });
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/paradas en ruta/i)).toContainText('5');

    // Excluyo manualmente un pedido para verificar que ese estado también
    // se descarta al cambiar de viaje (no debería "arrastrarse").
    await page.getByTitle('Excluir de la ruta').first().click();
    await expect(page.getByText(/paradas en ruta/i)).toContainText('4');

    await viajeSelect.selectOption({ label: 'Viaje 3' });
    await expect(page.getByText(/pedidos pendientes asignados/i)).toBeVisible({ timeout: 10000 });

    // Viaje 3 también tiene 5 pedidos (fallback-viajes.ts) — si el reset
    // fallara, seguiría en 4 (arrastrado de Viaje 1) en vez de 5.
    await expect(page.getByText(/paradas en ruta/i)).toContainText('5');
    await expect(page.getByTitle('Incluir en la ruta')).toHaveCount(0);
  });
});

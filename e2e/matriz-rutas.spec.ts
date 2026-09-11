import { test, expect, type Page } from '@playwright/test';

async function irAMatrizDeRutas(page: Page) {
  await page.goto('/planificacion', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Matriz de Rutas' }).click();
}

test.describe('Matriz de Rutas — COFERSA', () => {
  test('muestra la leyenda de colores (no solo texto) con sus 5 estados', async ({ page }) => {
    await irAMatrizDeRutas(page);

    const leyenda = page.getByRole('list', { name: /Leyenda de la matriz de rutas COFERSA/i });
    await expect(leyenda).toBeVisible();
    for (const etiqueta of [
      'Carga',
      'Entrega',
      'Carga y entrega mismo día',
      'Cita previa',
      'Sin actividad',
    ]) {
      await expect(leyenda.getByText(etiqueta, { exact: true })).toBeVisible();
    }
  });

  test('la ruta de cita previa (44 REY) lleva su chip, no marcas de día', async ({ page }) => {
    await irAMatrizDeRutas(page);

    const tabla = page.getByRole('region', { name: /Tabla: COFERSA/i });
    const filaRey = tabla.getByRole('row').filter({ hasText: 'REY' });
    await expect(filaRey).toBeVisible();
    await expect(filaRey.getByText('Cita previa', { exact: true })).toBeVisible();
    // Sus celdas de día no muestran carga/entrega.
    await expect(filaRey.getByText('✕')).toHaveCount(0);
  });

  test('las rutas GAM entre semana muestran el estado "carga y entrega mismo día"', async ({ page }) => {
    await irAMatrizDeRutas(page);

    const tabla = page.getByRole('region', { name: /Tabla: COFERSA/i });
    // "1 Casco" es GAM → lunes..viernes con el glifo "ambos" (aria-label).
    const filaCasco = tabla.getByRole('row').filter({ hasText: /^1 Casco/ }).first();
    await expect(filaCasco).toBeVisible();
    await expect(
      filaCasco.getByLabel('Carga y entrega el mismo día').first(),
    ).toBeVisible();
  });

  test('el selector de sistema alterna a "Asignación de Viajes" y oculta la leyenda', async ({ page }) => {
    await irAMatrizDeRutas(page);
    await expect(page.getByRole('list', { name: /Leyenda de la matriz/i })).toBeVisible();

    await page.getByRole('button', { name: 'Asignación de Viajes' }).click();
    await expect(page.getByRole('list', { name: /Leyenda de la matriz/i })).toHaveCount(0);
  });
});

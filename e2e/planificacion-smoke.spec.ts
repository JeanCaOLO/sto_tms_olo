import { test, expect, type Page } from '@playwright/test';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

test('home carga sin errores', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/.+/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('planificacion carga y renderiza contenido', async ({ page }) => {
  const errors = trackErrors(page);
  const resp = await page.goto('/planificacion', { waitUntil: 'networkidle' });
  expect(resp?.status()).toBeLessThan(400);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Planificación de Rutas' })).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('los campos del formulario tienen label asociado (a11y)', async ({ page }) => {
  await page.goto('/planificacion', { waitUntil: 'networkidle' });
  // Regresión: Select/Input (src/components/base) deben asociar <label
  // htmlFor> con el id de su control — si no, getByLabel deja de resolver.
  await expect(page.getByLabel('Viaje (WMS)')).toBeVisible();
  await expect(page.getByLabel('Ruta', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Conductor')).toBeVisible();
  await expect(page.getByLabel('Vehículo')).toBeVisible();
  await expect(page.getByLabel('Fecha de Ruta')).toBeVisible();
});

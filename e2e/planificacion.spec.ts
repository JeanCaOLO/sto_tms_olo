import { test, expect, type Page } from '@playwright/test';

// E2E del flujo NUEVO (automático) de Planificación 2, contra la app ya
// corriendo en :3000 (backend :4000). El planificador elige el día, genera un
// plan (draft) con viajes+paradas y lo confirma; la pestaña "Planificaciones"
// lista los planes.
//
// La data es real (Aurora compartida), así que el conteo exacto de un día puede
// variar entre corridas. El BRIEF documenta 2026-09-22=7 y 2026-09-23=4 como
// días con pedidos; el test prueba con esos días pero afirma el COMPORTAMIENTO
// (día en texto, chip de conteo, viajes al generar, confirmación, listado), no
// un número fijo, para no ser frágil al dato vivo.
//
// Selectores por texto/rol (la app corre en español, es el idioma por defecto).
// Login: la página no asocia <label htmlFor>, así que se usan los placeholders.
// Los botones Generar/Confirmar y las pestañas llevan data-testid (agregados en
// el TSX) porque "Generar plan" coincide con el rótulo de la pestaña.

const DIAS_CANDIDATOS = ['2026-09-22', '2026-09-23'];

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  // Mock auth activo: cualquier email/clave entra. Si ya hay sesión, la app
  // redirige fuera de /login y estos campos no aparecen — lo contemplamos.
  const emailInput = page.getByPlaceholder('usuario@empresa.com');
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill('e2e@test.com');
    await page.getByPlaceholder('••••••••').fill('e2e-password');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 });
  }
}

async function irAPlanificacion(page: Page): Promise<void> {
  await page.goto('/planificacion', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Planificación de Rutas' })).toBeVisible({ timeout: 15000 });
  // El editor (con el botón Generar por testid) monta tras cargar catálogos/pedidos.
  await expect(page.getByTestId('generar-plan')).toBeVisible({ timeout: 15000 });
}

// El chip de pedidos se rotula "<n> pedidos". Devuelve el conteo actual.
async function conteoPedidos(page: Page): Promise<number> {
  const chip = page.getByText(/\d+\s+pedidos/i).first();
  await expect(chip).toBeVisible({ timeout: 15000 });
  const txt = (await chip.innerText()).trim();
  const m = txt.match(/(\d+)\s+pedidos/i);
  return m ? Number(m[1]) : 0;
}

// Selecciona un día y espera la RESPUESTA de red de los pedidos de ESE día
// antes de leer el panel — evita la carrera entre el fill de la fecha y el
// refetch asíncrono (leer el chip antes daba el conteo del día anterior).
async function seleccionarDiaYEsperar(page: Page, fecha: string): Promise<number> {
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`pedidos?fecha_entrega=${fecha}`),
      { timeout: 20000 },
    ),
    page.getByLabel('Día del plan').fill(fecha),
  ]);
  const body = await resp.json().catch(() => ({ data: [] }));
  const conteo = Array.isArray(body?.data) ? body.data.length : 0;
  // El chip debe reflejar ese conteo, y el botón Generar habilitado ⇔ hay pedidos.
  await expect(page.getByText(new RegExp(`\\b${conteo}\\s+pedidos`, 'i')).first()).toBeVisible({ timeout: 10000 });
  if (conteo > 0) await expect(page.getByTestId('generar-plan')).toBeEnabled();
  else await expect(page.getByTestId('generar-plan')).toBeDisabled();
  return conteo;
}

test.describe('Planificación 2 — flujo automático', () => {
  test('generar un plan de un día con pedidos, confirmarlo y verlo en Planificaciones', async ({ page }) => {
    await login(page);
    await irAPlanificacion(page);

    // 3-4. Elegir un día con pedidos (de los candidatos del BRIEF) y verificar
    // que el panel muestra el día en texto y un chip de conteo > 0.
    let diaUsado = '';
    let conteo = 0;
    for (const dia of DIAS_CANDIDATOS) {
      conteo = await seleccionarDiaYEsperar(page, dia);
      if (conteo > 0) { diaUsado = dia; break; }
    }
    expect(conteo, `ningún día candidato (${DIAS_CANDIDATOS.join(', ')}) trajo pedidos`).toBeGreaterThan(0);

    // El día se muestra en texto (formatearDia → "…N de <mes>").
    const diaNum = Number(diaUsado.slice(8, 10));
    await expect(page.getByText(new RegExp(`${diaNum} de \\w+`, 'i')).first()).toBeVisible();

    // 5. Generar → aparecen tarjetas de ruta (al menos 1) con paradas.
    await page.getByTestId('generar-plan').click();
    await expect(page.getByText(/^Ruta 1$/).first()).toBeVisible({ timeout: 20000 });
    const viajes = page.getByText(/^Ruta \d+$/);
    expect(await viajes.count(), 'debería generarse al menos una ruta').toBeGreaterThan(0);
    // Cada tarjeta muestra un chip de paradas ("N paradas" | "1 parada").
    await expect(page.getByText(/\d+\s+paradas?/).first()).toBeVisible();

    // 6. Confirmar → onConfirmed cambia a la pestaña Planificaciones.
    const confirmar = page.getByTestId('confirmar-plan');
    await expect(confirmar).toBeVisible({ timeout: 10000 });
    await confirmar.click();

    // 7. Pestaña Planificaciones: al menos un plan listado (no el vacío).
    await page.getByTestId('tab-planes').click();
    await expect(page.getByText('No hay planificaciones para este estado.')).toHaveCount(0, { timeout: 15000 });
    // Un plan listado muestra "N rutas" — evidencia de que hay filas.
    await expect(page.getByText(/\d+\s+rutas/).first()).toBeVisible({ timeout: 15000 });
  });

  test('un día sin pedidos deja el botón Generar deshabilitado y el chip en 0', async ({ page }) => {
    await login(page);
    await irAPlanificacion(page);

    // Un día lejano sin operación (feriado del calendario, sin pedidos alistados)
    // → 0 pedidos y botón Generar deshabilitado (pedidosCount === 0).
    const conteo = await seleccionarDiaYEsperar(page, '2030-01-01');
    expect(conteo, 'un día lejano no debería traer pedidos').toBe(0);
    await expect(page.getByTestId('generar-plan')).toBeDisabled();
    await expect(page.getByText(/\b0\s+pedidos/i)).toBeVisible();
  });
});

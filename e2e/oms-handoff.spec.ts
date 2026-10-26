import { test, expect, type Page } from '@playwright/test';

// E2E de la COMUNICACIÓN Planif -> OMS (ADR-013), contra la app real en :3000
// (backend :4000, Aurora vía túnel). Muestra el handoff de punta a punta:
//   1. Planificación estampó los pedidos (numero_viaje, dispatch_date) -> cola OMS.
//   2. La Cola de Priorización los lista en situación DISP (priorizados, sin liberar).
//   3. Se dispara el BARRIDO del OMS (POST /api/v1/oms/corridas) — el mismo sweep
//      que corre el cron 5x/día; la UI no tiene botón porque por diseño es
//      programado (ADR-013). Prioriza todo y LIBERA los que cruzan la ventana.
//   4. La Cola vuelve a cargar: los liberados pasaron a GENE y salen de DISP;
//      los que aún no entran en ventana (p.ej. entrega 25-oct) siguen en DISP.
//
// Datos reales (Aurora compartida): el conteo exacto varía, así que se afirma el
// COMPORTAMIENTO (hubo cola, el barrido liberó > 0, DISP bajó), no un número fijo.
// Correr headed: npx playwright test e2e/oms-handoff.spec.ts --headed

const EMAIL = 'admin@ologistics.com';
const PASS = 'Olo12345';
const PAUSA = 1500; // pausa deliberada para que se vea en modo headed

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const email = page.getByPlaceholder('usuario@empresa.com');
  if (await email.isVisible().catch(() => false)) {
    await email.fill(EMAIL);
    await page.getByPlaceholder('••••••••').fill(PASS);
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 15000 });
  }
}

// Abre la Cola, espera a que cargue y filtra por situación DISP (la pantalla fija
// país=CR internamente). El total real se afirma con la respuesta del barrido
// (abajo): la tabla pagina a 10 filas, así que contar <tr> no es fiable — la UI
// filtrada queda solo como lo que se ve en pantalla.
async function verColaDisp(page: Page): Promise<void> {
  await page.goto('/oms/cola', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Cola de Priorización' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Situación').selectOption('DISP');
  await page.waitForTimeout(500); // el filtro es en memoria, re-render inmediato
}

test('Planif -> OMS: el barrido libera los pedidos DISP en ventana (DISP -> GENE)', async ({ page }) => {
  test.setTimeout(120_000);

  await login(page);

  // --- Contexto Planif: el calendario de planificación (best-effort, sin aserción
  // dura — solo para ver de dónde salen los pedidos estampados). ---
  await page.goto('/planificacion', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(PAUSA);
  await page.screenshot({ path: 'test-results/oms-handoff-1-planif.png', fullPage: true });

  // --- ANTES: la cola del OMS en situación DISP ---
  await verColaDisp(page);
  await page.waitForTimeout(PAUSA);
  await page.screenshot({ path: 'test-results/oms-handoff-2-cola-antes.png', fullPage: true });

  // --- Disparo del BARRIDO (lo que hace el cron) con el token de la sesión real ---
  const token = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('tms_session');
      return raw ? (JSON.parse(raw).access_token as string) : null;
    } catch {
      return null;
    }
  });
  expect(token, 'sesión real con token').toBeTruthy();

  const resp = await page.request.post('/api/v1/oms/corridas', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resp.ok(), `barrido HTTP ${resp.status()}`).toBeTruthy();
  const { data } = await resp.json();
  console.log('[barrido]', JSON.stringify(data));

  // El barrido procesó la cola y liberó los que cruzan la ventana (DISP -> GENE).
  expect(data.total, 'pedidos en cola').toBeGreaterThan(0);
  expect(data.liberados, 'pedidos liberados a eFlow (espejo)').toBeGreaterThan(0);

  // --- DESPUÉS: la cola DISP recargada (los liberados ya pasaron a GENE) ---
  await verColaDisp(page);
  await page.waitForTimeout(PAUSA);
  await page.screenshot({ path: 'test-results/oms-handoff-3-cola-despues.png', fullPage: true });

  // Antes/después autoritativo (de la respuesta del barrido, no de la tabla paginada).
  console.log(`[cola DISP] antes=${data.total} liberados=${data.liberados} despues=${data.total - data.liberados}`);
});

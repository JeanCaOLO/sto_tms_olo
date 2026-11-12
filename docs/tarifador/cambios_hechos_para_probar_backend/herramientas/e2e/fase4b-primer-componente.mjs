import { session, go, step, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
await step(ctx, 'H9 primer componente de una compañía sin estructura propia', async () => {
  await go(ctx, '/tarifas/costos-flota?flota=externa');
  const rows = p.locator('main table').last().locator('tbody tr');
  const row = rows.filter({ hasText: 'Transosa' }).first();
  await row.locator('button[title="Estructura de costos de esta compañía"]').click(); await p.waitForTimeout(1500);
  await p.locator('.fixed input[placeholder="Salario del chofer"]').fill('Primer componente');
  await p.locator('.fixed input[type="number"]').first().fill('4321');
  await p.locator('.fixed button:has-text("Agregar")').last().click(); await p.waitForTimeout(1800);
  await shot(ctx, 'f4b-primer-componente');
  const body = await bodyText(ctx);
  const error = body.match(/(Error|NOT NULL|null value|violates|no se pudo)[^.]{0,120}/i)?.[0];
  return `aparece=${/Primer componente/.test(body)}; error=${error ?? 'ninguno'}`;
});
await finish(ctx, 'fase4b');

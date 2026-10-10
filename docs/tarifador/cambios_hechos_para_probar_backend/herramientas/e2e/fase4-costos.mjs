import { session, go, step, harvest, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
p.on('dialog', (d) => d.accept());
const opsStr = async () => (await harvest(ctx)).map((o) => `${o.op}:${o.table}`).join(', ') || 'sin ops';
await go(ctx, '/tarifas/costos-flota?flota=externa');
const row = () => p.locator('main table').last().locator('tbody tr').first();
await step(ctx, 'V1 agregar variable propia', async () => {
  await row().locator('button[title="Variables propias de esta compañía"]').click(); await p.waitForTimeout(1200);
  await p.locator('.fixed input[placeholder="horas_espera"]').fill('aud_var');
  await p.locator('.fixed input[placeholder="Horas de espera"]').fill('Variable de auditoría');
  await p.locator('.fixed input[placeholder="15"]').fill('15');
  await p.locator('.fixed button:has-text("Agregar variable")').click(); await p.waitForTimeout(1500);
  const shown = /Variable de auditoría/.test(await bodyText(ctx));
  if (!shown) throw new Error('no aparece en la lista: ' + (await bodyText(ctx)).match(/(Error|inválid|prefijo|custom)[^.]{0,100}/i)?.[0]);
  return await opsStr();
});
await step(ctx, 'V2 desactivar y reactivar variable', async () => {
  const r = p.locator('.fixed tr, .fixed li', { hasText: 'Variable de auditoría' }).first();
  const titles = await r.locator('button').evaluateAll((b) => b.map((x) => x.title || x.innerText));
  const off = r.locator('button[title*="esactivar"]').first(); await off.click(); await p.waitForTimeout(1000);
  const on = p.locator('.fixed tr, .fixed li', { hasText: 'Variable de auditoría' }).first().locator('button[title*="eactivar"]').first(); await on.click(); await p.waitForTimeout(1000);
  return `botones ${titles.join('|')}; ${await opsStr()}`;
});
await p.locator('.fixed button:has-text("Cerrar")').last().click().catch(() => {}); await p.waitForTimeout(500);
await step(ctx, 'C1 estructura externa: guardar parámetros', async () => {
  await row().locator('button[title="Estructura de costos de esta compañía"]').click(); await p.waitForTimeout(1500);
  await p.locator('.fixed button:has-text("Guardar parámetros")').click(); await p.waitForTimeout(1500);
  return `${await opsStr()}; mensaje: ${(await bodyText(ctx)).match(/(guardad|Error|no se pudo)[^.]{0,100}/i)?.[0] ?? 'ninguno'}`;
});
await step(ctx, 'C2 agregar componente de costo', async () => {
  await p.locator('.fixed input[placeholder="Salario del chofer"]').fill('Costo de auditoría');
  const nums = p.locator('.fixed input[type="number"]'); await nums.first().fill('1234');
  await p.locator('.fixed button:has-text("Agregar")').last().click(); await p.waitForTimeout(1500);
  const shown = /Costo de auditoría/.test(await bodyText(ctx));
  await shot(ctx, 'f4-componente');
  return `aparece=${shown}; ${await opsStr()}; msg: ${(await bodyText(ctx)).match(/(Error|obligatori|inválid|no se pudo)[^.]{0,100}/i)?.[0] ?? '-'}`;
});
await finish(ctx, 'fase4-costos');

import { session, go, step, harvest, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session();
const p = ctx.page;
await go(ctx, '/reglas-tarifa');

const fillBasic = async (code, name, amount) => {
  await p.getByPlaceholder('BONO-PEAJES').fill(code);
  await p.getByPlaceholder('Bono por peaje transitado').fill(name);
  await p.locator('input[placeholder="20.00"]').fill(String(amount));
};
const rowOf = (code) => p.locator('tr', { hasText: code }).first();

await step(ctx, 'R1 crear regla', async () => {
  await p.getByRole('button', { name: 'Nueva Regla' }).click();
  await fillBasic('R_AUD_1', 'Regla de auditoría', 1500);
  await p.getByRole('button', { name: 'Crear regla' }).click(); await p.waitForTimeout(1500);
  if (!(await mainText(ctx)).includes('R_AUD_1')) throw new Error('no aparece en la lista');
  return (await mainText(ctx)).match(/(\d+) registros/)?.[0];
});
await step(ctx, 'R2 desactivar con "Guardar cambios" (ejemplo 2)', async () => {
  await rowOf('R_AUD_1').locator('button').first().click(); await p.waitForTimeout(800);
  const chk = p.getByLabel('Regla activa');
  await chk.uncheck();
  await shot(ctx, 'f2-desactivar-modal');
  await p.getByRole('button', { name: /Guardar/ }).click(); await p.waitForTimeout(1500);
  const visibleDefault = (await mainText(ctx)).includes('R_AUD_1');
  await p.getByText('Quitar filtro').click().catch(() => {}); await p.waitForTimeout(600);
  const row = (await rowOf('R_AUD_1').innerText()).replace(/\s+/g, ' ');
  if (!/Inactiva/.test(row)) throw new Error('la fila sigue activa: ' + row.slice(0, 120));
  return `tras guardar, con el filtro por defecto la regla ${visibleDefault ? 'sigue visible' : 'DESAPARECE de la lista'}; sin filtro: ${row.slice(-30)}`;
});
await step(ctx, 'R3 reactivar', async () => {
  await rowOf('R_AUD_1').locator('button').first().click(); await p.waitForTimeout(800);
  await p.getByLabel('Regla activa').check();
  await p.getByRole('button', { name: /Guardar/ }).click(); await p.waitForTimeout(1500);
  if (!/Activa/.test(await rowOf('R_AUD_1').innerText())) throw new Error('no reactivó');
});
await step(ctx, 'R4 versión sube al editar', async () => {
  const ops = await harvest(ctx);
  const upd = ops.filter((o) => o.op === 'update' && o.table === 'tarifas_pricing_rules');
  return `versiones enviadas: ${upd.map((o) => o.values.version).join(', ')}; claves extra: ${[...new Set(upd.flatMap((o) => Object.keys(o.values)))].filter((k) => k === 'updated_at').join(',') || '-'}`;
});
await step(ctx, 'R5 persiste tras recarga completa', async () => {
  await harvest(ctx);
  await p.reload(); await p.waitForTimeout(2500);
  const body = await bodyText(ctx);
  return /Iniciar|Ingresar|Login/i.test(body) ? 'el mock pierde la sesión al recargar (esperado)' : 'sesión conservada';
});
await finish(ctx, 'fase2-reglas');

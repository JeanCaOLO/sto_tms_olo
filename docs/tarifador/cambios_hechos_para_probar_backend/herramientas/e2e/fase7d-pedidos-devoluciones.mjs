import { session, go, step, harvest, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
const modal = () => p.locator('.fixed.inset-0');
const total = async () => (await modal().last().innerText()).match(/Total a pagar:\s*(\S+)/)?.[1];
const openTrip = async (carrier, route) => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(500);
  await p.locator('main select').filter({ has: p.locator('option[value="100"]') }).first().selectOption('100').catch(() => {}); await p.waitForTimeout(500);
  const sel = route ? p.locator('main table tbody tr', { hasText: route }) : p.locator('main table tbody tr', { hasText: carrier });
  await sel.filter({ has: p.locator('button:has-text("Liquidar"):not([disabled])') }).first().locator('button:has-text("Liquidar")').click();
  await p.waitForTimeout(3500);
};
await step(ctx, 'O1 anular un pedido y dejar otro «para después»', async () => {
  await openTrip('Transosa');
  const anulableEnSimple = await p.locator('button[title="Sacar el pedido del reparto"]').count();
  await modal().last().getByText('Vista extendida', { exact: true }).click(); await p.waitForTimeout(1500);
  const antes = await total();
  const row1 = modal().last().locator('tbody tr').nth(0);
  await row1.locator('button[title="Sacar el pedido del reparto"]').click();
  await p.getByLabel('Motivo de la anulación').fill('Cliente rechazó el pedido');
  await modal().last().getByRole('button', { name: 'Anular', exact: true }).click(); await p.waitForTimeout(1500);
  const row2 = modal().last().locator('tbody tr').nth(1);
  await row2.locator('button:has-text("Liquidar después")').click(); await p.waitForTimeout(1500);
  await shot(ctx, 'f7d-marcas');
  const despues = await total();
  const estados = await modal().last().locator('tbody tr').evaluateAll((trs) => trs.slice(0, 3).map((t) => t.innerText.replace(/\s+/g, ' ').slice(-70)));
  const ops = (await harvest(ctx)).map((o) => `${o.op}:${o.table}`);
  return `marcas en vista simple: ${anulableEnSimple ? 'sí' : 'NO (solo en vista extendida)'}; total ${antes} → ${despues}; filas: ${estados.join(' || ')}; ops: ${ops.join(', ')}`;
});
await step(ctx, 'O2 emitir con marcas: el historial las cuenta', async () => {
  await p.locator('button:has-text("Emitir liquidación")').last().click(); await p.waitForTimeout(2500);
  const fila = (await p.locator('main table tbody tr.bg-teal-50').first().innerText()).replace(/\s+/g, ' ');
  return fila.slice(0, 220);
});
await step(ctx, 'O3 viaje con devoluciones: aparecen en el modal', async () => {
  await openTrip('Transosa', 'R-20260905');
  await p.getByText('Ver más: pedidos, devoluciones y desglose').click(); await p.waitForTimeout(1200);
  await shot(ctx, 'f7d-devoluciones');
  const txt = (await modal().last().innerText()).replace(/\s+/g, ' ');
  return `devoluciones: ${txt.match(/Devoluciones[^.]{0,200}/)?.[0] ?? 'sin sección visible'}`;
});
await finish(ctx, 'fase7d');

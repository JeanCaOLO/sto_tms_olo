import { session, go, step, mainText, bodyText, shot, finish } from './lib.mjs';
const country = process.argv[2] ?? 'Venezuela';
const ctx = await session({ country });
const p = ctx.page;
await go(ctx, '/liquidaciones');
await p.getByText('Por Liquidar', { exact: true }).first().click().catch(() => {});
const total = await p.locator('main table tbody tr').count();
const kpi = (t) => `${(t.match(/Listos (\d+)/) || [])[1]} listos`;
for (let i = 0; i < Math.min(total - 1, 6); i += 1) {
  await step(ctx, `${country} viaje #${i + 1}`, async () => {
    await go(ctx, '/liquidaciones');
    await p.getByText('Por Liquidar', { exact: true }).first().click().catch(() => {}); await p.waitForTimeout(500);
    const row = p.locator('main table tbody tr').filter({ has: p.locator('button:has-text("Liquidar"):not([disabled])') }).first();
    const num = (await row.locator('td').nth(1).innerText()).trim();
    const who = (await row.locator('td').nth(4).innerText()).trim();
    const btn = row.locator('button:has-text("Liquidar")');
    if (!(await btn.count()) || (await btn.first().isDisabled())) return `${num} (${who}): botón Liquidar deshabilitado`;
    const before = kpi(await mainText(ctx));
    await btn.first().click(); await p.waitForTimeout(3200);
    const emit = p.locator('button:has-text("Emitir liquidación")').last();
    const text = await bodyText(ctx);
    const issue = text.match(/(Bloquea|bloquea|Falta|falta|No se puede|no se puede|Sin lógica|sin lógica|pérdida|margen)[^.]{0,140}/)?.[0] ?? '';
    if (await emit.isDisabled()) { await shot(ctx, `f7-${country}-${i}-bloqueado`); await p.getByRole('button', { name: 'Cancelar' }).last().click().catch(() => {}); return `${num} (${who}): EMITIR DESHABILITADO. ${issue}`; }
    await emit.click(); await p.waitForTimeout(2800);
    const detail = /Emitida el/.test(await bodyText(ctx));
    const err = (await bodyText(ctx)).match(/(Error|No se pudo|bloqueada|blocked)[^.]{0,140}/)?.[0] ?? '';
    await p.getByRole('button', { name: 'Cerrar' }).last().click().catch(() => {}); await p.waitForTimeout(700);
    return `${num} (${who}): ${before} → ${kpi(await mainText(ctx))}; detalle=${detail}${err ? '; MENSAJE: ' + err : ''}`;
  });
}
await finish(ctx, `fase7-${country}`);

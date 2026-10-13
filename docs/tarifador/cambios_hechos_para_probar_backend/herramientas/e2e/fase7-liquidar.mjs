import { session, go, step, harvest, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session();
const p = ctx.page;
const kpi = (t) => `${(t.match(/Listos (\d+)/) || [])[1]} listos / ${(t.match(/Incompletos (\d+)/) || [])[1]} incompletos`;
const route = async (row) => (await row.locator('td').nth(1).innerText()).trim();

async function liquidarCaso(label, carrierText, { extended = false } = {}) {
  await step(ctx, label, async () => {
    await go(ctx, '/liquidaciones');
    await p.getByText('Por Liquidar', { exact: true }).first().click().catch(() => {}); await p.waitForTimeout(600);
    if (extended) await p.getByText('Vista extendida', { exact: true }).click().catch(() => {});
    await p.waitForTimeout(500);
    const before = kpi(await mainText(ctx));
    const row = p.locator('main table tbody tr', { hasText: carrierText }).filter({ has: p.locator('button:has-text("Liquidar"):not([disabled])') }).first();
    const num = await route(row);
    await row.locator('button:has-text("Liquidar")').click(); await p.waitForTimeout(3500);
    const modalOpen = await p.locator('button:has-text("Emitir liquidación")').count();
    if (!modalOpen) throw new Error('no abrió el modal de emisión');
    const emit = p.locator('button:has-text("Emitir liquidación")').last();
    const disabled = await emit.isDisabled();
    if (disabled) { await shot(ctx, `f7-${label.slice(0,4)}-emit-disabled`); throw new Error(`"Emitir" deshabilitado; avisos: ${(await bodyText(ctx)).match(/(bloque|Falta|No se puede)[^.]{0,120}/i)?.[0] ?? 'sin texto'}`); }
    await emit.click(); await p.waitForTimeout(3000);
    const afterEmit = await bodyText(ctx);
    const detailOpen = /Emitida el|Descargar PDF/.test(afterEmit);
    await p.getByRole('button', { name: 'Cerrar' }).last().click().catch(() => {}); await p.waitForTimeout(800);
    const after = kpi(await mainText(ctx));
    const stillThere = (await p.locator('main table tbody tr', { hasText: num }).count()) > 0;
    await p.getByText('Historial', { exact: true }).first().click(); await p.waitForTimeout(1800);
    const inHistory = (await p.locator('main table tbody tr', { hasText: num }).count()) > 0;
    return `${num}: ${before} → ${after}; detalle tras emitir: ${detailOpen}; sigue en Por liquidar: ${stillThere}; en Historial: ${inHistory}`;
  });
}
await liquidarCaso('L1 flota propia OLO (vista simple)', 'OLO (Flota Propia)');
await liquidarCaso('L2 tercero Transosa (vista simple)', 'Transosa');
await liquidarCaso('L3 tercero Ureña (vista extendida)', 'Ureña', { extended: true });
await liquidarCaso('L4 tercero con pernocta (Acuña)', 'Acuña');
await liquidarCaso('L5 transportista sin perfil (Ulloa)', 'Ulloa');

await step(ctx, 'L6 Incompletos: ¿se puede liquidar?', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Incompletos', { exact: false }).nth(1).click().catch(() => {}); await p.waitForTimeout(800);
  const btn = p.locator('main table tbody tr').first().locator('button:has-text("Liquidar")');
  return `filas: ${await p.locator('main table tbody tr').count()}; botón Liquidar ${await btn.count() ? (await btn.first().isDisabled() ? 'deshabilitado' : 'habilitado') : 'ausente'}`;
});
await step(ctx, 'L7 Historial: estados y transición', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Historial', { exact: true }).first().click(); await p.waitForTimeout(1500);
  const rows = await p.locator('main table tbody tr').count();
  await shot(ctx, 'f7-historial');
  const first = p.locator('main table tbody tr').first();
  await first.click({ position: { x: 20, y: 10 } }).catch(() => {}); await p.waitForTimeout(1500);
  const btns = (await p.locator('button').allInnerTexts()).map((x) => x.trim()).filter((x) => /Aprob|Revis|Pagad|Anular|Re-?liquidar|PDF|Cerrar|Borrador/i.test(x));
  await shot(ctx, 'f7-detalle');
  return `${rows} filas en historial; acciones visibles en detalle: ${btns.join(' | ') || 'ninguna'}`;
});
await finish(ctx, 'fase7-liquidar');

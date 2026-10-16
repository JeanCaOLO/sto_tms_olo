import { session, go, step, harvest, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
p.on('dialog', (d) => d.accept());
const kpi = (t) => `${(t.match(/Listos (\d+)/) || [])[1]} listos`;
const hist = async () => { await go(ctx, '/liquidaciones'); await p.getByText('Historial', { exact: true }).first().click(); await p.waitForTimeout(1500); };
const rowByStatus = (st) => p.locator('main table tbody tr').filter({ has: p.locator(`select`) }).filter({ hasText: st }).first();
const statusOf = async (row) => row.locator('select').first().inputValue();

await hist();
const first = p.locator('main table tbody tr').filter({ has: p.locator('select:not([disabled])') }).first();
const num = (await first.locator('td').first().innerText()).trim();
await step(ctx, 'E1 transiciones válidas Borrador→En Revisión→Aprobado→Pagado', async () => {
  const seq = [];
  for (const to of ['En Revisión', 'Aprobado', 'Pagado']) {
    const row = p.locator('main table tbody tr', { hasText: num }).first();
    await row.locator('select').first().selectOption(to); await p.waitForTimeout(1200);
    seq.push(await statusOf(p.locator('main table tbody tr', { hasText: num }).first()));
  }
  return `${num}: ${seq.join(' → ')}`;
});
await step(ctx, 'E2 transición inválida (Pagado→Borrador)', async () => {
  const row = p.locator('main table tbody tr', { hasText: num }).first();
  const opts = await row.locator('select').first().locator('option').allInnerTexts();
  await row.locator('select').first().selectOption('Borrador'); await p.waitForTimeout(1200);
  const now = await statusOf(p.locator('main table tbody tr', { hasText: num }).first());
  const msg = (await bodyText(ctx)).match(/No se puede pasar[^.]{0,80}/)?.[0];
  return `opciones ofrecidas: ${opts.join(',')}; estado final=${now}; mensaje=${msg ?? 'ninguno'}`;
});
await step(ctx, 'E3 anular: el viaje vuelve a Por liquidar', async () => {
  await go(ctx, '/liquidaciones'); await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(700);
  const antes = kpi(await mainText(ctx));
  await p.getByText('Historial', { exact: true }).first().click(); await p.waitForTimeout(1000);
  const row = p.locator('main table tbody tr', { hasText: num }).first();
  await row.locator('select').first().selectOption('Anulado'); await p.waitForTimeout(1500);
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(1200);
  const despues = kpi(await mainText(ctx));
  const back = (await p.locator('main table tbody tr', { hasText: num }).count()) > 0;
  return `${antes} → ${despues}; viaje ${num} reaparece: ${back}`;
});
await step(ctx, 'E4 re-liquidar (botón en historial)', async () => {
  await p.getByText('Historial', { exact: true }).first().click(); await p.waitForTimeout(1000);
  const btn = p.locator('button[title="Re-liquidar el viaje"]:visible').first();
  if (!(await btn.count())) return 'sin botón visible (¿solo estados editables?)';
  await btn.click(); await p.waitForTimeout(3500);
  await shot(ctx, 'f7-reliquidar');
  const reason = p.getByPlaceholder('Por qué se vuelve a liquidar este viaje');
  if (await reason.count()) await reason.fill('Auditoría: recálculo').catch(() => {});
  const emit = p.locator('button:has-text("liquidación"), button:has-text("Re-liquidar")').last();
  const dis = await emit.isDisabled();
  if (!dis) { await emit.click(); await p.waitForTimeout(2800); }
  return `botón "${(await emit.innerText()).trim()}" ${dis ? 'DESHABILITADO' : 'accionado'}; ops: ${(await harvest(ctx)).map((o) => `${o.op}:${o.table}`).join(', ')}`;
});
await finish(ctx, 'fase7b-estados');

import { session, go, step, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
await step(ctx, 'B1 viaje sin zona de destino: no se puede emitir', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(500);
  const before = (await mainText(ctx)).match(/Listos (\d+)/)?.[1];
  const row = p.locator('main table tbody tr', { hasText: 'R-20261007-01-' }).first();
  await row.locator('button:has-text("Liquidar")').click(); await p.waitForTimeout(3500);
  await shot(ctx, 'f7c-bloqueado');
  const emit = p.locator('button:has-text("Emitir liquidación")').last();
  const disabled = await emit.isDisabled();
  const msg = (await bodyText(ctx)).match(/(El viaje no tiene zona de destino|sin ella no se puede tarifar)[^.]{0,120}/)?.[0] ?? 'sin aviso visible';
  await p.getByRole('button', { name: 'Cancelar' }).last().click().catch(() => {}); await p.waitForTimeout(500);
  const after = (await mainText(ctx)).match(/Listos (\d+)/)?.[1];
  return `Emitir deshabilitado=${disabled}; aviso: "${msg}"; Listos ${before} → ${after}`;
});
await finish(ctx, 'fase7c-bloqueo');

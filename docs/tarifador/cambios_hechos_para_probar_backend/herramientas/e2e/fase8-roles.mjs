import { session, go, step, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
const verComo = (label) => p.getByRole('group', { name: 'Ver el sistema como' }).getByRole('button', { name: label }).click();

await step(ctx, 'RO1 «Liquidador»: configuración en solo lectura', async () => {
  await go(ctx, '/reglas-tarifa');
  await verComo('Liquidador'); await p.waitForTimeout(1500);
  await go(ctx, '/reglas-tarifa');
  const nueva = await p.getByRole('button', { name: 'Nueva Regla' }).count();
  const acciones = await p.locator('main table tbody tr').first().locator('button').evaluateAll((b) => b.map((x) => `${x.title || x.innerText}:${x.disabled ? 'off' : 'on'}`));
  await shot(ctx, 'f8-liquidador-reglas');
  return `«Nueva Regla»: ${nueva ? 'visible' : 'oculto'}; acciones de fila: ${acciones.join(', ')}`;
});
await step(ctx, 'RO2 «Liquidador»: puede emitir y se registra la bitácora', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(500);
  const row = p.locator('main table tbody tr').filter({ has: p.locator('button:has-text("Liquidar"):not([disabled])') }).first();
  await row.locator('button:has-text("Liquidar")').click(); await p.waitForTimeout(3500);
  await p.locator('button:has-text("Emitir liquidación")').last().click(); await p.waitForTimeout(2500);
  const ok = (await p.locator('main table tbody tr.bg-teal-50').count()) > 0;
  return `emisión ${ok ? 'correcta (fila resaltada en el Historial)' : 'FALLÓ: ' + ((await bodyText(ctx)).match(/(permiso|403|Error)[^.]{0,100}/)?.[0] ?? '')}; aviso de bitácora: ${/no quedó registrado/.test(await bodyText(ctx)) ? 'SÍ (mal)' : 'no'}`;
});
await step(ctx, 'RO3 volver a «Desarrollador»', async () => {
  await verComo('Desarrollador'); await p.waitForTimeout(800);
  await go(ctx, '/reglas-tarifa');
  return `«Nueva Regla»: ${(await p.getByRole('button', { name: 'Nueva Regla' }).count()) ? 'visible' : 'oculto'}`;
});
await finish(ctx, 'fase8-roles');

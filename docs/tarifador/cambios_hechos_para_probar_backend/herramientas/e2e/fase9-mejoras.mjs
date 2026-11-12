import { session, go, step, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
const toast = async () => (await bodyText(ctx)).match(/(Liquidación LIQ-[^.]*\.|El cambio se guardó, pero no quedó registrado[^.]*\.|Parámetros de la estructura de costos guardados\.|Umbrales guardados\.)/)?.[0] ?? 'sin aviso';

await step(ctx, 'P13 emitir lleva al Historial y resalta la liquidación', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(500);
  const row = p.locator('main table tbody tr').filter({ has: p.locator('button:has-text("Liquidar"):not([disabled])') }).first();
  await row.locator('button:has-text("Liquidar")').click(); await p.waitForTimeout(3500);
  await p.locator('button:has-text("Emitir liquidación")').last().click(); await p.waitForTimeout(2500);
  const enHistorial = (await p.locator('main table tbody tr.bg-teal-50').count()) > 0;
  const modalAbierto = /Descargar PDF/.test(await bodyText(ctx));
  await shot(ctx, 'f9-emitir-historial');
  return `historial visible con fila resaltada=${enHistorial}; detalle abierto=${modalAbierto}; aviso: ${await toast()}`;
});
await step(ctx, 'P9 margen: botón y aviso', async () => {
  await go(ctx, '/reglas-tarifa');
  await p.getByRole('button', { name: 'Alerta Margen' }).first().click(); await p.waitForTimeout(800);
  await p.locator('main input[placeholder="0.15 (15%)"]').fill('0.2');
  await p.getByRole('button', { name: 'Guardar umbrales' }).click(); await p.waitForTimeout(1200);
  const pais = await p.getByRole('button', { name: 'Guardar cálculo del país' }).count();
  return `aviso: ${await toast()}; texto en pantalla: ${(await mainText(ctx)).includes('Umbrales guardados.')}; botón del país renombrado=${pais === 1}`;
});
await step(ctx, 'P8 costos: aviso al guardar parámetros', async () => {
  await go(ctx, '/tarifas/costos-flota?flota=externa');
  const row = p.locator('main table').last().locator('tbody tr').filter({ hasText: 'Hernández' }).first();
  await row.locator('button[title="Estructura de costos de esta compañía"]').click(); await p.waitForTimeout(1500);
  await p.locator('.fixed button:has-text("Guardar parámetros")').click(); await p.waitForTimeout(1500);
  return `aviso: ${await toast()}`;
});
await finish(ctx, 'fase9');

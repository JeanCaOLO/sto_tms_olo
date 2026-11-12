import { session, go, step, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
await step(ctx, 'PDF: «Descargar PDF» del detalle no falla', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Historial', { exact: true }).first().click(); await p.waitForTimeout(1500);
  await p.locator('main table tbody tr').first().locator('button[title="Ver el desglose"]').click(); await p.waitForTimeout(1500);
  const popup = p.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await p.getByRole('button', { name: 'Descargar PDF' }).click();
  const w = await popup; await p.waitForTimeout(1500);
  const html = w ? (await w.content()).replace(/\s+/g, ' ') : '';
  return w ? `se abrió una ventana de impresión (${html.length} caracteres; menciona LIQ-: ${/LIQ-/.test(html)}; proforma/total: ${/Total|total/.test(html)})` : 'no se abrió ventana (¿bloqueador de popups o descarga directa?)';
});
await finish(ctx, 'fase7e');

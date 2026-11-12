// Selección múltiple: liquidar varios viajes de una vez y activar/desactivar/eliminar varias reglas.
import { session, go, step, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;

await step(ctx, 'L1 marcar 3 viajes y abrir el lote', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(500);
  const boxes = p.locator('main table tbody tr input[type=checkbox]:not([disabled])');
  const hay = await boxes.count();
  for (let i = 0; i < Math.min(3, hay); i++) await boxes.nth(i).check();
  await p.waitForTimeout(300);
  const barra = await p.locator('[role=toolbar]').innerText();
  await shot(ctx, 'f10-barra-viajes');
  await p.locator('[role=toolbar] button:has-text("Liquidar")').click(); await p.waitForTimeout(4500);
  await shot(ctx, 'f10-lote-plegado');
  return `casillas habilitadas=${hay}; barra="${barra.replace(/\s+/g, ' ')}"; filas en el lote=${await p.locator('.fixed li').count()}`;
});
await step(ctx, 'L2 desplegar un viaje: es el cuerpo del modal de uno', async () => {
  await p.locator('.fixed li button[aria-expanded]').first().click(); await p.waitForTimeout(800);
  const t = await bodyText(ctx);
  await shot(ctx, 'f10-lote-desplegado');
  return `Total a pagar=${/Total a pagar/.test(t)}; Ver más=${/Ver más: pedidos, devoluciones y desglose/.test(t)}`;
});
await step(ctx, 'L3 emitir todos', async () => {
  await p.locator('.fixed button:has-text("Emitir")').last().click(); await p.waitForTimeout(4000);
  const t = await bodyText(ctx);
  await shot(ctx, 'f10-lote-emitido');
  return `aviso=${t.match(/\d+ liquidaciones emitidas[^.]*\./)?.[0] ?? 'sin aviso'}; modal cerrado=${(await p.locator('.fixed li').count()) === 0}; filas resaltadas=${await p.locator('main table tbody tr.bg-teal-50').count()}`;
});
await step(ctx, 'R1 desactivar 2 reglas en lote', async () => {
  await go(ctx, '/reglas-tarifa');
  p.once('dialog', (d) => d.accept());
  const boxes = p.locator('main table tbody tr input[type=checkbox]');
  const antes = await p.locator('main table tbody tr').count();
  await boxes.nth(0).check(); await boxes.nth(1).check();
  await shot(ctx, 'f10-barra-reglas');
  await p.locator('[role=toolbar] button:has-text("Desactivar")').click(); await p.waitForTimeout(1800);
  const despues = await p.locator('main table tbody tr').count();
  return `filas activas antes=${antes} después=${despues}; aviso=${(await bodyText(ctx)).match(/Se desactivaron[^.]*\./)?.[0] ?? 'sin aviso'}`;
});
await step(ctx, 'R2 eliminar en lote pide una confirmación con los códigos', async () => {
  const boxes = p.locator('main table tbody tr input[type=checkbox]');
  await boxes.nth(0).check();
  await p.locator('[role=toolbar] button:has-text("Eliminar")').click(); await p.waitForTimeout(500);
  const texto = await p.locator('.fixed.inset-0.z-50').innerText();
  await shot(ctx, 'f10-eliminar-lote');
  await p.locator('.fixed.inset-0.z-50 button:has-text("Cancelar")').click();
  return texto.replace(/\s+/g, ' ').slice(0, 160);
});
await finish(ctx, 'fase10');

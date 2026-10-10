import { session, go, step, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
const setRole = async (label) => { await p.getByLabel('Rol de prueba del modo mock').selectOption({ label }); await p.waitForTimeout(800); };

await step(ctx, 'RO1 «Solo liquidar»: configuración en solo lectura', async () => {
  await setRole('Solo liquidar');
  await go(ctx, '/reglas-tarifa');
  const nueva = await p.getByRole('button', { name: 'Nueva Regla' }).count();
  const nuevaOff = nueva ? await p.getByRole('button', { name: 'Nueva Regla' }).isDisabled() : null;
  const editBtns = await p.locator('main table tbody tr').first().locator('button').evaluateAll((b) => b.map((x) => `${x.title || x.innerText}:${x.disabled ? 'off' : 'on'}`));
  await shot(ctx, 'f8-solo-liquidar-reglas');
  return `«Nueva Regla»: ${nueva ? (nuevaOff ? 'deshabilitado' : 'habilitado') : 'oculto'}; acciones de fila: ${editBtns.join(', ')}`;
});
await step(ctx, 'RO2 «Solo liquidar»: puede emitir', async () => {
  await go(ctx, '/liquidaciones');
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(500);
  const row = p.locator('main table tbody tr').filter({ has: p.locator('button:has-text("Liquidar"):not([disabled])') }).first();
  await row.locator('button:has-text("Liquidar")').click(); await p.waitForTimeout(3500);
  await p.locator('button:has-text("Emitir liquidación")').last().click(); await p.waitForTimeout(2500);
  const ok = /Emitida el/.test(await bodyText(ctx));
  await p.getByRole('button', { name: 'Cerrar' }).last().click().catch(() => {});
  return `emisión ${ok ? 'correcta' : 'FALLÓ: ' + ((await bodyText(ctx)).match(/(permiso|403|Error)[^.]{0,100}/)?.[0] ?? '')}`;
});
await step(ctx, 'RO3 «Solo configurar»: no puede emitir (403 del backend simulado)', async () => {
  await setRole('Solo configurar');
  await go(ctx, '/liquidaciones');
  await p.getByText('Por Liquidar', { exact: true }).first().click(); await p.waitForTimeout(500);
  const row = p.locator('main table tbody tr').filter({ has: p.locator('button:has-text("Liquidar"):not([disabled])') }).first();
  const btn = row.locator('button:has-text("Liquidar")');
  if (!(await btn.count())) return 'sin botón Liquidar (el front lo oculta por permiso)';
  await btn.click(); await p.waitForTimeout(3500);
  const emit = p.locator('button:has-text("Emitir liquidación")').last();
  if (await emit.isDisabled()) return 'Emitir deshabilitado en la interfaz (el front lo impide por permiso)';
  await emit.click(); await p.waitForTimeout(2500);
  await shot(ctx, 'f8-configurar-emitir');
  return `mensaje: ${(await bodyText(ctx)).match(/(Tu rol no tiene permiso|permiso|403)[^.]{0,100}/)?.[0] ?? 'ninguno visible'}`;
});
await step(ctx, 'RO4 «Solo configurar»: guardar una regla (la bitácora devuelve 403)', async () => {
  await p.keyboard.press('Escape'); await p.getByRole('button', { name: 'Cancelar' }).last().click().catch(() => {});
  await go(ctx, '/reglas-tarifa');
  await p.getByRole('button', { name: 'Nueva Regla' }).click(); await p.waitForTimeout(500);
  await p.getByPlaceholder('BONO-PEAJES').fill('R_ROL_CONFIG'); await p.getByPlaceholder('Bono por peaje transitado').fill('Regla con rol configurar');
  await p.locator('input[placeholder="20.00"]').fill('100');
  await p.getByRole('button', { name: 'Crear regla' }).click(); await p.waitForTimeout(1800);
  const saved = (await mainText(ctx)).includes('R_ROL_CONFIG');
  await p.getByText('Bitácora', { exact: true }).first().click(); await p.waitForTimeout(1200);
  const inLog = (await mainText(ctx)).includes('R_ROL_CONFIG');
  return `regla guardada=${saved}; aparece en la bitácora=${inLog} (si es false, el 403 de la bitácora se perdió en silencio)`;
});
await finish(ctx, 'fase8-roles');

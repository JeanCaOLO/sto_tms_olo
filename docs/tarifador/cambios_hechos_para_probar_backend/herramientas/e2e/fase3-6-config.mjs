import { session, go, step, harvest, mainText, bodyText, shot, finish } from './lib.mjs';
const ctx = await session(); const p = ctx.page;
p.on('dialog', (d) => d.accept());
const tab = async (name) => { await p.getByRole('button', { name }).first().click(); await p.waitForTimeout(1000); };
const rowOf = (t) => p.locator('main table tbody tr', { hasText: t }).first();

await go(ctx, '/reglas-tarifa'); await tab('Tarifarios');
await step(ctx, 'T1 crear tarifario', async () => {
  await p.getByRole('button', { name: 'Nuevo tarifario' }).click(); await p.waitForTimeout(500);
  await p.getByPlaceholder('TARIFARIO_ZONAS').fill('TAR_AUD'); await p.getByPlaceholder('Tarifario por zona y camión').fill('Tarifario de auditoría');
  await p.getByRole('button', { name: 'Crear tarifario' }).click(); await p.waitForTimeout(1500);
  if (!(await mainText(ctx)).includes('TAR_AUD')) throw new Error('no aparece');
  return `ops: ${(await harvest(ctx)).map((o) => `${o.op}:${o.table}`).join(', ')}`;
});
await step(ctx, 'T2 editar nombre', async () => {
  await rowOf('TAR_AUD').locator('button[title="Editar"], button:has(i.ri-edit-line)').first().click().catch(async () => rowOf('TAR_AUD').locator('button').first().click());
  await p.waitForTimeout(800);
  await p.getByPlaceholder('Tarifario por zona y camión').fill('Tarifario AUD editado');
  await p.getByRole('button', { name: 'Guardar cambios' }).click(); await p.waitForTimeout(1500);
  if (!(await mainText(ctx)).includes('Tarifario AUD editado')) throw new Error('la edición no se refleja');
});
await step(ctx, 'T3 desactivar / activar', async () => {
  await rowOf('TAR_AUD').locator('button[title="Desactivar"]').click(); await p.waitForTimeout(1200);
  const hidden = (await p.locator('main table tbody tr', { hasText: 'TAR_AUD' }).count()) === 0;
  await p.getByText('Quitar filtro').click().catch(() => {}); await p.waitForTimeout(500);
  const inactive = /Inactivo/.test(await rowOf('TAR_AUD').innerText());
  await rowOf('TAR_AUD').locator('button[title="Reactivar"]').click(); await p.waitForTimeout(1200);
  const active = /Activo/.test(await rowOf('TAR_AUD').innerText());
  if (!inactive || !active) throw new Error(`inactivo=${inactive} activo=${active}`);
  return `ok; con el filtro por defecto el tarifario desactivado ${hidden ? 'DESAPARECE de la lista' : 'sigue visible'}`;
});
await step(ctx, 'T4 eliminar', async () => {
  await rowOf('TAR_AUD').locator('button[title="Eliminar"]').click(); await p.waitForTimeout(700);
  const confirm = p.locator('button:has-text("Eliminar")');
  if (await confirm.count()) await confirm.last().click();
  await p.waitForTimeout(1500);
  if ((await mainText(ctx)).includes('TAR_AUD')) throw new Error('sigue en la lista');
});
await step(ctx, 'T5 abrir tarifario existente y ver filas', async () => {
  await rowOf('ZONAS').click({ position: { x: 30, y: 10 } }).catch(() => {}); await p.waitForTimeout(1200);
  await shot(ctx, 'f3-tarifario-filas');
  return (await bodyText(ctx)).match(/Agregar fila|Nueva fila|Importar|Subir/gi)?.slice(0, 4).join(', ') ?? 'sin acciones de fila visibles';
});

await tab('Alerta Margen');
await step(ctx, 'M1 guardar política de margen', async () => {
  const before = await p.locator('main input[placeholder="0.15 (15%)"]').inputValue();
  await p.locator('main input[placeholder="0.15 (15%)"]').fill('0.22');
  await p.getByRole('button', { name: 'Actualizar' }).click(); await p.waitForTimeout(1500);
  const msg = (await bodyText(ctx)).match(/(guardad|actualizad|Error)[^.]{0,80}/i)?.[0] ?? 'sin mensaje';
  const opsNow = (await harvest(ctx)).map((o) => `${o.op}:${o.table}:${Object.entries(o.values ?? {}).map(([k, v]) => k + '=' + JSON.stringify(v)).join('/')}`);
  const after = await p.locator('main input[placeholder="0.15 (15%)"]').inputValue();
  return `antes=${before} → ${after}; mensaje: ${msg}; ops: ${opsNow.join(' || ')}`;
});
await step(ctx, 'M2 país: decimales / redondeo', async () => {
  const sels = p.locator('main select');
  const n = await sels.count();
  return `${n} selects en la vista (país/redondeo)`;
});

await tab('Probador');
await step(ctx, 'P1 probador: plantillas y escenarios', async () => {
  const opts = await p.locator('main select').first().locator('option').allInnerTexts();
  await shot(ctx, 'f6-probador');
  return `plantillas listadas (${opts.length}): ${opts.slice(0, 12).join(' | ')}`;
});
await finish(ctx, 'fase3-6-config');

// Utilidades compartidas de los recorridos de auditoría (Playwright). Apuntan al dev server del mock (`AUDIT_BASE`,
// por defecto http://localhost:3100) y dejan capturas en `../capturas/` y las escrituras en `../oplog.json`.
// Ajustar la ruta de Playwright si el repo está en otro lugar (`npm ls @playwright/test`).
import { chromium } from '/home/misterclon/Documents/OLOGISTICO/TMS/TARIFADOR/sto_tms_olo/node_modules/@playwright/test/index.mjs';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

export const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3100';
export const OUT = new URL('../capturas/', import.meta.url).pathname;
export const OPLOG = new URL('../oplog.json', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export async function session({ country } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.setDefaultTimeout(7000);
  const ctx = { browser, page, steps: [], errors: [], ops: [], phase: 'login' };
  page.on('pageerror', (e) => ctx.errors.push(`[${ctx.phase}] PAGEERROR ${e.message}`));
  page.on('console', (m) => {
    const t = m.text() + m.location().url;
    if (m.type() === 'error' && !/api\/auth\/login|api\/data|Failed to load resource/.test(t)) ctx.errors.push(`[${ctx.phase}] console.error ${m.text().slice(0, 300)}`);
  });
  await page.goto(`${BASE}/login`);
  await page.locator('input').first().fill('x@x.com');
  await page.locator('input').nth(1).fill('x');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(2000);
  if (country) { await page.locator('select').first().selectOption({ label: country }); await page.waitForTimeout(1200); }
  return ctx;
}

export async function go(ctx, path) {
  await ctx.page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await ctx.page.waitForTimeout(2200);
}

/** Recoge `window.__opLog` (se vacía al recargar la página, así que se llama antes de cada recarga). */
export async function harvest(ctx) {
  const ops = await ctx.page.evaluate(() => { const l = window.__tarifasOpLog ?? []; window.__tarifasOpLog = []; return l; });
  ctx.ops.push(...ops);
  return ops;
}

export async function step(ctx, name, fn) {
  ctx.phase = name;
  try {
    const r = await fn();
    ctx.steps.push({ name, ok: true, note: r ?? '' });
  } catch (e) {
    const shot = `${OUT}FAIL-${name.replace(/\W+/g, '_')}.png`;
    await ctx.page.screenshot({ path: shot }).catch(() => {});
    ctx.steps.push({ name, ok: false, note: String(e.message).split('\n').slice(0, 3).join(' ⏎ ').slice(0, 400) });
    await ctx.page.keyboard.press('Escape').catch(() => {});
  }
}

export const mainText = async (ctx) => (await ctx.page.innerText('main')).replace(/\s+/g, ' ');
export const bodyText = async (ctx) => (await ctx.page.innerText('body')).replace(/\s+/g, ' ');
export const shot = (ctx, name) => ctx.page.screenshot({ path: `${OUT}${name}.png` });

export async function finish(ctx, label) {
  await harvest(ctx);
  const prev = existsSync(OPLOG) ? JSON.parse(readFileSync(OPLOG, 'utf8')) : [];
  const tagged = ctx.ops.map((o) => ({ ...o, source: label }));
  writeFileSync(OPLOG, JSON.stringify([...prev.filter((p) => p.source !== label), ...tagged], null, 1));
  for (const s of ctx.steps) console.log(`${s.ok ? 'OK  ' : 'FAIL'} ${s.name}${s.note ? ' → ' + s.note : ''}`);
  console.log(`\nOperaciones registradas: ${ctx.ops.length}`);
  console.log('ERRORES DE CONSOLA:\n' + (ctx.errors.join('\n') || '(ninguno)'));
  await ctx.browser.close();
}

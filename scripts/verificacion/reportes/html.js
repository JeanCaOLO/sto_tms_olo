// reportes/html.js — informe ejecutivo con la identidad de las presentaciones INTELIX
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { textos } from './idiomas.js'
import { etiquetasEs, etiquetasEn } from './markdown.js'

const LOGO_SRC = 'data:image/png;base64,' + fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'logo-beconsult.png')
).toString('base64')

const ORDEN_CRIT = { 'Critico': 0, 'Alto': 1, 'Medio': 2, 'Bajo': 3 }
const ORDEN_CAT = ['infraestructura', 'codigo', 'seguridad', 'devops', 'movil']
const ABIERTOS = new Set(['no-cumplido', 'parcial'])
const CONFORMES = new Set(['cumplido', 'na-justificado', 'diferido-piloto', 'no-verificable'])
const COLOR_DICTAMEN = {
  'APTO PARA QA': '#12B886',
  'CON OBSERVACIONES': '#F5A524',
  'NO APTO PARA QA': '#E5484D'
}
const TONO_CUMPLIMIENTO = {
  'cumplido': 'ok',
  'parcial': 'obs',
  'no-cumplido': 'no',
  'na-justificado': 'na',
  'diferido-piloto': 'na',
  'no-verificable': 'na'
}
const TONO_CRITICIDAD = { 'Critico': 'no', 'Alto': 'obs', 'Medio': 'info', 'Bajo': 'na' }

function esc (s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function colorPct (pct) {
  if (pct === null || pct === undefined) return '#9AA7BF'
  if (pct >= 85) return '#12B886'
  if (pct >= 70) return '#F5A524'
  return '#E5484D'
}

function tonoPri (crit) { return TONO_CRITICIDAD[crit] || 'na' }

export function generarHtml (r) {
  const t = textos(r.proyecto.idioma)
  const x = r.proyecto.idioma === 'en' ? etiquetasEn : etiquetasEs
  const lang = r.proyecto.idioma === 'en' ? 'en' : 'es'
  const colorD = COLOR_DICTAMEN[r.dictamen.dictamen] || '#6B7A99'
  const total = r.dictamen.puntuacion_total ?? t.nd
  const resumen = t.resumenDe(r)
  const expo = t.exposiciones[r.proyecto.exposicion] || t.exposiciones.desconocida
  const alcance = t.alcances[r.proyecto.alcance] || t.alcances.estandares
  const marca = x.marca[r.dictamen.dictamen] || '🛑'
  const criticos = r.hallazgos.filter(h => h.criticidad === 'Critico' && h.estado === 'no-cumplido')
  const prioridad = ordenar(r.hallazgos.filter(h => ABIERTOS.has(h.estado) && !(h.criticidad === 'Critico' && h.estado === 'no-cumplido')))
  const fortalezas = ordenar(r.hallazgos.filter(h => h.estado === 'cumplido'))
  const noVerif = ordenar(r.hallazgos.filter(h => CONFORMES.has(h.estado) && h.estado !== 'cumplido'))
  const palancas = [...criticos, ...prioridad.filter(h => h.criticidad === 'Alto' || h.criticidad === 'Medio')]
    .sort((a, b) => {
      const c = (ORDEN_CRIT[a.criticidad] ?? 9) - (ORDEN_CRIT[b.criticidad] ?? 9)
      if (c) return c
      return ORDEN_CAT.indexOf(a.categoria) - ORDEN_CAT.indexOf(b.categoria)
    })
  const todos = ordenar(r.hallazgos)

  const cats = ordenCategorias(r).map(cat => {
    const d = r.dictamen.categorias[cat]
    const pct = d.porcentaje
    const ancho = pct === null ? 0 : Math.max(0, Math.min(100, pct))
    const color = colorPct(pct)
    return `<article class="cat">
      <h3>${esc(t.categorias[cat] || cat)}</h3>
      <div class="pct" style="color:${color}">${pct === null ? esc(t.nd) : pct + '%'}</div>
      <div class="bar"><span style="width:${ancho}%;background:${color}"></span></div>
      <div class="peso">${esc(x.peso)} ${d.peso}% · ${esc(nivelRiesgo(x, d))} · ${esc(estadoPuerta(x, d))}</div>
    </article>`
  }).join('')

  const ficha = tabla([x.campo, x.valor], [
    [x.proyecto, esc(r.proyecto.nombre)],
    [x.fecha, esc(r.proyecto.fecha)],
    [x.dictamen, `${marca} <b>${esc(r.dictamen.dictamen)}</b>`],
    [x.nota, `${esc(String(total))} % / 100 %`]
  ])

  const tablaFortalezas = fortalezas.length
    ? tabla([x.estandar, x.ref, x.evidencia], fortalezas.map(h => [
      esc(h.nombre),
      `<span class="id">${esc(h.id)}</span>`,
      esc(h.evidencia)
    ]))
    : `<p class="vacio">${esc(x.sinFortalezas)}</p>`

  const tablaPalancas = palancas.length
    ? tabla([x.estandar, x.ref, x.prioridad, x.evidencia], palancas.map(h => [
      esc(h.nombre),
      `<span class="id">${esc(h.id)}</span>`,
      `<span class="pill ${tonoPri(h.criticidad)}">${esc(t.criticidad[h.criticidad] || h.criticidad)}</span>`,
      esc(h.evidencia)
    ]))
    : `<p class="vacio">${esc(x.sinCriticos)}</p>`

  const bloqueCriticos = criticos.length
    ? criticos.map((h, i) => `
      <article class="tarjeta">
        <header>
          <span class="id">${esc(h.id)}</span>
          <h4>4.${i + 1}. ${esc(h.nombre)}</h4>
          <span class="pill no">${esc(t.criticidad[h.criticidad] || h.criticidad)}</span>
        </header>
        ${tabla([x.campo, x.valor], [
          [x.brecha, esc(h.evidencia)],
          [x.impacto, esc(t.criticidad[h.criticidad] || h.criticidad)],
          [x.solucion, esc(h.recomendacion)]
        ])}
      </article>`).join('')
    : `<p class="vacio">${esc(x.sinCriticos)}</p>`

  const gruposPri = prioridad.length
    ? agrupar(prioridad).map(([cat, items]) => `
      <h3 class="dom">${esc(t.categorias[cat] || cat)}</h3>
      ${tabla([x.estandar, x.ref, x.prioridad, x.brecha, x.solucion], items.map(h => [
        esc(h.nombre),
        `<span class="id">${esc(h.id)}</span>`,
        `<span class="pill ${tonoPri(h.criticidad)}">${esc(t.criticidad[h.criticidad] || h.criticidad)}</span>`,
        esc(h.evidencia),
        esc(h.recomendacion)
      ]))}
    `).join('')
    : `<p class="vacio">${esc(x.sinPrioridad)}</p>`

  const tablaValidados = fortalezas.length
    ? tabla([x.ref, x.estandar, x.evidencia], fortalezas.map(h => [
      `<span class="id">${esc(h.id)}</span>`,
      esc(h.nombre),
      esc(h.evidencia)
    ]))
    : `<p class="vacio">${esc(x.sinFortalezas)}</p>`

  const tablaNoVerif = noVerif.length
    ? tabla([x.ref, x.estandar, x.estado, x.evidencia], noVerif.map(h => [
      `<span class="id">${esc(h.id)}</span>`,
      esc(h.nombre),
      `<span class="pill ${TONO_CUMPLIMIENTO[h.estado] || 'na'}">${esc(t.estados[h.estado] || h.estado)}</span>`,
      esc(h.evidencia)
    ]))
    : `<p class="vacio">${esc(x.ninguno)}</p>`

  const tablaFases = tabla([x.faseCol, x.alcanceFase, x.controles], [
    [esc(x.f1), esc(x.f1alc), esc(listaRefs(criticos, x.ninguno))],
    [esc(x.f2), esc(x.f2alc), esc(listaRefs(prioridad, x.ninguno))],
    [esc(x.f3), esc(x.f3alc), '—']
  ])

  const matriz = tabla([x.codigo, x.dom, x.desc, x.estado], todos.map(h => [
    `<span class="id">${esc(h.id)}</span>`,
    esc(t.categorias[h.categoria] || h.categoria),
    esc(h.nombre),
    `<span class="pill ${TONO_CUMPLIMIENTO[h.estado] || 'na'}">${esc(t.estados[h.estado] || h.estado)}</span>`
  ]))

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(x.titulo)} — ${esc(r.proyecto.nombre)}</title>
<style>
:root{
  --navy:#0A1F44; --blue:#1E5AE8; --cyan:#00C2D1;
  --paper:#F5F7FB; --line:#E2E8F4; --muted:#6B7A99; --muted-2:#9AA7BF;
  --font:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;
  --mono:Consolas,'SF Mono','Roboto Mono',monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--paper);color:var(--navy);line-height:1.45}
.wrap{max-width:980px;margin:0 auto;padding:28px 20px 48px}
header{
  background:#fff;color:#fff;border-radius:18px;margin-bottom:18px;overflow:hidden;
  box-shadow:0 10px 40px -12px rgba(10,31,68,.28)
}
.cuerpo{
  background:linear-gradient(152deg,#100e0c 0%,#0c1830 26%,#0a3a72 56%,#0d78b0 78%,#18c8c4 100%);
  padding:22px 32px 24px
}
.logo-banda{background:#fff;padding:16px 28px 14px}
.logo-banda img{height:34px;width:auto;display:block}
.kicker{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#b7e7ee;font-weight:700}
header h1{font-size:32px;font-weight:800;letter-spacing:-.4px;margin:8px 0 6px;line-height:1.15}
.meta{color:#d5e4f5;font-size:14px}
.dictamen{
  background:#fff;border:1px solid var(--line);border-left:6px solid ${colorD};
  border-radius:14px;padding:18px 22px;margin-bottom:18px;
  box-shadow:0 4px 20px -8px rgba(10,31,68,.18)
}
.dictamen .codigo{font-size:22px;font-weight:800;color:${colorD};letter-spacing:.02em}
.dictamen .num{font-family:var(--mono);font-size:40px;font-weight:800;color:var(--navy);letter-spacing:-1px;margin:4px 0}
.dictamen p{font-size:16px;max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:10px}
.cat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 14px 12px;box-shadow:0 4px 20px -8px rgba(10,31,68,.18)}
.cat h3{font-size:13px;color:var(--muted);font-weight:700}
.cat .pct{font-size:28px;font-weight:800;font-family:var(--mono);letter-spacing:-.5px;margin:4px 0}
.bar{height:6px;background:#EEF2FA;border-radius:99px;overflow:hidden}
.bar span{display:block;height:100%;border-radius:99px}
.cat .peso{font-size:12px;color:var(--muted-2);margin-top:6px}
h2{font-size:18px;font-weight:800;margin:26px 0 10px;letter-spacing:-.2px}
h3{font-size:15px;font-weight:800;margin:16px 0 8px}
h3.dom{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin:16px 0 8px}
.ruta{font-size:13px;color:var(--muted);margin:0 0 12px;font-weight:600}
table.exec{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:0 0 14px;font-size:13.5px;box-shadow:0 4px 20px -12px rgba(10,31,68,.18)}
table.exec th{background:#EEF2FA;text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:9px 12px;font-weight:700}
table.exec td{padding:9px 12px;border-top:1px solid var(--line);vertical-align:top}
table.exec td:first-child{font-weight:600}
.id{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--navy);background:#EEF2FA;padding:2px 7px;border-radius:6px;white-space:nowrap}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:3px 11px;border-radius:100px}
.pill.ok{background:#E3F8EF;color:#0C7C57}
.pill.obs{background:#FDF1DC;color:#9C6410}
.pill.no{background:#FCE7E8;color:#B5262B}
.pill.info{background:#E7F0FF;color:#1949B8}
.pill.na{background:#EEF2FA;color:#3D4C6A}
.tarjeta{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px 6px;margin-bottom:12px;box-shadow:0 4px 20px -12px rgba(10,31,68,.2)}
.tarjeta header{background:transparent;color:var(--navy);border-radius:0;padding:0;margin:0 0 8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tarjeta h4{font-size:15px;font-weight:700;flex:1 1 220px}
.tarjeta table.exec{box-shadow:none;margin-bottom:10px}
.vacio{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;color:var(--muted)}
footer{margin-top:28px;font-size:12px;color:var(--muted-2)}
@media (max-width:720px){
  .grid{grid-template-columns:1fr 1fr}
  header h1{font-size:26px}
  .logo-banda img{height:28px}
  table.exec{display:block;overflow-x:auto}
}
@media print{
  body{background:#fff}
  header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="logo-banda"><img src="${LOGO_SRC}" alt="beconsult INTELIX"></div>
  <div class="cuerpo">
    <div class="kicker">${esc(t.kicker)}</div>
    <h1>${esc(r.proyecto.nombre)}</h1>
    <p class="meta">${esc(r.proyecto.fecha)} · ${esc(expo)} · ${esc(alcance)}</p>
  </div>
</header>

<h2>${esc(x.s1)}</h2>
${ficha}

<h2>${esc(x.s2)}</h2>
<section class="dictamen">
  <div class="codigo">${marca} ${esc(r.dictamen.dictamen)}</div>
  <div class="num">${esc(String(total))}%</div>
  <p>${esc(resumen.dictamen)}</p>
</section>
<h3>${esc(x.fortalezas)}</h3>
${tablaFortalezas}
<h3>${esc(x.palancas)}</h3>
${tablaPalancas}

<h2>${esc(x.s3)}</h2>
<section class="grid">${cats}</section>

<h2>${esc(x.s4)}</h2>
${bloqueCriticos}

<h2>${esc(x.s5)}</h2>
${gruposPri}

<h2>${esc(x.s6)}</h2>
<h3>${esc(x.validados)}</h3>
${tablaValidados}
<h3>${esc(x.noVerif)}</h3>
${tablaNoVerif}

<h2>${esc(x.s7)}</h2>
<p class="ruta">${esc(x.fase)}</p>
${tablaFases}

<h2>${esc(x.s8)}</h2>
${matriz}

<footer>${esc(t.pie)}</footer>
</div>
</body>
</html>`
}

function tabla (headers, rows) {
  const th = headers.map(h => `<th>${esc(h)}</th>`).join('')
  const tr = rows.map(cols => `<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
  return `<table class="exec"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

function nivelRiesgo (x, d) {
  if (d.critico_abierto) return x.riesgoCritico
  if (d.porcentaje === null || d.porcentaje === undefined) return x.riesgoNd
  if (d.porcentaje < 70) return x.riesgoAlto
  if (d.porcentaje < 85) return x.riesgoMedio
  return x.riesgoBajo
}

function estadoPuerta (x, d) {
  if (d.critico_abierto || (d.porcentaje !== null && d.porcentaje < 70)) return x.puertaCerrada
  if (d.porcentaje === null || d.porcentaje === undefined) return x.riesgoNd
  if (d.porcentaje < 85) return x.puertaCond
  return x.puertaAbierta
}

function listaRefs (lista, vacio) {
  if (!lista.length) return vacio
  return lista.map(h => h.id).join(', ')
}

function ordenar (lista) {
  return [...lista].sort((a, b) => {
    const c = ORDEN_CAT.indexOf(a.categoria) - ORDEN_CAT.indexOf(b.categoria)
    if (c) return c
    return (ORDEN_CRIT[a.criticidad] ?? 9) - (ORDEN_CRIT[b.criticidad] ?? 9)
  })
}

function agrupar (lista) {
  const map = new Map()
  for (const h of lista) {
    if (!map.has(h.categoria)) map.set(h.categoria, [])
    map.get(h.categoria).push(h)
  }
  return [...map.entries()].sort((a, b) => ORDEN_CAT.indexOf(a[0]) - ORDEN_CAT.indexOf(b[0]))
}

function ordenCategorias (r) {
  return Object.keys(r.dictamen.categorias).sort((a, b) => {
    const ia = ORDEN_CAT.indexOf(a)
    const ib = ORDEN_CAT.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}

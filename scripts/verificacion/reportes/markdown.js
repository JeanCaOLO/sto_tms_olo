// reportes/markdown.js — informe ejecutivo de ocho secciones
import { textos } from './idiomas.js'

const ORDEN_CRIT = { 'Critico': 0, 'Alto': 1, 'Medio': 2, 'Bajo': 3 }
const ORDEN_CAT = ['infraestructura', 'codigo', 'seguridad', 'devops', 'movil']
const ABIERTOS = new Set(['no-cumplido', 'parcial'])
const CONFORMES = new Set(['cumplido', 'na-justificado', 'diferido-piloto', 'no-verificable'])

const es = {
  titulo: 'Informe ejecutivo de certificación',
  s1: '1. Encabezado y ficha técnica',
  s2: '2. Resumen ejecutivo y dictamen de calidad',
  fortalezas: 'Fortalezas del sistema evaluado',
  palancas: 'Puntos clave de cierre',
  sinFortalezas: 'Esta certificación no registra controles cumplidos.',
  s3: '3. Evaluación por dominio técnico',
  s4: '4. Hallazgos críticos y bloqueadores (Prioridad 1 - Inmediata)',
  s5: '5. Hallazgos de riesgo alto y medio (Prioridad 2 - Requerido antes de producción)',
  s6: '6. Estado de controles validados y conformidad',
  validados: 'Controles cumplidos',
  noVerif: 'Controles no verificables, N/A o diferidos',
  s7: '7. Plan recomendado de remediación',
  s8: '8. Anexo: leyenda y matriz de trazabilidad técnica',
  campo: 'Campo',
  valor: 'Valor',
  estandar: 'Estándar evaluado',
  ref: 'Ref',
  evidencia: 'Evidencia',
  proyecto: 'Proyecto',
  fecha: 'Fecha de evaluación',
  dictamen: 'Estado del dictamen',
  nota: 'Calificación global',
  dom: 'Dominio técnico',
  peso: 'Peso ponderado',
  cump: 'Cumplimiento (%)',
  riesgo: 'Nivel de riesgo',
  puerta: 'Estado de la puerta',
  brecha: 'Brecha / Evidencia',
  impacto: 'Riesgo e impacto',
  solucion: 'Solución recomendada',
  prioridad: 'Prioridad',
  codigo: 'Código de control',
  desc: 'Descripción del estándar evaluado',
  estado: 'Estado actual',
  faseCol: 'Fase',
  alcanceFase: 'Alcance',
  controles: 'Controles',
  sinCriticos: 'Esta certificación no tiene hallazgos críticos abiertos.',
  sinPrioridad: 'Esta certificación no tiene otros controles abiertos de prioridad alta, media o baja.',
  sinConformes: 'Esta certificación no tiene controles en conformidad.',
  fase: '[ Fase 1: Remediación crítica ] ──► [ Fase 2: Robustecimiento ] ──► [ Fase 3: Re-certificación ]',
  f1: '1. Remediación crítica',
  f1alc: 'Inmediata. Cierra los bloqueadores de la puerta de calidad.',
  f2: '2. Robustecimiento',
  f2alc: 'Requerido antes de producción.',
  f3: '3. Re-certificación',
  f3alc: 'Volver a certificar este desarrollo cuando las fases anteriores queden cerradas.',
  ninguno: 'Ninguno en esta certificación.',
  riesgoCritico: 'Crítico',
  riesgoAlto: 'Alto',
  riesgoMedio: 'Medio',
  riesgoBajo: 'Bajo',
  riesgoNd: 'No evaluable',
  puertaCerrada: 'Cerrada',
  puertaCond: 'Condicionada',
  puertaAbierta: 'Abierta',
  marca: { 'APTO PARA QA': '✅', 'CON OBSERVACIONES': '🟡', 'NO APTO PARA QA': '🛑' }
}

const en = {
  titulo: 'Executive certification report',
  s1: '1. Header and fact sheet',
  s2: '2. Executive summary and quality verdict',
  fortalezas: 'Strengths of the assessed system',
  palancas: 'Key items to close',
  sinFortalezas: 'This certificate records no met controls.',
  s3: '3. Assessment by technical domain',
  s4: '4. Critical findings and blockers (Priority 1 - Immediate)',
  s5: '5. High and medium findings (Priority 2 - Required before production)',
  s6: '6. Validated controls and conformance',
  validados: 'Met controls',
  noVerif: 'Not verifiable, N/A, or deferred controls',
  s7: '7. Recommended remediation plan',
  s8: '8. Appendix: legend and technical traceability matrix',
  campo: 'Field',
  valor: 'Value',
  estandar: 'Standard assessed',
  ref: 'Ref',
  evidencia: 'Evidence',
  proyecto: 'Project',
  fecha: 'Assessment date',
  dictamen: 'Verdict',
  nota: 'Overall score',
  dom: 'Technical domain',
  peso: 'Weight',
  cump: 'Compliance (%)',
  riesgo: 'Risk level',
  puerta: 'Gate status',
  brecha: 'Gap / Evidence',
  impacto: 'Risk and impact',
  solucion: 'Recommended fix',
  prioridad: 'Priority',
  codigo: 'Control code',
  desc: 'Standard assessed',
  estado: 'Current status',
  faseCol: 'Phase',
  alcanceFase: 'Scope',
  controles: 'Controls',
  sinCriticos: 'This certificate has no open critical findings.',
  sinPrioridad: 'This certificate has no other open high, medium, or low controls.',
  sinConformes: 'This certificate has no conforming controls.',
  fase: '[ Phase 1: Critical remediation ] ──► [ Phase 2: Hardening ] ──► [ Phase 3: Re-certification ]',
  f1: '1. Critical remediation',
  f1alc: 'Immediate. Closes quality-gate blockers.',
  f2: '2. Hardening',
  f2alc: 'Required before production.',
  f3: '3. Re-certification',
  f3alc: 'Certify this development again after the previous phases are closed.',
  ninguno: 'None in this certificate.',
  riesgoCritico: 'Critical',
  riesgoAlto: 'High',
  riesgoMedio: 'Medium',
  riesgoBajo: 'Low',
  riesgoNd: 'Not assessed',
  puertaCerrada: 'Closed',
  puertaCond: 'Conditional',
  puertaAbierta: 'Open',
  marca: { 'APTO PARA QA': '✅', 'CON OBSERVACIONES': '🟡', 'NO APTO PARA QA': '🛑' }
}

export { es as etiquetasEs, en as etiquetasEn }

export function generarMarkdown (r) {
  const t = textos(r.proyecto.idioma)
  const x = r.proyecto.idioma === 'en' ? en : es
  const L = []
  const total = r.dictamen.puntuacion_total ?? t.nd
  const resumen = t.resumenDe(r)
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

  L.push(`# ${x.titulo}`)
  L.push('')
  L.push(`## ${x.s1}`)
  L.push('')
  L.push(`| ${x.campo} | ${x.valor} |`)
  L.push('|---|---|')
  L.push(`| ${x.proyecto} | ${limpia(r.proyecto.nombre)} |`)
  L.push(`| ${x.fecha} | ${limpia(r.proyecto.fecha)} |`)
  L.push(`| ${x.dictamen} | ${marca} **${r.dictamen.dictamen}** |`)
  L.push(`| ${x.nota} | ${total} % / 100 % |`)
  L.push('')

  L.push(`## ${x.s2}`)
  L.push('')
  L.push(resumen.dictamen)
  L.push('')
  L.push(`### ${x.fortalezas}`)
  L.push('')
  if (!fortalezas.length) {
    L.push(x.sinFortalezas)
    L.push('')
  } else {
    L.push(`| ${x.estandar} | ${x.ref} | ${x.evidencia} |`)
    L.push('|---|---|---|')
    for (const h of fortalezas) {
      L.push(`| ${limpia(h.nombre)} | ${h.id} | ${limpia(h.evidencia)} |`)
    }
    L.push('')
  }
  L.push(`### ${x.palancas}`)
  L.push('')
  if (!palancas.length) {
    L.push(x.sinCriticos)
    L.push('')
  } else {
    L.push(`| ${x.estandar} | ${x.ref} | ${x.prioridad} | ${x.evidencia} |`)
    L.push('|---|---|---|---|')
    for (const h of palancas) {
      const pri = t.criticidad[h.criticidad] || h.criticidad
      L.push(`| ${limpia(h.nombre)} | ${h.id} | ${pri} | ${limpia(h.evidencia)} |`)
    }
    L.push('')
  }

  L.push(`## ${x.s3}`)
  L.push('')
  L.push(`| ${x.dom} | ${x.peso} | ${x.cump} | ${x.riesgo} | ${x.puerta} |`)
  L.push('|---|---:|---:|---|---|')
  for (const cat of ordenCategorias(r)) {
    const d = r.dictamen.categorias[cat]
    const pct = d.porcentaje === null ? t.nd : `${d.porcentaje} %`
    L.push(`| ${t.categorias[cat] || cat} | ${d.peso} % | ${pct} | ${nivelRiesgo(x, d)} | ${estadoPuerta(x, d)} |`)
  }
  L.push('')

  L.push(`## ${x.s4}`)
  L.push('')
  if (!criticos.length) {
    L.push(x.sinCriticos)
    L.push('')
  } else {
    criticos.forEach((h, i) => {
      L.push(`### 4.${i + 1}. ${limpia(h.nombre)} [Ref: ${h.id}]`)
      L.push('')
      L.push(`| ${x.campo} | ${x.valor} |`)
      L.push('|---|---|')
      L.push(`| ${x.brecha} | ${limpia(h.evidencia)} |`)
      L.push(`| ${x.impacto} | ${t.criticidad[h.criticidad] || h.criticidad} |`)
      L.push(`| ${x.solucion} | ${limpia(h.recomendacion)} |`)
      L.push('')
    })
  }

  L.push(`## ${x.s5}`)
  L.push('')
  if (!prioridad.length) {
    L.push(x.sinPrioridad)
    L.push('')
  } else {
    for (const [cat, items] of agrupar(prioridad)) {
      L.push(`### ${t.categorias[cat] || cat}`)
      L.push('')
      L.push(`| ${x.estandar} | ${x.ref} | ${x.prioridad} | ${x.brecha} | ${x.solucion} |`)
      L.push('|---|---|---|---|---|')
      for (const h of items) {
        L.push(`| ${limpia(h.nombre)} | ${h.id} | ${t.criticidad[h.criticidad] || h.criticidad} | ${limpia(h.evidencia)} | ${limpia(h.recomendacion)} |`)
      }
      L.push('')
    }
  }

  L.push(`## ${x.s6}`)
  L.push('')
  L.push(`### ${x.validados}`)
  L.push('')
  if (!fortalezas.length) {
    L.push(x.sinFortalezas)
    L.push('')
  } else {
    L.push(`| ${x.ref} | ${x.estandar} | ${x.evidencia} |`)
    L.push('|---|---|---|')
    for (const h of fortalezas) {
      L.push(`| ${h.id} | ${limpia(h.nombre)} | ${limpia(h.evidencia)} |`)
    }
    L.push('')
  }
  L.push(`### ${x.noVerif}`)
  L.push('')
  if (!noVerif.length) {
    L.push(x.ninguno)
    L.push('')
  } else {
    L.push(`| ${x.ref} | ${x.estandar} | ${x.estado} | ${x.evidencia} |`)
    L.push('|---|---|---|---|')
    for (const h of noVerif) {
      L.push(`| ${h.id} | ${limpia(h.nombre)} | ${t.estados[h.estado] || h.estado} | ${limpia(h.evidencia)} |`)
    }
    L.push('')
  }

  L.push(`## ${x.s7}`)
  L.push('')
  L.push(x.fase)
  L.push('')
  L.push(`| ${x.faseCol} | ${x.alcanceFase} | ${x.controles} |`)
  L.push('|---|---|---|')
  L.push(`| ${x.f1} | ${x.f1alc} | ${listaRefs(criticos, x.ninguno)} |`)
  L.push(`| ${x.f2} | ${x.f2alc} | ${listaRefs(prioridad, x.ninguno)} |`)
  L.push(`| ${x.f3} | ${x.f3alc} | — |`)
  L.push('')

  L.push(`## ${x.s8}`)
  L.push('')
  L.push(`| ${x.codigo} | ${x.dom} | ${x.desc} | ${x.estado} |`)
  L.push('|---|---|---|---|')
  for (const h of todos) {
    L.push(`| ${h.id} | ${t.categorias[h.categoria] || h.categoria} | ${limpia(h.nombre)} | ${t.estados[h.estado] || h.estado} |`)
  }
  L.push('')
  return L.join('\n')
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

function limpia (s) { return String(s || '-').replace(/\|/g, '\\|').replace(/\n/g, ' ') }

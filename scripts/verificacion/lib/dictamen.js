// lib/dictamen.js — motor de puntuacion y dictamen
// Estados: cumplido | no-cumplido | parcial | na-justificado | diferido-piloto | no-verificable

const PUNTaje_ESTADO = {
  'cumplido': 1,
  'parcial': 0.5,
  'no-cumplido': 0
}
const NO_PENALIZA = new Set(['na-justificado', 'diferido-piloto', 'no-verificable'])

// Calcula el % de una categoria: promedio ponderado de los estados que si penalizan.
// Un critico no-cumplido fija la categoria en 0.
export function puntuarCategoria (hallazgos, cfg) {
  const evaluables = hallazgos.filter(h => !NO_PENALIZA.has(h.estado))
  if (evaluables.length === 0) return { porcentaje: null, evaluados: 0 }

  const criticoAbierto = evaluables.some(h => h.criticidad === 'Critico' && h.estado === 'no-cumplido')
  if (criticoAbierto && cfg.reglas_dictamen.critico_no_cumplido_fija_categoria_en_cero) {
    return { porcentaje: 0, evaluados: evaluables.length, critico_abierto: true }
  }

  // Ponderar por criticidad: Critico=3, Alto=2, Medio=1, Bajo=0.5
  const pesoCrit = { 'Critico': 3, 'Alto': 2, 'Medio': 1, 'Bajo': 0.5 }
  let suma = 0, total = 0
  for (const h of evaluables) {
    const w = pesoCrit[h.criticidad] || 1
    suma += (PUNTaje_ESTADO[h.estado] ?? 0) * w
    total += w
  }
  return { porcentaje: total > 0 ? Math.round((suma / total) * 100) : null, evaluados: evaluables.length, critico_abierto: false }
}

export function calcularDictamen (hallazgosPorCategoria, cfg) {
  const pesos = cfg.pesos
  const categorias = {}
  let totalPonderado = 0
  let pesoAcumulado = 0
  let hayCriticoAbierto = false

  for (const [cat, hallazgos] of Object.entries(hallazgosPorCategoria)) {
    const r = puntuarCategoria(hallazgos, cfg)
    categorias[cat] = { peso: pesos[cat] ?? 0, ...r }
    if (r.critico_abierto) hayCriticoAbierto = true
    if (r.porcentaje !== null) {
      totalPonderado += r.porcentaje * (pesos[cat] ?? 0)
      pesoAcumulado += (pesos[cat] ?? 0)
    }
  }

  const puntuacionTotal = pesoAcumulado > 0 ? Math.round(totalPonderado / pesoAcumulado) : null

  // contar altos no cumplidos por categoria
  let categoriasConVariosAltos = false
  for (const hallazgos of Object.values(hallazgosPorCategoria)) {
    const altos = hallazgos.filter(h => h.criticidad === 'Alto' && h.estado === 'no-cumplido').length
    if (altos > cfg.reglas_dictamen.max_altos_por_categoria_con_observaciones) categoriasConVariosAltos = true
  }

  let dictamen, motivo
  if (hayCriticoAbierto && cfg.reglas_dictamen.critico_no_cumplido_fuerza_no_apto) {
    dictamen = 'NO APTO PARA QA'
    motivo = 'Hay hallazgos críticos abiertos en este desarrollo. El dictamen es No apto para calidad.'
  } else if (puntuacionTotal !== null && puntuacionTotal >= cfg.umbrales.apto) {
    dictamen = 'APTO PARA QA'
    motivo = `Puntuación ${puntuacionTotal} %. No hay hallazgos críticos abiertos. El dictamen es Apto para calidad.`
  } else if (puntuacionTotal !== null && puntuacionTotal >= cfg.umbrales.con_observaciones && !categoriasConVariosAltos) {
    dictamen = 'CON OBSERVACIONES'
    motivo = `Puntuación ${puntuacionTotal} %. El dictamen es Con observaciones. Corresponde un plan de corrección de los hallazgos de esta certificación.`
  } else {
    dictamen = 'NO APTO PARA QA'
    motivo = puntuacionTotal === null
      ? 'No hay controles evaluables suficientes para emitir dictamen sobre este desarrollo.'
      : `Puntuación ${puntuacionTotal} %. El dictamen es No apto para calidad.`
  }

  return { puntuacion_total: puntuacionTotal, dictamen, motivo, categorias, critico_abierto: hayCriticoAbierto }
}
// verificadores/codigo.js
import { leerTextoSeguro, buscarArchivos } from '../lib/fs-scan.js'

export function verificarCodigo (raiz, ingesta, def, alcance = 'estandares') {
  const h = []
  const a = ingesta.artefactos
  const archivos = ingesta._archivos
  const push = (id, estado, evidencia, recomendacion) => {
    const d = def.estandares.find(e => e.id === id) || {}
    h.push({ id, categoria: 'codigo', nombre: d.nombre, estado, criticidad: d.criticidad, evidencia, recomendacion })
  }

  // Leer package.json (si hay) para inspeccionar frontend/deps
  let pkg = null
  if (a.package_json.length > 0) {
    try { pkg = JSON.parse(leerTextoSeguro(raiz, a.package_json[0]) || '{}') } catch { pkg = null }
  }
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {}

  // COD1 — backend Python hexagonal
  if (ingesta.presencia.tiene_backend_python) {
    // Heuristica de hexagonal: carpetas domain/adapters/ports
    const senalHex = buscarArchivos(archivos, [/(^|\/)(domain|dominio|ports|adapters|adaptadores|application|infrastructure)\//i])
    const dominioTocaBoto = archivos.some(f => /(domain|dominio)\/.*\.py$/i.test(f) &&
      /import\s+boto3|from\s+boto3/i.test(leerTextoSeguro(raiz, f) || ''))
    if (senalHex.length > 0 && !dominioTocaBoto) push('COD1', 'cumplido', `Backend Python con estructura hexagonal (${senalHex.length} carpetas de capas).`, '-')
    else if (senalHex.length > 0) push('COD1', 'parcial', 'Estructura de capas presente, pero el dominio importa boto3.', 'El dominio no debe depender de boto3 ni de detalles de AWS (Ports & Adapters).')
    else push('COD1', 'no-cumplido', 'Backend Python sin estructura hexagonal clara (domain/ports/adapters).', 'Adoptar arquitectura hexagonal (Ports & Adapters).')
  } else if (ingesta.presencia.tiene_backend_node) {
    push('COD1', 'no-cumplido', 'El backend de este desarrollo es Node.js. El control exige Python hexagonal.', 'Alinear este desarrollo a Python hexagonal, o registrar la excepcion de stack aprobada por Arquitectura (ADR).')
  } else {
    push('COD1', 'no-verificable', 'No se detecta backend (ni Python ni Node).', 'Revisar manualmente.')
  }

  // COD2 — frontend React
  const tieneReact = !!(deps.react || deps['react-dom'])
  const otrosFw = ['vue', '@angular/core', 'svelte', 'nuxt', '@vue/cli-service'].filter(x => deps[x])
  const tieneFrontendDir = buscarArchivos(archivos, [/(^|\/)(public|frontend|src\/components|src\/pages|web)\//i]).length > 0
  if (tieneReact) push('COD2', 'cumplido', 'Frontend usa React (react en dependencias).', '-')
  else if (otrosFw.length > 0) push('COD2', 'no-cumplido', `El frontend de este desarrollo usa ${otrosFw.join(', ')}. El control exige React y el design system.`, 'Alinear este frontend a React y al design system, o registrar la excepcion aprobada por Arquitectura.')
  else if (tieneFrontendDir) push('COD2', 'no-cumplido', 'Este desarrollo tiene frontend y no declara React. El control exige React y el design system.', 'Alinear este frontend a React y al design system, o registrar la excepcion aprobada por Arquitectura.')
  else push('COD2', 'na-justificado', 'No se detecta capa de frontend (posible servicio backend puro).', '-')

  // COD3 — Design System (heuristica: import de una libreria de DS o carpeta design-system)
  const senalDs = buscarArchivos(archivos, [/design[-_ ]?system/i, /(^|\/)ds\//i])
  if (!tieneReact && otrosFw.length === 0 && !tieneFrontendDir) {
    push('COD3', 'na-justificado', 'Sin frontend: no aplica Design System.', '-')
  } else if (senalDs.length > 0) {
    push('COD3', 'cumplido', 'Se detectan referencias a un Design System.', '-')
  } else {
    push('COD3', 'no-verificable', 'No se detecta reuso explicito de un Design System; requiere revision manual.', 'Confirmar reuso del Design System (reusar > extender > crear).')
  }

  // COD6 — pruebas y cobertura. Solo se exige en alcance "completo" (puerta a produccion).
  if (alcance !== 'completo') {
    push('COD6', 'na-justificado', 'Fuera de alcance: certificacion de estandares (desarrollo/arquitectura/BD/seguridad). Las pruebas se exigen con --alcance completo (puerta a produccion).', 'Para promover a produccion, re-certificar con --alcance completo y cumplir cobertura >= 80%.')
  } else if (ingesta.presencia.tiene_tests) {
    let cobertura = null
    const covFiles = buscarArchivos(archivos, [/coverage-summary\.json$/i, /(^|\/)\.coverage$/i, /coverage\.xml$/i])
    if (covFiles.length > 0) cobertura = covFiles[0]
    push('COD6', cobertura ? 'cumplido' : 'parcial',
      `Se detectan pruebas (${a.tests.length} archivos)${cobertura ? '; reporte de cobertura presente' : '; sin reporte de cobertura'}.`,
      cobertura ? '-' : 'Publicar reporte de cobertura y verificar umbral >= 80%.')
  } else {
    push('COD6', 'no-cumplido', 'No se detectan pruebas unitarias ni script/framework de test.', 'Agregar pruebas y alcanzar cobertura >= 80%.')
  }

  return h
}
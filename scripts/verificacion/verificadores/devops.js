// verificadores/devops.js
import { leerTextoSeguro, buscarArchivos } from '../lib/fs-scan.js'

export function verificarDevops (raiz, ingesta, def) {
  const h = []
  const a = ingesta.artefactos
  const archivos = ingesta._archivos
  const push = (id, estado, evidencia, recomendacion) => {
    const d = def.estandares.find(e => e.id === id) || {}
    h.push({ id, categoria: 'devops', nombre: d.nombre, estado, criticidad: d.criticidad, evidencia, recomendacion })
  }

  // DEVOPS1 — pipeline con seguridad
  const senalesAmplify = a.amplify || []
  const tieneAmplify = senalesAmplify.length > 0
  if (a.gitlab_ci.length === 0) {
    if (tieneAmplify) {
      // El pipeline del frontend lo administra el CI/CD integrado de AWS Amplify
      // (la buildSpec y los pasos de build/deploy viven en la consola de Amplify,
      // no en un archivo del repositorio). No es una amenaza ni un bloqueo: se
      // difiere a verificacion en consola y se advierte donde auditarlo.
      push('DEVOPS1', 'diferido-piloto', `No hay pipeline en el repositorio, pero se detecta AWS Amplify (${senalesAmplify.join(', ')}). El CI/CD del frontend lo gestiona Amplify.`, 'Verificar en la consola de AWS Amplify el build/deploy y, si aplica, agregar secret-scan/SAST/escaneo de dependencias en los build settings de Amplify o en un pipeline del backend.')
    } else {
      push('DEVOPS1', 'no-cumplido', 'No existe pipeline CI (.gitlab-ci.yml).', 'Agregar pipeline de build/test con secret-scan, SAST y escaneo de dependencias.')
    }
  } else {
    const c = leerTextoSeguro(raiz, a.gitlab_ci[0]) || ''
    const tieneBuildTest = /(^|\n)\s*(build|test|lint)\b|npm (run )?(build|test)|pytest|jest|vitest/i.test(c)
    const tieneSeguridad = /sast|dependency[_-]?scanning|secret[_-]?detection|trivy|snyk|npm audit|semgrep/i.test(c)
    const soloDashboard = /dashboard|reporte-avance|INDICE-PROGRESO/i.test(c) && !tieneBuildTest
    if (tieneBuildTest && tieneSeguridad) push('DEVOPS1', 'cumplido', 'Pipeline con build/test y etapas de seguridad.', '-')
    else if (soloDashboard) push('DEVOPS1', 'no-cumplido', 'El pipeline de este desarrollo cubre el tablero de avance y no incluye build, pruebas ni analisis de seguridad del codigo.', 'Incluir en el pipeline de este desarrollo build, pruebas, secret-scan, SAST y escaneo de dependencias.')
    else push('DEVOPS1', 'parcial', 'Pipeline presente pero sin etapas de seguridad detectadas.', 'Agregar SAST + escaneo de dependencias + secret-scan.')
  }

  // DEVOPS2 — despliegue parametrizado por ambiente
  const scriptsDeploy = buscarArchivos(archivos, [/deploy|despliegue|sam deploy/i]).filter(f => /\.(sh|bat|ya?ml|toml|js|py|md)$/i.test(f))
  const tieneSamconfig = a.samconfig_toml.length > 0
  if (tieneSamconfig) push('DEVOPS2', 'cumplido', 'samconfig.toml habilita despliegue parametrizado por ambiente.', '-')
  else if (scriptsDeploy.length > 0) push('DEVOPS2', 'parcial', `Scripts de despliegue detectados (${scriptsDeploy.length}), sin parametrizacion clara por ambiente.`, 'Parametrizar despliegue por dev/qa/prod (idealmente samconfig.toml).')
  else push('DEVOPS2', 'no-cumplido', 'No se detecta despliegue parametrizado por ambiente.', 'Definir despliegue por ambiente dev/qa/prod.')

  // DEVOPS3 — health check
  let health = null
  for (const f of archivos.filter(x => /\.(js|mjs|cjs|ts|py|ya?ml)$/i.test(x))) {
    const c = leerTextoSeguro(raiz, f) || ''
    if (/\/health\b|healthcheck|health_check|HealthCheck|\/ping\b|\/status\b/i.test(c)) { health = f; break }
  }
  if (health) push('DEVOPS3', 'cumplido', `Health check detectado en ${health}.`, '-')
  else push('DEVOPS3', 'no-cumplido', 'No se detecta endpoint/handler de health check.', 'Agregar un health check (/health) con verificacion de dependencias.')

  // DEP1 — dependencias pinneadas / lockfile
  const lockfiles = buscarArchivos(archivos, [/package-lock\.json$/i, /yarn\.lock$/i, /pnpm-lock\.yaml$/i, /poetry\.lock$/i, /Pipfile\.lock$/i, /requirements\.txt$/i])
  let rangos = false
  if (a.package_json.length > 0) {
    try {
      const pkg = JSON.parse(leerTextoSeguro(raiz, a.package_json[0]) || '{}')
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      rangos = Object.values(deps).some(v => /^[\^~]/.test(String(v)))
    } catch { /* noop */ }
  }
  if (lockfiles.length > 0 && !rangos) push('DEP1', 'cumplido', 'Lockfile presente y versiones sin rangos abiertos.', '-')
  else if (lockfiles.length > 0) push('DEP1', 'parcial', 'Dependencias con rangos (^/~) pero con lockfile (builds reproducibles con install determinista).', 'Considerar pinneo exacto; el lockfile mitiga parcialmente.')
  else push('DEP1', 'no-cumplido', 'Sin lockfile ni versiones pinneadas.', 'Fijar versiones y versionar el lockfile.')

  return h
}
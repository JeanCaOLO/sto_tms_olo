// lib/ingesta.js — detecta artefactos clave del proyecto a auditar
import { listarArchivos, buscarArchivos, existe, leerTextoSeguro } from './fs-scan.js'

export function ingestar (raiz) {
  const archivos = listarArchivos(raiz)
  const norm = archivos.map(a => a.replace(/\\/g, '/'))

  const templateSam = buscarArchivos(archivos, [/(^|\/)template\.ya?ml$/i])
  const samconfig = buscarArchivos(archivos, [/(^|\/)samconfig\.toml$/i])
  const dockerfile = buscarArchivos(archivos, [/(^|\/)Dockerfile$/i])
  const gitlabCi = buscarArchivos(archivos, [/(^|\/)\.gitlab-ci\.yml$/i])
  const packageJson = buscarArchivos(archivos, [/(^|\/)package\.json$/i]).filter(p => !p.includes('node_modules'))
  const requirementsTxt = buscarArchivos(archivos, [/(^|\/)requirements\.txt$/i])
  const pyproject = buscarArchivos(archivos, [/(^|\/)pyproject\.toml$/i])

  // Deteccion de AWS Amplify (frontend hospedado/gestionado por Amplify).
  // El CI/CD, el WAF, el hosting/TLS, el dominio y las variables de entorno del
  // frontend viven en la consola de Amplify, no en archivos del repositorio.
  // Se exige al menos una senal fuerte de hosting/infraestructura Amplify:
  //   1) amplify.yml / amplify.yaml (buildSpec del hosting)
  //   2) carpeta amplify/ (proyecto generado por Amplify CLI/Gen2)
  // La dependencia aws-amplify / @aws-amplify/* en package.json se registra como
  // senal complementaria cuando ya existe una senal fuerte (por si sola solo
  // demuestra uso del SDK cliente y no que el frontend este hospedado en Amplify).
  const amplifyBuildspec = buscarArchivos(archivos, [/(^|\/)amplify\.ya?ml$/i])
  const amplifyDir = buscarArchivos(archivos, [/(^|\/)amplify\//i])
  let amplifyDependencia = false
  for (const p of packageJson) {
    try {
      const pkg = JSON.parse(leerTextoSeguro(raiz, p) || '{}')
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      if (Object.keys(deps).some(k => /^@?aws-amplify(\/|$)/i.test(k))) { amplifyDependencia = true; break }
    } catch { /* noop */ }
  }
  const senalesFuertesAmplify = []
  if (amplifyBuildspec.length > 0) senalesFuertesAmplify.push(amplifyBuildspec[0].replace(/\\/g, '/'))
  if (amplifyDir.length > 0) senalesFuertesAmplify.push('amplify/')
  const tieneAmplify = senalesFuertesAmplify.length > 0
  const senalesAmplify = tieneAmplify
    ? [...senalesFuertesAmplify, ...(amplifyDependencia ? ['dependencia aws-amplify'] : [])]
    : []

  // Deteccion de artefactos de tests
  const tests = buscarArchivos(archivos, [
    /(^|\/)tests?\//i, /\.test\.[jt]sx?$/i, /\.spec\.[jt]sx?$/i, /(^|\/)test_.*\.py$/i, /_test\.py$/i
  ])

  return {
    total_archivos: archivos.length,
    artefactos: {
      template_sam: templateSam,
      samconfig_toml: samconfig,
      dockerfile: dockerfile,
      gitlab_ci: gitlabCi,
      package_json: packageJson,
      requirements_txt: requirementsTxt,
      pyproject_toml: pyproject,
      tests: tests,
      amplify: senalesAmplify
    },
    presencia: {
      tiene_iac_sam: templateSam.length > 0,
      tiene_docker: dockerfile.length > 0,
      tiene_ci: gitlabCi.length > 0,
      tiene_backend_node: packageJson.length > 0,
      tiene_backend_python: requirementsTxt.length > 0 || pyproject.length > 0,
      tiene_tests: tests.length > 0,
      tiene_amplify: tieneAmplify
    },
    _archivos: norm
  }
}
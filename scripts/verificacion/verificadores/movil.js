import { buscarArchivos, leerTextoSeguro } from '../lib/fs-scan.js'

const FUENTES_MOVILES = /\.(kt|kts|swift|xml|plist|properties)$/i
const MATERIAL_FIRMA = /(^|\/)(local\.properties|key\.properties|secrets?\.(xml|plist|properties)|[^/]+\.(jks|keystore|p12|p8|mobileprovision))$/i

function textos (raiz, archivos) {
  return archivos.map(ruta => ({ ruta, texto: leerTextoSeguro(raiz, ruta) || '' }))
}

function contieneSecretoLiteral (texto) {
  return (
    /(?:api[_-]?key|token|password|secret|client[_-]?secret)\s*[=:]\s*["'][^"']{8,}["']/i.test(texto) ||
    /(?:api[_-]?key|token|password|secret|client[_-]?secret)\s*[=:]\s*[^\s#"']{8,}/i.test(texto) ||
    /<string[^>]+name=["'][^"']*(?:api[_-]?key|token|password|secret)[^"']*["'][^>]*>[^<]{8,}<\/string>/i.test(texto) ||
    /<key>\s*(?:api[_-]?key|token|password|secret|client[_-]?secret)\s*<\/key>\s*<(?:string|data)>[^<]{8,}<\/(?:string|data)>/i.test(texto) ||
    /AKIA[0-9A-Z]{16}|-----BEGIN [^-]*PRIVATE KEY-----/i.test(texto)
  )
}

export function verificarMovil (raiz, ingesta, def, alcance = 'estandares') {
  const h = []
  const archivos = ingesta._archivos
  const definicion = id => def.estandares.find(e => e.id === id) || {}
  const push = (id, estado, evidencia, recomendacion) => {
    const d = definicion(id)
    h.push({ id, categoria: 'movil', nombre: d.nombre, estado, criticidad: d.criticidad, evidencia, recomendacion })
  }

  const gradle = buscarArchivos(archivos, [/(^|\/)build\.gradle(\.kts)?$/i, /(^|\/)settings\.gradle(\.kts)?$/i])
  const wrapper = buscarArchivos(archivos, [/(^|\/)gradlew(\.bat)?$/i, /gradle\/wrapper\/gradle-wrapper\.properties$/i])
  const kotlin = buscarArchivos(archivos, [/\.kt$/i, /\.kts$/i])
  const manifest = buscarArchivos(archivos, [/(^|\/)AndroidManifest\.xml$/i])
  const ios = buscarArchivos(archivos, [/(^|\/)Info\.plist$/i, /project\.pbxproj$/i, /(^|\/)ios(Main|App)?\//i, /\.swift$/i])
  const privacy = buscarArchivos(archivos, [/(^|\/)PrivacyInfo\.xcprivacy$/i])
  const pruebas = buscarArchivos(archivos, [/(^|\/)(commonTest|androidTest|androidUnitTest|iosTest|test)\//i, /(Test|Tests)\.kt$/i])
  const fuentes = archivos.filter(ruta => FUENTES_MOVILES.test(ruta))
  const contenidoFuentes = textos(raiz, fuentes)

  if (gradle.length > 0 && wrapper.length > 0 && kotlin.length > 0) {
    push('MOB1', 'cumplido', `Gradle Wrapper, ${gradle.length} archivos de build y ${kotlin.length} fuentes Kotlin detectadas.`, '-')
  } else {
    const faltan = [gradle.length === 0 ? 'build Gradle' : null, wrapper.length === 0 ? 'Gradle Wrapper' : null, kotlin.length === 0 ? 'fuentes Kotlin' : null].filter(Boolean)
    push('MOB1', 'no-cumplido', `Faltan artefactos de proyecto móvil: ${faltan.join(', ')}.`, 'Versionar el wrapper y la configuración reproducible del proyecto Kotlin/Android.')
  }

  const firma = archivos.filter(ruta => MATERIAL_FIRMA.test(ruta))
  const secretos = contenidoFuentes
    .filter(({ texto }) => contieneSecretoLiteral(texto))
    .map(({ ruta }) => ruta)
  const sensibles = [...new Set([...firma, ...secretos])]
  if (sensibles.length > 0) {
    push('MOB2', 'no-cumplido', `Material sensible o credenciales potenciales en ${sensibles.join(', ')}. Los valores no se incluyen en el informe.`, 'Retirar el material del repositorio, rotar credenciales expuestas y usar almacenamiento seguro fuera del control de versiones.')
  } else {
    push('MOB2', 'cumplido', 'No se detectan keystores, perfiles de firma, local.properties ni secretos literales en fuentes móviles.', '-')
  }

  if (manifest.length === 0) {
    push('MOB3', 'na-justificado', 'No se detecta target Android en el alcance.', '-')
  } else {
    const gradleText = textos(raiz, gradle).map(x => x.texto).join('\n')
    const tieneTarget = /targetSdk(?:Version)?\s*(?:=|\s)\s*\d+/i.test(gradleText)
    push('MOB3', tieneTarget ? 'cumplido' : 'no-cumplido', tieneTarget ? `Manifiesto Android y targetSdk explícito detectados (${manifest[0]}).` : 'Existe AndroidManifest.xml, pero no se detecta targetSdk explícito.', tieneTarget ? '-' : 'Declarar targetSdk en la configuración Gradle versionada del módulo Android.')
  }

  const tlsInseguro = contenidoFuentes.filter(({ texto }) =>
    /ALLOW_ALL_HOSTNAME_VERIFIER|TrustAll|onReceivedSslError[\s\S]{0,200}\.proceed\s*\(|HostnameVerifier[\s\S]{0,120}->\s*true/i.test(texto)
  ).map(({ ruta }) => ruta)
  if (tlsInseguro.length > 0) {
    push('MOB4', 'no-cumplido', `Validación TLS potencialmente desactivada en ${tlsInseguro.join(', ')}.`, 'Eliminar trust managers, hostname verifiers o callbacks que acepten certificados indiscriminadamente.')
  } else {
    push('MOB4', 'cumplido', 'No se detectan patrones conocidos de aceptación indiscriminada de certificados u hostnames.', '-')
  }

  if (ios.length === 0) {
    push('MOB5', 'na-justificado', 'No se detecta target iOS en el alcance.', '-')
  } else if (buscarArchivos(archivos, [/(^|\/)Info\.plist$/i]).length === 0) {
    push('MOB5', 'no-cumplido', 'Se detectan fuentes o proyecto iOS sin Info.plist.', 'Versionar y revisar el Info.plist correspondiente al target iOS.')
  } else if (privacy.length === 0) {
    push('MOB5', 'no-verificable', 'Info.plist presente; no se detecta PrivacyInfo.xcprivacy. Su obligatoriedad depende de las APIs y SDK usados.', 'Revisar en macOS/Xcode si las APIs y SDK del proyecto requieren privacy manifest.')
  } else {
    push('MOB5', 'cumplido', `Info.plist y privacy manifest detectados (${privacy[0]}).`, '-')
  }

  const globalScope = contenidoFuentes.filter(({ texto }) => /\bGlobalScope\b/.test(texto)).map(({ ruta }) => ruta)
  if (globalScope.length > 0) {
    push('MOB6', 'no-cumplido', `GlobalScope detectado en ${globalScope.join(', ')}.`, 'Usar scopes con propietario, cancelación y ciclo de vida conocidos.')
  } else {
    push('MOB6', 'cumplido', 'No se detecta GlobalScope en las fuentes móviles.', '-')
  }

  if (alcance !== 'completo') {
    push('MOB7', 'na-justificado', 'Las pruebas se exigen con --alcance completo.', 'Para promover a producción, re-certificar con alcance completo.')
  } else if (pruebas.length > 0) {
    push('MOB7', 'cumplido', `Se detectan ${pruebas.length} archivos o source sets de prueba móvil.`, '-')
  } else {
    push('MOB7', 'no-cumplido', 'No se detectan pruebas Kotlin, Android o iOS.', 'Agregar pruebas en los source sets correspondientes antes de promover.')
  }

  const ci = ingesta.artefactos.gitlab_ci
  if (ci.length === 0) {
    push('MOB8', 'no-cumplido', 'No se detecta pipeline GitLab para build móvil.', 'Agregar jobs que usen Gradle Wrapper para check, test o build; iOS requiere runner macOS cuando aplique.')
  } else {
    const ciText = textos(raiz, ci).map(x => x.texto).join('\n')
    const tareaMovil = /gradlew(?:\.bat)?\s+[^\n]*(check|test|assemble|bundle|build)/i.test(ciText)
    push('MOB8', tareaMovil ? 'cumplido' : 'parcial', tareaMovil ? 'El pipeline ejecuta tareas móviles mediante Gradle Wrapper.' : 'Existe pipeline, pero no se detectan tareas móviles con Gradle Wrapper.', tareaMovil ? '-' : 'Agregar al pipeline una tarea reproducible de check, test, assemble o bundle.')
  }

  return h
}

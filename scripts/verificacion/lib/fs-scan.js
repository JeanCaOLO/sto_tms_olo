// lib/fs-scan.js — utilidades de escaneo seguro (solo lectura, no ejecuta nada)
import fs from 'node:fs'
import path from 'node:path'

const IGNORAR_DIRS = new Set([
  'node_modules', '.git', '.aws-sam', 'dist', 'build', '.venv', 'venv',
  '__pycache__', '.serverless', 'cdk.out', 'coverage', '.next', '.cache'
])

// Extensiones de archivos de texto que tiene sentido inspeccionar
const EXT_TEXTO = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.json', '.yaml', '.yml',
  '.toml', '.md', '.html', '.css', '.env', '.example', '.sh', '.bat', '.txt',
  '.tf', '.cfg', '.ini', '.xml', '.gitlab-ci'
])

// Nombres de archivo que pueden contener secretos: nunca volcar su contenido crudo
const ARCHIVOS_SENSIBLES = [/\.env$/i, /\.env\./i, /\.pem$/i, /\.key$/i, /credentials/i, /secret/i]

export function esArchivoSensible (rutaRel) {
  return ARCHIVOS_SENSIBLES.some(re => re.test(rutaRel))
}

// Recorre el proyecto y devuelve la lista de archivos (rutas relativas), acotado en profundidad
export function listarArchivos (raiz, maxArchivos = 20000) {
  const resultado = []
  function recorrer (dir) {
    if (resultado.length >= maxArchivos) return
    let entradas
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entradas) {
      if (resultado.length >= maxArchivos) return
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (IGNORAR_DIRS.has(e.name)) continue
        recorrer(abs)
      } else if (e.isFile()) {
        resultado.push(path.relative(raiz, abs))
      }
    }
  }
  recorrer(raiz)
  return resultado
}

// Lee un archivo de texto de forma segura. Nunca devuelve el contenido de archivos sensibles.
export function leerTextoSeguro (raiz, rutaRel, maxBytes = 512 * 1024) {
  if (esArchivoSensible(rutaRel)) return null
  const abs = path.join(raiz, rutaRel)
  try {
    const stat = fs.statSync(abs)
    if (stat.size > maxBytes) {
      const fd = fs.openSync(abs, 'r')
      const buf = Buffer.alloc(maxBytes)
      fs.readSync(fd, buf, 0, maxBytes, 0)
      fs.closeSync(fd)
      return buf.toString('utf8')
    }
    return fs.readFileSync(abs, 'utf8')
  } catch { return null }
}

export function existe (raiz, rutaRel) {
  try { return fs.existsSync(path.join(raiz, rutaRel)) } catch { return false }
}

// Devuelve el primer archivo que matchee alguno de los patrones (regex sobre ruta relativa)
export function buscarArchivos (archivos, patrones) {
  const res = []
  for (const a of archivos) {
    const norm = a.replace(/\\/g, '/')
    if (patrones.some(re => re.test(norm))) res.push(a)
  }
  return res
}

// Sanea un fragmento de evidencia: recorta y enmascara posibles valores de secretos
export function sanearEvidencia (texto, maxLen = 200) {
  if (!texto) return ''
  let t = String(texto)
  // enmascarar asignaciones tipo SECRETO=valor / "password": "valor"
  t = t.replace(/((?:secret|password|token|api[_-]?key|clave)\s*[:=]\s*["']?)([^\s"',}]+)/gi, '$1***')
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length > maxLen) t = t.slice(0, maxLen) + '...'
  return t
}
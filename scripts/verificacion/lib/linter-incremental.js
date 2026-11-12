// lib/linter-incremental.js — linter de seguridad INCREMENTAL INTELIX (Cyber Neo)
//
// Aviso TEMPRANO de seguridad sobre un conjunto reducido de archivos (un diff, un
// commit en preparacion, un MR). Reusa los patrones y el escaneo seguro del motor
// de certificacion (lib/fs-scan.js + verificadores/seguridad.js) para dar feedback
// rapido ANTES de que el codigo llegue a CI.
//
// REGLA INQUEBRANTABLE: este linter NO emite el dictamen de certificacion ni
// recalcula puntuaciones. La fuente de verdad del dictamen (Apto / Con
// observaciones / No apto) sigue siendo el motor (analizador.js), que corre en CI
// y lo interpreta la skill intelix-certificacion. Aqui solo advertimos temprano.
//
// Solo lectura, sin dependencias nuevas (node puro + fs-scan del propio motor).
//
// Uso directo:
//   node scripts/verificacion/lib/linter-incremental.js <archivo...> [--json] [--staged]
//   git diff --name-only --cached | node scripts/verificacion/lib/linter-incremental.js --staged
//
// Exit codes: 0 = sin hallazgos HARD abiertos; 1 = hay hallazgos HARD (R1/R3/R5/R6).

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { leerTextoSeguro, esArchivoSensible, sanearEvidencia } from './fs-scan.js'

// Patrones alineados con verificadores/seguridad.js (misma semantica R1-R7).
const PAT_SECRETO_ASIGNADO = /(secret|password|passwd|api[_-]?key|token|access[_-]?key|private[_-]?key)\s*[:=]\s*["'][^"'\s<>${}]{8,}["']/i
const PAT_PLACEHOLDER = /(<[^>]+>|example|placeholder|cambiar|changeme|xxx+|\*\*\*|process\.env|os\.environ|\$\{)/i
const PAT_AWS_KEY = /AKIA[0-9A-Z]{16}/
const PAT_CONCAT_SQL = /(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b[^;]*(\+\s*\w+|\$\{|%\s*\(|['"]\s*\+)/i
const PAT_QUERY_BUILDER = /knex|sequelize|typeorm|prisma|sqlalchemy|psycopg2|\.query\(\s*[`'"][^`'"]*\$\d/i
const PAT_AUTH_NONE = /AuthorizationType:\s*NONE/i
const PAT_IAM_WILDCARD = /["']?(Action|Resource)["']?\s*:\s*["']\*["']/i
const PAT_CORS_ABIERTO = /cors\(\s*\{[^}]*origin\s*:\s*true|cors\(\s*\{[^}]*origin\s*:\s*["']\*["']|Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/i
const PAT_CSP_OFF = /contentSecurityPolicy\s*:\s*false/i
const PAT_LOG_PII = /(console\.(log|info|debug)|print|logger\.\w+)\s*\([^)]*(password|secret|token|salario|costo)/i

const EXT_CODIGO = /\.(js|mjs|cjs|ts|tsx|jsx|py)$/i
const EXT_IAC = /\.(json|yaml|yml)$/i

// (id, control, hard_stop) — hard_stop alineado con el baseline R1-R14.
const REGLAS_META = {
  R1: { control: 'Secretos embebidos', hard: true },
  R2: { control: 'SQL sin parametrizar', hard: false },
  R3: { control: 'Endpoint sin autenticacion (AuthorizationType: NONE)', hard: true },
  R4: { control: 'IAM con comodin (Action/Resource: *)', hard: false },
  R6: { control: 'CORS abierto / CSP desactivada', hard: true },
  R7: { control: 'Log de datos sensibles / PII', hard: false },
}

function listarDesdeGitStaged (raiz) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--cached', '--diff-filter=ACM'], {
      cwd: raiz, encoding: 'utf8'
    })
    return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function leerStdin () {
  try {
    const data = fs.readFileSync(0, 'utf8')
    return data.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

// Analiza un conjunto de archivos (rutas relativas a raiz) y devuelve hallazgos.
export function lintArchivos (raiz, archivosRel) {
  const hallazgos = []
  const push = (id, archivo, linea, evidencia, recomendacion) => {
    const meta = REGLAS_META[id] || { control: id, hard: false }
    hallazgos.push({
      id,
      control: meta.control,
      hard_stop: meta.hard,
      archivo,
      linea,
      evidencia: sanearEvidencia(evidencia),
      recomendacion,
    })
  }

  for (const rel of archivosRel) {
    const norm = rel.replace(/\\/g, '/')
    // Nunca volcar contenido de archivos sensibles; pero si alertar que existen.
    if (esArchivoSensible(norm)) {
      push('R1', norm, 0, `Archivo sensible en el cambio: ${norm}`,
        'Confirmar que no se versiona (.gitignore) y que no contiene secretos.')
      continue
    }
    const contenido = leerTextoSeguro(raiz, norm)
    if (contenido == null) continue
    const esCodigo = EXT_CODIGO.test(norm)
    const esIac = EXT_IAC.test(norm)
    const esExample = /\.env\.example$/i.test(norm) || /example/i.test(norm)
    const lineas = contenido.split(/\r?\n/)

    // R1 — secretos embebidos (por linea; ignora .example y placeholders)
    if (!esExample) {
      for (let i = 0; i < lineas.length; i++) {
        const ln = lineas[i]
        if (PAT_AWS_KEY.test(ln)) {
          push('R1', norm, i + 1, `${norm}:${i + 1} posible AWS key`,
            'Mover a Secrets Manager/SSM; rotar la clave si fue expuesta.')
        } else if (PAT_SECRETO_ASIGNADO.test(ln) && !PAT_PLACEHOLDER.test(ln)) {
          push('R1', norm, i + 1, `${norm}:${i + 1}`,
            'No embeber secretos; usar variables de entorno / Secrets Manager.')
        }
      }
    }

    if (esCodigo) {
      // R2 — concatenacion SQL (si no se ve query builder en el mismo archivo)
      if (PAT_CONCAT_SQL.test(contenido) && !PAT_QUERY_BUILDER.test(contenido)) {
        push('R2', norm, 0, `Posible concatenacion de SQL en ${norm}`,
          'Usar consultas parametrizadas o query builder; nunca concatenar entrada.')
      }
      // R6 — CORS abierto / CSP off
      if (PAT_CORS_ABIERTO.test(contenido)) {
        push('R6', norm, 0, `CORS abierto en ${norm}`,
          'CORS por lista de dominios; jamas reflejar cualquiera con credentials.')
      }
      if (PAT_CSP_OFF.test(contenido)) {
        push('R6', norm, 0, `CSP desactivada en ${norm}`,
          'Habilitar Content-Security-Policy (p. ej. Helmet).')
      }
      // R7 — log de PII/secretos
      if (PAT_LOG_PII.test(contenido)) {
        push('R7', norm, 0, `Posible log de datos sensibles en ${norm}`,
          'No registrar secretos ni PII (costos/salarios/personal) en logs.')
      }
    }

    if (esIac) {
      // R4 — comodin IAM
      if (PAT_IAM_WILDCARD.test(contenido)) {
        push('R4', norm, 0, `Comodin IAM (Action/Resource: *) en ${norm}`,
          'Usar acciones y ARNs concretos (minimo privilegio).')
      }
    }

    // R3 — AuthorizationType: NONE en templates SAM/YAML
    if (/\.(ya?ml)$/i.test(norm) && PAT_AUTH_NONE.test(contenido)) {
      push('R3', norm, 0, `AuthorizationType: NONE en ${norm}`,
        'Prohibido en endpoints protegidos; usar authorizer/Cognito.')
    }
  }

  return hallazgos
}

function resolverArchivos (raiz, args) {
  if (args.staged) {
    const porStdin = leerStdin()
    if (porStdin.length) return porStdin
    return listarDesdeGitStaged(raiz)
  }
  if (args.rutas.length) return args.rutas
  // Sin argumentos: leer de stdin (modo pipe), si no hay nada, vacio.
  return leerStdin()
}

function parseArgs (argv) {
  const args = { rutas: [], json: false, staged: false, raiz: process.cwd() }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') args.json = true
    else if (a === '--staged') args.staged = true
    else if (a === '--proyecto' || a === '-p') args.raiz = argv[++i]
    else if (a === '--help' || a === '-h') args.help = true
    else args.rutas.push(a)
  }
  return args
}

function main () {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log(`Linter de seguridad incremental INTELIX (Cyber Neo)

Uso:
  node scripts/verificacion/lib/linter-incremental.js <archivo...> [--json]
  git diff --name-only --cached | node scripts/verificacion/lib/linter-incremental.js --staged

Opciones:
  --staged        Toma los archivos staged (git) o los recibidos por stdin
  --proyecto, -p  Raiz del proyecto (por defecto: cwd)
  --json          Salida JSON

AVISO TEMPRANO: no emite el dictamen de certificacion. El dictamen oficial
(Apto/Con observaciones/No apto) lo fija el motor (analizador.js) en CI.
`)
    process.exit(0)
  }

  const raiz = path.resolve(args.raiz)
  const archivos = resolverArchivos(raiz, args)
  const hallazgos = lintArchivos(raiz, archivos)
  const hard = hallazgos.filter(h => h.hard_stop)

  if (args.json) {
    console.log(JSON.stringify({
      archivos_analizados: archivos.length,
      hallazgos,
      hard_stop_abiertos: hard.length,
      nota: 'Aviso temprano. El dictamen oficial lo fija el motor de certificacion en CI.'
    }, null, 2))
  } else {
    console.log(`Linter de seguridad incremental — ${archivos.length} archivo(s) analizado(s)`)
    if (!hallazgos.length) {
      console.log('Sin hallazgos de seguridad en el cambio. (Aviso temprano; el dictamen oficial lo fija el motor en CI.)')
    } else {
      for (const h of hallazgos) {
        const tag = h.hard_stop ? 'HARD' : 'warn'
        console.log(`  [${tag}] ${h.id} ${h.control} — ${h.evidencia}`)
        console.log(`         -> ${h.recomendacion}`)
      }
      console.log(`\n${hard.length} hallazgo(s) HARD-STOP abierto(s). Recordatorio: el dictamen oficial lo emite el motor (scripts/verificacion/analizador.js) en CI.`)
    }
  }

  process.exit(hard.length ? 1 : 0)
}

// Solo ejecutar como CLI si se invoca directamente (no al importarlo).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
}

#!/usr/bin/env node
// analizador.js — orquestador del motor de verificacion/certificacion INTELIX
// Uso: node scripts/verificacion/analizador.js --proyecto <ruta> [--salida <dir>] [--formato json,md,html]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ingestar } from './lib/ingesta.js'
import { calcularDictamen } from './lib/dictamen.js'
import { verificarInfraestructura } from './verificadores/infraestructura.js'
import { verificarCodigo } from './verificadores/codigo.js'
import { verificarSeguridad } from './verificadores/seguridad.js'
import { verificarDevops } from './verificadores/devops.js'
import { verificarMovil } from './verificadores/movil.js'
import { generarMarkdown } from './reportes/markdown.js'
import { generarHtml } from './reportes/html.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs (argv) {
  const args = { proyecto: null, salida: null, formato: 'json,md,html', exposicion: 'desconocida', alcance: 'estandares', idioma: 'es' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--proyecto' || a === '-p') args.proyecto = argv[++i]
    else if (a === '--salida' || a === '-o') args.salida = argv[++i]
    else if (a === '--formato' || a === '-f') args.formato = argv[++i]
    else if (a === '--exposicion' || a === '-e') args.exposicion = String(argv[++i] || '').toLowerCase()
    else if (a === '--alcance' || a === '-a') args.alcance = String(argv[++i] || '').toLowerCase()
    else if (a === '--idioma' || a === '-i') args.idioma = String(argv[++i] || 'es').toLowerCase()
    else if (a === '--help' || a === '-h') args.help = true
    else if (!args.proyecto) args.proyecto = a
  }
  return args
}

function ayuda () {
  console.log(`
Motor de Verificacion y Certificacion de Estandares INTELIX

Uso:
  node scripts/verificacion/analizador.js --proyecto <ruta> [opciones]

Opciones:
  --proyecto, -p <ruta>   Ruta del proyecto a auditar (requerido)
  --salida,   -o <dir>    Carpeta de salida de los reportes (por defecto: <proyecto>/docs/certificaciones)
  --formato,  -f <lista>  Formatos separados por coma: json,md,html (por defecto: todos)
  --exposicion,-e <perfil> Exposicion de la app: publica | corporativa (por defecto: se pregunta/desconocida)
  --alcance,   -a <nivel>  Alcance: estandares (por defecto, sin pruebas) | completo (puerta a produccion, exige pruebas)
  --idioma,    -i <codigo> Idioma del informe: es (por defecto) | en
  --help,     -h          Muestra esta ayuda

Ejemplo:
  node scripts/verificacion/analizador.js --proyecto C:/ruta/proyecto

Dictamen posible: APTO PARA QA | CON OBSERVACIONES | NO APTO PARA QA
Codigos de salida: 0 = Apto, 1 = Con observaciones, 2 = No apto, 3 = error de uso.
`)
}

function cargarJson (rel) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8'))
}

function cargarPoliticaAplicabilidad (raiz) {
  const ruta = path.join(raiz, '.intelix', 'applicability-policy.json')
  if (!fs.existsSync(ruta)) return null
  let politica
  try {
    politica = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer ${ruta}: ${error.message}`)
  }
  if (politica.schemaVersion !== 1 || !politica.certification?.status) {
    throw new Error(`Politica de aplicabilidad no soportada o incompleta: ${ruta}`)
  }
  return politica
}

function main () {
  const args = parseArgs(process.argv)
  if (args.help) { ayuda(); process.exit(0) }
  if (!args.proyecto) { console.error('ERROR: falta --proyecto <ruta>.'); ayuda(); process.exit(3) }

  const raiz = path.resolve(args.proyecto)
  if (!fs.existsSync(raiz) || !fs.statSync(raiz).isDirectory()) {
    console.error(`ERROR: la ruta no existe o no es un directorio: ${raiz}`); process.exit(3)
  }

  let politicaAplicabilidad
  try {
    politicaAplicabilidad = cargarPoliticaAplicabilidad(raiz)
  } catch (error) {
    console.error(`ERROR: ${error.message}`); process.exit(3)
  }
  if (politicaAplicabilidad?.certification.status === 'unsupported') {
    console.error(
      `ERROR: la certificacion no esta soportada para el perfil declarado. ${politicaAplicabilidad.certification.reason}`
    )
    console.error('No se emitio un dictamen AWS/React que pueda confundirse con una certificacion integral del proyecto.')
    process.exit(3)
  }
  if (politicaAplicabilidad?.certification.status === 'review-required') {
    console.warn(`ADVERTENCIA: aplicabilidad pendiente de revision. ${politicaAplicabilidad.certification.reason}`)
  }

  // Cargar definiciones y config
  const defInfra = cargarJson('estandares/infraestructura.json')
  const defCod = cargarJson('estandares/codigo.json')
  const defSeg = cargarJson('estandares/seguridad.json')
  const defDev = cargarJson('estandares/devops.json')
  const defMovil = cargarJson('estandares/movil.json')
  const cfg = cargarJson('umbrales.json')

  console.log(`\nAuditando: ${raiz}`)
  const ingesta = ingestar(raiz)
  console.log(`Archivos escaneados: ${ingesta.total_archivos}`)

  const esMovil = politicaAplicabilidad?.technicalProfiles?.mobileKmp === 'applicable'
  const hallazgosPorCategoria = esMovil
    ? { movil: verificarMovil(raiz, ingesta, defMovil, args.alcance) }
    : {
        infraestructura: verificarInfraestructura(raiz, ingesta, defInfra),
        codigo: verificarCodigo(raiz, ingesta, defCod, args.alcance),
        seguridad: verificarSeguridad(raiz, ingesta, defSeg, args.exposicion),
        devops: verificarDevops(raiz, ingesta, defDev)
      }

  const dictamen = calcularDictamen(hallazgosPorCategoria, cfg)
  const todosHallazgos = Object.values(hallazgosPorCategoria).flat()

  const resultado = {
    proyecto: {
      nombre: path.basename(raiz),
      ruta: raiz,
      fecha: new Date().toISOString().slice(0, 10),
      exposicion: args.exposicion,
      alcance: args.alcance,
      idioma: args.idioma === 'en' ? 'en' : 'es',
      perfil_tecnico: esMovil ? 'mobile-kmp' : 'aws-web-sam-react'
    },
    inventario: ingesta.presencia,
    aplicabilidad: politicaAplicabilidad?.certification || {
      status: 'legacy',
      reason: 'Proyecto sin politica de aplicabilidad; se conserva el comportamiento anterior.'
    },
    dictamen,
    hallazgos: todosHallazgos,
    diferidos_piloto: defSeg.diferidos_piloto || []
  }

  // Salida
  const dirSalida = args.salida ? path.resolve(args.salida) : path.join(raiz, 'docs', 'certificaciones')
  fs.mkdirSync(dirSalida, { recursive: true })
  const fecha = resultado.proyecto.fecha
  const base = `certificacion-${resultado.proyecto.nombre}-${fecha}`
  const formatos = args.formato.split(',').map(s => s.trim().toLowerCase())

  if (formatos.includes('json')) {
    fs.writeFileSync(path.join(dirSalida, `${base}.json`), JSON.stringify(resultado, null, 2), 'utf8')
  }
  if (formatos.includes('md')) {
    fs.writeFileSync(path.join(dirSalida, `${base}.md`), generarMarkdown(resultado), 'utf8')
  }
  if (formatos.includes('html')) {
    fs.writeFileSync(path.join(dirSalida, `${base}.html`), generarHtml(resultado), 'utf8')
  }

  // Consola
  console.log(`\n===== DICTAMEN: ${dictamen.dictamen} =====`)
  console.log(`Puntuacion ponderada: ${dictamen.puntuacion_total ?? 'N/D'}%`)
  for (const [cat, d] of Object.entries(dictamen.categorias)) {
    console.log(`  - ${cat}: ${d.porcentaje === null ? 'N/D' : d.porcentaje + '%'} (peso ${d.peso}%)`)
  }
  const criticos = todosHallazgos.filter(h => h.criticidad === 'Critico' && h.estado === 'no-cumplido')
  if (criticos.length) {
    console.log(`\nHallazgos CRITICOS abiertos (${criticos.length}):`)
    criticos.forEach(h => console.log(`  [${h.id}] ${h.nombre}`))
  }
  console.log(`\nReportes en: ${dirSalida}`)

  const exit = dictamen.dictamen === 'APTO PARA QA' ? 0 : dictamen.dictamen === 'CON OBSERVACIONES' ? 1 : 2
  process.exit(exit)
}

main()

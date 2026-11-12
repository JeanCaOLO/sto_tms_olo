#!/usr/bin/env node
/*
 * verificar-sync-git.js
 *
 * Utilidad determinista para la compuerta de commits por unidad (AI-DLC INTELIX).
 * Responsabilidades:
 *   1. Reportar el estado del repositorio local (git status --porcelain).
 *   2. Registrar el ultimo push exitoso y calcular los dias sin sincronizar.
 *   3. Aplicar el limite de dias (por defecto 4) para el bloqueo de sincronizacion.
 *
 * El archivo de estado vive en .kiro/sync-state.json (por-clon, ignorado en git).
 * Solo usa modulos nativos de Node (fs, path, child_process). Sin dependencias.
 *
 * Uso:
 *   node scripts/verificar-sync-git.js status       -> imprime estado del working tree
 *   node scripts/verificar-sync-git.js gate         -> evalua la compuerta (dirty + limite de dias)
 *                                                      al bloquear por dirty, sugiere el selector de ID de commit
 *   node scripts/verificar-sync-git.js mark-push     -> registra un push exitoso (resetea el contador)
 *   node scripts/verificar-sync-git.js mark-attempt  -> registra un intento fallido de sync
 *   node scripts/verificar-sync-git.js --json <cmd>  -> salida en JSON para consumo por el asistente
 *
 * Codigos de salida:
 *   0  = OK / sin bloqueo
 *   10 = hay cambios locales sin commitear (bloqueo de unidad)
 *   20 = limite de dias sin sincronizar excedido (bloqueo de sync)
 *   1  = error de ejecucion
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.kiro', 'sync-state.json');
const LIMITE_DIAS_DEFAULT = 4;

function ahoraISO() {
  return new Date().toISOString();
}

function git(args) {
  return execSync('git ' + args, { cwd: ROOT, encoding: 'utf8' });
}

// Lee el estado; si no existe o esta corrupto, devuelve uno inicial.
function leerEstado() {
  try {
    const txt = fs.readFileSync(STATE_FILE, 'utf8').replace(/^\uFEFF/, '');
    const obj = JSON.parse(txt);
    if (typeof obj.limite_dias !== 'number') obj.limite_dias = LIMITE_DIAS_DEFAULT;
    return obj;
  } catch (e) {
    return {
      ultimo_push_exitoso: null,
      ultimo_intento: null,
      dias_sin_sincronizar: 0,
      limite_dias: LIMITE_DIAS_DEFAULT,
      estado: 'sin-registro',
    };
  }
}

function escribirEstado(estado) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(estado, null, 2) + '\n', 'utf8');
}

// Dias enteros transcurridos desde una fecha ISO hasta ahora.
function diasDesde(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Estado del working tree local.
function estadoWorkingTree() {
  let porcelain = '';
  try {
    porcelain = git('status --porcelain');
  } catch (e) {
    return { esRepo: false, limpio: true, archivos: [] };
  }
  const lineas = porcelain.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  return { esRepo: true, limpio: lineas.length === 0, archivos: lineas };
}

function recalcularDias(estado) {
  const d = diasDesde(estado.ultimo_push_exitoso);
  estado.dias_sin_sincronizar = d === null ? 0 : d;
  return estado;
}

// --- Comandos ---

function cmdStatus() {
  const wt = estadoWorkingTree();
  const estado = recalcularDias(leerEstado());
  return {
    esRepo: wt.esRepo,
    limpio: wt.limpio,
    archivos: wt.archivos,
    dias_sin_sincronizar: estado.dias_sin_sincronizar,
    limite_dias: estado.limite_dias,
    ultimo_push_exitoso: estado.ultimo_push_exitoso,
  };
}

function cmdGate() {
  const wt = estadoWorkingTree();
  const estado = recalcularDias(leerEstado());
  escribirEstado(estado);

  // Bloqueo 1: cambios locales sin commitear.
  if (wt.esRepo && !wt.limpio) {
    return {
      bloqueo: 'cambios-sin-commit',
      exit: 10,
      mensaje: 'Mira, tienes que hacer un commit de la unidad anterior antes de arrancar el desarrollo de esta nueva unidad.',
      archivos: wt.archivos,
      dias_sin_sincronizar: estado.dias_sin_sincronizar,
      // Siguiente paso del desbloqueo (ver unit-commit-gate.md, seccion 3): elegir
      // el ID Jerarquico del entregable/tarea desde el archivo de la verdad e
      // insertarlo en el mensaje segun commit-rules.md.
      sugerencia_commit: {
        descripcion: 'Elige el entregable/tarea (ID Jerarquico) para el mensaje de commit.',
        comando: 'node scripts/entregables/seleccionar-commit.js',
      },
    };
  }

  // Bloqueo 2: limite de dias sin sincronizar excedido.
  if (estado.dias_sin_sincronizar >= estado.limite_dias) {
    return {
      bloqueo: 'limite-dias-sync',
      exit: 20,
      mensaje: 'Han pasado ' + estado.dias_sin_sincronizar + ' dias sin sincronizar con el repositorio remoto. ' +
        'No es posible avanzar hasta completar un push/pull exitoso, ya que la sincronizacion es prioritaria para medir el avance real.',
      dias_sin_sincronizar: estado.dias_sin_sincronizar,
      limite_dias: estado.limite_dias,
    };
  }

  return {
    bloqueo: null,
    exit: 0,
    mensaje: 'Sin bloqueos: el working tree esta limpio y la sincronizacion esta dentro del limite.',
    dias_sin_sincronizar: estado.dias_sin_sincronizar,
    limite_dias: estado.limite_dias,
  };
}

function cmdMarkPush() {
  const estado = leerEstado();
  const t = ahoraISO();
  estado.ultimo_push_exitoso = t;
  estado.ultimo_intento = t;
  estado.dias_sin_sincronizar = 0;
  estado.estado = 'sincronizado';
  escribirEstado(estado);
  return { ok: true, mensaje: 'Push exitoso registrado. Contador de dias reiniciado.', ultimo_push_exitoso: t };
}

function cmdMarkAttempt() {
  const estado = recalcularDias(leerEstado());
  estado.ultimo_intento = ahoraISO();
  estado.estado = 'intento-fallido';
  escribirEstado(estado);
  return {
    ok: true,
    mensaje: 'Intento de sincronizacion fallido registrado.',
    dias_sin_sincronizar: estado.dias_sin_sincronizar,
    limite_dias: estado.limite_dias,
  };
}

// --- Runner ---

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.indexOf('--json') !== -1;
  const cmd = args.filter(function (a) { return a !== '--json'; })[0] || 'status';

  let res;
  let exit = 0;
  switch (cmd) {
    case 'status': res = cmdStatus(); break;
    case 'gate': res = cmdGate(); exit = res.exit; break;
    case 'mark-push': res = cmdMarkPush(); break;
    case 'mark-attempt': res = cmdMarkAttempt(); break;
    default:
      console.error('Comando no reconocido: ' + cmd);
      console.error('Use: status | gate | mark-push | mark-attempt [--json]');
      process.exit(1);
  }

  if (jsonOut) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    if (res.mensaje) console.log(res.mensaje);
    if (res.archivos && res.archivos.length) {
      console.log('Archivos pendientes:');
      res.archivos.forEach(function (a) { console.log('  ' + a); });
    }
    if (res.sugerencia_commit) {
      console.log('');
      console.log('Siguiente paso: ' + res.sugerencia_commit.descripcion);
      console.log('  ' + res.sugerencia_commit.comando);
    }
    if (typeof res.dias_sin_sincronizar === 'number') {
      console.log('Dias sin sincronizar: ' + res.dias_sin_sincronizar + ' (limite: ' + (res.limite_dias || LIMITE_DIAS_DEFAULT) + ')');
    }
  }
  process.exit(exit);
}

main();

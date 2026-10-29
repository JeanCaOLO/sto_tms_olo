#!/usr/bin/env node
/*
 * prepare-commit-msg.js
 *
 * Lógica del hook Git `prepare-commit-msg` (Entregable B — integración con IDEs).
 * Pre-rellena el mensaje de commit con el ID jerárquico deducido del NOMBRE DE
 * LA RAMA, para que al commitear desde la interfaz de un IDE (VS Code, Kiro,
 * Sublime, etc.) o desde la terminal, el mensaje ya venga con el scope correcto.
 *
 * Opción A del plan del ID jerárquico: el ID sale de la rama. El colaborador
 * hace `git add` de lo que quiere subir; el hook solo prepara el mensaje.
 *
 * === Cómo se usa ===
 * No se ejecuta a mano. Lo invoca Git automáticamente vía el hook
 * `.git/hooks/prepare-commit-msg`, que instala `install-hook-commit.js`.
 * Git le pasa como argv: <ruta-archivo-mensaje> [origen] [sha].
 *
 * === Qué hace ===
 * 1. Lee la rama activa. Si es efímera (feature/bugfix/hotfix/release), extrae
 *    el ID del tramo entre el prefijo y el `-<slug>` (ver bootstrap-ramas.js:
 *    el nombre es `<tipo>/<id>-<slug>`).
 * 2. Normaliza el ID: si es jerárquico (EST-001, PAR-002-014) lo usa tal cual;
 *    si es un ticket (ISSUE-45, PROD-12) también lo respeta.
 * 3. Si el mensaje AÚN está vacío (commit nuevo, no un amend/merge/squash con
 *    texto), lo pre-rellena con:  `<tipo>(<ID>): `  y deja el cursor listo para
 *    que el dev escriba la descripción.
 *    - `<tipo>` se infiere del tipo de rama: feature/release -> feat,
 *      bugfix -> fix, hotfix -> fix. Si no se puede inferir, usa `feat`.
 * 4. NO toca el mensaje si:
 *    - ya trae texto (el dev escribió algo, o es merge/squash/amend con cuerpo);
 *    - la rama es permanente (master/qa/develop) o no tiene ID reconocible
 *      (en ese caso deja una plantilla con hueco <ID> para completar a mano,
 *      sin bloquear).
 *
 * === Degradación elegante ===
 * Nunca falla el commit: ante cualquier error, sale con código 0 sin modificar
 * el mensaje. El objetivo es AYUDAR, no bloquear.
 *
 * Requiere: Node 18+ y git en PATH (el mismo entorno que el resto de la plantilla).
 */

'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

// --- Tipos de rama efímera -> tipo de commit sugerido (commit-rules.md) ---
const TIPO_COMMIT_POR_RAMA = {
  feature: 'feat',
  bugfix: 'fix',
  hotfix: 'fix',
  release: 'chore',
};

const RAMAS_PERMANENTES = new Set(['master', 'qa', 'develop', 'main']);

// El mensaje se considera "con contenido propio" si tiene alguna línea no vacía
// que no sea comentario (#). Los merges/squash/amend traen cuerpo -> no se toca.
function mensajeYaTieneTexto(contenido) {
  return contenido
    .split(/\r?\n/)
    .some((linea) => linea.trim() && !linea.trim().startsWith('#'));
}

function ramaActiva() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    return '';
  }
}

// Del nombre de rama `<tipo>/<id>-<slug>` extrae {tipoRama, id}.
// - tipoRama: feature|bugfix|hotfix|release (o null si no aplica).
// - id: el tramo entre el prefijo y el primer segmento del slug. Soporta:
//     * ID jerárquico: EST-001, PAR-002-014  (PREFIJO de 2-5 letras + grupos -NNN)
//     * ticket:        ISSUE-45, PROD-12, DEV-101
//   Devuelve {tipoRama:null, id:null} si la rama no encaja.
function extraerDeRama(rama) {
  if (!rama || RAMAS_PERMANENTES.has(rama)) return { tipoRama: null, id: null };

  const m = rama.match(/^(feature|bugfix|hotfix|release)\/(.+)$/);
  if (!m) return { tipoRama: null, id: null };

  const tipoRama = m[1];
  const resto = m[2]; // "<id>-<slug>"  ej. "PAR-002-014-conexion-sql" o "ISSUE-45-login"

  // 1) ID jerárquico: PREFIJO(2-5 letras)-NNN o PREFIJO-NNN-NNN al inicio del resto.
  //    Prioriza el más largo (entregable con tarea).
  const jer = resto.match(/^([A-Za-z]{2,5}-\d{3}(?:-\d{3})?)/);
  if (jer) return { tipoRama, id: jer[1].toUpperCase() };

  // 2) Ticket genérico: LETRAS-NUMEROS  (ISSUE-45, PROD-12) o solo número (73).
  const tic = resto.match(/^([A-Za-z]+-\d+|\d+)/);
  if (tic) return { tipoRama, id: tic[1].toUpperCase() };

  return { tipoRama, id: null };
}

function main() {
  // argv: [node, script, <archivoMensaje>, <origen?>, <sha?>]
  const archivoMsg = process.argv[2];
  if (!archivoMsg) return 0; // sin argumento: nada que hacer

  let contenido = '';
  try {
    contenido = fs.readFileSync(archivoMsg, 'utf8');
  } catch (e) {
    return 0; // no se pudo leer: no estorbar el commit
  }

  // Si ya hay texto propio (merge, squash, amend con cuerpo, o el dev escribió
  // algo), no tocar nada.
  if (mensajeYaTieneTexto(contenido)) return 0;

  const rama = ramaActiva();
  const { tipoRama, id } = extraerDeRama(rama);

  const tipoCommit = TIPO_COMMIT_POR_RAMA[tipoRama] || 'feat';

  // Prefijo del mensaje. Si hay ID -> "tipo(ID): ". Si no -> plantilla con hueco.
  let prefijo;
  if (id) {
    prefijo = `${tipoCommit}(${id}): `;
  } else {
    // Rama sin ID reconocible o permanente: plantilla guía, sin bloquear.
    prefijo = `${tipoCommit}(<ID>): `;
  }

  // Comentario de ayuda (Git ignora las líneas que empiezan con #).
  const ayuda = id
    ? `# ID jerárquico "${id}" tomado de la rama "${rama}". Completa la descripción.\n`
    : `# No se detectó ID en la rama "${rama}". Reemplaza <ID> por el ID jerárquico (ej. PAR-002-014) o quítalo.\n`;

  // Pre-rellenar: el prefijo en la 1ª línea, y la ayuda como comentario debajo,
  // conservando el resto del contenido original (plantilla de Git, si la hay).
  const nuevo = `${prefijo}\n${ayuda}${contenido}`;

  try {
    fs.writeFileSync(archivoMsg, nuevo, 'utf8');
  } catch (e) {
    // No se pudo escribir: salir sin romper el commit.
  }
  return 0;
}

process.exit(main());

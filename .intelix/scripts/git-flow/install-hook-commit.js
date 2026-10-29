#!/usr/bin/env node
/*
 * install-hook-commit.js
 *
 * Instala el hook Git `prepare-commit-msg` (Entregable B — integración con IDEs).
 * El hook pre-rellena el mensaje de commit con el ID jerárquico deducido del
 * nombre de la rama, para que al commitear desde el IDE (VS Code, Kiro, Sublime)
 * o la terminal el mensaje ya venga con el scope correcto.
 *
 * Se ejecuta UNA VEZ por clon (los hooks viven en .git/hooks/, que no se versiona):
 *   node scripts/git-flow/install-hook-commit.js
 * O con el lanzador: install-hook-commit.bat / .sh
 *
 * La LÓGICA vive en scripts/git-flow/prepare-commit-msg.js (versionado). El hook
 * en .git/hooks/ solo lo invoca, así el código se mantiene en el repo y se
 * actualiza con un git pull (no hay que reinstalar por cada cambio de lógica).
 *
 * NO pisa el hook post-commit del reporte de avance: es un hook distinto.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Raíz del repo (resuelta por git, robusto ante subdirectorios).
function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    // Fallback: dos niveles arriba de este script.
    return path.resolve(__dirname, '..', '..');
  }
}

const ROOT = repoRoot();
const HOOKS_DIR = path.join(ROOT, '.git', 'hooks');
const HOOK_FILE = path.join(HOOKS_DIR, 'prepare-commit-msg');
const LOGICA_REL = 'scripts/git-flow/prepare-commit-msg.js';

// El hook (shell) invoca el script Node versionado, pasándole los argumentos que
// Git da al prepare-commit-msg ($1=archivo mensaje, $2=origen, $3=sha).
// Verifica que node exista; si no, sale 0 (no rompe el commit).
const hookContent = `#!/bin/sh
# prepare-commit-msg — pre-rellena el mensaje con el ID jerarquico de la rama.
# Instalado por: node scripts/git-flow/install-hook-commit.js
# Logica versionada en: ${LOGICA_REL}
command -v node >/dev/null 2>&1 || exit 0
node "${LOGICA_REL}" "$1" "$2" "$3" 2>/dev/null || exit 0
`;

function main() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.error('ERROR: no se encontró .git en ' + ROOT + '. ¿Es un clon git?');
    return 1;
  }
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
  }

  // Verificar que la lógica versionada exista (aviso, no bloqueo).
  const logicaAbs = path.join(ROOT, LOGICA_REL);
  if (!fs.existsSync(logicaAbs)) {
    console.error('AVISO: no se encontró ' + LOGICA_REL + '. Haz git pull para traerlo.');
  }

  // No pisar en silencio: si ya existe un prepare-commit-msg distinto, avisar.
  if (fs.existsSync(HOOK_FILE)) {
    const actual = fs.readFileSync(HOOK_FILE, 'utf8');
    if (!actual.includes(LOGICA_REL)) {
      console.error('AVISO: ya existe un hook prepare-commit-msg distinto. Se sobrescribe.');
      console.error('  Respáldalo si lo necesitas: .git/hooks/prepare-commit-msg');
    }
  }

  fs.writeFileSync(HOOK_FILE, hookContent, { mode: 0o755 });

  console.log('');
  console.log('  Hook prepare-commit-msg instalado.');
  console.log('');
  console.log('  A partir de ahora, al commitear desde tu IDE o terminal, el mensaje');
  console.log('  se pre-rellena con el ID jerarquico de la rama. Ejemplo:');
  console.log('');
  console.log('    Rama:    feature/PAR-002-014-conexion-sql');
  console.log('    Mensaje: feat(PAR-002-014): <escribe la descripcion>');
  console.log('');
  console.log('  - El ID sale del nombre de la rama (crea la rama con bootstrap-ramas.js).');
  console.log('  - Si el mensaje ya trae texto (merge/squash/amend), NO se toca.');
  console.log('  - Si la rama no tiene ID, deja una plantilla con <ID> para completar.');
  console.log('  - No interfiere con el hook post-commit del reporte de avance.');
  console.log('');
  return 0;
}

process.exit(main());

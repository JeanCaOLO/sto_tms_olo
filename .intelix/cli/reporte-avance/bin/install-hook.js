/**
 * Instala el hook post-commit para auto-regeneración del reporte de avance.
 * El reporte se regenera desde el Índice de Progreso AI-DLC y se escribe en
 * .intelix/outputs/reporte_avance/.
 *
 * Ejecutar: node .intelix/cli/reporte-avance/bin/install-hook.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/project-root');

const HOOKS_DIR = path.join(PROJECT_ROOT, '.git', 'hooks');
const HOOK_FILE = path.join(HOOKS_DIR, 'post-commit');

const AUTO_UPDATE = '.intelix/cli/reporte-avance/lib/auto-update-avance.js';
const OUTPUT_DIR = '.intelix/outputs/reporte_avance';

const hookContent = `#!/bin/sh
# Auto-regenera el reporte de avance al hacer commit.
# Fuente: indice de tracking del layout AI-DLC activo (v1 o v2)
# Salida: ${OUTPUT_DIR}/
# Instalado por: node .intelix/cli/reporte-avance/bin/install-hook.js
node ${AUTO_UPDATE} 2>/dev/null

# Stage los reportes regenerados si cambiaron, y enmienda el commit.
if git diff --quiet ${OUTPUT_DIR} 2>/dev/null; then
  : # Sin cambios
else
  git add ${OUTPUT_DIR} 2>/dev/null
  git commit --amend --no-edit --no-verify 2>/dev/null
fi
`;

if (!fs.existsSync(HOOKS_DIR)) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
}

fs.writeFileSync(HOOK_FILE, hookContent, { mode: 0o755 });

console.log('');
console.log('  ✅ Hook post-commit instalado correctamente');
console.log('');
console.log('  Al hacer commit, el reporte de avance se regenera automáticamente');
console.log('  desde el Índice de Progreso AI-DLC:');
console.log('    Fuente: indice de tracking del layout AI-DLC activo (v1 o v2)');
console.log('    Salida: ' + OUTPUT_DIR + '/ (MD + HTML)');
console.log('');
console.log('  El estado de las tareas se administra en el tracker AI-DLC,');
console.log('  no en el mensaje de commit.');
console.log('');

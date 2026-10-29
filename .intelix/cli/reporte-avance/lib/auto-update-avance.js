/**
 * ============================================================================
 * AUTO-UPDATE REPORTE DE AVANCE — Post-Commit Hook
 * ============================================================================
 * Fuente de verdad: Índice de Progreso del tracker AI-DLC
 *   (layout v1 o intent activo v2).
 *
 * Al hacer commit, regenera el reporte (MD + HTML) en
 * .intelix/outputs/reporte_avance/ a partir del índice actual, para que quede
 * siempre sincronizado. No parsea el mensaje del commit: el estado de las
 * tareas lo administra el tracker AI-DLC.
 *
 * Si el índice no existe (repos sin AI-DLC), no hace nada y no rompe el commit.
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const { INDICE_PATH } = require('./reporte-desde-indice');

function main() {
  if (!fs.existsSync(INDICE_PATH)) return;

  try {
    const { generarReportes } = require('./reporte-desde-indice');
    const res = generarReportes();
    console.log('\n  📊 [Auto-Reporte] Regenerado desde el índice de progreso.');
    console.log('     Progreso global: ' + res.modelo.progresoGlobal + '% | Unidades: ' +
      res.modelo.unidades.length + ' | Tareas: ' + res.modelo.totales.tareas + '\n');
  } catch (e) {
    console.log('\n  ⚠️  [Auto-Reporte] No se pudo regenerar el reporte: ' + e.message + '\n');
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { main };
}

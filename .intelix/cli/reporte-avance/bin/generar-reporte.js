/**
 * ============================================================================
 * GENERAR REPORTE DE AVANCE
 * ============================================================================
 * Fuente de verdad: Índice de Progreso del tracker AI-DLC
 *   (layout v1 o intent activo v2).
 *
 * No es interactivo ni edita ningún JSON: el estado de las tareas lo lleva el
 * tracker AI-DLC. Este script lee el índice y regenera el reporte (MD + HTML)
 * en .intelix/outputs/reporte_avance/.
 *
 * Uso:
 *   node .intelix/cli/reporte-avance/bin/generar-reporte.js
 * ============================================================================
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { PROJECT_ROOT } = require('../lib/project-root');
const { generarReportes, INDICE_PATH } = require('../lib/reporte-desde-indice');

function toAscii(value) {
  return String(value == null ? '' : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

function main() {
  try {
    if (!fs.existsSync(INDICE_PATH)) {
      throw new Error('No se encontro el indice de progreso: ' + INDICE_PATH);
    }

    const res = generarReportes();

    console.log('');
    console.log('Reporte de Avance - INTELIX (fuente: Indice de Progreso AI-DLC)');
    console.log('Unidades: ' + res.modelo.unidades.length + ' | Tareas: ' + res.modelo.totales.tareas +
      ' | Progreso global: ' + res.modelo.progresoGlobal + '%');
    console.log('');
    console.log('Archivos generados:');
    res.escritos.forEach(f => console.log('  ' + path.relative(PROJECT_ROOT, f)));
    console.log('');
  } catch (error) {
    console.error('ERROR: ' + toAscii(error.message));
    process.exitCode = 1;
  }
}

module.exports = { generarReportes, toAscii };

if (require.main === module) {
  main();
}

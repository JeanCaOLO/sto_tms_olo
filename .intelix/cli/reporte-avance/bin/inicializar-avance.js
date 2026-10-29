/**
 * ============================================================================
 * INICIALIZAR AVANCE
 * ============================================================================
 * A partir del Índice de Progreso del tracker AI-DLC
 *   (layout v1 o intent activo v2)
 * genera el reporte de avance (MD + HTML) en .intelix/outputs/reporte_avance/,
 * con el formato del insumo "entregables_tareas_iadlc.md".
 *
 * Delega en la librería compartida lib/reporte-desde-indice.js, que es la
 * fuente única de parseo y generación.
 *
 * Uso:
 *   node .intelix/cli/reporte-avance/bin/inicializar-avance.js
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/project-root');
const { generarReportes, construirModelo, INDICE_PATH } = require('../lib/reporte-desde-indice');

function main() {
  console.log('\n====================================================');
  console.log('  Inicializador de avance (reporte MD + HTML)');
  console.log('  Fuente: ' + path.relative(PROJECT_ROOT, INDICE_PATH));
  console.log('====================================================\n');

  if (!fs.existsSync(INDICE_PATH)) {
    console.error('  No se encontro el indice de progreso:');
    console.error('    ' + INDICE_PATH);
    process.exit(1);
  }

  const modelo = construirModelo();
  console.log('  Unidades detectadas: ' + modelo.unidades.length);
  modelo.unidades.forEach(u => console.log('    - ' + u.nombre + ' (' + u.tareas.length + ' tareas)'));
  console.log('');

  const res = generarReportes({ modelo });
  console.log('  Reportes generados:');
  res.escritos.forEach(f => console.log('    ' + path.relative(PROJECT_ROOT, f)));
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { main };

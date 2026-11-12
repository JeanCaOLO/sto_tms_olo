/**
 * Regenerador de reportes (sin interacción CLI).
 * Fuente de verdad: Índice de Progreso del tracker AI-DLC
 *   (layout v1 o intent activo v2).
 *
 * Escribe MD + HTML en .intelix/outputs/reporte_avance/ (versionado + alias
 * estables) delegando en reporte-desde-indice.js.
 *
 * Conserva la firma module.exports = function(...) para compatibilidad con los
 * llamadores; el argumento recibido se ignora (el reporte se reconstruye
 * siempre desde el índice).
 */

'use strict';

const path = require('path');
const { PROJECT_ROOT } = require('./project-root');
const { generarReportes, OUTPUT_DIR } = require('./reporte-desde-indice');

module.exports = function regenerar(/* ignorado: data legado */) {
  return generarReportes();
};

module.exports.OUTPUT_DIR = OUTPUT_DIR;

if (require.main === module) {
  const res = generarReportes();
  console.log('Reportes regenerados desde el índice (MD + HTML):');
  res.escritos.forEach(f => console.log('  ' + path.relative(PROJECT_ROOT, f)));
}

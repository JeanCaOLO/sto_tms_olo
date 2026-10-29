#!/usr/bin/env node
/**
 * Genera los reportes MD y HTML sin interacción CLI.
 * Fuente = Índice de Progreso del layout AI-DLC activo (v1 o v2).
 * Salida = .intelix/outputs/reporte_avance/.
 *
 * Uso: node .intelix/cli/reporte-avance/lib/_generar-sin-cli.js
 */
'use strict';

const path = require('path');
const { PROJECT_ROOT } = require('./project-root');
const { generarReportes } = require('./reporte-desde-indice');

const res = generarReportes();
console.log('Reportes generados desde el índice (MD + HTML):');
res.escritos.forEach(f => console.log('  ' + path.relative(PROJECT_ROOT, f)));

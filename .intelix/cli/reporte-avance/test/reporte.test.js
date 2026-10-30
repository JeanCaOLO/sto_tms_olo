'use strict';

/**
 * Pruebas del flujo migrado: reporte de avance desde el Índice de Progreso.
 * Valida el parser del índice y la generación de MD + HTML.
 */

const assert = require('assert');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/project-root');
const {
  parseIndice,
  construirModelo,
  generarMarkdown,
  generarHTML
} = require('../lib/reporte-desde-indice.js');

let ok = 0;
const fallos = [];

function prueba(nombre, fn) {
  try {
    fn();
    ok += 1;
    console.log(`  OK   ${nombre}`);
  } catch (e) {
    fallos.push(nombre);
    console.log(`  FALLA ${nombre}\n        ${e.message}`);
  }
}

// Índice de ejemplo minimalista con dos unidades, una tabla de control SEG-*
// (que debe ignorarse) y el bloque Resumen.
const INDICE_DEMO = `# Índice de Progreso — Proyecto Demo
AI-DLC v1 · Agente: Kiro · Actualizado: 2026-09-08T13:21:04Z
**Progreso agente: 40.0% · Verificado: 20.0%**

## Registro de ejecución del seguimiento

| ID | Tarea | Estado | Inicio | Fin | Duración | Ajustes | Historias |
|---|---|---|---|---|---|---|---|
| SEG-T01 | Control operativo | 🟡 | — | — | — | — | — |

## Unidad: alpha
Plan: \`aidlc-docs/construction/plans/alpha-plan.md\`

| ID | Tarea | Estado | Inicio | Fin | Duración | Ajustes | Historias |
|---|---|---|---|---|---|---|---|
| AL-T01 | Primera tarea | ✅ | 2026-08-26T10:00:00Z | 2026-08-26T10:05:00Z | 00:05:00 | — | US-01 |
| AL-T02 | Segunda tarea | 🟡 | 2026-08-26T10:05:00Z | 2026-08-26T10:10:00Z | 00:05:00 | — | US-02 |
| VER-AL | Verificación humana de alpha | ✅ | 2026-08-26T10:10:00Z | 2026-08-28T12:30:00Z | — | — | — |

## Unidad: beta

| ID | Tarea | Estado | Inicio | Fin | Duración | Ajustes | Historias |
|---|---|---|---|---|---|---|---|
| BE-T01 | Tarea en curso | 🔄 | — | — | — | — | — |
| BE-T02 | Tarea pendiente | ⬜ | — | — | — | — | — |

## Resumen

| Unidad | Tareas | Pendientes | En progreso | Completadas | Verificadas |
|---|---|---|---|---|---|
| alpha | 2 | 0 | 0 | 2 | 1 |
| beta | 2 | 1 | 1 | 0 | 0 |
| **TOTAL** | **4** | **1** | **1** | **2** | **1** |
`;

// --- Parser -----------------------------------------------------------------

prueba('parseIndice extrae solo unidades reales (ignora SEG-*)', () => {
  const d = parseIndice(INDICE_DEMO);
  assert.strictEqual(d.unidades.length, 2, 'debe haber 2 unidades');
  assert.deepStrictEqual(d.unidades.map(u => u.nombre), ['alpha', 'beta']);
});

prueba('parseIndice captura plan, tareas, estado e historias', () => {
  const d = parseIndice(INDICE_DEMO);
  const alpha = d.unidades[0];
  assert.ok(alpha.plan.includes('alpha-plan.md'));
  assert.strictEqual(alpha.tareas.length, 3);
  assert.strictEqual(alpha.tareas[0].id, 'AL-T01');
  assert.strictEqual(alpha.tareas[0].duracion, '00:05:00');
  assert.strictEqual(alpha.tareas[0].historias, 'US-01');
});

prueba('parseIndice lee el bloque Resumen', () => {
  const d = parseIndice(INDICE_DEMO);
  assert.strictEqual(d.resumen.length, 3);
  assert.strictEqual(d.resumen[0].unidad, 'alpha');
  assert.strictEqual(d.resumen[2].unidad, 'TOTAL');
});

prueba('titulo se limpia del prefijo "Índice de Progreso —"', () => {
  const d = parseIndice(INDICE_DEMO);
  assert.strictEqual(d.titulo, 'Proyecto Demo');
});

// --- Modelo -----------------------------------------------------------------

prueba('construirModelo cuenta estados por categoria', () => {
  const m = construirModelo(INDICE_DEMO);
  assert.strictEqual(m.totales.tareas, 5);
  assert.strictEqual(m.totales.verificada, 2);
  assert.strictEqual(m.totales.completada, 1);
  assert.strictEqual(m.totales.progreso, 1);
  assert.strictEqual(m.totales.pendiente, 1);
});

prueba('progreso ponderado por unidad (verificada=1, completada=0.9, progreso=0.5)', () => {
  const m = construirModelo(INDICE_DEMO);
  // alpha: (1 + 0.9 + 1) / 3 = 0.97 -> 97
  assert.strictEqual(m.unidades[0].progreso, 97);
  // beta: (0.5 + 0) / 2 = 0.25 -> 25
  assert.strictEqual(m.unidades[1].progreso, 25);
  // global: (97 + 25) / 2 = 61
  assert.strictEqual(m.progresoGlobal, 61);
});

prueba('extrae % agente y verificado de la linea de progreso', () => {
  const m = construirModelo(INDICE_DEMO);
  assert.strictEqual(m.progAgente, 40);
  assert.strictEqual(m.progVerif, 20);
});

// --- Generadores ------------------------------------------------------------

prueba('generarMarkdown produce las secciones esperadas', () => {
  const m = construirModelo(INDICE_DEMO, {
    fechasPlanificadas: { 'VER-AL': '2026-08-19' },
    indicePath: path.join(PROJECT_ROOT, 'aidlc', 'spaces', 'default', 'intents', 'demo', 'tracking', 'INDICE-PROGRESO.md')
  });
  const md = generarMarkdown(m);
  assert.ok(md.startsWith('# Insumo de Tareas y Planificación de Desarrollo (IA-DLC - Kiro)\n'), 'debe conservar el título del proyecto');
  assert.ok(md.includes('## 2. Resumen de Avance por Unidad de Trabajo'));
  assert.ok(md.includes('## 3. Lista Completa de Entregables'));
  assert.ok(md.includes('AL-T01'));
  assert.ok(md.includes('Verificada'));
  assert.ok(md.includes('En progreso'));
  assert.ok(md.includes('Fecha planificada'));
  assert.ok(md.includes('Fecha fin'));
  assert.ok(md.includes('| 2026-08-19 | — |'));
  assert.ok(md.includes('aidlc/spaces/default/intents/demo/tracking/INDICE-PROGRESO.md'));
  assert.ok(md.match(/2026-08-19/g).length >= 3, 'debe repetir la fecha planificada en las tareas');
});

prueba('generarHTML produce documento valido con datos', () => {
  const m = construirModelo(INDICE_DEMO, { fechasPlanificadas: { 'VER-AL': '2026-08-19' } });
  const html = generarHTML(m);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<title>Reporte de Avance — Proyecto Demo</title>'), 'debe conservar el título del proyecto en HTML');
  assert.ok(html.includes('<h1>📊 Proyecto Demo</h1>'), 'debe conservar el título del proyecto en el encabezado');
  assert.ok(html.includes('<h2 style="margin-bottom:1rem;color:var(--primary)">Progreso del desarrollo del Proyecto</h2>'), 'debe usar el subtítulo solicitado');
  assert.ok(html.includes('badge-verificada'));
  assert.ok(html.includes('61%'), 'debe mostrar el progreso global');
  assert.ok(html.includes('Fecha planificada'));
  assert.ok(html.includes('Fecha fin'));
  assert.ok(html.includes('2026-08-19'));
  assert.ok(html.match(/2026-08-19/g).length >= 4, 'debe mostrar fechas también en las tareas');
  assert.ok(html.includes('>Completada</span>'));
  assert.ok(html.includes('>En progreso</span>'));
});

prueba('Fecha fin solo se registra cuando la unidad alcanza 100% verificado', () => {
  const incompleta = construirModelo(INDICE_DEMO, { fechasPlanificadas: { 'VER-AL': '2026-08-19' } });
  assert.strictEqual(incompleta.unidades[0].fechaFin, '—');

  const completa = construirModelo(INDICE_DEMO.replace('| AL-T02 | Segunda tarea | 🟡 |', '| AL-T02 | Segunda tarea | ✅ |'), {
    fechasPlanificadas: { 'VER-AL': '2026-08-19' }
  });
  assert.strictEqual(completa.unidades[0].fechaFin, '2026-08-28');
});

console.log(`\n${ok} pruebas OK, ${fallos.length} fallas`);
if (fallos.length) process.exit(1);

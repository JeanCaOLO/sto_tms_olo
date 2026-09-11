# Build and Test Summary — FR16 (Devoluciones/Pickups en la secuencia de paradas)

Cierre de Construcción. Deriva de
`../u1-devoluciones-en-secuencia/code-generation/code-summary.md`,
`../../inception/requirements-analysis/requirements.md` y los resultados reales
de esta etapa (`test-results.md`, `cross-unit-traceability.md`).

## Resultado

**Build:** ✅ éxito. **Type-check:** ✅ 0 errores en `planificacion`.
**Lint:** ✅ limpio. **Unit tests:** ✅ 15/15. **E2E:** ✅ 7/7. **Cobertura**
de la lógica nueva/cambiada: cumple el piso `feature` (80%) salvo una función
preexistente sin tocar (ver `test-results.md`). **Trazabilidad cruzada:**
✅ PASS, sin elementos sin cubrir.

## Qué se construyó

FR16.1–16.3: las recolecciones/devoluciones conocidas del viaje se incluyen en
la secuencia de paradas, se distinguen visualmente (badge/borde indigo, tramos
de mapa con patrón discontinuo, leyenda) y se suman al cálculo de capacidad del
vehículo — sobre el módulo de Planificación de Rutas ya existente, sin
componentes backend nuevos (ADR-2 de domain-design).

**Explícitamente fuera de este ciclo:** FR16.4 (recolección "al pie de camión",
recálculo en vivo, reordenamiento por espacio) — depende de OQ-4 y de una
sesión de levantamiento con el equipo de Devoluciones aún no agendada.

## Historial de la etapa

Sin loop-backs — el failure ladder de `build-and-test` no se activó: build,
tests y lint pasaron en la primera corrida.

## Riesgos / seguimientos para después de este ciclo

1. **OQ-4** (contrato de datos de la recolección) sigue sin cerrar con el
   equipo de Devoluciones — condiciona cualquier trabajo futuro sobre FR16.1 y
   todo FR16.4.
2. **Regiones vivas (`role="status"`/`aria-live`) montadas condicionalmente**
   (hallazgo Minor del reviewer de code-generation) — verificar con un lector
   de pantalla real antes de dar el flujo por completamente accesible.
3. Métrica de éxito con umbral aún sin cerrar formalmente con Ana/negocio
   (heredado de intent-capture / requirements-analysis).

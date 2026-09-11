# Instrucciones de pruebas — Prototipo funcional OMS

> Unit `oms-frontend-prototype`. El repositorio `sto_tms_olo` **no tiene runner
> de pruebas ni script `test`** (ver `code-quality-assessment.md` del codekb:
> 0 pruebas, sin Vitest/Jest/Playwright, sin CI). Este prototipo es un mockup
> visual desechable/evolutivo, por lo que **no se generaron pruebas
> automatizadas** en esta corrida aislada. Esta es una desviación consciente,
> acorde a la naturaleza de prototipo y a la ausencia de infraestructura de test.

## Verificación aplicada en lugar de pruebas unitarias

- **Build**: `pnpm run build` (Vite + SWC) — compila sin errores.
- **Type-check**: `pnpm run type-check` — sin errores en `src/pages/oms`.
- **Lint**: `eslint src/pages/oms` — exit 0.

## Verificación manual sugerida (smoke test navegable)

1. `pnpm run dev`; abrir la app y autenticarse (o el flujo de login existente).
2. Sidebar → grupo **OMS**:
   - **Panel**: se ven 4 KPIs y la tabla de alertas; cambiar país recarga.
   - **Cola**: seleccionar un pedido abre el panel lateral con desglose de
     reglas; "Alterar prioridad" exige motivo ≥10 y reordena la cola.
   - **Motor de Reglas**: cambiar de perfil filtra reglas; el toggle
     activa/desactiva.
   - **Simulador**: "Simular" muestra la comparación en dos columnas + resumen.
   - **Rutas y Días**: cuadrícula semanal con checks; `44 REY` como "Cita
     previa"; buscar zona filtra.
   - **Auditoría**: filtros auto/manual; tabla solo lectura.

## Cuándo introducir pruebas reales

Cuando el OMS pase a construcción productiva (con capa de datos y lógica de
priorización real), aplicar la regla de proyecto ya afirmada: extraer la lógica
del motor a módulos `.ts` puros y cubrirla con pruebas unitarias antes de tocar
producción (`project.md` → `## Testing Posture`). Establecer primero un runner
(Vitest encaja con Vite) — hoy ausente en el repo.

## Sources

- `aidlc/spaces/default/codekb/sto_tms_olo/code-quality-assessment.md` — ausencia de runner/CI.
- `aidlc/spaces/default/memory/project.md` (`## Testing Posture`) — regla de extraer lógica a `.ts` puro y probarla.
- `aidlc/spaces/default/memory/phases/construction.md` (`## Testing Standards`) — estándar de pruebas del framework.

## Assumptions & Open Questions

- Se asume que el prototipo no requiere cobertura de pruebas por ser mockup
  visual sin lógica de negocio real (la priorización usa datos mock). Esta
  decisión debe revisarse en cuanto entre lógica real.

# Phase Boundary Verification — Ideación → Concepción

Verificación de consistencia al cerrar Ideación (FR16 Devoluciones/Pickups).

## Intent → Scope → Intent Backlog

| Elemento | Intent (`intent-statement.md`) | Scope (`scope-document.md`) | Backlog (`intent-backlog.md`) | Consistente |
|----------|-------------------------------|-----------------------------|------------------------------|-------------|
| Recolecciones conocidas en la secuencia | FR16.1 | Dentro (MVS) | Ítem 3 | Sí |
| Distinción visual | FR16.2 | Dentro (MVS) | Ítem 1 | Sí |
| Capacidad | FR16.3 | Dentro (MVS) | Ítem 2 | Sí |
| "Al pie de camión" | FR16.4 (mencionado) | Fuera de este ciclo | Fuera del backlog | Sí (exclusión explícita y coherente) |

## Respaldo de feasibility para cada ítem de alcance

| Ítem de alcance | Respaldo en `feasibility-assessment.md` |
|-----------------|----------------------------------------|
| FR16.1 | Viabilidad ALTA — extiende `optimize-stops.ts` |
| FR16.2 | Viabilidad ALTA — cambio de UI acotado |
| FR16.3 | Viabilidad ALTA — extiende `capacity-fit.ts` / FR2 |

Todos los ítems dentro de alcance tienen respaldo de viabilidad ALTA.

## Riesgos abiertos que cruzan a Concepción

- OQ-4 (contrato de datos con Devoluciones) — condiciona el diseño de FR16.1.
- Métrica de éxito sin comprometer — a cerrar en `requirements-analysis`.

## Resultado

**PASS.** Intent, scope y backlog son consistentes; toda la funcionalidad en
alcance tiene respaldo de feasibility. Se avanza a Concepción con dos riesgos
abiertos registrados y trazados.

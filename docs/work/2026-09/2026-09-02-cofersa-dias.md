# 2026-09-02 — Matriz COFERSA por días + leyenda visual + rutas por día en Nueva Ruta

Bitácora con métricas. El detalle técnico (archivos, decisiones, dudas abiertas)
está en `2026-09-02-cofersa-dias-leyenda.md` (reporte del agente delegado) — esta
entrada no lo repite.

## Métricas

| Campo | Valor |
|---|---|
| Estimación previa | ninguna (el brief no la incluía) |
| Coste real | **22.14 créditos · 12m 13s** — agente delegado `claude-sonnet-5` vía Kiro CLI |
| Coste de revisión + merge | Claude Code (sesión), incluido en el gasto de la sesión |
| Rama de trabajo | `kiro/cofersa-dias` (desde `jesus-planificacion`), ya borrada (local + origin) |
| Commit del agente | `a03e54a` |
| Fix de revisión | `1f3f308` (leyenda usa el mismo chip de cita previa que la celda) |
| Merge a `jesus-planificacion` | `3796589` (no-ff), rename del reporte `ec51f85` |
| Verificación | `pnpm test` 70/70 · `tsc` 0 errores nuevos en `src/pages/planificacion/**` · `pnpm build` OK |

## Qué se entregó

- **Parte 1** — `DiaEstado` ampliado a `carga|entrega|ambos|cita|null`. Regla
  "cita previa" (nivel fila, ruta 44 REY) y regla "GAM sin split explícito →
  Lun-Vie `ambos`". `cofersa.json` regenerado desde `Rutas cofersa.xlsx`.
- **Parte 2** — celda `ambos` = cuadro diagonal verde/rojo (distinción por forma
  + color); chip violeta de cita previa en la celda Zona; nuevo componente
  `MatrizLeyenda` (leyenda visual color+forma+texto) montado sólo para COFERSA.
- **Parte 3** — `cofersa-dias.ts` + `use-cofersa-dias.ts`: el select "Viaje (WMS)"
  de Nueva Ruta se agrupa en `<optgroup>` (Programados este <día> / Cita previa /
  Otros) según la Fecha de Ruta, con match por número de ruta y línea de ayuda
  `aria-live`. Fallback a lista plana si el fetch falla.

## Proceso

Delegado con un `BRIEF.md` (scratch, gitignored) que Jesús pegó a Kiro CLI. El
agente trabajó en rama propia, dejó reporte, y devolvió `RAMA · COMMIT`. Claude
Code revisó el diff en el mismo working copy, aplicó un fix menor y mergeó.
Protocolo de mediación validado — no se volverá a usar Orca para esto.

## Seguimientos (del reporte del agente, no bloquean)

1. Semántica de `ambos` en la optimización de paradas (hoy sólo afecta el render).
2. Sábado GAM asumido sin actividad — confirmar con negocio.
3. Posible número de ruta duplicado entre zonas COFERSA (no observado en los datos actuales).

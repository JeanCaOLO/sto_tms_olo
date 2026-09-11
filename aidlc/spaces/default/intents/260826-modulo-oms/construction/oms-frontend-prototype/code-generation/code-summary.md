# Resumen de código generado — Prototipo funcional OMS

> Unit `oms-frontend-prototype` · corrida aislada `--single` de code-generation.

## Qué se construyó

Un prototipo React navegable del módulo OMS, integrado en la app `sto_tms_olo`,
con 6 pantallas alimentadas por datos mock. Se ve y se comporta como el resto de
la app (Dashboard, Pedidos): mismo layout, sidebar, paleta teal/slate y
componentes base.

## Pantallas (trazadas a FR)

| Pantalla | Ruta | FR | Notas |
|---|---|---|---|
| Panel OMS | `/oms/panel` | FR4 | KPIs (StatCard) + tabla de alertas (incluye tipos de FR8 y FR9.6); estado de error de conexión |
| Cola de Priorización | `/oms/cola` | FR2, FR3 | Tabla ordenada por score + panel lateral con desglose de reglas (suma = score, FR5.5) + OverrideModal (motivo ≥10, FR3.4/FR3.5) |
| Motor de Reglas | `/oms/reglas` | FR5 | Perfiles + reglas con toggle activar/desactivar, orden por peso, condición campo/operador/valor |
| Simulador | `/oms/simulador` | FR6 | Comparación cola actual vs. simulada + resumen de impacto |
| Calendario de Rutas | `/oms/rutas-despacho` | FR1 | **Cuadrícula semanal** L–D con checks teal; datos reales Cofersa CR (34 zonas); `44 REY` "Cita previa" |
| Auditoría | `/oms/auditoria` | FR7 | Registro solo lectura, filtro auto/manual, score ant→nuevo |

## Detalle de la Pantalla Calendario de Rutas (FR1)

Cumple la especificación pedida: tarjeta "Calendario de Rutas — Costa Rica" con
botón "+ Nueva Ruta"; columnas `RUTA | L | M | X | J | V | S | D | EXCEPCIONES |
ESTADO`; check teal (✓) en los días de salida (carga) de cada zona; EXCEPCIONES
en ámbar ("N activa(s)") o "—"; ESTADO con badge "Activa" (success) o inactiva
atenuada. Ejemplos con datos reales: `08 San Carlos` → L, X, V; zonas GAM del
casco "Lunes a Viernes" → L, M, X, J, V; `44 REY` → marcador especial "Cita
previa" (sin días fijos, ocupa las 7 columnas de día).

## Archivos

19 archivos nuevos bajo `src/pages/oms/` (tipos, mock, api, 3 componentes,
6 pantallas con sus controllers, 1 modal) + 2 archivos modificados del repo
(`src/router/config.tsx`, `src/components/feature/Sidebar.tsx`).

## Verificación

- Build Vite: OK. Type-check: sin errores en `src/pages/oms`. ESLint: exit 0.
- La app arranca con `pnpm run dev`; el grupo "OMS" aparece en el sidebar y las
  6 pantallas navegan con datos mock.

## Cómo probarlo

1. `pnpm run dev` y abrir la app.
2. En el sidebar, expandir el grupo **OMS**.
3. Recorrer Panel → Cola (seleccionar un pedido, "Alterar prioridad") → Motor de
   Reglas (toggle) → Simulador ("Simular") → Rutas y Días (cuadrícula) →
   Auditoría (filtros).

## Sources

- `src/pages/oms/**` — código generado.
- `src/router/config.tsx`, `src/components/feature/Sidebar.tsx` — cableado.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/refined-mockups/mockups.md` — pantallas.
- `Rutas cofersa - costa rica.csv` — datos reales del calendario.

## Assumptions & Open Questions

- Prototipo desechable/evolutivo: la capa de datos real y RLS se añaden en
  Construcción. Ver `code-generation-plan.md` para el alcance excluido.

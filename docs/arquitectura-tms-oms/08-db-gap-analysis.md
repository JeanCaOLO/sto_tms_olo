# Documento 8 — DB Gap Analysis (Fase 1)

## 1. Matriz CURRENT → TARGET (formato pedido)

```text
CURRENT TABLE          TARGET TABLE                  ACTION      MIGRATION   DEPENDENCIES                 RISK
organizations          organizations                 KEEP        NO          —                            —
countries               countries                     EXTEND      YES        organizations                BAJO
(no existe)             warehouses                    CREATE      YES        countries                    ALTO
customers               customers                     EXTEND      YES        warehouses (nueva FK)        MEDIO
stores                  stores (solo is_origin=true)  KEEP+SCOPE  YES        warehouses                   MEDIO
(no existe)             final_customers                CREATE      YES        customers                    MEDIO
(no existe)             delivery_points                CREATE      YES        final_customers, addresses  MEDIO
(no existe)             addresses                       CREATE      YES        countries                    BAJO
(no existe)             contacts                        CREATE      YES        final_customers/delivery_points BAJO
license_types           driver_license_types           RENAME+EXT  YES        countries                    BAJO
(no existe, opcional)   driver_licenses                 CREATE      COND.*     drivers, driver_license_types BAJO
(no existe)             user_scopes                     CREATE      YES        app_users, countries, warehouses, customers BAJO
(no existe)             schema_migrations               CREATE      YES        —                            BAJO
zones (referenciada, NO existe) | ver §4 abajo — NO se crea todavía sin resolver semántica | DECIDE | — | — | — 
```

`*` `driver_licenses` (N:M) es **condicional** a la confirmación de negocio
de §9.2 en `03-modelo-datos-erd.md` — en esta fase se crea la tabla vacía
(no rompe nada) pero **no se migra `drivers.license_type_id` hacia ella**
hasta confirmar si un conductor puede tener más de una licencia. Mientras
tanto `drivers.license_type_id` sigue siendo la fuente de verdad.

## 2. Índices y constraints nuevos (§29 del prompt de implementación)

| Tabla | Índice/constraint |
|---|---|
| `warehouses` | `UNIQUE(country_id, code)` |
| `customers` | `UNIQUE(warehouse_id, code)` (reemplaza el `UNIQUE` actual si lo hay sobre otro scope) |
| `final_customers` | `UNIQUE(customer_id, external_code)` — **no** único global |
| `delivery_points` | `idx(final_customer_id)`; `CHECK` de máximo un `is_default=true` por `final_customer_id` (vía índice único parcial `WHERE is_default`) |
| `addresses` | `idx(country_id)` |
| `driver_license_types` | `UNIQUE(country_id, code)` |
| `user_scopes` | `idx(user_id)`, `idx(country_id)`, `idx(warehouse_id)`, `idx(customer_id)` |

## 3. Capability Matrix — `src/lib/tarifas/` (pedida en §2 del prompt de implementación)

| Capability | Existing | Reusable | Needs Refactor | OMS Need | TMS Need |
|---|---|---|---|---|---|
| AST de condiciones tipadas (`Pred`) | ✅ | ✅ | No | ✅ (reglas de prioridad de pedido) | ✅ (ya en uso) |
| AST de expresiones (`Expr`: FIXED/PER_KM/PERCENT/TIERED/LOOKUP_ZONE/MIN/MAX/CLAMP/IF) | ✅ | Parcial | Sí — `LOOKUP_ZONE`/`PER_KM` son específicos de tarifa; OMS necesita expresiones propias (ej. "prioridad = f(fecha, ventana)") | Necesita vocabulario propio | ✅ (ya en uso) |
| *Stages* ordenados + *stacking* (SUM/MAX/EXCLUSIVE) | ✅ | ✅ | No | ✅ (encaja con "reglas del cliente → almacén → país") | ✅ (ya en uso) |
| Versionado de reglas (`Rule.version`) | ✅ (campo existe) | ✅ | Sí — hoy vive en memoria/localStorage, no en tabla `rule_versions` real | ✅ | ✅ |
| Trazabilidad (`TraceLine`) | ✅ | ✅ | Sí — no se persiste salvo al emitir `Proforma` | ✅ (exactamente el `decision_factor` que pide §12) | ✅ (ya en uso) |
| Overrides con motivo obligatorio | ✅ | ✅ | No | ✅ (override manual de prioridad, ya existe como concepto en OMS mock) | ✅ (ya en uso) |
| Snapshot inmutable (`Proforma`) | ✅ | ✅ | Sí — no persiste en Postgres, vive en `localData` | ✅ (decisión de prioridad no debe recalcularse retroactivamente) | ✅ |
| Cost engine (`computeCost`) | ✅ | ✅ | Sí — conectar a `vehicles`/`rates` reales (Fase 9, no esta fase) | No aplica directamente | ✅ |
| Margin engine (`computeMargin`) | ✅ | ✅ | No (lógica), sí (conexión a datos reales) | No aplica | ✅ |
| Vocabulario de variables (`VarKey`) | ✅ | ❌ (específico de tarifa: `km`, `weightKg`, `truckTypeId`...) | Sí — OMS necesita su propio `VarKey` (`priorityDate`, `deliveryWindow`, `customerCode`, ...) | Nuevo vocabulario | Vocabulario actual se mantiene |
| Fuente de datos (`repository.ts`) | ✅ | ❌ | Sí — acoplado a `localData/store.ts` (localStorage) y a Supabase legado; debe migrar a Postgres real | Necesita su propio repositorio (pedidos, no viajes) | Necesita migrar a Postgres (fuera de esta fase) |

**Conclusión de la matriz (§2 del prompt de implementación):** el **AST +
evaluador + resolver** (predicados, expresiones, stages, stacking,
trazabilidad, versionado, overrides) es **100% reusable como motor común**,
parametrizado por `domain`/`VarKey`. Lo que **no** se reusa tal cual es el
vocabulario de variables (propio de tarifa) ni la capa de repositorio
(acoplada a `localData`/Supabase legado). Se propone la estructura de
carpetas (ver §6):

```text
src/domain/rules/        (extraído de src/lib/tarifas/{types,evaluator,resolver}.ts,
                           generalizado con `domain` + `VarKey` parametrizable)
src/domain/pricing/       (lo que queda específico de tarifa: cost.ts, margin.ts,
                           money.ts, format.ts, y el vocabulario VarKey de tarifa)
src/domain/oms-priority/  (nuevo, Fase 6 — NO esta fase; vocabulario propio de OMS)
```

**Para esta Fase 1 no se ejecuta esta extracción todavía** (está fuera del
alcance — Fase 4 del roadmap). Se documenta aquí porque el prompt de
implementación pide el análisis completo antes de decidir Fase 1, y porque
el diseño de `rules`/`rule_versions`/`user_scopes` de esta fase debe ser
compatible con esa extracción futura (mismos tipos de columna, mismo patrón
de versionado) para no tener que rehacerlo.

## 4. Semántica de "zone" (§23 del prompt de implementación) — investigación completa

Se encontraron **tres conceptos distintos** usando la palabra "zona" en el
código, confirmando la sospecha del prompt de implementación de que no deben
mezclarse:

| # | Concepto | Dónde vive hoy | Naturaleza |
|---|---|---|---|
| 1 | **`delivery_zone`** (texto libre) | Columnas `varchar` en `customers`, `stores`, `orders` (ya existen en Aurora) | Etiqueta informal, sin catálogo — cualquier texto, sin validación |
| 2 | **`Zone`/`ZoneGroup`/`ZoneLaneRate`** (zona tarifaria) | `src/lib/tarifas/types.ts` + `localData/store.ts` (localStorage, NO Postgres) | Catálogo real con jerarquía (`ZoneGroup` → `Zone`) y tarifas zona-a-zona (`LOOKUP_ZONE`); **confirmado en `repository.ts`**: hoy `stores`/`route_types` reales no tienen `zone_id`, así que todo viaje real cae en una zona *catch-all* `SIN_ZONA` |
| 3 | **`zones`** (tabla referenciada, inexistente) | `StoreModal.tsx`, `RouteTypeModal.tsx` — un `<select>` de zona al crear/editar tienda o tipo de ruta | Nunca se implementó; no hay evidencia de qué forma debía tener |

**Análisis:** el concepto #3 (lo que rompe hoy) es casi seguro una versión
**incompleta** del concepto #2 — alguien empezó a construir el selector de
zona tarifaria/geográfica en Tiendas y Tipos de Ruta pero la tabla nunca se
creó, y el motor de tarifas real terminó viviendo en `localStorage` en
paralelo, sin conectarse jamás a `stores`/`route_types`. El concepto #1
(`delivery_zone` de texto libre) es informal y no se relaciona con ninguno de
los otros dos — es solo una etiqueta.

## 5. ❓ Decisión requerida antes de crear cualquier tabla `zones`

**No se crea ninguna tabla `zones`/`pricing_zones`/`geographic_zones` en esta
Fase 1.** Crear una tabla ahora, sin resolver esto, repetiría exactamente el
error que causó el bug original (una tabla a medias, sin conexión al resto).
La corrección mínima y segura para esta fase es:

- **Acción inmediata (Fase 1, sin ambigüedad):** en `StoreModal.tsx` y
  `RouteTypeModal.tsx`, **retirar** la llamada a `.from('zones')` (que
  siempre fallaba) y, si se necesita alguna entrada de zona en esos
  formularios mientras no hay decisión, usar un campo de texto libre
  (equivalente al ya existente `delivery_zone`) en vez de un `<select>`
  contra una tabla que no existe. Esto **arregla el bug reportado en
  `ANALISIS_SISTEMA_TMS.md` §5.3 sin inventar semántica nueva.**
- **Decisión de negocio pendiente (no bloquea Fase 1, se registra para
  Fase 4/9):** ¿el concepto #2 (zona tarifaria del kernel de Tarifas) es el
  mismo concepto que debía usar el selector de Tiendas/Tipos de Ruta, o son
  dominios distintos que coincidieron en nombre? Se necesita para diseñar
  correctamente `pricing_zones` cuando el kernel de tarifas migre a Postgres
  (Fase 4/9), no para esta fase.

## 6. Estructura de carpetas propuesta (backend, Fase 1)

```text
server/
  domain/
    context/
      resolveOperationalContext.mjs
      authorizeOperationalContext.mjs
  tms-relations.mjs        (whitelist ampliada con las tablas nuevas)
```

No se introduce una carpeta `src/domain/` en el frontend todavía (eso es
Fase 4, ver §3 arriba) — Fase 1 solo toca el backend de contexto/scope y el
modelo de datos.

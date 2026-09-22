# Motor de tarifación y liquidación — Diseño de integración

Fecha: 2026-08-31
Estado: aprobado por el usuario, pendiente de implementación (Fase 1)

## 1. Contexto

Este proyecto (`tmsEjemploJean`) es un TMS real sobre React 19 + Vite + TypeScript + Tailwind +
Supabase (multi-tenant vía `organization_id` + RLS). El módulo `liquidaciones` (rotulado "Tarifas"
en el sidebar) calcula hoy lo que se le paga a un transportista con una fórmula fija de 4 términos
en `number` de JS (`SettlementModal.tsx::calculateAmounts`): `base + km×tarifa + entregas×tarifa −
devoluciones×tarifa`, con bonos/penalizaciones que existen en el formulario pero nunca se calculan
(quedan hardcodeados en 0). No hay reglas configurables, no hay zonas, no hay costo interno ni
margen.

Existe un prototipo de demostración (`prototipoTarifador`, documentado íntegro en
`resumen/01-documentacion-proyecto.md` y `resumen/02-motor-reglas-liquidacion.md`) con un **kernel
puro** de tarifación: un lenguaje de reglas basado en datos (AST de `Pred`/`Expr`, sin `eval`), un
resolver de prioridad/stacking (`SUM`/`MAX`/`EXCLUSIVE`), un motor de costos (flota propia/
tercerizada) y un motor de margen con semáforo. Ese kernel es la fuente de verdad técnica para esta
integración — los fragmentos de código citados en el documento 02 son código real, no pseudocódigo,
y deben copiarse casi literalmente.

Esta spec cubre **cómo portar ese kernel a este proyecto concreto**: qué se copia tal cual, qué se
adapta al modelo de datos existente (Supabase, no localStorage), y cómo se integra a la UI ya
existente sin romper sus convenciones visuales.

## 2. Alcance y fases

Se acordó con el usuario un port completo (reglas + costo + margen), dividido en 3 fases, cada una
entregable y usable de forma independiente:

- **Fase 1** — kernel de reglas puro + catálogo de Zonas + catálogo de Reglas + integración básica
  del cálculo en Liquidaciones (reemplaza la fórmula fija).
- **Fase 2** — motor de costos (flota propia/tercerizada) + motor de margen + semáforo integrado a
  Liquidaciones.
- **Fase 3** — pulido UX: overrides con motivo, reglas ad-hoc, plantillas, ayuda contextual, resumen
  de reglas activas.

**No-objetivos** (fuera de alcance, igual que en el prototipo original): backend/API propio más allá
de Supabase, tasas de cambio o distancias en vivo, lógica fiscal, workflows de aprobación más allá
del `ProformaStatus` que ya existe en `settlements.status`, multi-tenancy nuevo (ya existe vía
`organization_id`).

## 3. Decisiones de diseño (ya acordadas con el usuario)

1. **Precisión numérica**: el kernel interno usa `Money: string` + `decimal.js` (como el prototipo).
   Las columnas de Supabase siguen siendo `numeric`/`double precision`; la conversión
   number↔string ocurre en el borde (al leer/escribir Supabase), nunca dentro de `src/lib/tarifas/`.
2. **Zonas**: se modelan como entidades reales (`zones`, `zone_groups`), pero **reusando el modelo
   geográfico ya existente** en vez de crear un catálogo de localidades nuevo:
   - `route_types.zone_id` (nullable, FK a `zones`) → zona **destino** de la ruta. Justificación:
     `route_types.name` ya se usa en la práctica como zona (el placeholder de
     `RouteTypeModal.tsx` dice "Ej: GAM, Zona Norte, Zona Sur") — no se cambia el flujo de
     planificación existente, el operador ya elige un tipo de ruta al crear la ruta.
   - `stores.zone_id` (nullable, FK a `zones`) → zona **origen**, tomando la tienda/bodega
     (`stores.is_origin = true`) asociada a `routes.store_id`.
3. **Persistencia del resultado**: se extiende la tabla `settlements` existente (no se crea una
   tabla paralela), agregando columnas `jsonb` para trace/margen/costo/overrides. Mantiene
   compatibilidad con el resto de la app que ya lee `settlements.*`.
4. **Migraciones**: el usuario **no tiene acceso a Supabase todavía**. Cada fase entrega su propio
   archivo `.sql` versionado en el repo (carpeta `sql/`), con un bloque de comentario en mayúsculas
   al inicio advirtiendo que debe ejecutarse manualmente en el SQL editor de Supabase antes de que
   el código de esa fase funcione. El código nunca ejecuta DDL por sí mismo.
5. **UI**: debe verse y sentirse igual al resto del proyecto — mismos componentes base
   (`Card`, `Button`, `Badge`, `Input`, `Select`, `StatCard`), mismos colores (`teal`/`slate`,
   ver `Button.tsx`/`Badge.tsx`), mismo patrón página+modal por entidad que ya usan
   `transportistas`, `vehiculos`, `conductores`, etc. No se porta el `EntityList.tsx` genérico del
   prototipo; se sigue la convención de este repo (un `page.tsx` + un `XModal.tsx` por entidad).

## 4. Fase 1 — Kernel puro + Zonas + Reglas

### 4.1 Kernel (`src/lib/tarifas/`)

Archivos, copiados del documento 02 (sección 2 tipos, sección 3 resolver, secciones 6-7
evaluator/money) adaptando solo imports/paths, **sin** cambiar la lógica:

```
src/lib/tarifas/
  types.ts       — Money, VarKey/NumericVarKey, Pred, Expr, BaseRef, Rule, Stage/STAGE_ORDER,
                   Stacking, TraceLine, DiscardedRule, CalcResult, CalculateInput (sin los campos
                   de costo/margen todavía — se agregan en Fase 2), Override
  money.ts       — Decimal, ZERO, toDecimal/toMoney, roundMoney/roundToMoney, addAll, isNegative
  resolver.ts    — deriveContext(), resolveRules(), computeOvernightNights(), computeWeekday()
  evaluator.ts   — evaluatePred(), evaluateExpr(), runChargePipeline()
  schemas.ts     — RuleSchema (zod), para validar antes de guardar en `pricing_rules`
  index.ts       — calculate(): versión Fase 1 (sin computeCost/computeMargin todavía)
  __tests__/
    fixtures.ts
    resolver.test.ts
    evaluator.test.ts
```

Reglas de pureza (no negociables, ver documento 03): nada de `React`/`localStorage`/`fetch`, nada de
`Date.now()`/`new Date()` implícito (todo dato de tiempo entra como parámetro), `Money` nunca cruza
una frontera serializable como `number`, sin `eval` ni intérprete genérico — cada operador nuevo es
un caso más del `switch` exhaustivo.

`DerivedVars.originZone`/`destZone` son el **código** de zona (`zones.code`), igual que en el
prototipo — así se escriben las condiciones de las reglas, nunca el `id` interno.

### 4.2 Esquema de datos nuevo (`sql/01_fase1_zonas_reglas.sql`)

Cabecera obligatoria del archivo:

```sql
-- ============================================================================
-- ADVERTENCIA: este script NO se ejecuta automáticamente.
-- Debe correrse manualmente en el SQL editor de Supabase (o vía CLI) ANTES de
-- usar las funcionalidades de la Fase 1 del motor de tarifas. Revisar cada
-- sentencia contra el esquema real de la organización antes de aplicar.
-- ============================================================================
```

Tablas (todas con `organization_id uuid not null references organizations(id)`, RLS igual al patrón
del resto del esquema, `created_at`/`updated_at`):

- `zone_groups (id, organization_id, code, name, status)`
- `zones (id, organization_id, zone_group_id nullable fk, code, name, status)`
- `zone_lane_rates (id, organization_id, origin_zone_id fk, dest_zone_id fk, amount numeric,
  currency, status)` — resuelve `LOOKUP_ZONE`.
- `fx_rates (id, organization_id, country_id fk, from_currency, to_currency, rate numeric,
  rate_type text check in ('OFFICIAL','PARALLEL','INTERNAL'), source, valid_from timestamptz)`.
- `pricing_rules (id, organization_id, country_id fk nullable, code, name, stage text check in
  ('BASE','VARIABLE','MODIFIER','SURCHARGE','ADJUSTMENT','TAX'), priority int, stacking text check
  in ('SUM','MAX','EXCLUSIVE'), exclusion_group text nullable, currency_mode text check in
  ('REF','LOCAL'), conditions jsonb not null, expression jsonb not null, is_adhoc boolean default
  false, active boolean default true, version int default 1)` — mapea 1:1 a `Rule`.
- `ALTER TABLE route_types ADD COLUMN zone_id uuid references zones(id)` (nullable).
- `ALTER TABLE stores ADD COLUMN zone_id uuid references zones(id)` (nullable).
- `ALTER TABLE settlements ADD COLUMN trace jsonb, ADD COLUMN discarded jsonb, ADD COLUMN
  stage_subtotals jsonb, ADD COLUMN fx_used jsonb, ADD COLUMN warnings jsonb, ADD COLUMN
  origin_zone_id uuid references zones(id), ADD COLUMN dest_zone_id uuid references zones(id)`.

`rates` (tabla vieja de tarifas planas) **no se toca ni se migra** — queda como está, sin uso una
vez que `pricing_rules` esté activo, disponible por si el usuario quiere consultarla o borrarla más
adelante.

### 4.3 Capa de mapeo (`src/lib/tarifas/adapters.ts`, fuera del kernel puro)

Funciones que arman un `CalculateInput` desde Supabase (SÍ pueden importar `supabase`, viven fuera
de `src/lib/tarifas/` puro — ej. `src/lib/tarifas/repository.ts` o directamente en el hook de UI):

- `buildTripContext(route, order agregados)` → `TripContext` (Fase 1: sin `fleetType`/costo, se
  completa en Fase 2).
- `deriveZones(route)` → resuelve `originZoneId` desde `stores.zone_id` (vía `route.store_id`) y
  `destZoneId` desde `route_types.zone_id` (vía `route.route_type_id`); si cualquiera es `null`,
  las reglas que dependan de zona simplemente no aplican (condición `EQ originZone X` no matchea) —
  no es un error duro, es una limitación conocida a documentar en la UI ("configure zona en Tipos de
  Ruta / Tiendas para usar reglas por zona").
- `toCalculateInput(...)` → junta reglas activas del país + zonas + fx + trip → `CalculateInput`.

### 4.4 UI Fase 1

- Sidebar: nueva entrada dentro de "Catálogos" → **"Reglas de Tarifa"** (`ri-price-tag-3-line`),
  ruta `/reglas-tarifa`, con pestañas internas **Reglas** y **Zonas** (patrón de pestañas ya usado
  en `vehiculos/page.tsx` con `Tab` type + botones).
  - `src/pages/reglas-tarifa/page.tsx` (+ `components/RuleModal.tsx`, `components/ZoneModal.tsx`,
    `components/ZoneGroupModal.tsx`).
  - `RuleModal`: formulario guiado para los 5 operadores editables (`FIXED`, `PER_UNIT`, `PER_KM`,
    `PERCENT`, `TIERED`) + selector de condición simple (`ALWAYS` o `AND` de comparaciones); un
    modo "avanzado" con textarea de JSON crudo (validado con `RuleSchema` de zod antes de guardar)
    para los operadores restantes (`LOOKUP_ZONE`, `MIN`, `MAX`, `CLAMP`, `IF`) y condiciones
    complejas (`OR`/`NOT`/`IN`/`BETWEEN`) — igual limitación documentada que el prototipo.
- `SettlementModal.tsx`:
  - Pestaña "Tarifas y Cálculo" deja de tener inputs manuales de tarifa (`per_km_rate` etc.); en su
    lugar arma el `CalculateInput` (país de la organización, ruta, distancia/entregas/devoluciones
    ya cargados, zonas derivadas, reglas activas del país) y llama `calculate()` en un `useMemo`
    reactivo a esos inputs — mismo patrón que `useCalculation`/`Quoter.tsx` del prototipo
    (documento 02, sección 8), sin copiar la UI original.
  - Pestaña "Resumen" muestra el desglose (`TraceLine[]`) en una tabla de solo lectura
    (columnas: etapa, regla, base, monto) — versión mínima de `BreakdownTable`, con los componentes
    base de este repo.
  - Al guardar, persiste `total_amount = chargedTotal`, más `trace`, `discarded`,
    `stage_subtotals`, `fx_used`, `warnings`, `origin_zone_id`, `dest_zone_id` en las columnas
    nuevas de `settlements`.
  - Pestaña "Reglas" dentro del modal (ya existe como tab vacío de bonos/penalizaciones) pasa a
    mostrar qué reglas activas aplicaron a esta liquidación (solo lectura en Fase 1; overrides y
    ad-hoc llegan en Fase 3).

### 4.5 Testing Fase 1

- `resolver.test.ts`/`evaluator.test.ts` portados desde el prototipo, adaptados a los fixtures de
  este dominio (usar países/monedas reales de la organización en vez de VE/CO/CR si aplica, o
  mantener países ficticios de test — decidir al escribir el plan).
- `npm run type-check` y una suite Vitest nueva (agregar `vitest` a devDependencies y script
  `"test": "vitest run"` en `package.json`, no existe hoy).
- Prueba manual: crear una regla `BASE` `FIXED`, una `VARIABLE` `PER_KM` `SUM`, verificar que el
  desglose en `SettlementModal` sume correctamente y que `total_amount` guardado coincida.

## 5. Fase 2 — Costo y margen

### 5.1 Kernel

Agregar a `src/lib/tarifas/`: `cost.ts` (`computeCost()`, documento 02 sección 4) y `margin.ts`
(`computeMargin()`, sección 5). Extender `types.ts` con `TruckType`→ mapear a `vehicle_types` ya
existente, `Carrier`→`carriers` ya existente, `OwnCostParams`, `OwnCostRate`, `OutsourcedCostRate`,
`OwnFleetRouteRate`, `OwnFleetCostSettings`, `MarginPolicy`, `MarginResult`, `CostBreakdown`.
Extender `CalculateInput` y `calculate()` en `index.ts` para orquestar `computeCost`/`computeMargin`
tal como en el documento 02 sección 1.

`fleetType: 'OWN' | 'OUTSOURCED'` se deriva de si `routes.carrier_id` está seteado (tercerizada) o
no (propia) — confirmar contra el esquema real de `routes`/`vehicles` al implementar.

### 5.2 Esquema de datos (`sql/02_fase2_costo_margen.sql`, misma advertencia de cabecera)

- `own_cost_params (id, organization_id, country_id fk, driver_daily numeric)`
- `own_cost_rates (id, organization_id, vehicle_type_id fk, cost_per_km numeric,
  depreciation_per_km numeric)`
- `outsourced_cost_rates (id, organization_id, carrier_id fk, origin_zone_id fk, dest_zone_id fk,
  vehicle_type_id fk, flat_rate numeric)`
- `own_fleet_route_rates (id, organization_id, origin_zone_id fk, dest_zone_id fk, vehicle_type_id
  fk, flat_rate numeric, reference_km numeric)`
- `own_fleet_cost_settings (id, organization_id, country_id fk, mode text check in
  ('FLAT','FORMULA'))`
- `margin_policy (id, organization_id, country_id fk, warn_below numeric, critical_below numeric,
  require_reason_below numeric, block_on_loss boolean)`

### 5.3 UI Fase 2

- Pestaña "Costos" en `/reglas-tarifa` (CRUD de las 5 tablas de costo de arriba) + pestaña "Política
  de Margen" (una fila editable por país).
- `liquidaciones/page.tsx`: columna/`Badge` de semáforo de margen (`OK`=success, `WARN`=warning,
  `CRITICAL`/`LOSS`=danger, reusando las variantes ya definidas en `Badge.tsx`).
- `SettlementModal.tsx`: pestaña "Resumen" agrega costo total y margen calculado; si
  `margin.action === 'BLOCK'`, deshabilita el botón "Aprobar"/cambiar a estado `Aprobado`/`Pagado`
  con mensaje explicando por qué; si `REQUIRE_REASON`, exige un campo de texto no vacío
  (reusa `Override.reason` como convención de "nunca sobreescribir en silencio").

### 5.4 Testing Fase 2

`cost.test.ts`/`margin.test.ts` portados, casos de los 2 modos de costo propio (`FLAT`/`FORMULA`) y
tercerizado, y los 4 estados de margen.

## 6. Fase 3 — Pulido UX

- `overrides` línea por línea en el desglose de `SettlementModal` (edición manual de un monto de
  regla con motivo obligatorio, nunca sobreescribe en silencio — se guarda junto al valor calculado
  original en `TraceLine.override`).
- Reglas ad-hoc: agregar una regla puntual a una liquidación sin persistirla en `pricing_rules`
  (columna `adhoc_rules jsonb` en `settlements`), con opción de "guardar en biblioteca" después.
- Plantillas de reglas reutilizables (tabla `pricing_templates`, CRUD simple).
- Ayuda contextual (`HelpButton` — puede reusarse un componente existente de este repo si ya hay un
  patrón de tooltip/ayuda, si no, uno nuevo mínimo siguiendo la paleta del proyecto).
- Pestaña "Resumen" en `/reglas-tarifa`: rollup de reglas activas agrupadas por etapa (equivalente
  simplificado de `ResumenTab.tsx` del prototipo).

Fase 3 se detalla en su propio plan de implementación una vez cerradas las Fases 1 y 2 — no se
fija aquí el DDL exacto de `pricing_templates` para no comprometerse antes de ver cómo evolucionó el
resto en la práctica.

## 7. Riesgos y supuestos a verificar durante la implementación

- Los nombres exactos de columnas de `routes`, `stores`, `route_types`, `vehicles`, `carriers` se
  confirmarán leyendo el código de sus páginas/modales al momento de escribir cada `.sql` — esta
  spec asume los nombres vistos en `RouteModal.tsx`, `planificacion/page.tsx`, `StoreModal.tsx`,
  pero no se ha introspectado el esquema real de Postgres (el usuario no tiene acceso a Supabase
  todavía para confirmarlo en vivo).
- Una ruta puede tener múltiples paradas en ciudades distintas; `destZone` se resuelve a nivel de
  **tipo de ruta**, no de parada individual — es una simplificación consciente (ver sección 3,
  punto 2), documentada para el usuario como limitación conocida, igual que las limitaciones
  documentadas del prototipo original (sección 7 del documento 01).
- `vitest` no está instalado en este proyecto — se agrega en Fase 1 como devDependency nueva.

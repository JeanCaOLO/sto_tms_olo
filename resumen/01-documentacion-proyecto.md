# Documentación del proyecto y de los cambios — Prototipo Tarifador

> Este documento resume **todo el proyecto** para dar contexto completo. La integración al
> proyecto destino se limita al motor de cálculo (`src/kernel/`) — ver
> [`02-motor-reglas-liquidacion.md`](./02-motor-reglas-liquidacion.md) para esa parte, que es la
> que realmente hay que portar.

## 1. Qué es el proyecto

Un **prototipo de demostración** de un motor de tarifación y liquidación de fletes/transporte,
multi-país (Venezuela, Colombia, Costa Rica en el seed actual). No es un sistema de producción:
prioriza claridad de la lógica de cálculo, flexibilidad (reglas/costos/políticas son datos, no
código) y explicabilidad (toda tarifa se puede desglosar regla por regla).

Optimiza en este orden: **1)** claridad del evaluador, **2)** flexibilidad vía datos, **3)**
usabilidad (recálculo instantáneo, desglose editable, semáforo de margen), **4)** mantenibilidad
(separación estricta kernel puro / UI, tipos exhaustivos, tests).

**Deliberadamente NO incluye**: backend, servidor, API, autenticación, roles, base de datos
ejecutándose, migraciones, Docker, CI, integración con geolocalización o tasas de cambio en vivo,
lógica fiscal, workflows de aprobación, ni multi-tenancy. `schema.sql` (raíz del proyecto) documenta
cómo se migraría el modelo a Postgres, pero no se ejecuta.

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | React 18.3 + Vite 5 (sin Next.js) |
| Lenguaje | TypeScript 5.5, `strict`, sin `any` en el kernel |
| Estilos | Tailwind CSS 3.4, sin librería de componentes externa |
| Estado | Hooks de React (`useState`/`useMemo`), sin Redux/Zustand/Context global |
| Validación runtime | Zod 3.23 (`src/kernel/schemas.ts`) |
| Precisión numérica | decimal.js (`src/kernel/money.ts`) — el dinero nunca es `number` de JS |
| Backend / DB | Ninguno — fuera de alcance a propósito |
| Testing | Vitest — `src/kernel/__tests__/*`, `src/data/__tests__/*` |

Scripts (`package.json`):
```bash
npm install
npm run dev         # vite, http://localhost:5173
npm run build        # tsc --noEmit && vite build
npm test             # vitest run — 31 tests del kernel y de integridad del seed
npm run typecheck     # tsc --noEmit
```

## 3. Estructura de carpetas

```
src/
  kernel/     — motor puro: NO importa React, localStorage, fetch ni Date.now()
    types.ts       tipos de dominio + AST del lenguaje de reglas (fuente de verdad)
    resolver.ts     ¿qué reglas aplican? filtra + resuelve stacking (SUM/EXCLUSIVE/MAX)
    evaluator.ts    ¿cuánto suma cada regla? + pipeline de cargo (runChargePipeline)
    cost.ts         motor de costos (flota propia / tercerizada), independiente del AST de Rule
    margin.ts       margen + semáforo (OK/WARN/CRITICAL/LOSS)
    money.ts        Decimal, redondeo por país — único lugar que sabe convertir Money↔Decimal
    schemas.ts       validación zod (usada al leer del storage)
    index.ts        calculate() — único punto de entrada, orquesta todo lo anterior
    __tests__/      evaluator.test.ts, resolver.test.ts, margin.test.ts, cost.test.ts, fixtures.ts
  data/
    repository.ts    interfaz Repository + implementación localStorage
    seed.ts          datos maestros (países, zonas, reglas, costos) — VE/CO/CR
  ui/            todos los componentes React (fuera del alcance de esta migración)
schema.sql        mapeo documental types.ts ↔ Postgres — no se ejecuta
README.md         guion de demo, mapa de migración, limitaciones conocidas
REGLAS.md         explicación del motor de reglas en lenguaje llano (no técnico)
```

## 4. Pantallas principales (referencia — no se portan)

- **Vista de tarifas**: `TarifasScreen.tsx`, `TarifasPorZonaTab.tsx`
- **Nueva tarifa** (viaje de catálogo): `NuevaTarifaScreen.tsx`
- **Viaje extraordinario / Cotizador** (viaje fuera de catálogo, con overrides y reglas ad-hoc):
  `Quoter.tsx`, `TripForm.tsx`, `useCalculation.ts`, `CostSummary.tsx`, `ProformaBox.tsx`,
  `ProformaDetailPanel.tsx`, `ExplainPanel.tsx`, `BreakdownTable.tsx`
- **Reglas** (9 pestañas, agrupadas en `ReglasScreen.tsx`): Reglas, Zonas y localidades, Terceros y
  flota, Costos, Tarifas por zona, Tasas de cambio, Política de margen, Plantillas, Resumen
- **Plantillas (CRUD completo)**: `PlantillasTab.tsx`, `TemplateBar.tsx`
- **Ayuda contextual**: `HelpButton.tsx`, integrado en Nueva tarifa, Viaje extraordinario y las
  sub-pestañas de Reglas

## 5. Persistencia de datos

Todo vive en **`localStorage`** detrás de la interfaz `Repository` (`src/data/repository.ts`),
clave `tarifador:v2`. Al leer, el blob se revalida con Zod (`RuleSchema` para reglas); si está
corrupto o es incompatible, se descarta y se vuelve al seed (`src/data/seed.ts`). Botón "Reiniciar
demo" en la UI llama a `repository.resetToSeed()`.

**Persiste**: reglas (`saveRule`, incrementa `version` en cada edición), parámetros de costo,
plantillas, **y proformas emitidas** (`saveProforma`, numeración secuencial por país `VJ-0001`,
`updateProformaStatus` para cambiar estado sin tocar nunca `result`).

**No persiste**: overrides y reglas ad-hoc del Cotizador (viven solo en memoria de React durante la
sesión de un viaje extraordinario).

> Nota: `README.md` §7 afirma "no se persisten las proformas emitidas" — esa afirmación quedó
> desactualizada; las Tasks 1-2 del feature branch agregaron persistencia completa de `Proforma`
> (ver changelog abajo). Este documento refleja el estado real del código.

## 6. Changelog — arco completo del feature branch `feature/vista-tarifas-fase1`

`main` quedó fijo en el commit inicial (`bef640a`, prototipo de motor de tarifas). Todo lo
siguiente vive solo en el feature branch, en orden cronológico:

### Hito 1 — Modelo de Proforma y persistencia
- **`52e35a3`** Task 1: agrega tipos `Driver` y `Proforma` (con `ProformaStatus`:
  PENDIENTE/EN_REVISION/APROBADO/LIQUIDADO), campo `driverId` en `TripContext`, seed de conductores.
- **`cd00159`** Task 2: agrega `getDrivers`, `getProformas`, `saveProforma` (numeración `VJ-NNNN`
  por país), `updateProformaStatus` al `Repository`.
- **`62a9daa`** Fix: id de Proforma pasa a incluir `countryId` (`PRF-{countryId}-{seq}`) para evitar
  colisiones entre países que antes generaban el mismo id.

### Hito 2 — Pantalla de Tarifas
- **`b262613`** Tasks 3-11: crea la pantalla "Tarifas" completa (`CostSummary`, `MetricsRow`,
  `FiltersPanel`, `ProformaTable`, `ProformaDetailPanel`, `TarifasScreen`), modo solo-lectura en
  `BreakdownTable`, conecta el Cotizador para persistir la Proforma al emitir, reestructura el
  header de `App.tsx` con Tarifas como pantalla por defecto.
- **`e2fd848`/`d84e36f`** Fixes menores: nota de colisión de ids, contención de overflow horizontal
  en `BreakdownTable`.

### Hito 3 — Fase 2: Nueva Tarifa
- **`1453485`** Extrae `TripForm`, `ProformaBox` y el hook `useCalculation` del monolítico
  `Quoter.tsx`; crea `NuevaTarifaScreen.tsx` como pantalla independiente para viajes de catálogo,
  separando la lógica de cálculo de la UI para poder reutilizarla en Plantillas.

### Hito 4 — Fase 3: CRUD ampliado de Reglas
- **`71fb27b`** Introduce `EntityList.tsx` genérico y 7 pestañas nuevas de catálogo (Costos,
  Plantillas, Política de margen, Tarifas por zona, Tasas de cambio, Terceros, Zonas), agrupadas en
  `ReglasScreen.tsx`.
- **`8649cf7`** Reemplaza ids crudos por selectores con nombres legibles en las condiciones de
  reglas (`RuleForm`/`RuleList`).
- **`e05d521`** Docs: `REGLAS.md` — explicación del motor de reglas para usuarios no técnicos.

### Hito 5 — Modelo de costos por tipo de camión (Partes A-B)
- **`624bb6c`** Parte A: `OwnCostRate` pasa de un valor único por país a un valor por tipo de
  camión, porque el costo real de flota propia varía según el vehículo.
- **`9279c3a`** Parte B: elimina el `CostPanel.tsx` duplicado del Cotizador; costo pasa a mostrarse
  solo-lectura ahí (`CostSummary`), la edición se centraliza en Reglas → Costos, evitando doble
  fuente de verdad.

### Hito 6 — CRUD de Plantillas, formularios intuitivos y ayuda (Partes C-E)
- **`c9423d6`** Parte C: `PlantillasTab.tsx` gana crear y editar (reutilizando `TripForm`), además
  de leer/borrar — CRUD completo.
- **`00d3575`** Parte D: texto explicativo debajo de cada campo/sección de `RuleForm.tsx` para
  guiar al usuario no técnico.
- **`1adc780`** Parte E: `HelpButton.tsx` reutilizable, integrado en Nueva tarifa, Viaje
  extraordinario y las 8 sub-pestañas de Reglas — ayuda contextual paso a paso en toda la app.

### Hito 7 — Cierre: outsourcing completo, prioridad de reglas, resumen
- **`6d92fdf`** `BreakdownTable` muestra camión y costo en el recuadro de "Tarifa cobrada";
  se completan las tarifas de outsourcing faltantes por combinación transportista×camión en el seed.
- **`b60d794`** (commit más grande, 19 archivos): introduce `priorityAssignment.ts` (abstracción de
  "regla prioritaria" sobre el campo `priority` crudo), `ResumenTab.tsx` (rollup de reglas activas
  agrupadas por etapa y de tarifas de outsourcing agrupadas por ruta), amplía `cost.ts`/`types.ts`
  para soportar los **2 modos de costeo de flota propia** (`FLAT`/`FORMULA`) y los costos de flota
  tercerizada, actualiza `schema.sql`, `RuleList`, `RuleForm`, `CostosTab` en consecuencia. Es la
  culminación que reconcilia prioridad de reglas con los nuevos modelos de costo.

## 7. Limitaciones conocidas (heredadas del prototipo)

- El formulario guiado de reglas (`RuleForm.tsx`) solo edita 5 operadores de `Expr`: `FIXED`,
  `PER_UNIT`, `PER_KM`, `PERCENT`, `TIERED`. `LOOKUP_ZONE`, `MIN`, `MAX`, `CLAMP`, `IF` se muestran
  de solo lectura (activar/desactivar sí, editar la expresión no, salvo tocando `seed.ts`).
- El constructor de condiciones guiado solo cubre `ALWAYS` o un `AND` simple de comparaciones.
  `OR`/`NOT`/`IN`/`BETWEEN` no son editables desde la UI aunque el kernel los soporta y los tests
  los cubren.
- `MAX` no debe decidirse con bases `PERCENT` que dependan de subtotales — el desempate se calcula
  con una "sonda" que trata `RUNNING_SUBTOTAL`/`STAGE_SUBTOTAL`/`RULE` como cero (ver documento 02,
  sección de prioridad).
- No hay UI para crear países, zonas, localidades, transportistas o clientes — solo reglas,
  parámetros de costo y plantillas se editan en caliente; el resto requiere tocar `seed.ts`.
- Overrides y reglas ad-hoc del Cotizador viven solo en memoria de React, no en `localStorage`.
- Tasas de cambio, distancias y peajes son datos manuales/seedeados, no vienen de ninguna fuente en
  vivo (fuera de alcance a propósito).

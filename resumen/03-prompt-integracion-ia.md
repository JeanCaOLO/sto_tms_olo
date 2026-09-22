# Prompt para integrar el motor de tarifas en el otro proyecto

> Copia el bloque de abajo (entre las líneas `---`) y pégalo como prompt inicial en una sesión de
> Claude Code (u otra IA con acceso al repositorio) **dentro del proyecto destino**. Antes de
> pegarlo, copia también los archivos `01-documentacion-proyecto.md` y
> `02-motor-reglas-liquidacion.md` de esta carpeta a algún lugar accesible del proyecto destino
> (por ejemplo, una carpeta `docs/motor-tarifas/`) y ajusta la ruta en el prompt si es necesario.

---

## Contexto

Vamos a portar el **motor de tarifación y liquidación** de un prototipo (`prototipoTarifador`,
mismo stack que este proyecto: React 18 + Vite + TypeScript strict + Tailwind) a este proyecto. El
motor es un kernel puro en TypeScript (sin dependencias de React/localStorage/fetch) que calcula
tarifas a partir de un sistema de reglas configurables por datos, calcula el costo de flota propia
o tercerizada, y deriva el margen resultante.

Tienes disponibles dos documentos de referencia — **léelos completos antes de escribir código**:

1. `02-motor-reglas-liquidacion.md` — documentación técnica exhaustiva del motor: todos los tipos
   TypeScript exactos, el algoritmo de resolución de reglas y prioridad, el modelo de costos (flota
   propia en 2 modos + flota tercerizada), el motor de margen, la infraestructura de dinero, y el
   contrato de datos que el motor necesita para funcionar.
2. `01-documentacion-proyecto.md` — contexto general del proyecto de origen y changelog de cómo se
   construyó, útil si necesitas entender el "por qué" de alguna decisión.

## Alcance de esta tarea

**Portar SOLO el motor de cálculo**, no la interfaz de usuario del prototipo original. Este
proyecto ya tiene su propia UI; el motor debe integrarse como una librería/módulo de lógica de
negocio que esa UI (existente o nueva) pueda consumir.

Archivos del kernel a recrear (en el prototipo viven en `src/kernel/`):
- `types.ts` — todos los tipos de dominio + el AST del lenguaje de reglas (`Rule`, `Pred`, `Expr`,
  `BaseRef`, `VarKey`, etc.) — cópialos exactamente como se describen en el documento 02, sección 2.
- `resolver.ts` — `deriveContext()`, `resolveRules()`, `computeOvernightNights()`,
  `computeWeekday()` — el algoritmo de filtrado/prioridad/stacking (documento 02, sección 3).
- `evaluator.ts` — `evaluatePred()`, `evaluateExpr()`, `runChargePipeline()` (documento 02, secciones
  6-7).
- `cost.ts` — `computeCost()`, el motor de costos de flota propia (2 modos) y tercerizada
  (documento 02, sección 4).
- `margin.ts` — `computeMargin()` (documento 02, sección 5).
- `money.ts` — utilidades de `Decimal`/redondeo (documento 02, sección 6). Requiere la librería
  `decimal.js` como dependencia.
- `index.ts` — `calculate()`, el punto de entrada único que orquesta todo lo anterior (documento 02,
  sección 1).
- (Opcional pero recomendado) `schemas.ts` con validación Zod de `Rule`, si este proyecto ya usa Zod
  o quiere validar reglas al persistirlas/cargarlas.

## Instrucciones paso a paso

1. **Lee `02-motor-reglas-liquidacion.md` completo** antes de escribir una sola línea de código.
   Presta especial atención a: el vocabulario cerrado de `VarKey`/`NumericVarKey`, el AST de `Expr`
   (10 operadores, nada de evaluación de texto libre), y el algoritmo exacto de `resolveRules()`
   (sección 3) — es fácil introducir bugs sutiles de prioridad si se reimplementa de memoria en vez
   de seguir el pseudocódigo/código citado ahí.

2. **Decide dónde vive el kernel en este proyecto** (por ejemplo `src/kernel/` o
   `src/lib/tarifas/`, según la convención de carpetas de este repo) y recrea los archivos listados
   arriba. Como son puros, se pueden copiar casi literalmente desde el documento 02 — los bloques de
   código ahí son fragmentos reales del archivo original, no pseudocódigo.

3. **Decide la estrategia de datos**: este proyecto probablemente ya tiene su propio modelo de
   entidades (zonas, tarifas, clientes, etc.). Tienes dos caminos, evalúa cuál encaja mejor y
   decide con criterio propio, no asumas uno por defecto:
   - **Adoptar los tipos del kernel tal cual** como el modelo de datos de reglas/tarifas de este
     proyecto (más simple si no existe algo equivalente todavía).
   - **Mapear las entidades existentes de este proyecto** hacia los tipos del kernel justo antes de
     llamar a `calculate()`, dejando el kernel desacoplado del modelo de datos existente.
   En cualquier caso, el objetivo final es poder construir un objeto `CalculateInput` completo
   (documento 02, sección 9, lista exacta de qué debe contener) desde donde sea que este proyecto
   guarde sus datos.

4. **Portá los tests del kernel** (`evaluator.test.ts`, `resolver.test.ts`, `margin.test.ts`,
   `cost.test.ts` en el prototipo) como red de seguridad de que la reimplementación es fiel al
   original — son la mejor forma de detectar un bug de prioridad o de redondeo antes de que llegue a
   producción. Corré la suite de tests y `tsc --noEmit` (o el equivalente de este proyecto) al
   terminar.

5. **Expón `calculate()`** desde el punto donde este proyecto necesite cotizar o liquidar un viaje
   (un endpoint, un hook de React, un caso de uso — según la arquitectura existente). Si este
   proyecto tiene una pantalla de cotización, podés inspirarte en el patrón
   `useCalculation`/`Quoter.tsx` del prototipo (llamar a `calculate()` en un `useMemo` que
   recalcula ante cualquier cambio del `TripContext`/reglas/overrides) — sin necesidad de copiar
   esos archivos de UI.

## Restricciones que hay que respetar (no negociables)

- **No romper la pureza del kernel**: ningún archivo del kernel debe importar React, `localStorage`,
  `fetch` ni usar `Date.now()`/`new Date()` sin argumento. Todo dato de tiempo/entorno entra como
  parámetro explícito (ver `TripContext.quotedAt`).
- **`Money` siempre es `string` decimal, nunca `number`** en ninguna frontera serializable. Las
  conversiones a `Decimal` ocurren solo dentro de `money.ts`.
- **No inventar evaluación de texto libre ni `eval`** para condiciones o fórmulas — el vocabulario
  cerrado de `Pred`/`Expr`/`VarKey` es intencional, es lo que hace que el motor sea explicable y
  seguro. Si hace falta un operador nuevo, se agrega como un caso más del `switch` exhaustivo, no
  como un intérprete genérico.
- **`priority` solo importa para desempatar reglas `EXCLUSIVE`** dentro de la misma etapa — no le
  des semántica extra (por ejemplo, no asumas que ordena reglas `SUM`, ahí es irrelevante).
- **Cuidado con `stacking: 'MAX'` combinado con bases `PERCENT` dependientes de subtotales**
  (`RUNNING_SUBTOTAL`/`STAGE_SUBTOTAL`/`RULE`) — el desempate de `MAX` se calcula con una sonda que
  trata esos valores como cero, antes de que exista el pipeline de cargo real. No cambies ese
  comportamiento sin evaluar el impacto.
- **Acumulación sin redondear, redondeo solo en la salida** (`stageSubtotals`, `chargedTotal`,
  líneas del `trace`) — si se redondea línea por línea se introduce error compuesto.
- **Los overrides no sobreescriben en silencio**: siempre van acompañados de un `reason` y se
  preservan junto al valor calculado original en `TraceLine`, nunca lo reemplazan destructivamente.

## Al terminar

1. Corré los tests portados y el type-check; no reportes la tarea como terminada si alguno falla.
2. Si conectaste una UI de cotización, probala manualmente con al menos un caso: una regla `BASE`
   `EXCLUSIVE`, una `VARIABLE` `SUM`, y un cálculo de costo (flota propia u outsourcing) — verificá
   que el desglose y el margen calculado tengan sentido.
3. **Reportá explícitamente qué tuviste que adaptar** respecto a lo documentado en
   `02-motor-reglas-liquidacion.md`: qué tipos cambiaron de forma, qué convenciones de este proyecto
   no calzaban con las del prototipo, y cualquier decisión de mapeo de datos que tomaste en el paso
   3. Esto sirve para detectar discrepancias entre el modelo del prototipo y el de este proyecto, y
   para que quede documentado por qué el código final no es una copia 1:1.

---

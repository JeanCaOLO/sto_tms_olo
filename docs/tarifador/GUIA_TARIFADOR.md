# Tarifador — guía general y operativa

**Actualizada:** 2026-10-05 · **Rama:** `dylan-tarifas`

Qué es el tarifador, cómo calcula, cómo está armado y cómo ponerlo a funcionar en cada modo. Es la
guía de lectura y de arranque. El diseño detallado, las decisiones y el historial viven en
[`ROADMAP.md`](ROADMAP.md) (§8 describe el modelo vigente) y la auditoría de la primera versión en
[`AUDIT_REPORT.md`](AUDIT_REPORT.md).

---

## 1. Qué hace

El tarifador responde una pregunta: **¿cuánto se le paga al transportista por este viaje, y por qué
ese número?**

- **Consume viajes, no los crea.** Toma los viajes **completados** de guía de despacho (tabla
  `routes` de Aurora) con km, paradas, peso, vehículo, conductor, transportista y zona.
- **Calcula** el monto a pagar y deja el **desglose** línea por línea. Para **flota propia**, lo que se
  paga es la **acumulación de gastos de la estructura de costos** (fijos prorrateados + mantenimiento
  por km + combustible); las reglas activas solo suman o restan encima. A un **tercero** se le paga lo
  que dicen las reglas y los tarifarios. Ese total es lo que va a cuentas por pagar.
- **No muestra ganancia al liquidar.** La ganancia o pérdida es de **auditoría**: compara el valor de
  la mercancía del viaje (los pedidos de sus guías de despacho) con esos gastos, y nunca bloquea.
- **Reparte el total entre las casas comerciales** (clientes de los pedidos) según lo que cada una carga
  —hoy por valor de la mercancía; peso y volumen ya están soportados— cuadrando al centavo.
- **Emite una liquidación.** Un viaje tiene **una sola liquidación vigente**. Recalcular es
  *re-liquidar*: anula la vigente (queda en el historial) y emite otra que la reemplaza.
- **Solo se edita lo variable del viaje:** variables personalizadas por viaje (peajes, recolectas,
  atrasos…) y devoluciones. Todo lo demás viene del viaje y es de solo lectura.
- **Los datos maestros son del catálogo** (solo lectura): transportistas, conductores, vehículos,
  zonas y países. El tarifador es dueño únicamente de lo de **cálculo**.

Tres reglas del módulo: cada número se desglosa; cada regla se edita sin programar; y cuando falta
un dato el motor **avisa o bloquea** en vez de emitir un número plausible y falso.

---

## 2. Conceptos

| Concepto | Qué es |
|---|---|
| **País** | Es el del **selector global del TMS** (barra superior); el tarifador no tiene selector propio. Define moneda (la del catálogo), decimales y modo de redondeo, y el umbral de pernocta. Con "Todos los países" las pantallas piden elegir uno. |
| **Zona / grupo de zonas** | La zona es del catálogo (solo lectura). Un **grupo** reúne códigos de zona (`zone_codes`) y sí se edita aquí. |
| **Perfil de cálculo** (`settlementParty`) | Lo que el tarifador sabe de un transportista del catálogo: sus variables, estructura de costos, tarifarios. Se crea la primera vez que se configura algo (`ensurePartyProfile`). |
| **Variable personalizada** | Variable propia de un transportista, con prefijo `custom:` (p. ej. `custom:peajes`). Origen **constante** (mismo valor siempre) o **por viaje** (se carga al liquidar). Peajes, recolectas, bultos, atrasos e incidencias ya no son variables del sistema: son `custom:*`. |
| **Regla de tarifa** | Condición (cuándo aplica) + expresión (cuánto) + etapa + convivencia + prioridad + alcance (país o transportista) + vigencia. |
| **Tarifario** | Planilla de precios indexada por combinaciones (zona × camión → importe). Una regla lo usa con el operador "Tarifa de tabla". |
| **Estructura de costos** | **Única fuente** del costo de operar un viaje de flota propia. Es una tabla de filas de dos clases: *fijos mensuales* (conductor, ayudante, depreciación: se prorratean por día) y *componentes que se repiten* (mantenimiento, llantas: cuestan "costo por km"), más combustible. Cada transportista puede tener la suya; si no, vale la **estructura por defecto del país**. **Es lo que se liquida** (más los ajustes de las reglas). Se carga con una plantilla (§7). |
| **Mercancía del viaje** | Suma de los pedidos de las guías del viaje, por casa comercial (valor, peso, volumen), leída de la vista `tarifas_v_viaje_cargas`. Solo lectura. |
| **Alerta de auditoría** | Umbrales (atención, crítico) que colorean la ganancia/pérdida de auditoría: *valor de la mercancía − gastos operativos*, con % sobre el valor. No bloquea ni pide motivo. Sin valor de pedidos cargado no se inventa un margen. |
| **Reparto por casa comercial** | Cuánto del total corresponde a cada cliente según su parte de la mercancía. Se guarda en la liquidación (base de las proformas por casa). |
| **Plantilla de viaje** | Viaje guardado para repetirlo en el Probador. |
| **Bitácora** | Registro solo-agregar de cambios. La escribe el código de datos (crear, re-liquidar, cambiar estado). |

### Reglas: lo esencial

- **Etapas, en orden fijo:** BASE → VARIABLE → MODIFICADOR → RECARGO → AJUSTE → IMPUESTO. Cada una
  suma sobre la anterior.
- **Operadores:** monto fijo, por cada (×), cada N unidades (÷), porcentaje (siempre con base
  declarada), por escalones (importe fijo del tramo / tarifa del tramo / marginal) y tarifa de tabla.
- **Convivencia:** *suma*, *compite* (gana el mayor importe del grupo) o *exclusiva* (gana una por etapa).
- **Alcance:** una regla de transportista con el **mismo código** que una de país la reemplaza para
  ese transportista; con código nuevo, se suma.
- **Vigencia:** se compara con la **fecha del viaje**, no con hoy. Para subir una tarifa: vencer la
  vieja y abrir la nueva.
- **Orden total y determinista:** etapa → prioridad → alcance → código.
- **Tarifarios:** gana la fila más específica; `*` es comodín; solo claves categóricas. Siempre se
  declara un importe de respaldo.

### Del viaje al motor

| Variable | Sale de |
|---|---|
| `km` | `total_distance` |
| `clientCount` ("Paradas completadas") | `completed_stops` |
| `weightKg` | `total_weight` |
| `durationHours` | fin − inicio real |
| `destZone` | código de la zona destino (el viaje **no trae origen**: reglas y tarifarios van por destino) |
| `truckTypeId` | `vehicles.vehicle_type` |
| `truckWeightTons`, `truckVolumeM3` | capacidad del vehículo |
| `fleetType` | `is_flota_propia` |
| `quotedAt` | fecha del viaje (resuelve vigencia) |
| `custom:*` | variables por viaje cargadas al liquidar + constantes del transportista |

---

## 3. Cómo se calcula un viaje

1. **Derivar variables** del viaje y del perfil del transportista.
2. **Resolver reglas:** condición, alcance, vigencia, exclusividad, orden.
3. **Pipeline por etapas** (cada línea deja su rastro: regla, por qué aplicó, cómo se calculó).
4. **Gastos (flota propia):** estructura del transportista → si no tiene, la estructura por defecto del país. Sin ninguna, se avisa y no se calcula. Esas filas son el comienzo del desglose y de ellas parte el total (un tercero no tiene gastos propios).
5. **Pipeline de reglas** sobre ese comienzo: las reglas ajustan (recolectas, bonos, descuentos).
6. **Auditoría y reparto:** ganancia/pérdida = valor de la mercancía − total pagado; y el total se reparte entre las casas comerciales. Si el liquidador destilda líneas, ambos se recalculan contra el total que realmente se paga.

Salida (`calculateTrip`): `result` con el desglose, `blockingIssues` (impiden emitir), `warnings`,
`notLiquidableReason` (si no es nulo, no se puede emitir) y los campos de variables por viaje a
dibujar. Redondeo y moneda salen de la configuración del país.

---

## 4. Arquitectura

```
 Pantallas (React)            src/pages/liquidaciones | companias | reglas-tarifa
        │
 Borde (async, orquesta)      src/lib/tarifas/*DataSource.ts, tripSettlement.ts, catalogLoader.ts
        │
 Motor (puro, sin I/O)        src/lib/tarifas/ (evaluator, resolver, cost, margin…)
        │
 ORM (interfaz DataSource)    src/lib/tarifas/data/   db()
        ├─ json      → semilla local en el navegador (por defecto)
        └─ postgres  → HTTP  →  backend/tarifas (Lambda)  →  Aurora `tms_olo`
```

| Para… | Usar |
|---|---|
| Calcular un viaje | `tripSettlement.ts` → `calculateTrip(trip, edits, opts)` |
| Viajes (bandeja, detalle) | `tripsDataSource.ts` → `listLiquidableTrips`, `listTrips`, `getTrip`, `listTripGuides`, `listTripReturns` |
| Emitir / re-liquidar / historial | `settlementsDataSource.ts` → `emitSettlement`, `reliquidateSettlement`, `listSettlements`, `listTripSettlements`, `updateSettlementStatus` |
| Transportistas y perfil | `partiesDataSource.ts` → `listCarrierProfiles`, `ensurePartyProfile` |
| Zonas, grupos, países, costos | `localRulesDataSource.ts` |
| Tipos de camión | `vehiclesDataSource.ts` → `listTruckTypes` |
| Esquema (única fuente) | `data/schema.ts` → `npm run tarifas:ddl` y `npm run tarifas:manifest` |

**Una sola fuente de verdad del esquema:** `data/schema.ts`. De ahí salen el DDL de Postgres, la
integridad referencial y el `schema_manifest.json` que el backend usa para validar tablas y columnas.

**Backend `backend/tarifas/`:** Lambda Python (SAM) detrás del authorizer JWT que implementa
`/api/tarifas/*`. Entidades externas: solo `GET` (405 si se escribe). Violación de FK/único: 409.
Permisos: módulo `tarifas` (liquidar y leer) y módulo `tarifas.config` (escribir reglas, tarifarios, costos, variables, margen…): el backend elige el módulo según la tabla. Transacciones en `/api/tarifas/tx` (se repiten ante deadlock). Las lecturas idénticas simultáneas
del navegador se juntan en una sola petición.

**Base de datos (Aurora `tms_olo`)**
- Propias: `tarifas_*` (15 tablas; `tarifas_audit_log` es solo-agregar).
- Vistas: `tarifas_v_viajes` (viaje listo para liquidar, con estado normalizado y `settlement_id`
  vigente) y `tarifas_v_devoluciones`.
- Externas (solo lectura): `routes`, `carriers`, `drivers`, `vehicles`, `zones`, `countries`,
  `dispatch_guides`, `returns`.
- Una liquidación vigente por viaje: índice único parcial `tarifas_settlements (trip_id) WHERE status <> 'Anulado'`.
- Migraciones **ya aplicadas**: `sql/19_tarifas_aurora.sql` (esquema), `20` (reglas usadas en la liquidación), `21` (estructura de costos v2: componentes, parámetros, estructura por país; elimina `tarifas_own_cost_params`), `22` (módulo de permisos `tarifas.config`), `23` (vista `tarifas_v_viaje_cargas`, `cargo_value` y `allocation` en la liquidación; elimina `tarifas_outsourced_cost_rates`).

---

## 5. Pantallas

| Ruta | Para qué |
|---|---|
| `/liquidaciones` | Pestaña **Viajes por liquidar** (acción *Liquidar*) e **Historial** (estado, ver desglose, re-liquidar con motivo). Modal *Liquidar viaje*: datos del viaje en solo lectura, variables por viaje, devoluciones, desglose, emitir. |
| `/tarifas/flota-propia` | **Solo con `tarifas.config`.** Transportistas propios (lista del catálogo, solo lectura): estructura de costos (con plantilla), tarifarios, variables, desactivar/reactivar perfil. |
| `/tarifas/transportistas` | Lo mismo para terceros. Solo `tarifas.config`. |
| `/reglas-tarifa` | **Solo con `tarifas.config`.** Reglas, Zonas (solo lectura + grupos), Tarifarios, Costos (estructura de la flota propia del país), Alerta de auditoría (+ cálculo del país), Plantillas, Resumen, Probador, Bitácora. |

**Dos niveles de usuario.** Quien solo liquida (`tarifas`) ve *Liquidaciones* en modo simple: datos del viaje, variables por viaje, total y Emitir, con un "por qué este total" plegado. Quien configura (`tarifas.config`, los roles administradores lo tienen por código) ve además las pantallas de configuración y la vista extendida del desglose. Cada línea del desglose dice su origen (regla del país, regla del transportista —y si reemplaza a la del país—, gasto de la estructura de costos) y las reglas del catálogo traen un enlace para abrirlas.

El **Probador** calcula "desde un viaje" completado (mismo camino que la liquidación) o con un "viaje
libre" armado a mano. No emite nada.

---

## 6. Cómo ponerlo a funcionar

El módulo tiene tres modos. Se elige con `VITE_TARIFAS_DATASOURCE` en `.env.local` (o `.env`).

### Modo A — Local (`json`, por defecto)

Datos de demostración en el navegador. No necesita red, base ni backend.

1. `npm install` y `npm run dev` (http://localhost:3000).
2. Sin `VITE_TARIFAS_DATASOURCE` (o `=json`). Los viajes, transportistas y zonas vienen de la semilla.

Sirve para desarrollar la interfaz y probar reglas. Los tests corren siempre en este modo.

### Modo B — Aurora desde tu máquina (`postgres` + Lambda local)

Es el modo para probar con datos reales sin desplegar nada.

1. **Túnel SSM a Aurora** (solo L–V 04:45–17:00 hora de Costa Rica, Aurora está apagado fuera de
   horario): `powershell -ExecutionPolicy Bypass -File scripts/tunel-aurora.ps1` → `localhost:15432`.
   Requisitos y detalle: [`docs/guides/tunel-ssm-a-rds.md`](../guides/tunel-ssm-a-rds.md).
2. **`.env.local`:** `TMS_DB_HOST=localhost`, `TMS_DB_PORT=15432`, `TMS_DB_NAME=tms_olo`, `TMS_DB_USER`,
   `TMS_DB_PASSWORD`, `JWT_SECRET`, y `VITE_TARIFAS_DATASOURCE=postgres`. (Las credenciales no se
   versionan.)
3. **API local:** `npm run api:local` → Lambdas en `:4000` (incluye `tarifas`).
4. **Front:** `npm run dev`. El proxy de Vite envía `/api/*` a `:4000`. Iniciar sesión con un usuario
   del TMS (`scripts/create-dev-user.mjs` crea uno).
5. Si cambió `data/schema.ts`: `npm run tarifas:manifest` (regenera `backend/tarifas/src/schema_manifest.json`).

> La API local abre una conexión por petición a través del túnel (~0,9 s de conexión y ~0,1 s por
> consulta), así que las pantallas tardan varios segundos. En Lambda dentro de la VPC la conexión se
> reutiliza y la latencia es de milisegundos. No es un indicador del rendimiento real.

### Modo C — Aurora desplegado (producción / sandbox)

Lo despliega **solo Intelix**.

1. Esquema: `node --env-file=.env.local scripts/run-migration.mjs sql/19_tarifas_aurora.sql --execute`
   (primero sin `--execute` para el dry-run, que hace ROLLBACK). Ya aplicada en Aurora; el runner la
   registra en `schema_migrations` y no la reaplica.
2. Backend: `npm run tarifas:manifest`, luego `cd backend/tarifas && sam build && sam deploy --config-env dev`.
3. Front: build con `VITE_TARIFAS_DATASOURCE=postgres`. `VITE_TARIFAS_API_URL` es opcional
   (por defecto `${VITE_API_BASE}/api`). El cliente envía el JWT de `tms_session` solo.

Guía de despliegue general: [`docs/guides/despliegue-sandbox.md`](../guides/despliegue-sandbox.md).

---

## 7. Puesta a punto de un país

El liquidador no inventa datos de negocio. Para liquidar viajes de un país hay que cargar, en orden:

1. **Catálogo:** el país con moneda, y las zonas con **código** (una zona sin `code` bloquea sus
   viajes: "la zona de destino no existe").
2. **Reglas de Tarifa → Política de margen → Cálculo del país:** decimales, modo de redondeo y umbral
   de pernocta (la migración sembró 2, HALF_UP y 24 h para Costa Rica).
3. **Flota propia:** la **estructura de costos**. Descargue la plantilla en *Reglas de Tarifa → Costos*
   (país) o en *Flota propia → Estructura de costos* (un transportista), llénela, súbala, revise la vista
   previa (errores por hoja y fila, totales por camión) y guarde. Sin estructura el liquidador avisa y no calcula.
   La plantilla es un libro de 3 hojas:
   - **Variables** (`componente, tipo_camion, frecuencia, cantidad_frecuencia, costo, unidad_componente`): mantenimiento y similares. `frecuencia` = `km` (cada N km), `year` (cada N años) o `month` (cada N meses); el costo por km se calcula solo: `km`: costo ÷ N · `year`: costo ÷ (N × km por año) · `month`: costo ÷ (N × km por año ÷ 12).
   - **Fijos** (`concepto, monto_mensual, aplica_a, tipo_camion, valor_vehiculo, vida_meses`): `aplica_a` = conductor, ayudante, depreciacion u otros. La depreciación puede traer valor y vida útil en vez del monto. La fila del ayudante solo cuenta si el viaje declara la variable `custom:con_ayudante` > 0.
   - **Parámetros** (`clave, valor`): `dias_operativos`, `km_anual`, `precio_combustible` y `rendimiento_km_litro:<tipo de camión>`.
   `tipo_camion` vacío = aplica a todos; si no, debe coincidir con `vehicles.vehicle_type` del catálogo.
4. **Terceros:** no tienen costos propios; se les paga por **reglas y tarifarios** (§2). Un tarifario puede
   tener columnas de rango para km, peso, paradas u horas (`0..100`, `101..300`, `301..`) y variables
   personalizadas de la compañía en la clave.
5. **Tarifarios y reglas** con clave por **`destZone`** (el viaje no trae origen).
6. **Variables personalizadas** por transportista (`custom:peajes`, `custom:recolectas`…), por viaje o
   constantes.
7. **Probar** en el Probador "desde un viaje" y luego liquidar uno real.

Hay planillas de ejemplo en `docs/tarifador/demo-data/` (estructura de costos de flota, tarifarios).

---

## 8. Uso diario

1. *Liquidaciones → Viajes por liquidar* (viajes completados sin liquidación vigente).
2. **Liquidar:** completar las variables por viaje y las devoluciones; revisar el desglose; destildar
   líneas si corresponde; emitir. Si hay `blockingIssues` o `notLiquidableReason`, no se puede emitir.
3. **Historial:** cambiar estado (la aprobación se rechaza si hay pérdida y la política bloquea) y
   **re-liquidar** (motivo obligatorio): anula la vigente y emite una nueva.
4. Toda acción queda en la bitácora.

---

## 9. Verificación

| Qué | Comando |
|---|---|
| Tests del módulo | `npx vitest run src/lib/tarifas` (corren en modo `json` aunque `.env.local` diga `postgres`). Incluye `costStructureCR.test.ts`: reproduce la planilla de Costa Rica (costo fijo diario 57,525.69 y 48.8118 por km para el camión de 3 a 4.5 t). |
| Todos los tests | `npx vitest run` |
| Tipos | `npx tsc --noEmit --project tsconfig.app.json` |
| Lint | `node node_modules/eslint/bin/eslint.js src/pages/liquidaciones src/pages/companias src/pages/reglas-tarifa` |
| Backend | `cd backend && python -m pytest` (requiere `pip install -r requirements-dev.txt`) |
| Cargar la estructura de Costa Rica en Aurora (escribe de verdad) | `TARIFAS_CR_LOAD=1 npx vitest run src/lib/tarifas/__tests__/aurora.cr-load.test.ts`: lee los datos de `.test/archivos_para_estructura_de_costos_CR/` (carpeta personal, fuera de git), arma la plantilla, la lee con el mismo parser de la pantalla, la aplica y liquida un viaje de flota propia comparando con la planilla; la liquidación de verificación se anula. Todo en una transacción que solo se confirma si todo pasa. |
| Flujo completo contra Aurora (revierte todo) | Con el túnel abierto: `TARIFAS_AURORA_E2E=1 npx vitest run src/lib/tarifas/__tests__/aurora.e2e.test.ts` (~30 s). Corre calcular, emitir, rechazar una segunda vigente, re-liquidar y cambiar estado dentro de una transacción que termina en ROLLBACK; los costos y la regla que usa son de prueba y no quedan en la base. |
| Build | `npx vite build` |
| Esquema / manifiesto | `npm run tarifas:ddl`, `npm run tarifas:manifest` |

---

### Variables de entorno del backend (opcionales)

| Variable | Efecto |
|---|---|
| `TMS_DB_SSL_CA` | Ruta al bundle CA de RDS. Si está, la conexión a Aurora valida cadena y nombre del servidor; si no, se conecta sin validar (comportamiento anterior). Aplica a todos los backends que usan `tms_common`. |

`POST /api/tarifas/tx` repite la transacción hasta 2 veces ante deadlock (`40P01`) o fallo de
serialización (`40001`).

---

## 10. Problemas frecuentes

| Síntoma | Causa y salida |
|---|---|
| "No hay estructura de costos para la flota propia de este país" | Falta cargar la estructura de costos (§7.3). |
| No veo Reglas de Tarifa / Flota en el menú, o 403 al guardar configuración | Su rol no tiene el permiso `tarifas.config` (Configuración → Roles). |
| "Elija un país en el selector de la parte superior" | El selector global está en "Todos los países". |
| Un viaje de flota propia no calcula costo por camión | Revise que `tipo_camion` de la plantilla coincida con el tipo de vehículo del catálogo (aparece como aviso en la vista previa). |
| "La zona de destino no existe" | La zona del viaje no tiene `code` en el catálogo. |
| Páginas en blanco o 401 en `/api/tarifas` | Sin sesión, o `api:local` no está arriba. |
| `ECONNREFUSED 15432` / timeout | El túnel no está abierto, o Aurora está apagado (fuera de L–V 04:45–17:00 CR). |
| `Failed to execute 'fetch' … Illegal invocation` | Corregido (2026-10-05): el driver HTTP llamaba a `fetch` con otro `this`. |
| 405 al guardar | Se intentó escribir una entidad externa (catálogo). Se edita en Catálogos. |
| 409 al guardar | Clave duplicada o referencia en uso. |
| El manifiesto no coincide | Correr `npm run tarifas:manifest` y redesplegar el backend. |
| Tests fallan solo en tu máquina | Revisa que `vitest.config.ts` fije `VITE_TARIFAS_DATASOURCE=json`. |

---

## 11. Pendientes y decisiones abiertas

El estado vivo (qué falta, en orden) está en [`ROADMAP.md`](ROADMAP.md) §8.8. Decisiones sin cerrar:
multi-tenancy (las `tarifas_*` no tienen `organization_id`), si la flota propia necesita un costo
distinto por vehículo, y qué hacer con un viaje que vuelve de completado a otro estado teniendo una
liquidación vigente.

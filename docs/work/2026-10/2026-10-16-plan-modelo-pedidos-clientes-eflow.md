# Plan: modelo de pedidos, clientes y maestros alineado con EFLOW

> **Fecha:** 2026-10-16 · **Estado:** plan aprobado, **nada aplicado todavía** en Aurora ni en el código.
> Reemplaza las propuestas de §3 y §5 de [`mapeo-pedidos-eflow-orders.md`](../../reference/mapeo-pedidos-eflow-orders.md)
> donde difieran. Decisiones registradas en `aidlc/spaces/default/memory/project.md` (DECIDED del 2026-10-16).

## Decisiones

1. **El OMS no tiene esquema propio.** Todo va en `public`. La tabla de pedidos del OMS es `public.orders`: el OMS
   escribe ahí prioridad, score y situación, y Planificación lee de ahí. `sql/oms_pedidos.sql` (`oms.pedidos`) queda
   descartado.
2. **Una sola tabla de clientes destino** (`final_customers`) con `customer_type` = `TIENDA` | `MAYOREO`. No se separan
   tiendas y mayoreo en dos tablas ni se renombran.
3. **`wms_expediciones` no se usará más.** Sus consumidores pasan a `orders` (ver impacto).
4. **Los pedidos actuales de `orders` se rellenan con datos mock** coherentes con el nuevo modelo.

## Equivalencias EFLOW → TMS

| EFLOW | TMS | Llave EFLOW |
|---|---|---|
| `ALMACENES` | `warehouses` | `IDALMACEN` |
| `COMPANIA` | `customers` | `IDCOMPANIA` |
| `SUCURSAL` | `branches` (**nueva**) | `IDCOMPANIA + IDSUCURSAL` |
| `CLIENTES` | `final_customers` (tiendas + mayoreo) | `IDCOMPANIA + IDCLIENTE` |
| `EXPEDICIONESCABECERA` | `orders` | `IDALMACEN + IDCOMPANIA + IDSUCURSAL + IDEXPEDICION` |
| `EXPEDICIONESDETALLE` | `order_items` | la anterior + `IDEXPEDICIONLINEA` |

**Criterio:** se conservan los `uuid` como PK (cambiarlos rompe decenas de FKs). Cada tabla guarda además la llave
de EFLOW como texto con el mismo formato (ceros a la izquierda) y con `UNIQUE`. En `orders` se guardan **las dos
cosas**: las FKs `uuid` (para joins y embeds de la API) y las 4 partes de la llave EFLOW en texto (para el UPSERT
idempotente del OMS y para escribir de vuelta al WMS sin traducir).

## Nomenclatura (estándar OLTP INTELIX, alcance acotado)

Fuente: `estandares-base-de-datos-oltp-intelix.md` y `estandares-base-de-datos.md` del repo
`grupomayoreo/template_base` (`templates/docs/`). El estándar se aplica **solo a las tablas que se crean o modifican
en este plan** (`warehouses`, `customers`, `branches`, `final_customers`, `orders`, `order_items`); el resto de
`tms_olo` no se toca.

- **Nombres de tabla:** se mantiene la convención actual (inglés, plural, sin `tbl_`), también para la tabla nueva
  `branches`, para no dejar una tabla distinta entre ~60. Pasar a `tbl_` + singular queda como deuda para una
  migración general decidida con arquitectura.
- **Columnas nuevas:** minúsculas, `snake_case`, ASCII (sin acentos ni ñ), inglés.
- **Restricciones, índices y triggers** de esas 6 tablas, nuevos **y existentes** (los existentes se renombran; no
  hay código que los referencie por nombre, verificado el 2026-10-16). Entidad en singular:

  | Tipo | Formato | Ejemplos |
  |---|---|---|
  | Primary key | `pk_{entidad}` | `pk_order`, `pk_branch` (hoy `orders_pkey`…) |
  | Foreign key | `fk_{entidad}_{referida}` | `fk_order_warehouse`, `fk_order_branch`, `fk_order_final_customer`, `fk_branch_customer` |
  | Unique | `uq_{entidad}_{campos}` | `uq_order_eflow_key`, `uq_customer_country_external_code` |
  | Check | `ck_{entidad}_{regla}` | `ck_final_customer_customer_type` |
  | Índice / índice único | `idx_{entidad}_{campos}` / `uidx_...` | `idx_order_warehouse`, `uidx_branch_customer_code`, `uidx_order_item_line` |
  | Trigger | `trg_{proposito}_{entidad}` | `trg_audit_branch` |

- **Scripts `sql/NN_*.sql`:** cada bloque con su `-- ROLLBACK` comentado y una consulta de validación que devuelve
  `OK`/`FALTA` por objeto. Ejecutar en ambientes compartidos requiere aprobación humana.

## Cambios por tabla

> **Ajuste al preparar el paso 1 (`sql/40`):** `code` NO se reemplaza por el código de EFLOW (scripts y
> migraciones buscan por `'EPA'`, `'COFERSA'`, `'OLO-CR'`). El código va en `external_code` y la instancia de EFLOW
> en `source_system` (`EFLOW_OLO`, `EFLOW_FEBECA`, `EFLOW_BEVAL`), porque la llave de EFLOW es única **por
> instancia**, no por país: Venezuela tiene dos EFLOW. Único: `(source_system, external_code)`.

### `warehouses`
- `source_system` + `external_code` (= `IDALMACEN`); `code` y el `id` no cambian. Mantener `UNIQUE (country_id, code)`.
- `timezone` obligatoria por almacén (`America/Costa_Rica`, `America/Caracas`).
- Opcionales: `category` (`IDCATEGORIA`), `city`, `contact`, `phone`, `email`.

### `customers` (compañía)
- `source_system` + `external_code varchar(4)` (= `IDCOMPANIA`), único por `(source_system, external_code)`.
- Ojo: en EFLOW almacén–compañía es N:M (`ALMACENCOMPANIA`); hoy `customers.warehouse_id` es 1:N. Alcanza con un
  almacén por país; si no, tabla puente `warehouse_customers`.

### `branches` (nueva)
`id`, `customer_id` → `customers`, `external_code varchar(4)` (`IDSUCURSAL`, `UNIQUE (customer_id, external_code)`),
`name`, `short_name`, `branch_type` (`TIPOSUCURSAL`), `tax_id`, `erp_reference`, `country`, `province`, `city`,
`address`, `email`, `phone`, `status` (`SITUACION`), `created_at`, `updated_at`, trigger de auditoría.

### `final_customers` (tiendas + mayoreo)
- `customer_type text NOT NULL` con `ck_final_customer_customer_type` (`TIENDA` | `MAYOREO`). Se creó como `type` en `sql/41` y se renombró en `sql/42` (nombre genérico, palabra reservada en varios motores e inconsistente con `branches.branch_type`). Tiendas EPA → `TIENDA`, resto → `MAYOREO`.
- `short_name`, `contact`, `phone`, `mobile`, `email`, `erp_reference`, `wms_client_type` (`TPCLIE`/`TPCLSE`/`TPCLSI`).
- Dirección de `CLIENTES` → `addresses` + `delivery_points` (`is_default`), como hoy.
- Datos propios de tienda (`manager_name`, `opening_hours`, `capacity`, `area_m2`) solo si se usan.

### `orders`
- **Llave:** reemplazar `UNIQUE (organization_id, order_number)` por `UNIQUE (eflow_id_almacen, eflow_id_compania,
  eflow_id_sucursal, eflow_id_expedicion)` (texto). `IDEXPEDICION` sola se repite entre sucursales.
- **FKs nuevas:** `warehouse_id`, `branch_id`, `final_customer_id` (todas `NOT NULL` tras el backfill mock).
  `delivery_point_id` ya existe (nulable). `store_id` → nulable y luego se elimina **de `orders`**.
- **Llave EFLOW en texto:** `eflow_id_almacen`, `eflow_id_compania`, `eflow_id_sucursal`, `eflow_id_expedicion`,
  `eflow_id_cliente`.
- **Tipos:** `priority` `varchar` → `integer`; `delivery_address` acepta nulos. `total_volume` se queda en
  `numeric(10,2)` en esta ronda (ver Pendiente: lo usan vistas de tarifas).
- **Datos del WMS:** `wms_status` (`TPEXES`), `wms_situation` (`TPEXSI`), `order_type` (`TPEXPE`),
  `generated_at`, `closed_at`, `planned_dispatch_at`, `dock`, `drop_code` (`BAJADA`), `wms_trip_number`,
  `emergency`, `destination_warehouse_id`, `erp_document`, `wms_notes` (`OBSERVACIONESEXPEDICION`, separado de
  `notes`), `wms_created_at`, `wms_modified_at`.
- **Resultado del OMS:** `oms_score`, `handoff_status` (`disparo_pendiente` / `completado`), `prioritization_run_id`.
- `status` sigue siendo el estado **del TMS**.
- Fechas de EFLOW (`datetime` sin zona) → `timestamptz` con la `timezone` del almacén.

### `order_items`
`line_number` + `UNIQUE (order_id, line_number)`, `product_name` nulable, `presentation`, `quantity_prepared`,
`quantity_loaded`, `quantity_cancelled`, `lot`, `expiry_date`, `wms_status`, `wms_situation`, `notes`;
`volume` → `numeric(12,4)`.

### `stores`
Deja de ser destino (las tiendas viven en `final_customers`). **Se mantiene como tabla de orígenes** (`CD-CR`) porque
`routes.store_id` la usa y de ahí dependen Liquidaciones y Tarifas. Mover el origen de rutas a `warehouses` queda
para otra ronda.

## Impacto en el código

**Se rompe si no se ajusta en el mismo paso:**

| Paso | Qué se rompe | Archivo |
|---|---|---|
| `priority` → `integer` | Editar un pedido falla: el modal guarda `'normal'`/`'high'`/`'low'` en una columna entera | `src/pages/pedidos/components/OrderEditModal.tsx` |
| `priority` → `integer` | El badge de prioridad muestra todo como "normal" | `src/pages/pedidos/page.tsx`, `OrderDetailModal.tsx` |
| FKs `NOT NULL` en `orders` | Los inserts sin almacén/sucursal/cliente/llave EFLOW fallan | `scripts/generar-viajes-automatico.mjs`, `scripts/seed-guias-despacho-demo.mjs`, `src/pages/seed/page.tsx` |
| Quitar `orders.store_id` | El listado de pedidos falla (embed `store:stores(name, code)`) | `src/pages/pedidos/page.tsx` |
| Quitar `orders.store_id` | Tipos y mocks con `store_id` (no rompen la BD, sí `tsc` si se quita del tipo) | `src/pages/planificacion/types.ts`, `fallback-pedidos.ts`, `eflow-mappers.ts`, tests |
| Retirar `wms_expediciones` (si se borra) | Planificación del backend original, scripts de viajes y seeds | `backend/planning/src/*`, `scripts/lib/plan-viajes.mjs`, `scripts/seed-wms-expediciones.mjs`, `scripts/backfill-wms-fechas.mjs` |

**Hay que migrar (hoy no se rompe, pero queda leyendo/escribiendo lo viejo):**

- **Cola del OMS** lee `wms_expediciones` y, si no hay datos, cae al mock sin error → pasar a `orders`
  (`src/pages/oms/api/omsApi.ts`).
- **Handoff del OMS** hace UPSERT en `oms.pedidos` (solo en modo `live`) → UPSERT en `orders` por la llave EFLOW
  (`backend/oms/src/handoff_pedidos.py`, `models.py`).
- **Planificación (`backend-planif`)**: compatible. Filtra por `c.warehouse_id` → pasar a `o.warehouse_id`; filtra
  `o.status IN ('assigned','entregado')` → alinear con `wms_situation = 'GENE'` / lo que deje el OMS
  (`backend-planif/src/adapters/outbound/aurora/sql.py`). El cambio de `priority` a entero arregla un desajuste
  (el modelo ya la espera `int`).
- **Mapa de relaciones de la API (3 copias)** y permisos por módulo: registrar `branches` y las FKs nuevas, si no la
  API rechaza la tabla y los embeds (`server/tms-relations.mjs`, `backend/data/src/relations.py`,
  `backend-planif/src/domain/data/relations.py`, `table_modules.py` ×2, `sql/16_auditoria_sistema.sql`,
  `src/__tests__/db-connectivity.test.ts`).
- **Pantalla Tiendas** (`src/pages/tiendas`): hoy administra `stores`; las tiendas pasan a `final_customers`.

**No se ve afectado:** Guías, Devoluciones, Reportes, Tracking y Dashboard (pedidos) usan solo `id`,
`order_number`, `order_date`, `status` y el embed de `customers`. Liquidaciones, Tarifas y el Dashboard (rutas) usan
`routes.store_id`, que **no** se toca en esta ronda.

**Documentación que queda desactualizada** (artefactos AI-DLC del intent `260826-modulo-oms`, se corrigen al
re-correr domain-design): `requirements.md`, `stories.md`, `domain-design/components.md` y `decisions.md`,
`units-generation/unit-of-work.md`, `delivery-planning/bolt-plan.md` (hablan de "esquema OMS de `logistica_olo`").

## Orden de ejecución

Cada paso es un `sql/NN_*.sql` con prueba en seco (`ROLLBACK`) y conteos, más el ajuste de código del mismo paso.

1. ✅ **Aplicado 2026-10-16** (`sql/40`). Catálogos: `warehouses`/`customers` con `source_system` + `external_code`,
   `timezone` obligatoria, `branches` creada con las 8 sucursales reales de EPA y Cofersa.
2. ✅ **Aplicado 2026-10-16** (`sql/41` + `scripts/cargar-clientes-eflow.py`). `final_customers` con `customer_type` (`sql/42`)
   (`TIENDA` | `MAYOREO`) y datos de EFLOW; tiendas EPA recodificadas `T002` → `002`. Carga del export de `CLIENTES`:
   22.565 clientes nuevos + 1.582 actualizados (EPA 9.711 = 8 tiendas + 9.703 mayoreo; Cofersa 14.437), cada uno con
   punto de entrega principal. Solo 1.635 puntos tienen coordenadas (y por tanto zona); ~22.300 direcciones quedan
   `PENDING` de geocodificar.
3. ✅ **Aplicado 2026-10-16** (`sql/43`). `orders` con `warehouse_id`, `branch_id`, `final_customer_id`
   (obligatorias), llave EFLOW en texto (`uq_order_eflow_key`, reemplaza `UNIQUE (organization_id, order_number)`),
   datos del WMS, resultado del OMS y `priority` entero. **Cambios respecto a la lista de arriba:** sin
   `wms_trip_number` (Planificación la retiró a propósito en `sql/20`, ADR-0004) y sin `dock` (`MUELLEEXPEDICION`,
   descartado en el mapeo del OMS). Backfill de los 1.234 pedidos: EPA con su tienda real (582); Cofersa 56 con su
   cliente real y 596 con un cliente de prueba; sucursal 0001; almacén y expedición EFLOW quedan `NULL` (no son
   pedidos reales de EFLOW). Código: pantalla de Pedidos (prioridad numérica) y mapa de relaciones de la API
   (`server/tms-relations.mjs`, `backend/data`). **No** se ajustaron los scripts de otros equipos: se les notificó.
4. ✅ **Aplicado 2026-10-16** (`sql/44`). `order_items` = `EXPEDICIONESDETALLE`: `line_number` obligatorio y único por
   pedido (`IDEXPEDICIONLINEA`), presentación, lote, cantidades preparada/cargada/anulada, caducidad, estado y
   situación del WMS, observaciones; `product_name` acepta `NULL`; `volume` → `numeric(12,4)`.
   - **Ojo antes de ingerir pedidos reales:** la llave única de `orders` incluye `eflow_id_almacen`, y los códigos
     `IDALMACEN` todavía no están cargados en `warehouses`. Mientras llegue `NULL`, la llave no detecta duplicados.
5. 🟡 **Parcial 2026-10-16.** Hecho (código, rama `oms`): la Cola del OMS lee `orders` con sus maestros
   (`src/pages/oms/api/omsApi.ts`; los módulos del OMS pueden leer `orders` en `backend/data/src/table_modules.py`);
   el handoff del OMS actualiza `orders` por la llave EFLOW (`backend/oms/src/handoff_pedidos.py`; la llave EFLOW pasa
   a `str` en `models.py`; tests 144/144); la pantalla de Pedidos muestra cliente destino + sucursal en vez de tienda.
   **Pendiente:** `sql/45` (quitar `orders.store_id`) está escrito y probado en seco, **sin aplicar**: `main` todavía
   lee `orders.store_id` en Pedidos; aplicarlo cuando esta rama llegue a `main` y los scripts de otros equipos dejen de
   mandarlo. Planificación pasa a `o.warehouse_id` / `wms_situation`: lo ajusta su equipo (notificado en `.agents/CANAL.md`).
6. Retirar `wms_expediciones` (primero los consumidores, después la tabla). Regenerar el diccionario.

## Pendiente

- Definiciones de EFLOW de `COMPANIA`, `ALMACENCOMPANIA`, `TIPOSINTEGRACION` (valores de `TPCLIE`/`TPCLSE`, para
  saber si el tipo tienda/mayoreo sale de EFLOW) y `ARTICULOSGESTION` (nombre, peso y volumen del artículo).
- ~~Significado de cada sucursal~~ Resuelto con el export de `SUCURSAL` (2026-10-16): EPA 0001 FERRETERIA EPA,
  0002 Venta Corporativa, 0003 Sobrante, 0004 Cross Nacional; Cofersa 0001 COFERSA, 0002 Sobrantes, 0003 Garantías,
  0004 Crossdocking. Cargadas en `sql/40`.
- **Paso 2 — códigos de las tiendas EPA no coinciden:** en EFLOW `CLIENTES` las tiendas EPA son `IDCLIENTE` `001`…`008`
  (`T002 CURRI`, `T004 BELEN`…), pero `final_customers` y el staging las guardan como `T002`…`T008`. Además existen
  `001` (TIENDA 001 CD), `007` (T007 LIBERIA) y `0000492` (VENTA GENERAL), que no están en Aurora. Hay que re-codificarlas
  al código de EFLOW al cargar `final_customers`.
- **Paso 2 — volumen:** el export de `CLIENTES` (2026-10-16) trae 24.147 clientes (Cofersa 14.436, EPA 9.711); en Aurora
  hay 1.577 de Cofersa (1.576 coinciden) y 6 de EPA. Decidir si se cargan todos o solo los `TPCLSI = DISP`
  (Cofersa 4.140, EPA 9.252). Varios clientes de EPA parecen proveedores (BAMERICA, TESA TAPE…).
- **Códigos de almacén (`IDALMACEN`) y de Beval:** siguen sin dato.
- **Pendiente con el equipo de tarifas (2026-10-16):** cambiar `orders.total_volume` de `numeric(10,2)` a
  `numeric(12,4)`. Las vistas `tarifas_v_viaje_cargas` (`sql/23`) y `tarifas_v_viaje_pedidos` (`sql/24`) leen esa
  columna y PostgreSQL no permite cambiarle el tipo mientras existan, así que el cambio exige borrar y recrear esas dos
  vistas en la misma migración, coordinado con su equipo (las vistas son suyas). Fuera del paso 3.
- **Numeración:** `sql/40` es de este plan; avisar al equipo de tarifas (van por la 39) que su próxima sea la 41.
- ¿`backend/planning` (backend original) sigue desplegado? Si sí, hay que migrarlo antes de borrar `wms_expediciones`.

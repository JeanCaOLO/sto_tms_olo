# API eFlow QA vs consulta SQL: comparación y faltantes

> Prueba del 2026-11-20, solo lectura (GET; el login solo emite el token). Complementa
> [api-eprac-v1-vs-necesidades.md](api-eprac-v1-vs-necesidades.md).

## En corto

- **No se pudo comparar fila por fila.** El API lee la base **`EFLOW_OLO_QA_SAP`** (servidor `10.17.224.224`), y nuestro
  usuario SQL (`intelixsql`) **no tiene acceso** a ese servidor (error de login 18456).
- La base SQL a la que sí llegamos (`10.17.224.20`, `EFLOW_OLO`) **es otra**: ninguno de los 21 pedidos del API existe
  ahí, y en la misma ventana tiene 336 pedidos DISP/DISP.
- **Lo que sí se comparó, campo por campo:** el API devuelve **15 de las 56 columnas** de `EXPEDICIONESCABECERA`, y nada
  de detalle, clientes ni artículos. Con eso **Planificación no puede armar viajes**.

## 1. Lo que se ejecutó

| Fuente | Consulta | Resultado |
|---|---|---|
| API QA `10.17.224.224:87` | `GET /api/TestConexion` | OK: base `EFLOW_OLO_QA_SAP`, v3.2.1.1 |
| API QA | `GET /Expediciones/ObtenerExpediciones` DISP/DISP, ±30 días | 21 pedidos: 0109 (15, prioridad 5) y 0029 (6, prioridad 0); 18 clientes |
| SQL `10.17.224.20` `EFLOW_OLO` | `EXPEDICIONESCABECERA` DISP/DISP, misma ventana | 336 pedidos |
| SQL `10.17.224.20` | Buscar las 21 llaves del API (compañía+almacén+sucursal+expedición) | 0 encontradas |
| SQL `10.17.224.224` | Login con `intelixsql` | Rechazado |

Datos de la muestra del API: los 21 tienen fecha planificada **pasada** (del 22-oct al 13-nov), muelle `PURT12`, sin
viaje, sin bajada y sin observaciones. Parecen datos de prueba de QA, no operación real.

## 2. Campos: SQL que usa hoy el TMS vs API

Columnas que leen la ingesta (`backend/planning/src/ingest_orders.py`, `ingest_items.py`) y el OMS:

| Dato | SQL (hoy) | API | Para qué lo usamos |
|---|---|---|---|
| Llave (compañía, almacén, sucursal, expedición) | ✅ | ✅ | Identificar el pedido |
| Cliente (`IDCLIENTE`) | ✅ | ✅ | Destino |
| Estado / situación (`TPEXES`/`TPEXSI`) | ✅ | ✅ | Cola DISP/DISP |
| Prioridad | ✅ | ✅ | OMS |
| Fecha planificada | ✅ | ✅ | T-1 y día de despacho |
| Nº de viaje WMH | ✅ | ✅ | Saber si ya tiene viaje |
| Observaciones | ✅ | ✅ | Regla de cliente retira (OMS) |
| Muelle, bajada, fecha de despacho | — | ✅ | (extra, no se usa hoy) |
| **Ruta** (`RUTA`) | ✅ | ❌ | Agrupar por ruta en Planificación |
| **Peso total** (`PESOPEDIDO_TOTAL`) | ✅ | ❌ | Capacidad del camión |
| **Volumen total** (`CUBICAJEPEDIDO_TOTAL`) | ✅ | ❌ | Capacidad del camión |
| **Costo total** (`COSTO_TOTAL`) | ✅ | ❌ | Valor de la carga |
| **Fecha de cierre** (`FECHACIERRE`) | ✅ (filtro `IS NULL`) | ❌ (no se sabe si filtra) | Excluir pedidos cerrados |
| **Tipo de expedición** (`TPEXPE`) | ✅ | ❌ | Clasificar el pedido |
| **Cantidad de líneas** | ✅ (de `EXPEDICIONESDETALLE`) | ❌ | Tamaño del pedido |
| **Dirección y coordenadas** (`CLIENTES.DIRECCIONLARGA/LATITUD/LONGITUD`) | ✅ | ❌ | **Ruteo en mapa** |
| **Líneas del pedido** (`EXPEDICIONESDETALLE` + `ARTICULOSGESTION`: artículo, nombre, unidades, peso, volumen, lote, caducidad) | ✅ | ❌ | Detalle del pedido, carga y devoluciones |

## 3. Lo que faltaría

### Para poder comparar (validar que el API dice lo mismo que la tabla)

1. **Acceso SQL de solo lectura a `10.17.224.224` / `EFLOW_OLO_QA_SAP`** para `intelixsql` (o un usuario de lectura).
   Con eso se corre la misma consulta y se comparan las 21 filas campo por campo.
2. **O el API apuntando a la base que lee el TMS** (`10.17.224.20` / `EFLOW_OLO`), para comparar contra la operación real.
3. Confirmar con ePRAC **qué fecha filtra** `FechaInicio/FechaFinal` (¿expedición o planificada?) y si excluye los
   pedidos con `FECHACIERRE` o con viaje asignado.

### Para que el API reemplace la consulta SQL (pedido a ePRAC)

1. En `ObtenerExpediciones` agregar: `ruta`, `pesoPedidoTotal`, `cubicajePedidoTotal`, `costoTotal`, `fechaCierre`,
   `tipoExpedicion` y `cantidadLineas`.
2. Dirección y coordenadas del cliente destino (`direccionLarga`, `latitud`, `longitud`), en la misma respuesta o en un
   endpoint de clientes.
3. Un endpoint de **detalle por expedición** (líneas con artículo, nombre, unidades pedidas/preparadas/cargadas/anuladas,
   peso, volumen, lote y caducidad).
4. Lectura **por llave** (una expedición o una lista de llaves), para refrescar pedidos puntuales (salientes, replan).
5. Que los textos lleguen en UTF-8. Por SQL, eFlow guarda en cp1252 y hay que convertirlos.

## Mientras tanto

- La lectura sigue por SQL (`10.17.224.20`); el API se usa solo donde ya alcanza (prioridad, viaje y bajada, cuando se
  prueben las escrituras).
- El cliente del API está en la rama `integracion-eflow-qa`, con escrituras apagadas (`EFLOW_API_WRITE=off`).

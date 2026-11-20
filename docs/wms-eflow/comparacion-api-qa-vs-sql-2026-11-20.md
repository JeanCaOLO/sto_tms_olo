# API eFlow QA (ePRAC) vs consulta SQL: comparación y faltantes

> Prueba del 2026-11-20, solo lectura (GET y SELECT; el login del API solo emite el token). Complementa
> [api-eprac-v1-vs-necesidades.md](api-eprac-v1-vs-necesidades.md).

## En corto

- **Lo que el API trae es correcto: los 21 pedidos coinciden con SQL, campo por campo.** El API de ePRAC en
  `10.17.224.224:87` lee la base **QA** `EFLOW_OLO_QA_SAP` (servidor `10.17.224.224`).
- **No es producción.** La base que lee hoy el TMS (`EFLOW_OLO` en `10.17.224.20`) no tiene ninguno de esos 21 pedidos y
  tiene 339 DISP/DISP en la misma ventana. No hay, por ahora, un API de ePRAC apuntando a producción.
- **El API trae poco:** 15 de las 56 columnas de `EXPEDICIONESCABECERA` y nada de detalle, clientes ni artículos. Con
  eso **Planificación no puede armar viajes**.

## 1. Comparación fila por fila (API vs `EFLOW_OLO_QA_SAP`)

| Prueba | Resultado |
|---|---|
| API `ObtenerExpediciones` DISP/DISP, del 21-oct al 20-dic | 21 pedidos |
| SQL `EXPEDICIONESCABECERA` DISP/DISP por `FECHAEXPEDICION`, misma ventana | 21 (los mismos) |
| SQL por `FECHAEXPEDICIONPLANIFICADA`, misma ventana | 23 |
| Llaves del API encontradas en SQL | 21 de 21 |
| Idénticos en los 11 campos comparados (fechas, estado, situación, prioridad, cliente, muelle, observaciones, bajada, viaje) | 21 de 21 |

Conclusiones:

- **El filtro de fechas del API es `FECHAEXPEDICION`**, no la fecha planificada. El TMS planifica por
  `FECHAEXPEDICIONPLANIFICADA`; si se usa el API, la ventana debe ser amplia y el filtro fino se hace del lado del TMS.
- No se pudo saber si el API excluye pedidos cerrados (`FECHACIERRE`) o con viaje: en la ventana no hay ninguno de esos.
- Datos de la muestra: compañías 0109 (15, prioridad 5) y 0029/EPA (6, prioridad 0). Fechas planificadas pasadas
  (del 22-oct al 13-nov), muelle `PURT12`, sin viaje ni bajada. Son datos de prueba de QA, no operación real.

## 2. Bases revisadas

| Servidor | Base | DISP/DISP en la ventana | Pedidos del API | Último pedido creado |
|---|---|---|---|---|
| `10.17.224.224` (QA) | `EFLOW_OLO_QA_SAP` | 21 | **21/21** | 2026-11-12 |
| `10.17.224.20` (CR, la que lee el TMS) | `EFLOW_OLO` | 339 | 0/21 | 2026-11-20 |

En ambos servidores, las demás bases (`QA_SAP_EFLOW`, `QA_MAYOREO_EFLOW`, `EINTEGRA_*`, etc.) no tienen la tabla
`EXPEDICIONESCABECERA`: son las bases intermedias de la integración SAP → eFlow, no el WMS.

## 3. Campos: SQL que usa hoy el TMS vs API

Columnas que leen la ingesta (`backend/planning/src/ingest_orders.py`, `ingest_items.py`) y el OMS:

| Dato | SQL (hoy) | API | Para qué lo usamos |
|---|---|---|---|
| Llave (compañía, almacén, sucursal, expedición) | ✅ | ✅ | Identificar el pedido |
| Cliente, estado/situación, prioridad, fecha planificada, viaje, observaciones | ✅ | ✅ | Cola DISP/DISP, OMS |
| Muelle, bajada, fecha de despacho | — | ✅ | (extra, no se usa hoy) |
| **Ruta** (`RUTA`) | ✅ | ❌ | Agrupar por ruta (15 de los 21 la tienen en SQL) |
| **Peso y volumen total** | ✅ | ❌ | Capacidad del camión (en QA solo 2 de 21 tienen peso) |
| **Costo total**, **tipo de expedición**, **fecha de cierre** | ✅ | ❌ | Valor de carga, clasificación, excluir cerrados |
| **Cantidad de líneas** | ✅ | ❌ | Tamaño del pedido |
| **Dirección y coordenadas** (`CLIENTES`) | ✅ | ❌ | **Ruteo en mapa** (en QA: 18 clientes, 18 con dirección, 4 con coordenadas) |
| **Líneas del pedido** (`EXPEDICIONESDETALLE` + `ARTICULOSGESTION`) | ✅ | ❌ | Detalle, carga, devoluciones (47 líneas para los 21) |

## 4. Lo que faltaría

### Pedido a ePRAC para que el API reemplace la consulta SQL

1. En `ObtenerExpediciones`: `ruta`, `pesoPedidoTotal`, `cubicajePedidoTotal`, `costoTotal`, `fechaCierre`,
   `tipoExpedicion` y `cantidadLineas`.
2. Dirección y coordenadas del cliente destino, en la misma respuesta o en un endpoint de clientes.
3. Endpoint de **detalle por expedición** (artículo, nombre, unidades pedidas/preparadas/cargadas/anuladas, peso,
   volumen, lote y caducidad).
4. **Lectura por llave** (una o varias expediciones), para refrescar pedidos puntuales.
5. **Filtro por fecha planificada** (o elegir el campo de fecha), y aclarar si excluye cerrados o con viaje.
6. **URL del API de producción** (hoy solo existe la de QA).

### Para el TMS

- Para probar con el API de QA, cargar en QA pedidos con datos completos (peso, ruta, coordenadas): los actuales son de
  prueba y casi no tienen peso ni coordenadas.
- El acceso SQL a `EFLOW_OLO_QA_SAP` usado aquí es el del proyecto `eflow_api_sap` (otro proyecto). Para el TMS conviene
  un usuario de solo lectura propio.

## Mientras tanto

- La lectura sigue por SQL contra `10.17.224.20` (producción CR). El API se usa solo donde ya alcanza: prioridad,
  viaje y bajada, cuando se prueben las escrituras en QA.
- El cliente del API está en la rama `integracion-eflow-qa`, con escrituras apagadas (`EFLOW_API_WRITE=off`).

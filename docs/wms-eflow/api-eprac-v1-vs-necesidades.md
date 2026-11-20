# API eFlow de EPRAC v1.0.0: qué trae y qué necesitamos

> Fuente: `ePRAC - 158 - OLO - API proyecto TMS-OMS.pdf` (v1.0.0, emitido 2026-11-12).
> Revisado: 2026-11-19, contra el código de OMS y Planificación en `planificacion-2`.
> Actualizado: 2026-11-20, con la prueba real en QA (solo lectura). Detalle:
> [`comparacion-api-qa-vs-sql-2026-11-20.md`](comparacion-api-qa-vs-sql-2026-11-20.md).
> Pedido original: [`endpoints-eflow-requeridos.md`](endpoints-eflow-requeridos.md) (2026-10-06) + reunión 2026-10-21.

## En corto

- **Sirve para escribir**: prioridad y nº de viaje están. Bajada también.
- **No sirve todavía para leer**: el GET de expediciones no trae peso, volumen, ruta, coordenadas
  ni líneas. Planificación no puede armar viajes solo con esta API.
- **Falta el paso del OMS a `GENE`**: no hay endpoint para cambiar la situación; solo
  `GenerarAcciones`, que la deja en `SOAC`.
- **Probada en QA (2026-11-20, solo lectura)**: `http://10.17.224.224:87/api` responde y cumple el documento
  (campos, paginación, orden, token de 6 días). Los 21 pedidos DISP/DISP que devuelve coinciden 21/21 con la tabla
  `EXPEDICIONESCABECERA` de `EFLOW_OLO_QA_SAP`. Es la base de **QA**, no la de producción que lee hoy el TMS.
- **Escrituras sin probar** (prioridad, acciones, viaje, bajada): pendiente de autorización y de un pedido de prueba en QA.
- **Cliente listo**: rama `integracion-eflow-qa` de Jean Carlo (`tms_common/eflow_api.py`, flags `EFLOW_API_MODE`
  y `EFLOW_API_WRITE`). Lee bien contra QA con escrituras apagadas.

## 1. Qué trae la API

| # | Endpoint | Para qué |
|---|---|---|
| 1 | `POST /api/Autenticacion` | Usuario/clave → token JWT (6 días). El token limita compañías y almacenes. |
| 2 | `GET /api/TestConexion` | Salud del servicio. Público. |
| 3 | `GET /api/Expediciones/ObtenerExpediciones` | Lista paginada por `FechaInicio`, `FechaFinal`, `Estado`, `Situacion` (todos obligatorios). Hasta 500 por página. |
| 4 | `POST /api/Expediciones/GenerarAcciones` | Genera acciones de preparación y pasa la expedición a `SOAC`. No permite Cross Docking. |
| 5 | `POST /api/Expediciones/CambiarPrioridadExpedicion` | Cambia `prioridad` (entero). Rechaza `CERR`, `TERM`, `ANUL`. |
| 6 | `POST /api/Expediciones/AsignarNumeroViajeWMH` | Asigna o reasigna `numeroViajeWmh` (int64). Solo rechaza `ANUL`. Al reasignar, desvincula el viaje anterior, le quita el camión y lo cierra si queda vacío. |
| 7 | `POST /api/Expediciones/AsignarNumeroBajada` | Asigna `bajada` (entero) y la replica al viaje. Rechaza `CERR`, `TERM`, `ANUL`. |

**Reglas comunes de los POST**

- Lotes de 1 a 100 expediciones.
- Llave obligatoria: `idAlmacen + idCompania + idSucursal + idExpedicion`.
- Cada expedición se procesa aparte: si una falla, las demás siguen. HTTP 200 con `success: false`
  y el detalle en `errors[]`.
- Un error de estructura (duplicado, nulo, más de 100) rechaza todo el lote con HTTP 400.
- Si se cae a mitad, responde 500 con las ya hechas en `resultados` y las pendientes en
  `noProcesadas`: hay que reintentar solo esas.

**Campos que devuelve el GET por expedición**

idAlmacen, idCompania, idSucursal, idExpedicion, fechaExpedicion, fechaExpedicionPlanificada,
fechaPlanificadaDespacho, estado, situacion, prioridad, idCliente, muelle, observaciones, bajada,
numeroViajeWmh.

## 2. Qué necesita Planificación

Hoy Planificación lee eFlow directo de la base (`backend/planning/src/ingest_orders.py`,
`ingest_items.py`) y escribe el nº de viaje en la tabla espejo (`plan_builder.py`).

### Lectura: la cola DISP/DISP

| Dato que usa hoy | Para qué | ¿Lo trae el GET? |
|---|---|---|
| Llave (almacén, compañía, sucursal, expedición) | Identificar el pedido | ✅ |
| `IDCLIENTE` | Cliente final | ✅ `idCliente` |
| `FECHAEXPEDICIONPLANIFICADA` | Fecha de entrega, base del plan | ✅ |
| `OBSERVACIONESEXPEDICION` | Detectar "cliente retira" | ✅ |
| `PRIORIDAD`, `TPEXES`, `TPEXSI` | Estado y prioridad (EPA trae la suya) | ✅ |
| `NUMEROVIAJEWMH` | Saber si ya tiene viaje | ✅ |
| `PESOPEDIDO_TOTAL`, `CUBICAJEPEDIDO_TOTAL` | Capacidad del camión | ❌ |
| `COSTO_TOTAL` | Monto del pedido | ❌ |
| `RUTA` | Zona / agrupación del viaje | ❌ |
| Cliente: `DIRECCIONLARGA`, `LATITUD`, `LONGITUD` | Dirección y ruteo | ❌ |
| Nº de líneas y detalle (`EXPEDICIONESDETALLE` + `ARTICULOSGESTION`): artículo, nombre, presentación, lote, unidades, peso y volumen por línea, guía fiscal, caducidad | Detalle del pedido, prioridad por línea de EPA, recolectas | ❌ |
| `FECHACIERRE` | Excluir cerrados | ❌ (se puede suplir filtrando por situación) |
| Tipo de expedición (`TPEXPE`) | Excluir Cross Docking | ❌ |

### Escritura: el nº de viaje

- El TMS arma números tipo `20261119-0109-005` y escribe `202611190109005` (sin guiones). Cabe
  en int64.
- **Duda**: la regla de reasignación (quita el camión, cierra el viaje anterior) sugiere que
  `numeroViajeWmh` debe existir como viaje en WMH. Hay que confirmar si acepta un número creado
  por el TMS, o si primero hay que crear el viaje en WMH.

## 3. Qué necesita el OMS

El OMS lee la cola desde Aurora (la llena Planificación) y escribe a eFlow por la costura
`EscritorSituacion` (`backend/oms/src/handoff_pedidos.py`). Hoy escribe en la tabla espejo
`sim_expedicionescabecera`.

| Verbo del OMS | Qué hace | Endpoint |
|---|---|---|
| `actualizar_prioridad(pk, prioridad)` | Manda el número en cada cambio (Cofersa 3→2→1→0); la situación sigue `DISP` | ✅ `CambiarPrioridadExpedicion` |
| `marcar_generada(pk, prioridad)` | Liberar: prioridad + `TPEXSI = 'GENE'` para que eFlow arranque el picking | ⚠️ No existe. Solo `GenerarAcciones` → `SOAC` |
| Liberación manual (prioridad 0) | Igual que liberar, con prioridad 0 | ⚠️ Mismo problema, y falta confirmar que acepte prioridad 0 |

## 4. Preguntas para EPRAC

1. **GET**: ¿pueden agregar peso, volumen, costo, ruta, tipo de expedición, fecha de cierre y
   dirección/coordenadas del cliente? ¿Y un GET de detalle (líneas) por expedición?
2. **Situación**: ¿`GenerarAcciones` → `SOAC` reemplaza a `GENE`? Si no, falta el endpoint para
   pasar `DISP` → `GENE` (estaba en el pedido del 06-oct, sección 3).
3. **Nº de viaje**: ¿acepta un `numeroViajeWmh` que no existe en WMH? ¿Lo crea, o hay que crearlo
   antes? ¿Qué pasa con el camión (`unidad de transporte`) del viaje?
4. **Prioridad 0**: ¿es válida?
5. **Fechas del GET**: ✅ respondida en la prueba: filtran por `fechaExpedicion` (creación). Por SQL, con la
   planificada salen 23 y no 21. **Nuevo pedido**: un filtro por `fechaExpedicionPlanificada` (la que usa el TMS).
6. **División de pedido** (reunión 21-oct): no aparece. ¿Va en otra versión?
7. **Ambientes**: QA CR ✅ (`10.17.224.224:87`, base `EFLOW_OLO_QA_SAP`; la `.20` era la IP equivocada).
   Faltan QA VE y **producción** (URL y credenciales).
8. **Lectura por llave**: ¿pueden exponer un GET de una o varias expediciones por su llave? Lo necesitamos para
   refrescar pedidos puntuales (salientes, replan).
9. **Datos de prueba en QA**: los pedidos de QA casi no tienen peso (2 de 21) ni coordenadas (4 de 18 clientes).
   Para probar Planificación con la API hacen falta pedidos completos.

## 5. Mientras tanto

- Escrituras: cambiar la costura `EscritorSituacion` (OMS) y el UPDATE del nº de viaje
  (`plan_builder._persistir_viaje`) por llamadas a la API. Mandar en lotes de 100 y reintentar
  `noProcesadas`.
- Lectura: seguir leyendo de la base de eFlow (`ingest_orders.py`, `ingest_items.py`) hasta que el GET
  traiga los campos que faltan. La ingesta local (cada 10 min) sigue por SQL contra `10.17.224.20`.
- Credenciales del API QA: `.env.local` (`EFLOW_QA_HOST/USER/PASSWORD`). Nunca en el repo.
- El secreto de eFlow no va en la cuenta sandbox (ext-claude). La integración real se despliega en la
  cuenta de Intelix.

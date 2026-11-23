# Pruebas del API de ePRAC en QA: qué probamos y qué pasó

> API General eFlow WMS v1.0.0, ambiente QA (`http://10.17.224.224:87/api`, base `EFLOW_OLO_QA_SAP`). Pruebas del
> 20 y 23 de noviembre de 2026. Las escrituras en QA fueron autorizadas por Jesús. Se probaron **todos** los
> endpoints del documento.

## En corto

| Endpoint | ¿Funciona? | Qué vimos |
|---|---|---|
| `GET /TestConexion` | ✅ | Responde sin token: base `EFLOW_OLO_QA_SAP`, versión 3.2.1.1 |
| `POST /Autenticacion` | ✅ | Da el token. El body tiene que ser JSON |
| `GET /Expediciones/ObtenerExpediciones` | ✅ | Trae lo que necesitamos. Filtra por fecha de creación |
| `POST /Expediciones/CambiarPrioridadExpedicion` | ✅ | Acepta 0; también acepta -1 |
| `POST /Expediciones/AsignarNumeroBajada` | ✅ | Funciona; acepta 0 y -1 |
| `POST /Expediciones/GenerarAcciones` | ✅ | `SOAC` y unos 2 minutos después eFlow lo pasa solo a `GENE` |
| `POST /Expediciones/AsignarNumeroViajeWMH` | ⚠️ | Solo con viajes que ya existen en WMH. Con un número nuevo del TMS falla |

**El ciclo completo del TMS (bandeja → planificación → OMS → liberar) funciona solo con el API.** Lo único que no
cierra es el número de viaje del TMS.

Sobre los datos: según Jean (23-nov), lo que trae `ObtenerExpediciones` alcanza para planificar. Peso, volumen,
coordenadas y líneas **no se necesitan**; el planificador usa el tope de **16 paradas por camión**.

## 1. Conexión y login

| Prueba | Resultado |
|---|---|
| `GET /TestConexion` sin token | ✅ `conectado: true`, `EFLOW_OLO_QA_SAP`, versión 3.2.1.1 |
| Login con body vacío o como texto | `"El campo 'password' es obligatorio."` |
| Login con body **raw JSON** `{"Username": "...", "Password": "..."}` | ✅ Devuelve `data.token` |
| GET con `Authorization: <token>` (sin `Bearer`) | 401 |
| GET con `Authorization: Bearer <token>` | ✅ |
| POST sin token | 401 |

## 2. Lectura (`ObtenerExpediciones`)

| Prueba | Resultado |
|---|---|
| Pedido `VAS001027-P` con su fecha de creación (`2026-11-12`) | ✅ Lo trae; los 15 campos coinciden con la base |
| El mismo pedido con su fecha de entrega (`2026-11-13` / `2026-11-18`) | No aparece: **filtra por fecha de creación** |
| Sin `Estado` | 400 `VALIDACION_MODELO` ("El parámetro 'Estado' es obligatorio") |
| `FechaInicio` mayor que `FechaFinal` | 400 `RANGO_FECHAS_INVALIDO` |
| Fecha inválida (`hola`) | 400 `VALIDACION_MODELO` |
| `PageSize=500` | ✅ |
| `PageSize=501` | 400 (máximo 500) |
| `Estado=XXXX` | 200 con 0 resultados (no lo valida) |

Pedidos de QA en 2026 por estado/situación (todos con estado `DISP`): `DISP` 214, `GENE` 15, `PREP` 2, `EXPA` 19,
`TERM` 142, `CERR` 2.061, `ANUL` 107. Casi 2.000 tienen viaje y bajada.

## 3. Prioridad (`CambiarPrioridadExpedicion`)

| Prueba | Resultado |
|---|---|
| `VAS001031-M` con `prioridad = 0` | ✅ |
| `VAS001031-M` con `prioridad = 2` y de vuelta a 0 | ✅ Se lee el cambio con el GET |
| `prioridad = -1` | ✅ La acepta (no la valida) |
| Pedido en `CERR` | Rechazado: `ESTADO_INVALIDO` |
| Pedido que no existe | `EXPEDICION_NO_ENCONTRADA` |

## 4. Bajada (`AsignarNumeroBajada`)

| Prueba | Resultado |
|---|---|
| `VAS001031-M` (`GENE`) con `bajada = 3` | ✅ Se lee `bajada: 3` con el GET |
| `bajada = 0` y `bajada = -1` | ✅ Las acepta (no las valida) |
| Pedido en `CERR` | Rechazado: `ESTADO_INVALIDO` |

Quedó en `bajada = 3`.

## 5. Liberar (`GenerarAcciones`)

| Prueba | Resultado |
|---|---|
| `C11-00004145-N` (20-nov) | `SOAC` a las 10:48 → **`GENE`** a las 10:51 |
| `VAS001031-M` (23-nov, dentro del ciclo) | `SOAC` a las 11:18 → **`GENE`** a las 11:20 |
| `VAS001031-M` ya en `GENE` | ⚠️ Responde OK y lo vuelve a `SOAC`; volvió a `GENE` a las 11:32. Puede generar las acciones dos veces |
| Pedido en `CERR` | Rechazado: `ESTADO_INVALIDO` |

`SOAC` = "Solicitud de Acciones": un paso intermedio. El cambio a `GENE` lo hace el monitor de eFlow solo, en unos 2
minutos. En la prueba del 20-nov la línea del pedido siguió en `DISP/DISP`; solo cambió la cabecera.

## 6. Número de viaje (`AsignarNumeroViajeWMH`)

| Prueba | Resultado |
|---|---|
| Viaje nuevo del TMS `202611240109017` | ❌ `ERROR_PROCESAMIENTO` |
| Número chico nuevo `900017` | ❌ `ERROR_PROCESAMIENTO` |
| Viaje que **ya existe** en WMH (`8213`, de `VS031918-O`) | ✅ Se lee `numeroViajeWmh: 8213` con el GET |
| Quitar el viaje con `0` | ❌ `ERROR_PROCESAMIENTO` |
| Quitar el viaje con `null` | 400: no acepta null |
| Pedido en `ANUL` | Rechazado: `ESTADO_INVALIDO` |

**Conclusión:** el endpoint asigna viajes que ya existen en WMH; no crea viajes. Los números del TMS no existen allá.
`VAS001031-M` quedó con el viaje `8213` (no hay forma de quitarlo por el API).

Pendiente con Jean: dijo que "WMH desaparece, el OMS ahora es el WMH". Confirmar si ya no hace falta mandar el
número de viaje.

## 7. Reglas de los lotes (todos los POST)

| Prueba | Resultado |
|---|---|
| Lote con una llave repetida | 400 `EXPEDICION_DUPLICADA`: rechaza todo el lote |
| Lote de 101 | 400 `LIMITE_LOTE_EXCEDIDO` (máximo 100) |
| Lote vacío | 400 `CUERPO_REQUERIDO` |
| Lote mixto (1 bien + 1 inexistente) | 200 `success: false`, `procesadas: 1`, `fallidas: 1`: aplica el bueno |

Coincide con el documento de ePRAC.

## 8. Ciclo completo del TMS por el API (23-nov)

Pedido de QA `0001/0109/0001/VAS001031-M`, entrega el 2026-11-24. TMS en `planificacion-2` con
`EFLOW_API_MODE=qa` (sin SQL contra eFlow).

| Paso | Qué hizo el TMS | Resultado |
|---|---|---|
| 1. Ingesta | Lee los DISP/DISP con `ObtenerExpediciones` y los guarda en la bandeja | ✅ 1 pedido (el único de QA con entrega de hoy en adelante) |
| 2. Planificación | Arma el viaje con el tope de 16 paradas | ✅ Viaje `20261124-0109-017` |
| 3. Viaje a eFlow | `AsignarNumeroViajeWMH` | ❌ El viaje del TMS no existe en WMH (punto 6). El plan sigue igual |
| 4. OMS prioriza | `CambiarPrioridadExpedicion` | ✅ Prioridad 0 |
| 5. OMS libera | `CambiarPrioridadExpedicion` + `GenerarAcciones` | ✅ `SOAC` → `GENE` en 2 minutos |

## Lo que queda pendiente

1. **Número de viaje:** decidir con Jean si se deja de mandar o cómo se crea el viaje en WMH.
2. **Liberar dos veces:** el TMS no debe llamar `GenerarAcciones` sobre un pedido que ya está en `GENE` (al
   reintentar un `disparo_pendiente`).
3. **Bajada:** el TMS todavía no la envía (`eflow_api.asignar_bajada` existe, nadie la llama).
4. **Datos de prueba:** pedirle a ePRAC más pedidos DISP/DISP con entrega de hoy en adelante.

Lo que se le pide a ePRAC: [solicitud-eprac-api-v1-faltantes.md](solicitud-eprac-api-v1-faltantes.md).

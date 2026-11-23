# 2026-11-23 · Ejemplo de respuesta para ePRAC y coordenadas en GitLab

## What changed

- `docs/wms-eflow/solicitud-eprac-api-v1-faltantes.md`: sección E con el JSON de `ObtenerExpediciones` que
  necesitamos (los 15 campos actuales + A1 + líneas de A2), con la expedición de QA `VAS001027-P` (commit 614404b).
- TMS-Backend (GitLab): se portó la corrección de coordenadas fuera de rango de la ingesta de eFlow (MR !3,
  `main` en 1e5b00e). Ver `docs/work/2026-11/2026-11-23-coordenadas-ingesta-eflow.md` en ese repo.
- Se relanzó en local la ingesta de eFlow cada 10 min y el replan cada hora (túnel a Aurora + ciclo local).
  Primera corrida: 193 pedidos leídos y guardados, 532 líneas.

## Why

- ePRAC necesita ver con un ejemplo concreto qué campos pedimos y con qué formato.
- GitLab debía quedar igual que GitHub: sin la corrección, una longitud sin punto decimal rompe la ingesta.

## How

- Respuesta actual del API comprobada en Postman (QA, solo lectura). Datos faltantes leídos de
  `EFLOW_OLO_QA_SAP` con consultas SELECT (cabecera + `CLIENTES` + `EXPEDICIONESDETALLE` + `ARTICULOSGESTION`).
- Backend: pytest 1222 passed, ruff limpio; MR creado y mergeado por la API de GitLab.

## Promoted knowledge

- El GET del API exige `Authorization: Bearer <token>`; sin `Bearer` responde 401.
- El login exige body raw JSON (`Username`, `Password`); como texto o form responde "El campo 'password' es
  obligatorio".
- En `VAS001027-P` el volumen total de la cabecera viene null pero una línea sí tiene volumen: el TMS debe poder
  sumarlo desde las líneas.

## Follow-ups

- Regenerar el PDF de la solicitud desde el `.md` antes de mandarlo (el de Descargas tiene el C1 viejo).
- Agregar a la solicitud las preguntas nuevas de escritura: estado de la actividad de `GenerarAcciones`, liberar en
  una llamada, quitar viaje / deshacer liberación, y que el viaje rechace pedidos cerrados.
- Corregir `api-eprac-v1-vs-necesidades.md`: todavía dice que no se llega a `GENE`.
- OLO: corregir la longitud del cliente 020301098 en eFlow.

## Ciclo de vida completo por el API de eFlow QA (planificacion-2)

### What changed

- Se trajo a `planificacion-2` la integración por API de Jean (`integracion-eflow-qa`, flag `EFLOW_API_MODE=qa`):
  ingesta por `ObtenerExpediciones`, viaje por `AsignarNumeroViajeWMH`, liberación por `CambiarPrioridadExpedicion`
  + `GenerarAcciones`. Sin líneas, peso ni coordenadas: Jean confirmó que no hacen falta para planificar.
- Se paró la ingesta SQL de producción y se borraron de Aurora los 220 pedidos de producción que seguían en la
  bandeja (DISP sin liberar) y sus 83 paradas no liberadas, para que el TMS solo escriba pedidos de QA. Respaldo en
  `backup-prod-bandeja-2026-11-23*.json` (raíz, gitignored). Decisión de Jesús: desde ahora se trabaja con el API de QA.

### Resultado (pedido de QA `0001/0109/0001/VAS001031-M`, entrega 2026-11-24)

| Paso | Resultado |
|---|---|
| Ingesta por API | 1 pedido DISP/DISP con fecha de hoy en adelante → bandeja |
| Planificación | Viaje `20261124-0109-017` armado sin peso ni coordenadas (tope de 16 paradas por camión) |
| `AsignarNumeroViajeWMH` | **Falla**: `ERROR_PROCESAMIENTO`, también con un número chico. El viaje debe existir en WMH |
| Barrido OMS | Prioridad 0 aceptada; `GenerarAcciones` OK → `SOAC` a las 11:18 → `GENE` a las 11:20 (automático) |

### Promoted knowledge

- `CambiarPrioridadExpedicion` acepta `prioridad = 0` (responde C3).
- `SOAC` → `GENE` lo hace solo el monitor de eFlow en ~2 min (segunda vez confirmado).
- `AsignarNumeroViajeWMH` no crea viajes. Según Jean, "WMH desaparece": confirmar si se deja de enviar el viaje.

### Follow-ups

- Decidir con Jean si se apaga el envío de `AsignarNumeroViajeWMH` (hoy falla y solo deja un warning).
- En QA casi no hay pedidos con entrega de hoy en adelante: pedirle a ePRAC más pedidos DISP/DISP (D3).

## Registro de las pruebas del API

- `docs/wms-eflow/pruebas-api-eprac-qa.md`: todas las pruebas del API de ePRAC en QA (20 y 23-nov) con su resultado.
- `docs/oms/pendientes/04-integracion-api-eflow-qa.md`: actualizado con lo verificado y el pendiente del número de
  viaje.

## Todo el API probado + solicitud a ePRAC reescrita

- Se probaron en QA todos los endpoints y sus casos de error (TestConexion, filtros del GET, prioridad, bajada,
  viaje, GenerarAcciones, reglas de lote). Resultado en `docs/wms-eflow/pruebas-api-eprac-qa.md`.
- Hallazgos: el viaje solo se asigna si ya existe en WMH (con `8213` funcionó) y no se puede quitar; `GenerarAcciones`
  sobre un pedido `GENE` lo vuelve a `SOAC`; prioridad y bajada aceptan -1.
- Escrituras en QA sobre `VAS001031-M`: quedó `GENE`, prioridad 0, bajada 3 y viaje `8213`.
- `solicitud-eprac-api-v1-faltantes.md` reescrita: se quitan los campos nuevos y el detalle de líneas (Jean: no
  hacen falta). Quedan filtro por fecha de entrega, consulta por llave y las preguntas de escritura.

## Coordenadas y ruta sin datos de eFlow (modo API)

- **What:** la ingesta completa la dirección y las coordenadas del pedido con el punto de entrega del cliente en Aurora
  (`IDCLIENTE` → `tbl_final_customers` → `tbl_delivery_points`/`tbl_addresses`) cuando eFlow no las trae o vienen
  fuera de rango. Con eso el trigger `trg_orders_tms_zone` calcula la zona TMS. Al planificar, si el pedido no tiene
  ruta de eFlow, se agrupa por esa zona (los códigos 01–16 coinciden con la ruta de eFlow).
- **Why:** el API no trae coordenadas ni ruta; antes el planificador sí usaba el punto de Aurora para rutear, pero el
  pedido quedaba sin zona (sin días de anticipo en el OMS) y todos caían en un solo grupo "S/R".
- **How:** `ingest_orders._puntos_entrega` + `_completar_ubicacion`; `plan_builder._ORDERS` con
  `COALESCE(delivery_zone, zona TMS)`. Test nuevo en `tests/test_ingest_coordenadas.py`; pytest 1051 passed.
  Verificado con `VAS001031-M` (cliente `020605007`): toma 9.0793621, -83.6618421 de Aurora.
- **Follow-up:** solo ~1.800 de ~14.400 clientes de Cofersa tienen coordenadas en Aurora; ese punto de Osa no cae en
  ninguna geocerca.

## Limpieza de pedidos y planificaciones en Aurora

- **What:** a pedido de Jesús se borraron de `tms_olo` los pedidos y las planificaciones: 3.972 pedidos (con sus
  líneas), 42 planes, 504 viajes y 2.343 paradas, en una sola transacción.
- **Qué quedó (por decisión de Jesús, "solo pedidos y planes"):** 756 pedidos que tienen guía de despacho,
  devolución o tracking, y 3 planes / 3 viajes / 1 parada atados a rutas de tracking o a una recolecta. Guías (752),
  devoluciones (39), tracking y liquidaciones no se tocaron. `sim_expedicionescabecera` tampoco.
- **Respaldo:** `backup-pedidos-planes-2026-11-23.json` en la raíz (gitignored, 22 MB): `tbl_orders`,
  `tbl_order_items`, `tbl_route_plans`, `tbl_plan_trips`, `tbl_plan_stops` completas antes del borrado.
- La ingesta local se detuvo antes del borrado.

## Ciclo completo con los DISP/DISP de QA (1-oct a hoy)

- **What:** se trajeron por el API (`ObtenerExpediciones`, creados del 1-oct al 23-nov) los 36 pedidos DISP/DISP de
  QA sin viaje (20 de EPA `0029`, 16 de Cofersa `0109`) y se pasaron por la ingesta del TMS (`ingest_cr`) con la fecha
  de entrega repartida en 24, 25 y 26-nov (12 por día) para que caigan en la ventana de planificación. Las fechas
  reales eran pasadas; solo se cambiaron en Aurora, no en eFlow.
- **Planificación:** `replan.replanificar_programado` armó 6 planes (2 compañías x 3 días) y 28 viajes.
  `AsignarNumeroViajeWMH` falló en todos (`ERROR_PROCESAMIENTO`, ya conocido).
- **OMS (barrido `oms-2026-11-23-181441`, escribe en eFlow QA):** 16 priorizados (Cofersa; EPA conserva su prioridad),
  24 en ventana (24 y 25-nov). 13 liberados (`SOAC` → `GENE` en ~2-6 min) y 11 `disparo_pendiente`. Los 12 del 26-nov
  quedan priorizados en `DISP` hasta su día.
- **Hallazgo:** los 11 `disparo_pendiente` son de EPA y eFlow los rechaza con `TIPO_EXPEDICION_NO_PERMITIDO`: son
  **Cross Docking** (`EXPCRO`) y no permiten `GenerarAcciones`. La prioridad 0 sí quedó escrita. El API no trae el tipo
  de expedición, así que el TMS no puede saltarlos de antemano, y la reconciliación los reintentaría en cada barrido.
- Script: `scratchpad/bandeja_oct.py` (local, no versionado).

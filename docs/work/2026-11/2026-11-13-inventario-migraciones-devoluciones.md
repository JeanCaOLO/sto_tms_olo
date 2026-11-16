# Inventario de migraciones de Devoluciones y línea base de pruebas

**Fecha:** 2026-11-13. **Rama:** `josef` (con `origin/dylan-tarifas` integrada). **Responsable de la tarea:** Kiro (tarea 1 de `tunnel.md`).

Esta revisión no consultó ninguna base de datos. El estado "aplicada" proviene de lo que informó el usuario en la conversación. Ningún script se ejecutó.

## Estado de aplicación

| Script | Qué hace | Estado |
| --- | --- | --- |
| 60 `devoluciones_recepcion` | Agrega a `tbl_returns` los datos de recepción (`received_at`, `received_by`, `received_quantity`, `received_condition`) y el CHECK `ck_return_status`. Crea los formularios por viaje (`tbl_return_forms`) y el rol Devoluciones. | Sin confirmar |
| 60 `recolectas_en_viajes` | Agrega `pickup_date` a `tbl_returns` y `stop_type` (`delivery`/`collection`) y `return_id` a `tbl_plan_stops`, para que Planificación agende recolectas dentro de viajes. | Sin confirmar |
| 61 `devoluciones_estado_completed` | Admite el estado `completed` en `ck_return_status`. | Sin confirmar |
| 61 `retirar_vistas_compat_59` | Retira las vistas de compatibilidad con nombres viejos de la migración 59. | Sin confirmar |
| 62 `devoluciones_formularios_por_seleccion` | Permite varios formularios por viaje, cada uno con las devoluciones marcadas (`tbl_return_form_items`). Quita la unicidad del formulario por ruta y recrea `vw_return_trips` con `forms_count`. | Sin confirmar |
| 62 `retirar_vistas_nombres_viejos_restantes` | Borra tres vistas con nombre viejo (`orders`, `tracking_client_access`, `tracking_stop_visits`). | Sin confirmar |
| 63 `restaurar_vistas_tracking` | Restaura las dos vistas de Tracking que el 62 borró por error. | Sin confirmar |
| 64 `devoluciones_solicitudes_cliente` | Agrega `customer_id` a `tbl_app_users`. Crea `tbl_return_requests`, `tbl_return_request_items` y `tbl_return_request_files`, con rol Cliente. | Sin confirmar |
| 64 `zona_tms_calculada_pedido` | Renombra `route_type_id` a `tms_zone_id` en `tbl_orders` y calcula la zona TMS por coordenadas. Es de Planificación. | Sin confirmar |
| 65 `fix_pending_returns_count` | Alinea `pending_returns` de `vw_return_trips` con el gate (`pending` y `approved`). | Reportada aplicada |
| 65 `zonas_dias_anticipo` | Agrega `dias_anticipo` y `tipo_zona` a `tbl_zones`. Es del OMS. | Reportada aplicada |
| 66 `devoluciones_rechazo` | Agrega columnas de rechazo y cancelación a `tbl_returns`. | Reportada aplicada |
| 67 `roles_solicitudes_devolucion` | Amplía solicitudes con destino y autor históricos, trigger de decisión (`guard_return_request_decision_67`) y `request_item_id` en `tbl_returns` con índice único. | Evidencia anterior, sin contrastar con el esquema actual |
| 68 `return_requests_operator_capture` | Permite captura por Cliente o por gerente/superusuario autorizado. Requiere 67. | Reportada aplicada |
| 69 `return_request_auto_approval` | Agrega `approval_mode` (`legacy` o automático) a `tbl_return_requests`. | Reportada aplicada |
| 70 `return_incidents` | Estado `in_review`, tabla `tbl_return_incidents` con historial inmutable por trigger y trigger diferido que exige `in_review`. Recrea `vw_return_trips` con `open_returns` e `incident_returns`. | Reportada aplicada |

**Lectura de los sin confirmar.** Los scripts 60 a 64 son anteriores a los reportados. Los scripts 65 a 70 los usan o los suponen, así que es probable que estén aplicados. Aun así, no hay evidencia en este documento. La forma de confirmarlo es una consulta en solo lectura al esquema (existencia de `tbl_return_requests`, `tbl_return_forms`, la columna `received_quantity` y el CHECK de `ck_return_status`), que corresponde a Intelix/Jean o a ti.

## Hallazgo de diseño para la tarea 2

El trigger `guard_return_incident_history_70` rechaza cualquier `UPDATE` o `DELETE` sobre `tbl_return_incidents`. Por eso la resolución de una Novedad no puede ser un cambio de columnas en esa tabla. Se registra como filas nuevas en una tabla aparte (migración 71) y el estado de `tbl_returns` pasa de `in_review` a `received` o a su estado anterior.

El trigger diferido `check_return_incident_review_70` solo actúa sobre inserciones en `tbl_return_incidents`. No impide sacar la devolución de `in_review` desde una tabla distinta.

## Línea base de pruebas (antes de cualquier cambio)

| Suite | Resultado |
| --- | --- |
| Vitest: `src/pages/devoluciones` y `src/pages/mis-devoluciones` | 9 archivos, 69 pruebas, todas pasan |
| Pytest en `backend/`: `test_returns.py`, `test_returns_gate.py`, `test_return_incidents.py`, `test_return_requests.py`, `test_return_request_creation_roles.py`, `test_return_request_review.py` | 165 pruebas, todas pasan |
| Tests SQL (`node --test tests/sql/<archivo>.test.mjs`, PGlite): `70`, `67`, `68`, `returns_pagination`, `return_requests_access` | No corrieron en la primera medición: `vitest` solo incluye `src/**` y PGlite no estaba instalado. Después de instalar PGlite en `%TEMP%\tms-t03-postgres-tools` (fuera del repo), pasan 55 pruebas junto con las del 71 |

Corrección: la primera versión de este documento atribuía a Vitest los tests SQL. Vitest no los ejecuta; se corren con `node --test`.

No se corrieron `type-check`, `lint` ni la suite completa del proyecto en esta tarea. Los tests SQL usan PGlite de una instancia, que no cubre concurrencia real (pendiente V01).

## Bloqueo del seguimiento AI-DLC

`python .kiro/skills/intelix-task-tracker/check_drift.py` falla con `AidlcLayoutAmbiguityError`: hay 3 intents en el space `default` y no existe `active-intent` válido. El índice de progreso no se actualiza hasta que alguien fije el intent activo. El avance de esta ejecución queda en `tunnel.md` y en este tipo de notas.

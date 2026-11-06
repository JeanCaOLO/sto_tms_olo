# 06 — Solicitudes de devolución del cliente (rol Cliente)

**Estado:** pendiente por implementar (flujo posterior bloqueado: no se sabe quién atiende la solicitud). La migración `sql/64` ya está aplicada en Aurora (2026-11-06); falta desplegar `backend/admin` y el permiso S3 (Intelix).

## Qué falta
El cliente ya puede solicitar una devolución (`/mis-devoluciones`, estado `pendiente_asignacion`), pero **nadie la atiende**: no hay bandeja interna, aprobación, conversión a `tbl_returns`/recolecta, aviso al cliente ni validación contra pedidos.

## Por qué
Se pidió dejar el flujo hasta el mensaje «Se está procesando su solicitud» porque el destinatario siguiente está sin definir.

## Cómo hacerlo
El detalle completo (9 puntos: destinatario, estados, validación de artículos, motivos, empresa dueña de la mercancía, permisos S3/CORS para Intelix, alta de usuarios Cliente, retención de archivos, pruebas E2E) está en [`.test/devoluciones/pendientes-solicitudes-cliente.md`](../../../.test/devoluciones/pendientes-solicitudes-cliente.md).
Código: `backend/admin/src/admin_return_requests.py`, `sql/64_devoluciones_solicitudes_cliente.sql`, `src/pages/mis-devoluciones/`.

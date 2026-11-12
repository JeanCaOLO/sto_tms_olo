# 06 — Solicitudes de devolución del cliente (rol Cliente)

> **Reconciliado 2026-11-11:** creación e historial existen localmente; las tablas de 64 existen en Aurora. Ninguna de las tres rutas de solicitudes ni su módulo Python están desplegados en admin. Siguen pendientes bandeja/decisiones de negocio, avisos, validación contra pedidos, S3/CORS y E2E. Fuente vigente: [estado actual](../ESTADO_ACTUAL.md).

**Estado (2026-11-11):** creación e historial implementados localmente; tablas de SQL 64 verificadas en Aurora. Backend/flujo Cliente sin publicar en sandbox y S3/CORS por configurar. El flujo interno posterior sigue bloqueado por definición de responsable y contrato con Planificación.

## Qué falta
El cliente ya puede solicitar una devolución (`/mis-devoluciones`, estado `pendiente_asignacion`), pero **nadie la atiende**: no hay bandeja interna, aprobación, conversión a `tbl_returns`/recolecta, aviso al cliente ni validación contra pedidos.

## Por qué
Se pidió dejar el flujo hasta el mensaje «Se está procesando su solicitud» porque el destinatario siguiente está sin definir.

## Cómo hacerlo
El detalle completo (9 puntos: destinatario, estados, validación de artículos, motivos, empresa dueña de la mercancía, permisos S3/CORS para Intelix, alta de usuarios Cliente, retención de archivos, pruebas E2E) está en [`.test/devoluciones/pendientes-solicitudes-cliente.md`](../../../.test/devoluciones/pendientes-solicitudes-cliente.md).
Código: `backend/admin/src/admin_return_requests.py`, `sql/64_devoluciones_solicitudes_cliente.sql`, `src/pages/mis-devoluciones/`.

## Hallazgos de la prueba en navegador (2026-11-06)
Probado con la API local + Aurora + bucket de dev: login Cliente, envío con foto, mensaje «Se está procesando su solicitud» y `/devoluciones` con «Sin acceso» funcionan.

- **CORS del bucket de evidencias (pendiente, Intelix):** `dev-tms-mobile-evidencias-758837481569` solo permite `POST` desde `http://localhost:8081` y `http://localhost:3000`. Desde `localhost:5173` o el dominio real de la web la subida falla con «Failed to fetch» (preflight 403). Agregar los orígenes de la web (dev y prod) a la regla CORS (`AllowedMethods: POST`).
- **Backend desplegado sin las rutas nuevas (pendiente, Intelix):** `dev-tms-admin` (actualizado 2026-11-05) no tiene `solicitudes-devolucion`, `MobileEvidenceBucket` está vacío y el rol Lambda compartido no tiene permisos S3 (`pedidos/*` lectura, `solicitudes/*` escritura y lectura).
- **Usuario de prueba:** `cliente.prueba@ologistics.com` (rol Cliente, empresa EPA) existe en Aurora; borrarlo antes de producción.
- **Arreglo ya hecho:** `src/lib/google-login.ts` importaba `./supabase` (no existe) y rompía el login en dev; ahora importa `./api-client`.

# 2026-11-05 — Retiro de las vistas de compatibilidad del renombrado (sql/59)

## What changed

- **`sql/61_retirar_vistas_compat_59.sql`** (aplicada): borra las 84 vistas con el comentario
  `compat:estandar-oltp-59`, sin CASCADE.
- **`sql/61_retirar_vistas_compat_59_rollback.sql`**: rollback generado del catálogo (definición, dueño,
  GRANT y comentario), con `revoke all` antes de cada `grant` porque los permisos por defecto del
  esquema le dan más a `tms_app`.
- **`sql/62_retirar_vistas_nombres_viejos_restantes.sql`** (aplicada): borra `orders`, que se había
  recreado sin la marca después de la 59. También borró por error `tracking_client_access` y
  `tracking_stop_visits`.
- **`sql/63_restaurar_vistas_tracking.sql`** (aplicada): restaura esas 2 vistas de tracking con su
  definición y sus GRANT.

## Why

Pedido de Chus: borrar las vistas de compatibilidad que creó la 59 para que los despliegues no
explotaran durante el renombrado. Todos los stacks ya estaban redesplegados con los nombres `tbl_*`
(PR #36/#37). Las ramas sin traer main (por ejemplo `josef`) tenían que actualizarse; quedó avisado.

## How

- Antes de borrar se verificó que:
  - ningún objeto dependía de las vistas;
  - el código de `main` no las consulta;
  - ninguna función de `public`/`audit` nombra tablas viejas.
- Se ensayó la 61 y su rollback en una transacción con ROLLBACK (84 → 0 → 84).
- Después de aplicarla, el replan y el barrido del OMS desplegados respondieron 200.
- **Error corregido:** la 62 se pasó de alcance. `tracking_stop_visits` y `tracking_client_access` no
  eran de la 59: son vistas de tablas nuevas de tracking. Chus lo marcó ("solo mata las que tú
  hiciste") y la 63 las restauró. `tms_app` las lee de nuevo.

## Promoted knowledge

- Las únicas vistas sin prefijo que quedan en `public`/`audit` son las 2 de tracking.

## Follow-ups

- Que José pase sus tablas de tracking a `tbl_*` sin vista, si ya no las necesita con el nombre viejo.
- La rama `josef` tiene que traer `main` antes de mergear: sus consultas usan nombres viejos.
- Validar el rollback de la 61 contra la ACL exacta (el ensayo dejó diferencias de permisos en 3 vistas de tarifas).

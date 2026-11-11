# 2026-11-11 — Scope global para la cuenta @intelix.biz de Jesús

## What changed

- Aurora `tms_olo` (sandbox): fila nueva en `tbl_user_scopes` para el app_user `091dbf29…`
  (SuperAdministrador) con `country_id`/`warehouse_id`/`customer_id` NULL = acceso a todos los países,
  igual que el admin de ologistics.com.
- `docs/auth/pendientes/01-alta-google-sin-scope.md` (nuevo).

## Why

El selector de país del headbar no mostraba países: el usuario se creó por login con Google el 5-nov
sin ningún scope, y `list_countries` filtra por scope, no por rol. Pedido por Jesús.

## How

- INSERT idempotente (solo si el usuario no tenía scopes); verificado desde otra conexión.
- Rollback: `DELETE FROM tbl_user_scopes WHERE id = '14537003-52ef-4db5-9b78-99d5180e19a3'`.

## Follow-ups

- Política de scope para altas por Google (pendiente auth/01).

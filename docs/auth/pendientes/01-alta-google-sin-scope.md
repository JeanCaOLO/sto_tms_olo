# 01 — Usuarios nuevos por Google quedan sin scope

**Estado:** idea

## Qué falta

El primer login con Google crea el `tbl_app_users` (`NEW_APP_USER_SQL` en `backend/auth/src/app.py`)
pero **ninguna fila en `tbl_user_scopes`**. Aunque después se le asigne un rol (incluso
SuperAdministrador), `GET /api/v1/countries` (`backend/context/src/app.py:list_countries`) filtra por
scope y devuelve `[]`: el selector de país del headbar queda vacío.

## Por qué

Pasó con la cuenta @intelix.biz de Jesús (2026-11-11); se resolvió a mano con un scope global.

## Cómo hacerlo

Decidir la política y aplicarla en el alta:
- (a) dejarlo así (sin acceso hasta que un admin asigne scope) y que la pantalla de usuarios avise
  "sin países asignados"; o
- (b) al asignar rol desde Configuración, exigir/crear el scope en el mismo paso.

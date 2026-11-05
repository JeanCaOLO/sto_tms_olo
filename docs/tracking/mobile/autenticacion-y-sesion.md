# Tracking móvil — autenticación y sesión

## Modelo

- Las credenciales son las **mismas del TMS** (`auth_credentials` + `app_users`, bcrypt `$2a$/$2b$`), pero el backend móvil **firma sus propios tokens** con un secreto propio (`/dev/tms/mobile-jwt`, clave `jwt_secret`). Un token de la app no sirve en el TMS ni al revés (`auth.py:1-6`, `config.jwt_secret`).
- Solo entran usuarios **activos**, con rol `Chofer` (`DRIVER_ROLE_NAME`) y **enlazados a un conductor** (`drivers.app_user_id`). Si no: 403 `inactive_user` / `not_a_driver` / `no_organization`.

## Tokens (`security.py`)

| Token | Formato | Vida | Almacenamiento servidor |
|---|---|---|---|
| Acceso | JWT HS256, `iss=tms-mobile`, `typ=access`, claims `sub`, `email` | 1 h (`ACCESS_TTL_SECONDS`) | — |
| Refresh | Opaco aleatorio (`secrets.token_urlsafe(48)`) | 30 días (`REFRESH_TTL_SECONDS`) | Solo hash SHA-256 en `mobile_refresh_tokens` |

## Refresh con rotación

1. La app envía el refresh; el servidor lo revoca y entrega **uno nuevo** más un access nuevo.
2. Reusar un refresh ya canjeado **hace más de 60 s** = posible robo: se revocan **todos** los refresh del usuario y responde 401 `invalid_refresh` (`auth.refresh`, evento de auditoría `refresh_reuse_detected`).
3. Reuso **dentro de 60 s** (`REFRESH_REUSE_GRACE_SECONDS`) = respuesta perdida por mala señal: se entrega una sesión nueva (evento `refresh_retry_grace`).
4. Refresh vencido → 401 `invalid_refresh`.

## Freno de fuerza bruta

Ventana de 15 min. Más de **5 fallos por correo** o **30 por IP** → 429 `too_many_attempts`, sin mirar la clave. Se auditan `login`, `login_failed`, `login_blocked`, `login_throttled`.

## Contexto del chofer en cada request

`authenticate` valida el JWT y carga el `Driver` (usuario, organización, conductor). Se cachea **60 s por contenedor Lambda** (`CONTEXT_TTL_SECONDS`, máx. 500 usuarios): desactivar un usuario o desenlazar su conductor corta el acceso en ≤ 60 s. Login y refresh siempre van a la BD.

## Logout

Revoca el refresh del dispositivo y marca **offline** con la hora `occurred_at` del teléfono, para que un logout hecho sin red y reenviado después no pise un login posterior. Es idempotente.

## En el teléfono (`TRACKING_TMS/frontend`)

- `src/auth/session.ts` (Zustand) guarda `tms.access`, `tms.refresh`, etc. en **SecureStore**; estado `loading | in | out`.
- `src/api/http.ts` hace el refresh automático ante `token_expired`.
- Si entra **otro chofer** distinto al anterior, se **borran** las colas (`position_queue`, `outbox`) del anterior para no enviar sus datos con la sesión nueva (`db/reset.ts`).
- Las tareas de fondo (outbox, GPS) hidratan la sesión del almacén seguro si la app arranca sin pantallas (`outbox.flush`).
- Un 401 en el outbox **no** marca la acción como fallida: se reintenta tras refrescar (`outbox.ts`).

## Auditoría

Cada escritura fija el actor en la sesión de BD (`audit.bind`) para que el trigger de auditoría del TMS registre quién hizo el cambio; el login/refresh quedan en la auditoría de la app (`audit.record`).

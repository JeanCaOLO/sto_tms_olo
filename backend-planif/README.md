# backend-planif — Backend de Planificación (copia del repo TMS-Backend)

Copia del backend del repo **`olo/tms/TMS-Backend`** (Python, arquitectura
hexagonal) traída al monorepo **sin tocar `backend/` ni `server/`**.

## Scripts

| Comando | Qué levanta |
|---|---|
| `pnpm api:local` | **los DOS**: el nuestro en `:4000` (de cara al front) + el original en `:4001` |
| `pnpm api:local:base` | solo el backend original del monorepo (`backend/`, `:4000`) |
| `pnpm api:local:planif` | solo el nuestro (`backend-planif/`, `:4000`) |

`pnpm api:local` corre `launch-both.py`: el nuestro queda en `:4000` (el proxy de
Vite `/api → :4000` lo usa; ya incluye auth/context/data/admin/eflow + la
planificación mejorada) y el original queda levantado en `:4001`. Si uno muere,
se bajan ambos.

## Requisitos
1. Túnel a Aurora en `localhost:15432`.
2. `TMS_DB_PASSWORD` (y opcional `JWT_SECRET`) en el **`.env.local`** de la raíz —
   el mismo que ya usa `api:local:base`. **Nada hardcodeado aquí.**

## Notas
- No reemplaza a `backend/`; es una copia paralela.
- La fuente de verdad para **desplegar** este backend sigue siendo el repo
  `TMS-Backend` (con sus `sam-*/` y pipeline). Aquí solo vive lo necesario para
  usarlo en local.
- Si se quisiera que el front use el **original** para los módulos base y el
  **nuestro** solo para `/planificacion`, se haría un split en el proxy de
  `vite.config` (no está hecho para no cambiar el comportamiento actual).

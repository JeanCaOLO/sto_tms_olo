# backend-planif — Backend de Planificación (copia del repo TMS-Backend)

Copia del backend del repo **`olo/tms/TMS-Backend`** (Python, hexagonal) traída al
monorepo **sin tocar `backend/` ni `server/`**.

Es un **superconjunto** del backend original: tiene **todas** sus rutas
(auth/context/data/admin/eflow/catálogos/viajes) **más** la planificación mejorada
(planes editables, estado por viaje, confirmar/completar/cancelar/reabrir). Por eso
corre **un solo servidor en `:4000`** — no hace falta levantar el original aparte.

## Scripts

| Comando | Qué levanta |
|---|---|
| `pnpm api:local` | **este backend** (`:4000`) — incluye TODO (base + planificación) |
| `pnpm api:local:base` | el backend original del monorepo (`backend/`, `:4000`), por si se quiere comparar |

Ambos usan el mismo puerto `:4000` (se corre **uno a la vez**); el proxy de Vite
(`/api → :4000`) habla con el que esté arriba.

## Requisitos
1. Túnel a Aurora en `localhost:15432`.
2. `TMS_DB_PASSWORD` (y opcional `JWT_SECRET`) en el **`.env.local`** de la raíz —
   el mismo que usa `api:local:base`. **Nada hardcodeado aquí.**

## Nota
La fuente de verdad para **desplegar** este backend sigue siendo el repo
`TMS-Backend` (con sus `sam-*/` y pipeline). Aquí solo vive lo necesario para
usarlo en local desde el monorepo.

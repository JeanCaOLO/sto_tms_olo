# 2026-09-23 — Backend Express migrado a Lambdas Python + SAM (`backend/`)

## What changed

Todo el API de `server/` (Express) quedó reimplementado como Lambdas Python 3.13 en `backend/`, en forma de monorepo SAM: `common-services` (API Gateway HTTP compartido, authorizer JWT, Layer `tms_common`, rol IAM), un stack por módulo (`auth`, `data`, `context`, `eflow`) y un template aparte de secretos. El contrato HTTP es el mismo; el único cambio en el frontend es que `src/lib/supabase.ts` antepone `VITE_API_BASE`. Además, coordinación Claude↔Kiro: canal `.agents/CANAL.md`, Orca instalado y la guía `docs/guides/coordinacion-claude-kiro.md`.

## Why

El estándar Intelix y el `DECIDED` del 2026-09-03 fijan Python + Lambdas + SAM como stack oficial; el Express era del prototipo. Pedido explícito del usuario (2026-09-23). Decisiones tomadas con él: carpeta `backend/` en este repo, alcance = todo `server/`, se mantiene el mismo JWT con un Lambda authorizer y la API genérica se porta tal cual.

## How

- Motor de consultas genérico portado 1:1 (`select_parser`, `select_query`, `mutations`, `relations`, `schema`), con placeholders `%s` para pg8000.
- Drivers en Python puro (pg8000, python-tds, PyJWT) para que `sam build` funcione sin Docker. Excepción: `auth` (bcrypt), que requiere `--use-container`.
- Serialización JSON igual a la de node-pg/mssql: NUMERIC como string en Aurora, como número en EFLOW, y fechas en ISO UTC con milisegundos.
- 51 tests pytest, que incluyen compatibilidad con tokens de `jsonwebtoken` y hashes de `bcryptjs`. `cfn-lint` sin errores en las 6 plantillas.
- Región `us-east-2` (la de Aurora). EFLOW se despliega en modo mock (`EflowMode=mock`, datos de `eflow/src/mock_data.json`, fuera de VPC) hasta tener red hacia EFLOW.
- **No se desplegó**: los despliegues son exclusivos de Intelix.

## Promoted knowledge

- `backend/README.md`: estructura, mapa Express→Lambda, despliegue, secretos y cómo agregar tablas o endpoints.
- `docs/decisions/0002-backend-lambdas-python-sam.md`: decisión y cambios de comportamiento. Supera a ADR-009.
- `docs/guides/coordinacion-claude-kiro.md`.

## Follow-ups

- [ ] Deploy en dev (Intelix): SSM de red, VPC con ruta a Aurora y EFLOW, carga de secretos.
- [ ] Pasar `eflow` a `live` (red hacia EFLOW) y portar el SQL real de `GET /api/catalogos/rutas-dias` desde `TMS-Backend` y acordar con ese equipo la fuente única de las Lambdas EFLOW.
- [ ] Proteger las rutas EFLOW con el authorizer; validar el certificado CA de RDS.
- [ ] Retirar `server/` cuando dev quede validado de punta a punta.
- [ ] Correr `scripts/setup-orca.ps1` de punta a punta en una máquina limpia.

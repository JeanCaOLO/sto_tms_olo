# ADR-001 — Modelo de multi-tenancy

**Estado:** Propuesto

## Contexto

Hoy el único límite de tenant real es `organization_id`. El prompt maestro
exige que EPA nunca pueda ver datos de Cofersa, y que Costa Rica nunca mezcle
datos con Venezuela, incluso cuando ambos comparten `organization_id`
("Transportes OLO").

## Decisión

Aislamiento por **scope jerárquico** (`country_id` → `warehouse_id` →
`customer_id`), aplicado a nivel de repositorio de datos (no solo en el
frontend), combinado con RBAC de scopes múltiples por usuario
(`user_scopes`). No se usa un esquema de Postgres por compañía ni una base de
datos por país en esta fase.

## Consecuencias

- Toda tabla transaccional relevante necesita las columnas de scope
  correspondientes (ver `03-modelo-datos-erd.md`).
- Las queries del backend deben filtrar por scope como parte del
  repositorio, no como filtro opcional del cliente.
- Escalar a "base de datos por país" sigue siendo posible después sin
  rediseñar el modelo lógico, solo cambiando dónde vive físicamente cada
  partición.

## Alternativas rechazadas

- **Esquema de Postgres por compañía**: ya está registrado como
  "recomendación técnica no oficial" en `project.md` para el caso
  multi-país/multi-compañía; se descarta *para esta fase* porque agrega
  complejidad operativa (migraciones N veces) sin necesidad probada con el
  volumen actual (Costa Rica, 2 clientes).
- **Base de datos por país**: mismo motivo, más prematuro aún.
- **Solo `organization_id` con filtros ad-hoc en frontend** (estado actual):
  rechazado — no es un límite de seguridad real, es solo UX.

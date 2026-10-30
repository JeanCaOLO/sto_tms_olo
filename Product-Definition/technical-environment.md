# Technical Environment Document

> Proyecto: intelix-estandar-frontend · Fecha: 2026-10-28
> Debe respetar `docs/estandares/estandares-desarrollo-intelix.md` y `docs/estandares/seguridad-baseline.md`.

## Stack / plataforma objetivo

<!-- AWS SAM / Lambda por defecto; ECS solo si el estandar lo justifica -->

-

## Integraciones requeridas

<!-- Bloqueante Gate 0 -->

| Sistema | Tipo | Proposito | Criticidad |
|---------|------|-----------|------------|
|         |      |           |            |

## Autenticacion / autorizacion

<!-- Interno vs publico: ver seccion de seguridad del estandar Intelix -->

-

## Datos sensibles y cumplimiento

<!-- Bloqueante Gate 0: PII, pagos, regulaciones -->

| Dato / Regulacion | Aplica | Notas |
|-------------------|--------|-------|
| PII | | |
| Pagos | | |

## Restricciones tecnicas (no negociables Intelix)

- IaC en SAM/CloudFormation (si no esta en el template, no esta listo para desplegar).
- Frontend web: React + design system existente, salvo excepcion de Arquitectura.
- Backend: hexagonal, minimo privilegio IAM, secretos fuera del codigo (R1).
- Ambientes alineados a ramas: develop → DEV, qa → QA, master → PROD.

## Infraestructura existente

-

## Base de datos (si aplica)

| Motor | Uso | Datos sensibles | Migraciones |
|-------|-----|-----------------|-------------|
|       |     |                 |             |

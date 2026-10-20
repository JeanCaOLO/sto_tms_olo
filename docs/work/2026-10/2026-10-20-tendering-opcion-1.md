# Tendering: monto adjudicado por viaje (opción 1) y proceso completo pendiente (opción 2)

Fecha: 2026-10-20. Alcance: solo tarifador. Sin despliegue, sin push. La migración SQL queda **sin ejecutar**.

## Qué es tendering (resumen de la investigación)
No es una fórmula de tarifa: es un **proceso de asignación**. El embarcador ofrece el viaje a un transportista (ranqueado por tarifa y desempeño); si acepta, se le adjudica; si rechaza o vence el plazo, se pasa al siguiente (cascada o *routing guide*); si se agotan, va al mercado spot. Ya lo decía `docs/arquitectura-tms-oms/02-to-be.md` §8–9. El tarifador solo tiene que **liquidar el monto que salió de ese proceso**.

## Aplicado (opción 1)
- `carriers.rate_type = 'TENDERING'` deja de bloquear. El monto es el **adjudicado a ESE viaje** y se liquida como tarifa fija (`method: 'FIXED'`, origen `TENDER`).
- Tabla nueva `tarifas_trip_tender_awards` (una fila por viaje: `trip_id` único, `carrier_id`, `amount >= 0`, `awarded_at`, `actor`, `notes`). Entidad `tripTenderAward` en `data/schema.ts`; DDL regenerado en `sql/04_tarifas.sql`; migración `sql/45_tarifas_tendering_adjudicacion.sql` (idempotente, **no ejecutada**); manifiesto regenerado (`npm run tarifas:manifest`).
- `partiesDataSource.ts`: `resolveCarrierBase(rateType, flat, tenderAmount)` y `carrierBaseForCarrier(id, { tripId })` leen la adjudicación con `getTenderAwardForTrip`. `tripSettlement.ts` pasa el `trip.id`.
- `baseOverride.ts`: línea de base `BASE_FIJA_TENDERING` ("Monto adjudicado por tendering"); `BaseSourceKind` ganó `'TENDER'`; `BaseOverride.origin?: 'TENDER'`.
- Siguen bloqueando con `BASE_NO_DEFINIDA` (y motivo claro): viaje **sin adjudicación**, adjudicación **de otro transportista**, monto ilegible/negativo.
- Una **regla** sigue sin poder declarar `baseMethod = TENDERING` (no es una fórmula). Cambió solo el mensaje y el tooltip de `RuleStackingSection`.
- Flota propia no cambia: siempre su estructura de costos.

## Cómo registrar una adjudicación hoy (no hay pantalla)
Insertar una fila en `tarifas_trip_tender_awards` (API genérica del tarifador o SQL) con `trip_id`, `carrier_id` (el del viaje) y `amount`. Quien la escribe es configuración (`tarifas.config`), no el Liquidador. La captura desde UI es parte de la opción 2.

## PENDIENTE — opción 2: proceso de tendering completo (Planificación / Torre de Control)
Roadmap Fase 11. Alcance propuesto, **no construido**:
- Tablas `tenders` (viaje, estado, ronda, plazo) y `tender_offers` (transportista, tarifa ofertada, aceptó/rechazó, motivo).
- Ranking de transportistas por tarifa + score (tasa de aceptación, puntualidad), alimentado por tarifas pactadas por ruta (`carrier_lane_rates`, reutilizando `contract_expiry`).
- Cascada con plazo de respuesta y fallback a spot manual; `automation_level` 1 (manual desde Torre de Control) escalable a 3/4.
- Al adjudicar, escribir `tarifas_trip_tender_awards` (hoy tabla de entrada manual).
- Flota propia disponible y prioritaria va **antes** (§13 de `02-to-be.md`, Fase 10).

## Preguntas para Jean Carlo (necesarias para la opción 2)
1. ¿Tendering es **cascada por ranking** (se ofrece al mejor y baja al siguiente) o **subasta competitiva** (varios ofertan y gana el menor precio)?
2. ¿Quién decide el ganador: el **sistema** automáticamente o un **operador** de la Torre de Control? (propuesta inicial: operador)
3. ¿Existen **tarifas pactadas por ruta/transportista**, o todo se cotiza por viaje (spot)?
4. ¿Aplica solo a **flota tercerizada**, con la propia siempre primero?
5. ¿Qué **plazo** tiene el transportista para responder y qué pasa si vence o todos rechazan?
6. ¿El monto adjudicado es lo que se liquida **tal cual**, o admite recargos/ajustes encima (peajes, devoluciones, etc.)? Hoy se suman los ajustes de las demás fases.
7. ¿Quién registra la adjudicación **mientras no exista el proceso**?

## Verificación
`tsc --noEmit` limpio; vitest `src/lib/tarifas` y `reglas-tarifa` verdes salvo el fallo previo de `demoSeed.test.ts` por la colección `proformas` vacía (trabajo de proformas en curso, ajeno a este cambio). Snapshot de `RuleModal` actualizado solo por el tooltip.

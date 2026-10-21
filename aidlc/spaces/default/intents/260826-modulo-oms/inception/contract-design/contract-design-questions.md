# Contract Design — Preguntas (Módulo OMS, rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Contract Design (Inception, 2026-10-16).
> Las fronteras ya están resueltas por decisiones de negocio recientes (contrato de
> activación cerrado con el dueño de Planificación el 2026-10-16; handoff definido
> en ADR-008). Las preguntas confirman el encuadre; no re-abren lo resuelto.
> Nomenclatura EFLOW/EPRAC.

---

## Q1 — Superficie de API pública/externa

¿El OMS expone alguna API consumida FUERA del sistema (otro equipo/partner/
internet) que haya que pinnar aquí?

- **A. (default)** No. El OMS no expone API pública externa en esta rebanada. Sus
  fronteras son **cross-módulo internas**: Planificación (activación) y EFLOW/
  `public.orders` (handoff). Se formalizan como contratos inter-unidad/integración,
  no como API pública.
- **X. Other (please specify)**

[Answer]: A

---

## Q2 — Mecanismo de integración por frontera

- **A. (default)**
  - **C1 Activación OMS↔Planificación**: **async (señal, AsyncAPI) + shared-schema
    (`public.orders`, pull por columna)**. La lambda es señal; el OMS resuelve el
    lote leyendo `wms_trip_number IS NOT NULL AND oms_processed_at IS NULL`.
  - **C2 Handoff**: **shared-schema** — UPDATE a `public.orders` (escritura 1) +
    UPDATE a EFLOW `EXPEDICIONESCABECERA` (escritura 2, `TPEXSI='GENE'`+`PRIORIDAD`).
- **X. Other (please specify)**

[Answer]: A

---

## Q3 — Propiedad de cada contrato

- **A. (default)** C1 señal: Planificación la emite. C1 superficie `public.orders`:
  compartida (Planificación: viaje + `lead_time_days`; OMS: `oms_processed_at` +
  resultado). C2 (ambas escrituras): OMS. Columnas nuevas migran en el PR de tablas
  de Planificación.
- **X. Other (please specify)**

[Answer]: A

---

## Q4 — Versionado / breaking vs. aditivo

- **A. (default)** Breaking changes se acuerdan proveedor↔consumidor antes de
  desplegar; aditivos (columnas/campos nuevos) son seguros (los consumidores
  ignoran lo desconocido). La señal de activación no es fuente de verdad, así que
  cambiarla no rompe el pull por columna.
- **X. Other (please specify)**

[Answer]: A

---

## Q5 — Error / timeout / reintento por frontera

- **A. (default)** C1: si la señal se pierde, el **barrido periódico** sobre
  `oms_processed_at IS NULL` recupera el trabajo (idempotencia natural por columna).
  C2: sin 2PC; orden 1→2 + reintento idempotente por llave EFLOW; fallo parcial deja
  `handoff_status='disparo_pendiente'`.
- **X. Other (please specify)**

[Answer]: A

---

## Assumptions & Open Questions

- El contrato del **backorder** (U2) NO se cierra aquí: queda abierto
  (OQ-BO1/BO2/BO3) para la próxima reunión. U2 es esqueleto en la rebanada.
- El cálculo dinámico de `lead_time_days` por clúster (VE) es futuro; hoy mapa
  estático zona→días.

## Consolidated Summary Confirmation

Contract Design formaliza las dos fronteras cross-módulo del OMS en la rebanada:
**C1 Activación OMS↔Planificación** (RESUELTO 2026-10-16: señal async AsyncAPI +
pull por columna `public.orders` con `wms_trip_number IS NOT NULL AND
oms_processed_at IS NULL`; barrido periódico como red de seguridad; el OMS procesa
por compañía y estampa `oms_processed_at=now()` al completar; `lead_time_days` como
insumo de la regla de fecha) y **C2 Handoff** (UPDATE a `public.orders` con
priority/oms_score/wms_situation='GENE'/handoff_status/prioritization_run_id +
escritura a EFLOW `TPEXSI='GENE'`+`PRIORIDAD`, `TPEXES` permanece `DISP`, sin número
de viaje). Propiedad y versionado definidos. El **backorder (U2)** queda como
**assumption abierta** (OQ-BO1/BO2/BO3), no se cierra. Sin API pública externa.
Sensores: required-sections, upstream-coverage.

[Answer]: Looks correct

# Code Generation — Plan Approval — U1 `motor-reglas-oms`

> Intent: `260826-modulo-oms`. Fase: Construction. Unidad: U1 `motor-reglas-oms`
> (kind `service`). **Reconciliado as-built 2026-10-19 (v4 + ADR-013).**
>
> **Reconciliación contable**: el código de esta unidad YA FUE CONSTRUIDO y
> verificado en rama `oms` (**36/36 tests de la unidad + 287/287 de la suite del
> backend**). Esta aprobación de plan reconcilia el gate Step 3 para el código real
> de hoy (desacople priorización↔liberación, ADR-013). Aprobar NO regenera: el plan
> y el Testing Contract describen lo ya construido; el código es la fuente de verdad.
> Supera la versión 2026-10-01 (modelo viejo: `oms.pedidos`, cola
> `TPEXES/TPEXSI='DISP'`, dos escrituras D6, `analizador_observaciones` activo).

## Plan Approval

Revisa el `code-generation-plan.md` (con su Testing Contract embebido) y el
`unit-test-instructions.md` de esta unidad. El plan refleja el motor de reglas del
OMS ya construido en `backend/oms/src/` + `sql/47` + tests, con el desacople
priorización↔liberación (ADR-013): dos pasadas (priorizar deja `DISP`; liberar por
ventana `dispatch_date − dias_prep_picking` escribe `GENE`+`PRIORIDAD` por la costura
y estampa `oms_processed_at`), acción manual "Procesar a Eflow" gated por rol,
polling por `planning_run_id`/`oms_processed_at`, y los conteos reales 36/287.

[Approval Fingerprint]: sha256:6a80f305bdc429e6ea39e572c8aa57f1cf9cbcf5b2b3dc51302fa6bad084a776

- "Approve Plan" — proceed to code generation
- "Request Changes" — revise the plan

[Answer]: Approve Plan

# Functional Design U1 — memoria

## Interpretations
- 2026-09-01T15:03:53Z — unidad ui: sin entities.md/rules.md requeridos, pero se crea rules.md (BR1.1-1.4) para el sensor traceability. Modelo = Pedido.tipo opcional. Geometria por leg via OSRM steps=true.

## Deviations
- 2026-09-01T15:03:53Z — se agrego rules.md aunque produces_kinds no lo pide para ui, porque el sensor traceability lo exige (busca BR IDs en rules.md).

## Tradeoffs

## Open questions
- 2026-09-01T15:03:53Z — steps=true en OSRM para ~20 paradas: medir en build-and-test.

## Deviations (rev 2, tras adversarial NOT-READY)
- 2026-09-01T15:10:22Z — 3 hallazgos reales: (Critical) el badge iba aria-hidden -> ahora texto visible "Devolucion" es el nombre accesible, sin aria-label en div sin role; (Major) optimizarConCapacidad devuelve solo excluidosCount -> cambio de firma a excluidos[]; (Major) CapacityBar generico -> ConfiguracionRuta recibe props devolucionesCount/Peso/Volumen desde NuevaRutaTab.

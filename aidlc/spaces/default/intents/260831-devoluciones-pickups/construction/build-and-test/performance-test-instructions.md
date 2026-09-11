# Performance Test Instructions — FR16

`requirements.md` NFR-1 no fija un objetivo de rendimiento nuevo: sumar N
devoluciones a la matriz de distancias y al bin-packing es marginal frente al
volumen de entregas ya existente.

## Verificación manual (no automatizada, no bloqueante)

- Confirmar que `obtenerGeometriaRutaPorLeg` con `steps=true` no degrada
  perceptiblemente el tiempo de "Optimizar paradas" para ~20 paradas (open
  question de `functional-spec.md`). Sin umbral formal — evaluar
  cualitativamente en la demo.
- Confirmar que renderizar N `<Polyline>` (una por leg) en vez de 1 no
  introduce jank visible en el mapa con ~20 paradas.

Sin test automatizado de performance en este ciclo — no hay presupuesto de
latencia comprometido (NFR-1 = N/A en requirements-analysis).

# Cross-Unit Final Coverage Gate — FR16

Verifica que todo `FR`/`NFR` de
`../../inception/requirements-analysis/requirements.md` esté cubierto, vía la
cadena FR → BR (`.../functional-design/traceability.json`) → código/test
(`.../code-generation/traceability.json`). Sin `user-stories` (etapa saltada).

## Verdicto: **PASS**

Todo requisito en alcance (FR16.1–16.3 + NFR-3) tiene cobertura `OK` con
target existente. FR16.4 y NFR-1/NFR-2 son `N/A` por diseño (fuera de alcance
/ sin objetivo nuevo), consistente en las tres etapas.

## Cobertura por ID

| ID | Owning Unit | BR (functional-design) | Target (code-generation) | Estado |
|----|-------------|------------------------|---------------------------|--------|
| FR16 | U1 | BR1.1 | `types.ts`, `optimize-stops.test.ts`, `fallback-viajes.ts` | OK |
| FR2 | U1 | BR1.2 | `capacity-fit.ts`, `capacity-fit.test.ts` | OK |
| FR16.1 | U1 | BR1.1 | `types.ts`, `optimize-stops.test.ts`, `fallback-viajes.ts` / `fallback-pedidos.ts` | OK |
| FR16.1.1 | U1 | BR1.1 | `types.ts` (`Pedido.tipo?`) | OK |
| FR16.1.2 | U1 | — | Regla de negocio del WMS (Ricardo); U1 solo consume | N/A |
| FR16.1.3 | U1 | — | Filtro del WMS; U1 lista lo que recibe | N/A |
| FR16.2 | U1 | BR1.4 | `TipoParadaBadge.tsx`, `PedidoCard.tsx`, `ParadaCard.tsx` | OK |
| FR16.2.1 | U1 | BR1.4 | `TipoParadaBadge.tsx` + test | OK |
| FR16.2.2 | U1 | BR1.3 | `route-geometry.ts` (`obtenerGeometriaRutaPorLeg`), `RutaMapaPreview.tsx`, `route-geometry.test.ts` | OK |
| FR16.2.3 | U1 | BR1.4 | `PedidoCard.tsx` / `ParadaCard.tsx` (borde tipo + badges de estado separados) | OK |
| FR16.3 | U1 | BR1.2 | `capacity-fit.ts`, `capacity-fit.test.ts` | OK |
| FR16.3.1 | U1 | BR1.2 | `capacity-fit.ts`, `NuevaRutaTab.tsx` (aviso por tipo) | OK |
| FR16.3.2 | U1 | — | Deferred → FR16.4 (fuera de alcance de este ciclo) | Deferred |
| FR16.4 | — | — | Fuera de alcance de este ciclo (`requirements.md` Out of scope) | N/A |
| NFR-1 | U1 | — | Sin objetivo nuevo; ver `performance-test-instructions.md` | N/A |
| NFR-2 | U1 | — | Sin cambios de seguridad; ver `security-test-instructions.md` | N/A |
| NFR-3 | U1 | BR1.4 | `TipoParadaBadge.tsx`, `accessibility-checklist.md` (refined-mockups) | OK |

## Elementos sin cobertura

Ninguno. Todos los IDs enumerados en `requirements.md` están `OK`, `N/A`
(justificado) o `Deferred` (justificado, hacia FR16.4).

## Assumptions & Open Questions

- Sin `stories.md` — la cadena de trazabilidad usa FR directamente, como en
  `units-generation` y `functional-design`.

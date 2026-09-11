# Unit of Work — Story Map (FR16)

La etapa de User Stories está saltada en este ciclo; el mapa relaciona cada
requisito funcional de `../requirements-analysis/requirements.md` con la única
unidad `U1` (`u1-devoluciones-en-secuencia`).

## Mapa requisito → unidad

| Requisito | Unit | Directory | Orden dentro de la unidad | Nota |
|-----------|------|-----------|---------------------------|------|
| FR16 | U1 | `u1-devoluciones-en-secuencia` | — | Requisito paraguas |
| FR2 | U1 | `u1-devoluciones-en-secuencia` | 2 | Bin-packing existente que FR16.3 extiende |
| FR16.1 | U1 | `u1-devoluciones-en-secuencia` | 3 | Ingesta de la recolección como parada |
| FR16.1.1 | U1 | `u1-devoluciones-en-secuencia` | 3 | Dato mínimo (shape de Pedido + tipo) |
| FR16.1.2 | U1 | `u1-devoluciones-en-secuencia` | 3 | Llega asignada al viaje |
| FR16.1.3 | U1 | `u1-devoluciones-en-secuencia` | 3 | Solo viajes en el muelle |
| FR16.2 | U1 | `u1-devoluciones-en-secuencia` | 1 | Distinción visual |
| FR16.2.1 | U1 | `u1-devoluciones-en-secuencia` | 1 | Badge + ícono + etiqueta |
| FR16.2.2 | U1 | `u1-devoluciones-en-secuencia` | 1 | Tramos del mapa por color/patrón |
| FR16.2.3 | U1 | `u1-devoluciones-en-secuencia` | 1 | Regla tipo+estado separados |
| FR16.3 | U1 | `u1-devoluciones-en-secuencia` | 2 | Devolución en el cálculo de capacidad |
| FR16.3.1 | U1 | `u1-devoluciones-en-secuencia` | 2 | Exclusión por capacidad con aviso FR2 |
| FR16.3.2 | U1 | `u1-devoluciones-en-secuencia` | 2 | Recolección intermedia que no cabe = excluida sin reordenar (el reordenamiento es FR16.4, fuera) |
| FR16.4 | — | — | — | Fuera de alcance de este ciclo |
| NFR-1 | U1 | `u1-devoluciones-en-secuencia` | — | Sin objetivo nuevo |
| NFR-2 | U1 | `u1-devoluciones-en-secuencia` | — | Sin cambios de seguridad |
| NFR-3 | U1 | `u1-devoluciones-en-secuencia` | 1 | Accesibilidad WCAG 2.1 AA |

## Cross-cutting

- `Pedido.tipo` es transversal a FR16.1–16.3, pero todo vive en U1.

## Verificación de cobertura

- Todos los requisitos en alcance → U1. FR16.4 explícitamente fuera de alcance.
- U1 tiene requisitos asignados. Sin unidades huérfanas.

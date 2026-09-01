# Feasibility Assessment — Devoluciones/Pickups (FR16)

Evalúa la viabilidad de FR16 según el problema y el alcance definidos en
`../intent-capture/intent-statement.md` (incorporar recolecciones conocidas a la
secuencia de paradas, distinguirlas visualmente, sumarlas a capacidad, y
soportar el caso "al pie de camión").

## Viabilidad técnica

| Sub-requisito | Viabilidad | Base |
|---------------|------------|------|
| FR16.1 — incluir recolecciones conocidas como paradas | **Alta** | Extiende la construcción de la secuencia de paradas ya existente (`src/pages/planificacion/optimize-stops.ts`); una recolección es una parada más con un flag de tipo. |
| FR16.2 — distinción visual entregas vs. devoluciones | **Alta** | Cambio de UI acotado en `ParadaCard.tsx` / `PedidoCard.tsx` y el render del mapa; ya hay precedente con el marcado de "fuera de ventana" y de "excepción". |
| FR16.3 — sumar volumen/peso de la devolución a capacidad | **Alta** | El bin-packing de capacidad (`capacity-fit.ts` / FR2) ya trata cada pedido con peso y volumen; una devolución conocida entra igual, puede forzar exclusiones con el mismo aviso. |
| FR16.4 — recolección "al pie de camión" (recálculo en vivo) | **Media** | Hoy la optimización de la ruta es **previa al despacho**, no en tiempo real. Requiere: (a) insertar una parada en una ruta ya generada, (b) recalcular secuencia y capacidad restante, (c) posiblemente invertir el orden de paradas siguientes. Es incremento nuevo, no extensión directa. |

**Conclusión:** FR16.1–16.3 son viables con extensión directa del módulo actual
y bajo riesgo. FR16.4 es viable pero es el trozo con mayor incertidumbre de
diseño; conviene desdoblarlo.

## Análisis de riesgo

- **Riesgo técnico:** bajo para FR16.1–16.3; medio para FR16.4 (recálculo en
  vivo sobre una ruta ya generada — patrón que el módulo no tiene todavía).
- **Riesgo de datos:** la forma y el estado que necesita una "recolección"
  para insertarse en la ruta no está definido (OQ-4 de `requirements.md`).
  Bloquea el diseño de FR16.1 y FR16.4 hasta el sync con el equipo de
  Devoluciones.
- **Riesgo de negocio:** bajo. Herramienta interna de TMS, cambio de frontend
  reversible, sin dinero ni compliance directos.
- **Riesgo de medición:** no hay métrica de éxito comprometida (heredado de la
  revisión de `intent-capture`); sin ella no se puede validar objetivamente el
  resultado.

## Equipo, stack y costo

- El módulo de Planificación lo construyó y mantiene este mismo equipo
  (Vite + React + Supabase + TypeScript). No hacen falta capacidades nuevas.
- Sin infraestructura AWS propia — el módulo corre sobre Supabase y se
  despliega con la app existente.
- Sin presupuesto ni fecha límite formal. El ritmo lo marca el cierre de OQ-4.

## Recomendación

Proceder. Separar la entrega en dos frentes:

1. **FR16.1–16.3** — avanzables ya, no dependen de OQ-4 (aunque la forma final
   del dato de entrada se confirmará en `requirements-analysis`).
2. **FR16.4** — diseñar después de cerrar OQ-4 y la regla formal de "cabe" con
   el equipo de Devoluciones.

## Assumptions & Open Questions

- [assumption] La recolección conocida llegará por el mismo canal WMS/Iflow que
  hoy alimenta los viajes, hasta que exista el módulo de Devoluciones.
- Open question: OQ-4 — qué campos/estado necesita una recolección para
  insertarse en una ruta (ver `../intent-capture/intent-statement.md` y
  `requirements.md` del intent 260825).
- Open question: regla formal de "cabe" para FR16.4.
- Open question: métrica de éxito objetivo con umbral (a cerrar en
  `requirements-analysis` con Ana/negocio).

# Bitácora de trabajo — 2026-10-06 (tarde) · UX de planificación: paradas colapsables, cerrar modal al click afuera y punto compartido

> **Autor:** Jesús Araujo
> Tres mejoras de layout/UX en las tarjetas de viaje de Planificación, pedidas tras ver la demo.

---

## 0. Resumen

1. Lista de paradas **colapsada a 3** con botón "Ver todas" — el div ya no crece infinito.
2. **Todos los modales se cierran al hacer click afuera** (y con Escape).
3. Un punto del mapa con **varios pedidos** (misma coordenada) abre una **tabla de ese punto**; al tocar una fila, su detalle. Incluye el fix del z-index.

---

## 1. Paradas colapsables (> 3)

`components/PlanTripCard.tsx`: la `<ol>` de paradas muestra solo las **primeras 3**; si el viaje tiene más, aparece el botón **"Ver las {{count}} paradas" / "Ver menos"** (estado `verTodasParadas`). Evita tarjetas kilométricas cuando un viaje lleva 16-20 paradas.

## 2. Cerrar modal al click afuera

`pages/configuracion/components/AdminModal.tsx` (modal compartido del design system): el backdrop ahora tiene `onClick={onClose}` y el panel interno `stopPropagation`; además cierra con **Escape** (`role="dialog"` / `aria-modal`). Como es el modal base, el cambio aplica a **todos** los modales: detalle de parada, ver pedidos, punto compartido, y los de configuración.

## 3. Punto del mapa con varios pedidos

Antes, al clickear un pin donde 2+ pedidos comparten coordenadas, se abría uno "al azar". Ahora:
- Nuevo **`components/PuntoModal.tsx`**: tabla de los pedidos de ese punto (#, cliente, nº pedido, peso). Cada fila es clickable → abre el detalle (`ParadaModal`).
- `PlanTripCard.abrirDesdeMapa(orderId)`: agrupa las paradas por coordenadas; si el punto tiene >1 pedido abre `PuntoModal`, si es uno solo va directo al detalle. La lista de la tarjeta sigue abriendo el detalle por pedido (ahí no hay ambigüedad).

### Fix de z-index (bug reportado)
`ParadaModal` y `PuntoModal` comparten `z-[1100]`, así que el apilamiento lo decide el orden en el DOM. El detalle salía **detrás** de la tabla porque se renderizaba antes. **Solución:** renderizar `ParadaModal` **de último** en `PlanTripCard` → queda encima. Al cerrarlo se vuelve a la tabla del punto; al cerrar la tabla, a la tarjeta.

## i18n

`planning.viewAllStops`, `planning.viewLessStops`, `planning.pointOrders`, `planning.pointOrdersHint` en ES y EN.

---

## Verificación

- `type-check`: los archivos tocados sin errores (persisten los preexistentes en tests/mocks).
- Probado por HMR en `localhost:3002`.

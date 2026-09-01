# Functional Design — U1 (u1-devoluciones-en-secuencia)

Contexto: `../../../inception/units-generation/unit-of-work.md`,
`../../../inception/requirements-analysis/requirements.md`,
`../../../inception/domain-design/components.md`, y el código actual
(`src/pages/planificacion/`).

## Q1. ¿El atributo `tipo` en `Pedido` — dónde se define y con qué valores?

- A. En `src/pages/planificacion/types.ts`: `tipo?: 'entrega' | 'devolucion'` en la interfaz `Pedido` (y por herencia en `PedidoSeleccionado`). Opcional; ausente = `'entrega'` (retro-compatible con los datos actuales sin `tipo`).
- B. Un enum/type aparte.
- X. Other (please specify)

[Answer]: A. `tipo?: 'entrega' | 'devolucion'` en `Pedido` (types.ts). Ausente ⇒ trato como `entrega`. `fallback-viajes.ts`/`fallback-pedidos.ts` y `viajes-api.ts` lo asignan; el mock puede marcar 1–2 paradas como `devolucion` para la demo.

## Q2. ¿Cómo participa la devolución en el bin-packing (`capacity-fit.ts`)?

- A. Sin cambios de algoritmo. `seleccionarPorCapacidad` ya suma `total_weight`/`total_volume` por pedido; una devolución entra igual. Solo cambia el texto del aviso de exclusión para poder nombrar el tipo. FR16.3.2 (posicional) NO se implementa.
- B. Se agrega lógica de carga remanente por parada.
- X. Other (please specify)

[Answer]: A. El bin-packing no distingue tipo (vehículo completo). Cambio mínimo: el mensaje de exclusión puede decir "1 devolución excluida" vs "1 pedido excluido". Sin lógica posicional.

## Q3. ¿Cómo se colorean los tramos de la ruta en el mapa (FR16.2.2)?

- A. `route-geometry.ts` pasa a devolver la geometría **por leg**: llama a OSRM `/route` con `steps=true`, toma `routes[0].legs[]` (N-1 legs, uno por par de paradas consecutivas), y devuelve `Array<{ coords: [lat,lng][]; fromStopNumber; toStopNumber }>`. Fallback: un segmento recto por leg. `RutaMapaPreview` renderiza una `<Polyline>` por leg: `teal` sólido si ambos extremos son `entrega`, `indigo` `dashArray:"6 6"` si alguno es `devolucion`.
- B. Se mantiene una sola polilínea y solo se colorean los pines.
- X. Other (please specify)

[Answer]: A. Geometría por leg desde OSRM `/route?steps=true` (fallback recto). Una `<Polyline>` por leg, color/patrón por tipo de sus extremos.

## Q4. ¿Qué componentes/archivos toca la unidad?

- A. `types.ts` (tipo), `viajes-api.ts` + `fallback-viajes.ts`/`fallback-pedidos.ts` (asignar tipo), `optimize-stops.ts` (nada — ya trata cualquier pedido), `capacity-fit.ts` (texto de aviso), `route-geometry.ts` (geometría por leg), `RutaMapaPreview.tsx` (polilíneas + pin + leyenda), `PedidoCard.tsx` + `ParadaCard.tsx` (borde/badge indigo), nuevo `TipoParadaBadge.tsx`, `CapacityBar`/`ConfiguracionRuta.tsx` (línea "incluye N de devoluciones").
- X. Other (please specify)

[Answer]: A. Esa lista. `optimize-stops.ts` no cambia (el vecino-más-cercano ya ordena cualquier pedido, con o sin coords).

## Q5. ¿Reglas de negocio nuevas (BR)?

- A. Sí, pocas y simples: BR1.1 una parada sin `tipo` se trata como entrega; BR1.2 una devolución cuenta en capacidad igual que una entrega; BR1.3 un leg del mapa es "de recolección" si su parada origen o destino es devolución; BR1.4 la distinción visual siempre lleva ícono+texto además de color.
- B. Ninguna regla nueva.
- X. Other (please specify)

[Answer]: A. BR1.1–BR1.4 como arriba (validación / cálculo / policy).

## Consolidated Summary Confirmation

Resumen de lo que voy a plasmar en functional-spec.md, frontend-components.md y traceability.json (U1):

- **Modelo:** `Pedido.tipo?: 'entrega' | 'devolucion'` en `types.ts`; ausente ⇒ entrega. Sin entidad nueva.
- **Secuencia:** `optimize-stops.ts` sin cambios (ya ordena cualquier pedido). `ViajesAdapter` asigna `tipo`.
- **Capacidad:** `capacity-fit.ts` sin cambio de algoritmo; solo el texto del aviso de exclusión nombra el tipo. FR16.3.2 posicional NO se implementa.
- **Mapa (FR16.2.2):** `route-geometry.ts` devuelve geometría por leg (OSRM `/route?steps=true`, fallback recto). `RutaMapaPreview` dibuja una `<Polyline>` por leg (teal sólido / indigo discontinuo por tipo de extremos) + pin por tipo + leyenda.
- **Visual:** nuevo `TipoParadaBadge.tsx`; borde+badge indigo en `PedidoCard`/`ParadaCard`; línea "incluye N de devoluciones" en la barra de capacidad.
- **Reglas (rules en functional-spec):** BR1.1 sin tipo = entrega; BR1.2 devolución cuenta en capacidad igual que entrega; BR1.3 leg "de recolección" si origen o destino es devolución; BR1.4 distinción siempre ícono+texto además de color.
- **Workflows:** (1) seleccionar viaje → ver paradas con tipo; (2) optimizar → secuencia con devoluciones + mapa con tramos coloreados; (3) exclusión por capacidad con aviso por tipo.
- **traceability.json:** cada AC/FR16.x de U1 → BR1.x correspondiente.

- Looks correct
- Request changes

[Answer]: Looks correct

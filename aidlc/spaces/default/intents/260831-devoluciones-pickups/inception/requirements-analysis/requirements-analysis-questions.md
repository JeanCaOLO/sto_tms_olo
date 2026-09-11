# Requirements Analysis — Preguntas

Contexto de `../../ideation/intent-capture/intent-statement.md` y
`../../ideation/scope-definition/scope-document.md`. FR16 detallado (heredado)
en `aidlc/spaces/default/intents/260825-route-planning-reqs/inception/requirements-analysis/requirements.md`.

## Q1. ¿Qué datos mínimos necesita una "recolección conocida" para insertarse como parada? (respuesta operativa a OQ-4 mientras no haya sync con Devoluciones)

- A. Cliente (código + nombre + dirección), coordenadas si existen, peso, volumen, tipo = devolución, referencia al viaje (journey_id) y número de pedido/guía. Es el mismo shape que un pedido de entrega más un flag de tipo.
- B. Solo peso y volumen + tipo.
- C. Se define entero en el sync con Devoluciones; no asumir nada.
- X. Other (please specify)

[Answer]: A. Mismo shape que un pedido de entrega (`Pedido` en `src/pages/planificacion/types.ts`) + `tipo: 'devolucion'`. Campos: customer (code/name/address), delivery_latitude/longitude opcionales, total_weight, total_volume, order_number, referencia al viaje. Se marca como supuesto de trabajo hasta el sync; si Devoluciones pide más, FR16.1 crece pero el resto no.

## Q2. ¿Cuál es la métrica de éxito objetivo con umbral? (resuelve el hueco de intent-capture)

- A. Métrica primaria: % de recolecciones conocidas incluidas automáticamente en la secuencia = 100% (ninguna recolección conocida se coordina por fuera). Secundaria: el planificador arma una ruta con entregas + devoluciones en un solo flujo (sin pasos extra).
- B. Reducción del tiempo de planificación en X%.
- C. Se deja sin métrica.
- X. Other (please specify)

[Answer]: A. Primaria: 100% de las recolecciones conocidas (las que el WMS manda en el viaje) aparecen en la secuencia sin intervención manual. Secundaria (cualitativa): cero pasos adicionales para el planificador respecto al flujo de solo-entregas. Ambas verificables con la suite e2e.

## Q3. ¿Cómo se comporta el sistema si una devolución conocida no cabe por capacidad?

- A. Igual que un pedido de entrega excluido por FR2: se marca como excluida con el mismo aviso visual, y el planificador decide (excluir otra parada, cambiar vehículo). El sistema no reordena automáticamente para hacerla caber en este ciclo (eso es FR16.4).
- B. El sistema reordena automáticamente para que quepa.
- C. La devolución siempre tiene prioridad sobre las entregas.
- X. Other (please specify)

[Answer]: A. Mismo tratamiento que cualquier exclusión por capacidad de FR2. Sin reordenamiento automático (eso es FR16.4, fuera de alcance).

## Q4. ¿Una devolución sin coordenadas cómo se maneja?

- A. Igual que hoy una entrega sin coordenadas: se muestra su dirección cruda, queda fuera del cálculo de ruta óptima, y se marca visualmente (patrón de "excepción" existente) — combinado con el marcado de devolución.
- B. Se rechaza / no se incluye.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Reutiliza el patrón de excepción existente (`is_exception` / `exception_address_raw`), más el marcado de tipo devolución.

## Q5. ¿Hay NFR específicos (rendimiento, seguridad) para FR16?

- A. Ninguno nuevo. El cálculo de secuencia y capacidad ya corre en el cliente en tiempos aceptables con ~20 paradas; sumar devoluciones no cambia el orden de magnitud. Seguridad: sin cambios (mismos datos, mismo Supabase/RLS).
- B. Sí, hay un requisito de rendimiento (especificar en Other).
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Sin NFR nuevos. El impacto en rendimiento de sumar N devoluciones a la matriz de distancias y al bin-packing es marginal frente a las entregas ya existentes.

## Q6. ¿Qué queda explícitamente fuera de esta especificación?

- A. FR16.4 (recolección "al pie de camión" / recálculo en vivo); la creación de la solicitud de devolución; la recepción física / cita de andén; las reglas de negocio de aceptación de un pickup. Todo eso es del futuro módulo de Devoluciones o de un ciclo posterior.
- B. Solo FR16.4.
- C. Not yet defined.
- X. Other (please specify)

[Answer]: A. Igual que el scope-document: FR16.4 y todo el ciclo de devolución fuera del módulo.


## Requested Changes Feedback (1)

**Fecha:** 
**Qué cambia (de la reunión que pegó el usuario):**
1. FR16.2 — los tramos de la ruta en el mapa se colorean por tipo (verde = entrega, rojo/otro = recolección), además del marcado de pines/cards.
2. Reordenamiento por espacio (punto de Ana): recolección conocida en una parada intermedia que no cabe en ese punto del recorrido — en este ciclo se marca excluida y la maneja el planificador; el reordenamiento automático (entregar paradas siguientes primero) es FR16.4, fuera de alcance, pero es el open question #1 a cerrar con Ana/Ricardo.
3. Responsable de reglas de negocio = Ricardo (no Jesús). Anotar en el contrato de datos / stakeholders.
4. Contexto: el catálogo de rutas viene de un archivo del cliente (lago TMS: rutas + hora de salida + días, tipo urbana/rural, + archivo Venezuela); los viajes listados son solo los que ya están "en el muelle" con número de viaje asignado.

[Answer]: Incorporado a Q2/Q3 y a los open questions; ver resumen actualizado.

## Consolidated Summary Confirmation

Resumen actualizado (con los 4 cambios de la reunión) de lo que voy a plasmar en requirements.md:

- **FR16.1** — Incluir las recolecciones conocidas del viaje como paradas adicionales en la secuencia. Dato mínimo (supuesto de trabajo para OQ-4): mismo shape que un pedido de entrega + `tipo: devolucion`. Responsable de la regla de negocio: **Ricardo**.
- **FR16.2** — Distinción visual de las devoluciones: (a) en lista/card/pin: color de acento + ícono + etiqueta; (b) **en el mapa, los tramos de la ruta se colorean por tipo** — verde = tramo de entrega, rojo/otro = tramo de/hacia una recolección. Nunca solo color.
- **FR16.3** — Sumar peso/volumen de la devolución al bin-packing (FR2). Si una recolección conocida en una parada intermedia no cabe en ese punto del recorrido: se marca excluida con el aviso de FR2 y el planificador la maneja a mano. **Sin reordenamiento automático** (entregar paradas siguientes primero para liberar espacio) — eso es FR16.4.
- **Devolución sin coordenadas** — patrón de excepción existente + marcado de tipo.
- **Métrica de éxito (primaria):** 100% de las recolecciones conocidas del viaje aparecen en la secuencia sin intervención manual. Secundaria: cero pasos extra para el planificador. Verificables con la suite e2e.
- **NFR:** ninguno nuevo.
- **Fuera de alcance:** FR16.4 (incluye el reordenamiento por espacio de Ana), creación de solicitud de devolución, recepción física / cita de andén, reglas de aceptación de pickup.
- **Contexto:** el catálogo de rutas viene de un archivo del cliente (lago TMS: rutas + hora de salida + días; tipo urbana/rural; + archivo Venezuela). Los viajes listados son solo los que ya están "en el muelle" con número de viaje asignado.
- **Open questions:** (#1) regla del reordenamiento por espacio para una recolección intermedia (FR16.4) — cerrar con Ana/Ricardo; (#2) confirmación formal de OQ-4 con el equipo de Devoluciones; (#3) qué módulo mantiene la tabla de rutas.

- Looks correct
- Request changes

[Answer]: Looks correct

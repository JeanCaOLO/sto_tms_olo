# Requirements — Devoluciones/Pickups en la secuencia de paradas (FR16)

Especificación de esta iniciativa. Deriva de
`../../ideation/intent-capture/intent-statement.md` y
`../../ideation/scope-definition/scope-document.md`. Los IDs `FR16.x` son claves
de trazabilidad heredadas de
`aidlc/spaces/default/intents/260825-route-planning-reqs/inception/requirements-analysis/requirements.md`
y se preservan sin renumerar.

## Análisis del intent

El planificador de rutas quiere armar una ruta que ya contemple las
recolecciones/devoluciones conocidas del viaje, junto con las entregas, sin
coordinarlas por fuera del módulo. Objetivo (no solo features): que el flujo de
"solo entregas" que ya existe pase a ser "entregas + recolecciones" sin pasos
adicionales para el planificador. Es una extensión de un módulo ya construido
(`src/pages/planificacion/`), no una reconstrucción.

## Requerimientos funcionales

### FR16.1 — Incluir recolecciones conocidas en la secuencia de paradas

Al generar la secuencia de paradas de un viaje, el sistema incorpora las
recolecciones (devoluciones) que ya vienen conocidas en ese viaje como paradas
adicionales, no solo las entregas.

- **FR16.1.1** — Dato mínimo de una recolección conocida (supuesto de trabajo
  hasta cerrar OQ-4, ver Open Questions): el mismo shape que un pedido de
  entrega (`Pedido` en `src/pages/planificacion/types.ts`) más `tipo:
  'devolucion'` — cliente (código, nombre, dirección), `delivery_latitude` /
  `delivery_longitude` opcionales, `total_weight`, `total_volume`,
  `order_number`, referencia al viaje.
- **FR16.1.2** — La recolección conocida llega ya asignada a un viaje desde el
  WMS/Iflow; el planificador no la asigna a un viaje (regla de negocio
  responsable: **Ricardo**).
- **FR16.1.3** — Solo se listan las recolecciones de viajes que ya están "en el
  muelle" con número de viaje asignado, igual que las entregas.

**Acceptance (BDD):**
- Dado un viaje con 3 entregas y 1 recolección conocida, When el planificador
  genera la secuencia de paradas, Then la recolección aparece como una parada
  más en el resultado, sin flujo separado.

### FR16.2 — Distinción visual de las paradas de devolución

Las paradas de devolución se distinguen de las de entrega en todas las vistas,
sin depender solo del color (WCAG 2.1 AA).

- **FR16.2.1** — En lista de paradas, card de pedido y pin del mapa: color de
  acento propio + ícono + etiqueta "Devolución". El color de acento no es el
  amber (ya usado por "fuera de ventana"/"excepción").
- **FR16.2.2** — En el mapa, los **tramos de la ruta** se colorean por tipo:
  verde = tramo de entrega; rojo (u otro acento reservado) = tramo de/hacia una
  recolección.
- **FR16.2.3** — Una devolución que además es excepción (sin coordenadas) o cae
  fuera de ventana combina ambos indicadores; la regla exacta de combinación se
  fija en refined-mockups.

**Acceptance (BDD):**
- Dado una secuencia con entregas y devoluciones mezcladas, When se renderizan
  la lista y el mapa, Then cada parada y cada tramo de devolución se distingue
  de las de entrega por color + ícono/etiqueta, sin abrir el detalle.

### FR16.3 — Devolución conocida en el cálculo de capacidad

El volumen/peso de una devolución conocida se suma al cálculo de capacidad del
vehículo (bin-packing, FR2) igual que un pedido de entrega.

- **FR16.3.1** — La devolución puede quedar excluida por capacidad, o forzar la
  exclusión de otro pedido de entrega, con el mismo aviso visual que FR2 usa
  para cualquier exclusión por capacidad.
- **FR16.3.2** — Si una recolección conocida en una parada intermedia no cabe
  en ese punto del recorrido (el camión todavía lleva la carga de paradas
  posteriores), en este ciclo se marca como excluida y el planificador la
  resuelve a mano (excluir otra parada, cambiar vehículo). **No hay
  reordenamiento automático** de la secuencia.

**Acceptance (BDD):**
- Dado un vehículo con 100 kg de capacidad restante tras las entregas y una
  devolución conocida de 150 kg, When se ejecuta el bin-packing, Then la
  devolución se trata igual que un pedido de entrega para capacidad — puede
  quedar excluida o forzar otra exclusión, con el aviso de FR2.

### FR16.4 — Recolección "al pie de camión" y reordenamiento por espacio

**FUERA DEL ALCANCE DE ESTE CICLO.** Incluye: insertar una recolección no
planificada en una ruta ya generada; recalcular secuencia y capacidad restante
en vivo; y el reordenamiento por espacio que planteó Ana (entregar las paradas
siguientes antes de ejecutar una recolección intermedia que no cabe). Depende de
OQ-4, de la regla formal de "cabe", y de un flujo de recálculo en tiempo real
que hoy no existe. Ver `../../ideation/feasibility/feasibility-assessment.md`.

## Requerimientos no funcionales

- **NFR-1 (rendimiento)** — Sin objetivo nuevo. Sumar N devoluciones a la
  matriz de distancias y al bin-packing tiene impacto marginal frente al
  volumen de entregas ya existente; el cálculo sigue corriendo en el cliente en
  tiempos aceptables (~20 paradas hoy).
- **NFR-2 (seguridad)** — Sin cambios. Mismos datos, mismo Supabase/RLS.
- **NFR-3 (accesibilidad)** — WCAG 2.1 AA: distinción de tipo no-solo-color,
  contraste AA en los acentos, navegable por teclado (línea base ya verificada
  por la suite e2e).

## Métricas de éxito

- **Primaria:** 100% de las recolecciones conocidas que el WMS manda en un
  viaje aparecen en la secuencia de paradas sin intervención manual del
  planificador. Verificable con la suite e2e.
- **Secundaria (cualitativa):** cero pasos adicionales para el planificador
  respecto al flujo de solo-entregas.

## Constraints

- La asignación viaje↔pedidos llega resuelta del WMS y el TMS no la recalcula
  (`../../ideation/feasibility/constraint-register.md` CT-2).
- Las tablas `trips`/`trip_orders` reales aún no existen en Supabase; el módulo
  trabaja con mocks (`MOCKING.md`).
- Stack fijo Vite + React + Supabase + TypeScript; sin infraestructura AWS ni
  requisitos regulatorios formales.
- El catálogo de rutas proviene de un archivo que entrega el cliente (lago
  TMS: rutas + hora de salida + días; tipo urbana/rural; hay un archivo
  equivalente para Venezuela). Qué módulo mantiene esa tabla está sin definir.

## Assumptions

- [assumption] Una devolución conocida se modela como "pedido + `tipo:
  devolucion`"; si el sync con Devoluciones (OQ-4) pide más campos/estado,
  FR16.1 crece pero FR16.2/16.3 no.
- [assumption] Ana dará visto bueno explícito del recorte a FR16.1–16.3.

## Out of scope

- FR16.4 completo (recolección "al pie de camión", recálculo en vivo,
  reordenamiento por espacio).
- Creación de la solicitud de devolución; recepción física en el CD;
  cita/orden de recepción en andén; reglas de negocio de aceptación de un
  pickup (ventana, % de costo). Todo del futuro módulo de Devoluciones.
- Trazado de la ruta generada hacia el tracker/Track de los choferes
  (mencionado como deseable, sin diseño).

## Open questions

1. **Reordenamiento por espacio (FR16.4):** cuando una recolección conocida
   cae en una parada intermedia y no cabe ahí, ¿el sistema debe reordenar
   (entregar C y D antes de recoger en B)? — cerrar con Ana y Ricardo.
2. **OQ-4:** forma y estado exactos que necesita una recolección para
   insertarse; recálculo automático vs. asistido — sync formal con el equipo de
   Devoluciones (sin responsable asignado; Ricardo es el responsable de reglas
   de negocio).
3. Qué módulo mantiene la tabla/archivo de rutas del cliente.

## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-09-01T14:04:00Z
**Iteration:** 1
**Clase:** advisory (pase único; los hallazgos van al humano en el gate, sin ciclo de correcciones)

### Findings

| # | Severidad | Ubicación | Hallazgo | Recomendación |
|---|-----------|-----------|----------|---------------|
| 1 | Major | FR16.3.2 | "No cabe en ese punto del recorrido (el camión todavía lleva la carga de paradas posteriores)" describe un chequeo de capacidad **posicional/secuencial** que el bin-packing actual (FR2) no hace — FR2 es capacidad de vehículo completo. La regla formal de "cabe" está explícitamente diferida (open question #1). No hay criterio de aceptación BDD para FR16.3.2: el único BDD de FR16.3 cubre la exclusión simple 150 kg vs 100 kg. Tal como está, un desarrollador no puede implementar FR16.3.2 sin adivinar, y la capacidad que exige puede estar tan ausente como el recálculo en vivo de FR16.4. | Decidir una de dos: (a) mover el caso "recolección intermedia que no cabe en ese punto" a FR16.4/fuera de alcance junto con el reordenamiento por espacio, dejando FR16.3 solo con capacidad de vehículo completo; o (b) mantenerlo en alcance con una regla de "cabe" definida y su propio criterio de aceptación. Hoy es un punto medio no construible. |
| 2 | Major | Assumptions / Open questions #2 (OQ-4) | El contrato de datos de la recolección (FR16.1.1) es un supuesto de trabajo hasta el sync con Devoluciones, que sigue sin responsable ni fecha. domain-design y contract-design dependen de esto. Está correctamente registrado, pero el gate debería tratarlo como riesgo bloqueante para diseño técnico, no solo como nota. | Agendar el sync con Devoluciones y nombrar responsable antes de entrar a domain-design/contract-design. Para requirements-analysis el supuesto es aceptable; para avanzar a diseño no. |
| 3 | Minor | NFR-1 | "Tiempos aceptables (~20 paradas hoy)" no es un umbral verificable (regla de fase inception: evitar "aceptable" sin umbral medible). El BDD tampoco lo cubre. | Fijar un umbral (p. ej. "cálculo de secuencia + bin-packing < X s para 30 paradas en el cliente") o declarar explícitamente que se hereda el NFR de rendimiento del intent 260825 sin cambio. |
| 4 | Minor | FR16.2.3 | La regla de combinación devolución + excepción/fuera-de-ventana se difiere a refined-mockups; hasta entonces ese caso combinado no es testeable. Aceptable como diferimiento explícito. | Sin acción ahora; verificar que refined-mockups cierre la regla y añada criterio. |
| 5 | Minor | Assumptions ("Ana dará visto bueno explícito del recorte a FR16.1–16.3") | El recorte a FR16.1–16.3 es coherente con scope-document e intent-statement, pero el visto bueno explícito de Ana sobre este recorte sigue siendo un supuesto sin confirmar. | Confirmar con Ana en la próxima revisión por hito. |
| 6 | Minor | Acceptance (BDD) todas las FR | Formato mixto "Dado … When … Then" (regla de fase: Given/When/Then). Coherente y testeable, pero inconsistente. Además el doc perdió el encuadre actor/valor por requerimiento que tenía el FR16 padre (se cubre de forma global en "Análisis del intent"). | Normalizar el conector inicial ("Dado/Given") en las cuatro acceptance. Opcional: una línea actor/acción/valor por FR. |

### Summary

Los IDs FR16.1–16.4 del intent padre (260825) se preservan sin renumerar y los sub-IDs FR16.x.y son additivos correctos. Los dos bloqueadores Major de intent-capture están tratados en la medida en que esta etapa puede: la métrica de éxito ahora tiene umbral (100% de recolecciones conocidas sin intervención manual, verificable con e2e) y OQ-4 queda como supuesto de trabajo explícito + open question. El principal hallazgo sustantivo es FR16.3.2: describe un chequeo de capacidad posicional sin regla definida ni criterio de aceptación, en un punto medio no construible entre FR16.3 y el FR16.4 fuera de alcance — el humano debería resolver ese límite antes de aprobar. FR16.1, FR16.2 (incluye tramos de ruta coloreados) y el camino feliz de FR16.3 son implementables. Verdicto advisory: READY, con la recomendación de cerrar los hallazgos 1 y 2 antes de pasar a diseño técnico.

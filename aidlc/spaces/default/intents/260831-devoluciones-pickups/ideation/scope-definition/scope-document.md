# Scope Document — Devoluciones/Pickups (FR16)

Fija el límite in/out de esta iniciativa, a partir de
`../intent-capture/intent-statement.md`,
`../feasibility/feasibility-assessment.md` y
`../feasibility/constraint-register.md`.

## Dentro del alcance (MVS)

| FR | Capacidad | Prioridad |
|----|-----------|-----------|
| FR16.1 | Al generar la secuencia de paradas, incluir las recolecciones (devoluciones) ya conocidas como paradas adicionales, junto con las entregas. | Must-have |
| FR16.2 | Marcar visualmente las paradas de devolución con color distinto al de las entregas, en la lista y en el mapa. | Must-have |
| FR16.3 | Sumar el volumen/peso de una devolución conocida al cálculo de capacidad del vehículo (bin-packing, FR2), con el mismo aviso de exclusión por capacidad. | Must-have |

Con esto, el planificador arma una ruta que ya contempla las recolecciones
conocidas sin coordinarlas por fuera del módulo — el dolor principal descrito
en `../intent-capture/intent-statement.md`.

## Fuera del alcance de este ciclo

- **FR16.4 — recolección "al pie de camión"** (recálculo en vivo de secuencia y
  capacidad sobre una ruta ya generada). Incremento posterior. Motivo
  (`../feasibility/feasibility-assessment.md`): viabilidad MEDIA, no existe hoy
  un flujo de recálculo en tiempo real, y depende de OQ-4 y de la regla formal
  de "cabe". Se retoma como iniciativa/ciclo separado tras el sync con el
  equipo de Devoluciones.

## Fuera del alcance (del módulo)

Heredado de `../intent-capture/intent-statement.md` y del constraint register:
la creación de la solicitud de devolución, la recepción física en el CD, la
cita/orden de recepción en andén, y las reglas de negocio de cuándo se acepta
un pickup (ventana de tiempo, % de costo). Todo eso vive en el futuro módulo de
Devoluciones/logística inversa.

## Restricciones que acotan el diseño

De `../feasibility/constraint-register.md`: la asignación viaje↔pedidos llega
resuelta del WMS y el TMS no la recalcula (CT-2); la recolección conocida debe
llegar ya asignada a un viaje. Las tablas `trips`/`trip_orders` reales aún no
existen en Supabase (CT-4). No hay infraestructura AWS ni requisitos
regulatorios formales (CT-5, CR-1).

## Assumptions & Open Questions

- [assumption] Una devolución conocida se modela como "una parada más con tipo
  = devolución, peso y volumen"; la forma mínima exacta del dato se fija en
  `requirements-analysis`.
- Open question: OQ-4 (contrato de datos con Devoluciones) — condiciona FR16.1
  y todo FR16.4.

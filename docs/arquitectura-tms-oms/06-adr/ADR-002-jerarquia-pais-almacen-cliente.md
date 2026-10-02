# ADR-002 — Jerarquía País → Almacén → Cliente → Cliente Final

**Estado:** Propuesto

## Contexto

El modelo actual no tiene concepto de "almacén/operación" y usa `stores`
tanto para bodegas de origen como para destinos de entrega, mezclando dos
conceptos de negocio distintos. El prompt maestro (§4, §8) pide separar
correctamente `final_customers`/`delivery_points`/`addresses`/`contacts`.

## Decisión

Introducir `warehouses` como nivel explícito entre país y cliente. Separar
`final_customers` (dueño: `customers`), `delivery_points` (0..N por cliente
final), `addresses` y `contacts` como entidades propias. `stores` se
restringe a bodegas de origen (`is_origin=true`).

## Consecuencias

- Migración de datos no trivial: cada fila actual de `stores` con
  `is_origin=false` (o equivalente) se convierte en `final_customer` +
  `delivery_point` + `address`.
- Un cliente final puede tener 0 o varios puntos de entrega sin forzar un
  update de su fila principal.
- `UNIQUE(customer_id, external_code)` en vez de único global evita
  colisiones entre clientes distintos con el mismo código externo.

## Alternativas rechazadas

- **Mantener `stores` para todo** (estado actual): rechazado — ya está
  demostrado que mezcla dos conceptos y complica cualquier regla que
  dependa de "es un cliente final" vs "es mi bodega de origen".
- **Un solo campo `address` embebido en `final_customers`** (sin tabla
  `delivery_points` separada): rechazado — no soporta múltiples puntos de
  entrega por cliente final, requisito explícito de §4.

# Instrucciones de prueba — U2 `esquema-pedidos-oms` (spec)

> Intent: `260826-modulo-oms`. Unidad: U2 (kind `spec`). 2026-10-01.

## Naturaleza de la unidad

U2 es un **contrato de datos** (DDL de `oms.pedidos`), no un ejecutable. No lleva
tests unitarios propios: un `spec` se verifica por su **consumo** y por la
aplicación del DDL.

## Cómo se verifica

1. **Vía el consumidor (U1)**: el contrato de U2 se ejerce en los tests de U1
   (`backend/tests/test_oms.py`), donde el `HandoffPedidosOMS` escribe un
   `PedidoOMS` con la PK compuesta y el `estado_handoff`, y la corrida de punta a
   punta produce filas con `situacion='generada'`. Esos tests pasan (16/16).
2. **Aplicación del DDL** (cuando el dueño de backend lo integre): correr
   `sql/oms_pedidos.sql` contra una Aurora de dev debe crear `oms.pedidos` sin
   error, con la PK compuesta y el `CHECK (prioridad >= 1)`. La idempotencia del
   `UPSERT` se verifica insertando dos veces la misma PK y confirmando una sola
   fila con los valores actualizados.

## Qué NO se prueba aquí

- La escritura real a Aurora (el esqueleto corre en mock; se prueba al reactivar
  infrastructure-design y desplegar).

## Sources

- `backend/tests/test_oms.py` (consumo del contrato por U1).
- `sql/oms_pedidos.sql` (DDL a aplicar).

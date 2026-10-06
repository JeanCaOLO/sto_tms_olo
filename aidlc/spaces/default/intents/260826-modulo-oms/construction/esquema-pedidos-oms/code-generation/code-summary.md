# Resumen de código — U2 `esquema-pedidos-oms` (spec)

> Intent: `260826-modulo-oms`. Unidad: U2 (kind `spec`). 2026-10-01.

## Archivos

| Archivo | Rol |
|---|---|
| `sql/oms_pedidos.sql` | DDL de `oms.pedidos` (tabla propia del OMS, superficie de handoff). Esquema `oms`, PK compuesta, UPSERT idempotente, índices por `situacion` y `estado_handoff`, `CHECK (prioridad >= 1)`. |
| `backend/oms/src/models.py` → `PedidoOMS` | Contrato del esquema en el dominio (dataclass frozen) que consume U1 en la escritura 1 del handoff. |

## Contrato de la tabla `oms.pedidos`

- **PK**: `(id_almacen, id_compania, id_sucursal, id_expedicion)` — idempotencia.
- **Campos**: `prioridad` (int, numérica invertida, `>= 1`), `status`,
  `situacion` (`'generada'`), `estado_handoff` (`'disparo_pendiente'` |
  `'completado'`), `corrida`, `peso_total`/`cubicaje_total` (nullable),
  `creado_en`/`actualizado_en`.
- **Consumidores**: U1 (`HandoffPedidosOMS`, escritura 1) y Planificación
  (lectura del handoff, otro intent).

## Verificación

- El contrato se ejerce en los 16 tests de U1 (`backend/tests/test_oms.py`,
  todos verdes); la suite completa del backend queda en 142 passed.
- Aplicación del DDL contra Aurora: pendiente de que el dueño de backend lo
  integre a su flujo de migraciones (el esqueleto corre en mock).

## Deuda / diferido

- La migración real a Aurora y su despliegue dependen de reactivar
  infrastructure-design (gate en `external-dependency-map.md`).

## Sources

- `sql/oms_pedidos.sql`, `backend/oms/src/models.py`, `backend/tests/test_oms.py`.

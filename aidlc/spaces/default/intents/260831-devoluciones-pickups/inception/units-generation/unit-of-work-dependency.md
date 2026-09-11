# Unit of Work — Dependency DAG (FR16)

Una sola unidad; el DAG es trivial.

## DAG

```
U1  (u1-devoluciones-en-secuencia)
```

Sin aristas: `U1` no depende de ninguna otra unidad de esta iniciativa.

## Puntos de integración

Ninguno interno (una sola unidad). El único punto de integración externo es con
el WMS/Iflow para el shape de la recolección conocida (OQ-4), documentado como
supuesto en `../requirements-analysis/requirements.md` (FR16.1.1).

## Oportunidades de desarrollo en paralelo

No aplica — una sola unidad. El orden interno (FR16.2 → FR16.3 → FR16.1) es una
decisión de secuenciación del backlog, no de unidades.

## Edge block (machine-readable)

```yaml
units:
  - name: u1-devoluciones-en-secuencia
    kind: ui
    depends_on: []
```

# Business Rules — U1 (u1-devoluciones-en-secuencia)

Fuente de verdad de las reglas de negocio de FR16.1–16.3. `functional-spec.md`
las referencia por ID.

```yaml
rules:
  - id: BR1.1
    statement: Una parada sin atributo `tipo` se trata como entrega.
    category: validation
    applies_to: Pedido / PedidoSeleccionado
    trigger: Al leer una parada de un viaje o del mock.
    logic: IF pedido.tipo is undefined THEN treat as 'entrega'.
    violation: N/A (default seguro).
    source: FR16.1.1
  - id: BR1.2
    statement: El peso y volumen de una devolución conocida cuentan en la capacidad del vehículo igual que un pedido de entrega.
    category: calculation
    applies_to: capacity-fit.ts (seleccionarPorCapacidad, optimizarConCapacidad)
    trigger: Al ejecutar el bin-packing de una ruta.
    logic: IF una parada está incluida THEN sumar su total_weight y total_volume, sin distinguir tipo. Una devolución puede quedar excluida o forzar la exclusión de otra parada.
    violation: Omitir una devolución del cálculo dejaría al vehículo por encima de su capacidad real.
    source: FR16.3, FR16.3.1
  - id: BR1.3
    statement: Un tramo (leg) de la ruta es "de recolección" si su parada de origen o su parada de destino es una devolución.
    category: policy
    applies_to: route-geometry.ts, RutaMapaPreview.tsx
    trigger: Al renderizar las polilíneas del mapa.
    logic: FOR cada par consecutivo (i, i+1) — IF paradas[i].tipo == 'devolucion' OR paradas[i+1].tipo == 'devolucion' THEN leg indigo discontinuo ELSE teal sólido.
    violation: Un leg mal clasificado confunde sobre dónde hay una recogida.
    source: FR16.2.2
  - id: BR1.4
    statement: La distinción entre entrega y devolución nunca depende solo del color.
    category: constraint
    applies_to: PedidoCard, ParadaCard, TipoParadaBadge, RutaMapaPreview
    trigger: Al renderizar cualquier vista con el tipo.
    logic: TODA indicación de tipo devolución lleva ícono (`ri-arrow-go-back-line`) y texto ("Devolución") además del color; los legs del mapa llevan además patrón discontinuo. El texto "Devolución" del badge es visible (no aria-hidden) y lo lee el lector de pantalla.
    violation: Incumple WCAG 2.1 AA 1.4.1.
    source: NFR-3, FR16.2.1
```

## Rules summary

| ID | Regla | Categoría | Fuente |
|----|-------|-----------|--------|
| BR1.1 | Sin `tipo` ⇒ entrega | validation | FR16.1.1 |
| BR1.2 | Devolución cuenta en capacidad como entrega | calculation | FR16.3, FR16.3.1 |
| BR1.3 | Leg "de recolección" si un extremo es devolución | policy | FR16.2.2 |
| BR1.4 | Distinción nunca solo por color | constraint | NFR-3, FR16.2.1 |

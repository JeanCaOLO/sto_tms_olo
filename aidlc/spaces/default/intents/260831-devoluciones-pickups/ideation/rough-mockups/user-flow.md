# User Flow — Devoluciones/Pickups (FR16)

Flujo del planificador con las recolecciones conocidas ya incluidas. Deriva de
`../intent-capture/intent-statement.md`, `../scope-definition/scope-document.md`
y `../scope-definition/intent-backlog.md`. El objetivo (`intent-statement.md`)
es que el planificador arme una ruta que ya contempla las recolecciones sin
coordinarlas por fuera.

## Happy path

```
[Planificador abre Planificación]
        |
        v
[Selecciona un viaje (WMS)]
        |
        v
[Panel de pedidos: entregas + devoluciones conocidas, mezcladas]
   - cada parada muestra su tipo (badge + icono + texto)          <- FR16.2
   - las devoluciones traen nota "viene del viaje"
        |
        v
[Click "Optimizar paradas"]
        |
        v
[Secuencia calculada: devoluciones intercaladas como paradas mas] <- FR16.1
        |
        v
[Barra de capacidad: peso/volumen ya incluyen las devoluciones]   <- FR16.3
        |
   +----+----------------------------+
   |                                 |
   v                                 v
[Todo cabe]                    [No cabe una parada]
   |                                 |
   v                                 v
[Genera la ruta]              [Alerta de exclusion por capacidad
                               (misma que FR2); el planificador
                               excluye manualmente o ajusta]
                                     |
                                     v
                               [Genera la ruta]
```

<!-- Text fallback: el planificador abre Planificación, elige un viaje, ve
entregas y devoluciones juntas y distinguibles, optimiza, la secuencia queda
con las devoluciones intercaladas, la barra de capacidad ya las cuenta; si todo
cabe genera la ruta, si algo no cabe aparece la alerta de exclusión de FR2 y
luego genera. -->

## Puntos de decisión y recuperación

| Punto | Ramas | Recuperación |
|-------|-------|--------------|
| Tras optimizar | (a) todo cabe → generar; (b) exclusión por capacidad | El planificador excluye una parada manualmente (botón ya existente) o cambia de vehículo; re-optimiza. |
| Devolución sin coordenadas | queda fuera del cálculo de ruta óptima | Igual que hoy con una entrega sin coordenadas: se muestra su dirección cruda y no entra en la optimización (patrón de "excepción" existente). |

## Fuera de este flujo

- **FR16.4 — "al pie de camión":** el conductor (no el planificador) inserta
  una recolección en vivo sobre una ruta ya despachada y el sistema recalcula.
  Es otro flujo, otro actor y otro dispositivo; fuera de este ciclo
  (`../scope-definition/scope-document.md`).

## Assumptions & Open Questions

- [assumption] La devolución conocida ya llega asignada a un viaje desde el
  WMS; el planificador no la asigna.
- Open question: si el planificador puede *añadir* una devolución conocida que
  el WMS no mandó (caso intermedio entre FR16.1 y FR16.4) — a aclarar en
  requirements-analysis.

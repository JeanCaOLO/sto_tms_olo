# Funciones para añadir

Funciones nuevas del tarifador que se construyeron sobre el mock y que **no dependen de un cambio en el backend**: usan las mismas operaciones que ya existen (crear, actualizar y eliminar filas, emitir liquidaciones). Cada documento explica qué es, para qué sirve, cómo está hecho y cómo se usa y se prueba.

| Documento | Función |
|---|---|
| [01-seleccion-multiple-en-tablas.md](01-seleccion-multiple-en-tablas.md) | Casillas de selección y barra de acciones en `DataTable` (base de las otras dos). |
| [02-liquidar-varios-viajes.md](02-liquidar-varios-viajes.md) | Marcar varios viajes listos y liquidarlos en un solo menú. |
| [03-reglas-acciones-en-lote.md](03-reglas-acciones-en-lote.md) | Activar, desactivar o eliminar varias reglas a la vez. |

## Criterio común (KISS)

- Nada se ve hasta que se pide: las casillas no cambian la pantalla; la barra de acciones aparece solo cuando hay filas marcadas; cada viaje del lote está plegado hasta que se despliega.
- No se pierde ninguna función del flujo de un solo viaje. El lote reutiliza el mismo controlador, el mismo cuerpo y la misma emisión.
- Sin operaciones nuevas en el backend. Cada cambio se aplica fila por fila, con su bitácora, y si una falla se dice cuál y las demás siguen.

## Qué probar con el túnel abierto

Ver la sección «Lotes» de `../CHECKLIST_PRUEBA_BACKEND.md`. En resumen: emitir 3 viajes seguidos (cada emisión es una transacción `/tx` con su liquidación y su bitácora), desactivar 2 reglas (un `PATCH` con solo `{ "active": false }` por regla) y eliminar una regla referenciada para ver el 409 (`23503`) en el resumen.

## Decisiones tomadas con el usuario (2026-10-10)

- Selección: opt-in en `DataTable`, no una columna propia por página.
- Lote de liquidaciones: cualquier viaje listo, sin exigir la misma compañía (todo termina en el Historial).
- Menú del lote: lista de viajes desplegables y un solo botón de emitir.
- Si un viaje falla: se emiten los buenos y los fallidos quedan abiertos.
- Reglas: activar, desactivar y eliminar. No se edita ningún otro campo en lote.

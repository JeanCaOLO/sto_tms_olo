# Auditoría visual en navegador — Ronda 2 (2026-10-08)

Entorno: `npm run dev` (localhost:3000), Chrome con la extensión de Claude, SuperUsuario, Costa Rica, datos reales vía API. No se emitió ni cambió nada.

| Pantalla | Resultado |
|---|---|
| `/tarifas/costos-flota` → Flota Propia | Aparece la sección **Estructura del país** (parámetros: 30 días, 36000 km/año, combustible 635, rendimiento por camión; 131 conceptos) con «Descargar plantilla» y «Subir plantilla»; luego la lista de compañías ✅ |
| Tablas | La tabla de conceptos y el resumen por camión muestran un número limitado de filas con scroll interno y barra vertical; el encabezado queda fijo ✅ |
| Descripciones | Al pasar el ratón por «Subir plantilla» aparece «Carga la plantilla de Excel y reemplaza toda la estructura de costos.» ✅ |
| `/reglas-tarifa` | Pestañas: Reglas · Tarifarios · Alerta Margen · Probador Motor · Bitácora (sin «Costos», «Zonas», «Plantillas» ni «Resumen»); la tabla de 49 reglas con scroll interno ✅ |
| Sidebar | Liquidaciones · Costos Flota · Reglas Tarifa ✅ |

## Defectos encontrados y corregidos
| # | Dónde | Problema | Corrección |
|---|---|---|---|
| V4 | Tablas con `maxVisibleRows` | Con una altura estimada (3,25 rem por fila) las filas de varias líneas (estructura de costos, ~5,3 rem) dejaban ver solo ~3 filas. | `DataTable` mide el alto REAL de las N primeras filas y del encabezado (`useLayoutEffect`, se vuelve a medir al cambiar el tamaño de la ventana); la estimación queda como respaldo. |
| V5 | Descripciones | Cerca del borde derecho el cuadro se partía en una columna angosta (≈110 px). | `width: max-content` con tope de 20 rem y centrado limitado a los bordes de la pantalla. |

## Observaciones / pendientes
- **Congelamientos del renderer** (2 más, ambos justo después de una rueda de desplazamiento con `scroll` de la extensión, en `/tarifas/costos-flota`; con `scroll_to` y la barra no ocurre). No se encontró bucle en el código ni errores de consola, pero sigue sin explicación: conviene revisarlo con el perfilador de Chrome en un navegador normal (la rueda real, no la simulada).
- **La API tarda 20–30 s** en cargar la estructura de costos del país (131 filas) y el modal de liquidar: es latencia de Aurora vía túnel/API local (ya documentada), no del front.
- No verificado en navegador: rol Liquidador real, tooltips de todos los campos de los modales, vista móvil.

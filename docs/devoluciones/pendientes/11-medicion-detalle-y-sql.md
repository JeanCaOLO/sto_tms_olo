# 11 — Medición del detalle y preparación de SQL nativo

**Estado:** medición sintética completada; PostgreSQL y lectura real pendientes. Corte: 2026-11-12.

> **Actualización posterior:** usuario autorizó la herramienta; PGlite 0.5.16 se instaló solo en `TMS/.test/postgres-tools`. Ya pasó la validación PostgreSQL en memoria del listado, países/scopes, resumen y SQL67, además de SQL68 y 4B. La limitación de herramienta descrita abajo es histórica. Aurora, planes/duración de producción y concurrencia de dos conexiones siguen pendientes.

## Método y resultado observado

Se ejecutó el serializador real `backend/admin/src/admin_returns.py:get_trip` con filas ficticias, sustituyendo exclusivamente consultas, permisos y firma de medios. No se ejecutó SQL, no se firmó contra S3 y no hubo llamadas de red. Cada tamaño tuvo una iteración de calentamiento y doce mediciones.

| Devoluciones | Secciones | Formularios | Bytes JSON | Llamadas a query | Llamadas a signed_photo_url | Mediana serialización local, ms |
|---|---|---|---|---|---|---|
| 10 | 1 | 1 | 9.922 | 5 | 10 | 0,038 |
| 100 | 10 | 1 | 92.176 | 5 | 100 | 0,394 |
| 500 | 50 | 5 | 461.676 | 5 | 500 | 1,554 |
| 1.000 | 100 | 10 | 923.554 | 5 | 1.000 | 3,059 |
| 5.000 | 500 | 50 | 4.651.834 | 5 | 5.000 | 15,766 |

Las cinco llamadas son organización, viaje, devoluciones, secciones y formularios. La firma por fila es una llamada de función; **no equivale a una petición S3 por foto**. Los tiempos excluyen SQL, SDK real y red. La compresión de URL ficticias repetitivas no estima el tamaño comprimido real.

Evidencia portable: [JSON sintético](../auditoria/2026-11-12/p2-detalle-sintetico.json). Script local reproducible: `TMS/.test/integracion_2026-11-12/medir_detalle_sintetico.py`.

## Consecuencia para AUD-08

El detalle crece linealmente y carece de límite/paginación. Se confirma el riesgo con volumen sintético; no se demuestra que un viaje real tenga ese tamaño. La UI usa el detalle completo para agrupar, seleccionar líneas, crear formularios y recibir todas. Truncar el array o poner LIMIT silenciosamente rompería ese contrato.

Antes de cambiar producto, medir cardinalidad real y elegir un contrato explícito de detalle paginado o separación de medios. Conservar selección por IDs, recepción/formularios completos y conteos globales. La propuesta debe incluir compatibilidad del lector anterior; no se hizo un cambio especulativo de payload.

## PostgreSQL aislado

Se preparó `tests/sql/returns_pagination.test.mjs`: ejecuta el SQL Python real de listado/resumen y la vista de SQL65 sobre fixtures locales. Comprueba 1.201 viajes autorizados, claves nulas/repetidas/fecha mínima, UUID como desempate, intersección país/rol en cada página, scope vacío, organización y múltiples formularios sin duplicar viajes.

La sintaxis JavaScript pasó `node --check`. Su ejecución depende de PGlite 0.5.16 en una carpeta temporal, como las pruebas SQL existentes. En esta sesión el módulo no está disponible, no hay postgres/psql en PATH y Docker no tiene daemon activo. Se solicitó autorización para preparar esa herramienta sin tocar dependencias del proyecto; no se declara la prueba SQL pasada por haber escrito el archivo.

Incluso con PGlite, quedan fuera el optimizador/versión/configuración efectiva de Aurora y concurrencia entre conexiones independientes. No usar esta prueba para prometer latencia o ahorro en AWS.

## Tracking: AUD-09 sigue abierto

El código actual usa resumen global dentro del scope, caché de 5 s por organización/país/países del rol (`backend/tracking/src/app.py:317`) y reutiliza la página si contiene todos los activos (`:412`). La cache es local al proceso; no garantiza compartir resultado entre Lambdas.

`api.ts:19` fija polling real de 10 s, aunque el motor genérico tenga otro valor por defecto. Dos pollers visibles equivalen aproximadamente a 12 llamadas/minuto, más detalle abierto, fallos y acciones. Al ocultar la pestaña se pausa. El resumen sigue procesando todos los activos cuando la página no alcanza; falta medir cardinalidad y consultas con datos reales antes de cambiarlo.

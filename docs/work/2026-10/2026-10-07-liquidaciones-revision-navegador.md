# Liquidaciones: revisión en navegador, tiempos y errores (2026-10-07)

Entorno: Vite dev en `localhost:3000`, Aurora por túnel SSM (`localhost:15432`), país Costa Rica, rol SuperAdministrador, Chrome con extensión Claude. Datos: seed `scripts/seed-tarifas-demo.mjs`.
Los tiempos son de desarrollo (sin build de producción, caché fría o tibia) y no son un benchmark de producción. Sirven para comparar entre pantallas y detectar la causa.

## 1. Tiempos medidos

### Pantalla `/liquidaciones` (carga en frío)
- Tabla con 17 viajes visible a los ~10,7 s desde la navegación.
- Durante ~6,8 s se muestra un aviso falso en ámbar: "Costa Rica no está disponible en el tarifador (o su rol no lo puede ver)". Desaparece solo al terminar de cargar `tarifas_country_settings` y permisos.
- 22 peticiones `/api/*`; suma de duraciones 60 s (en paralelo). Las más lentas: `app_users` (x4, máx 6,7 s), `v1/me/permissions` (x2, máx 7,1 s), `v1/countries` (x2, máx 5,8 s), `tarifas_country_settings` (5,9 s).
- `tarifas_v_viajes` (la lista) tarda solo 0,67 s, pero arranca a los 8,0 s: espera a que terminen auth, permisos y país.

### Modal "Liquidar viaje" (los 17 viajes listos)
| Viaje | Transportista | ms hasta cálculo |
|---|---|---|
| RT-DEMO-2 | Ulloa | 5 621 |
| RT-DEMO-3 | Mora | 14 247 |
| RT-DEMO-4 | Acuña y Salazar | 13 953 |
| RT-DEMO-5 | Acuña y Salazar | 6 975 |
| RT-DEMO-6 | Transosa | 15 004 |
| RT-DEMO-7 | Transosa | 7 004 |
| RT-DEMO-8 | Transosa | 6 374 |
| RT-DEMO-9 | Transosa | 6 073 |
| RT-DEMO-10 | Transosa | 6 171 |
| RT-DEMO-11 | Transosa | 6 183 |
| RT-DEMO-12 | Hernández | 14 863 |
| RT-DEMO-13 | Hernández | 6 266 |
| RT-DEMO-14 | Edison | 14 060 |
| RT-DEMO-15 | Edison | 6 376 |
| RT-DEMO-16 | Jiménez | 14 051 |
| RT-DEMO-17 | OLO (propia) | 13 402 |
| RT-DEMO-18 | Transmajori | 14 276 |

- Mínimo 5,6 s, máximo 15,0 s, mediana ~6,4 s. Todos los viajes calcularon (ninguno con timeout ni error).
- Patrón bimodal: **~6 s** cuando el catálogo del transportista ya está en caché; **~14 s** la primera vez que se abre un transportista (carga de catálogo).
- Verificado a mano RT-DEMO-3 (Mora): Base 25 200 + Modificador 3 024 + Recargo 0 = **28 224**; reparto por casa comercial (Cofersa 56,25 %, EPA 43,75 %); traza con regla y fila de tarifario `FLETE_ZONA "01"`.

### Cascada de peticiones del modal (medida con Performance API)
- Fase 1 (viaje ya cacheado, ~6 s): 10–15 peticiones secuenciales de ~0,6–1,3 s cada una: `tarifas_v_viaje_pedidos`, `tarifas_v_viajes/<id>`, `tarifas_trip_order_marks`, `tarifas_settlements`, `tarifas_settlement_parties`, `tarifas_v_devoluciones`, y de nuevo `tarifas_v_viaje_pedidos`, `trip_order_marks`, `tarifas_settlements`, `countries/<id>`.
- Fase 2 (primera vez por transportista, +8 s): 9 peticiones de catálogo lanzadas a la vez (`countries`, `margin_policies`, `country_settings`, `pricing_rules` x2, `zones`, `zone_groups`, `rate_tables`, `party_variables`, `cost_structures` x2) que tardan entre 1,2 y 6,5 s cada una (se encolan), y después `cost_structure_rows` y `rate_table_rows`, que dependen de las anteriores.
- Latencia mínima por petición ~0,6 s incluso para consultas triviales (0 KB de respuesta).

Otras pantallas
- Cambio de pestañas (Viajes por liquidar, Incompletos, Todos, Listos, Vista simple/extendida): instantáneo, sin peticiones (filtrado en cliente).
- Historial: 1 registro (LIQ-0001, RT-DEMO-17, OLO, $100000.00, Anulado), carga sin peticiones nuevas.
- `/tarifas/transportistas`: carga en <10 s con 8 terceros.
- Enlaces de "sin lógica": abren el panel correcto. `…/transportistas?carrier=<id>&open=rates` abre "Tarifarios de Edison Miguel Ureña Ureña"; `…/flota-propia?carrier=<id>&open=costs` abre "Estructura de costos — OLO". Los parámetros se quitan de la URL.

## 2. Errores y hallazgos

Severidad: A = rompe o engaña, M = degrada, B = cosmético/mejora.

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| E1 | A | Aviso falso "Costa Rica no está disponible en el tarifador (o su rol no lo puede ver)" durante ~7 s al entrar. Es un estado de carga tratado como error. | Primera captura de `/liquidaciones`. |
| E2 | M | Cascada de arranque lenta: la lista de viajes espera ~8 s a auth + permisos + país. `app_users` se pide 4 veces, `me/permissions` 2, `countries` 2, `me/context` 2, `warehouses` 2. | Performance API de la carga en frío. |
| E3 | M | Modal tarda 6–15 s. La causa es la cascada secuencial de ~15–28 peticiones, cada una con ~0,6 s mínimo de latencia (túnel + proxy dev). | Mediciones de la sección 1. |
| E4 | M | Peticiones duplicadas dentro del modal: `tarifas_v_viaje_pedidos` x3, `tarifas_trip_order_marks` x3, `tarifas_settlements` x3–4, `tarifas_v_viajes/<id>` x2. | Cascada del modal. |
| E5 | M | El catálogo del transportista se carga cada primera apertura (+8 s) y no se precalienta. Tablas de catálogo enteras (`pricing_rules`, `zones`, `zone_groups`) vuelven a leerse por transportista. | Fase 2 de la cascada. |
| E6 | A | Moneda mal rotulada en Costa Rica: se muestra `$` y "USD" ("Operando en Costa Rica USD", "Importe (USD)", `$28224.00`), pero los montos están en colones. Mismo problema ya anotado para el catálogo (CR guardado como USD). | Cabecera, modal, estructura de costos de OLO. |
| E7 | M | Los 8 transportistas muestran "Falta — no se le puede liquidar" en identificación fiscal, pero sus viajes sí se liquidan. El mensaje se contradice con el comportamiento (no hay bloqueo). | `/tarifas/transportistas`. |
| E8 | M | Los importes se muestran sin separador de miles ni formato local (`$28224.00`, `$100000.00`). | Modal e Historial. |
| E9 | B | Estructura de costos de OLO abre con lista vacía ("0 registros") mientras carga, sin indicador visible de carga en la tabla de componentes. Revisar si es carga o dato. | Captura de `flota-propia?open=costs`. |
| E10 | B | Existe el viaje RT-DEMO-17 en "Listos para liquidar" con una liquidación anulada (LIQ-0001). Es lo esperado, pero no hay marca visual de que ya tuvo una liquidación anulada. | Lista e Historial. |

Sin fallas de backend: ninguna respuesta con error HTTP en la carga de la lista, el modal ni las pantallas de compañía. `Unauthorized` al llamar la API directo con `fetch` es esperado (la app autentica con su propio encabezado).

## 3. Funcionalidades evaluadas

Evaluadas (lectura): lista "Listos para liquidar" (17), pestañas Incompletos (11) / Todos (28) / Historial (1), Vista simple/extendida, modal de liquidación para los 17 viajes, traza del cálculo (Resumen), reparto por casa comercial, enlaces de "sin lógica" a las dos pantallas de compañía.

Incompletos: los 11 tienen el botón "Liquidar" deshabilitado con el aviso "El viaje … no está completado (estado: planned). Solo se liquidan viajes completados en guía de despacho." Comportamiento correcto.

Aviso "sin lógica de costos": no se pudo ver en pantalla porque todos los viajes liquidables ya tienen lógica (por el seed). Está cubierto por `missingLogic.test.ts` (12 tests). Para verlo en el navegador hace falta un viaje completado de un transportista sin reglas ni tarifario.

NO evaluadas (escriben en Aurora o descargan archivos; no se ejecutaron sin autorización):
- "Emitir liquidación", cambio de estado (Borrador/En Revisión/Aprobado/Pagado/Anulado), "Anular" y "Liquidar después" de un pedido, "Agregar" devolución, edición de variables del viaje.
- "Exportar Excel" (descarga) y selector de "Columnas".
- Pestañas "Detalle" y "Auditoría" del modal, vínculo "Abrir" de cada regla, filtros por fecha Desde/Hasta y búsqueda.

## 3b. Segunda pasada (funciones de lectura y formulario)

Probadas sin escribir en Aurora:
- Búsqueda de la tabla: "Transosa" da 6 registros; texto sin coincidencias muestra "No hay viajes completados pendientes de liquidar".
- Selector de columnas: mostrar la columna Fecha funciona (5 ocultas).
- Exportar Excel: genera `viajes_por_liquidar-2026-10-07.xlsx` (19 KB) al instante, sin aviso visible al usuario.
- Modal: pestañas Resumen / Detalle / Auditoría funcionan; Detalle lista cada regla con casilla y origen (regla del país o del transportista); Auditoría muestra "Datos del viaje que entraron en el cálculo", "Reglas que no aplicaron" (con el motivo) y la comparación mercancía vs gastos operativos (RT-DEMO-3: 288 000 vs 28 224, OK).
- Formulario de devolución: "Agregar" abre fila (factura, tipo, código de producto); el total no cambia (informativa, correcto). No se guardó nada.

Hallazgos nuevos:

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| E11 | M | La búsqueda dice "viaje, transportista, conductor o placa" pero buscar la placa `C162414` devuelve 0 registros (el viaje RT-DEMO-2 y otros la tienen). | Búsqueda en Viajes por liquidar. |
| E12 | M | Los filtros Desde/Hasta no filtran "Viajes por liquidar": con Desde = 2026-09-19 siguen los 17 viajes (hay de agosto y septiembre anteriores). Sí filtran Historial (LIQ-0001 del 2026-08-28 desaparece). | Lista y Historial. |
| E13 | B | La descarga de Excel no da señal de éxito (ni aviso) y el blob sale como `application/octet-stream`. | Exportar Excel. |

La primera vez el clasificador de permisos rechazó el clic en "Emitir liquidación"; se repitió después de que el usuario lo autorizó de forma explícita.

## 3c. Pruebas con escritura (autorizadas por el usuario, 2026-10-07)

| Acción | Resultado | Tiempo |
|---|---|---|
| **Emitir liquidación** (RT-DEMO-3, con devolución F-TEST-1029 y nota) | **FALLA.** Error en el modal: `column "settlement_date" is of type date but expression is of type text`. No se creó ninguna liquidación. | ~0,6 s por intento |
| **Liquidar después** (pedido 1 de RT-DEMO-3) | Funciona. La fila pasa a "Liquidar después", el total no cambia (28 224), el reparto por casa comercial no cambia. | Marca ~0,6 s + transacción 1,3 s; la pantalla se refresca tras ~5 s (8 recargas) |
| **Anular** (pedido 2, con motivo "Prueba navegador") | Funciona. Pide motivo en la fila. El reparto se recalcula a Cofersa 44 % / EPA 56 % y muestra "Parcial · 1 de 2 pedidos para después". El total del transportista no cambia. | ~11 s hasta ver el reparto nuevo |
| **Incluir** (revertir ambas marcas) | Funciona. Los 4 pedidos vuelven a "Incluido". | ~7 s cada una |
| **Cambiar estado** de LIQ-0001 (Anulado → Borrador → En Revisión → Aprobado → Anulado) | Funciona. Hace UPDATE + escribe en `tarifas_audit_log` + recarga la lista. Los indicadores "Total liquidado" y "Sin aprobar" reaccionan bien. Quedó en Anulado, como estaba. | ~3 s por cambio |
| **Aviso "sin lógica"** (RT-DEMO-17, flota propia OLO) | Funciona: "La flota propia "OLO" no tiene con qué calcular este viaje: falta estructura de costos." + enlace "Cargar la estructura de costos de esta flota propia" → `/tarifas/flota-propia?carrier=6e5617cf-…&open=costs`, que abre "Estructura de costos — OLO" con aviso ámbar "Ni esta compañía ni el país tienen estructura de costos cargada…". | ~7 s |

Importante sobre el aviso "sin lógica": se simuló en el navegador devolviendo vacías las respuestas de `tarifas_cost_structures*` (interceptando `fetch`). No se modificó nada en Aurora porque la única estructura de Costa Rica es la real (131 filas). Estado final de datos de prueba: pedidos de RT-DEMO-3 de nuevo "Incluido"; LIQ-0001 en Anulado, con 4 registros nuevos en la bitácora.

Hallazgos nuevos de esta pasada:

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| E14 | **Crítico** | **No se puede emitir ninguna liquidación.** El INSERT en `tarifas_settlements` falla con `column "settlement_date" is of type date but expression is of type text`. Causa probable: la migración 28 (`sql/28_…`) ya cambió la columna a `date` en Aurora, pero el backend desplegado todavía usa el manifiesto de esquema anterior (`settlement_date` como `text`); en el repo `schema_manifest.json` y `schema.ts` ya dicen `date` (commit local 718a78a, sin desplegar). Solo Intelix despliega. Los UPDATE (cambio de estado) no pasan por ese cast y sí funcionan. | Modal de RT-DEMO-3 al emitir. |
| E15 | M | El mensaje de error de emisión queda pegado arriba del modal incluso después de acciones posteriores que sí funcionan (Liquidar después, Anular, Incluir). | Modal de RT-DEMO-3. |
| E16 | M | Marcar un pedido (Liquidar después, Anular, Incluir) tarda 5–11 s en reflejarse: tras el guardado se recargan `viaje_pedidos`, `trip_order_marks`, `v_viajes/<id>`, `settlements`, `settlement_parties` y `countries`. Basta con actualizar el estado local o recargar solo pedidos y marcas. | Cascada medida. |
| E17 | M | Una liquidación Anulada se puede pasar a Borrador, En Revisión o Aprobado sin restricción ni confirmación (no hay reglas de transición de estado). Si anulada es final, el selector debería bloquearla o pedir motivo. | Historial, LIQ-0001. |
| E18 | B | En el aviso "sin lógica" el modal deja un panel "¿Por qué este total?" vacío junto al aviso. | Captura del modal de RT-DEMO-17. |

Pendiente (no probado): emitir con éxito y el flujo completo Borrador → En Revisión → Aprobado → Pagado desde una liquidación recién emitida; depende de arreglar E14.

## 4. Análisis de causa y mejoras propuestas (para el plan de acción)

1. **Latencia por petición (~0,6 s mínimo)**: el cuello de botella no es el cálculo (corre en el navegador en ms) sino el número de viajes de ida y vuelta secuenciales. Reducir peticiones vale más que optimizar consultas.
2. **Endpoint agregado para el modal**: un solo `GET` que devuelva viaje + pedidos + marcas + devoluciones + liquidación existente + perfil. Reemplaza ~10 peticiones por 1.
3. **Endpoint de catálogo por perfil**: devolver reglas, tarifarios (con filas), variables y estructuras en una sola respuesta; hoy son 9 en paralelo que se encolan y 2 dependientes. Cachear por (país, perfil, fecha) con invalidación al editar.
4. **Quitar duplicados**: `viaje_pedidos`, `trip_order_marks`, `settlements` y `viajes/<id>` se piden 2–4 veces; compartir una sola carga entre hooks (caché de consulta con clave).
5. **Auth/permisos al arrancar**: deduplicar `app_users`, `me/permissions`, `countries`, `me/context`; cachear en memoria y arrancar la lista en paralelo con ellos, no después.
6. **Precalentar el catálogo** de los transportistas de la lista visible tras mostrar la tabla (idle) para que la primera apertura baje de ~14 s a ~6 s o menos.
7. **Estado de carga correcto**: no mostrar "no disponible" mientras carga (E1).
8. **Moneda**: usar la moneda real del país en CR (colones) para etiquetas y formato (E6, E8).
9. **Medir en build de producción** (`vite build` + `preview`) y con la API real desplegada antes de decidir, porque el dev server y el túnel SSM inflan la latencia por petición.

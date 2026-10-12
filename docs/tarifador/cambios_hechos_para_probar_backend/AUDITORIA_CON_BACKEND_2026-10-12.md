# Auditoría con backend y túnel activos — 2026-10-12

Estado: en curso. Este documento se completa paso a paso siguiendo `CHECKLIST_PRUEBA_BACKEND.md`.

## Entorno

- Rama `josef`. Túnel SSM a Aurora abierto (puerto local 15432), clúster `db-tms-olo` en estado `available`.
- API local en `:4000` y Vite en `:3000` ya levantados. `.env.local` con `VITE_MOCK_AUTH=false`.
- `npm run tarifas:manifest` no deja cambios en `backend/tarifas/src/schema_manifest.json`.
- Línea base: `npm run type-check` sin errores; `npx vitest run` con 105 archivos y 1153 pruebas en verde (5 archivos omitidos).
- `scripts/sandbox/aws_connectivity_check.py` no corrió porque falta `boto3`. Se comprobó lo mismo con AWS CLI (`sts get-caller-identity` y `rds describe-db-clusters`).

## Pruebas automáticas contra Aurora (todas con rollback)

| Prueba | Resultado |
|---|---|
| `aurora.manifest-esquema.test.ts` | OK. El manifiesto coincide con el esquema aplicado. |
| `aurora.e2e.test.ts` antes del arreglo | 5 de 7 fallan con «El viaje no existe». |
| `aurora.e2e.test.ts` después del arreglo | 7 de 7 en verde (ver A1 y A2). |
| `aurora.seed-demo` y `aurora.cr-load` | No se ejecutaron: escriben datos reales y piden autorización. |

## Hallazgos

| ID | Hallazgo | Veredicto | Estado |
|---|---|---|---|
| A1 | `src/test/setupTarifas.ts` registra un `beforeEach` global que vuelve al almacén en memoria antes de cada prueba. Los tests `aurora.*` fijaban `PgDataSource` solo en `beforeAll`, así que cada `it` corría contra la semilla local y no contra Aurora. | BUG de pruebas (no del producto) | Arreglado: `beforeEach` local en `aurora.e2e`, `aurora.cr-load` y `aurora.seed-demo`. |
| A2 | `aurora.e2e.test.ts`, primera prueba: se esperaba total 250 (solo la regla `E2E_BASE`) y Aurora devuelve 57658. Desde la migración 31 existen reglas globales de Costa Rica que también aplican al viaje de prueba. | Expectativa de la prueba desactualizada | Arreglado con la opción 1: la prueba comprueba que `E2E_BASE` aporte 250 en la traza y que el total cuadre con el acumulado. Además la prueba de re-liquidar contaba 2 liquidaciones absolutas y ahora cuenta relativo al punto de partida, porque el viaje ya tenía liquidaciones. `aurora.e2e`: 7 de 7 en verde. |

### Propuestas para A2

1. Cambiar la expectativa para que compare contra la suma de la regla `E2E_BASE` más las reglas globales vigentes que devuelve el propio cálculo (más robusto, sigue verificando el motor).
2. Dentro de la transacción de la prueba, desactivar las reglas globales de CR antes de calcular (aísla, pero deja de probar la combinación real).
3. Mantener 250 y mover la prueba a un país sin reglas globales.

## Checklist por interfaz (sesión de navegador ya iniciada: SuperAdministrador, Costa Rica)

### §1 Reglas: crear, editar y eliminar

| Paso | Resultado |
|---|---|
| 1. Crear `R_VERIF_BACKEND` | OK. `POST /api/tarifas/tarifas_pricing_rules` 200 y `POST …/tarifas_audit_log` 200 (P1a y P16b confirmados). Bitácora con `CREATE`. |
| 2. Desactivar | OK. `PATCH` 200 y bitácora `UPDATE`. SQL: `active = false`, `version = 2`. |
| 3. Eliminar | Con hallazgo A3. El borrado se aplicó (SQL: sin fila; bitácora `DELETE`), pero la red registró `DELETE` con 503. |

La regla de prueba quedó eliminada: no queda basura en la base.

| ID | Hallazgo | Veredicto | Estado |
|---|---|---|---|
| A3 | `DELETE` de regla aparecía con 503 en el registro de red y aun así la fila se borraba. | Falso positivo de la herramienta | Cerrado. Se repitió 3 veces desde la página: todas `OK` en ~1 s, y con un `fetch` instrumentado el estado real es `204`. La herramienta de red del navegador muestra 503 para las respuestas 204 sin cuerpo. |

### §2 Estructura de costos: primer componente (H9)

OK. Compañía de prueba: Edison Miguel Ureña Ureña (sin estructura previa). Al agregar el componente «Prueba H9 (borrar)», `POST /api/tarifas/tx` respondió 200. SQL: una estructura `cstr_mv5alrv2_1e6e77` con 1 fila. Confirma P10a (id generado en el cliente).

Observación: el modal de un tercero dice «Estructura de costos del país (solo referencia)… Los terceros no se liquidan con ella», aunque permite agregar componentes propios. Es la decisión de negocio C1, sigue abierta.

Limpieza: queda un componente y una estructura de prueba en esa compañía. Al intentar borrar el componente, la pestaña dejó de responder (posible diálogo nativo de confirmación del navegador). Hay que cerrarlo a mano y borrar el componente.

### §3 Liquidar un viaje normal

Detenido antes de emitir. Con el viaje RT-DEMO-4 (Inversiones Acuña y Salazar del Caribe, CR), el modal «Liquidar viaje» calculó ₡57.408,00 con la regla «Base por kilómetro (Costa Rica)». Eso explica A2: el total de la prueba e2e incluye las reglas reales de CR. El permiso para pulsar «Emitir liquidación» fue denegado por el clasificador del modo automático, porque emitir deja una liquidación `LIQ-…` en la base compartida (solo se puede anular, no borrar). No se emitió nada. Falta la autorización explícita del usuario.

Actualización: con la autorización del usuario se emitió RT-DEMO-4. SQL: `LIQ-CR-010`, `Borrador`, total 57408.00 (coincide con el modal), y bitácora `CREATE` de `settlement`. Los pasos 1 y 2 del §3 en la base son correctos. Quedó sin comprobar en pantalla P13 (cambio a Historial, fila resaltada y aviso): tras emitir, la pestaña dejó de responder a las capturas. No se pudo leer la respuesta de `POST /tx` porque la lectura de red no la registró; falta repetirlo.

Observación sobre la herramienta: la pestaña se congeló varias veces tras una acción de escritura. Dos fueron por `window.confirm` nativo (A4, ya arreglado). Otras fueron solo lentitud de renderizado de la API local por el túnel: la captura respondió a los 10 a 30 segundos.

### §3 (pantalla y estados) y §5 (re-liquidar y anular)

| Paso | Resultado |
|---|---|
| P13 tras emitir | OK en pantalla: pasa a Historial, «Listos» baja de 15 a 14 y el total liquidado sube ₡57.408. La fila resaltada y el aviso no se pudieron ver. |
| §5.1 Re-liquidar `LIQ-CR-010` con motivo | OK. SQL: `LIQ-CR-010` queda `Anulado` con `superseded_by` apuntando a `LIQ-CR-011`, que queda `Borrador` y vigente. |
| §3.2 `Borrador → En Revisión → Aprobado` | OK. SQL confirma cada estado y la bitácora registra un `UPDATE` por cambio. |
| §3.2 `Pagado → Borrador` rechazado | No probado a propósito: `Pagado` es terminal y dejaría la liquidación de prueba sin poder anularse. |
| §5.2 Anular `LIQ-CR-011` | OK. SQL: `Anulado`. El viaje RT-DEMO-4 vuelve a «Por liquidar» con la etiqueta «Anulada antes» y «Listos» sube a 15. |

| ID | Hallazgo | Veredicto | Estado |
|---|---|---|---|
| A4 | Ocho acciones usaban `window.confirm` nativo (anular liquidación, activar o desactivar reglas en lote, reemplazar estructura con plantilla, eliminar tarifario, desactivar cálculo de compañía, regla repetida y eliminar componente de costos). Los diálogos nativos congelan la automatización y rompen la coherencia visual. | UX / consistencia | Arreglado: `src/lib/confirm.ts` (`confirmAction`) y `src/components/base/ConfirmHost.tsx`, montado en `App.tsx`. Sin host cae a `window.confirm`, así que los tests anteriores no cambian. Prueba nueva: `ConfirmHost.test.tsx`. `type-check` y `vitest` en verde. Comprobado en el navegador: el modal «Eliminar componente» aparece sin congelar la pestaña y el borrado se aplicó (SQL: 0 filas). |

### §4 Viajes que el motor bloquea

Con los datos actuales no hay casos que probar. SQL: 0 viajes completados sin `route_type_id`. Viajes por estado: 17 completados, 1 en ruta, 10 planificados. «Listos» 15 y «Incompletos» 11 coinciden con la vista. Los otros avisos de bloqueo (zona de otro país, total negativo, regla dependiente) no se pudieron provocar con esta base.

### §9b Lotes

| Paso | Resultado |
|---|---|
| 1. Lote de 3 viajes (RT-DEMO-4, -5, -6) | OK. Salieron `LIQ-CR-012`, `-013` y `-014`, consecutivas, con `trip_id` distintos y `superseded_by` nulo; 3 eventos `CREATE` en la bitácora. Pasó a Historial, «Listos» bajó de 15 a 12 y el total liquidado subió a ₡383.567. |
| 3. Latencia | Calcular 3 viajes tardó unos 20 s y emitirlos unos 12 s cada uno (los 3 `CREATE` de la bitácora están separados ~12 s). Con la API local por el túnel; un lote de 10 tardaría varios minutos. Falta medirlo en el sandbox desplegado antes de decidir `MAX_LOTE`. |
| Limpieza | Las 3 se anularon con el modal nuevo. La base queda con 12 `Anulado` y 2 `Borrador` (los mismos 2 `Borrador` de antes). |

### §9b pasos 4 a 6 (reglas en lote) y §6 interfaz del rol Liquidador

| Paso | Resultado |
|---|---|
| 4. Desactivar 2 reglas en lote (`R_LOTE_1` y `R_LOTE_2`, creadas para la prueba) | OK. Dos `PATCH` 200 y dos `POST` a la bitácora. SQL: `active = false` y `version` sin cambio (1). |
| 5. Eliminar en lote | Parcial. Las 3 reglas de prueba se borraron (SQL: 0 filas; bitácora con 3 `DELETE`) y el modal propio listó exactamente esas 3. El caso «regla referenciada» no se pudo reproducir: ver A6. |
| 6. «Ver como» Liquidador | OK en interfaz. En `/reglas-tarifa` desaparecen «Nueva Regla», las casillas y las acciones de editar y eliminar (queda solo el ojo) y las pestañas «Alerta Margen» y «Probador Motor». El menú lateral queda solo con «Tarifas». |
| §6.1 y §6.4 (403 real y país restringido) | Pendiente: «Ver como» es un filtro de interfaz y el token sigue siendo de SuperAdministrador. Necesita un usuario Liquidador real. |

| ID | Hallazgo | Veredicto | Estado |
|---|---|---|---|
| A5 | Tras crear una regla, al volver a abrir «Nueva Regla» el formulario conserva el código, el nombre y el importe de la regla anterior. `useRuleForm.ts` solo reinicia el formulario cuando cambian `rule`, el país, la etapa o la compañía, y para una regla nueva ninguno cambia. Riesgo: guardar un duplicado sin querer. | BUG de interfaz | Arreglado: `RuleModal.tsx` ahora monta el cuerpo solo mientras está abierto, así cada apertura arranca con formulario, condiciones y constructor limpios. Prueba nueva en `RuleModal.test.tsx` («reabre con el formulario limpio»). |
| A6 | `tarifas_pricing_rules` no tiene ninguna clave foránea hacia ella (SQL sobre `pg_constraint`), así que el `409 23503` que esperaba el checklist al borrar una regla usada no ocurre. | No es bug: por diseño | Cerrado por decisión del usuario: la liquidación emitida es un registro de auditoría (cómo se calculó y los nombres de las reglas aplicadas), no un enlace a cada regla; borrar una regla no importa. El paso §9b.5 «regla referenciada» deja de aplicar. El aviso «está referenciada en liquidaciones» del código no se dispara con este esquema; queda como código sin uso. |

### §7 Tarifarios (parcial)

| Paso | Resultado |
|---|---|
| Crear un tarifario de compañía con la clave por defecto | OK. `TARIFARIO_VERIF` aparece en la lista (10 registros) y en SQL. |
| Eliminar con el modal nuevo | OK. SQL: 0 filas, de vuelta a 9 tarifarios. |
| Agregar, editar y quitar filas; importar CSV y XLSX de 300 filas | No probado. Al hacer clic en la fila del tarifario no se abrió el panel de filas con las herramientas de automatización, y la importación necesita elegir un archivo en el selector del sistema. Falta hacerlo a mano o con la herramienta de subida de archivos. |

| ID | Hallazgo | Veredicto | Estado |
|---|---|---|---|
| A7 | Crear, editar, desactivar o eliminar un tarifario, y agregar o quitar filas una por una, no escribía nada en `tarifas_audit_log`. Solo la importación masiva registraba bitácora. | Falta de auditoría | Arreglado por decisión del usuario: `tarifariosApi.ts` registra cada operación (`saveRateTableWithAudit`, `toggleRateTable`, `removeRateTable`, `createOrUpdateRateRow`, `removeRateRow`) con `registrarEventoSeguro`; `actor.ts` y `useTarifasActor` publican ahora también el nombre del usuario. Prueba nueva `tarifariosApi.audit.test.ts`. En vivo contra Aurora: crear y eliminar un tarifario de prueba dejó `CREATE` y `DELETE` en la bitácora con usuario «Administrador OLO» y rol «SuperAdministrador». |

### §8 Formatos y rendimiento (parcial)

- Montos: el total del modal (₡57.408,00) coincide con `tarifas_settlements.total_amount` (`57408.00`). La forma de `numeric` con escala coincide en el caso probado.
- Orden alfabético: la lista de compañías externas sale ordenada con tildes correctas. No se comparó contra la colación de la base con casos límite.
- Lista recortada (`TRIPS_LIMIT` de 2.000) y arranque en frío de la Lambda: no se pueden provocar aquí. Hay 28 viajes y la API corre en local. Quedan para el sandbox desplegado.

### §7 Carga de 350 filas (hallazgo A8)

Se creó un tarifario de prueba y se llamó a `bulkUpsertRows` (la misma función que usa «Importar planilla») con 350 filas desde la página, sin pasar por el selector de archivos.

| ID | Hallazgo | Veredicto | Estado |
|---|---|---|---|
| A8 | La importación de 350 filas daba «La API no respondió en 20 s» aunque el servidor la terminaba. `bulkUpsertRows` mandaba una operación por fila dentro de un `POST /tx`. | Riesgo de rendimiento / mensaje engañoso | Arreglado con las dos propuestas: (1) el cliente tiene un tiempo máximo propio para `/tx` (45 s, `txTimeoutMs`); (2) nueva operación `insert_many` en `backend/tarifas` (un `INSERT` con varias filas por tanda, con tope de 5.000 filas y 30.000 parámetros) y el cliente agrupa solas las inserciones seguidas de una misma tabla (`coalesceInserts`). Si el backend no la conoce, el cliente reenvía como operaciones sueltas. Medido con la API local y el túnel: 350 filas en 2,7 s (antes 21,9 s y error), 350 filas con `row_order` de 1 a 350 consecutivo, y el tarifario de prueba eliminado. Pruebas: 9 de backend (`test_tarifas.py`), 6 de cliente (`http-insert-many.test.ts`); backend 233 en verde (sin `test_realtime`, que necesita `botocore`). Ya no hace falta pedir despliegue de otra cosa: es parte del mismo cambio del módulo. |

Propuestas para A8: (1) subir el tiempo máximo del cliente solo para `/tx` de importación masiva; (2) una operación de inserción múltiple en el `/tx` del backend de tarifas (un solo `INSERT` con todas las filas); (3) cortar la importación en bloques de 100, a costa de perder la atomicidad.

El tarifario de prueba se eliminó (SQL: vuelven a ser 9 tarifarios y 0 filas huérfanas).

### Otros arreglos hechos tras la revisión de lo pendiente

- **T3** (compañía «Configurada» sin tarifarios si falla el guardado del tarifario): `useRateTableSave` deshace el perfil recién creado (`discardNewParty`) cuando el tarifario no se guarda. Prueba nueva en `partiesDataSource.test.ts`.
- **§3.2** (`Pagado → Borrador` rechazado): se agregó a `aurora.e2e.test.ts`, dentro de la transacción con rollback; ya no hace falta dejar una liquidación en `Pagado`. `aurora.e2e`: 8 de 8.
- **Lint**: los cambios nuevos cumplen los límites de tamaño del proyecto (`max-lines`); lo único que queda en rojo son 14 errores `process` de dos pruebas ajenas al tarifador (`src/__tests__/db-connectivity.test.ts` y `multi-tenant-isolation.test.ts`).
- **Mock**: `createFakeBackend` entiende `insert_many`, así que el modo mock sigue funcionando con las importaciones.

### Cuál API local es cuál

`npm run api:local:base` ejecuta `backend/local/serve.py`: las Lambdas de `backend/` tal cual, incluida `tarifas`, que es el código que se despliega (`scripts/sandbox/deploy_backend.py` empaqueta esa misma carpeta). `npm run api:local` ejecuta `backend-planif/serve.py`, una copia del backend hexagonal de Planificación que no contiene `tarifas`. El `README` de `backend/` todavía llama `api:local` al primero; está desactualizado.

### Latencia de emitir una liquidación (optimizada)

Se perfiló una emisión desde la página con un `fetch` instrumentado (API local por el túnel, ~1 s por petición): eran **8 peticiones y 5,8 s**. El viaje se leía dos veces (`emitSettlement` y `validateAndReload`, que no aportaba nada), cada lectura del viaje eran 2 peticiones (el viaje y sus liquidaciones), y el siguiente número pedía el país aparte.

Cambios (todos en `src/lib/tarifas`): `getTrip` pide el viaje y sus liquidaciones en una sola llamada `/batch`; `nextNumber` pide el número y el país en otra; se quitó `validateAndReload`; y re-liquidar reutiliza el viaje que ya leyó al validar. Resultado medido: **4 peticiones y 4,0 s** por emisión (`POST batch`, `POST batch`, `POST` de la liquidación y `POST` de la bitácora). Lo que queda es casi todo la conexión por petición del túnel local. No se juntó la liquidación con su bitácora en un solo `/tx` a propósito: si la bitácora fallara (rol sin permiso) la liquidación ya emitida se revertiría, y P16b pide lo contrario.

Las pruebas de esa medición dejaron `LIQ-CR-015` y `LIQ-CR-016` emitidas y anuladas sobre RT-DEMO-4.

### Lo que no se puede probar con la API local

- **§9 concurrencia real:** `backend/local/serve.py` atiende una petición a la vez (`HANDLER_LOCK`), igual que una Lambda por contenedor, así que dos pestañas no compiten de verdad. El índice único de «una liquidación vigente por viaje» sí se verificó (`aurora.e2e`, «rechaza una segunda liquidación vigente»). La carrera entre dos usuarios exige el sandbox desplegado.
- **§9b paso 2 (fallo parcial de un lote):** lo cubre `LiquidarLoteModal.fallo.test.tsx` (los demás se emiten y el fallido queda abierto con su motivo). Con Aurora no se provocó.

## Resumen final

- Arreglos hechos en código (todos con `type-check` y `vitest` en verde, 1166 pruebas): A1 (tests Aurora), A2 (e2e), A4 (confirmaciones con modal propio), A5 (modal de regla), A7 (bitácora de tarifarios), A8 (importaciones grandes) y T3.
- Cerrados sin cambio de código: A6 (por diseño, decisión del usuario).
- Cerrado sin cambio de código: A3 (falso positivo de la herramienta de red: el `DELETE` devuelve 204).
- Arreglados tras la revisión: A8 (insert_many y tiempo máximo de `/tx`), T3, §3.2.
- No probado en esta sesión: §6.1 y §6.4 con usuario real, §6.3, parseo real de CSV y XLSX en «Importar planilla» (sí se probó la carga de 350 filas), §8 en el sandbox, §9 concurrencia, §9b paso 2 (fallo parcial de un lote), §10 C1 (decisión de negocio).

## Pendiente

§3 (Pagado), §6.1 y §6.4 con usuario real, §6.3, §7 (filas e importación), §8 en el sandbox, §9 (concurrencia real, en el sandbox), §10 (C1), §4b y §9b. El §6 (roles) necesita además un usuario solo-liquidar o «Ver como» Liquidador.

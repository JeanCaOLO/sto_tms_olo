# Concurrencia de Devoluciones

La tarea 10 sigue abierta por el consumidor externo y el recorrido integrado pendiente.
El 2026-11-17 se ejecutaron 56 pruebas sin omisiones sobre PostgreSQL 16.15 en Docker
desechable. Cubren concurrencia, seguridad del destino, resolución SQL75/gate,
captura de magnitudes, preflight de solo lectura, contrato directo SQL77, capacidad
por tramo, intentos multiartículo, causalidad de entrega y lectores web/móvil.
Evidencia: `.test/pendientes/evidencia-postgres-20261117-134843-fcb7392f/`;
salida 0 y contenedor retirado, según `resultado.json`.
PGlite valida SQL y rollback; una sola
instancia no demuestra concurrencia entre conexiones.

Para repetir con una BD local aislada, desde la raíz del repositorio:

```powershell
python tests/postgres/run_local.py
```

Requiere Docker iniciado, pytest y pg8000. Crea y retira un contenedor exclusivo
`postgres:16`, publicado solo en `127.0.0.1` con puerto dinámico y sin volumen externo.
No carga `.env` ni conserva credenciales. Guarda salida, código y versión en
`.test/pendientes/evidencia-postgres-<ejecución>/`. No requiere túnel a Aurora.

`test_returns_concurrency.py` prepara un lote sintético por prueba en un esquema privado `returns_codex_<UUID>`.
El lote contiene una organización, usuario, pedido de 10 cajas, solicitud, punto, viaje y parada.
Cada identificador se genera en la ejecución; no reutiliza lotes históricos ni datos del ambiente compartido.
Solo prepara SQL76/77 dentro del esquema privado. No reaplica SQL60–70.

El arnés rechaza hosts remotos y nombres de BD que no empiecen por `tms_returns_test_`.
Configure `TMS_RETURNS_TEST_DSN` en el entorno con una BD PostgreSQL local desechable.
No guarde la cadena ni credenciales en archivos del repositorio ni en el informe.

Desde `sto_tms_olo`, con un identificador de directorio nuevo:

```powershell
python -m pytest -p no:cacheprovider --basetemp .test/codex-pg-<identificador-nuevo> tests/postgres/test_returns_concurrency.py -q
```

El arnés observa `pg_blocking_pids` antes de liberar el bloqueo del primer escritor. Casos preparados:

| Caso | Resultado esperado |
| --- | --- |
| Dos reservas de siete cajas para un pedido de diez | Una acepta; la otra ve saldo tres y no escribe. |
| Reenvío simultáneo del mismo evento | Un hecho aceptado y un duplicado. |
| Recepción contra apertura de Novedad | La recepción espera y no recibe una fila que quedó en revisión. |
| Inserción de devolución contra liquidación | La liquidación espera el viaje y después detecta la devolución pendiente. |
| Formulario contra apertura de Novedad | La selección bloqueada devuelve revisión y el formulario no se crea. |
| Apertura de Novedad contra liquidación | El gate espera y mantiene el bloqueo por revisión. |
| Recepción primero, Novedad después | La Novedad espera, abre revisión y conserva la cantidad recibida. |
| Formulario primero, Novedad después | Se conserva el formulario ya creado; la revisión bloquea liquidar. |
| Liquidación primero, devolución después | La devolución espera; una nueva liquidación queda bloqueada después de su inserción. |
| Liquidación primero, Novedad después | Se conserva la liquidación anterior; la nueva revisión bloquea otra liquidación. |

La retirada solo elimina el esquema creado por la prueba. Aborta si detecta referencias desde otro esquema,
objetos fuera del manifiesto de tablas o datos con otra organización. No borra archivos de evidencia ni acciones offline.

`test_returns_fixture_safety.py` comprueba, sin conexiones, el rechazo de hosts remotos, nombres de BD compartidos
y parámetros ambiguos. Aceptar una configuración local no abre una conexión ni comprueba que exista el servidor.

La ejecución anterior omitía los diez casos de concurrencia por falta de DSN; la ejecución
del 2026-11-16 ya los comprobó con dos conexiones reales. Son pruebas de las sentencias y bloqueos
de producción sobre un esquema mínimo: no sustituyen una prueba de todos los handlers con el esquema integrado.
Faltan la implementación externa del consumidor y el recorrido web/dispositivo V04. Los tests unitarios y SQL aislados cubren
autoaprobación, sin candidato, asignación, resultado parcial/negativo, entrega, Novedad, resolución, duplicados y reintentos;
no equivalen a un recorrido integrado ni cierran V01/V03 completos.

`test_return_resolution_concurrency.py` añade el gate real (`returns_gate.recheck`)
y los guards de SQL75 sobre un esquema mínimo. Prueba ambos órdenes entre gate y
resolución, otra devolución pendiente, doble resolución, rollback de una resolución
incompleta y el flag apagado. No aplica SQL70 completo ni sustituye las pruebas de
todos los handlers. Los imports de tarifas no pueden usar su consulta externa en
estos casos: la conexión local se inyecta explícitamente.

`test_return_capacity_lock.py` comprueba que la lectura de magnitudes de las líneas
autorizadas mantiene `FOR SHARE` hasta persistir el snapshot. Un refresco concurrente
espera y modifica las magnitudes actuales después, conservando las del snapshot.

`test_return_contract_preflight.py` ejecuta el preflight entregado a Jean sobre el
esquema privado de la prueba. Comprueba que conserva el registro de migraciones y
la solicitud, y que una escritura accidental falla con SQLSTATE `25006` por la
transacción de solo lectura. No conecta a Aurora ni acredita su esquema efectivo.

# Concurrencia de Devoluciones

La tarea 10 sigue abierta. No existe PostgreSQL local disponible en esta sesión, confirmado por el usuario.
PGlite valida SQL y rollback; una sola instancia no demuestra concurrencia entre conexiones.

`test_returns_concurrency.py` prepara un lote sintético por prueba en un esquema privado `returns_codex_<UUID>`.
El lote contiene una organización, usuario, pedido de 10 cajas, solicitud, punto, viaje y parada.
Cada identificador se genera en la ejecución; no reutiliza lotes históricos ni datos del ambiente compartido.
Solo prepara SQL72/73 dentro del esquema privado. No reaplica SQL60–70.

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

La ejecución actual omitió los diez casos de concurrencia por falta de DSN. Son pruebas de las sentencias y bloqueos
de producción sobre un esquema mínimo: no sustituyen una prueba de todos los handlers con el esquema integrado.
Faltan su ejecución real, fixtures del consumidor externo y el recorrido web/dispositivo V04. Los tests unitarios y SQL aislados cubren
autoaprobación, sin candidato, asignación, resultado parcial/negativo, entrega, Novedad, resolución, duplicados y reintentos;
no equivalen a un recorrido integrado ni cierran V01/V03 completos.

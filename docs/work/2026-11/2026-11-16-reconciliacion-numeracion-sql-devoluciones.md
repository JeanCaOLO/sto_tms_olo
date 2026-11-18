# Reconciliación de Devoluciones y validación local

Fecha: 2026-11-16. Rama de trabajo: `dylan-tarifas`, HEAD `d380e497`.
Referencia: `.test/pendientes/para_dylan.md`. Esta entrega continúa la tarea 10;
no cierra el contrato directo, la tarea 11 ni la aceptación del módulo.

## Numeración contrastada

Se ejecutó `git fetch origin main`, sin merge ni cambios en la rama actual.
`origin/main` quedó en `d3e4cf01`, `Merge branch 'motor-ruteo-activacion'`.
Su árbol contiene estos identificadores:

| Número | En `origin/main` | Preparación de Devoluciones en esta rama |
| --- | --- | --- |
| 71 | `71_vehiculos_pais.sql` | `71_return_incident_resolutions.sql`: colisión |
| 72 | `72_routing_runs.sql` | `72_return_request_origin_balance.sql`: colisión |
| 73 | `73_coordenadas_almacenes_ve_tiendas_epa.sql` | `73_return_collection_contract.sql`: colisión |
| 74 | `74_routing_runs_retencion.sql` | Sin sustitución reservada |

El usuario confirmó que todavía no se reservaron números nuevos. No se renombraron
scripts, funciones, triggers ni pruebas. La propuesta anterior de usar 75/76 no es
una reserva y tampoco cubre por sí sola los tres paquetes en colisión.

Se preparó `.test/pendientes/preflight_devoluciones_lectura.sql` para revisión y
ejecución por Jean. Usa una transacción de solo lectura y consulta catálogos,
restricciones, triggers y el registro de migraciones sin leer datos operativos.
Si falta el registro o no hay permiso de lectura, se detiene; no crea tablas ni
amplía permisos. No se ejecutó en el ambiente compartido.

No se consultó Aurora. El estado efectivo de las migraciones y sus checksums sigue
sin verificar. Jean debe contrastar `public.schema_migrations(name,checksum,applied_at)`
y el esquema efectivo antes de reservar números o preparar una corrección aditiva.
El runner existente calcula SHA-256 sobre el texto UTF-8 leído por Node, conservando
los saltos de línea; no normalizar archivos ya aplicados ni usar `--force` para
sortear una diferencia de checksum.

SHA-256 observados en estos archivos locales, sin modificarlos:

| Archivo | SHA-256 |
| --- | --- |
| `71_return_incident_resolutions.sql` | `a0c5281b9ed1571c9425096fe4f4d0b982c877dc181f329c7ce67ad53ed14af6` |
| `72_return_request_origin_balance.sql` | `fd34f144dcee75b3207344d683a40ecbb527252488e13d8a73fcb529d6c25ec4` |
| `73_return_collection_contract.sql` | `2fcb82922c31276368696c116827ff0144c96bc7137ddd70a57b10b1d0b2532e` |

Estos hashes identifican el corte local; no acreditan coincidencia con el ambiente.

## Decisiones del usuario y dependencias

- Confirmada la lectura directa en Aurora en lugar del transporte HTTP entre módulos.
- Confirmada la recogida en el punto autorizado del pedido.
- Confirmado el retorno al almacén del pedido.
- El usuario indicó que la medición operativa comienza cuando el camión entra en el
  rango de 150 metros del local. No se especificó una duración estimada anterior al
  viaje ni el evento que termina esa medición; no se inventaron minutos.
- El usuario confirmó usar datos existentes de productos y asignar cada solicitud
  completa a un viaje. Un reintento puede programar solo lo no recogido. Se verificó
  que las líneas de pedido importan `PESOPEDIDO` y `CUBICAJEPEDIDO` desde eFlow, con
  identidad de línea y presentación; se usan kg y m³ del modelo vigente.
- Planificación debe confirmar el contrato y los números con Jean. No se editó
  `backend/planning` ni se envió ningún mensaje a otro responsable.

El recorrido histórico de `backend/planning/src/recolectas.py` usa `tbl_returns`,
agenda la devolución completa en un viaje y persiste peso/volumen `NULL`. Su comentario
explica que no ocupa capacidad por asumir pocas unidades después de una entrega.
Eso describe el comportamiento existente; no constituye una regla aprobada para
las solicitudes nuevas. No se sustituyeron datos desconocidos por cero ni se
retiró el outbox mientras falta el contrato que preserva sus garantías.

## Pruebas ejecutadas y alcance

| Comprobación | Resultado |
| --- | --- |
| Backend: solicitudes, origen, recolectas, seguimiento, Novedades, devoluciones, gate y Tracking | 350 aprobadas; salida 0 |
| SQL71/72/73 con PGlite | 22 aprobadas; salida 0 |
| PostgreSQL 16.15: concurrencia original y seguridad del destino | 19 aprobadas, sin omisiones; salida 0 |
| PostgreSQL 16.15: suite ampliada | 25 aprobadas, sin omisiones; salida 0 |
| Drift del tracker AI-DLC | Salida 1: tres intents en `default` sin `active-intent` válido |
| Backend después de incorporar la captura de capacidad | 364 aprobadas; salida 0 |
| PostgreSQL final, con actualización concurrente de magnitudes | 26 aprobadas, sin omisiones; salida 0 |
| Visitas GPS móviles existentes | 15 aprobadas; salida 0 |

La suite ampliada añade seis casos: liquidación esperando resolución, con y sin
otra devolución pendiente; resolución esperando al gate; dos resoluciones de una
Novedad; rollback de resolución sin transición; y gate apagado con Novedad abierta.
Usa la implementación real de `returns_gate.recheck`, las sentencias de resolución
de producción y los triggers de SQL71 en un esquema mínimo aislado. Los bloqueos
entre conexiones se observan con `pg_blocking_pids`.

No prueba todos los handlers, SQL70 completo, el consumidor directo futuro, la
compatibilidad de despliegue ni el recorrido web/APK. La tarea 10 sigue abierta por
esas dependencias; la tarea 11 no se reclama. No se alteraron índices de AI-DLC ni
se eligió un intent por inferencia.

## Reproducción y evidencia

```text
python tests/postgres/run_local.py
```

El ejecutor usa Docker iniciado, Python, pytest y pg8000 ya instalados. Crea una BD
`tms_returns_test_codex` en un contenedor exclusivo con puerto dinámico sobre
`127.0.0.1`, sin volúmenes externos. No carga `.env`, no reutiliza el DSN del usuario
y pasa una contraseña temporal únicamente al proceso hijo. Retira el contenedor al
terminar y guarda `pytest.log` y `resultado.json` sin credenciales bajo
`.test/pendientes/evidencia-postgres-<ejecución>/`.

La primera ejecución de los seis casos adicionales está en
`.test/pendientes/evidencia-postgres-20261116-194633-6dcb9193/`:
PostgreSQL 16.15, Docker 29.4.0, imagen
`sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94`,
salida 0 y retirada del contenedor registrada.

La versión final del ejecutor se verificó nuevamente en
`.test/pendientes/evidencia-postgres-20261116-195357-a5870348/`: 25 aprobadas en
10,41 segundos, salida 0. La retirada se comprueba además consultando que no quede
ningún contenedor con el nombre exclusivo de la ejecución.

Después de las decisiones de negocio se implementó una captura adicional en el
snapshot de origen existente, sin cambiar SQL71/72/73: almacén de retorno, política
`whole_request`, magnitudes decimales por línea/presentación y datos faltantes
explícitos. Se bloquean las líneas antes de consultar saldo y persistir el snapshot.
Contrato y límites: `docs/devoluciones/CAPTURA_RECOLECTAS_BD_V2.md`.

Las 14 regresiones nuevas fallaron antes de implementar esa captura; posteriormente
pasaron junto con las anteriores (364 backend). La nueva prueba real de PostgreSQL
comprueba que un refresco de magnitudes espera al snapshot y no lo altera después.
Resultado final: 26 aprobadas en 9,09 segundos, salida 0, contenedor retirado, evidencia
en `.test/pendientes/evidencia-postgres-20261116-200311-8c823a52/`.

No hubo commits, push, despliegues, SQL compartido ni alteraciones de permisos.
Los cambios previos de Graphify y del repositorio móvil se conservaron. La captura
no impone aún `whole_request` al transporte HTTP anterior ni implementa el consumidor
directo; esa sustitución sigue pendiente de esquema/numeración y coordinación.
La verificación funcional por QA/usuario sigue pendiente.

## Continuidad de la coordinación, 2026-11-17

Se retomó después de la pausa solicitada por el usuario. HEAD sigue en `d380e497`;
se preservaron los cambios locales de web y del repositorio móvil. No se repitió
la suite ni se presentó una ejecución antigua como nueva: se comprobó la evidencia
que terminó antes de la pausa en
`.test/pendientes/evidencia-postgres-20261116-202841-20e87fb6/`.
Resultado: 28 aprobadas en 10,36 segundos, salida 0, PostgreSQL 16.15 y retirada del
contenedor confirmada en `resultado.json`.

Los dos casos añadidos ejecutan el preflight en el esquema privado y comprueban
que no altera registro/solicitud y que una escritura accidental es rechazada con
SQLSTATE 25006. El preflight versionable para Jean está en
`docs/devoluciones/preflight_recolectas_bd_v2.sql`; el archivo anterior bajo `.test`
queda como antecedente local y no sustituye a esta versión revisada.

Se preparó `docs/devoluciones/CONTRATO_RECOLECTAS_BD_V2.md` y se registró una petición
concreta a Planificación/Jean en `.agents/CANAL.md`, estado abierto. Incluye modelo,
operaciones, orden de bloqueos, cancelación/replan, compatibilidad y respuestas de
aceptación necesarias. No se afirmó haber enviado mensajes por un servicio externo
ni que el equipo ya pudiera consultar estos archivos en remoto: están sin commit.

La propuesta no es implementación del esquema directo. Conforme al plan aprobado,
no se preparan IDs arbitrarios, cambian tablas ni retiran escritores/rutas HTTP
antes de obtener reserva y confirmación. Siguen pendientes el esquema efectivo,
la numeración y la respuesta del responsable de Planificación. Las tareas 10/11
conservan sus dependencias y el tracker AI-DLC no se modificó.

## Cierre local de la entrega, 2026-11-17

El usuario autorizó la renumeración y confirmó el acuerdo de Planificación. Las
preparaciones de Devoluciones pasan de 71/72/73 a 75/76/77, con rollback y referencias
actualizadas. Se implementó el contrato directo, se retiró HTTP/outbox del runtime
y se adaptaron seguimiento, inicio web/móvil, resultados y gate. No se modificó
backend/planning. Peso/volumen mock se usan solo en fixtures aislados, nunca en Aurora.

Entrega vigente: `docs/devoluciones/ENTREGA_PLANIFICACION_BD_V2.md`. Incluye firmas,
scopes, idempotencia, bloqueos, capacidad, replan, filtro de la cola legacy y pruebas
que debe entregar el consumidor externo. Jean aplica/publica en orden 75, 76, 77;
las migraciones no se ejecutaron en la BD compartida.

Inspección Aurora READ ONLY: 2026-11-17T12:37:24Z, PostgreSQL 17.7, 32 solicitudes
legacy; no existen origen/asignaciones/resultados/outbox ni resoluciones de Novedades.
Verificación local: 56 PostgreSQL reales sin omisiones, salida 0 y contenedor retirado
(`.test/pendientes/evidencia-postgres-20261117-134843-fcb7392f/`); 54 SQL aisladas
aprobadas sin omisiones tras actualizar fixtures67/69 al escritor v2. Las baterías
anteriores de este trabajo registraron 364 backend, 172 móvil (23 omisiones previas),
146 web, tipos y lint focal aprobados.

Pendientes externos: consumidor de Planificación, aplicación/publicación por Jean y
recorrido coordinado web/dispositivo. Tarea10 sigue abierta por esas dependencias;
tarea11 sin reclamar. Sin commit, push, despliegue ni escritura compartida. Los
antecedentes que hablaban de numeración o confirmación pendientes quedan superados
por esta autorización; no se reescribe el historial ni el tracker AI-DLC.

# Coordinación de QA y correcciones

Corte inicial: 27/11/2026. Esta carpeta reúne el estado conocido de las pruebas anteriores y recibirá los hallazgos nuevos. No certifica el flujo completo.

- [Hallazgos y tareas](HALLAZGOS.md): lo mantiene el agente probador.
- [Estado del corrector](ESTADO_AGENTE.md): lo mantiene el agente corrector.
- [Master prompt](MASTER_PROMPT.md): instrucciones para iniciar la otra sesión.
- Proyecto hermano: `../mobile/QA_CAMBIOS/`, respecto de la raíz TMS. El backend móvil activo pertenece a `backend/mobile/` de TMS.

## Publicación y coordinación

La rama de intercambio autorizada es `origin/dylan-tarifas`. La primera publicación de QA_CAMBIOS parte del estado remoto `b7714e7e`; no incorpora los commits de código locales de Josef. Cada actualización de pendientes debe terminar en commit y push exclusivamente de esta carpeta a esa rama. Solo se autoriza publicar cambios dentro de `QA_CAMBIOS/`. No publicar ramas de trabajo con commits de código pendientes, ni usar `git add .`, `commit -a` o push forzado. Comprobar archivos y TODOS los commits salientes antes de cada push. Conservar el índice y los cambios ajenos.

Las carpetas también están presentes en los árboles locales originales; la rama actual de trabajo no cambia. Un pull de la rama documental puede chocar con esas copias sin seguimiento: compararlas y respaldarlas antes de integrar. En una sesión remota, obtener primero la rama documental y leerla sin reemplazar código. Esa rama contiene la base publicada, no las correcciones locales pendientes.

El probador añade tareas con ID estable, prioridad, evidencia, observado/esperado, reproducción segura y aceptación. El corrector reclama el ID en su archivo de estado antes de editar código. No modificar simultáneamente el mismo archivo ni reiniciar servicios, tocar fixtures o reintentar la cola que el otro esté usando sin coordinarlo. Consultar novedades entre tareas, sin crear un bucle de sondeo permanente.

Estados: `PENDIENTE`, `EN CURSO`, `BLOQUEADO`, `LISTO PARA RETEST`, `RETEST APROBADO`, `DESCARTADO CON EVIDENCIA`. El corrector informa cambios, pruebas, código de salida y limitaciones; el probador hace el retest independiente. La aprobación humana del tracker AI-DLC sigue siendo independiente.

No publicar credenciales, tokens, archivos de entorno, datos reales ni logs crudos. No desplegar, cambiar permisos compartidos, eludir triggers ni aplicar migraciones a la BD compartida. Jean conserva esas responsabilidades. Solo fixtures QA identificables y con retiro comprobable. Pruebas físicas excluidas por el usuario en esta ronda.

## Fuentes locales

`../.test/pruebasGenerales/continuacion-2026-11-27.md` y `pruebaFlujoGeneral.mjs` (este último contiene Markdown, no ejecutarlo). Los archivos originales se conservan fuera de esta carpeta. Algunas notas anteriores quedaron superadas por las pruebas posteriores; prevalece el corte de HALLAZGOS con su evidencia específica. Si la evidencia local no existe en otra máquina, pedirla sanitizada y no inventar una reproducción.

# Integración aditiva de CI INTELIX

## Objetivo

INTELIX no reemplaza el `.gitlab-ci.yml` de un repositorio existente. Los jobs administrados por
la plantilla viven en `.gitlab/intelix-ci.yml` y se activan mediante un `include` local. De esta
forma, el pipeline de compilación, pruebas y despliegue del proyecto conserva su propiedad.

## Proyecto nuevo

`intelix-cli init` crea un pipeline raíz mínimo con este contenido:

```yaml
include:
  - local: .gitlab/intelix-ci.yml
```

También incorpora `intelix_pipeline_anchor`, un job mínimo en el stage predeterminado `test` para
que GitLab pueda iniciar pipelines cuyos demás jobs usan únicamente `.pre` y `.post`. Los jobs
INTELIX quedan activos desde el primer pipeline.

## Proyecto existente

`init`, `adopt --apply` y `sync` preservan el `.gitlab-ci.yml` existente y entregan el fragmento
`.gitlab/intelix-ci.yml`. Para activarlo, incorporar manualmente el include anterior al pipeline
raíz y revisar el diff antes de confirmar el cambio.

Si el pipeline ya tiene una sección `include`, agregar solo el elemento `local`:

```yaml
include:
  - project: grupo/pipeline-compartido
    file: /base.yml
  - local: .gitlab/intelix-ci.yml
```

## Compatibilidad de stages y runners

El fragmento administrado usa únicamente los stages reservados `.pre` y `.post`, por lo que no
obliga al proyecto a cambiar su lista de stages. Está preparado para el runner Shell institucional:

- `gate0_discovery` y `certificacion_estandares` se ejecutan en `.pre`;
- `build_dashboard` y `daily_sync_check` se ejecutan en `.post`;
- las herramientas ausentes producen un aviso y los jobs opcionales conservan `allow_failure`;
- la certificación sigue siendo manual salvo que el equipo cambie expresamente sus reglas.

El pipeline del proyecto continúa siendo responsable de compilar, probar, empaquetar y desplegar
la aplicación. En móvil, los builds iOS siguen requiriendo un runner macOS propio.

## Actualizaciones

`.gitlab/intelix-ci.yml` es propiedad administrada por INTELIX y `sync` puede actualizarlo. No se
deben colocar jobs propios dentro de ese archivo; deben permanecer en `.gitlab-ci.yml` o en otro
fragmento controlado por el proyecto. Esta separación queda declarada en
`.intelix/applicability-policy.json`: `intelixCiFragment` es `managed-copy` y `ciPipeline` es
`preserve`.

Después de actualizar:

1. revisar `git diff -- .gitlab/intelix-ci.yml .gitlab-ci.yml`;
2. usar **CI Lint** de GitLab;
3. ejecutar un pipeline en una rama antes de promover a `qa`;
4. confirmar que las variables opcionales (`SYNC_CHECK_TOKEN`, `CERT_EXPOSICION` y
   `CERT_ALCANCE`) tengan el valor esperado.

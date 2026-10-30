# Archivos administrados por INTELIX

## Propósito

INTELIX registra en `.intelix/managed-files.json` los checksums de las copias que puede actualizar:

- skills `intelix-*` instaladas en cada agente;
- documentación distribuida desde `templates/docs/`;
- reglas de Cursor, steering de Kiro y reglas de Antigravity;
- READMEs del overlay de gobierno;
- `.gitlab/intelix-ci.yml`.

El manifiesto no convierte el código, el pipeline raíz, `.env`, `Product-Definition/` ni el estado
AI-DLC en propiedad de la plantilla. Esos componentes conservan su política `preserve` o su
contrato específico.

## Decisión durante `sync`

Para cada archivo se comparan tres versiones: el último baseline instalado, el archivo actual del
proyecto y la plantilla incluida en la nueva versión del CLI.

| Situación | Resultado |
|---|---|
| Proyecto intacto y plantilla sin cambios | Se conserva; estado `installed`. |
| Proyecto intacto y plantilla actualizada | Se actualiza automáticamente. |
| Proyecto modificado y plantilla sin cambios | Se conserva; estado `customized`. |
| Proyecto y plantilla modificados | Se conserva el proyecto y se crea `<archivo>.intelix-new`; estado `conflict`. |
| Archivo existente sin baseline previo | Se presume personalizado: se conserva y se crea `.intelix-new`. |

`--force` no evita esta protección. Su propósito sigue siendo regenerar otros artefactos que
admiten reemplazo explícito; no autoriza perder una personalización detectada.

## Consultar el estado

```bash
intelix-cli managed-files --status
intelix-cli managed-files --status --json
```

El resultado enumera archivos instalados, personalizados y en conflicto.

## Resolver un conflicto

Revisar primero el archivo local y su propuesta `.intelix-new` mediante `git diff --no-index` o la
herramienta visual del IDE.

Para conservar conscientemente la versión local:

```bash
intelix-cli managed-files --accept-local docs/ruta/archivo.md
```

Para reemplazarla por la propuesta INTELIX:

```bash
intelix-cli managed-files --accept-template docs/ruta/archivo.md
```

Ambos comandos actualizan el manifiesto y retiran la copia `.intelix-new` ya resuelta. Si se desea
una combinación de ambas versiones, fusionar manualmente el contenido en el archivo local y usar
`--accept-local`; esa decisión se conserva hasta que una plantilla posterior vuelva a cambiar.
No agregar `*.intelix-new` al `.gitignore`: deben permanecer visibles hasta su revisión y
resolución explícita.

## Primera actualización de proyectos existentes

Una instalación anterior no tiene baseline. Si un archivo existente no coincide byte a byte con
la plantilla actual, INTELIX no intenta adivinar su procedencia: lo preserva y genera
`.intelix-new`. Esto puede producir varios conflictos en el primer `sync`, pero evita clasificar
una personalización como contenido reemplazable. Las actualizaciones siguientes usan el baseline
ya registrado.

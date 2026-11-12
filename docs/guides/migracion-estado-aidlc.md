# Migración explícita de estado AI-DLC v1 a v2

## Cuándo usarla

Este flujo se usa cuando el progreso real permanece en `aidlc-docs/` (AI-DLC v1) y AI-DLC v2 ya
creó un intent bajo `aidlc/spaces/<space>/intents/<intent>/`.

No crea intents ni sustituye al inicializador del motor. Primero se instala AI-DLC v2 y se crea el
intent destino; después INTELIX reconcilia el progreso heredado con ese estado v2 válido.

## 1. Analizar sin modificar

```bash
intelix-cli migrate aidlc-state --from v1 --to v2 --dry-run
```

Si hay varios intents, indicar el destino:

```bash
intelix-cli migrate aidlc-state --from v1 --to v2 --dry-run \
  --space default --intent 261008-mi-cambio
```

Agregar `--json` para obtener el plan estructurado. El informe diferencia:

- archivos de tracking que pueden copiarse exactamente;
- campos y etapas que pueden convertirse;
- artefactos v1 que permanecerán en su ubicación original;
- elementos sin correspondencia;
- decisiones humanas y bloqueantes.

El análisis es de solo lectura.

## 2. Confirmar dónde reanudar

El plan recomienda un slug v2, pero una persona debe validarlo. Consultar las etapas disponibles
en el `aidlc-state.md` del intent destino. La elección es explícita porque v2 incorporó y reorganizó
etapas que no existían en v1.

## 3. Aplicar

```bash
intelix-cli migrate aidlc-state --from v1 --to v2 --apply \
  --resume-stage domain-design
```

Al aplicar:

1. se verifica nuevamente todo el plan;
2. se rechaza un intent v2 que ya tenga progreso propio;
3. se rechaza cualquier colisión de tracking con contenido diferente;
4. se respalda el estado v2;
5. se copian byte a byte los archivos de tracking que no existían;
6. se convierten campos y etapas reconocibles;
7. las etapas nuevas anteriores al punto confirmado quedan `[S]` por migración;
8. se genera `.intelix/migrations/aidlc-v1-to-v2-<checksum>/plan.json` y `report.md`.

Si falla una escritura, el estado v2 se restaura y las copias nuevas se retiran.

## Garantías y límites

- `aidlc-docs/` nunca se elimina ni modifica.
- `aidlc-docs/audit.md` sigue siendo la historia de la ejecución v1.
- El audit nativo v2 comienza con el uso del runtime v2; el informe INTELIX enlaza ambas historias.
- El comando no fusiona dos archivos de tracking diferentes ni dos workflows ya avanzados.
- Repetir la misma migración no duplica datos: el checksum del origen la hace idempotente.
- Una etapa v1 desconocida, un destino con otra versión de esquema o un intent ambiguo bloquean la
  aplicación y requieren revisión humana.

Después de aplicar, revisar `git diff`, ejecutar el estado/doctor del runtime AI-DLC disponible y
commitear juntos el estado v2, el tracking copiado y el informe de migración.

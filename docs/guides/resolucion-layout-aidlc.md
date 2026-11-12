# Resolución del layout AI-DLC activo

INTELIX usa un único contrato para localizar estado, planes y tracking en
proyectos AI-DLC v1 y v2. Los consumidores Python y Node aplican las mismas
reglas; no deben construir estas rutas por su cuenta.

## Precedencia

1. Si el consumidor recibe un `space` explícito, lo usa. En caso contrario lee
   `aidlc/active-space`; si no existe, usa `default`.
2. Si recibe un `intent` explícito, exige que exista su `aidlc-state.md`.
3. Sin intent explícito, lee
   `aidlc/spaces/<space>/intents/active-intent`.
4. Si el cursor falta o no apunta a un registro válido, usa el único intent que
   contenga `aidlc-state.md`.
5. Si hay varios intents y no existe un cursor válido, detiene la operación por
   ambigüedad. Nunca elige el más reciente ni escribe en un intent supuesto.
6. Si no existe un intent v2 seleccionable, resuelve el layout v1 bajo
   `aidlc-docs/`, cuando el consumidor permite compatibilidad legacy.

Si v1 y un intent v2 válido coexisten, v2 tiene prioridad. Esto permite una
migración gradual sin dividir el estado leído por el tracker, los reportes y el
CI.

## Implementaciones canónicas

- Python: `.intelix/scripts/aidlc_paths.py`.
- Node/CommonJS: `.intelix/scripts/aidlc-paths.cjs`.

El archivo `aidlc_paths.py` incluido dentro de `intelix-task-tracker` es un
adaptador para imports históricos; delega en la implementación Python canónica.

## Qué hacer ante ambigüedad

No renombre ni elimine intents para forzar una selección. Revise cuál representa
el trabajo activo y escriba su nombre exacto en:

```text
aidlc/spaces/<space>/intents/active-intent
```

Luego vuelva a ejecutar el reporte, la skill o el job de CI que se detuvo.

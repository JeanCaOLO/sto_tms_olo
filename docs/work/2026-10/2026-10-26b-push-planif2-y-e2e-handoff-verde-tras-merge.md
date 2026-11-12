# 2026-10-26 (b) — Push de `planificacion-2` + e2e del handoff OMS↔Planif en verde tras el merge

Cierra el loop de [2026-10-26-merge-oms-al-dia-y-verificacion-handoff-en-vivo](./2026-10-26-merge-oms-al-dia-y-verificacion-handoff-en-vivo.md):
se subió la rama y se dejó la prueba de comunicación entre módulos (OMS↔Planif)
corriendo verde contra el backend local ya mergeado.

## Hecho

1. **Push de `planificacion-2` a `github`** (`fa929eb..54c8e00`, luego `9f71489`).
2. **e2e `e2e/oms-handoff.spec.ts` adaptado a la UI mergeada y en VERDE** (`9f71489`):
   - El título de la Cola cambió a **"Pedidos"** (`omsQueue.title`, i18n) → el test ahora
     espera el filtro **Situación** (el control que usa), no el título.
   - Se quitó `waitUntil: 'networkidle'` de los `goto`: la pantalla hace polling y nunca
     queda ociosa; las esperas explícitas (filtro + primera fila visibles) son el gate real.
   - `selectOption('DISP')` con `timeout: 3000` + `.catch`: tras liberar no queda fila DISP
     y la opción desaparece; sin timeout de acción, Playwright reintentaba hasta agotar el
     test (180s). Con timeout corto, la foto "después" simplemente queda sin filtrar.

## Por qué

El usuario pidió re-ejecutar las pruebas funcionales de comunicación OMS↔Planif tras el
merge y dejar la rama subida. El merge trajo cambios de UI que rompían el selector del
test (no el contrato), así que había que adaptarlo.

## Cómo / Verificación

Backend local `OMS_SOURCE=live EFLOW_MODE=mock` (:4000) + Vite (:3000) + túnel SSM.
Staging (rol Planificación): 4 EPA (`2000018874`–`877`) a `dispatch_date=2026-10-22`,
`oms_processed_at` NULL → en ventana. Resultado del barrido del test:

```
[barrido] modo:"live" total:4 priorizados:0 liberados:4 pendientes:0  (prioridad 99)
[cola DISP] antes=4 liberados=4 despues=0
1 passed (41.9s)
```

## Conocimiento promovido

- **El barrido ya NO prioriza a EPA, solo la libera** (`priorizados:0`, `prioridad:99`):
  el comportamiento del commit `015759d` ("compañías sin priorización") se observa en vivo.
  Para EPA, el handoff es DISP→GENE + `oms_processed_at`, con `priority`/`oms_score` NULL.
- **`networkidle` no sirve en pantallas con polling** (tracking/cola): usar esperas de
  elemento. **`selectOption` sin `timeout` de acción reintenta hasta el timeout del test**
  cuando la opción no existe — siempre acotar acciones que pueden quedarse sin target.
- Correr el e2e **headless** evita el OOM que provoca headed + vite + backend juntos en
  esta máquina; las capturas se generan igual.

## Follow-ups

- Abrir PR de `planificacion-2` si se quiere revisión formal (hoy solo está pusheada).
- Typecheck/tests de unidad del front tras el merge: pendientes (correr con margen de memoria).

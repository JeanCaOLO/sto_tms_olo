# Cambios hechos para probar el backend del tarifador

**Fecha:** 2026-10-10 · **Rama:** `josef` · **Estado del backend al escribir esto:** túnel a Aurora cerrado; nada de esto se probó contra la base real.

Esta carpeta es el contexto para abrir una sesión nueva con Claude y retomar el trabajo: qué se cambió en el mock del tarifador, qué se encontró al compararlo con el backend y qué hay que verificar cuando el túnel esté activo.

## Prompt de arranque sugerido

> Lee `docs/tarifador/cambios_hechos_para_probar_backend/README.md` y los archivos que enlaza. Tengo el túnel a Aurora activo. Sigue `CHECKLIST_PRUEBA_BACKEND.md` en orden, dime qué pasa en cada paso frente a lo esperado y propón (sin aplicar) los arreglos de lo que falle. No hagas `git commit` ni `git push`: si hay que versionar, solo `git add` y me das el mensaje de commit.

## Qué es el tarifador y cómo está armado (lo mínimo)

Calcula cuánto se le paga al transportista por cada viaje completado y por qué. Código en `src/lib/tarifas/` (motor, datos) y `src/pages/{liquidaciones,reglas-tarifa,companias}/`. Guía completa: [`../GUIA_TARIFADOR.md`](../GUIA_TARIFADOR.md).

La capa de datos es un ORM propio (`src/lib/tarifas/data/`): un registro de esquema (`schema.ts`) genera el DDL y el manifiesto del backend (`backend/tarifas/src/schema_manifest.json`). En ejecución el frontend habla **siempre** con `HttpDataSource`, que llama a `backend/tarifas` (Lambda Python sobre Aurora). Contrato en el encabezado de `data/http-datasource.ts`.

## Qué es el mock y por qué existe

Sin túnel, el tarifador no tiene datos. Con `VITE_MOCK_AUTH=true` en `.env.local` (solo desarrollo) la app corre el mismo frontend contra un **backend simulado en memoria** con una semilla demo de Costa Rica, Venezuela y Colombia. Pensado para probar todas las funciones y su CRUD y encontrar errores antes de conectar el túnel.

Antes de esta sesión el mock era un almacén en memoria más permisivo que el backend: aceptaba campos que la base rechaza. Por eso un error (guardar una regla) funcionaba en el mock y fallaba con Aurora. Ahora el mock usa el cliente HTTP real y un backend simulado que replica el contrato. Detalle en [`CAMBIOS_EN_EL_MOCK.md`](CAMBIOS_EN_EL_MOCK.md).

## Qué se encontró

Resumen en [`HALLAZGOS.md`](HALLAZGOS.md). Los dos ejemplos que dio el usuario:

1. **«Al marcar una regla como desactivada no se guardaba» (backend):** el formulario enviaba `updated_at`, columna que `tarifas_pricing_rules` no tiene; el backend respondía 400 al crear y editar. **Corregido** quitando el campo.
2. **«En el mock, al liquidar, el viaje se queda en Por liquidar»:** el flujo normal funciona igual en mock y backend; lo que deja un viaje atascado es el bloqueo del motor (p. ej. viaje sin zona de destino). **Explicado y reproducible** con la semilla.
3. Hallazgo adicional importante: **el primer componente de costo de una compañía sin estructura propia fallaba solo con backend** (el driver HTTP no devuelve el id generado dentro de una transacción). **Corregido** generando el id en el cliente.

## Mapa de esta carpeta

| Archivo | Para qué |
|---|---|
| [`CAMBIOS_EN_EL_MOCK.md`](CAMBIOS_EN_EL_MOCK.md) | Todo lo modificado en el código, archivo por archivo y por qué. |
| [`HALLAZGOS.md`](HALLAZGOS.md) | Tabla de hallazgos: causa, veredicto, qué se aplicó y qué queda propuesto. |
| [`CHECKLIST_PRUEBA_BACKEND.md`](CHECKLIST_PRUEBA_BACKEND.md) | Pasos concretos para verificar con Aurora, con resultado esperado y consultas SQL de solo lectura. |
| [`PARCHES_PROPUESTOS/`](PARCHES_PROPUESTOS/) | Cambios propuestos que NO se aplicaron (migración, backend). |
| [`herramientas/`](herramientas/) | Script de repetición de cargas contra el backend Python, evidencia de H9 y los recorridos de navegador. |
| [`COMANDOS.md`](COMANDOS.md) | Cómo levantar el mock, regenerar la semilla, correr pruebas y los recorridos. |

## Reglas del usuario para esta sesión

- **Nunca `git commit` ni `git push`.** Si hace falta versionar: solo `git add` y decir «para manejar control de versiones, ya realicé el stage, te recomiendo hacer commit con la siguiente descripción:» más el mensaje.
- Antes de cambiar código, **proponer más de una solución y preguntar cuál llevar a cabo.**
- No tocar `package.json` ni `package-lock.json` (cambios del usuario con `tailwindcss ^4.3.3`, que rompe el CSS; ver `COMANDOS.md`).
- Texto persistido (código, docs, commits) en prosa normal en español.

## Pendientes que quedaron abiertos

- Verificar todo lo de `CHECKLIST_PRUEBA_BACKEND.md` con el túnel activo.
- Decisiones sin tomar: P17 (país inicial del Probador), P16a (permitir la bitácora al módulo `tarifas.config`, backend), P1b (columna `updated_at` en `tarifas_pricing_rules`). Ver `HALLAZGOS.md`.
- `npm run lint` falla en `HEAD` por errores previos (`src/pages/liquidaciones/page.tsx` tiene 204 líneas contra un máximo de 200; varios tests usan `process` sin declararlo). No se tocaron.

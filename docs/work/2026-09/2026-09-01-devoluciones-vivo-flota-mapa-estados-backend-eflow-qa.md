# 2026-09-01 — Devolución en vivo, mapa de flota + estados, backend read-only EFLOW QA (4 Claudes en paralelo vía Orca)

## What changed
Cuatro piezas de trabajo sobre el módulo `/planificacion`, ejecutadas en paralelo por cuatro agentes Claude aislados en worktrees de Orca y luego integradas, revisadas y commiteadas por Kiro en `jesus-planificacion`:

- **Devolución en vivo + separación delivery/devolución** (commit `04d28a3`): botón "Devolución en vivo" en Ruta en Construcción que siembra un pickup no planificado en la secuencia, se ancla en el optimizador (nunca se descarta), y muestra qué entregas descargar si no cabe la carga entrante; secciones entrega/devolución y variante EN VIVO en el badge de parada.
- **Mapa de secuencia por vehículo + estado de secuencia** (commit `19b9dc8`): reparto de flota reusa `RutaMapaPreview` para mostrar el mapa de cada vehículo tras Calcular Reparto; `EstadoSecuencia` (activa/completada/cancelada) con badge y botones accesibles, extendiendo `route-status.ts`. Se evitó deliberadamente el término "ruta"/"viaje" (son conceptos de la DB).
- **Esquema real de EFLOW QA** (commit `2085cd9`): investigación read-only de la BD QA que documenta las fuentes reales por entidad y el JOIN canónico viaje→ruta→conductor→vehículo→transportista.
- **Mini-backend read-only de EFLOW QA** (commit `75f38c0`): Express + mssql que expone `GET /api/viajes`, `/api/viajes/:id` y `/api/catalogos/{rutas,transportistas,conductores,vehiculos}` con datos reales de QA; verificado en vivo (conecta y devuelve viajes reales).

## Why
El usuario pidió: (1) que la devolución en vivo se visualice y entre en optimización/carga; (2) mostrar el mapa de secuencia tras el reparto de flota y poder ver/cambiar estados de las secuencias; (3) reemplazar los nombres MOCK ("Viaje 1", "Viaje 2"…) de transportista/conductor/vehículo por datos reales de QA — para lo cual primero había que descubrir qué expone la BD y luego exponerlo por un backend propio, sin tocar el repo hermano `olo-aplicaciones-api`. La investigación corrigió un supuesto del equipo: rutas, conductores **y** vehículos son reales en QA; lo único mock es la capacidad del vehículo (`weight_capacity`/`volumetric_capacity` = 0).

## How
- **Orquestación**: Kiro creó worktrees Orca (`orca worktree create --agent claude`) y envió cada brief como instrucción de una línea apuntando a un `BRIEF.md` copiado al worktree (el `--prompt`/`--text` multilínea rompe el parser de argumentos de Orca). Los cuatro corrieron con bypass-permissions. B se lanzó después de A porque dependía del esquema que A descubrió.
- **Integración**: como los Claudes no commitearon en sus ramas, Kiro copió/fusionó los cambios al repo principal. `page.tsx` lo tocaban dos features (C y D) en regiones distintas → se aplicaron los cuatro cambios a mano tras confirmar que no se solapaban. El `package.json` que produjo B era destructivo (pnpm había pruneado `leaflet`, `react-leaflet`, `vitest`, playwright y los scripts de test) → NO se copió; se aplicaron quirúrgicamente solo `express`, `mssql` y el script `server` sobre el `package.json` bueno.
- **Backend**: `server/{index,db,queries}.mjs` + `server/README.md`. Solo SELECT, queries parametrizadas, conexión desde `.env.local` (host/usuario/contraseña fuera de git). Proxy de Vite `/api/*` → `localhost:4000`.
- **Seguridad**: el doc de A y el `server/README.md` habían quedado con la IP interna del SQL Server y PII real (nombres de conductores, cédulas, placas, empresas). Se sanearon a placeholders; la IP/credenciales se movieron a `.env.local` (gitignored) con un `.env.example` versionado. Como el doc con la IP ya se había pusheado, se reescribió el historial de la rama de feature (`reset --soft` + recommit + `push --force-with-lease`) para eliminar el commit filtrado.
- **Verificación** (Kiro, no confiando en los RESULT de los agentes): `pnpm test` → 26 tests verdes tras integrar los cuatro; `tsc` del módulo 0 errores; `pnpm build` OK; server arrancado contra QA real con `/api/health` → `{ok:true}` y `/api/viajes` devolviendo un viaje real.

## Promoted knowledge
- `docs/guides/eflow-qa-schema-planificacion.md` (nuevo, guía viva): esquema real de EFLOW QA para planificación — fuentes por entidad, columnas clave, SELECTs de ejemplo y JOIN canónico. Es la verdad vigente de dónde viven los datos reales; consúltese ahí, no en este worklog.
- `server/README.md` (nuevo): contrato de endpoints del mini-backend, variables de entorno y cómo correrlo.
- `.env.example` (nuevo): claves de conexión a QA sin valores.

## Follow-ups
- [ ] Rewire del frontend `/planificacion` para consumir `fetch('/api/viajes')` en vez del JSON mock (`fallback-*.ts`) — B lo dejó explícitamente fuera de alcance; es la tarea que cierra el objetivo original de "nombres reales".
- [ ] La capacidad de vehículo llega en 0 desde QA (mock); el frontend sigue usando capacidades sintéticas — decidir con negocio si se captura capacidad real o se mantiene la síntesis.
- [ ] `pnpm type-check` tiene ~2 errores preexistentes en `src/pages/{transportistas,vehiculos}/page.tsx` (CsvField/CsvImportModalProps), ajenos a este trabajo — limpiar aparte.
- [ ] Flujo de entrega futuro: los worktrees deben commitear en su propia rama y Kiro hacer merge revisado (acordado con el usuario), en vez de copiar archivos — evita el problema del `package.json` destructivo y los solapes de `page.tsx`.
- [ ] El commit huérfano con la IP puede persistir en el reflog interno de GitHub; rotación total del lado servidor queda para quien administre el repo.

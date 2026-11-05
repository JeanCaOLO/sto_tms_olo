# Data mock del módulo de tarifas (DEMO)

Dato de **prueba/demostración** para mostrar Liquidaciones y Proformas. Se borra después.

- **JSON (fuente única):** `docs/tarifador/demo-data/mock-tarifas.json` (tablas reales de Aurora, `organization_id = "@ORG"`).
- **Generador:** `npx jiti scripts/mock-tarifas/generar.ts` (usa el motor real: los desgloses son los que produciría la app).
- **Carga/borrado en Aurora:** `scripts/mock-tarifas/cargar.mjs` (túnel arriba, ver `scripts/tunel-aurora.ps1`).

```
node --env-file=.env.local scripts/mock-tarifas/cargar.mjs                    # simulación (revierte)
node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --execute          # carga
node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --estado           # qué hay cargado (solo lectura)
node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --reset            # simulación del borrado
node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --reset --execute  # borra la mock
```

## Cómo está aislada
Crea **dos países nuevos**, "Costa Rica MOCK" y "Venezuela MOCK" (selector de país de la web). Todo cuelga de ellos
(reglas, tarifarios, costos, márgenes, transportistas `MOCK-*`, viajes, pedidos, liquidaciones, proformas), así que
**no toca ni cambia el cálculo de los países reales**. Los ids de texto llevan prefijo `MOCK_`; el borrado usa la lista
exacta de ids del JSON y lo que la app haya creado sobre esos países.

## Qué trae (44 liquidaciones, 17 proformas, 71 viajes, 718 pedidos)
- Liquidaciones en todos los estados: Borrador, En Revisión, Aprobado, Pagado, Anulado; margen OK/WARN/CRITICAL/LOSS;
  una **re-liquidación** (anulada que apunta a la nueva), una anulada sin reemplazo, otra **anulada por reclamo**.
- Transportistas con base **por kilómetro, por unidad (paradas) y por volumen** (5 en total, con su perfil y su regla BASE): el
  cargo por km / por parada del país queda omitido ("duplica la base") para no cobrar dos veces.
- **Correcciones de monto a mano** (4, con su motivo) y **reglas ad-hoc** puntuales (3).
- Con **líneas destildadas**, **devoluciones informadas**, **pedidos anulados/diferidos**, notas y motivos de margen.
- Terceros por tarifa fija, **tendering** (con adjudicación), flota propia (estructura de costos), un transportista **sin forma
  de cobro** (su viaje sale bloqueado), un contrato **vencido**.
- Proformas: Pagado, Aprobado, En Revisión (varias fases), Borrador (rechazada), **reclamos** abierto/apelado/reiniciado, Anulado.
- Viajes **Por Liquidar**: listos, incompletos, no completados, y 3 **bloqueados por devoluciones sin recibir** (módulo Devoluciones).

## Límites conocidos
- La bitácora (`tbl_tarifas_audit_log`) es append-only: al borrar, sus ~76 filas quedan huérfanas (inofensivas).
- Las filas pasan por los triggers de auditoría de las tablas del TMS (carga y borrado quedan en el esquema `audit`).
- Los países MOCK aparecen en el selector de país de todos los módulos (no solo en tarifas) mientras existan.

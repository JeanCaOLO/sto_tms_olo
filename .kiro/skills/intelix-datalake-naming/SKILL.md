---
name: intelix-datalake-naming
description: >-
  Valida y propone nombres de objetos de base de datos ANALITICA (lago de datos)
  siguiendo el estandar INTELIX por capas medallion + SSoT: bronze/silver/gold
  (dwh, viewbi) y ssot, mas la naturaleza intermedia (bridge/interface). Revisa
  archivos .sql y reporta violaciones de nomenclatura (mayusculas, acentos,
  snake_case, prefijo de fuente fuera de bronze, clase dim/fact/master, prefijos
  dimensionales dim_/fact_/br_/agg_, vistas vw_/mvw_, volatilidad stg_/hist_ en
  bridge, placeholders sin reemplazar). Usar cuando el usuario pida: validar
  nombres de tablas de un lago de datos o datawarehouse, revisar nomenclatura
  analitica, proponer el nombre correcto de una tabla/vista por capa, o auditar
  scripts .sql analiticos. Motor de referencia: PostgreSQL. Para provisioning de
  bases transaccionales usar la skill intelix-db-provisioning.
---

# INTELIX Datalake Naming — Validador de nomenclatura analitica y bridge

## Que hace

Provee un linter (`validar_sql.py`) que revisa archivos `.sql` y verifica que
los nombres de tablas, vistas, vistas materializadas y esquemas cumplan el
estandar INTELIX segun la **naturaleza** y, en el caso analitico, segun la
**capa** (esquema) en que viven. **Reporta, no bloquea.**

El marco completo y el arbol de decision entre naturalezas esta en
`docs/estandares-base-de-datos.md`. El detalle del estandar analitico
esta en `docs/estandares-lago-de-datos-intelix.md` y
`docs/estandares-datawarehouse-intelix.md`; el de bridge en
`docs/estandares-bridge-intelix.md`.

## Modelo de capas (lago, PostgreSQL)

Las capas son **esquemas** dentro de una sola base de datos del lago (nombre de
BD parametrizable, p. ej. `datalakeprd`, `datalakeqa`). Nombre canonico = color;
el nombre funcional se conserva como concepto documentado.

| Esquema (capa) | Funcional | Patron de tabla | Ejemplo |
|---|---|---|---|
| `bronze` | raw / staging | `{tipo_fuente}_{sistema}_{clase}_{entidad}[_{pais}]` | `xls_khai_fact_consolidado` |
| `silver` | refined / sor | `{sistema}_{clase}_{entidad}[_{pais}]` (cae `tipo_fuente`) | `khai_fact_consolidado` |
| `dwh` (en gold) | modelo estrella/copo | `dim_` / `fact_` / `br_` / `agg_` | `dim_commodity`, `fact_embarque` |
| `viewbi` (en gold) | perspectivas BI | `vw_` / `mvw_` | `vw_venta_mensual` |
| `ssot` | fuente oficial certificada | `mvw_` / `vw_` / tablas certificadas | `mvw_venta_oficial` |

- `clase` ∈ `dim` / `fact` / `master`. `tipo_fuente` ∈ `xls csv txt gsh api db json xml`.
- Sufijo `_pais` (ISO alpha-2) valido en todas las capas.
- No toda entidad recorre todas las capas hasta llegar a SSoT.

## Naturaleza intermedia (bridge)

Una BD por par origen-destino. Direccion por esquema (`inbound` / `outbound`),
volatilidad por prefijo (`stg_` transitoria, `hist_` historica) y cuerpo
source-oriented heredado de bronze:

```
{stg|hist}_{tipo_fuente}_{sistema}_{clase}_{entidad}
p. ej.  inbound.stg_xls_khai_fact_consolidado
        outbound.hist_db_softland_fact_asiento
```

## Uso

Requisitos: Python 3.8+ (solo libreria estandar, sin dependencias).

```bash
# Validar archivos concretos
python validar_sql.py output/postgresql_provisioning.sql otro.sql

# Validar todos los .sql de un directorio
python validar_sql.py --dir ./output

# Verificacion interna del propio validador (casos de prueba)
python validar_sql.py --self-test
```

Salida: por cada objeto no conforme imprime `archivo:linea: [NIVEL] mensaje`
con la correccion sugerida. Termina en codigo 0 (es un linter de reporte).

## Integracion con hooks y agentes

- **Uso directo por cualquier agente (Claude Code, Cursor, Codex, Kiro, OpenCode, Copilot):**  
  Cualquier agente puede invocar `python validar_sql.py <archivo.sql>` o `python validar_sql.py --dir ./output` directamente tras generar o modificar archivos SQL.
- **Hook automatico para Kiro IDE:**  
  La definicion del hook vive en `hooks/db-naming-validator.json` dentro de esta skill (evento `PostFileSave` sobre `*.sql`). Al guardarse un archivo SQL, Kiro invoca automaticamente `validar_sql.py --hook` para reportar observaciones de nomenclatura en tiempo real sin bloquear.

## Que valida

- **Transversal (toda naturaleza):** minusculas, snake_case, sin acentos ni
  n-tilde, sin placeholders `{{...}}` sin reemplazar.
- **Por capa analitica:** prefijo de fuente solo en bronze; clase dim/fact/master;
  prefijos dimensionales en dwh; vistas vw_/mvw_ en viewbi/ssot.
- **Bridge:** volatilidad stg_/hist_ + cuerpo source-oriented.

## Limites (honestos)

- Es un analizador lexico por expresiones regulares sobre sentencias
  `CREATE TABLE/VIEW/MATERIALIZED VIEW/SCHEMA`; no ejecuta SQL ni valida
  semantica de negocio.
- Infiere la capa por el **nombre del esquema** calificado (`esquema.objeto`).
  Un objeto sin esquema calificado solo recibe las reglas transversales.
- No renombra automaticamente: sugiere; la correccion la aplica la persona.

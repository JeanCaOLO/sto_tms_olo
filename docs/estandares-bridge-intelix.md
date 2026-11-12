# Estándar de Base de Datos Intermedia — Bridge / Interface — INTELIX

> Fuente de verdad de la naturaleza **intermedia (bridge)**. Bases de datos
> "puente" que desacoplan un **origen** de un **destino**, con alta fidelidad al
> origen. Motor: **cualquiera** (depende del origen/destino).
> Router de naturalezas: `.kiro/steering/estandares-base-de-datos.md`.

## 1. Cuándo aplica

Aplica a bases **intermedias / de integración** (patrón ODS / integración) que
sirven de puente entre un sistema origen y un sistema destino: landing de ETL,
áreas de intercambio, ODS operacional, etc. No es OLTP (no es el aplicativo
transaccional final) ni analítica (no es el lago ni el DWH de explotación).

### Terminología: `bridge` vs `interface`

Se adopta **`bridge`** como término canónico (describe con precisión el paso
origen→destino y coincide con "puente"). **`interface`** se conserva como
sinónimo documentado. Se prefiere `bridge` porque "interface" está sobrecargado
(interfaces de UI, de API, de código) y sería ambiguo en un estándar de nombres.
Token corto: `brg`.

> Nota: no confundir la **naturaleza bridge** (BD puente entre sistemas) con la
> **bridge table dimensional** (`br_`, relaciones M:N dentro de un DWH).

## 2. Estructura física

- **Una base de datos por par origen–destino.** El nombre de la BD codifica el
  par y es parametrizable por ambiente (ambiente por instancia/servidor):

  ```
  {compania}_brg_{origen}_{destino}_db
  ej.  acme_brg_sapb1_softland_db
  ```

- **Dirección = esquema:**
  - `inbound`: lo que entra desde el origen (fiel a la fuente).
  - `outbound`: lo moldeado para el destino.
  - La bidireccionalidad se cubre con la presencia de ambos esquemas. El caso
    esperado es unidireccional (origen→destino), pero no se descarta bidireccional.

## 3. Convención de nombres de tabla

Volatilidad por prefijo + cuerpo source-oriented heredado de bronze:

```
{volatilidad}_{tipo_fuente}_{sistema}_{clase}_{entidad}[_{pais}]
```

| Componente | Valores | Significado |
|---|---|---|
| `volatilidad` | `stg` / `hist` | `stg` = transitoria (truncate/reload); `hist` = persistente con historia |
| `tipo_fuente` | `xls csv txt gsh api db json xml` | Medio de extracción del origen |
| `sistema` | corto, minúsculas | Sistema origen (`sapb1`, `khai`, `softland`...) |
| `clase` | `dim` / `fact` / `master` | Naturaleza prevista de la entidad |
| `entidad` | snake_case singular | Contenido |
| `pais` | ISO alpha-2 (opcional) | Multi-país |

Una BD bridge suele contener **entidades de ambos tipos** (transitorias `stg_` e
históricas `hist_`) simultáneamente.

## 4. Reglas de formato

1. Todo en minúsculas, snake_case, sin acentos ni ñ.
2. Prefijo de volatilidad obligatorio (`stg_` o `hist_`).
3. Conserva el prefijo de fuente (`tipo_fuente`) para preservar la trazabilidad
   del origen (a diferencia del lago, donde solo aplica en bronze).
4. `entidad` en singular; sufijo `_pais` opcional.

## 5. Ejemplos

- `inbound.stg_xls_khai_fact_consolidado` — landing transitorio desde Excel.
- `inbound.hist_db_sapb1_dim_articulo` — ODS persistente con historia desde SAP.
- `outbound.hist_db_softland_fact_asiento` — moldeado para Softland, con historia.
- `outbound.stg_api_softland_master_homologacion_cl` — transitorio, multi-país.

## 6. Motor y fuentes

- **Cualquier motor** (PostgreSQL, MySQL/MariaDB, SQL Server, Oracle u otro),
  según lo que exijan el origen y el destino.
- Las fuentes pueden ser diversas; el prefijo `tipo_fuente` documenta el medio.

## 7. Validación

Usar la skill `intelix-datalake-naming` (`validar_sql.py`): los esquemas
`inbound`/`outbound` exigen prefijo `stg_`/`hist_` seguido del cuerpo
source-oriented.

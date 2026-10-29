# Estándar de Base de Datos Analítica — Lago de Datos (Medallion + SSoT) — INTELIX

> Fuente de verdad del estándar analítico de **lago de datos**. Basado en la
> propuesta de nomenclatura de tablas (v1.0),
> extendida con la arquitectura por capas. Motor de referencia: **PostgreSQL**
> (diseño extensible a otros motores analíticos).
> Router de naturalezas: `.kiro/steering/estandares-base-de-datos.md`.
> Modelo dimensional (esquema `dwh`): `estandares-datawarehouse-intelix.md`.

## 1. Cuándo aplica

Aplica a repositorios **analíticos de tipo lago de datos**: consolidación
multi-fuente para lectura analítica y explotación BI. Distinto de OLTP
(transaccional) y de bridge (intermedia).

## 2. Arquitectura por capas (medallion + SSoT)

Las **capas son esquemas** que viven en **una sola base de datos del lago**. El
nombre de la BD es **parametrizable** (ej. `datalakeprd`, `datalakeqa`); no es
una restricción fija. El nombre **canónico de cada capa es el color**, y el
nombre **funcional se conserva como concepto documentado** (no se pierde su
significado semántico y operativo).

| Capa (esquema) | Alias funcional | Propósito |
|---|---|---|
| `bronze` | `raw` / `staging` | Datos crudos sin refinar, fieles a la fuente origen |
| `silver` | `refined` / `sor` | Calidad de datos, limpieza y cálculos particulares |
| `gold` (momento) | `viewbi` | Capa de perspectivas / consumo BI |
| `dwh` (dentro de gold) | — | Modelo dimensional estrella / copo de nieve |
| `ssot` | — | Repositorio único **certificado y oficial** para consumo del negocio |

**Notas importantes:**

- El **momento gold** se materializa en uno o varios **esquemas físicos**:
  `dwh` (modelo dimensional), `viewbi` (vistas BI) y, opcionalmente, otros
  esquemas certificados. No existe necesariamente un esquema literal `gold`.
- **No toda entidad recorre todas las capas** hasta llegar a SSoT: una entidad
  puede saltar capas según su necesidad.
- **SSoT** contiene el conjunto certificado y oficial de consumo: tablas
  materializadas, vistas certificadas y otros objetos de interés para consumo.
  Es la frontera entre "perspectivas disponibles" (gold/viewbi) y "verdad única
  certificada" (ssot).
- Un esquema `dwh` puede convivir en el lago aplicando deliberadamente el
  estándar dimensional (ver doc de datawarehouse).

## 3. Convención de nombres por capa

El patrón cambia por capa porque `tipo_fuente` solo aplica en bronze y, a medida
que los datos se conforman, dejan de mapear a una sola fuente.

| Capa | Patrón de tabla | Ejemplo |
|---|---|---|
| `bronze` | `{tipo_fuente}_{sistema}_{clase}_{entidad}[_{pais}]` | `xls_khai_fact_consolidado` |
| `silver` | `{sistema}_{clase}_{entidad}[_{pais}]` *(cae `tipo_fuente`, mantiene sistema)* | `khai_fact_consolidado` |
| `dwh` | `dim_{entidad}` · `fact_{entidad}` · `br_{a}_{b}` · `agg_{entidad}` | `dim_commodity`, `fact_embarque` |
| `viewbi` | `vw_{entidad}` · `mvw_{entidad}` | `vw_venta_mensual` |
| `ssot` | `mvw_{entidad}` · `vw_{entidad}` · tablas certificadas | `mvw_venta_oficial` |

### 3.1 Componente `tipo_fuente` (medio de extracción, solo bronze)

| Prefijo | Tipo de fuente | Prefijo | Tipo de fuente |
|---|---|---|---|
| `xls` | Excel (.xls/.xlsx) | `api` | API / servicio REST |
| `csv` | Archivo CSV | `db` | Base de datos directa |
| `txt` | Texto plano / delimitado | `json` | Archivo o payload JSON |
| `gsh` | Google Sheet | `xml` | Archivo o payload XML |

> **Gobernanza:** si el medio de extracción cambia (ej. de Excel a API), la
> tabla de bronze actualiza su prefijo (`xls_interport_...` → `api_interport_...`).
> El cambio señala una modificación del mecanismo de extracción y se gestiona por
> control de versiones.

### 3.2 Componente `sistema_origen` (identidad de negocio)

Corto, en minúsculas y estable. Ejemplos: `sapb1` (SAP Business One), `khai`
(IFS/KHAI), `bebex` (Data Financiera BEBEX), `interport`, `alafletes`,
`softland` (Softland ERP).

### 3.3 Componente `clase` (naturaleza de la tabla)

Se usan **letras completas** (más legibles que las marcas de una letra):

| Marca | Clase | Contenido típico |
|---|---|---|
| `dim` | Dimensión | Maestros y catálogos (artículos, clientes, sucursales) |
| `fact` | Hecho | Transaccional (ventas, embarques, cobranzas) |
| `master` | Maestro / Mapeo | Apoyo (tasas de cambio, homologaciones) |

En **bronze** la `clase` refleja la **naturaleza prevista** de la entidad.

### 3.4 Componente `entidad` y sufijo `pais`

- `entidad`: descriptivo en snake_case, minúsculas, sin acentos y en **singular**
  (ej. `consolidado`, `embarque`, `cobranza`).
- `pais` (opcional): ISO-3166 alpha-2 en minúsculas (`ar`, `co`, `cl`, `mx`,
  `pe`, `ve`). Válido en **todas** las capas.

## 4. Reglas de formato obligatorias

1. Todo en minúsculas.
2. Formato snake_case.
3. Sin acentos ni caracteres especiales (incluida la ñ).
4. Nombres cortos, claros y descriptivos; `entidad` en singular.
5. Consistencia en el uso de `sistema_origen`.

## 5. Ejemplos aplicados

### Proyecto Logístico (LV26004) — fuentes Excel en bronze

- IFS Consolidado: `bronze.xls_khai_fact_consolidado`
- Data Financiera BEBEX: `bronze.xls_bebex_fact_comparativo_servicios`
- Interport Embarques: `bronze.xls_interport_fact_embarques`
- Alafletes Cobranzas: `bronze.xls_alafletes_fact_cobranzas`
- Catálogo de Commodities: `bronze.xls_khai_dim_commodity`
- Tasa de Cambio: `bronze.xls_bebex_master_tasa_cambio`

### Refinamiento y consumo

- Silver refinado: `silver.khai_fact_consolidado`
- DWH dimensional: `dwh.dim_commodity`, `dwh.fact_embarque`
- Vista BI: `viewbi.vw_venta_mensual`
- Certificado SSoT: `ssot.mvw_venta_oficial`

### Otros escenarios de bronze

- SAP B1 dimensión de artículos: `bronze.db_sapb1_dim_articulo`
- API de embarques Interport: `bronze.api_interport_fact_embarque`
- Google Sheet de facturación: `bronze.gsh_alafletes_fact_cobranza`
- Ventas SAP Chile: `bronze.db_sapb1_fact_venta_cl`

## 6. Ambientes

En el mundo analítico los ambientes se separan por **instancia/servidor
distinto** por ambiente (la BD y los esquemas mantienen el mismo nombre entre
ambientes). Opcionalmente, un esquema puede llevar un **sufijo distintivo** si
conviven ambientes en una misma instancia. El nombre de la BD del lago es
parametrizable por ambiente (`datalakeprd`, `datalakeqa`, `datalakedev`).

## 7. Aplicación y adopción

- **Nuevos lagos:** adoptar esta convención desde el diseño inicial.
- **Lagos existentes (p. ej. IRO):** no se renombran tablas actuales para no
  afectar vistas o reportes de Power BI; se aplica a **nuevas** tablas.
- **Documentación:** cada diccionario de datos incluye en su cabecera los campos
  explícitos *Tipo de Fuente* y *Sistema Origen*.
- **Validación:** usar la skill `intelix-datalake-naming` (`validar_sql.py`)
  para revisar la nomenclatura de los scripts `.sql` antes de aplicarlos.

## 8. Comparativa con la convención anterior (IRO)

| Antes (IRO) | Propuesta actual | Mejora |
|---|---|---|
| `sapb1_d_articulos` | `bronze.db_sapb1_dim_articulo` | Añade medio de extracción (`db`), clase legible y singular |
| *(no aplicaba)* | `bronze.xls_khai_fact_consolidado` | Soporta archivos planos y otros medios |

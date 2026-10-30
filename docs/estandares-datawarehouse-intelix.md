# Estándar de Datawarehouse (Modelo Dimensional) — INTELIX

> Fuente de verdad del estándar dimensional. Aplica al esquema `dwh` dentro del
> momento **gold** de un lago de datos, o a un datawarehouse independiente.
> Motor de referencia: **PostgreSQL** (extensible a otros motores analíticos).
> Router de naturalezas: `.kiro/steering/estandares-base-de-datos.md`.
> Lago de datos y capas: `estandares-lago-de-datos-intelix.md`.

## 1. Cuándo aplica

Aplica al **modelo dimensional conformado** (estrella / copo de nieve): las
dimensiones y hechos ya no representan una fuente única, sino un modelo
consolidado y certificado para análisis. Se materializa típicamente en el
esquema `dwh` (dentro de gold), pero la convención vale para cualquier
datawarehouse.

Diferencia clave con bronze/silver: aquí **desaparece el prefijo de fuente**
(`tipo_fuente`) y el `sistema_origen`, porque el objeto es conformado.

## 2. Convención de nombres (prefijos dimensionales)

```
{prefijo_dimensional}_{entidad}[_{pais}]
```

| Prefijo | Tipo de objeto | Contenido | Ejemplo |
|---|---|---|---|
| `dim_` | Dimensión | Contexto descriptivo (quién, qué, dónde, cuándo) | `dim_commodity`, `dim_cliente`, `dim_tiempo` |
| `fact_` | Hecho | Métricas y eventos medibles del negocio | `fact_embarque`, `fact_venta`, `fact_cobranza` |
| `br_` | Puente (bridge table) | Relaciones muchos-a-muchos entre dim/fact | `br_producto_categoria` |
| `agg_` | Agregado | Preagregaciones / resúmenes materializados | `agg_venta_mensual` |

> Nota: `br_` aquí es una **bridge table dimensional** (resuelve M:N dentro del
> modelo). No confundir con la **naturaleza bridge/interface** (BD puente entre
> sistemas), que tiene su propio doc.

## 3. Reglas de formato

1. Todo en minúsculas, snake_case, sin acentos ni ñ.
2. `entidad` en **singular** y descriptiva (`dim_cliente`, no `dim_clientes`).
3. Sufijo `_pais` (ISO alpha-2) opcional cuando el objeto es multi-país.
4. Las **claves subrogadas** (surrogate keys) se nombran `sk_{entidad}`
   (ej. `sk_cliente`); las **claves de negocio** (natural keys) `nk_{entidad}`.
5. Las columnas de fecha/tiempo referencian la dimensión de tiempo
   (`fk_tiempo` / `sk_tiempo`).

## 4. Modelado dimensional

- **Estrella:** hechos en el centro rodeados de dimensiones desnormalizadas.
  Preferido por simplicidad y desempeño en BI.
- **Copo de nieve:** dimensiones normalizadas en sub-dimensiones. Usar solo con
  justificación (jerarquías extensas, reutilización de sub-dimensiones).
- **Dimensiones lentamente cambiantes (SCD):** documentar el tipo (SCD1
  sobrescribe, SCD2 versiona con vigencia). Para SCD2 incluir columnas de
  control (`fecha_inicio`, `fecha_fin`, `es_vigente`).
- **Granularidad del hecho:** declararla explícitamente en el diccionario de
  datos (una fila de `fact_venta` = una línea de factura, por ejemplo).

## 5. Relación con las capas del lago

- Las tablas `dim_`/`fact_` del esquema `dwh` se alimentan típicamente desde
  `silver` (datos refinados y con calidad).
- Las vistas de consumo BI viven en `viewbi` (`vw_`/`mvw_`); las certificadas y
  oficiales, en `ssot`.
- No toda entidad del lago llega al modelo dimensional; solo las que el negocio
  necesita analizar de forma conformada.

## 6. Validación

Usar la skill `intelix-datalake-naming` (`validar_sql.py`): el esquema `dwh`
exige que los objetos inicien con `dim_`, `fact_`, `br_` o `agg_`.

## 7. Ejemplos

- `dwh.dim_commodity`, `dwh.dim_cliente`, `dwh.dim_tiempo`
- `dwh.fact_embarque`, `dwh.fact_venta_cl`
- `dwh.br_producto_categoria`
- `dwh.agg_venta_mensual`

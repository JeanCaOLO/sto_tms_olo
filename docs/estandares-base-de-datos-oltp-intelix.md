# Estándar de Base de Datos Transaccional (OLTP) — INTELIX

> Fuente de verdad del estándar OLTP. Vinculante para todo diseño y
> aprovisionamiento de bases de datos transaccionales en INTELIX.
> Router de naturalezas: `.kiro/steering/estandares-base-de-datos.md`.

## 1. Cuándo aplica

Aplica a bases de datos de **naturaleza transaccional (OLTP)**: sistemas de
aplicativos con escritura frecuente, integridad referencial y modelo
normalizado. Motores soportados: **PostgreSQL, MySQL/MariaDB, SQL Server y
Oracle**.

Si la base es **analítica** (lago de datos / datawarehouse) o **intermedia**
(bridge/interface), este estándar NO aplica; ver los docs correspondientes.

La automatización vive en la skill `intelix-db-provisioning` (kit que genera
scripts SQL de provisioning y validación; no se conecta a las bases).

## 2. Convención de nomenclatura

### Estructura general

```
{compania}_{ambiente}_{aplicativo}_{tipo-objeto}_{nombre-descriptivo}
```

| Componente | Descripción | Ejemplo |
|---|---|---|
| `compania` | Identificador corto de empresa (3-5 car.) | `acme` |
| `ambiente` | Ambiente de despliegue | `dev`, `qa`, `prd` |
| `aplicativo` | Nombre del aplicativo | `ventas`, `nomina` |
| `tipo-objeto` | Prefijo según tipo de objeto | `tbl`, `vw`, `sp` |
| `nombre` | Nombre descriptivo en snake_case | `clientes_activos` |

### Prefijos por tipo de objeto

| Objeto | Prefijo | Ejemplo | Objeto | Prefijo | Ejemplo |
|---|---|---|---|---|---|
| Base de datos | `db` | `acme_prd_ventas_db` | Trigger | `trg` | `trg_auditoria_clientes` |
| Esquema | `sch` | `acme_prd_ventas_sch_core` | Índice | `idx` | `idx_clientes_email` |
| Tabla | `tbl` | `tbl_clientes` | Índice único | `uidx` | `uidx_clientes_documento` |
| Vista | `vw` | `vw_clientes_activos` | Secuencia | `seq` | `seq_clientes_id` |
| Vista materializada | `mvw` | `mvw_resumen_ventas` | Primary key | `pk` | `pk_clientes` |
| Stored procedure | `sp` | `sp_calcular_comision` | Foreign key | `fk` | `fk_ventas_clientes` |
| Función | `fn` | `fn_obtener_edad` | Unique / Check | `uq` / `ck` | `uq_clientes_email` |

## 3. Reglas de formato obligatorias

1. Todo en minúsculas.
2. Formato snake_case (palabras separadas por `_`).
3. Sin acentos ni caracteres especiales (incluida la ñ).
4. Nombres cortos, claros y descriptivos.
5. Consistencia en el uso de `compania`, `ambiente` y `aplicativo`.

## 4. Convención de roles y usuarios

| Rol | Formato | Permisos | Usuario típico |
|---|---|---|---|
| Solo lectura | `ro_{app}` | `SELECT` | `usr_{app}_report` |
| Lectura/escritura | `rw_{app}` | DML | `usr_{app}_app` |
| DDL | `ddl_{app}` | DDL + DML + lectura | `usr_{app}_deploy` |
| Administrador | `admin_{app}` | Control total | `usr_{app}_dba` |

Herencia: `admin > ddl > rw > ro`. Los permisos se aplican a nivel de esquema e
incluyen **objetos futuros** (default privileges / grants / triggers según el
motor). Principio de **mínimo privilegio**: cada rol recibe solo lo necesario.

## 5. Política de contraseñas

- Parametrizables (en `config.yaml` o variables `DBKIT_PASS_*`).
- No expiran (se rotan por proceso operativo, no por caducidad automática).
- Complejidad recomendada: mayúsculas + minúsculas + números + especiales.
- Longitud mínima recomendada: 12 caracteres.
- En CI/CD, gestionarlas como **secretos del pipeline**; nunca versionarlas.

## 6. Rollback

Cada bloque de creación incluye su ROLLBACK correspondiente comentado. Para
deshacer: localizar la sección `-- ROLLBACK ...`, descomentar y ejecutar en
orden **descendente** (de la sección más alta a la más baja).

## 7. Múltiples esquemas por aplicativo

El kit soporta declarar varios esquemas en un solo run
(`schemas: [core, staging, audit]`). La base de datos, roles y usuarios se crean
una sola vez; el bloque de esquema, permisos y objetos se repite por cada
esquema declarado. Nombres resultantes: `acme_prd_ventas_sch_core`, etc.

## 8. Diferencias clave por motor

| Concepto | PostgreSQL | MySQL | SQL Server | Oracle |
|---|---|---|---|---|
| BD != Esquema | Sí | No (iguales) | Sí | No (usuario=esquema) |
| Multi-esquema se materializa como | Varios schemas en 1 BD | Varias bases de datos | Varios schemas en 1 BD | Varios usuarios propietarios |
| Grants a objetos futuros | Default privileges | Grants `db.*` | Grants `ON SCHEMA` | Trigger por esquema |
| Login separado del usuario | No | No | Sí | No |

## 9. Ambientes y control de versiones

- Los ambientes AWS mapean a las ramas del proyecto: DEV ↔ `develop`,
  QA ↔ `qa`, PROD ↔ `master` (ver `estandares-desarrollo-intelix.md` y
  `branching-rules.md`).
- Stacks/entornos independientes desde la misma definición; entre ambientes
  cambian los parámetros (compañía, ambiente, contraseñas), nunca la estructura.

## 10. Flujo de trabajo recomendado

1. Definir configuración (`config.yaml` o `.env`).
2. `python generate.py --engine all`.
3. Revisar los scripts en `output/`.
4. Ejecutar el provisioning en el motor destino (con aprobación humana para
   ambientes compartidos QA/PROD).
5. `python validate.py --engine all` y ejecutar la validación.
6. Confirmar que todas las filas muestran `OK`.

## 11. Reglas no negociables

- La creación de objetos de BD **no se hace a mano en la consola**: se usa el
  kit para dejar trazabilidad y estandarización.
- **Mínimo privilegio** siempre; prohibido otorgar control total por defecto.
- Contraseñas y secretos **fuera del repositorio**.
- Todo script debe incluir su **ROLLBACK** y ser revisado antes de ejecutar.

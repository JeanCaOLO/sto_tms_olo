# Kit de Provisionamiento Estandar Multi-Motor de Base de Datos

Kit estandarizado para crear bases de datos, esquemas, roles, usuarios y
asignaciones de permisos en **PostgreSQL, MySQL/MariaDB, SQL Server y Oracle**,
con convenciones de nomenclatura unificadas, rollback incluido, generacion
automatica de scripts, verificacion posterior y soporte para **multiples
esquemas por aplicativo en un solo run**.

El kit no se conecta a las bases de datos: **genera scripts SQL** listos para
revisar y ejecutar. Esto lo hace seguro para flujos con aprobacion manual y
facil de integrar en pipelines CI/CD.

---

## Proposito

Estandarizar y automatizar el aprovisionamiento inicial de una base de datos
para un aplicativo, garantizando:

- Nomenclatura consistente (`compania_ambiente_aplicativo_...`).
- Modelo de roles y usuarios homogeneo entre motores.
- Permisos sobre objetos actuales y futuros.
- Rollback documentado para cada seccion.
- Una sola definicion (`config.yaml` o variables de entorno) que produce los
  scripts para los cuatro motores.

---

## Estructura del Proyecto

```
db-provisioning-kit/
|-- README.md                 # Este archivo
|-- config.yaml               # Configuracion declarativa (fuente principal)
|-- .env.example              # Configuracion alternativa via entorno (CI/CD)
|-- generate.py               # Genera los scripts de provisionamiento
|-- validate.py               # Genera los scripts de validacion post-creacion
|-- templates/                # Plantillas por motor (con placeholders {{...}})
|   |-- postgresql.sql.tpl
|   |-- mysql.sql.tpl
|   |-- sqlserver.sql.tpl
|   |-- oracle.sql.tpl
|   |-- postgresql.validate.sql.tpl
|   |-- mysql.validate.sql.tpl
|   |-- sqlserver.validate.sql.tpl
|   |-- oracle.validate.sql.tpl
`-- output/                   # (Generado) scripts SQL finales
```

### Proposito de cada archivo

| Archivo | Proposito |
|---------|-----------|
| `config.yaml` | Fuente principal de configuracion: compania, ambiente, aplicativo, lista de esquemas, contrasenas y opciones por motor. |
| `.env.example` | Plantilla de configuracion por variables de entorno (`DBKIT_*`), pensada para pipelines CI/CD. Se copia a `.env` o se exporta como secretos. |
| `generate.py` | Lee la configuracion (YAML o entorno), renderiza las plantillas y escribe `output/<motor>_provisioning.sql`. Soporta multiples esquemas. |
| `validate.py` | Genera `output/<motor>_validation.sql` con consultas que verifican que cada objeto (BD, esquema, roles, usuarios, tablas) exista. |
| `templates/<motor>.sql.tpl` | Plantilla de provisionamiento por motor con placeholders y marcadores `PER_SCHEMA`. |
| `templates/<motor>.validate.sql.tpl` | Plantilla de validacion por motor; cada consulta devuelve `OK` o `FALTA`. |

---

## Requisitos

- **Python 3.8+**.
- **PyYAML** (`pip install pyyaml`) **solo** si usas `config.yaml` como fuente.
  Si usas `.env` o variables de entorno (`--env-file` / `--from-env`), no se
  requiere ninguna dependencia externa.
- Un cliente del motor destino para ejecutar los scripts generados
  (`psql`, `mysql`, `sqlcmd`, `sqlplus`, etc.).

Instalacion rapida de la dependencia opcional:

```bash
pip install pyyaml
```

---

## Uso Rapido

1. Edita `config.yaml` con tus valores (o prepara un `.env`).
2. Genera los scripts de provisionamiento:

```bash
# Un motor especifico
python generate.py --engine postgresql

# Todos los motores
python generate.py --engine all

# Carpeta de salida personalizada
python generate.py --engine all --output ./scripts_generados
```

3. Genera los scripts de validacion:

```bash
python validate.py --engine all
```

4. Revisa `output/`, ejecuta el script de provisionamiento en tu motor y luego
   el de validacion. Todas las filas de validacion deben mostrar `OK`.

---

## Multiples Esquemas en un Solo Run

Declara varios esquemas en `config.yaml`:

```yaml
schemas:
  - core
  - staging
  - audit
```

Al generar, las secciones de **base de datos, roles y usuarios** se crean una
sola vez, mientras que el bloque delimitado por los marcadores

```
-- >>> PER_SCHEMA_BEGIN <<<
...  (creacion de esquema, permisos y objetos de ejemplo)
-- >>> PER_SCHEMA_END <<<
```

se repite una vez por cada esquema. Nombres resultantes del ejemplo:
`acme_prd_ventas_sch_core`, `acme_prd_ventas_sch_staging`,
`acme_prd_ventas_sch_audit`.

Para un solo esquema puedes usar la forma compatible hacia atras:

```yaml
schema_suffix: "core"
```

> **Nota por motor:** en MySQL/MariaDB "esquema" y "base de datos" son
> sinonimos, por lo que cada esquema se materializa como una base de datos
> independiente. En Oracle "usuario" y "esquema" son lo mismo, por lo que cada
> esquema se crea como un usuario propietario con su propio trigger de grants
> futuros.

---

## Uso en CI/CD (configuracion por entorno)

En pipelines es preferible no versionar contrasenas. Usa variables de entorno
(`DBKIT_*`) definidas como secretos del pipeline:

```bash
# Opcion A: archivo .env (util en local o runners simples)
cp .env.example .env
python generate.py --engine all --env-file .env
python validate.py --engine all --env-file .env

# Opcion B: variables ya exportadas por el pipeline (recomendado)
python generate.py --engine all --from-env
python validate.py --engine all --from-env
```

Las variables del entorno del proceso tienen prioridad sobre las del archivo
`.env`. La lista de esquemas se pasa separada por comas:

```bash
export DBKIT_SCHEMAS="core,staging,audit"
```

Ejemplo minimo en GitHub Actions:

```yaml
- name: Generar scripts de BD
  env:
    DBKIT_COMPANIA: acme
    DBKIT_AMBIENTE: prd
    DBKIT_APLICATIVO: ventas
    DBKIT_SCHEMAS: core,staging,audit
    DBKIT_PASS_RO: ${{ secrets.DB_PASS_RO }}
    DBKIT_PASS_RW: ${{ secrets.DB_PASS_RW }}
    DBKIT_PASS_DDL: ${{ secrets.DB_PASS_DDL }}
    DBKIT_PASS_ADMIN: ${{ secrets.DB_PASS_ADMIN }}
    DBKIT_PASS_OWNER: ${{ secrets.DB_PASS_OWNER }}
  run: |
    python generate.py --engine all --from-env
    python validate.py --engine all --from-env
```

---

## Validacion Post-Creacion

`validate.py` genera un script por motor que consulta los catalogos del sistema
para confirmar la existencia de cada objeto. Cada consulta devuelve una columna
`estado` con `OK` o `FALTA`:

| Motor | Catalogos consultados |
|-------|-----------------------|
| PostgreSQL | `pg_database`, `pg_roles`, `information_schema.schemata`, `information_schema.tables` |
| MySQL/MariaDB | `mysql.user`, `information_schema.schemata`, `information_schema.tables` |
| SQL Server | `sys.databases`, `sys.server_principals`, `sys.database_principals`, `sys.schemas`, `sys.tables` |
| Oracle | `dba_roles`, `dba_users`, `dba_tables` |

Ejemplo (PostgreSQL):

```bash
python validate.py --engine postgresql
psql -h HOST -U admin -d acme_prd_ventas_db -f output/postgresql_validation.sql
```

Si alguna fila muestra `FALTA`, ese objeto no se creo y debes revisar el log de
ejecucion del script de provisionamiento.

---

## Convencion de Nomenclatura

### Estructura general
```
{compania}_{ambiente}_{aplicativo}_{tipo-objeto}_{nombre-descriptivo}
```

| Componente    | Descripcion                        | Ejemplo            |
|---------------|------------------------------------|--------------------|
| `compania`    | Identificador corto empresa (3-5c) | `acme`             |
| `ambiente`    | Ambiente de despliegue             | `dev`, `qa`, `prd` |
| `aplicativo`  | Nombre del aplicativo              | `ventas`, `nomina` |
| `tipo-objeto` | Prefijo segun tipo                 | `tbl`, `vw`, `sp`  |
| `nombre`      | Nombre descriptivo en snake_case   | `clientes_activos` |

### Prefijos por tipo de objeto

| Objeto | Prefijo | Ejemplo | Objeto | Prefijo | Ejemplo |
|--------|---------|---------|--------|---------|---------|
| Base de datos | `db` | `acme_prd_ventas_db` | Trigger | `trg` | `trg_auditoria_clientes` |
| Esquema | `sch` | `acme_prd_ventas_sch_core` | Indice | `idx` | `idx_clientes_email` |
| Tabla | `tbl` | `tbl_clientes` | Indice unico | `uidx` | `uidx_clientes_documento` |
| Vista | `vw` | `vw_clientes_activos` | Secuencia | `seq` | `seq_clientes_id` |
| Vista materializada | `mvw` | `mvw_resumen_ventas` | Primary key | `pk` | `pk_clientes` |
| Stored procedure | `sp` | `sp_calcular_comision` | Foreign key | `fk` | `fk_ventas_clientes` |
| Funcion | `fn` | `fn_obtener_edad` | Unique / Check | `uq` / `ck` | `uq_clientes_email` |

---

## Convencion de Roles y Usuarios

| Rol | Formato | Permisos | Usuario tipico |
|-----|---------|----------|----------------|
| Solo lectura | `ro_{app}` | `SELECT` | `usr_{app}_report` |
| Lectura/escritura | `rw_{app}` | DML | `usr_{app}_app` |
| DDL | `ddl_{app}` | DDL + DML + lectura | `usr_{app}_deploy` |
| Administrador | `admin_{app}` | Control total | `usr_{app}_dba` |

Herencia: `admin > ddl > rw > ro`. Los permisos se aplican a nivel de esquema e
incluyen objetos futuros (default privileges / triggers segun el motor).

---

## Politica de Contrasenas

- Parametrizables (en `config.yaml` o variables `DBKIT_PASS_*`).
- No expiran.
- Complejidad recomendada: mayusculas + minusculas + numeros + especiales.
- Longitud minima recomendada: 12 caracteres.
- En CI/CD, gestionarlas como secretos del pipeline (no versionarlas).

---

## Rollback

Cada bloque de creacion incluye su ROLLBACK correspondiente comentado. Para
deshacer:

1. Localiza la seccion `-- ROLLBACK ...`.
2. Descomenta las lineas.
3. Ejecuta en orden DESCENDENTE (de la seccion mas alta a la mas baja).

---

## Diferencias Clave por Motor

| Concepto | PostgreSQL | MySQL | SQL Server | Oracle |
|----------|------------|-------|------------|--------|
| BD != Esquema | Si | No (iguales) | Si | No (usuario=esquema) |
| Multi-esquema se materializa como | Varios schemas en 1 BD | Varias bases de datos | Varios schemas en 1 BD | Varios usuarios propietarios |
| Grants a objetos futuros | Default privileges | Grants `db.*` | Grants `ON SCHEMA` | Trigger por esquema |
| Login separado del usuario | No | No | Si | No |

---

## Flujo de Trabajo Recomendado

1. Definir configuracion (`config.yaml` o `.env`).
2. `python generate.py --engine all`.
3. Revisar los scripts en `output/`.
4. Ejecutar el provisionamiento en el motor destino.
5. `python validate.py --engine all` y ejecutar la validacion.
6. Confirmar que todas las filas muestran `OK`.

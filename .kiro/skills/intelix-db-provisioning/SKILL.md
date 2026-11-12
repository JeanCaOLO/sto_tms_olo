---
name: intelix-db-provisioning
description: >-
  Aprovisiona bases de datos TRANSACCIONALES (OLTP) multi-motor
  (PostgreSQL, MySQL/MariaDB, SQL Server, Oracle) generando scripts SQL
  estandarizados de creacion de base de datos, esquemas, roles, usuarios y
  permisos (actuales y futuros), con rollback incluido y validacion posterior.
  No se conecta a las bases: genera scripts listos para revisar y ejecutar.
  Usar cuando el usuario pida: aprovisionar/crear una base de datos
  transaccional, crear esquemas/roles/usuarios, generar scripts SQL de
  provisioning, estandarizar permisos por aplicativo, o validar que los objetos
  se crearon. Aplica la nomenclatura OLTP
  {compania}_{ambiente}_{aplicativo}_{tipo}_{nombre}. Para lagos de datos,
  datawarehouse o bases puente NO uses esta skill: consulta el documento
  docs/estandares-base-de-datos.md.
---

# INTELIX DB Provisioning — Aprovisionamiento de bases transaccionales (OLTP)

## Cuando aplica esta skill

Solo para bases de datos de **naturaleza transaccional (OLTP)**: aplicativos con
escritura frecuente, integridad referencial y modelo normalizado. El marco
completo y el arbol de decision entre naturalezas vive en
`docs/estandares-base-de-datos.md`. Si la base es **analitica** (lago
de datos / datawarehouse) o **intermedia** (bridge/interface), esta skill NO
aplica.

## Que hace

Lee una configuracion declarativa (`config.yaml`, `.env` o variables `DBKIT_*`),
renderiza plantillas por motor y genera en `output/`:

- `<motor>_provisioning.sql` — crea BD, roles (`ro/rw/ddl/admin`), usuarios y
  permisos sobre objetos actuales y futuros, con **ROLLBACK** comentado por
  seccion. Soporta **multiples esquemas** por aplicativo en un solo run.
- `<motor>_validation.sql` — consultas que verifican que cada objeto exista
  (cada fila devuelve `OK` o `FALTA`).

No se conecta a ningun motor: produce scripts para revision y aprobacion manual,
seguro para pipelines CI/CD.

## Nomenclatura OLTP (obligatoria)

```
{compania}_{ambiente}_{aplicativo}_{tipo-objeto}_{nombre-descriptivo}
```

- Base de datos: `db` -> `acme_prd_ventas_db`
- Esquema: `sch` -> `acme_prd_ventas_sch_core`
- Objetos: `tbl`, `vw`, `mvw`, `sp`, `fn`, `trg`, `idx`, `uidx`, `seq`, `pk`,
  `fk`, `uq`, `ck`.
- Roles: `ro_{app}`, `rw_{app}`, `ddl_{app}`, `admin_{app}`
  (herencia `admin > ddl > rw > ro`).
- Usuarios: `usr_{app}_report`, `usr_{app}_app`, `usr_{app}_deploy`,
  `usr_{app}_dba`.

Detalle completo en `docs/estandares-base-de-datos-oltp-intelix.md`.

## Uso

1. Instalar la dependencia opcional (solo si usas `config.yaml`):
   ```
   pip install -r requirements.txt
   ```
   Con `.env` o variables de entorno no hace falta ninguna dependencia.

2. Editar `config.yaml` (o preparar un `.env`) con compania, ambiente,
   aplicativo, esquemas y contrasenas.

3. Generar los scripts:
   ```
   python generate.py --engine postgresql        # un motor
   python generate.py --engine all                # los 4 motores
   python generate.py --engine all --output ./out # salida custom
   ```

4. Generar los scripts de validacion:
   ```
   python validate.py --engine all
   ```

5. Opcional: Validar la nomenclatura de los scripts generados con la skill `intelix-datalake-naming`:
   ```
   python ../intelix-datalake-naming/validar_sql.py --dir ./output
   ```

6. Revisar `output/`, ejecutar el provisioning en el motor destino y luego la
   validacion. Todas las filas deben mostrar `OK`.

### CI/CD (secretos, sin versionar contrasenas)

```
python generate.py --engine all --env-file .env    # desde archivo
python generate.py --engine all --from-env         # desde variables DBKIT_*
```

## Multiples esquemas en un solo run

Declara varios esquemas en `config.yaml`:

```yaml
schemas: [core, staging, audit]
```

Los bloques delimitados por `-- >>> PER_SCHEMA_BEGIN <<<` / `... END <<<` se
repiten una vez por esquema; la BD, roles y usuarios se crean una sola vez.

## Seguridad y gobierno (no negociable)

- Las contrasenas se gestionan como **secretos del pipeline**; nunca se
  versionan en el repo. `config.yaml` con contrasenas de ejemplo es solo para
  local.
- Permisos de **minimo privilegio**: cada rol recibe solo lo necesario.
- Todo script incluye **ROLLBACK**; revisar antes de ejecutar.
- La creacion de objetos de BD **no se hace a mano en la consola**: se usa este
  kit para dejar trazabilidad y estandarizacion.
- Cualquier ejecucion contra un ambiente compartido (QA/PROD) requiere
  **aprobacion humana** segun las puertas de calidad del proyecto.

## Archivos de la skill

| Archivo | Proposito |
|---|---|
| `config.yaml` | Fuente principal de configuracion declarativa. |
| `.env.example` | Configuracion por variables de entorno (CI/CD). |
| `generate.py` | Genera los scripts de provisioning. |
| `validate.py` | Genera los scripts de validacion post-creacion. |
| `templates/` | Plantillas por motor (`.sql.tpl` y `.validate.sql.tpl`). |
| `requirements.txt` | Dependencia opcional (`pyyaml`) para leer `config.yaml`. |
| `README.md` | Documentacion detallada del kit. |

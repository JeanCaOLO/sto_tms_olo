/* ============================================================
   PROVISIONAMIENTO POSTGRESQL - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Generado automaticamente. Revisar antes de ejecutar.
   Soporta MULTIPLES ESQUEMAS: los bloques PER_SCHEMA se repiten
   una vez por cada esquema declarado en la configuracion.
   ============================================================ */

/* ------------------------------------------------------------
   SECCION 1: CREAR BASE DE DATOS  (una sola vez)
   (Ejecutar conectado a 'postgres', fuera de transaccion)
------------------------------------------------------------ */
CREATE DATABASE {{DB_NAME}}
    ENCODING '{{PG_ENCODING}}'
    LC_COLLATE '{{PG_COLLATE}}'
    LC_CTYPE   '{{PG_CTYPE}}'
    TEMPLATE template0;

-- ROLLBACK SECCION 1:
-- DROP DATABASE IF EXISTS {{DB_NAME}};


/* ------------------------------------------------------------
   >>> CONECTARSE A LA NUEVA BASE DE DATOS <<<
   \c {{DB_NAME}}
------------------------------------------------------------ */


/* ------------------------------------------------------------
   SECCION 2: CREAR ROLES (NOLOGIN = grupos de permisos, una vez)
------------------------------------------------------------ */
CREATE ROLE {{ROLE_RO}}    NOLOGIN;
CREATE ROLE {{ROLE_RW}}    NOLOGIN;
CREATE ROLE {{ROLE_DDL}}   NOLOGIN;
CREATE ROLE {{ROLE_ADMIN}} NOLOGIN;

-- Jerarquia: admin ) ddl ) rw ) ro
GRANT {{ROLE_RW}}  TO {{ROLE_DDL}};
GRANT {{ROLE_DDL}} TO {{ROLE_ADMIN}};

-- ROLLBACK SECCION 2:
-- DROP ROLE IF EXISTS {{ROLE_RO}};
-- DROP ROLE IF EXISTS {{ROLE_RW}};
-- DROP ROLE IF EXISTS {{ROLE_DDL}};
-- DROP ROLE IF EXISTS {{ROLE_ADMIN}};


/* ------------------------------------------------------------
   SECCION 3: CREAR USUARIOS (LOGIN, sin expiracion, una vez)
------------------------------------------------------------ */
CREATE ROLE {{USR_REPORT}} LOGIN PASSWORD '{{PASS_RO}}'    VALID UNTIL 'infinity';
CREATE ROLE {{USR_APP}}    LOGIN PASSWORD '{{PASS_RW}}'    VALID UNTIL 'infinity';
CREATE ROLE {{USR_DEPLOY}} LOGIN PASSWORD '{{PASS_DDL}}'   VALID UNTIL 'infinity';
CREATE ROLE {{USR_DBA}}    LOGIN PASSWORD '{{PASS_ADMIN}}' VALID UNTIL 'infinity';

-- ROLLBACK SECCION 3:
-- DROP ROLE IF EXISTS {{USR_REPORT}};
-- DROP ROLE IF EXISTS {{USR_APP}};
-- DROP ROLE IF EXISTS {{USR_DEPLOY}};
-- DROP ROLE IF EXISTS {{USR_DBA}};


/* ------------------------------------------------------------
   SECCION 4: ASIGNAR ROLES A USUARIOS (una vez)
------------------------------------------------------------ */
GRANT {{ROLE_RO}}    TO {{USR_REPORT}};
GRANT {{ROLE_RW}}    TO {{USR_APP}};
GRANT {{ROLE_DDL}}   TO {{USR_DEPLOY}};
GRANT {{ROLE_ADMIN}} TO {{USR_DBA}};

-- ROLLBACK SECCION 4:
-- REVOKE {{ROLE_RO}}    FROM {{USR_REPORT}};
-- REVOKE {{ROLE_RW}}    FROM {{USR_APP}};
-- REVOKE {{ROLE_DDL}}   FROM {{USR_DEPLOY}};
-- REVOKE {{ROLE_ADMIN}} FROM {{USR_DBA}};


-- >>> PER_SCHEMA_BEGIN <<<
/* ============================================================
   ESQUEMA: {{SCHEMA_NAME}}  (bloque repetido por cada esquema)
   ============================================================ */

/* --- S5: CREAR ESQUEMA --- */
CREATE SCHEMA IF NOT EXISTS {{SCHEMA_NAME}};

-- ROLLBACK: DROP SCHEMA IF EXISTS {{SCHEMA_NAME}} CASCADE;

/* --- S6: PERMISOS SOBRE EL ESQUEMA (objetos actuales) --- */
GRANT USAGE ON SCHEMA {{SCHEMA_NAME}}
    TO {{ROLE_RO}}, {{ROLE_RW}}, {{ROLE_DDL}}, {{ROLE_ADMIN}};

GRANT SELECT ON ALL TABLES IN SCHEMA {{SCHEMA_NAME}} TO {{ROLE_RO}};

GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA {{SCHEMA_NAME}} TO {{ROLE_RW}};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA {{SCHEMA_NAME}} TO {{ROLE_RW}};

GRANT CREATE ON SCHEMA {{SCHEMA_NAME}} TO {{ROLE_DDL}};

GRANT ALL PRIVILEGES ON SCHEMA {{SCHEMA_NAME}} TO {{ROLE_ADMIN}};
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA {{SCHEMA_NAME}} TO {{ROLE_ADMIN}};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA {{SCHEMA_NAME}} TO {{ROLE_ADMIN}};

/* --- S7: PERMISOS SOBRE OBJETOS FUTUROS (DEFAULT PRIVILEGES) --- */
ALTER DEFAULT PRIVILEGES IN SCHEMA {{SCHEMA_NAME}}
    GRANT SELECT ON TABLES TO {{ROLE_RO}};
ALTER DEFAULT PRIVILEGES IN SCHEMA {{SCHEMA_NAME}}
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {{ROLE_RW}};
ALTER DEFAULT PRIVILEGES IN SCHEMA {{SCHEMA_NAME}}
    GRANT USAGE, SELECT ON SEQUENCES TO {{ROLE_RW}};
ALTER DEFAULT PRIVILEGES IN SCHEMA {{SCHEMA_NAME}}
    GRANT ALL ON TABLES TO {{ROLE_ADMIN}};

/* --- S8: EJEMPLOS DE OBJETOS (siguiendo la convencion) --- */
CREATE TABLE {{SCHEMA_NAME}}.tbl_clientes (
    id           BIGINT GENERATED ALWAYS AS IDENTITY,
    documento    VARCHAR(20)  NOT NULL,
    nombre       VARCHAR(120) NOT NULL,
    email        VARCHAR(150),
    estado       VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO',
    fecha_alta   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_clientes        PRIMARY KEY (id),
    CONSTRAINT uq_clientes_email  UNIQUE (email),
    CONSTRAINT uq_clientes_doc    UNIQUE (documento),
    CONSTRAINT ck_clientes_estado CHECK (estado IN ('ACTIVO','INACTIVO'))
);

CREATE INDEX idx_clientes_estado ON {{SCHEMA_NAME}}.tbl_clientes (estado);

CREATE TABLE {{SCHEMA_NAME}}.tbl_ventas (
    id           BIGINT GENERATED ALWAYS AS IDENTITY,
    cliente_id   BIGINT        NOT NULL,
    monto        NUMERIC(12,2) NOT NULL,
    fecha_venta  DATE          NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT pk_ventas          PRIMARY KEY (id),
    CONSTRAINT fk_ventas_clientes FOREIGN KEY (cliente_id)
        REFERENCES {{SCHEMA_NAME}}.tbl_clientes (id),
    CONSTRAINT ck_ventas_monto    CHECK (monto >= 0)
);

CREATE VIEW {{SCHEMA_NAME}}.vw_clientes_activos AS
SELECT c.id, c.documento, c.nombre, c.email, c.fecha_alta
FROM   {{SCHEMA_NAME}}.tbl_clientes c
WHERE  c.estado = 'ACTIVO';

-- ROLLBACK S8:
-- DROP VIEW IF EXISTS {{SCHEMA_NAME}}.vw_clientes_activos;
-- DROP TABLE IF EXISTS {{SCHEMA_NAME}}.tbl_ventas CASCADE;
-- DROP TABLE IF EXISTS {{SCHEMA_NAME}}.tbl_clientes CASCADE;
-- >>> PER_SCHEMA_END <<<

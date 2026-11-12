/* ============================================================
   PROVISIONAMIENTO SQL SERVER - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Modelo: LOGIN (servidor) -> USER (BD) -> ROLE
   Soporta MULTIPLES ESQUEMAS: los bloques PER_SCHEMA se repiten
   una vez por cada esquema dentro de la misma base de datos.
   ============================================================ */

/* ------------------------------------------------------------
   SECCION 1: CREAR BASE DE DATOS (una sola vez)
------------------------------------------------------------ */
IF DB_ID(N'{{DB_NAME}}') IS NULL
    CREATE DATABASE {{DB_NAME}};
GO

-- ROLLBACK SECCION 1:
-- ALTER DATABASE {{DB_NAME}} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
-- DROP DATABASE IF EXISTS {{DB_NAME}};


/* ------------------------------------------------------------
   SECCION 2: CREAR LOGINS (nivel servidor, sin expiracion, una vez)
------------------------------------------------------------ */
USE master;
GO
CREATE LOGIN {{USR_REPORT}} WITH PASSWORD = '{{PASS_RO}}',
    CHECK_EXPIRATION = OFF, CHECK_POLICY = ON;
CREATE LOGIN {{USR_APP}}    WITH PASSWORD = '{{PASS_RW}}',
    CHECK_EXPIRATION = OFF, CHECK_POLICY = ON;
CREATE LOGIN {{USR_DEPLOY}} WITH PASSWORD = '{{PASS_DDL}}',
    CHECK_EXPIRATION = OFF, CHECK_POLICY = ON;
CREATE LOGIN {{USR_DBA}}    WITH PASSWORD = '{{PASS_ADMIN}}',
    CHECK_EXPIRATION = OFF, CHECK_POLICY = ON;
GO

-- ROLLBACK SECCION 2:
-- DROP LOGIN IF EXISTS {{USR_REPORT}};
-- DROP LOGIN IF EXISTS {{USR_APP}};
-- DROP LOGIN IF EXISTS {{USR_DEPLOY}};
-- DROP LOGIN IF EXISTS {{USR_DBA}};


/* ------------------------------------------------------------
   SECCION 3: CREAR USUARIOS DE BD + ROLES (una vez)
------------------------------------------------------------ */
USE {{DB_NAME}};
GO
CREATE USER {{USR_REPORT}} FOR LOGIN {{USR_REPORT}};
CREATE USER {{USR_APP}}    FOR LOGIN {{USR_APP}};
CREATE USER {{USR_DEPLOY}} FOR LOGIN {{USR_DEPLOY}};
CREATE USER {{USR_DBA}}    FOR LOGIN {{USR_DBA}};
GO

CREATE ROLE {{ROLE_RO}};
CREATE ROLE {{ROLE_RW}};
CREATE ROLE {{ROLE_DDL}};
CREATE ROLE {{ROLE_ADMIN}};
GO

-- ROLLBACK SECCION 3:
-- DROP USER IF EXISTS {{USR_REPORT}};
-- DROP USER IF EXISTS {{USR_APP}};
-- DROP USER IF EXISTS {{USR_DEPLOY}};
-- DROP USER IF EXISTS {{USR_DBA}};
-- DROP ROLE IF EXISTS {{ROLE_RO}};
-- DROP ROLE IF EXISTS {{ROLE_RW}};
-- DROP ROLE IF EXISTS {{ROLE_DDL}};
-- DROP ROLE IF EXISTS {{ROLE_ADMIN}};


/* ------------------------------------------------------------
   SECCION 4: ASIGNAR USUARIOS A ROLES (una vez)
------------------------------------------------------------ */
ALTER ROLE {{ROLE_RO}}    ADD MEMBER {{USR_REPORT}};
ALTER ROLE {{ROLE_RW}}    ADD MEMBER {{USR_APP}};
ALTER ROLE {{ROLE_DDL}}   ADD MEMBER {{USR_DEPLOY}};
ALTER ROLE {{ROLE_ADMIN}} ADD MEMBER {{USR_DBA}};
GO

-- ROLLBACK SECCION 4:
-- ALTER ROLE {{ROLE_RO}}    DROP MEMBER {{USR_REPORT}};
-- ALTER ROLE {{ROLE_RW}}    DROP MEMBER {{USR_APP}};
-- ALTER ROLE {{ROLE_DDL}}   DROP MEMBER {{USR_DEPLOY}};
-- ALTER ROLE {{ROLE_ADMIN}} DROP MEMBER {{USR_DBA}};


-- >>> PER_SCHEMA_BEGIN <<<
/* ============================================================
   ESQUEMA: {{SCHEMA_NAME}}  (bloque repetido por cada esquema)
   ============================================================ */
USE {{DB_NAME}};
GO
IF SCHEMA_ID(N'{{SCHEMA_NAME}}') IS NULL
    EXEC('CREATE SCHEMA {{SCHEMA_NAME}}');
GO

/* --- Permisos sobre el esquema (actuales y FUTUROS) --- */
GRANT SELECT ON SCHEMA::{{SCHEMA_NAME}} TO {{ROLE_RO}};
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::{{SCHEMA_NAME}} TO {{ROLE_RW}};
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, REFERENCES
    ON SCHEMA::{{SCHEMA_NAME}} TO {{ROLE_DDL}};
GRANT CREATE TABLE, CREATE VIEW, CREATE PROCEDURE,
      CREATE FUNCTION ON DATABASE::{{DB_NAME}} TO {{ROLE_DDL}};
GRANT CONTROL ON SCHEMA::{{SCHEMA_NAME}} TO {{ROLE_ADMIN}};
GO

/* --- Ejemplos de objetos (siguiendo la convencion) --- */
CREATE TABLE {{SCHEMA_NAME}}.tbl_clientes (
    id          BIGINT        IDENTITY(1,1) NOT NULL,
    documento   VARCHAR(20)   NOT NULL,
    nombre      VARCHAR(120)  NOT NULL,
    email       VARCHAR(150)  NULL,
    estado      VARCHAR(10)   NOT NULL CONSTRAINT df_clientes_estado_{{SCHEMA_SUFFIX}} DEFAULT 'ACTIVO',
    fecha_alta  DATETIME2     NOT NULL CONSTRAINT df_clientes_fecha_{{SCHEMA_SUFFIX}} DEFAULT SYSDATETIME(),
    CONSTRAINT pk_clientes_{{SCHEMA_SUFFIX}}        PRIMARY KEY (id),
    CONSTRAINT uq_clientes_email_{{SCHEMA_SUFFIX}}  UNIQUE (email),
    CONSTRAINT uq_clientes_doc_{{SCHEMA_SUFFIX}}    UNIQUE (documento),
    CONSTRAINT ck_clientes_estado_{{SCHEMA_SUFFIX}} CHECK (estado IN ('ACTIVO','INACTIVO'))
);
GO
CREATE INDEX idx_clientes_estado ON {{SCHEMA_NAME}}.tbl_clientes (estado);
GO

CREATE TABLE {{SCHEMA_NAME}}.tbl_ventas (
    id          BIGINT        IDENTITY(1,1) NOT NULL,
    cliente_id  BIGINT        NOT NULL,
    monto       DECIMAL(12,2) NOT NULL,
    fecha_venta DATE          NOT NULL,
    CONSTRAINT pk_ventas_{{SCHEMA_SUFFIX}}          PRIMARY KEY (id),
    CONSTRAINT fk_ventas_clientes_{{SCHEMA_SUFFIX}} FOREIGN KEY (cliente_id)
        REFERENCES {{SCHEMA_NAME}}.tbl_clientes (id),
    CONSTRAINT ck_ventas_monto_{{SCHEMA_SUFFIX}}    CHECK (monto >= 0)
);
GO

CREATE VIEW {{SCHEMA_NAME}}.vw_clientes_activos AS
SELECT c.id, c.documento, c.nombre, c.email, c.fecha_alta
FROM   {{SCHEMA_NAME}}.tbl_clientes c
WHERE  c.estado = 'ACTIVO';
GO

-- ROLLBACK bloque {{SCHEMA_NAME}}:
-- DROP VIEW IF EXISTS {{SCHEMA_NAME}}.vw_clientes_activos;
-- DROP TABLE IF EXISTS {{SCHEMA_NAME}}.tbl_ventas;
-- DROP TABLE IF EXISTS {{SCHEMA_NAME}}.tbl_clientes;
-- DROP SCHEMA IF EXISTS {{SCHEMA_NAME}};
-- >>> PER_SCHEMA_END <<<

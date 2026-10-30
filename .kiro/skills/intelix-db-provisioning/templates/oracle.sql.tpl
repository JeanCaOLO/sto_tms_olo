/* ============================================================
   PROVISIONAMIENTO ORACLE - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Nota: en Oracle USUARIO = ESQUEMA. Con MULTIPLES ESQUEMAS, cada
   esquema se materializa como un USUARIO PROPIETARIO (uno por esquema)
   con su propio trigger de grants futuros. Los roles y usuarios de
   aplicacion se crean una sola vez.
   ============================================================ */

/* ------------------------------------------------------------
   SECCION 1: PROFILE SIN EXPIRACION DE CONTRASENA (una vez)
------------------------------------------------------------ */
CREATE PROFILE prf_no_expire LIMIT
    PASSWORD_LIFE_TIME  UNLIMITED
    PASSWORD_GRACE_TIME UNLIMITED;

-- ROLLBACK SECCION 1:
-- DROP PROFILE prf_no_expire CASCADE;


/* ------------------------------------------------------------
   SECCION 2: CREAR ROLES (una vez)
------------------------------------------------------------ */
CREATE ROLE {{ROLE_RO}};
CREATE ROLE {{ROLE_RW}};
CREATE ROLE {{ROLE_DDL}};
CREATE ROLE {{ROLE_ADMIN}};

GRANT CREATE ANY TABLE, ALTER ANY TABLE, DROP ANY TABLE,
      CREATE ANY VIEW, CREATE ANY PROCEDURE TO {{ROLE_DDL}};
GRANT DBA TO {{ROLE_ADMIN}};

-- ROLLBACK SECCION 2:
-- DROP ROLE {{ROLE_RO}};
-- DROP ROLE {{ROLE_RW}};
-- DROP ROLE {{ROLE_DDL}};
-- DROP ROLE {{ROLE_ADMIN}};


/* ------------------------------------------------------------
   SECCION 3: CREAR USUARIOS DE APLICACION (una vez)
------------------------------------------------------------ */
CREATE USER {{USR_REPORT}} IDENTIFIED BY "{{PASS_RO}}"
    PROFILE prf_no_expire DEFAULT TABLESPACE {{ORA_DEFAULT_TS}} TEMPORARY TABLESPACE {{ORA_TEMP_TS}};
CREATE USER {{USR_APP}}    IDENTIFIED BY "{{PASS_RW}}"
    PROFILE prf_no_expire DEFAULT TABLESPACE {{ORA_DEFAULT_TS}} TEMPORARY TABLESPACE {{ORA_TEMP_TS}};
CREATE USER {{USR_DEPLOY}} IDENTIFIED BY "{{PASS_DDL}}"
    PROFILE prf_no_expire DEFAULT TABLESPACE {{ORA_DEFAULT_TS}} TEMPORARY TABLESPACE {{ORA_TEMP_TS}};
CREATE USER {{USR_DBA}}    IDENTIFIED BY "{{PASS_ADMIN}}"
    PROFILE prf_no_expire DEFAULT TABLESPACE {{ORA_DEFAULT_TS}} TEMPORARY TABLESPACE {{ORA_TEMP_TS}};

GRANT CREATE SESSION TO {{USR_REPORT}}, {{USR_APP}}, {{USR_DEPLOY}}, {{USR_DBA}};

-- ROLLBACK SECCION 3:
-- DROP USER {{USR_REPORT}} CASCADE;
-- DROP USER {{USR_APP}}    CASCADE;
-- DROP USER {{USR_DEPLOY}} CASCADE;
-- DROP USER {{USR_DBA}}    CASCADE;


/* ------------------------------------------------------------
   SECCION 4: ASIGNAR ROLES A USUARIOS (una vez)
------------------------------------------------------------ */
GRANT {{ROLE_RO}}    TO {{USR_REPORT}};
GRANT {{ROLE_RW}}    TO {{USR_APP}};
GRANT {{ROLE_DDL}}   TO {{USR_DEPLOY}};
GRANT {{ROLE_ADMIN}} TO {{USR_DBA}};

ALTER USER {{USR_REPORT}} DEFAULT ROLE ALL;
ALTER USER {{USR_APP}}    DEFAULT ROLE ALL;
ALTER USER {{USR_DEPLOY}} DEFAULT ROLE ALL;
ALTER USER {{USR_DBA}}    DEFAULT ROLE ALL;

-- ROLLBACK SECCION 4:
-- REVOKE {{ROLE_RO}}    FROM {{USR_REPORT}};
-- REVOKE {{ROLE_RW}}    FROM {{USR_APP}};
-- REVOKE {{ROLE_DDL}}   FROM {{USR_DEPLOY}};
-- REVOKE {{ROLE_ADMIN}} FROM {{USR_DBA}};


-- >>> PER_SCHEMA_BEGIN <<<
/* ============================================================
   ESQUEMA (= USUARIO PROPIETARIO): {{SCHEMA_UPPER}}
   Bloque repetido por cada esquema declarado.
   ============================================================ */

/* --- Crear esquema/usuario propietario --- */
CREATE USER {{SCHEMA_UPPER}}
    IDENTIFIED BY "{{PASS_OWNER}}"
    DEFAULT TABLESPACE {{ORA_DEFAULT_TS}}
    TEMPORARY TABLESPACE {{ORA_TEMP_TS}}
    QUOTA UNLIMITED ON {{ORA_DEFAULT_TS}}
    PROFILE prf_no_expire;

GRANT CREATE SESSION, CREATE TABLE, CREATE VIEW,
      CREATE PROCEDURE, CREATE TRIGGER, CREATE SEQUENCE,
      CREATE TYPE, CREATE MATERIALIZED VIEW TO {{SCHEMA_UPPER}};

/* --- Trigger: concede permisos sobre objetos FUTUROS --- */
CREATE OR REPLACE TRIGGER trg_auto_grant_{{SCHEMA_SUFFIX}}
AFTER CREATE ON {{SCHEMA_UPPER}}.SCHEMA
DECLARE
    v_obj  VARCHAR2(100) := ORA_DICT_OBJ_NAME;
    v_type VARCHAR2(30)  := ORA_DICT_OBJ_TYPE;
BEGIN
    IF v_type IN ('TABLE','VIEW','MATERIALIZED VIEW') THEN
        EXECUTE IMMEDIATE 'GRANT SELECT ON {{SCHEMA_UPPER}}.'
            || v_obj || ' TO {{ROLE_RO}}';
        EXECUTE IMMEDIATE 'GRANT SELECT, INSERT, UPDATE, DELETE ON {{SCHEMA_UPPER}}.'
            || v_obj || ' TO {{ROLE_RW}}';
    END IF;
END;
/

/* --- Ejemplos de objetos (ejecutar como {{SCHEMA_UPPER}}) --- */
CREATE TABLE {{SCHEMA_UPPER}}.tbl_clientes (
    id          NUMBER(19)    GENERATED ALWAYS AS IDENTITY,
    documento   VARCHAR2(20)  NOT NULL,
    nombre      VARCHAR2(120) NOT NULL,
    email       VARCHAR2(150),
    estado      VARCHAR2(10)  DEFAULT 'ACTIVO' NOT NULL,
    fecha_alta  TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT pk_clientes        PRIMARY KEY (id),
    CONSTRAINT uq_clientes_email  UNIQUE (email),
    CONSTRAINT uq_clientes_doc    UNIQUE (documento),
    CONSTRAINT ck_clientes_estado CHECK (estado IN ('ACTIVO','INACTIVO'))
);

CREATE INDEX {{SCHEMA_UPPER}}.idx_clientes_estado
    ON {{SCHEMA_UPPER}}.tbl_clientes (estado);

CREATE TABLE {{SCHEMA_UPPER}}.tbl_ventas (
    id          NUMBER(19)    GENERATED ALWAYS AS IDENTITY,
    cliente_id  NUMBER(19)    NOT NULL,
    monto       NUMBER(12,2)  NOT NULL,
    fecha_venta DATE          DEFAULT SYSDATE NOT NULL,
    CONSTRAINT pk_ventas          PRIMARY KEY (id),
    CONSTRAINT fk_ventas_clientes FOREIGN KEY (cliente_id)
        REFERENCES {{SCHEMA_UPPER}}.tbl_clientes (id),
    CONSTRAINT ck_ventas_monto    CHECK (monto >= 0)
);

CREATE OR REPLACE VIEW {{SCHEMA_UPPER}}.vw_clientes_activos AS
SELECT c.id, c.documento, c.nombre, c.email, c.fecha_alta
FROM   {{SCHEMA_UPPER}}.tbl_clientes c
WHERE  c.estado = 'ACTIVO';

-- ROLLBACK bloque {{SCHEMA_UPPER}}:
-- DROP TRIGGER trg_auto_grant_{{SCHEMA_SUFFIX}};
-- DROP USER {{SCHEMA_UPPER}} CASCADE;   -- elimina tablas, vistas, etc. del esquema
-- >>> PER_SCHEMA_END <<<

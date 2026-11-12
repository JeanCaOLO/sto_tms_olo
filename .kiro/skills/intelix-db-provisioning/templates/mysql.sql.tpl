/* ============================================================
   PROVISIONAMIENTO MYSQL/MARIADB - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Nota: en MySQL BD = Esquema (sinonimos). Por eso, con MULTIPLES
   ESQUEMAS, cada esquema se materializa como una BASE DE DATOS
   independiente (una por esquema). Roles: MySQL 8.0+ / MariaDB 10.0.5+
   ============================================================ */

/* ------------------------------------------------------------
   SECCION 1: CREAR ROLES (una sola vez)
------------------------------------------------------------ */
CREATE ROLE IF NOT EXISTS '{{ROLE_RO}}';
CREATE ROLE IF NOT EXISTS '{{ROLE_RW}}';
CREATE ROLE IF NOT EXISTS '{{ROLE_DDL}}';
CREATE ROLE IF NOT EXISTS '{{ROLE_ADMIN}}';

-- ROLLBACK SECCION 1:
-- DROP ROLE IF EXISTS '{{ROLE_RO}}';
-- DROP ROLE IF EXISTS '{{ROLE_RW}}';
-- DROP ROLE IF EXISTS '{{ROLE_DDL}}';
-- DROP ROLE IF EXISTS '{{ROLE_ADMIN}}';


/* ------------------------------------------------------------
   SECCION 2: CREAR USUARIOS (PASSWORD NEVER EXPIRE, una vez)
------------------------------------------------------------ */
CREATE USER IF NOT EXISTS '{{USR_REPORT}}'@'%'
    IDENTIFIED BY '{{PASS_RO}}'    PASSWORD EXPIRE NEVER;
CREATE USER IF NOT EXISTS '{{USR_APP}}'@'%'
    IDENTIFIED BY '{{PASS_RW}}'    PASSWORD EXPIRE NEVER;
CREATE USER IF NOT EXISTS '{{USR_DEPLOY}}'@'%'
    IDENTIFIED BY '{{PASS_DDL}}'   PASSWORD EXPIRE NEVER;
CREATE USER IF NOT EXISTS '{{USR_DBA}}'@'%'
    IDENTIFIED BY '{{PASS_ADMIN}}' PASSWORD EXPIRE NEVER;

-- ROLLBACK SECCION 2:
-- DROP USER IF EXISTS '{{USR_REPORT}}'@'%';
-- DROP USER IF EXISTS '{{USR_APP}}'@'%';
-- DROP USER IF EXISTS '{{USR_DEPLOY}}'@'%';
-- DROP USER IF EXISTS '{{USR_DBA}}'@'%';


/* ------------------------------------------------------------
   SECCION 3: ASIGNAR ROLES + ACTIVAR POR DEFECTO (una vez)
------------------------------------------------------------ */
GRANT '{{ROLE_RO}}'    TO '{{USR_REPORT}}'@'%';
GRANT '{{ROLE_RW}}'    TO '{{USR_APP}}'@'%';
GRANT '{{ROLE_DDL}}'   TO '{{USR_DEPLOY}}'@'%';
GRANT '{{ROLE_ADMIN}}' TO '{{USR_DBA}}'@'%';

SET DEFAULT ROLE ALL TO
    '{{USR_REPORT}}'@'%',
    '{{USR_APP}}'@'%',
    '{{USR_DEPLOY}}'@'%',
    '{{USR_DBA}}'@'%';

-- ROLLBACK SECCION 3:
-- REVOKE '{{ROLE_RO}}'    FROM '{{USR_REPORT}}'@'%';
-- REVOKE '{{ROLE_RW}}'    FROM '{{USR_APP}}'@'%';
-- REVOKE '{{ROLE_DDL}}'   FROM '{{USR_DEPLOY}}'@'%';
-- REVOKE '{{ROLE_ADMIN}}' FROM '{{USR_DBA}}'@'%';


-- >>> PER_SCHEMA_BEGIN <<<
/* ============================================================
   ESQUEMA (= BASE DE DATOS): {{SCHEMA_NAME}}
   Bloque repetido por cada esquema declarado.
   ============================================================ */

/* --- S4: CREAR BASE DE DATOS (= ESQUEMA) --- */
CREATE DATABASE IF NOT EXISTS {{SCHEMA_NAME}}
    CHARACTER SET {{MY_CHARSET}}
    COLLATE {{MY_COLLATION}};

-- ROLLBACK: DROP DATABASE IF EXISTS {{SCHEMA_NAME}};

/* --- S5: PERMISOS (db.* cubre objetos actuales y FUTUROS) --- */
GRANT SELECT ON {{SCHEMA_NAME}}.* TO '{{ROLE_RO}}';
GRANT SELECT, INSERT, UPDATE, DELETE ON {{SCHEMA_NAME}}.* TO '{{ROLE_RW}}';
GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, CREATE VIEW,
      CREATE ROUTINE, ALTER ROUTINE, TRIGGER, EXECUTE
    ON {{SCHEMA_NAME}}.* TO '{{ROLE_DDL}}';
GRANT ALL PRIVILEGES ON {{SCHEMA_NAME}}.* TO '{{ROLE_ADMIN}}' WITH GRANT OPTION;

FLUSH PRIVILEGES;

/* --- S6: EJEMPLOS DE OBJETOS (siguiendo la convencion) --- */
USE {{SCHEMA_NAME}};

CREATE TABLE tbl_clientes (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    documento   VARCHAR(20)  NOT NULL,
    nombre      VARCHAR(120) NOT NULL,
    email       VARCHAR(150),
    estado      VARCHAR(10)  NOT NULL DEFAULT 'ACTIVO',
    fecha_alta  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_clientes        PRIMARY KEY (id),
    CONSTRAINT uq_clientes_email  UNIQUE (email),
    CONSTRAINT uq_clientes_doc    UNIQUE (documento),
    CONSTRAINT ck_clientes_estado CHECK (estado IN ('ACTIVO','INACTIVO')),
    INDEX idx_clientes_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET={{MY_CHARSET}};

CREATE TABLE tbl_ventas (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    cliente_id  BIGINT        NOT NULL,
    monto       DECIMAL(12,2) NOT NULL,
    fecha_venta DATE          NOT NULL,
    CONSTRAINT pk_ventas          PRIMARY KEY (id),
    CONSTRAINT fk_ventas_clientes FOREIGN KEY (cliente_id)
        REFERENCES tbl_clientes (id),
    CONSTRAINT ck_ventas_monto    CHECK (monto >= 0)
) ENGINE=InnoDB DEFAULT CHARSET={{MY_CHARSET}};

CREATE VIEW vw_clientes_activos AS
SELECT c.id, c.documento, c.nombre, c.email, c.fecha_alta
FROM   tbl_clientes c
WHERE  c.estado = 'ACTIVO';

-- ROLLBACK S6:
-- DROP VIEW IF EXISTS {{SCHEMA_NAME}}.vw_clientes_activos;
-- DROP TABLE IF EXISTS {{SCHEMA_NAME}}.tbl_ventas;
-- DROP TABLE IF EXISTS {{SCHEMA_NAME}}.tbl_clientes;
-- >>> PER_SCHEMA_END <<<

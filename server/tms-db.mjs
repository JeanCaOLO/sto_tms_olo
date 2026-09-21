import pg from "pg";

// Pool a Aurora PostgreSQL (clúster db-tms-olo en AWS). En desarrollo local
// requiere el túnel SSM en localhost:5432 (ver server/README.md).
const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || "localhost",
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || "tms_olo",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

export function tmsQuery(text, params = []) {
  return pool.query(text, params);
}

export { pool as tmsPool };

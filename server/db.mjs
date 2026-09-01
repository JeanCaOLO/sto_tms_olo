import sql from "mssql";

let poolPromise;

function config() {
  const {
    EFLOW_QA_HOST,
    EFLOW_QA_PORT,
    EFLOW_QA_USER,
    EFLOW_QA_PASSWORD,
    EFLOW_QA_DB_WMH,
  } = process.env;

  if (!EFLOW_QA_HOST || !EFLOW_QA_USER || !EFLOW_QA_PASSWORD) {
    throw new Error(
      "Missing EFLOW QA env vars. Run with: node --env-file=.env.local server/index.mjs",
    );
  }

  return {
    server: EFLOW_QA_HOST,
    port: Number(EFLOW_QA_PORT) || 1433,
    user: EFLOW_QA_USER,
    password: EFLOW_QA_PASSWORD,
    // WMH is the default DB; SAP tables are referenced fully-qualified in queries.
    database: EFLOW_QA_DB_WMH || "EFLOW_WMH",
    options: { encrypt: false, trustServerCertificate: true, readOnlyIntent: true },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 30000,
  };
}

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config())
      .connect()
      .catch((err) => {
        poolPromise = undefined;
        throw err;
      });
  }
  return poolPromise;
}

/**
 * Run a parameterized SELECT. `params` is an object of name -> value.
 * Read-only by construction: callers pass SELECT text only.
 */
export async function query(text, params = {}) {
  const pool = await getPool();
  const req = pool.request();
  for (const [name, spec] of Object.entries(params)) {
    if (spec && typeof spec === "object" && "type" in spec) {
      req.input(name, spec.type, spec.value);
    } else {
      req.input(name, spec);
    }
  }
  const result = await req.query(text);
  return result.recordset;
}

export { sql };

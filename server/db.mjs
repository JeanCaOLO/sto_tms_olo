import sql from "mssql";

// Conexiones read-only a EFLOW por país. Cada país es un servidor SQL distinto
// con sus propias bases: WMH (torre de control) y SAP/WMS (expediciones,
// clientes). Los nombres de BD se inyectan en los queries (ver queries.mjs).
//
//   Costa Rica -> EFLOW_WMH + EFLOW_OLO   (host 10.17.224.20:1433)
//   Venezuela  -> WMH + EFLOW_FEBECA      (host ...:1446)
//
// Credenciales SOLO en .env.local (gitignored). Nada de esto se commitea.

const pools = {}; // pais -> Promise<ConnectionPool>

// Config por país desde env EFLOW_<CR|VE>_*. Devuelve null si falta lo esencial.
function paisConfig(pais) {
  const P = pais.toUpperCase();
  const host = process.env[`EFLOW_${P}_HOST`];
  const user = process.env[`EFLOW_${P}_USER`];
  const pass = process.env[`EFLOW_${P}_PASSWORD`];
  // Compat: si no hay EFLOW_CR_* pero sí las viejas EFLOW_QA_*, úsalas como CR.
  if (!host && pais === "cr" && process.env.EFLOW_QA_HOST) {
    return {
      server: process.env.EFLOW_QA_HOST,
      port: Number(process.env.EFLOW_QA_PORT) || 1433,
      user: process.env.EFLOW_QA_USER,
      password: process.env.EFLOW_QA_PASSWORD,
      db: { wmh: process.env.EFLOW_QA_DB_WMH || "EFLOW_WMH", sap: process.env.EFLOW_QA_DB_SAP || "EFLOW_OLO" },
    };
  }
  if (!host || !user || !pass) return null;
  return {
    server: host,
    port: Number(process.env[`EFLOW_${P}_PORT`]) || (pais === "ve" ? 1446 : 1433),
    user,
    password: pass,
    db: {
      wmh: process.env[`EFLOW_${P}_DB_WMH`] || (pais === "ve" ? "WMH" : "EFLOW_WMH"),
      sap: process.env[`EFLOW_${P}_DB_SAP`] || (pais === "ve" ? "EFLOW_FEBECA" : "EFLOW_OLO"),
    },
  };
}

// Nombres de BD (wmh, sap) del país, para armar los queries. Lanza si no hay config.
export function dbNames(pais) {
  const cfg = paisConfig(pais);
  if (!cfg) throw new Error(`Sin credenciales para país "${pais}" (define EFLOW_${pais.toUpperCase()}_* en .env.local)`);
  return cfg.db;
}

export function getPool(pais) {
  if (!pools[pais]) {
    const cfg = paisConfig(pais);
    if (!cfg) throw new Error(`Sin credenciales para país "${pais}"`);
    pools[pais] = new sql.ConnectionPool({
      server: cfg.server,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.db.wmh, // BD por defecto; los queries califican con la BD completa
      options: { encrypt: false, trustServerCertificate: true, readOnlyIntent: true },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 30000,
    })
      .connect()
      .catch((err) => {
        pools[pais] = undefined;
        throw err;
      });
  }
  return pools[pais];
}

/**
 * SELECT parametrizado contra el servidor del país. `params` = { name: value }
 * o { name: { type, value } }. Read-only por construcción.
 */
export async function query(pais, text, params = {}) {
  const pool = await getPool(pais);
  const req = pool.request();
  for (const [name, spec] of Object.entries(params)) {
    if (spec && typeof spec === "object" && "type" in spec) req.input(name, spec.type, spec.value);
    else req.input(name, spec);
  }
  const result = await req.query(text);
  return result.recordset;
}

export { sql };

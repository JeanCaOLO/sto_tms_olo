import express from "express";
import { query, dbNames, sql } from "./db.mjs";
import * as q from "./queries.mjs";
import { tmsRouter } from "./tms-routes.mjs";
import { tmsContextRouter } from "./tms-context-routes.mjs";
import { requireAuth } from "./tms-auth.mjs";
import { loadSchema } from "./tms-schema.mjs";

const app = express();
const PORT = Number(process.env.EFLOW_API_PORT) || 4000;
// Solo loopback por defecto: el proxy de Vite (dev) llega por localhost y no hace falta exponer el
// API a la red. EFLOW_API_HOST=0.0.0.0 en .env.local si otro equipo debe alcanzarlo.
const HOST = process.env.EFLOW_API_HOST || "127.0.0.1";

app.use("/api", tmsRouter);
app.use("/api", express.json({ limit: "1mb" }), tmsContextRouter);

// País de la request: ?pais=cr|ve (default cr). Determina servidor + BDs.
const PAISES = new Set(["cr", "ve"]);
function pais(req) {
  const p = String(req.query.pais || "cr").toLowerCase();
  return PAISES.has(p) ? p : "cr";
}

// READ-ONLY API. Cada handler corre un solo SELECT con params bound.
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`${req.method} ${req.path} (${pais(req)}) ->`, err.message);
    res.status(502).json({ error: "eflow_query_failed", detail: err.message });
  });
};

app.get("/api/health", wrap(async (req, res) => {
  const rows = await query(pais(req), "SELECT 1 AS ok");
  res.json({ ok: rows[0].ok === 1, pais: pais(req) });
}));

// Viajes y catálogos traen datos operativos y personales (conductores): exigen el mismo JWT que el
// resto del TMS. /api/health queda abierto como sonda de conectividad.
app.use(["/api/viajes", "/api/catalogos"], requireAuth);

app.get("/api/viajes", wrap(async (req, res) => {
  const p = pais(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
  const rows = await query(p, q.listViajes(dbNames(p)), { limit: { type: sql.Int, value: limit } });
  res.json(rows);
}));

app.get("/api/viajes/:id", wrap(async (req, res) => {
  const p = pais(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await query(p, q.getViaje(dbNames(p)), { id: { type: sql.Int, value: id } });
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
}));

app.get("/api/viajes/:id/pedidos", wrap(async (req, res) => {
  const p = pais(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await query(p, q.listPedidosPorViaje(dbNames(p)), { viajeId: { type: sql.Int, value: id } });
  res.json(rows);
}));

app.get("/api/catalogos/rutas", wrap(async (req, res) => {
  const p = pais(req);
  res.json(await query(p, q.listRutas(dbNames(p))));
}));

app.get("/api/catalogos/transportistas", wrap(async (req, res) => {
  const p = pais(req);
  res.json(await query(p, q.listTransportistas(dbNames(p))));
}));

function carrierParam(req) {
  const raw = req.query.transportistaId;
  const n = raw === undefined ? null : Number(raw);
  return { carrierId: { type: sql.Int, value: Number.isInteger(n) ? n : null } };
}

app.get("/api/catalogos/conductores", wrap(async (req, res) => {
  const p = pais(req);
  res.json(await query(p, q.listConductores(dbNames(p)), carrierParam(req)));
}));

app.get("/api/catalogos/vehiculos", wrap(async (req, res) => {
  const p = pais(req);
  res.json(await query(p, q.listVehiculos(dbNames(p)), carrierParam(req)));
}));

loadSchema()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`eflow read-only API + TMS API on http://${HOST}:${PORT}  (pais por defecto: cr; ?pais=cr|ve)`);
    });
  })
  .catch((err) => {
    console.error("No se pudo cargar el esquema de tms_olo:", err.message);
    process.exit(1);
  });

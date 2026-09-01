import express from "express";
import { query, sql } from "./db.mjs";
import * as q from "./queries.mjs";

const app = express();
const PORT = Number(process.env.EFLOW_API_PORT) || 4000;

// READ-ONLY API. Every handler runs a single SELECT with bound params.
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`${req.method} ${req.path} ->`, err.message);
    res.status(502).json({ error: "eflow_qa_query_failed", detail: err.message });
  });
};

app.get("/api/health", wrap(async (_req, res) => {
  const rows = await query("SELECT 1 AS ok");
  res.json({ ok: rows[0].ok === 1 });
}));

app.get("/api/viajes", wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
  const rows = await query(q.listViajes, { limit: { type: sql.Int, value: limit } });
  res.json(rows);
}));

app.get("/api/viajes/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await query(q.getViaje, { id: { type: sql.Int, value: id } });
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
}));

app.get("/api/catalogos/rutas", wrap(async (_req, res) => {
  res.json(await query(q.listRutas));
}));

app.get("/api/catalogos/transportistas", wrap(async (_req, res) => {
  res.json(await query(q.listTransportistas));
}));

function carrierParam(req) {
  const raw = req.query.transportistaId;
  const n = raw === undefined ? null : Number(raw);
  return { carrierId: { type: sql.Int, value: Number.isInteger(n) ? n : null } };
}

app.get("/api/catalogos/conductores", wrap(async (req, res) => {
  res.json(await query(q.listConductores, carrierParam(req)));
}));

app.get("/api/catalogos/vehiculos", wrap(async (req, res) => {
  res.json(await query(q.listVehiculos, carrierParam(req)));
}));

app.listen(PORT, () => {
  console.log(`eflow-qa read-only API on http://localhost:${PORT}`);
});

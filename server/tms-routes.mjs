import express from "express";
import { tmsQuery } from "./tms-db.mjs";
import { isKnownTable, HttpError } from "./tms-schema.mjs";
import { buildListQuery, buildCountQuery } from "./tms-select.mjs";
import { buildInsertQuery, buildUpdateQuery, buildDeleteQuery } from "./tms-mutations.mjs";
import { requireAuth, login, signUp, session, signOut } from "./tms-auth.mjs";

export const tmsRouter = express.Router();
tmsRouter.use(express.json({ limit: "5mb" }));

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    if (err instanceof HttpError) return res.status(err.status).json({ data: null, error: { message: err.message } });
    console.error(`${req.method} ${req.path} ->`, err);
    res.status(500).json({ data: null, error: { message: err.message } });
  });
};

function assertTable(table) {
  if (!isKnownTable(table)) throw new HttpError(400, `Tabla desconocida: "${table}"`);
}

function parseJsonParam(raw, label) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, `Parámetro "${label}" no es JSON válido`);
  }
}

// --- Auth ---
tmsRouter.post("/auth/login", wrap(login));
tmsRouter.post("/auth/signup", requireAuth, wrap(signUp));
tmsRouter.get("/auth/session", requireAuth, wrap(session));
tmsRouter.post("/auth/logout", requireAuth, wrap(signOut));

// --- Generic table API (equivalente reducido a supabase.from(table)...) ---
tmsRouter.get(
  "/data/:table",
  requireAuth,
  wrap(async (req, res) => {
    const { table } = req.params;
    assertTable(table);
    const filters = parseJsonParam(req.query.filters, "filters") || [];

    if (req.query.head === "true") {
      const { sql, params } = buildCountQuery({ table, filters });
      const result = await tmsQuery(sql, params);
      return res.json({ data: null, count: result.rows[0].count, error: null });
    }

    const select = req.query.select ? String(req.query.select) : "*";
    const order = parseJsonParam(req.query.order, "order");
    const limit = req.query.limit != null ? Number(req.query.limit) : null;
    const { sql, params } = buildListQuery({ table, select, filters, order, limit });
    const result = await tmsQuery(sql, params);
    let data = result.rows;

    if (req.query.single === "true") {
      if (data.length !== 1) {
        return res
          .status(406)
          .json({ data: null, error: { message: "Se esperaba exactamente una fila" } });
      }
      data = data[0];
    } else if (req.query.maybeSingle === "true") {
      data = data[0] ?? null;
    }

    res.json({ data, error: null, count: req.query.count === "exact" ? result.rowCount : undefined });
  })
);

tmsRouter.post(
  "/data/:table",
  requireAuth,
  wrap(async (req, res) => {
    const { table } = req.params;
    assertTable(table);
    const { values, returning } = req.body || {};
    const { sql, params } = buildInsertQuery(table, values);
    const result = await tmsQuery(sql, params);
    res.json({ data: returning ? result.rows : null, error: null });
  })
);

tmsRouter.patch(
  "/data/:table",
  requireAuth,
  wrap(async (req, res) => {
    const { table } = req.params;
    assertTable(table);
    const { values, filters, returning } = req.body || {};
    const { sql, params } = buildUpdateQuery(table, values || {}, filters || []);
    const result = await tmsQuery(sql, params);
    res.json({ data: returning ? result.rows : null, error: null });
  })
);

tmsRouter.delete(
  "/data/:table",
  requireAuth,
  wrap(async (req, res) => {
    const { table } = req.params;
    assertTable(table);
    const { filters, returning } = req.body || {};
    const { sql, params } = buildDeleteQuery(table, filters || []);
    const result = await tmsQuery(sql, params);
    res.json({ data: returning ? result.rows : null, error: null });
  })
);

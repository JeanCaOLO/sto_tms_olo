// API explícita de jerarquía País → Almacén → Cliente → Cliente Final →
// Punto de Entrega (prompt de implementación §25). A diferencia del motor
// genérico `/api/data/:table`, estos endpoints SÍ filtran por el scope
// operativo del usuario (server/domain/context/) antes de devolver filas —
// por eso son rutas explícitas y no una tabla más expuesta genéricamente
// (§26: "no expongas arbitrariamente cualquier tabla").
//
// El CRUD de administración de estas mismas tablas (crear/editar un
// almacén, un cliente final, etc.) sigue usando `/api/data/:table` por ahora
// — son pantallas de configuración ya protegidas por requireAuth, igual que
// el resto de catálogos maestros del sistema. Lo que estos endpoints
// agregan es la LECTURA scope-aware para navegación jerárquica.

import express from "express";
import { tmsQuery } from "./tms-db.mjs";
import { HttpError } from "./tms-schema.mjs";
import { requireAuth } from "./tms-auth.mjs";
import { resolveOperationalContext, isGlobalScope } from "./domain/context/resolveOperationalContext.mjs";
import { authorizeOperationalContext, resolveEntityChain } from "./domain/context/authorizeOperationalContext.mjs";

export const tmsContextRouter = express.Router();

const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    if (err instanceof HttpError) return res.status(err.status).json({ data: null, error: { message: err.message } });
    next(err);
  });
};

// Devuelve las cláusulas de filtro (fragmento SQL + params) que restringen
// una lista de países/almacenes/clientes a lo que el usuario puede ver. Un
// scope GLOBAL no agrega ninguna restricción.
function scopeFilterCountries(scopes) {
  if (scopes.some(isGlobalScope)) return { clause: "", params: [] };
  const ids = [...new Set(scopes.map((s) => s.countryId).filter(Boolean))];
  if (ids.length === 0) return { clause: "AND false", params: [] }; // sin scope de país -> nada
  return { clause: `AND id = ANY($1)`, params: [ids] };
}

tmsContextRouter.get(
  "/v1/countries",
  requireAuth,
  wrap(async (req, res) => {
    const { scopes } = await resolveOperationalContext(req.authUser);
    const { clause, params } = scopeFilterCountries(scopes);
    const { rows } = await tmsQuery(
      `SELECT id, code, name, timezone, locale, unit_system, date_format
       FROM countries WHERE true ${clause} ORDER BY name`,
      params
    );
    res.json({ data: rows, error: null });
  })
);

tmsContextRouter.get(
  "/v1/countries/:id/warehouses",
  requireAuth,
  authorizeOperationalContext((req) => ({ countryId: req.params.id })),
  wrap(async (req, res) => {
    const { rows } = await tmsQuery(
      `SELECT id, country_id, code, name, timezone, active
       FROM warehouses WHERE country_id = $1 AND active = true ORDER BY name`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  })
);

tmsContextRouter.get(
  "/v1/warehouses/:id/customers",
  requireAuth,
  authorizeOperationalContext((req) => ({ warehouseId: req.params.id })),
  wrap(async (req, res) => {
    const { rows } = await tmsQuery(
      `SELECT id, warehouse_id, code, name, status
       FROM customers WHERE warehouse_id = $1 ORDER BY name`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  })
);

tmsContextRouter.get(
  "/v1/customers/:id/final-customers",
  requireAuth,
  authorizeOperationalContext((req) => ({ customerId: req.params.id })),
  wrap(async (req, res) => {
    const { rows } = await tmsQuery(
      `SELECT id, customer_id, external_code, name, region, status
       FROM final_customers WHERE customer_id = $1 ORDER BY name`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  })
);

tmsContextRouter.get(
  "/v1/final-customers/:id/delivery-points",
  requireAuth,
  wrap(async (req, res) => {
    // final_customers no tiene country/warehouse propio en la request; se
    // autoriza vía el customer_id al que pertenece.
    const { rows: fc } = await tmsQuery(
      `SELECT customer_id FROM final_customers WHERE id = $1`,
      [req.params.id]
    );
    if (!fc[0]) throw new HttpError(404, `Cliente final no encontrado: ${req.params.id}`);

    const { scopes } = await resolveOperationalContext(req.authUser);
    const chain = await resolveEntityChain({ customerId: fc[0].customer_id });
    const allowed = scopes.some(
      (s) => isGlobalScope(s) || s.customerId === chain.customerId || s.warehouseId === chain.warehouseId || s.countryId === chain.countryId
    );
    if (!allowed) throw new HttpError(403, "El usuario no tiene acceso a este cliente final.");

    const { rows } = await tmsQuery(
      `SELECT dp.id, dp.final_customer_id, dp.external_code, dp.name, dp.delivery_instructions,
              dp.delivery_window_start, dp.delivery_window_end, dp.is_default, dp.active,
              a.line1, a.line2, a.city, a.state, a.latitude, a.longitude
       FROM delivery_points dp
       LEFT JOIN addresses a ON a.id = dp.address_id
       WHERE dp.final_customer_id = $1 AND dp.active = true
       ORDER BY dp.is_default DESC, dp.name`,
      [req.params.id]
    );
    res.json({ data: rows, error: null });
  })
);

// Contexto resuelto del usuario actual — usado por el frontend para saber
// qué puede seleccionar (prompt de implementación §17: "respetar permisos").
tmsContextRouter.get(
  "/v1/me/context",
  requireAuth,
  wrap(async (req, res) => {
    const { scopes } = await resolveOperationalContext(req.authUser);
    res.json({ data: { scopes }, error: null });
  })
);

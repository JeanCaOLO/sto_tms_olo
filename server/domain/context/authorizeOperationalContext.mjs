// Autoriza una request contra el contexto operativo (país/almacén/cliente)
// resuelto por resolveOperationalContext.mjs — nunca confiar únicamente en un
// ?customer_id=... del cliente sin verificar scope (prompt de implementación §18).
//
// Fail-closed: un usuario sin ningún scope NO tiene acceso a nada (a
// diferencia del comportamiento anterior, donde cualquier usuario
// autenticado veía todo lo de su organization_id sin más chequeo).

import { tmsQuery } from "../../tms-db.mjs";
import { HttpError } from "../../tms-schema.mjs";
import { resolveOperationalContext, isGlobalScope } from "./resolveOperationalContext.mjs";

/**
 * Resuelve la cadena completa país/almacén/cliente de una entidad, para
 * poder compararla contra los scopes del usuario sin importar en qué nivel
 * esté el scope (un scope de país cubre cualquier almacén/cliente de ese
 * país, aunque la request venga identificada solo por customer_id).
 * @returns {Promise<{ countryId: string|null, warehouseId: string|null, customerId: string|null }>}
 */
export async function resolveEntityChain({ countryId, warehouseId, customerId }) {
  if (customerId) {
    const { rows } = await tmsQuery(
      `SELECT c.id AS customer_id, w.id AS warehouse_id, w.country_id AS country_id
       FROM customers c LEFT JOIN warehouses w ON w.id = c.warehouse_id
       WHERE c.id = $1`,
      [customerId]
    );
    if (!rows[0]) throw new HttpError(404, `Cliente no encontrado: ${customerId}`);
    return { countryId: rows[0].country_id, warehouseId: rows[0].warehouse_id, customerId: rows[0].customer_id };
  }
  if (warehouseId) {
    const { rows } = await tmsQuery(`SELECT id, country_id FROM warehouses WHERE id = $1`, [warehouseId]);
    if (!rows[0]) throw new HttpError(404, `Almacén no encontrado: ${warehouseId}`);
    return { countryId: rows[0].country_id, warehouseId: rows[0].id, customerId: null };
  }
  if (countryId) {
    return { countryId, warehouseId: null, customerId: null };
  }
  return { countryId: null, warehouseId: null, customerId: null };
}

function scopeCovers(scope, chain) {
  if (isGlobalScope(scope)) return true;
  if (scope.customerId) return scope.customerId === chain.customerId;
  if (scope.warehouseId) return scope.warehouseId === chain.warehouseId;
  if (scope.countryId) return scope.countryId === chain.countryId;
  return false;
}

/**
 * Middleware factory. `extractRequested(req)` devuelve
 * `{ countryId?, warehouseId?, customerId? }` a partir de los params/query
 * de esa ruta — cada endpoint sabe cuál de los tres identifica el recurso
 * que está pidiendo.
 */
export function authorizeOperationalContext(extractRequested) {
  return async (req, res, next) => {
    try {
      const { scopes } = await resolveOperationalContext(req.authUser);
      if (scopes.length === 0) {
        throw new HttpError(403, "El usuario no tiene ningún scope operativo asignado.");
      }

      const requested = extractRequested(req);
      const chain = await resolveEntityChain(requested);
      const allowed = scopes.some((scope) => scopeCovers(scope, chain));

      if (!allowed) {
        throw new HttpError(403, "El usuario no tiene acceso a este país/almacén/cliente.");
      }

      req.operationalContext = chain;
      next();
    } catch (err) {
      next(err);
    }
  };
}

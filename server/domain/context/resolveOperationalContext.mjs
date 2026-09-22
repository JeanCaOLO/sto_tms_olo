// Resuelve el contexto operativo (scopes) del usuario autenticado.
// Ver docs/arquitectura-tms-oms/02-to-be.md §4 y §15 (ADR-001) y el prompt de
// implementación §16/§18/§19 — ROLE (qué puede hacer) se mantiene separado
// de SCOPE (dónde puede hacerlo); un mismo usuario puede tener varios scopes.
//
// Un scope con country_id/warehouse_id/customer_id TODOS null es GLOBAL
// (ej. Global Admin). Los 2 usuarios reales existentes hoy tienen exactamente
// un scope GLOBAL cada uno (backfill de sql/06_fase1_multicountry_foundation.sql),
// para no perder acceso a nada que ya tenían antes de este cambio.

import { tmsQuery } from "../../tms-db.mjs";
import { HttpError } from "../../tms-schema.mjs";

/**
 * @typedef {{ id: string, roleId: string|null, countryId: string|null, warehouseId: string|null, customerId: string|null }} Scope
 */

/**
 * @param {{ id: string, email: string }} authUser  req.authUser (del JWT — id es auth_user_id)
 * @returns {Promise<{ appUserId: string, organizationId: string, scopes: Scope[] }>}
 */
export async function resolveOperationalContext(authUser) {
  const { rows: users } = await tmsQuery(
    `SELECT id, organization_id FROM app_users WHERE auth_user_id = $1`,
    [authUser.id]
  );
  const appUser = users[0];
  if (!appUser) {
    throw new HttpError(401, "No existe app_user para este usuario autenticado.");
  }

  const { rows: scopeRows } = await tmsQuery(
    `SELECT id, role_id, country_id, warehouse_id, customer_id
     FROM user_scopes WHERE app_user_id = $1`,
    [appUser.id]
  );

  return {
    appUserId: appUser.id,
    organizationId: appUser.organization_id,
    scopes: scopeRows.map((r) => ({
      id: r.id,
      roleId: r.role_id,
      countryId: r.country_id,
      warehouseId: r.warehouse_id,
      customerId: r.customer_id,
    })),
  };
}

export function isGlobalScope(scope) {
  return !scope.countryId && !scope.warehouseId && !scope.customerId;
}

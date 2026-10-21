// Roles que pueden alterar el flujo de una proforma (quitar fases). Es el MISMO conjunto, con la misma
// comparación exacta de nombre, que `ADMIN_ROLES` del backend (tms_common/permissions.py): el servidor
// decide con `is_admin`, y esto solo muestra u oculta el botón.

const SUPER_ROLES = new Set(['SuperAdministrador', 'SuperUsuario', 'Administrador', 'Admin']);

export function isSuperAdmin(roleName: string | null | undefined): boolean {
  return SUPER_ROLES.has((roleName ?? '').trim());
}

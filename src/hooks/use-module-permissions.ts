import { usePermissions } from './usePermissions';

// Atajo por pantalla: los cuatro permisos de acción de un módulo. Evita repetir
// can('modulo', 'create') etc. en cada CRUD. view se resuelve en menú/ruta.
export function useModulePermissions(modulo: string) {
  const { can } = usePermissions();
  return {
    canCreate: can(modulo, 'create'),
    canEdit: can(modulo, 'edit'),
    canDelete: can(modulo, 'delete'),
    canExport: can(modulo, 'export'),
  };
}

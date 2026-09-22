// RBAC SIMULADO del módulo Liquidador — NO es control de acceso real. Es una demostración de que
// "cada acción sensible restringida a un rol autorizado" (RNF-009) puede modelarse como una tabla
// de datos auditable en vez de `if`s dispersos por la UI, mientras no exista el backend/BD
// definitivo que lo haga cumplir de verdad (Etapa 1 del plan del Liquidador — ver
// docs/superpowers/specs/ y el plan de fases). Cualquiera puede saltarse esto abriendo las
// devtools: el enforcement real vive en el backend, cuando exista.

export type LiquidadorRole = 'LIQUIDADOR' | 'JEFE_TRANSPORTE' | 'SUPERVISOR_FINANZAS' | 'SISTEMA';

export const LIQUIDADOR_ROLES: { value: LiquidadorRole; label: string }[] = [
  { value: 'LIQUIDADOR', label: 'Liquidador (operador)' },
  { value: 'JEFE_TRANSPORTE', label: 'Jefe de transporte' },
  { value: 'SUPERVISOR_FINANZAS', label: 'Supervisor / Finanzas' },
  { value: 'SISTEMA', label: 'Sistema (automático)' },
];

export type AccionSensible =
  | 'CREAR_REGLA' | 'EDITAR_REGLA' | 'ELIMINAR_REGLA'
  | 'CREAR_ZONA' | 'EDITAR_ZONA' | 'ELIMINAR_ZONA'
  | 'AUTORIZAR_NOVEDAD' | 'RESOLVER_RECOLECTA' | 'LIQUIDAR_CON_EXCEPCION';

// Tabla de permisos explícita (dato auditable, no lógica dispersa) — sección 3 del prompt maestro:
// Liquidador registra/procesa/resuelve recolectas/genera y envía proformas; Jefe de Transporte
// crea/edita/elimina tarifas y reglas y autoriza novedades; Supervisor/Finanzas valida excepciones;
// Sistema actúa de forma automática.
const PERMISOS: Record<AccionSensible, LiquidadorRole[]> = {
  CREAR_REGLA: ['JEFE_TRANSPORTE'],
  EDITAR_REGLA: ['JEFE_TRANSPORTE'],
  ELIMINAR_REGLA: ['JEFE_TRANSPORTE'],
  CREAR_ZONA: ['JEFE_TRANSPORTE'],
  EDITAR_ZONA: ['JEFE_TRANSPORTE'],
  ELIMINAR_ZONA: ['JEFE_TRANSPORTE'],
  AUTORIZAR_NOVEDAD: ['JEFE_TRANSPORTE'],
  RESOLVER_RECOLECTA: ['LIQUIDADOR', 'JEFE_TRANSPORTE'],
  LIQUIDAR_CON_EXCEPCION: ['SUPERVISOR_FINANZAS'],
};

export function puede(accion: AccionSensible, rol: LiquidadorRole): boolean {
  return PERMISOS[accion].includes(rol);
}

const STORAGE_KEY = 'liquidador:rol_activo';

export function obtenerRolActivo(): LiquidadorRole {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LIQUIDADOR_ROLES.some((r) => r.value === stored)) return stored as LiquidadorRole;
  } catch {
    // localStorage no disponible (SSR, modo privado sin storage, etc.) — usar default.
  }
  return 'JEFE_TRANSPORTE';
}

export function establecerRolActivo(rol: LiquidadorRole): void {
  try {
    localStorage.setItem(STORAGE_KEY, rol);
  } catch {
    // no crítico — solo se pierde la preferencia de rol simulado entre sesiones.
  }
}

import type { AuditAction, ActorType } from './audit-api';

// Mapa acción → clave i18n + variante de Badge. Un solo lugar para pantalla y modal.
export const ACTION_META: Record<AuditAction, { key: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  create: { key: 'audit.actionCreate', variant: 'success' },
  update: { key: 'audit.actionUpdate', variant: 'info' },
  delete: { key: 'audit.actionDelete', variant: 'danger' },
  login: { key: 'audit.actionLogin', variant: 'default' },
  login_failed: { key: 'audit.actionLoginFailed', variant: 'warning' },
  login_blocked: { key: 'audit.actionLoginBlocked', variant: 'danger' },
  logout: { key: 'audit.actionLogout', variant: 'default' },
  view: { key: 'audit.actionView', variant: 'default' },
  export: { key: 'audit.actionExport', variant: 'info' },
  print: { key: 'audit.actionPrint', variant: 'info' },
  download: { key: 'audit.actionDownload', variant: 'info' },
};

export const ACTOR_KEY: Record<ActorType, string> = {
  user: 'audit.actorUser',
  system: 'audit.actorSystem',
  anonymous: 'audit.actorAnonymous',
};

// module_key del backend → clave i18n del menú (misma nomenclatura que navItems).
const MODULE_I18N: Record<string, string> = {
  dashboard: 'menu.dashboard', pedidos: 'menu.pedidos', devoluciones: 'menu.devoluciones',
  guias: 'menu.guias', planificacion: 'menu.planificacion', tracking: 'menu.tracking',
  tarifas: 'menu.tarifas', 'oms.panel': 'menu.omsPanel', 'oms.cola': 'menu.omsCola',
  'oms.reglas': 'menu.omsReglas', 'oms.simulador': 'menu.omsSimulador', 'oms.rutas': 'menu.omsRutas',
  'oms.auditoria': 'menu.omsAuditoria', paises: 'menu.paises', zonas: 'menu.zonas',
  transportistas: 'menu.transportistas', vehiculos: 'menu.vehiculos', conductores: 'menu.conductores',
  licencias: 'menu.licencias', clientes: 'menu.clientes', puntos_entrega: 'menu.puntosEntrega',
  contratos: 'menu.contratos', reportes: 'menu.reportes', auditoria: 'menu.auditoria',
  configuracion: 'menu.configuracion',
};

export function moduleI18nKey(moduleKey: string | null): string | null {
  if (!moduleKey) return null;
  return MODULE_I18N[moduleKey] ?? null;
}

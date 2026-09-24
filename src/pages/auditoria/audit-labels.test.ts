import { describe, it, expect } from 'vitest';
import { ACTION_META, ACTOR_KEY, moduleI18nKey } from './audit-labels';
import type { AuditAction, ActorType } from './audit-api';

const ACTIONS: AuditAction[] = [
  'create', 'update', 'delete', 'login', 'login_failed', 'login_blocked',
  'logout', 'view', 'export', 'print', 'download',
];
const ACTORS: ActorType[] = ['user', 'system', 'anonymous'];

describe('audit-labels', () => {
  it('cada acción tiene clave i18n y variante de badge', () => {
    for (const a of ACTIONS) {
      expect(ACTION_META[a], a).toBeDefined();
      expect(ACTION_META[a].key.startsWith('audit.action')).toBe(true);
    }
  });

  it('cada tipo de actor tiene su clave', () => {
    for (const a of ACTORS) expect(ACTOR_KEY[a]).toBeTruthy();
  });

  it('mapea module_key del backend a la clave del menú', () => {
    expect(moduleI18nKey('puntos_entrega')).toBe('menu.puntosEntrega');
    expect(moduleI18nKey('oms.panel')).toBe('menu.omsPanel');
    expect(moduleI18nKey('auditoria')).toBe('menu.auditoria');
  });

  it('distingue auditoria (menú) de oms.auditoria (priorizaciones)', () => {
    expect(moduleI18nKey('auditoria')).toBe('menu.auditoria');
    expect(moduleI18nKey('oms.auditoria')).toBe('menu.omsAuditoria');
  });

  it('module_key nulo o desconocido → null (la pantalla muestra el crudo)', () => {
    expect(moduleI18nKey(null)).toBeNull();
    expect(moduleI18nKey('inexistente')).toBeNull();
  });
});

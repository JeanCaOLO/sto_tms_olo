import { describe, expect, it } from 'vitest';
import type { NavItem } from '../components/feature/sidebar-nav-items';
import { landingPath } from './landing';

const items: NavItem[] = [
  { icon: 'i', label: 'Dashboard', i18nKey: 'a', path: '/dashboard', permKey: 'dashboard' },
  { type: 'section', label: 'Ejecución', i18nKey: 's' },
  { type: 'group', icon: 'i', label: 'Grupo', i18nKey: 'g', children: [
    { icon: 'i', label: 'Pronto', i18nKey: 'p', path: '/pronto', permKey: 'pronto', comingSoon: true },
    { icon: 'i', label: 'Tracking', i18nKey: 't', path: '/tracking', permKey: 'tracking' },
  ] },
  { icon: 'i', label: 'Devoluciones', i18nKey: 'd', path: '/devoluciones', permKey: 'devoluciones' },
];
const only = (...keys: string[]) => (permKey: string) => keys.includes(permKey);

describe('landingPath', () => {
  it('quien ve el dashboard entra ahí', () => {
    expect(landingPath(only('dashboard', 'devoluciones'), items)).toBe('/dashboard');
  });
  it('el rol Devoluciones, sin dashboard, entra a su módulo', () => {
    expect(landingPath(only('devoluciones'), items)).toBe('/devoluciones');
  });
  it('toma el primer módulo del menú (también dentro de un grupo) y salta los "próximamente"', () => {
    expect(landingPath(only('pronto', 'tracking', 'devoluciones'), items)).toBe('/tracking');
    expect(landingPath(only('pronto'), items)).toBe('/dashboard');
  });
  it('sin ningún permiso cae en /dashboard (la guarda mostrará "sin acceso")', () => {
    expect(landingPath(only(), items)).toBe('/dashboard');
  });
});

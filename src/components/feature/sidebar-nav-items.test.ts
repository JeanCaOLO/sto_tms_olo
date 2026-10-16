import { describe, expect, it } from 'vitest';
import { navItems } from './sidebar-nav-items';

// Mismo criterio que Sidebar.tsx: una entrada se ve si no pide permiso o el rol tiene `view`.
function tarifasVisibles(grants: string[]): string[] {
  const grupo = navItems.find((item) => 'children' in item && item.label === 'Tarifas');
  if (!grupo || !('children' in grupo)) throw new Error('No existe el grupo Tarifas');
  return grupo.children
    .filter((c) => !c.permKey || grants.includes(c.permKey))
    .map((c) => c.label);
}

describe('menú Tarifas por rol', () => {
  it('Liquidador (solo `tarifas`) ve únicamente Liquidaciones', () => {
    expect(tarifasVisibles(['tarifas'])).toEqual(['Liquidaciones']);
  });

  it('Desarrollador (`tarifas` + `tarifas.config`) ve todo Tarifas', () => {
    expect(tarifasVisibles(['tarifas', 'tarifas.config'])).toEqual([
      'Liquidaciones', 'Costos Flota', 'Reglas Tarifa',
    ]);
  });

  it('Costos Flota reemplaza a Flota Propia y Flota Externa', () => {
    const labels = tarifasVisibles(['tarifas', 'tarifas.config']);
    expect(labels).not.toContain('Flota Propia');
    expect(labels).not.toContain('Flota Externa');
  });
});

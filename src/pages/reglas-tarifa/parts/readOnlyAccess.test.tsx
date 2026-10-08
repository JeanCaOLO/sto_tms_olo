// @vitest-environment jsdom
//
// Lo que ve quien solo puede LEER la configuración del tarifador (rol Liquidador).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TabNavigation } from './TabNavigation';
import { RulesSection } from './RulesSection';
import { useLiquidadorVista } from '../../liquidaciones/hooks/useLiquidadorVista';

const perms = vi.hoisted(() => ({ canEdit: false, grants: new Set<string>() }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canEdit: perms.canEdit, canCreate: perms.canEdit, canDelete: perms.canEdit, canView: true }),
}));
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (key: string, action: string) => perms.grants.has(`${key}:${action}`) }),
}));

afterEach(() => { cleanup(); perms.canEdit = false; perms.grants = new Set(); });

describe('solo lectura de la configuración', () => {
  it('las pestañas muestran Reglas, Tarifarios y Bitácora; sin Probador ni Alerta Margen', () => {
    render(<TabNavigation activeTab="reglas" onTabChange={() => {}} />);
    for (const t of ['Reglas', 'Tarifarios', 'Bitácora']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.queryByText('Probador Motor')).toBeNull();
    expect(screen.queryByText('Alerta Margen')).toBeNull();
  });

  it('con permiso de edición aparecen todas las pestañas', () => {
    perms.canEdit = true;
    render(<TabNavigation activeTab="reglas" onTabChange={() => {}} />);
    expect(screen.getByText('Probador Motor')).toBeTruthy();
    expect(screen.getByText('Alerta Margen')).toBeTruthy();
  });

  it('la lista de reglas ofrece «Ver» y no «Editar» ni «Eliminar»', () => {
    const rules = [{ id: 'R1', code: 'R1', name: 'Regla 1', scope: 'COUNTRY', stacking: 'SUM' }];
    render(<MemoryRouter><RulesSection rules={rules} parties={[]} loading={false} canCreate={false} canEdit={false} canDelete={false}
      onNew={() => {}} onEdit={() => {}} onDelete={() => {}} /></MemoryRouter>);
    expect(screen.getByTitle('Ver')).toBeTruthy();
    expect(screen.queryByTitle('Editar')).toBeNull();
    expect(screen.queryByTitle('Eliminar')).toBeNull();
  });

  it('ver la configuración NO da la vista extendida; editarla sí', () => {
    perms.grants = new Set(['tarifas.config:view']);
    expect(renderHook(() => useLiquidadorVista()).result.current.puedeConfigurar).toBe(false);
    perms.grants = new Set(['tarifas.config:view', 'tarifas.config:edit']);
    expect(renderHook(() => useLiquidadorVista()).result.current.puedeConfigurar).toBe(true);
  });
});

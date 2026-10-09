// @vitest-environment jsdom
//
// La lista de reglas: una regla de compañía muestra el NOMBRE de la compañía (no su id interno).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RulesSection } from './RulesSection';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import type { RuleRow } from '../types';

const parties = [
  { carrierId: 'C1', code: 'C1', name: 'Transportes Uno', partyId: 'PARTY_1', countryId: 'VE' },
] as CarrierProfile[];

const rules: RuleRow[] = [
  { id: 'R1', code: 'BONO', name: 'Bono país', scope: 'COUNTRY', stage: 'BASE', stacking: 'SUM', priority: 1, active: true },
  { id: 'R2', code: 'BONO', name: 'Bono compañía', scope: 'PARTY', party_id: 'PARTY_1', stage: 'BASE', stacking: 'SUM', priority: 1, active: true },
];

afterEach(cleanup);

describe('RulesSection', () => {
  it('muestra el nombre de la compañía en las reglas propias y marca la sobrescritura', () => {
    render(
      <MemoryRouter>
        <RulesSection
          rules={rules} parties={parties} loading={false}
          canCreate canEdit canDelete onNew={() => {}} onEdit={() => {}} onDelete={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Transportes Uno').length).toBeGreaterThan(0);
    expect(screen.queryByText('PARTY_1')).toBeNull();
    expect(screen.getByText('Sobrescribe')).toBeTruthy();
    expect(screen.getByText('Heredada (sobrescrita)')).toBeTruthy();
  });

  it('al entrar solo muestra las reglas activas (filtro preactivado)', () => {
    const mixed: RuleRow[] = [
      { ...rules[0], id: 'R3', code: 'ON', name: 'Regla encendida' },
      { ...rules[0], id: 'R4', code: 'OFF', name: 'Regla apagada', active: false },
    ];
    render(
      <MemoryRouter>
        <RulesSection
          rules={mixed} parties={parties} loading={false}
          canCreate canEdit canDelete onNew={() => {}} onEdit={() => {}} onDelete={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Regla encendida')).toBeTruthy();
    expect(screen.queryByText('Regla apagada')).toBeNull();
  });
});

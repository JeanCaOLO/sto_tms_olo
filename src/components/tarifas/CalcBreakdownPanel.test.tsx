// @vitest-environment jsdom
//
// Prueba de caracterización: fija el HTML que produce hoy el desglose para poder partir el archivo
// sin cambiar nada visible. El snapshot se generó ANTES de la partición y no debe editarse a mano.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalcBreakdownPanel, { AllocationBlock } from './CalcBreakdownPanel';
import { allocateTotal } from '../../lib/tarifas/allocation';
import { calculate } from '../../lib/tarifas';
import {
  makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip,
} from '../../lib/tarifas/__tests__/fixtures';
import type { CalculateInput, CargoSummary, Rule } from '../../lib/tarifas/types';

afterEach(cleanup);

const RULES: Rule[] = [
  makeRule({
    code: 'TARIFA_BASE', name: 'Tarifa del tramo', stage: 'BASE',
    conditions: { p: 'EQ', left: 'originZone', right: 'CCS' },
    expression: { op: 'FIXED', amount: '400.00' },
  }),
  makeRule({
    code: 'POR_CLIENTE', name: 'Por cliente atendido', stage: 'VARIABLE',
    conditions: { p: 'GT', left: 'clientCount', right: 0 },
    expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '2.00' },
  }),
  makeRule({
    code: 'NUNCA', name: 'Regla que no aplica', stage: 'SURCHARGE',
    conditions: { p: 'GT', left: 'km', right: 100000 },
    expression: { op: 'FIXED', amount: '99.00' },
  }),
];

const CARGO: CargoSummary = {
  value: '5000.00', weightKg: 300, volumeM3: 4, orders: 3,
  parts: [
    { customerId: 'c1', code: 'EPA', name: 'EPA', value: '3000.00', weightKg: 200, volumeM3: 3, items: 5, orders: 2, deferredOrders: 1 },
    { customerId: 'c2', code: 'COF', name: 'Cofersa', value: '2000.00', weightKg: 100, volumeM3: 1, items: 2, orders: 1 },
  ],
};

function run(overrides: Partial<CalculateInput> = {}) {
  const { zoneGroups, zones, locations } = makeGeoVE();
  return calculate({
    country: makeCountryVE(), trip: makeTrip({ clientCount: 40 }), rules: RULES,
    zones, zoneGroups, locations, ...makeOwnCostStructure(), marginPolicy: makeMarginPolicy(),
    ...overrides,
  });
}

describe('CalcBreakdownPanel (caracterización)', () => {
  it('nivel detalle por defecto, sin margen', () => {
    const { container } = render(<CalcBreakdownPanel result={run()} ctx={{ rules: RULES }} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('nivel auditoría con margen, líneas excluibles y enlaces', () => {
    const result = run({ cargo: CARGO });
    const { container } = render(
      <CalcBreakdownPanel
        result={result} ctx={{ rules: RULES }} fixedLevel="auditoria"
        excludedSeqs={[1]} total="123.45" onToggleLine={() => {}} hrefFor={(o) => `/reglas-tarifa?regla=${o.ruleId}`}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('muestra los avisos del motor (variable que no existe en el viaje)', () => {
    const rules = [...RULES, makeRule({
      code: 'PEAJES', name: 'Peajes', stage: 'VARIABLE',
      expression: { op: 'PER_UNIT', unit: 'custom:peajes', rate: '3.00' },
    })];
    const result = run({ rules });
    const { container } = render(<CalcBreakdownPanel result={result} ctx={{ rules }} />);
    expect(container.textContent).toContain('Avisos (');
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('nivel resumen oculta detalle y avisos', () => {
    const { container } = render(<CalcBreakdownPanel result={run()} ctx={{ rules: RULES }} fixedLevel="resumen" />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('AllocationBlock (caracterización)', () => {
  it('sin pedidos cargados', () => {
    const { container } = render(<AllocationBlock allocation={null} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('reparto por valor con proforma parcial', () => {
    const allocation = allocateTotal('750.00', CARGO, 'VALUE', makeCountryVE());
    expect(allocation).not.toBeNull();
    const { container } = render(<MemoryRouter><AllocationBlock allocation={allocation} /></MemoryRouter>);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('avisa cuando el criterio cae a otra base', () => {
    const sinValor: CargoSummary = { ...CARGO, parts: CARGO.parts.map((p) => ({ ...p, value: '0.00' })) };
    const allocation = allocateTotal('750.00', sinValor, 'VALUE', makeCountryVE());
    const { container } = render(<MemoryRouter><AllocationBlock allocation={allocation} criterion="VALUE" /></MemoryRouter>);
    expect(container.innerHTML).toMatchSnapshot();
    expect(container.textContent).toContain('Se repartió por');
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContractBaseBanner } from './ContractBaseBanner';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

type Over = {
  isOwnFleet?: boolean;
  method?: string;
  source?: 'CARRIER' | 'TENDER';
  amount?: string;
  contract?: TripCalculation['contract'];
};

const calc = ({ isOwnFleet = false, method, source = 'CARRIER', amount, contract = null }: Over): TripCalculation => ({
  trip: { isOwnFleet },
  result: {
    currency: 'CRC', trace: [],
    ...(method ? { base: { method, source: { kind: source, ref: 'x', label: 'Tarifa fija del transportista' }, replaced: [], duplicates: [] } } : {}),
  },
  input: { ...(amount ? { baseOverride: { method, amount } } : {}) },
  contract,
}) as unknown as TripCalculation;

afterEach(cleanup);

describe('ContractBaseBanner', () => {
  it('tercero con tarifa fija: dice la modalidad, el monto y el contrato', () => {
    render(<ContractBaseBanner calculation={calc({
      method: 'FIXED', amount: '135000',
      contract: { carrierName: 'Transosa', contractExpiry: '2999-12-31', expired: false },
    })} />);
    const texto = screen.getByTestId('contract-base-banner').textContent ?? '';
    expect(texto).toContain('Tarifa fija');
    expect(texto).toContain('Transosa');
    expect(texto).toContain('vigente hasta 31/12/2999');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tendering: dice que el monto fue adjudicado, no que es una tarifa fija del contrato', () => {
    render(<ContractBaseBanner calculation={calc({
      method: 'FIXED', source: 'TENDER', amount: '50000',
      contract: { carrierName: 'Transosa', contractExpiry: '2999-12-31', expired: false },
    })} />);
    const texto = screen.getByTestId('contract-base-banner').textContent ?? '';
    expect(texto).toContain('monto adjudicado por tendering');
    expect(texto).toContain('50');
    expect(texto).toContain('Transosa');
    expect(texto).toContain('adjudicación del viaje');
    expect(texto).not.toContain('según el contrato');
    expect(texto).not.toContain('Tarifa fija');
  });

  it('contrato vencido: alerta ámbar que deja liquidar', () => {
    render(<ContractBaseBanner calculation={calc({
      method: 'FIXED', contract: { carrierName: 'Transosa', contractExpiry: '2020-01-31', expired: true },
    })} />);
    expect(screen.getByRole('alert').textContent).toContain('Contrato vencido el 31/01/2020');
  });

  it('flota propia: estructura de costos', () => {
    render(<ContractBaseBanner calculation={calc({ isOwnFleet: true })} />);
    expect(screen.getByTestId('contract-base-banner').textContent).toContain('estructura de costos de la compañía');
  });
});

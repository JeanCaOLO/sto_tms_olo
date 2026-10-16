// @vitest-environment jsdom
//
// La proforma imprimible y el botón «Descargar PDF» del detalle. La liquidación sale de emitir de
// verdad un viaje de los datos de ejemplo, así que se prueba con un registro real y no a mano.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LiquidarViajeModal from '../components/LiquidarViajeModal';
import DetalleLiquidacionModal from '../components/DetalleLiquidacionModal';
import { ProformaImprimible } from './ProformaImprimible';
import { PRINT_ROOT_ID } from '../hooks/usePrintProforma';
import { getTrip } from '../../../lib/tarifas/tripsDataSource';
import type { SettlementRecord } from '../../../lib/tarifas/types';

vi.mock('../../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false }) }));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ appUser: { full_name: 'Auditor de prueba', email: 'auditor@example.com' } }),
}));

let saved: SettlementRecord;

beforeAll(async () => {
  localStorage.clear();
  const trip = (await getTrip('TRIP_RT_VE_A1'))!;
  const onSaved = vi.fn();
  render(
    <MemoryRouter>
      <LiquidarViajeModal isOpen trip={trip} settlement={null} onClose={() => {}} onSaved={onSaved} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText('Total a pagar')).toBeTruthy());
  fireEvent.click(screen.getByText('Emitir liquidación'));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  saved = onSaved.mock.calls[0]![0] as SettlementRecord;
  cleanup();
});

afterEach(cleanup);

describe('ProformaImprimible', () => {
  it('al emitir se entrega la liquidación guardada, con su desglose', () => {
    expect(saved.number).toMatch(/^LIQ-/);
    expect(saved.trace.length).toBeGreaterThan(0);
  });

  it('trae encabezado, viaje, reparto, pedidos y el desglose completo', () => {
    render(<ProformaImprimible settlement={saved} />);
    expect(screen.getByText(`Liquidación ${saved.number}`)).toBeTruthy();
    expect(screen.getByText('El viaje')).toBeTruthy();
    expect(screen.getByText('Reparto por casa comercial')).toBeTruthy();
    expect(screen.getByText('Desglose del cálculo')).toBeTruthy();
    expect(screen.getByText('PED-1001')).toBeTruthy();
    // Nivel auditoría: incluye lo que NO aplicó y los números que miró el motor.
    expect(document.body.textContent).toContain('Reglas que no aplicaron');
    expect(document.body.textContent).toContain('Auditoría: mercancía transportada vs gastos operativos');
  });
});

describe('Descargar PDF', () => {
  it('monta la proforma aparte y abre el diálogo de impresión', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<MemoryRouter><DetalleLiquidacionModal settlement={saved} onClose={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Descargar PDF'));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = document.getElementById(PRINT_ROOT_ID);
    expect(root?.textContent).toContain(`Liquidación ${saved.number}`);
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.getElementById(PRINT_ROOT_ID)).toBeNull());
    print.mockRestore();
  });
});

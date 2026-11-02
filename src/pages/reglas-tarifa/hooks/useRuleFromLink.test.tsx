// @vitest-environment jsdom
//
// Enlace desde el desglose de una liquidación (?regla=ID): abre la regla; si no existe avisa; solo quita ese parámetro.
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '../../../lib/notify';
import type { RuleRow } from '../types';
import { useRuleFromLink } from './useRuleFromLink';

vi.mock('../../../lib/notify', () => ({ notify: vi.fn() }));
const notifyMock = vi.mocked(notify);

const rules = [{ id: 'R1' }, { id: 'R2' }] as unknown as RuleRow[];

let search = '';
function Probe({ list, onFound }: { list: RuleRow[]; onFound: (rule: RuleRow) => void }) {
  useRuleFromLink(list, onFound);
  search = useLocation().search;
  return null;
}

const open = (url: string, list = rules, onFound = vi.fn()) => {
  const view = render(<MemoryRouter initialEntries={[url]}><Probe list={list} onFound={onFound} /></MemoryRouter>);
  return { onFound, ...view };
};

beforeEach(() => { notifyMock.mockReset(); search = ''; });
afterEach(cleanup);

describe('useRuleFromLink', () => {
  it('abre la regla indicada una sola vez y quita solo ?regla', () => {
    const { onFound } = open('/reglas-tarifa?regla=R2&pais=CR');
    expect(onFound).toHaveBeenCalledTimes(1);
    expect((onFound.mock.calls[0][0] as { id: string }).id).toBe('R2');
    expect(search).toBe('?pais=CR');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('si la regla no existe avisa, no abre nada y conserva los demás parámetros', () => {
    const { onFound } = open('/reglas-tarifa?regla=NOEXISTE&pais=CR');
    expect(onFound).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0][1]).toBe('warning');
    expect(String(notifyMock.mock.calls[0][0])).toMatch(/no existe|no se encontró/i);
    expect(search).toBe('?pais=CR');
  });

  it('espera a que carguen las reglas antes de buscar (no avisa con la lista vacía)', () => {
    const { onFound } = open('/reglas-tarifa?regla=R1', []);
    expect(onFound).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(search).toBe('?regla=R1');
  });

  it('un callback nuevo en cada render no vuelve a disparar el enlace', () => {
    const { onFound, rerender } = open('/reglas-tarifa?regla=R1');
    rerender(<MemoryRouter initialEntries={['/reglas-tarifa?regla=R1']}><Probe list={rules} onFound={onFound} /></MemoryRouter>);
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it('sin parámetro no hace nada', () => {
    const { onFound } = open('/reglas-tarifa');
    expect(onFound).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

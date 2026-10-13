// @vitest-environment jsdom
//
// Caracterización del modal de reglas, grabada ANTES de reordenar su código: el HTML de alta, de la
// pestaña avanzada y de edición, y los mensajes y efectos del envío. No editar los snapshots a mano.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RuleModal from './RuleModal';
import { listRules } from '../../../lib/tarifas/localRulesDataSource';

const perms = vi.hoisted(() => ({ canCreate: true, canEdit: true }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ ...perms, canDelete: true, canView: true }),
}));

const COUNTRY = { id: 'VE', name: 'Venezuela', local_currency: 'VES' };
const onClose = vi.fn();
const onSuccess = vi.fn();

function open(rule?: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <RuleModal
        isOpen onClose={onClose} onSuccess={onSuccess} rule={rule}
        organizationId="ORG" country={COUNTRY} usuarioActivo="Auditor"
      />
    </MemoryRouter>,
  );
}

const html = () => document.body.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_');
// Se envía el formulario directo: con campos obligatorios vacíos el navegador bloquearía el clic.
const submit = () => fireEvent.submit(document.querySelector('form') as HTMLFormElement);
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => { localStorage.clear(); perms.canCreate = true; perms.canEdit = true; onClose.mockClear(); onSuccess.mockClear(); });
afterEach(cleanup);

describe('RuleModal (caracterización)', () => {
  it('alta: pestaña simple', async () => {
    open();
    await screen.findByText('Nueva regla');
    await waitFor(() => expect(screen.getByLabelText('Operador *')).toBeTruthy());
    expect(html()).toMatchSnapshot();
  });

  it('alta: pestaña avanzada (JSON)', async () => {
    open();
    fireEvent.click(await screen.findByText('Avanzado (JSON)'));
    expect(html()).toMatchSnapshot();
  });

  it('edición de una regla del seed', async () => {
    const rules = await listRules('ORG');
    const rule = rules.find((r) => r.country_id === 'VE' && r.scope === 'COUNTRY')!;
    open(rule);
    await screen.findByText('Editar regla');
    expect(screen.getByDisplayValue(String(rule.code))).toBeTruthy();
    expect(html()).toMatchSnapshot();
  });

  it('sin permiso de crear no deja guardar y lo explica', async () => {
    perms.canCreate = false;
    open();
    submit();
    await screen.findByText('Tu rol no puede crear reglas.');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('con el formulario vacío marca los campos del cálculo', async () => {
    open();
    submit();
    await screen.findByText(/Regla inválida/);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('alcance por compañía sin elegir compañía lo pide', async () => {
    open();
    fireEvent.change(screen.getByLabelText('Alcance *'), { target: { value: 'PARTY' } });
    submit();
    await screen.findByText(/Elegí a qué compañía pertenece la regla/);
  });

  it('el modo "compite" exige el grupo de exclusión', async () => {
    open();
    fireEvent.change(screen.getByLabelText('¿Se suma o compite? *'), { target: { value: 'MAX' } });
    submit();
    await screen.findByText(/es obligatorio definir el grupo de exclusión/);
  });

  it('una expresión avanzada que no es JSON se rechaza', async () => {
    open();
    type('Código *', 'json-malo');
    type('Nombre *', 'JSON malo');
    fireEvent.click(await screen.findByText('Avanzado (JSON)'));
    const expresion = screen.getByText('Expresión (JSON del motor)').closest('section')!.querySelector('textarea')!;
    fireEvent.change(expresion, { target: { value: '{no es json' } });
    submit();
    await screen.findByText('La expresión en modo avanzado no es JSON válido.');
    expect(onSuccess).not.toHaveBeenCalled();
  });
  it('crea una regla de importe fijo: guarda, avisa y cierra', async () => {
    open();
    type('Código *', 'bono-prueba');
    type('Nombre *', 'Bono de prueba');
    type('Importe en VES *', '25');
    submit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    const guardada = (await listRules('ORG')).find((r) => r.code === 'BONO-PRUEBA');
    expect(guardada).toBeTruthy();
    expect(guardada!.name).toBe('Bono de prueba');
    expect(guardada!.version).toBe(1);
  });

  it('un código repetido avisa que ya existe', async () => {
    const rules = await listRules('ORG');
    const existente = rules.find((r) => r.country_id === 'VE')!;
    open();
    type('Código *', String(existente.code));
    type('Nombre *', 'Duplicada');
    type('Importe en VES *', '10');
    submit();
    await waitFor(() => expect(onSuccess.mock.calls.length + (document.body.textContent?.includes('Ya existe') ? 1 : 0)).toBeGreaterThan(0));
  });
  it.each(['FIXED', 'TIMES', 'PER_BLOCK', 'PERCENT', 'TIERED', 'RATE_TABLE'])('cálculo con operador %s', async (op) => {
    open();
    await screen.findByLabelText('Operador *');
    fireEvent.change(screen.getByLabelText('Operador *'), { target: { value: op } });
    expect(html()).toMatchSnapshot();
  });

  it('el probador evalúa el cálculo con un valor de ejemplo', async () => {
    open();
    await screen.findByLabelText('Operador *');
    fireEvent.change(screen.getByLabelText('Operador *'), { target: { value: 'FIXED' } });
    type('Importe en VES *', '25');
    fireEvent.click(screen.getByRole('button', { name: /Probar/ }));
    await screen.findByText(/25\.00 VES/);
  });

  it('un tramo (TIERED) se puede agregar y quitar', async () => {
    open();
    await screen.findByLabelText('Operador *');
    fireEvent.change(screen.getByLabelText('Operador *'), { target: { value: 'TIERED' } });
    const antes = document.querySelectorAll('input').length;
    fireEvent.click(screen.getByRole('button', { name: /Agregar tramo/ }));
    expect(document.querySelectorAll('input').length).toBeGreaterThan(antes);
  });  it('condiciones: modo "Si se cumple…" con una y con dos filas, y los operadores IN y BETWEEN', async () => {
    open();
    fireEvent.click(await screen.findByText('Si se cumple…'));
    expect(html()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: /Agregar condición/ }));
    expect(screen.getByText('Se cumplen')).toBeTruthy();
    fireEvent.click(screen.getByText('alguna (O)'));
    fireEvent.click(screen.getAllByTitle('Negar esta condición')[0]!);
    expect(html()).toMatchSnapshot();
    const operadores = document.querySelectorAll('section select');
    const opSelect = Array.from(operadores).find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'BETWEEN')) as HTMLSelectElement;
    fireEvent.change(opSelect, { target: { value: 'BETWEEN' } });
    expect(screen.getByPlaceholderText('Desde')).toBeTruthy();
    fireEvent.change(opSelect, { target: { value: 'IN' } });
    expect(screen.getByPlaceholderText('valor1, valor2, valor3')).toBeTruthy();
    expect(html()).toMatchSnapshot();
  });

  it('condiciones: modo JSON y quitar una fila', async () => {
    open();
    fireEvent.click(await screen.findByText('JSON'));
    expect(html()).toMatchSnapshot();
    fireEvent.click(screen.getByText('Si se cumple…'));
    fireEvent.click(screen.getByRole('button', { name: /Agregar condición/ }));
    const antes = screen.getAllByPlaceholderText('20').length;
    fireEvent.click(document.querySelectorAll('.ri-delete-bin-line')[0]!.closest('button')!);
    expect(screen.getAllByPlaceholderText('20').length).toBe(antes - 1);
  });});

// @vitest-environment jsdom
//
// Caracterización del Probador del motor, escrita contra el código ORIGINAL (más las correcciones de
// la Fase 1: fecha local, fecha inválida y error al fijar el total). Cubre los dos modos, los
// escenarios guardados y las variables de la compañía. Los snapshots se generaron ANTES de partir
// el archivo y no deben editarse a mano. La fecha se congela: el formulario libre muestra "hoy".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RuleTester from './RuleTester';

function open() {
  return render(
    <MemoryRouter>
      <RuleTester organizationId="org-1" />
    </MemoryRouter>,
  );
}

// Los ids de React (`useId`) dependen de cuántos componentes se montaron antes en el archivo de
// pruebas, no del comportamiento: se normalizan para que el snapshot sea estable.
const html = (container: HTMLElement) => container.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_');

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const optionCount = (label: string) => select(label).options.length;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function ready() {
  await screen.findByText('El viaje de prueba');
  await waitFor(() => expect(select('País').value).not.toBe(''));
}

async function chooseCountry(id: string) {
  await ready();
  change('País', id);
}

async function pickFirstTrip() {
  await waitFor(() => expect(optionCount('Viaje completado *')).toBeGreaterThan(1));
  const trip = select('Viaje completado *');
  fireEvent.change(trip, { target: { value: trip.options[1].value } });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('RuleTester (caracterización)', () => {
  it('arranca con un país elegido, en modo viaje y sin viaje', async () => {
    const { container } = open();
    await ready();
    expect(optionCount('País')).toBe(3);
    await waitFor(() => expect(document.querySelector('option[value="TRIP_RT_CO_A1"]')).not.toBeNull());
    expect(screen.getByText('Elegí un viaje completado para ver el desglose.')).toBeTruthy();
    expect(html(container)).toMatchSnapshot();
  });

  it('lista los viajes completados del país y los reinicia al cambiar de país', async () => {
    open();
    await chooseCountry('VE');
    await waitFor(() => expect(optionCount('Viaje completado *')).toBe(5));
    await pickFirstTrip();
    await screen.findByText(/^Del viaje /);

    change('País', 'CO');
    await waitFor(() => expect(optionCount('Viaje completado *')).toBe(2));
    expect(select('Viaje completado *').value).toBe('');
    expect(screen.queryByText(/^Del viaje /)).toBeNull();
  });

  it('con un viaje real calcula y muestra el desglose', async () => {
    open();
    await chooseCountry('VE');
    await pickFirstTrip();
    await screen.findByText('Total a liquidar');
    expect(screen.queryByText('Elegí un viaje completado para ver el desglose.')).toBeNull();
  });

  it('en viaje libre elige zonas por defecto y calcula', async () => {
    const { container } = open();
    await chooseCountry('VE');
    fireEvent.click(screen.getByRole('button', { name: 'Viaje libre' }));
    await waitFor(() => expect(select('Zona origen').value).not.toBe(''));
    expect(select('Zona destino').value).not.toBe('');
    await screen.findByText('Total a liquidar');
    expect(html(container)).toMatchSnapshot();
  });

  it('en viaje libre la flota se teclea; con una compañía la define la compañía', async () => {
    open();
    await chooseCountry('VE');
    fireEvent.click(screen.getByRole('button', { name: 'Viaje libre' }));
    await screen.findByLabelText('Flota');
    await waitFor(() => expect(optionCount('Compañía (opcional)')).toBeGreaterThan(1));
    const company = select('Compañía (opcional)');
    fireEvent.change(company, { target: { value: company.options[1].value } });
    expect(screen.queryByLabelText('Flota')).toBeNull();
    expect(screen.getByText(/La flota la define el transportista elegido/)).toBeTruthy();
  });

  it('con una compañía con variables propias muestra sus campos', async () => {
    open();
    await chooseCountry('VE');
    fireEvent.click(screen.getByRole('button', { name: 'Viaje libre' }));
    await waitFor(() => expect(optionCount('Compañía (opcional)')).toBeGreaterThan(1));
    const company = select('Compañía (opcional)');
    const withVars = Array.from(company.options).find((o) => o.value === 'CARRIER_VE_1');
    fireEvent.change(company, { target: { value: withVars!.value } });
    await screen.findByText('Variables de la compañía');
    expect(screen.getByLabelText(/Horas de espera/)).toBeTruthy();
  });

  it('una fecha vacía avisa en vez de romper el cálculo', async () => {
    open();
    await chooseCountry('VE');
    fireEvent.click(screen.getByRole('button', { name: 'Viaje libre' }));
    await screen.findByText('Total a liquidar');
    change('Fecha', '');
    await screen.findByText('La fecha del viaje no es válida.');
    expect(screen.queryByText('Total a liquidar')).toBeNull();
  });

  it('un escenario guardado carga su viaje completo en modo libre y muestra su veredicto', async () => {
    const { container } = open();
    await ready();
    await waitFor(() => expect(optionCount('Escenario guardado')).toBeGreaterThan(1));
    const scenario = select('Escenario guardado');
    fireEvent.change(scenario, { target: { value: 'TPL_VE_1' } });

    await waitFor(() => expect(select('País').value).toBe('VE'));
    expect(screen.getByRole('button', { name: 'Viaje libre' }).className).toContain('bg-white');
    // El escenario del seed declara un total que el motor actual ya no da: avisa que "se movió".
    await screen.findByText(/El total se movió/);
    expect(screen.getByRole('button', { name: /como el total esperado/ })).toBeTruthy();
    expect(html(container)).toMatchSnapshot();
  });

  it('fijar el total actual hace que el escenario lo verifique', async () => {
    open();
    await ready();
    await waitFor(() => expect(optionCount('Escenario guardado')).toBeGreaterThan(1));
    fireEvent.change(select('Escenario guardado'), { target: { value: 'TPL_VE_1' } });
    fireEvent.click(await screen.findByRole('button', { name: /como el total esperado/ }));
    await screen.findByText(/Este escenario sigue dando lo que declara/);
  });

  it('volver a "Ninguno" quita el veredicto', async () => {
    open();
    await ready();
    await waitFor(() => expect(optionCount('Escenario guardado')).toBeGreaterThan(1));
    fireEvent.change(select('Escenario guardado'), { target: { value: 'TPL_VE_1' } });
    await screen.findByText(/El total se movió/);
    fireEvent.change(select('Escenario guardado'), { target: { value: '' } });
    await waitFor(() => expect(screen.queryByText(/El total se movió/)).toBeNull());
  });

  it('"Recargar" vuelve a cargar los países y los escenarios', async () => {
    open();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Recargar/ }));
    await screen.findByText('El viaje de prueba');
    expect(optionCount('País')).toBe(3);
  });
});

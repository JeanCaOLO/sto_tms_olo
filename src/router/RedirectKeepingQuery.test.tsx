// @vitest-environment jsdom
//
// Las rutas antiguas se conservan como redirección para no romper enlaces guardados: antes se perdían los parámetros
// de la dirección (por ejemplo ?regla=… o filtros) al redirigir.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import RedirectKeepingQuery from './RedirectKeepingQuery';

function Destino() {
  const { pathname, search } = useLocation();
  return <p data-testid="destino">{pathname + search}</p>;
}

function abrir(url: string, params?: Record<string, string>) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/vieja" element={<RedirectKeepingQuery to="/nueva" params={params} />} />
        <Route path="/nueva" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId('destino').textContent;
}

afterEach(cleanup);

describe('RedirectKeepingQuery', () => {
  it('conserva los parámetros de la dirección original', () => {
    expect(abrir('/vieja?regla=R1&pais=CR')).toBe('/nueva?regla=R1&pais=CR');
  });

  it('agrega los parámetros fijos de la ruta antigua', () => {
    expect(abrir('/vieja', { flota: 'propia' })).toBe('/nueva?flota=propia');
  });

  it('combina los fijos con los que ya venían', () => {
    const destino = abrir('/vieja?x=1', { flota: 'propia' }) ?? '';
    const query = new URLSearchParams(destino.split('?')[1]);
    expect(query.get('x')).toBe('1');
    expect(query.get('flota')).toBe('propia');
  });

  it('el parámetro fijo manda: la ruta antigua significa "propia" aunque llegue otro valor', () => {
    expect(abrir('/vieja?flota=externa', { flota: 'propia' })).toBe('/nueva?flota=propia');
  });

  it('sin parámetros redirige limpio', () => {
    expect(abrir('/vieja')).toBe('/nueva');
  });
});

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Badge from './Badge';

describe('Badge', () => {
  it('la variante blue es azul cielo (el color de "completado" en el mapa), distinta de info (teal)', () => {
    render(<><Badge variant="blue">Completado</Badge><Badge variant="info">Info</Badge></>);
    expect(screen.getByText('Completado').className).toMatch(/bg-sky-100 text-sky-700/);
    expect(screen.getByText('Info').className).toMatch(/bg-teal-100/);
  });
});

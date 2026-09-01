// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TipoParadaBadge from './TipoParadaBadge';

describe('TipoParadaBadge (BR1.4: nunca sólo color)', () => {
  it('renderiza el texto "Devolución" para tipo="devolucion"', () => {
    render(<TipoParadaBadge tipo="devolucion" />);
    expect(screen.getByText('Devolución')).toBeTruthy();
  });

  it('no renderiza nada para tipo="entrega"', () => {
    const { container } = render(<TipoParadaBadge tipo="entrega" />);
    expect(container.firstChild).toBeNull();
  });

  it('no renderiza nada para tipo undefined', () => {
    const { container } = render(<TipoParadaBadge />);
    expect(container.firstChild).toBeNull();
  });
});

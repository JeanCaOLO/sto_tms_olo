// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HintProvider } from './HintProvider';
import { hintKey } from './hintKey';

const HINTS = {
  'Subir plantilla': 'Carga la plantilla de Excel.',
  'Importe': 'Monto de la regla.',
  'Estado': 'Situación actual.',
  'Probar': 'Calcula un ejemplo.',
};

function view() {
  return render(
    <HintProvider hints={HINTS}>
      <button>Subir plantilla</button>
      <button title="Mi título">Probar</button>
      <button>Sin descripción</button>
      <label htmlFor="imp">Importe *</label>
      <input id="imp" />
      <table><thead><tr><th>Estado</th></tr></thead></table>
    </HintProvider>,
  );
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('hintKey', () => {
  it('ignora mayúsculas, acentos, asteriscos, paréntesis y signos', () => {
    expect(hintKey('Importe (USD) *')).toBe('importe');
    expect(hintKey('¿Cómo se cobra cada fila?')).toBe('como se cobra cada fila');
    expect(hintKey('Antes → Después')).toBe('antes despues');
  });
});

describe('HintProvider', () => {
  it('al pasar el ratón por un botón muestra su descripción tras una breve espera', () => {
    view();
    fireEvent.mouseOver(screen.getByText('Subir plantilla'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByRole('tooltip').textContent).toBe('Carga la plantilla de Excel.');
    expect(screen.getByText('Subir plantilla').getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
  });

  it('con el foco del teclado aparece de inmediato y Esc la cierra', () => {
    view();
    fireEvent.focus(screen.getByText('Subir plantilla'));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByText('Subir plantilla').hasAttribute('aria-describedby')).toBe(false);
  });

  it('un campo se describe por su etiqueta', () => {
    view();
    fireEvent.focus(screen.getByLabelText('Importe *'));
    expect(screen.getByRole('tooltip').textContent).toBe('Monto de la regla.');
  });

  it('una columna se describe por su encabezado', () => {
    view();
    fireEvent.focus(screen.getByText('Estado'));
    expect(screen.getByRole('tooltip').textContent).toBe('Situación actual.');
  });

  it('no duplica la ayuda de un elemento que ya tiene `title`, ni inventa una para lo desconocido', () => {
    view();
    fireEvent.focus(screen.getByText('Probar'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(screen.getByText('Sin descripción'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('al salir con el ratón o hacer clic desaparece', () => {
    view();
    const boton = screen.getByText('Subir plantilla');
    fireEvent.mouseOver(boton);
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.mouseOut(boton, { relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(boton);
    fireEvent.mouseDown(boton);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

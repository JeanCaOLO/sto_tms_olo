// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TabBar from './TabBar';
import { tabPanelProps } from './tabPanelProps';

afterEach(cleanup);

const TABS = [
  { key: 'a', label: 'Primera' },
  { key: 'b', label: 'Segunda', icon: 'ri-flask-line' },
  { key: 'c', label: 'Tercera' },
] as const;

function Demo({ onChange = vi.fn() }: { onChange?: (k: string) => void }) {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
  return (
    <>
      <TabBar
        tabs={[...TABS]}
        value={value}
        onChange={(k) => { setValue(k); onChange(k); }}
        ariaLabel="Secciones"
        idBase="demo"
        tabClassName={(on) => (on ? 'on' : 'off')}
      />
      <div {...tabPanelProps('demo', value)}>contenido {value}</div>
    </>
  );
}

describe('TabBar', () => {
  it('expone tablist, tab con aria-selected y el panel enlazado con su pestaña', () => {
    render(<Demo />);
    expect(screen.getByRole('tablist', { name: 'Secciones' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id);
  });

  it('solo la pestaña activa entra en el orden de Tab (tabIndex), las demás se alcanzan con flechas', () => {
    render(<Demo />);
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('las flechas, Inicio y Fin cambian de pestaña y mueven el foco', () => {
    const onChange = vi.fn();
    render(<Demo onChange={onChange} />);
    const [a] = screen.getAllByRole('tab');
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Segunda/ }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('un clic cambia de pestaña, aplica la clase de activa y pinta el ícono', () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole('tab', { name: /Segunda/ }));
    expect(screen.getByRole('tab', { name: /Segunda/ }).className).toContain('on');
    expect(screen.getByRole('tab', { name: /Primera/ }).className).toContain('off');
    expect(screen.getByRole('tab', { name: /Segunda/ }).querySelector('.ri-flask-line')).not.toBeNull();
    expect(screen.getByRole('tabpanel').textContent).toBe('contenido b');
  });
});

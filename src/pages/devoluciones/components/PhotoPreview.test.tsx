// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PhotoPreview from './PhotoPreview';

afterEach(cleanup);

const URL_A = 'https://bucket.s3.amazonaws.com/pedidos/PED-1/x/photo_return-y.jpg?sig=1';

describe('PhotoPreview', () => {
  it('muestra una miniatura y no abre el visor hasta hacer clic', () => {
    render(<PhotoPreview url={URL_A} label="DV-1 · Lámina" />);
    expect(screen.getByRole('button', { name: 'Ver foto: DV-1 · Lámina' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('abre el visor con la foto ampliada y un enlace al original', () => {
    render(<PhotoPreview url={URL_A} label="DV-1 · Lámina" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver foto: DV-1 · Lámina' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByAltText('Foto de la devolución: DV-1 · Lámina').getAttribute('src')).toBe(URL_A);
    expect(screen.getByRole('link', { name: /Abrir en otra pestaña/ }).getAttribute('href')).toBe(URL_A);
  });

  it('cierra el visor con Escape', () => {
    render(<PhotoPreview url={URL_A} label="DV-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver foto: DV-1' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('si la imagen no carga, ofrece recargar y recupera la miniatura con una URL nueva', () => {
    const onReload = vi.fn();
    const { container, rerender } = render(<PhotoPreview url={URL_A} label="DV-1" onReload={onReload} />);
    fireEvent.error(container.querySelector('img')!);
    fireEvent.click(screen.getByRole('button', { name: /Foto no disponible/ }));
    expect(onReload).toHaveBeenCalledTimes(1);

    rerender(<PhotoPreview url={`${URL_A}2`} label="DV-1" onReload={onReload} />);
    expect(screen.getByRole('button', { name: 'Ver foto: DV-1' })).toBeTruthy();
  });

  it('sin onReload, la foto caída no es accionable', () => {
    const { container } = render(<PhotoPreview url={URL_A} label="DV-1" />);
    fireEvent.error(container.querySelector('img')!);
    expect((screen.getByRole('button', { name: /Foto no disponible/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

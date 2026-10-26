import { describe, expect, it } from 'vitest';
import { imageHeightMm, pageOffsets } from '../proformaPdf';

describe('paginado del PDF', () => {
  it('ajusta la imagen al ancho de la hoja A4', () => {
    expect(imageHeightMm(794, 1123)).toBeCloseTo(297, 0);
    expect(imageHeightMm(100, 200)).toBe(420);
  });

  it('una imagen que cabe usa una página', () => {
    expect(pageOffsets(100)).toEqual([0]);
    expect(pageOffsets(297)).toEqual([0]);
  });

  it('una imagen más alta se reparte en tantas páginas como haga falta', () => {
    expect(pageOffsets(298)).toEqual([0, -297]);
    expect(pageOffsets(700)).toEqual([0, -297, -594]);
  });
});

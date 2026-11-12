import { describe, expect, it } from 'vitest';
import {
  MAX_FILES_PER_ITEM, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, fileProblem, newDraftItem, parseQuantity, toPayloadItem,
  validateAll, validateItem, type DraftItem,
} from './solicitudes';

const valid = (patch: Partial<DraftItem> = {}): DraftItem => ({
  ...newDraftItem('a'), productCode: 'ART-1', productName: 'Producto', quantity: '3', reason: 'danado', ...patch,
});
const file = (type: string, size: number, name = 'f') => ({ name, type, size });

describe('parseQuantity', () => {
  it.each([['3', 3], [' 12 ', 12]])('acepta %s', (raw, expected) => expect(parseQuantity(raw)).toBe(expected));
  it.each(['0', '-1', '1.5', 'abc', '', '1e3', '1000001'])('rechaza %s', (raw) => expect(parseQuantity(raw)).toBeNull());
});

describe('validateItem', () => {
  it('un artículo completo no tiene errores', () => expect(validateItem(valid())).toEqual({}));
  it('exige código, cantidad y motivo', () => {
    expect(Object.keys(validateItem(newDraftItem('x'))).sort()).toEqual(['productCode', 'productName', 'quantity', 'reason']);
  });
  it('«Otro» exige descripción; los demás motivos no', () => {
    expect(validateItem(valid({ reason: 'otro' })).description).toBeDefined();
    expect(validateItem(valid({ reason: 'otro', description: '  ' })).description).toBeDefined();
    expect(validateItem(valid({ reason: 'otro', description: 'no coincide' }))).toEqual({});
    expect(validateItem(valid({ reason: 'no_solicitado' }))).toEqual({});
  });
  it.each(['', '   '])('exige nombre: %s', (productName) => {
    expect(validateItem(valid({ productName })).productName).toBeDefined();
  });
  it('valida los limites de texto antes de subir evidencias', () => {
    expect(validateItem(valid({ productName: 'x'.repeat(256) })).productName).toBeDefined();
    expect(validateItem(valid({ productCode: 'x'.repeat(101) })).productCode).toBeDefined();
    expect(validateItem(valid({ description: 'x'.repeat(501) })).description).toBeDefined();
  });
});

describe('validateAll', () => {
  it('sin artículos no es válido', () => expect(validateAll([]).ok).toBe(false));
  it('indica qué artículo falla', () => {
    const result = validateAll([valid(), { ...newDraftItem('b') }]);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors)).toEqual(['b']);
  });
  it('todos válidos', () => expect(validateAll([valid(), valid({ id: 'c' })]).ok).toBe(true));
  it('conserva el maximo de 50 articulos', () => {
    expect(validateAll(Array.from({length: 51}, (_, n) => valid({id: String(n)}))).ok).toBe(false);
  });
});

describe('fileProblem', () => {
  it('acepta foto y video dentro de su límite', () => {
    expect(fileProblem(file('image/jpeg', MAX_PHOTO_BYTES), 0)).toBeNull();
    expect(fileProblem(file('video/mp4', MAX_VIDEO_BYTES), 0)).toBeNull();
  });
  it('la foto tiene un límite menor que el video', () => {
    expect(fileProblem(file('image/png', MAX_PHOTO_BYTES + 1), 0)).toMatch(/foto/);
    expect(fileProblem(file('video/quicktime', MAX_VIDEO_BYTES + 1), 0)).toMatch(/video/);
  });
  it('rechaza tipos no permitidos y archivos vacíos', () => {
    expect(fileProblem(file('application/pdf', 10), 0)).toMatch(/solo fotos/);
    expect(fileProblem(file('image/gif', 10), 0)).not.toBeNull();
    expect(fileProblem(file('image/jpeg', 0), 0)).toMatch(/vacío/);
  });
  it('limita la cantidad de archivos por artículo', () => {
    expect(fileProblem(file('image/jpeg', 10), MAX_FILES_PER_ITEM - 1)).toBeNull();
    expect(fileProblem(file('image/jpeg', 10), MAX_FILES_PER_ITEM)).toMatch(/Máximo/);
  });
});

describe('toPayloadItem', () => {
  it('normaliza y omite los opcionales vacíos', () => {
    expect(toPayloadItem(valid({ productCode: ' ART-1 ' }), [{ key: 'k' }])).toEqual({
      product_code: 'ART-1', product_name: 'Producto', quantity: 3, reason_code: 'danado', files: [{ key: 'k' }],
    });
  });
  it('incluye nombre y descripción cuando existen', () => {
    const payload = toPayloadItem(valid({ productName: ' Taladro ', description: ' roto ' }), []);
    expect(payload).toMatchObject({ product_name: 'Taladro', description: 'roto' });
  });
});

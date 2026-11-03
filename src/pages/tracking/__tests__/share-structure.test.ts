import { describe, expect, it } from 'vitest';
import { shareStructure } from '../hooks/share-structure';

describe('shareStructure', () => {
  it('devuelve la misma referencia si nada cambió', () => {
    const prev = { items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }], summary: { active: 2 } };
    const next = JSON.parse(JSON.stringify(prev));
    expect(shareStructure(prev, next)).toBe(prev);
  });

  it('conserva los elementos que no cambiaron y reemplaza solo el que cambió', () => {
    const prev = { items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] };
    const out = shareStructure(prev, { items: [{ id: 'a', n: 1 }, { id: 'b', n: 3 }] });
    expect(out).not.toBe(prev);
    expect(out.items[0]).toBe(prev.items[0]);
    expect(out.items[1]).toEqual({ id: 'b', n: 3 });
  });

  it('refleja altas, bajas y cambios de tipo', () => {
    expect(shareStructure([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(shareStructure([1, 2, 3], [1, 2])).toEqual([1, 2]);
    expect(shareStructure({ a: 1 }, { a: 1, b: null })).toEqual({ a: 1, b: null });
    expect(shareStructure({ a: 1 }, { a: [1] })).toEqual({ a: [1] });
    expect(shareStructure(null, { a: 1 })).toEqual({ a: 1 });
  });
});

import { describe, it, expect } from 'vitest';
import {
  ESTADO_SECUENCIA_DEFAULT,
  ESTADOS_SECUENCIA,
  FILTROS_ESTADO_SECUENCIA,
  filtrarPorEstadoSecuencia,
  infoEstadoSecuencia,
  type EstadoSecuencia,
} from './route-status';

describe('route-status — estado operativo de la secuencia', () => {
  it('sin estado ⇒ default "activa" (retro-compatible con registros viejos)', () => {
    expect(infoEstadoSecuencia(undefined).estado).toBe('activa');
    expect(ESTADO_SECUENCIA_DEFAULT).toBe('activa');
  });

  it('devuelve label + variant + icon para cada estado válido', () => {
    for (const e of ESTADOS_SECUENCIA) {
      const info = infoEstadoSecuencia(e.estado);
      expect(info).toEqual(e);
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.icon).toMatch(/^ri-/);
    }
  });

  it('los tres estados pedidos existen y ninguno usa "ruta"/"viaje"', () => {
    expect(ESTADOS_SECUENCIA.map((e) => e.estado).sort()).toEqual(
      ['activa', 'cancelada', 'completada'],
    );
  });

  it('estado desconocido cae al primero en vez de romper', () => {
    expect(infoEstadoSecuencia('inexistente' as EstadoSecuencia).estado).toBe('activa');
  });
});

describe('filtrarPorEstadoSecuencia', () => {
  const items = [
    { id: 'a', estado: 'activa' as EstadoSecuencia },
    { id: 'b', estado: 'completada' as EstadoSecuencia },
    { id: 'c', estado: 'cancelada' as EstadoSecuencia },
    { id: 'd' }, // registro viejo sin estado ⇒ cuenta como 'activa'
  ];

  it('"todas" devuelve la lista completa sin copiar de más', () => {
    expect(filtrarPorEstadoSecuencia(items, 'todas')).toHaveLength(4);
  });

  it('filtra por estado exacto', () => {
    expect(filtrarPorEstadoSecuencia(items, 'completada').map((i) => i.id)).toEqual(['b']);
    expect(filtrarPorEstadoSecuencia(items, 'cancelada').map((i) => i.id)).toEqual(['c']);
  });

  it('un registro sin estado cae en "activa"', () => {
    expect(filtrarPorEstadoSecuencia(items, 'activa').map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('las opciones de filtro cubren los tres estados + "todas"', () => {
    expect(FILTROS_ESTADO_SECUENCIA.map((f) => f.valor)).toEqual([
      'todas', 'activa', 'completada', 'cancelada',
    ]);
  });
});

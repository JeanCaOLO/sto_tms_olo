import { describe, it, expect } from 'vitest';
import {
  ESTADO_SECUENCIA_DEFAULT,
  ESTADOS_SECUENCIA,
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

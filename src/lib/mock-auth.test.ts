import { describe, expect, it } from 'vitest';
import { mockAppUser, mockUser } from './mock-auth';

// Estos datos viajan en el bundle de producción aunque el modo mock nunca se active (el código está importado
// estáticamente): no pueden ser el nombre ni el correo de una persona real.
describe('usuario del modo mock', () => {
  it('es genérico: sin nombre ni correo de una persona real', () => {
    expect(mockAppUser.email).toBe('mock@example.com');
    expect(mockAppUser.full_name).not.toMatch(/Araujo|Jes[uú]s/i);
    expect(mockAppUser.email).not.toMatch(/intelix|ologistics/i);
  });

  it('el usuario de la sesión coincide con el de la aplicación', () => {
    expect(mockUser.email).toBe(mockAppUser.email);
    expect(mockUser.id).toBe(mockAppUser.auth_user_id);
  });
});

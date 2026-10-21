import { describe, it, expect } from 'vitest';
import { validateContractFile, CONTRACT_MAX_BYTES } from './carrier-contract';

function fakeFile(name: string, type: string, size: number): File {
  // No construimos un File real con `size` grande en memoria: parcheamos la prop.
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateContractFile', () => {
  it('acepta un PDF dentro del límite', () => {
    expect(validateContractFile(fakeFile('contrato.pdf', 'application/pdf', 1000))).toBeNull();
  });

  it('acepta por extensión .pdf aunque el type venga vacío', () => {
    expect(validateContractFile(fakeFile('contrato.PDF', '', 1000))).toBeNull();
  });

  it('rechaza un no-PDF', () => {
    expect(validateContractFile(fakeFile('foto.png', 'image/png', 1000))).toMatch(/PDF/);
  });

  it('rechaza un PDF que supera los 10 MB', () => {
    expect(validateContractFile(fakeFile('grande.pdf', 'application/pdf', CONTRACT_MAX_BYTES + 1))).toMatch(/10 MB/);
  });
});

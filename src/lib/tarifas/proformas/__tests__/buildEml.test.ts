import { describe, expect, it } from 'vitest';
import { buildEml, encodeSubject } from '../buildEml';

const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
const pdfB64 = btoa('%PDF-1.4 contenido de prueba');

const eml = buildEml({
  to: ['a@x.com', 'b@y.com'],
  subject: 'Proforma PRO-CR-001 – Javier Martín',
  body: 'Hola\nTotal: ₡100,115.2',
  attachment: { fileName: 'Proforma PRO-CR-001.pdf', base64: pdfB64 },
  boundary: 'BOUND',
});

describe('buildEml', () => {
  it('abre como borrador: destinatarios, X-Unsent y MIME multipart', () => {
    expect(eml).toContain('To: a@x.com, b@y.com\r\n');
    expect(eml).toContain('X-Unsent: 1\r\n');
    expect(eml).toContain('Content-Type: multipart/mixed; boundary="BOUND"');
    expect(eml.endsWith('--BOUND--\r\n')).toBe(true);
    expect(eml).not.toMatch(/[^\r]\n/); // solo CRLF
  });

  it('codifica el asunto con tildes y guion largo como palabras UTF-8', () => {
    const line = eml.split('\r\n').find((l) => l.startsWith('Subject: '))!;
    const words = [...eml.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map((m) => decode(m[1]!));
    expect(line).toContain('=?UTF-8?B?');
    expect(words.join('')).toBe('Proforma PRO-CR-001 – Javier Martín');
  });

  it('un asunto ASCII va tal cual y uno largo no corta caracteres', () => {
    expect(encodeSubject('Proforma 1')).toBe('Proforma 1');
    const long = 'ñ'.repeat(60);
    const words = [...encodeSubject(long).matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((m) => decode(m[1]!));
    expect(words.length).toBeGreaterThan(1);
    expect(words.join('')).toBe(long);
  });

  it('el mensaje va en UTF-8 base64 y se recupera idéntico', () => {
    const part = eml.split('--BOUND')[1]!;
    expect(part).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(decode(part.split('\r\n\r\n')[1]!)).toBe('Hola\nTotal: ₡100,115.2');
  });

  it('adjunta el PDF íntegro, con nombre seguro y líneas de 76 caracteres', () => {
    const part = eml.split('--BOUND')[2]!;
    expect(part).toContain('Content-Disposition: attachment; filename="Proforma_PRO-CR-001.pdf"');
    const data = part.split('\r\n\r\n')[1]!;
    expect(decode(data)).toBe('%PDF-1.4 contenido de prueba');
    const big = buildEml({ to: ['a@x.com'], subject: 's', body: 'b', attachment: { fileName: 'x.pdf', base64: btoa('A'.repeat(500)) }, boundary: 'B' });
    expect(Math.max(...big.split('\r\n').map((l) => l.length))).toBeLessThanOrEqual(76 + 0);
  });
});

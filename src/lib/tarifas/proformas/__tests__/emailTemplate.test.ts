import { describe, expect, it } from 'vitest';
import { db } from '../../data';
import { buildRecipients, fillTemplate, getCarrierEmail, gmailComposeUrl, markEmailSent } from '..';

describe('fillTemplate', () => {
  it('reemplaza las variables, todas las veces, y deja las desconocidas', () => {
    const out = fillTemplate('{number} de {carrier}: {total} ({number}) {otra}', { number: 'PRO-VE-001', carrier: 'Andino', total: 'Bs 303,00' });
    expect(out).toBe('PRO-VE-001 de Andino: Bs 303,00 (PRO-VE-001) {otra}');
  });
});

describe('buildRecipients', () => {
  it('une transportista y fijos, sin repetir (sin distinguir mayúsculas) ni vacíos', () => {
    expect(buildRecipients(['A@x.com', ' ', 'b@y.com', 'a@X.com'], true, 'a@x.com')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('sin transportista si no se pidió o no tiene correo', () => {
    expect(buildRecipients(['b@y.com'], false, 'a@x.com')).toEqual(['b@y.com']);
    expect(buildRecipients(['b@y.com'], true, null)).toEqual(['b@y.com']);
  });
});

describe('gmailComposeUrl', () => {
  it('codifica asunto y cuerpo con tildes, saltos de línea y símbolos', () => {
    const url = new URL(gmailComposeUrl({ to: ['a@x.com', 'b@y.com'], subject: 'Proforma – liquidación', body: 'Hola\nTotal: 10 & 20' }));
    expect(url.origin + url.pathname).toBe('https://mail.google.com/mail/');
    expect(url.searchParams.get('view')).toBe('cm');
    expect(url.searchParams.get('to')).toBe('a@x.com,b@y.com');
    expect(url.searchParams.get('su')).toBe('Proforma – liquidación');
    expect(url.searchParams.get('body')).toBe('Hola\nTotal: 10 & 20');
  });
});

describe('correo del transportista y envío', () => {
  it('lee carriers.email y devuelve null si falta', async () => {
    expect(await getCarrierEmail('CARRIER_VE_1')).toBeNull();
    expect(await getCarrierEmail('NO_EXISTE')).toBeNull();
  });

  it('el destinatario es el correo del transportista, nunca el del conductor', async () => {
    // Solo se lee `carriers.email`: sin correo en el catálogo no hay destinatario del transportista (no se busca otro).
    const email = await getCarrierEmail('CARRIER_VE_1');
    expect(email).toBeNull();
    expect(buildRecipients([], true, email)).toEqual([]);
    expect(buildRecipients([], true, 'empresa@transportes.com')).toEqual(['empresa@transportes.com']);
  });

  it('marca la proforma como enviada con bitácora', async () => {
    const now = '2026-10-20T10:00:00Z';
    await db().insert('proforma', {
      id: 'pro_x', country_id: 'VE', number: 'PRO-VE-001', carrier_id: 'CARRIER_VE_1', carrier_name: 'Andino', status: 'Aprobado',
      currency: 'VES', total_amount: '10.00', created_by: 'x', email_sent_at: null, notes: null, created_at: now, updated_at: now,
    });
    expect((await markEmailSent('pro_x', ['a@x.com'])).error).toBeNull();
    expect((await db().findOne('proforma', 'pro_x'))!.email_sent_at).not.toBeNull();
    const log = await db().find('auditLog', { where: [{ column: 'entity_id', op: 'eq', value: 'pro_x' }] });
    expect(log).toHaveLength(1);
  });
});

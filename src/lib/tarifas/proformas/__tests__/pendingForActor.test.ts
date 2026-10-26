import { describe, expect, it } from 'vitest';
import {
  approvePhase, buildPhases, pendingForActor,
  type FlowPhaseTemplate, type PhaseActor, type ProformaRecord, type ProformaWithPhases,
} from '..';

const NOW = '2026-10-20T10:00:00Z';
const tpl = (position: number, roleName: string): FlowPhaseTemplate => ({
  id: `t${position}`, countryId: 'c1', position, name: `Fase ${position}`, approverType: 'role',
  roleName, userId: null, approverLabel: roleName, active: true,
});
const actor = (roleName: string): PhaseActor => ({ userId: 'u1', userName: 'Usuario', roleName });

function row(id: string, status: ProformaRecord['status'] = 'En Revisión'): ProformaWithPhases {
  const phases = buildPhases(id, [tpl(1, 'Jefe'), tpl(2, 'Gerente')], (() => { let n = 0; return () => `${id}-ph${++n}`; })());
  return { proforma: { id, status } as ProformaRecord, phases };
}

describe('pendingForActor', () => {
  const first = row('a');
  const second: ProformaWithPhases = { ...row('b'), phases: approvePhase(row('b').phases, 'b-ph1', actor('Jefe'), null, NOW).phases };
  const done = row('c', 'Aprobado');

  it('cada rol solo ve las proformas que esperan su fase', () => {
    expect(pendingForActor([first, second, done], actor('Jefe')).map((r) => r.proforma.id)).toEqual(['a']);
    expect(pendingForActor([first, second, done], actor('Gerente')).map((r) => r.proforma.id)).toEqual(['b']);
  });

  it('una que el rol ya aprobó deja de aparecerle', () => {
    expect(pendingForActor([second], actor('Jefe'))).toEqual([]);
  });

  it('el superadministrador tampoco ve las ajenas en Por aprobar (las ve en Todas)', () => {
    expect(pendingForActor([first, second, done], actor('SuperAdministrador'))).toEqual([]);
  });

  it('sin usuario no hay pendientes', () => {
    expect(pendingForActor([first], null)).toEqual([]);
  });
});

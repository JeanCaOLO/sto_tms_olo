import { describe, expect, it } from 'vitest';
import {
  approvePhase, buildPhases, canApprove, groupByCarrier, nextProformaNumber, phaseLabel, proformaTotal,
  rejectPhase, skipPhase, toggleItem,
  type FlowPhaseTemplate, type PhaseActor, type ProformaItem,
} from '..';

const NOW = '2026-10-20T10:00:00Z';
const tpl = (position: number, over: Partial<FlowPhaseTemplate> = {}): FlowPhaseTemplate => ({
  id: `t${position}`, countryId: 'c1', position, name: `Fase ${position}`, approverType: 'role',
  roleName: 'Liquidador', userId: null, approverLabel: 'Liquidador', active: true, ...over,
});
const actor = (roleName: string, userId = 'u1'): PhaseActor => ({ userId, userName: `Usuario ${userId}`, roleName });
let seq = 0;
const make = (templates: FlowPhaseTemplate[]) => buildPhases('p1', templates, () => `ph${++seq}`);

describe('buildPhases', () => {
  it('copia solo las fases activas, en orden, renumeradas', () => {
    const phases = make([tpl(3, { roleName: 'C' }), tpl(1, { roleName: 'A' }), tpl(2, { active: false })]);
    expect(phases.map((p) => [p.position, p.roleName])).toEqual([[1, 'A'], [2, 'C']]);
    expect(phases.every((p) => p.state === 'pendiente')).toBe(true);
  });
});

describe('canApprove', () => {
  const phases = make([
    tpl(1, { roleName: 'Jefe' }),
    tpl(2, { approverType: 'user', roleName: null, userId: 'u9', approverLabel: 'Ana' }),
  ]);
  it('acepta a cualquier usuario del rol, sin distinguir mayúsculas', () => {
    expect(canApprove(actor('jefe'), phases[0]!, phases)).toBe(true);
  });
  it('rechaza a otro rol y a quien no es el turno', () => {
    expect(canApprove(actor('Liquidador'), phases[0]!, phases)).toBe(false);
    expect(canApprove(actor('Jefe', 'u9'), phases[1]!, phases)).toBe(false);
  });
  it('en fase de usuario específico solo ese usuario', () => {
    const after = approvePhase(phases, phases[0]!.id, actor('Jefe'), null, NOW).phases;
    expect(canApprove(actor('Jefe', 'u2'), after[1]!, after)).toBe(false);
    expect(canApprove(actor('Otro', 'u9'), after[1]!, after)).toBe(true);
  });
  it('el superadmin no aprueba por otros', () => {
    expect(canApprove(actor('SuperAdministrador'), phases[0]!, phases)).toBe(false);
  });
});

describe('approvePhase / rejectPhase', () => {
  it('pasa a Aprobado solo al aprobar la última fase', () => {
    const phases = make([tpl(1), tpl(2, { roleName: 'Gerente' })]);
    const first = approvePhase(phases, phases[0]!.id, actor('Liquidador'), null, NOW);
    expect(first.status).toBe('En Revisión');
    const second = approvePhase(first.phases, first.phases[1]!.id, actor('Gerente'), 'ok', NOW);
    expect(second.status).toBe('Aprobado');
    expect(second.phases[1]!.decidedBy).toBe('Usuario u1');
  });
  it('lanza si no es el turno', () => {
    const phases = make([tpl(1), tpl(2, { roleName: 'Gerente' })]);
    expect(() => approvePhase(phases, phases[1]!.id, actor('Gerente'), null, NOW)).toThrow(/turno/);
  });
  it('rechazar exige motivo y devuelve a Borrador', () => {
    const phases = make([tpl(1)]);
    expect(() => rejectPhase(phases, phases[0]!.id, actor('Liquidador'), ' ', NOW)).toThrow(/motivo/);
    const res = rejectPhase(phases, phases[0]!.id, actor('Liquidador'), 'montos mal', NOW);
    expect(res.status).toBe('Borrador');
    expect(res.phases[0]!.state).toBe('rechazada');
  });
});

describe('skipPhase', () => {
  it('solo superadmin, con motivo, sobre fases pendientes', () => {
    const phases = make([tpl(1), tpl(2, { roleName: 'Gerente' })]);
    expect(() => skipPhase(phases, phases[1]!.id, actor('Liquidador'), 'x', NOW)).toThrow(/superadministrador/);
    expect(() => skipPhase(phases, phases[1]!.id, actor('SuperAdministrador'), '', NOW)).toThrow(/motivo/);
    const res = skipPhase(phases, phases[1]!.id, actor('SuperAdministrador'), 'urgente', NOW);
    expect(res.phases[1]!.state).toBe('omitida');
    const done = approvePhase(res.phases, res.phases[0]!.id, actor('Liquidador'), null, NOW);
    expect(done.status).toBe('Aprobado');
  });
  it('no quita una fase ya decidida', () => {
    const phases = make([tpl(1)]);
    const done = approvePhase(phases, phases[0]!.id, actor('Liquidador'), null, NOW).phases;
    expect(() => skipPhase(done, done[0]!.id, actor('Admin'), 'x', NOW)).toThrow(/pendiente/);
  });
});

describe('phaseLabel', () => {
  it('indica fase, total sin omitidas y aprobador', () => {
    const phases = make([tpl(1), tpl(2, { roleName: 'Gerente', approverLabel: 'Gerente' }), tpl(3, { approverLabel: 'Contador' })]);
    const skipped = skipPhase(phases, phases[2]!.id, actor('Admin'), 'x', NOW).phases;
    const step = approvePhase(skipped, skipped[0]!.id, actor('Liquidador'), null, NOW);
    expect(phaseLabel(step.status, step.phases)).toBe('En revisión · Fase 2/2 – Gerente');
    expect(phaseLabel('Aprobado', step.phases)).toBe('Aprobado');
  });
});

describe('items y totales', () => {
  const items: ProformaItem[] = [
    { id: 'i1', proformaId: 'p1', settlementId: 's1', included: true, exclusionReason: null, amount: 0.1 },
    { id: 'i2', proformaId: 'p1', settlementId: 's2', included: true, exclusionReason: null, amount: 0.2 },
    { id: 'i3', proformaId: 'p1', settlementId: 's3', included: true, exclusionReason: null, amount: 10 },
  ];
  it('suma sin error de coma flotante y respeta exclusiones', () => {
    expect(proformaTotal(items.slice(0, 2))).toBe(0.3);
    const next = toggleItem(items, 's3', false, 'no cuadra');
    expect(proformaTotal(next)).toBe(0.3);
    expect(next[2]!.exclusionReason).toBe('no cuadra');
    expect(toggleItem(next, 's3', true, null)[2]!.exclusionReason).toBeNull();
  });
  it('excluir sin motivo lanza', () => {
    expect(() => toggleItem(items, 's1', false, '')).toThrow(/motivo/);
  });
});

describe('groupByCarrier', () => {
  const s = (id: string, carrierId: string | null, status = 'Borrador') =>
    ({ id, number: `LIQ-${id}`, carrierId, carrierName: carrierId?.toUpperCase() ?? null, totalAmount: 1, currency: 'VES', status });
  it('agrupa por transportista y omite las que no están en Borrador, ya agrupadas y sin transportista', () => {
    const groups = groupByCarrier(
      [s('a', 'x'), s('b', 'x'), s('c', 'y', 'Anulado'), s('d', null), s('e', 'x'), s('f', 'x', 'En Revisión'), s('g', 'x', 'Aprobado')],
      new Set(['e']),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.settlements.map((v) => v.id)).toEqual(['a', 'b']);
  });
});

describe('nextProformaNumber', () => {
  it('continúa la numeración por país', () => {
    expect(nextProformaNumber([], 'VE')).toBe('PRO-VE-001');
    expect(nextProformaNumber(['PRO-VE-009', 'PRO-0012'], 've')).toBe('PRO-VE-013');
  });
});

// Fases de aprobación del país: cuántas hay, en qué orden y quién aprueba cada una (un rol o un usuario).

import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import type { FlowPhaseDraft } from '../../../lib/tarifas/proformas';
import { EMPTY_DRAFT, move, useFlowEditor } from './useFlowEditor';

const FIELD = 'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

export default function FlowPhasesEditor({ countryId }: { countryId: string }) {
  const { drafts, setDrafts, roles, users, error, notice, saving, save } = useFlowEditor(countryId);
  const patch = (index: number, change: Partial<FlowPhaseDraft>) =>
    setDrafts((list) => list.map((d, i) => (i === index ? { ...d, ...change } : d)));

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Fases de aprobación</h2>
          <p className="text-sm text-slate-500">
            Toda proforma nueva de este país pasa por estas fases, una tras otra. En cada fase aprueba un usuario
            específico o cualquier usuario con el rol elegido. Un superadministrador puede quitar fases de una proforma puntual.
          </p>
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

        <ol className="space-y-2">
          {drafts.map((d, i) => (
            <li key={i} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[2rem_1.2fr_9rem_1.2fr_auto_auto]">
              <span className="text-sm font-semibold text-slate-500">{i + 1}</span>
              <input className={FIELD} placeholder="Nombre de la fase" aria-label={`Nombre de la fase ${i + 1}`} value={d.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <select className={FIELD} aria-label={`Tipo de aprobador ${i + 1}`} value={d.approverType} onChange={(e) => patch(i, { approverType: e.target.value as FlowPhaseDraft['approverType'] })}>
                <option value="role">Un rol</option>
                <option value="user">Un usuario</option>
              </select>
              {d.approverType === 'role' ? (
                <select className={FIELD} aria-label={`Rol de la fase ${i + 1}`} value={d.roleName ?? ''} onChange={(e) => patch(i, { roleName: e.target.value || null })}>
                  <option value="">Elige un rol…</option>
                  {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              ) : (
                <select className={FIELD} aria-label={`Usuario de la fase ${i + 1}`} value={d.userId ?? ''} onChange={(e) => patch(i, { userId: e.target.value || null })}>
                  <option value="">Elige un usuario…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={d.active} onChange={(e) => patch(i, { active: e.target.checked })} /> Activa
              </label>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" aria-label="Subir" disabled={i === 0} onClick={() => setDrafts((l) => move(l, i, i - 1))}><i className="ri-arrow-up-line" /></Button>
                <Button variant="ghost" size="sm" aria-label="Bajar" disabled={i === drafts.length - 1} onClick={() => setDrafts((l) => move(l, i, i + 1))}><i className="ri-arrow-down-line" /></Button>
                <Button variant="ghost" size="sm" aria-label="Quitar fase" onClick={() => setDrafts((l) => l.filter((_, j) => j !== i))}><i className="ri-delete-bin-line text-red-600" /></Button>
              </div>
            </li>
          ))}
        </ol>
        {drafts.length === 0 && <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Sin fases: no se podrán generar proformas en este país.</div>}

        <div className="flex justify-between">
          <Button variant="secondary" icon={<i className="ri-add-line" />} onClick={() => setDrafts((l) => [...l, { ...EMPTY_DRAFT }])}>Agregar fase</Button>
          <Button disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar fases'}</Button>
        </div>
      </div>
    </Card>
  );
}

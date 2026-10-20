import { useCallback, useEffect, useState } from 'react';
import { listRoles, listUsers, type AdminRole, type AdminUser } from '../../configuracion/admin/admin-api';
import { listFlowPhases, saveFlowPhases, type FlowPhaseDraft } from '../../../lib/tarifas/proformas';

export const EMPTY_DRAFT: FlowPhaseDraft = {
  name: '', approverType: 'role', roleName: null, userId: null, approverLabel: '', active: true,
};

/** Un borrador con el aprobador ya resuelto a su etiqueta legible (nombre del rol o del usuario). */
export function withApprover(draft: FlowPhaseDraft, roles: AdminRole[], users: AdminUser[]): FlowPhaseDraft {
  if (draft.approverType === 'role') return { ...draft, userId: null, approverLabel: draft.roleName ?? '' };
  const user = users.find((u) => u.id === draft.userId);
  return { ...draft, roleName: null, approverLabel: user?.full_name ?? draft.approverLabel };
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Carga la plantilla de fases del país junto con los roles y usuarios elegibles; guarda todo o nada. */
export function useFlowEditor(countryId: string) {
  const [drafts, setDrafts] = useState<FlowPhaseDraft[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [phases, roleList, userList] = await Promise.all([listFlowPhases(countryId), listRoles(), listUsers()]);
        if (cancelled) return;
        setDrafts(phases.map(({ id: _id, countryId: _c, position: _p, ...rest }) => rest));
        setRoles(roleList);
        setUsers(userList);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración (requiere rol administrador).');
      }
    })();
    return () => { cancelled = true; };
  }, [countryId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await saveFlowPhases(countryId, drafts.map((d) => withApprover(d, roles, users)));
    setSaving(false);
    if (result.error) setError(result.error);
    else setNotice('Fases guardadas. Las proformas nuevas las usarán; las ya creadas conservan las suyas.');
  }, [countryId, drafts, roles, users]);

  return { drafts, setDrafts, roles, users, error, notice, saving, save };
}

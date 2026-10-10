// Selector del rol de pruebas del modo mock: deja ver cómo se comporta el tarifador con un rol que solo
// liquida o que solo configura (botones deshabilitados y 403 del backend simulado). Solo se monta con
// `MOCK_AUTH_ENABLED`, que ya exige `import.meta.env.DEV`.

import { useEffect, useState } from 'react';
import { MOCK_ROLES, MOCK_ROLE_EVENT, getMockRole, setMockRole, type MockRole } from '../../lib/mock-auth';

export default function MockRoleSwitch() {
  const [role, setRole] = useState<MockRole>(getMockRole);
  useEffect(() => {
    const sync = () => setRole(getMockRole());
    window.addEventListener(MOCK_ROLE_EVENT, sync);
    return () => window.removeEventListener(MOCK_ROLE_EVENT, sync);
  }, []);

  return (
    <label
      className="fixed bottom-3 left-3 z-[60] flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow"
      title="Solo modo mock: cambia los permisos que ve la app y que aplica el backend simulado"
    >
      <span className="font-semibold">Rol de prueba</span>
      <select
        value={role}
        onChange={(e) => setMockRole(e.target.value as MockRole)}
        className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs"
        aria-label="Rol de prueba del modo mock"
      >
        {MOCK_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    </label>
  );
}

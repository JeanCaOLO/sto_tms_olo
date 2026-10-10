// Selector del rol de pruebas del modo mock: deja ver cómo se comporta el tarifador con un rol que solo
// liquida o que solo configura (botones deshabilitados y 403 del backend simulado). Se monta solo en las
// pantallas del tarifador (`TarifadorHints`) y solo con `MOCK_AUTH_ENABLED`, que ya exige `import.meta.env.DEV`.

import { useEffect, useState } from 'react';
import { MOCK_AUTH_ENABLED, MOCK_ROLE_EVENT, getMockRole, setMockRole, type MockRole } from '../../lib/mock-auth';

const OPTIONS: { id: MockRole; label: string; icon: string; hint: string }[] = [
  { id: 'admin', label: 'Administrador', icon: 'ri-shield-user-line', hint: 'Puede liquidar y configurar.' },
  { id: 'liquidar', label: 'Solo liquidar', icon: 'ri-calculator-line', hint: 'Emite liquidaciones y solo lee la configuración (el backend simulado responde 403 si escribe).' },
  { id: 'configurar', label: 'Solo configurar', icon: 'ri-settings-3-line', hint: 'Edita reglas, tarifarios y costos, pero no liquida (la bitácora responde 403).' },
];

export default function MockRoleSwitch() {
  const [role, setRole] = useState<MockRole>(getMockRole);
  useEffect(() => {
    const sync = () => setRole(getMockRole());
    window.addEventListener(MOCK_ROLE_EVENT, sync);
    return () => window.removeEventListener(MOCK_ROLE_EVENT, sync);
  }, []);
  if (!MOCK_AUTH_ENABLED) return null;

  return (
    <div
      role="group"
      aria-label="Rol de prueba del modo mock"
      className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 flex items-center gap-1 bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 print:hidden"
    >
      <span className="flex items-center gap-1.5 px-1.5 text-[11px] text-slate-500">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Mock</span>
        Rol
      </span>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setMockRole(o.id)}
          aria-pressed={role === o.id}
          title={o.hint}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
            role === o.id ? 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <i className={o.icon}></i>{o.label}
        </button>
      ))}
    </div>
  );
}

import type { Compania } from '../eflow-api';

// Selector de compañía cliente (FEBECA / SILLACA / COFERSA…). '' = todas. Al
// cambiar, filtra viajes y pedidos en todo el módulo.
interface Props {
  companias: Compania[];
  value: string;
  onChange: (id: string) => void;
}

export default function CompaniaSelector({ companias, value, onChange }: Props) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
      <i className="ri-building-2-line text-slate-400" aria-hidden="true"></i>
      <select
        aria-label="Compañía"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer"
      >
        <option value="">Todas las compañías</option>
        {companias.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  );
}

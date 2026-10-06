interface Props {
  value: string; // YYYY-MM-DD
  onChange: (fecha: string) => void;
  label: string;
}

// Selector de día del plan: reemplaza la fecha fija (hoy+1). Alimenta
// GET /pedidos?fecha_entrega= y el plan_date del POST /planes.
export default function DaySelector({ value, onChange, label }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
      />
    </label>
  );
}

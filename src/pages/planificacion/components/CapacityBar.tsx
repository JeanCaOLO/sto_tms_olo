const WARN_THRESHOLD = 80;
const MAX_THRESHOLD = 100;

const colorFor = (percent: number) => {
  if (percent >= MAX_THRESHOLD) return { text: 'text-red-600', bar: 'bg-red-500' };
  if (percent >= WARN_THRESHOLD) return { text: 'text-amber-600', bar: 'bg-amber-500' };
  return { text: 'text-teal-600', bar: 'bg-teal-500' };
};

interface Props {
  icon: string;
  label: string;
  value: number;
  max: number;
  unit: string;
  decimals?: number;
}

export default function CapacityBar({ icon, label, value, max, unit, decimals = 1 }: Props) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  const { text, bar } = colorFor(percent);

  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="text-slate-600 flex items-center gap-1.5">
          <i className={`${icon} text-slate-400`}></i>
          {label}
        </span>
        <span className={`font-semibold ${text}`}>
          {value.toFixed(decimals)} / {max} {unit} ({percent}%)
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all duration-300 ${bar}`} style={{ width: `${Math.min(percent, 100)}%` }}></div>
      </div>
      {percent >= MAX_THRESHOLD && (
        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <i className="ri-alert-line"></i>Sobrecarga de {label.toLowerCase()}
        </p>
      )}
    </div>
  );
}

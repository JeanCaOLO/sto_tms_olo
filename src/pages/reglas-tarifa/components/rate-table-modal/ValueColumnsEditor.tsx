import Input from '../../../../components/base/Input';

interface Props {
  text: string;
  error?: string;
  /** Columnas que el tarifario tiene guardadas (null en el alta). */
  savedColumns: string[] | null;
  current: string[];
  onChange: (text: string) => void;
}

/** Columnas de valor adicionales: varios importes por fila (flete, peaje…). */
export function ValueColumnsEditor({ text, error, savedColumns, current, onChange }: Props) {
  const removed = !!savedColumns && savedColumns.some((c) => !current.includes(c));
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Columnas de valor adicionales (opcional)</h3>
      <p className="text-xs text-slate-500">
        Por defecto cada fila trae un solo importe. Si la misma combinación da más de un valor
        (por ejemplo <em>flete</em> y <em>peaje</em>), escribí sus nombres separados por coma y
        cada regla elegirá cuál usa.
      </p>
      <Input
        label="Nombres de las columnas"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="flete, peaje"
        error={error}
      />
      {removed && (
        <p className="text-xs text-amber-700">
          <i className="ri-alert-line mr-1"></i>
          Quitaste una columna que ya existe: sus valores se borran de todas las filas.
        </p>
      )}
    </div>
  );
}

import { AmbosSwatch } from './DataMatrix';

// Leyenda visual de la matriz COFERSA. Cada swatch usa EXACTAMENTE el mismo
// glifo/figura que la celda de la tabla + su etiqueta, para que el color no
// sea el único canal (contraste AA + distinción por forma).
export default function MatrizLeyenda() {
  return (
    <ul
      role="list"
      aria-label="Leyenda de la matriz de rutas COFERSA"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600"
    >
      <li role="listitem" className="inline-flex items-center gap-1.5">
        <span className="text-green-600 font-bold" aria-hidden="true">✕</span>
        <span>Carga</span>
      </li>
      <li role="listitem" className="inline-flex items-center gap-1.5">
        <span className="text-red-600 font-bold" aria-hidden="true">✕</span>
        <span>Entrega</span>
      </li>
      <li role="listitem" className="inline-flex items-center gap-1.5">
        <AmbosSwatch />
        <span>Carga y entrega mismo día</span>
      </li>
      <li role="listitem" className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-3.5 h-3.5 rounded-full bg-violet-500 align-middle"
          aria-hidden="true"
        />
        <span>Cita previa</span>
      </li>
      <li role="listitem" className="inline-flex items-center gap-1.5">
        <span className="text-slate-300" aria-hidden="true">·</span>
        <span>Sin actividad</span>
      </li>
    </ul>
  );
}

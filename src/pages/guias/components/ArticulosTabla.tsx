import type { Articulo } from '../../planificacion/types';
import { fmtKg } from '../guia-model';

const DASH = '—';

// Tabla de artículos de un pedido. Se usa en pantalla (acordeón de la guía) y en
// el impreso. La columna Guía solo aparece si algún artículo la trae (en
// pre-despacho viene null → columna vacía = ruido, se omite).
export default function ArticulosTabla({ articulos }: { articulos: Articulo[] }) {
  if (articulos.length === 0) {
    return <p className="text-sm text-slate-400 print:text-black">Sin artículos</p>;
  }
  const hayGuia = articulos.some((a) => a.guia_fiscal);
  return (
    <table className="w-full text-sm print:text-black">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200 print:text-black print:border-black">
          <th className="py-1 pr-2 font-medium">Código</th>
          <th className="py-1 pr-2 font-medium">Producto</th>
          <th className="py-1 pr-2 font-medium text-right">Cant.</th>
          <th className="py-1 pr-2 font-medium text-right">Peso</th>
          {hayGuia && <th className="py-1 pl-2 font-medium">Guía</th>}
        </tr>
      </thead>
      <tbody>
        {articulos.map((a, i) => (
          <tr key={`${a.product_code}-${i}`} className="border-b border-slate-50 print:border-black/20">
            <td className="py-1 pr-2 font-mono text-xs text-slate-500 print:text-black">{a.product_code}</td>
            <td className="py-1 pr-2 text-slate-800 print:text-black">{a.product_name}</td>
            <td className="py-1 pr-2 text-right text-slate-600 print:text-black">{a.quantity}</td>
            <td className="py-1 pr-2 text-right text-slate-600 print:text-black">
              {fmtKg(a.weight)}
            </td>
            {hayGuia && <td className="py-1 pl-2 font-mono text-xs text-slate-500 print:text-black">{a.guia_fiscal || DASH}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

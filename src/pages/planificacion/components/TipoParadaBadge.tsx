interface Props {
  tipo?: 'entrega' | 'devolucion';
}

// Distintivo de parada de devolución (BR1.4: nunca solo color — lleva ícono
// + texto visible). El texto "Devolución" ES el nombre accesible: el <span>
// no lleva aria-hidden; solo el <i> decorativo lo lleva. Entrega / undefined
// no renderiza nada.
export default function TipoParadaBadge({ tipo }: Props) {
  if (tipo !== 'devolucion') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5">
      <i className="ri-arrow-go-back-line" aria-hidden="true"></i>Devolución
    </span>
  );
}

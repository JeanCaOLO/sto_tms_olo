interface Props {
  tipo?: 'entrega' | 'devolucion';
  isLive?: boolean;
}

// Distintivo de parada de devolución (BR1.4: nunca solo color — lleva ícono
// + texto visible). El texto ES el nombre accesible: el <span> no lleva
// aria-hidden; solo el <i> decorativo lo lleva. Entrega / undefined no
// renderiza nada.
//
// Devolución planificada: badge suave indigo. Devolución "en vivo" (al pie de
// camión): mismo color semántico pero relleno sólido + punto pulsante +
// texto "EN VIVO" — inconfundible sin inventar un 5.º matiz que choque con
// rojo (alerta) o ámbar (anclado).
export default function TipoParadaBadge({ tipo, isLive }: Props) {
  if (tipo !== 'devolucion') return null;
  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-xs font-semibold px-2 py-0.5">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
        </span>
        Devolución EN VIVO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5">
      <i className="ri-arrow-go-back-line" aria-hidden="true"></i>Devolución
    </span>
  );
}

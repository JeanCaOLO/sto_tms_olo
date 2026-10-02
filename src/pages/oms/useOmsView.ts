import { useEffect, useState } from 'react';

// Vista de lista compartida por las pantallas OMS (cola, auditoría):
// cards o tabla. El toggle solo aplica en mobile; en desktop es siempre tabla.
export type OmsView = 'cards' | 'table';

const MOBILE_QUERY = '(max-width: 639px)'; // < breakpoint sm de Tailwind

const matchesMobile = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches;

// `view` guarda la preferencia del usuario en mobile (default: cards).
// `effectiveView` es la que se renderiza: cards solo si es mobile y el usuario
// la eligió; en desktop siempre tabla (nadie queda atrapado en cards al agrandar).
export function useOmsView(defaultView: OmsView = 'cards') {
  const [view, setView] = useState<OmsView>(defaultView);
  const [isMobile, setIsMobile] = useState(matchesMobile);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const effectiveView: OmsView = isMobile ? view : 'table';
  return { view: effectiveView, setView };
}

// Descripciones al pasar el ratón (o enfocar con el teclado) sobre botones, campos, pestañas, columnas
// y secciones, SIN tocar cada componente: un solo oyente en la raíz busca el texto del elemento en un
// diccionario y, si hay descripción, muestra una burbuja.
//
// - Solo actúa dentro de su árbol (React propaga los eventos también por los portales, así que cubre
//   los modales). Fuera de él las pantallas se comportan como siempre.
// - Un elemento con `title` propio no recibe burbuja (el navegador ya muestra la suya).
// - Accesible: la burbuja es `role="tooltip"`, el elemento queda con `aria-describedby` mientras se
//   ve, aparece también con el foco y se cierra con Esc, al salir o al hacer clic.

import { createContext, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { buildHints, hintKey, type HintMap } from './hintKey';

const HintsContext = createContext<boolean>(false);

const HINTABLE = 'button, a[href], [role="tab"], select, input, textarea, th, label, summary, h1, h2, h3, h4, [data-hint]';
const SHOW_DELAY_MS = 350;
const HALF_WIDTH = 160; // mitad de `max-w-xs` (20 rem)
const MARGIN = 8;

function textOf(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Texto con el que se busca la descripción del elemento, o null si no hay manera de nombrarlo. */
function nameOf(el: HTMLElement): string | null {
  const explicit = el.getAttribute('data-hint');
  if (explicit) return explicit;
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const label = el.labels?.[0] ? textOf(el.labels[0]) : '';
    return label || el.getAttribute('placeholder');
  }
  return textOf(el) || null;
}

interface Shown { text: string; left: number; top: number; above: boolean }

export function HintProvider({ hints, children }: { hints: HintMap; children: ReactNode }) {
  const map = useMemo(() => buildHints(hints), [hints]);
  const id = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<number | null>(null);
  const target = useRef<HTMLElement | null>(null);

  const hide = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    target.current?.removeAttribute('aria-describedby');
    target.current = null;
    setShown(null);
  }, []);

  const show = useCallback((el: HTMLElement, delay: number) => {
    const name = nameOf(el);
    const text = name ? map[hintKey(name)] : undefined;
    if (!text || el.hasAttribute('title')) return;
    if (target.current === el) return;
    hide();
    const open = () => {
      const rect = el.getBoundingClientRect();
      const above = rect.bottom + 70 > window.innerHeight;
      target.current = el;
      el.setAttribute('aria-describedby', id);
      setShown({
        text,
        above,
        // El cuadro mide hasta 20 rem: se centra sobre el elemento sin salirse de la pantalla.
        left: Math.max(MARGIN + HALF_WIDTH, Math.min(rect.left + rect.width / 2, window.innerWidth - MARGIN - HALF_WIDTH)),
        top: above ? rect.top - 6 : rect.bottom + 6,
      });
    };
    if (delay === 0) open();
    else timer.current = window.setTimeout(open, delay);
  }, [map, hide, id]);

  useEffect(() => hide, [hide]);
  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', hide, true); };
  }, [shown, hide]);

  const hintable = (node: EventTarget | null) => (node as HTMLElement | null)?.closest?.(HINTABLE) as HTMLElement | null;

  return (
    <HintsContext.Provider value>
      <div
        className="contents"
        onMouseOver={(e) => { const el = hintable(e.target); if (el) show(el, SHOW_DELAY_MS); }}
        onMouseOut={(e) => {
          const el = hintable(e.target);
          if (el && !el.contains(e.relatedTarget as Node | null)) hide();
        }}
        onFocus={(e) => { const el = hintable(e.target); if (el) show(el, 0); }}
        onBlur={hide}
        onMouseDown={hide}
      >
        {children}
      </div>
      {shown && createPortal(
        <div
          id={id}
          role="tooltip"
          style={{ position: 'fixed', width: 'max-content', left: shown.left, top: shown.top, transform: `translate(-50%, ${shown.above ? '-100%' : '0'})` }}
          className="z-[70] max-w-xs pointer-events-none rounded-md bg-slate-900 px-2.5 py-1.5 text-xs leading-snug text-white shadow-lg"
        >
          {shown.text}
        </div>,
        document.body,
      )}
    </HintsContext.Provider>
  );
}

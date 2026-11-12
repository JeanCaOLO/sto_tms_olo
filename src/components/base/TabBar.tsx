import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { panelId, tabId } from './tabPanelProps';

export interface TabItem<T extends string> {
  key: T;
  label: ReactNode;
  /** Clase de ícono (remixicon) que va antes del texto. */
  icon?: string;
}

interface TabBarProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Nombre de la lista de pestañas para el lector de pantalla. */
  ariaLabel: string;
  /** Prefijo de los ids; el panel debe usar `tabPanelProps` con el mismo. */
  idBase: string;
  /** Clase de cada pestaña según esté activa; el contenedor lo define `className`. */
  tabClassName: (active: boolean) => string;
  className?: string;
}

/**
 * Barra de pestañas accesible: `tablist`/`tab`/`aria-selected`, solo la activa entra en el orden de Tab y las flechas,
 * Inicio y Fin pasan de una a otra (patrón WAI-ARIA de pestañas con activación automática).
 */
export default function TabBar<T extends string>({ tabs, value, onChange, ariaLabel, idBase, tabClassName, className }: TabBarProps<T>) {
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const go = (key: T) => {
    onChange(key);
    refs.current.get(key)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
        : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
          : event.key === 'Home' ? 0
            : event.key === 'End' ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    go(tabs[target].key);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={className}>
      {tabs.map((tab, index) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => { if (el) refs.current.set(tab.key, el); else refs.current.delete(tab.key); }}
            type="button"
            role="tab"
            id={tabId(idBase, tab.key)}
            aria-selected={active}
            aria-controls={panelId(idBase, tab.key)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={tabClassName(active)}
          >
            {tab.icon && <i className={`${tab.icon} mr-1`}></i>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

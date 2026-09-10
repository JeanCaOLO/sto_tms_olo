import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

// Estado compartido del colapso del sidebar, para que el layout (main, header)
// reaccione al ancho del sidebar y no quede espacio muerto al cerrarlo.
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed((c) => !c);
  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar debe usarse dentro de SidebarProvider');
  return ctx;
}

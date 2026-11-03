export const tabId = (idBase: string, key: string) => `${idBase}-tab-${key}`;
export const panelId = (idBase: string, key: string) => `${idBase}-panel-${key}`;

/** Atributos del contenedor del contenido de la pestaña activa: lo enlaza con su pestaña (`TabBar` con el mismo `idBase`). */
export function tabPanelProps(idBase: string, key: string) {
  return { role: 'tabpanel' as const, id: panelId(idBase, key), 'aria-labelledby': tabId(idBase, key) };
}

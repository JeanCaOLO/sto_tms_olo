// A dónde entra una persona al abrir "/": al Dashboard si lo puede ver; si no (p. ej. el rol Devoluciones, que solo ve su
// módulo), al primer módulo del menú que sí puede ver. Sin ninguno cae en /dashboard, donde la guarda muestra "sin acceso".
import { isGroup, isSection, navItems, type MenuItem, type NavItem } from '../components/feature/sidebar-nav-items';

export const DEFAULT_LANDING = '/dashboard';

function* menuItems(items: NavItem[]): Generator<MenuItem> {
  for (const item of items) {
    if (isSection(item)) continue;
    if (isGroup(item)) yield* item.children;
    else yield item;
  }
}

export function landingPath(canView: (permKey: string) => boolean, items: NavItem[] = navItems): string {
  if (canView('dashboard')) return DEFAULT_LANDING;
  for (const item of menuItems(items)) {
    if (item.permKey && !item.comingSoon && canView(item.permKey)) return item.path;
  }
  return DEFAULT_LANDING;
}

import { isGroup, isSection, navItems } from './sidebar-nav-items';

// path exacto -> permKey del módulo, derivado de navItems (una sola fuente).
// Lo comparten RouteGuard (gating + evento view) y DataTable (evento export).
const permByPath = new Map<string, string>();
for (const item of navItems) {
  if (isSection(item)) continue;
  if (isGroup(item)) {
    for (const child of item.children) {
      if (child.permKey) permByPath.set(child.path, child.permKey);
    }
  } else if (item.permKey) {
    permByPath.set(item.path, item.permKey);
  }
}

export function permKeyForPath(pathname: string): string | undefined {
  // react-router acepta '/liquidaciones/' y mayúsculas: sin normalizar, esas variantes no tendrían
  // permKey y se saltarían la guarda.
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return permByPath.get(pathname) ?? permByPath.get(normalized);
}

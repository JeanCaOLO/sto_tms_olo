// Armado del correo de la proforma: plantilla con variables, destinatarios sin repetir y enlace de Gmail.

export interface TemplateVars {
  number: string;
  carrier: string;
  total: string;
}

/** Reemplaza {number}, {carrier} y {total}. Una variable desconocida queda tal cual, para que se note. */
export function fillTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(number|carrier|total)\}/g, (_, key: keyof TemplateVars) => vars[key]);
}

/** Destinatarios fijos del país + el correo del transportista (si se pidió), sin repetir y sin vacíos. */
export function buildRecipients(fixed: string[], includeCarrier: boolean, carrierEmail: string | null): string[] {
  const all = [...(includeCarrier && carrierEmail ? [carrierEmail] : []), ...fixed];
  const seen = new Set<string>();
  return all.map((e) => e.trim()).filter((e) => {
    const key = e.toLowerCase();
    if (!e || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface ComposeInput {
  to: string[];
  subject: string;
  body: string;
}

/** Abre Gmail con el correo ya armado. Gmail web no admite adjuntos por enlace: el PDF se adjunta a mano. */
export function gmailComposeUrl({ to, subject, body }: ComposeInput): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: to.join(','), su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

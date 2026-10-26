// Borrador de correo (.eml) con el PDF ya adjunto. Gmail web no admite adjuntos por enlace; un .eml
// sí: Outlook, Mail y otros clientes lo abren como borrador con Para, Asunto, Mensaje y el PDF puestos.
// `X-Unsent: 1` hace que se abra para editar y enviar, no como un correo recibido. Función pura.

const CRLF = '\r\n';
const LINE = 76;
const SUBJECT_CHUNK_BYTES = 36; // cada "encoded-word" (RFC 2047) debe caber en 75 caracteres

export interface EmlInput {
  to: string[];
  subject: string;
  body: string;
  attachment: { fileName: string; base64: string };
  /** Solo para pruebas: fija el límite entre partes. */
  boundary?: string;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function wrap(base64: string): string {
  return (base64.match(new RegExp(`.{1,${LINE}}`, 'g')) ?? []).join(CRLF);
}

/** Asunto con tildes o símbolos: palabras codificadas UTF-8, sin cortar un carácter por la mitad. */
export function encodeSubject(subject: string): string {
  const clean = subject.replace(/[\r\n]+/g, ' ').trim();
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words: string[] = [];
  let current = '';
  for (const ch of clean) {
    if (new TextEncoder().encode(current + ch).length > SUBJECT_CHUNK_BYTES) {
      words.push(current);
      current = '';
    }
    current += ch;
  }
  if (current) words.push(current);
  return words.map((w) => `=?UTF-8?B?${toBase64(w)}?=`).join(`${CRLF} `);
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_') || 'proforma.pdf';
}

export function buildEml({ to, subject, body, attachment, boundary = `----=_tms_${Date.now().toString(36)}` }: EmlInput): string {
  const name = safeFileName(attachment.fileName);
  return [
    `To: ${to.join(', ')}`,
    `Subject: ${encodeSubject(subject)}`,
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(toBase64(body)),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${name}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${name}"`,
    '',
    wrap(attachment.base64),
    `--${boundary}--`,
    '',
  ].join(CRLF);
}

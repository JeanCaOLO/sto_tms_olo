// verificadores/seguridad.js — baseline R1-R7 + perimetro segun exposicion
import { leerTextoSeguro, esArchivoSensible } from '../lib/fs-scan.js'

const PAT_SECRETO_ASIGNADO = /(secret|password|passwd|api[_-]?key|token|access[_-]?key|private[_-]?key)\s*[:=]\s*["'][^"'\s<>${}]{8,}["']/i
const PAT_PLACEHOLDER = /(<[^>]+>|example|placeholder|cambiar|changeme|xxx+|\*\*\*|process\.env|os\.environ|\$\{)/i
const PAT_AWS_KEY = /AKIA[0-9A-Z]{16}/

// exposicion: 'publica' | 'corporativa' | 'desconocida'
export function verificarSeguridad (raiz, ingesta, def, exposicion = 'desconocida') {
  const h = []
  const archivos = ingesta._archivos
  const push = (id, estado, evidencia, recomendacion, criticidadOverride) => {
    const d = def.estandares.find(e => e.id === id) || def.perimetro_publico?.find(e => e.id === id) || {}
    h.push({ id, categoria: 'seguridad', nombre: d.nombre, estado, criticidad: criticidadOverride || d.criticidad, hard_stop: d.hard_stop, evidencia, recomendacion })
  }

  const fuentesCodigo = archivos.filter(f => /\.(js|mjs|cjs|ts|tsx|jsx|py|json|yaml|yml|env|toml)$/i.test(f) && !esArchivoSensible(f))
  const leerTodo = () => fuentesCodigo.map(f => ({ f, c: leerTextoSeguro(raiz, f) || '' }))
  const cuerpos = leerTodo()

  // R1 — sin secretos embebidos
  const hallazgosSecretos = []
  for (const { f, c } of cuerpos) {
    if (/\.env\.example$/i.test(f) || /example/i.test(f)) continue
    const lineas = c.split(/\r?\n/)
    for (let i = 0; i < lineas.length; i++) {
      const ln = lineas[i]
      if (PAT_AWS_KEY.test(ln)) { hallazgosSecretos.push(`${f}:${i + 1} (posible AWS key)`); continue }
      if (PAT_SECRETO_ASIGNADO.test(ln) && !PAT_PLACEHOLDER.test(ln)) hallazgosSecretos.push(`${f}:${i + 1}`)
    }
    if (hallazgosSecretos.length >= 5) break
  }
  if (hallazgosSecretos.length > 0) push('R1', 'no-cumplido', `Posibles secretos embebidos: ${hallazgosSecretos.slice(0, 5).join('; ')}.`, 'Mover secretos a Secrets Manager/SSM o variables de entorno; nunca en codigo.')
  else {
    const notaAmplify = (ingesta.artefactos.amplify || []).length > 0
      ? ' Las variables de entorno del frontend Amplify se configuran en la consola: su manejo de secretos se audita alli, no en el repositorio.'
      : ''
    push('R1', 'cumplido', `No se detectan secretos embebidos (placeholders y env vars no cuentan).${notaAmplify}`, notaAmplify ? 'Verificar en la consola de AWS Amplify que las variables de entorno y secretos del frontend no queden expuestos.' : '-')
  }

  // R2 — SQL parametrizado
  const patConcatSql = /(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b[^;]*(\+\s*\w+|\$\{|%\s*\(|['"]\s*\+)/i
  const usaQueryBuilder = /knex|sequelize|typeorm|prisma|sqlalchemy|psycopg2|\.query\(\s*[`'"][^`'"]*\$\d/i
  let concatEncontrada = null, usaBuilder = false
  for (const { f, c } of cuerpos.filter(x => /\.(js|mjs|cjs|ts|py)$/i.test(x.f))) {
    if (usaQueryBuilder.test(c)) usaBuilder = true
    if (patConcatSql.test(c) && !concatEncontrada) concatEncontrada = f
  }
  if (concatEncontrada && !usaBuilder) push('R2', 'no-cumplido', `Posible concatenacion de SQL en ${concatEncontrada}.`, 'Usar consultas parametrizadas o query builder; nunca concatenar entrada de usuario.')
  else if (usaBuilder) push('R2', 'cumplido', 'Se usa query builder / consultas parametrizadas (knex/sequelize/orm/placeholders).', '-')
  else push('R2', 'no-verificable', 'No se detectan consultas SQL directas para evaluar.', 'Revisar manualmente el acceso a datos.')

  // R3 — auth de endpoints
  let authNone = null
  for (const f of ingesta.artefactos.template_sam) {
    const c = leerTextoSeguro(raiz, f) || ''
    if (/AuthorizationType:\s*NONE/i.test(c)) authNone = f
  }
  const usaAuthMw = cuerpos.some(({ c }) => /requiereAuth|requireAuth|authenticate|jwt\.verify|passport|@login_required|Authorizer|cognito/i.test(c))
  if (authNone) push('R3', 'no-cumplido', `AuthorizationType: NONE en endpoints (${authNone}).`, 'Prohibido AuthorizationType: NONE en endpoints protegidos.')
  else if (usaAuthMw) push('R3', 'cumplido', 'Se detecta middleware/authorizer de autenticacion (JWT/Cognito/login).', exposicion === 'publica' ? 'App publica: verificar ademas aislamiento por tenant/IDOR (revision manual/pentest).' : 'Aislamiento por tenant/IDOR y authZ fina quedan diferidos al piloto.')
  else push('R3', 'no-verificable', 'No se detecta esquema de autenticacion; requiere revision manual.', 'Confirmar que los endpoints protegidos exigen autenticacion.')

  // R4 — IAM sin comodines
  let comodinIam = null
  for (const f of archivos.filter(x => /\.(json|yaml|yml)$/i.test(x))) {
    const c = leerTextoSeguro(raiz, f) || ''
    if (/["']?(Action|Resource)["']?\s*:\s*["']\*["']/i.test(c)) { comodinIam = f; break }
  }
  if (comodinIam) push('R4', 'no-cumplido', `Comodin IAM (Action/Resource: *) en ${comodinIam}.`, 'Usar acciones y ARNs concretos.')
  else push('R4', 'cumplido', 'No se detectan comodines IAM en politicas.', '-')

  // R5 — SAST + dependencias en CI
  const senalesAmplify = ingesta.artefactos.amplify || []
  const tieneAmplify = senalesAmplify.length > 0
  let ciSeguridad = false
  for (const f of ingesta.artefactos.gitlab_ci) {
    const c = leerTextoSeguro(raiz, f) || ''
    if (/sast|dependency[_-]?scanning|secret[_-]?detection|trivy|snyk|npm audit|safety|bandit|semgrep/i.test(c)) ciSeguridad = true
  }
  if (ingesta.artefactos.gitlab_ci.length === 0) {
    if (tieneAmplify) {
      // Sin pipeline en el repositorio pero con AWS Amplify: el build/deploy del
      // frontend vive en la consola de Amplify. No se bloquea el dictamen (no es
      // hard_stop aqui): se difiere a verificacion en consola y se advierte.
      push('R5', 'diferido-piloto', `No hay pipeline en el repositorio, pero se detecta AWS Amplify (${senalesAmplify.join(', ')}). El build/deploy del frontend lo gestiona Amplify.`, 'Verificar en los build settings de AWS Amplify (o en un pipeline del backend) la presencia de SAST, escaneo de dependencias/CVE y secret-scan.')
    } else {
      push('R5', 'no-cumplido', 'No hay pipeline CI donde correr SAST/escaneo de dependencias.', 'Agregar pipeline con SAST + escaneo de dependencias/CVE + secret-scan.')
    }
  } else if (ciSeguridad) push('R5', 'cumplido', 'El pipeline incluye etapas de seguridad (SAST/dependencias/secret-scan).', '-')
  else push('R5', 'no-cumplido', 'El pipeline CI no incluye SAST ni escaneo de dependencias.', 'Agregar SAST + escaneo de dependencias/CVE + secret-scan al pipeline.')

  // R6 — CORS estricto y headers. En app publica, un CORS abierto sube a Critico.
  let corsAbierto = null, sinCsp = null, tieneHelmet = false
  for (const { f, c } of cuerpos.filter(x => /\.(js|mjs|cjs|ts|py)$/i.test(x.f))) {
    if (/cors\(\s*\{[^}]*origin\s*:\s*true|cors\(\s*\{[^}]*origin\s*:\s*["']\*["']|Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/i.test(c)) corsAbierto = f
    if (/helmet\(/i.test(c)) tieneHelmet = true
    if (/contentSecurityPolicy\s*:\s*false/i.test(c)) sinCsp = f
  }
  const critR6 = exposicion === 'publica' ? 'Critico' : 'Alto'
  if (corsAbierto || sinCsp) {
    const probs = [corsAbierto ? `CORS abierto en ${corsAbierto}` : null, sinCsp ? `CSP desactivada en ${sinCsp}` : null].filter(Boolean).join('; ')
    const extra = exposicion === 'publica' ? ' [CRITICO por exposicion publica]' : ''
    push('R6', 'no-cumplido', probs + extra, 'CORS estricto por lista de dominios (jamas reflejar cualquiera con credentials); habilitar CSP.', critR6)
  } else if (tieneHelmet) {
    push('R6', 'cumplido', 'Headers de seguridad via Helmet y CORS sin reflejo abierto detectado.', exposicion === 'publica' ? 'App publica: validar CSP/HSTS efectivos y CORS por lista.' : 'CORS/WAF de perimetro completos quedan diferidos al piloto.')
  } else {
    push('R6', 'no-verificable', 'No se detecta configuracion de CORS/headers; requiere revision manual.', 'Configurar CORS estricto y headers de seguridad (CSP, HSTS).')
  }

  // R7 — logs sin PII
  let logPii = null
  for (const { f, c } of cuerpos.filter(x => /\.(js|mjs|cjs|ts|py)$/i.test(x.f))) {
    if (/(console\.(log|info|debug)|print|logger\.\w+)\s*\([^)]*(password|secret|token|salario|costo)/i.test(c)) { logPii = f; break }
  }
  if (logPii) push('R7', 'no-cumplido', `Posible log de datos sensibles en ${logPii}.`, 'No registrar secretos ni PII (costos/salarios/personal) en logs.')
  else push('R7', 'cumplido', 'No se detectan logs de secretos ni PII evidentes.', '-')

  // ── Perimetro segun exposicion ──────────────────────────────
  // IMPORTANTE: solo IaC/codigo real (no documentacion .md, que menciona controles como "recomendados").
  const infraTexto = [...ingesta.artefactos.template_sam, ...ingesta.artefactos.dockerfile].map(f => leerTextoSeguro(raiz, f) || '').join('\n')
  const codigoTexto = cuerpos.filter(x => /\.(js|mjs|cjs|ts|tsx|jsx|py)$/i.test(x.f)).map(x => x.c).join('\n')

  if (exposicion === 'publica') {
    // P1 — WAF: solo cuenta si esta declarado en IaC real
    const tieneWaf = /AWS::WAFv2|AWS::WAF::|WebACLId|WebACLArn|associate[-_]?web[-_]?acl/i.test(infraTexto)
    if (tieneWaf) {
      push('P1', 'cumplido', 'WAF/WebACL declarado en IaC.', 'App publica: activar WAF (OWASP Managed Rules + rate limiting) en el borde.')
    } else if (tieneAmplify) {
      // El WAF del frontend Amplify se integra desde la consola de Amplify, no en
      // IaC del repositorio. No se marca como amenaza ni bloqueo: se difiere y se advierte.
      push('P1', 'diferido-piloto', `App publica sin WAF en IaC, pero se detecta AWS Amplify (${senalesAmplify.join(', ')}). El WAF del frontend se integra desde Amplify.`, 'Verificar en la consola de AWS Amplify que el WAF del frontend este activo (OWASP Managed Rules + rate limiting).')
    } else {
      push('P1', 'no-cumplido', 'App publica sin WAF declarado en IaC (menciones en documentacion no cuentan).', 'App publica: activar WAF (OWASP Managed Rules + rate limiting) en el borde.')
    }

    // P2 — HTTPS/TLS + cookie secure. La cookie insegura manda (evidencia real de codigo).
    const cookieInsegura = /COOKIE_SECURE\s*[:=]\s*['"]?false|(?:cookie[^;]*)?secure\s*:\s*false/i.test(codigoTexto) ||
      /COOKIE_SECURE\s*=\s*false/i.test(infraTexto)
    const tlsEnIac = /Certificate(Arn)?|AWS::CertificateManager|ACM|Protocol:\s*HTTPS|Port:\s*443|listener.*443/i.test(infraTexto)
    if (cookieInsegura) push('P2', 'no-cumplido', 'Cookies con secure=false (COOKIE_SECURE=false) en app que sera publica.', 'App publica: forzar HTTPS/TLS (ALB+ACM) y cookies secure=true.', 'Critico')
    else if (tlsEnIac) push('P2', 'cumplido', 'Terminacion TLS/HTTPS declarada en IaC (Certificate/ACM/HTTPS/443).', '-', 'Critico')
    else if (tieneAmplify) {
      // Hosting/TLS/dominio del frontend gestionados por Amplify Hosting (SSL/TLS y
      // distribucion viven en la consola). Se difiere a verificacion en consola.
      push('P2', 'diferido-piloto', `No se detecta TLS/HTTPS en IaC, pero se detecta AWS Amplify (${senalesAmplify.join(', ')}). El hosting, el certificado SSL/TLS y el dominio del frontend los gestiona Amplify.`, 'Verificar en la consola de AWS Amplify el certificado SSL/TLS, el dominio y el redireccionamiento HTTPS del frontend.', 'Critico')
    } else push('P2', 'no-cumplido', 'No se detecta terminacion TLS/HTTPS en IaC para una app que sera publica.', 'App publica: forzar HTTPS (ALB+ACM) y cookies secure=true.', 'Critico')

    // P3 — CORS lista de dominios
    if (corsAbierto) push('P3', 'no-cumplido', `CORS refleja cualquier origen (${corsAbierto}) en app publica.`, 'App publica: CORS por lista blanca de dominios; jamas reflejar cualquiera con credentials.', 'Critico')
    else push('P3', 'cumplido', 'No se detecta CORS que refleje cualquier origen.', 'Confirmar lista blanca de dominios en runtime.', 'Critico')

    // P4 — IdP gestionado / MFA: solo cuenta si esta usado en codigo/IaC real
    const tieneIdp = /cognito|CognitoUserPool|oidc|openid|passport-saml|auth0|okta|\bmfa\b|multi[-_]?factor/i.test(codigoTexto + infraTexto)
    if (tieneIdp) {
      push('P4', 'cumplido', 'IdP gestionado / MFA usado en codigo o IaC.', 'App publica: usar IdP gestionado con MFA para el acceso externo (menciones en documentacion no cuentan).', 'Alto')
    } else if (tieneAmplify) {
      // La autenticacion del frontend puede estar gestionada por Amplify Auth (Cognito)
      // sin dejar rastro directo en el codigo auditado. Se difiere a verificacion en consola.
      push('P4', 'diferido-piloto', `No se detecta IdP gestionado en codigo/IaC, pero se detecta AWS Amplify (${senalesAmplify.join(', ')}). Amplify Auth puede gestionar la identidad (Cognito) desde la consola.`, 'Verificar en la consola de AWS Amplify si Amplify Auth/Cognito y MFA cubren el acceso externo del frontend.', 'Alto')
    } else {
      push('P4', 'no-cumplido', 'No se usa IdP gestionado (Cognito/OIDC) ni MFA; el login es propio (email+password).', 'App publica: usar IdP gestionado con MFA para el acceso externo (menciones en documentacion no cuentan).', 'Alto')
    }
  } else if (exposicion === 'corporativa') {
    push('P1', 'na-justificado', 'Exposicion corporativa (interna): WAF de borde no exigible.', 'Si cambia a publica, activar WAF.')
    push('P2', 'na-justificado', 'Exposicion corporativa: TLS igual recomendado, pero perimetro publico no aplica.', 'Mantener HTTPS interno cuando sea posible.')
    push('P3', 'na-justificado', 'Exposicion corporativa: CORS de perimetro publico no aplica.', 'Aun asi, evitar CORS abierto.')
    push('P4', 'na-justificado', 'Exposicion corporativa: IdP publico/MFA externo no exigible.', 'La identidad corporativa (SSO) puede cubrir el acceso.')
  } else {
    // desconocida: se difieren al piloto (no penalizan) pero se listan
    for (const p of (def.perimetro_publico || [])) {
      push(p.id, 'diferido-piloto', 'Exposicion no declarada: control de perimetro diferido al piloto. Declarar --exposicion publica|corporativa.', 'Declarar el perfil de exposicion para evaluar el perimetro.')
    }
  }

  return h
}
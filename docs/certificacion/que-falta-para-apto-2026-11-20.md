# TMS-Backend: qué falta para salir Apto

> Certificación Intelix de QA del 2026-11-20, sobre GitLab `main` (1bfd6e1).
> Resultado actual: **No apto, 65 %**. Si se resuelve P2: **95 %, Apto**.

## En corto

Todo lo que dependía del código ya está resuelto. El único bloqueo es **P2: HTTPS con certificado y dominio
propios**. Depende de la infraestructura de Intelix, no del equipo de desarrollo.

## Lo que falta

| # | Control | Qué pide el motor | ¿Bloquea? | A cargo de |
|---|---|---|---|---|
| 1 | **P2 · HTTPS/TLS** | Un dominio propio con certificado declarado en la infraestructura (p. ej. `api-qa.tms.intelix.biz`) | **Sí** | DevOps Intelix |
| 2 | P1 · WAF | Un firewall de aplicación con reglas OWASP y límite de peticiones | No | DevOps Intelix |
| 3 | R2 · SQL | Nada real: es un falso positivo del motor | No | Quien mantiene el motor |

## Por qué no es responsabilidad del equipo de desarrollo

- **P2 (HTTPS).** La API ya responde solo por HTTPS: AWS no permite HTTP en este tipo de API. Lo que el motor exige
  es un **dominio propio con su certificado**. El dominio, el DNS y el certificado se crean en la cuenta AWS de
  Intelix, a la que no tenemos acceso, y los despliegues los hace solo Intelix. Con el dominio y el ARN del certificado
  de cada ambiente, nosotros los declaramos en los templates.
- **P1 (WAF).** El firewall se crea y se paga en la cuenta de Intelix, y define reglas de seguridad perimetral de la
  empresa. Además, este tipo de API no admite WAF directo: hay que poner CloudFront delante, que es una decisión de
  arquitectura de infraestructura.
- **R2.** El motor cree ver SQL armado concatenando texto en `alerts_mailer.py`, que no tiene SQL. Todo el backend
  usa consultas parametrizadas (`%s`). El motor solo reconoce algunas librerías y no reconoce la que usamos (pg8000).
  Se reporta a quien mantiene `template_base`.

## Ya resuelto por el equipo de desarrollo (19 y 20 de noviembre)

- HSTS y cabeceras de seguridad en todas las respuestas (P2b).
- Sin secretos escritos en el código ni en los tests (R1).
- Permiso de envío de correo limitado a una sola identidad (R4).
- Los logs no registran el detalle de un token rechazado (R7).
- El JWT exige emisor y destinatario (C12).
- Cobertura de tests de 85,6 %, con un mínimo de 80 % en el CI (COD6).
- CORS sin `*` por defecto en todos los stacks.

## Aparte, también de DevOps Intelix (no afecta la nota)

El runner de GitLab no tiene `pip`, así que todos los pipelines fallan en el primer paso. No corren lint, tests ni
seguridad, y el pipeline no despliega. Hay que instalar Python/pip en el runner o usar un runner con Docker.

## Pedido a DevOps Intelix

1. Dominio y certificado ACM por ambiente (qa y prod) para la API del TMS.
2. WAF con reglas OWASP y límite de peticiones (CloudFront delante de la API).
3. Runner de CI con Python/pip.

Informe completo: `intelix/certificacion/salida/qa-backend-2026-11-20/certificacion-TMS-Backend-2026-11-20.pdf`.

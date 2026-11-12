# Guía de optimización de Kiro IDE

> Cruzando documentación oficial (kiro.dev/docs) con issues reales de kirodotdev/Kiro en GitHub. Cada punto cita su fuente para que puedas verificarlo o volver a buscarlo si cambia.

## 1. Entendé qué carga Kiro por defecto antes de optimizar

Kiro incluye automáticamente tu directorio de trabajo y tu sistema operativo como contexto en cada sesión — no se configura, ya está. Lo que sí controlás es todo lo demás: steering, `.kiroignore`, MCP/Powers, y qué referenciás con `#` en el chat.
*(Fuente: [Context management](https://kiro.dev/docs/cli/chat/context/))*

**Paso 1 — Usá los context providers específicos en vez de dejar que Kiro adivine.** En el chat de IDE, `#` te da acceso a proveedores concretos: `#file`, `#folder`, `#codebase`, `#terminal`, `#git diff`, `#problems`, `#steering:archivo.md`, `#spec:nombre`, `#mcp:servidor`. Pedir `#auth.ts explicá esto` es más barato en tokens y más preciso que `#codebase` genérico cuando ya sabés qué archivo te interesa.
*(Fuente: [Chat - IDE](https://kiro.dev/docs/ide/chat/), tabla "Context providers")*

## 2. Steering: la base de tu costo de contexto en cada sesión

**Paso 2 — Nunca uses `inclusion: always` salvo lo verdaderamente esencial.** Los tres modos alternativos existen justamente para no pagar el costo de un archivo en cada interacción:
- `fileMatch` — se carga solo cuando el archivo activo matchea un patrón (bueno para reglas de una capa específica, como convenciones de la capa de datos).
- `manual` — se carga solo cuando vos lo invocás con `/` o `#steering:archivo.md`.
- `auto` — Kiro decide según si tu pedido coincide con una `description` que vos escribís, igual que una Agent Skill. También queda disponible como slash command.

**Paso 3 — Mantené los steering cortos y densos.** Si un doc de steering supera ~150 líneas, probablemente tiene prosa de más. Esto no es solo estilo: cada línea de un steering `always`/`auto` activo se paga en tokens en cada mensaje de la sesión.

**Paso 4 — Un steering por repo, no uno centralizado en un workspace multi-root.** Kiro tiene un gap documentado: la generación estándar de steering solo cubre el primer folder en un workspace multi-root ([issue #195](https://github.com/kirodotdev/Kiro/issues/195)). Si se trabaja con varios repos a la vez, hace falta generar steering repo por repo explícitamente. Un Power dedicado a generar steering por repo resuelve este caso.

*(Fuente: [Steering](https://kiro.dev/docs/steering/))*

## 3. `.kiroignore`: protegé contexto Y tokens, pero activalo bien

**Paso 5 — Agregá `.kiroignore` al setting `kiroAgent.agentIgnoreFiles`.** Es el error más común: `.kiroignore` **no se aplica por default** — hay que agregarlo manualmente en `Ctrl+,`/`Cmd+,` → *Agent Ignore Files*. Sin ese paso, el archivo existe pero no filtra nada — ni protege secretos ni ahorra tokens de lectura.

**Paso 6 — Test de humo después de configurarlo.** Pedile a Kiro que muestre un archivo que debería estar ignorado (ej. un `.env`). Si lo muestra, el setting no está activo.

*(Fuente: [Kiroignore](https://kiro.dev/docs/kiroignore/))*

## 4. MCP y Powers: la diferencia real de rendimiento

**Paso 7 — Preferí Powers (carga dinámica) sobre `mcp.json` con muchos servidores fijos.** Cita textual de Kiro: *"Connect five MCP servers and your agent loads 100+ tool definitions before writing a single line of code."* Los Powers activan/desactivan sus MCP completos según relevancia del pedido, así que tu contexto base se mantiene mínimo aunque tengas docenas de integraciones instaladas.

**Paso 8 — Si armás tus propios Powers, separá por dominio en vez de un Power monolítico.** Por ejemplo: un Power por motor de base de datos (`dbmssql`/`dbmysql`/`dbpostgres`) en lugar de uno solo que los mezcle, y Powers con skills independientes que se activen por palabra clave sin arrastrar el resto.

*(Fuente: [Kiro powers now support Agent Plugins](https://kiro.dev/blog/powers-supports-plugins/), [Powers](https://kiro.dev/docs/powers/))*

## 5. Permisos: acotá antes de que te sorprenda

**Paso 9 — Cuidado con comodines en `deny` de `~/.kiro/settings/permissions.yaml`.** Las reglas `deny` ganan sobre `allow`, así que un patrón amplio como `git *` en deny bloquea TODO git, incluidos comandos inofensivos como `git status`/`git log` que quizás querías dejar pasar. Angostá el deny a subcomandos concretos (`git commit*`, `git push*`) en vez de un comodín que se coma todo.

*(Fuente: [Permisos](https://kiro.dev/docs/cli/chat/permissions/))*

## 6. Higiene de sesión — el punto que más impacta en uso prolongado

**Paso 10 — No dejes que una sesión crezca indefinidamente ni acumules cientos de sesiones viejas activas.** Hay un caso documentado en GitHub: un usuario reportó degradación severa de rendimiento tras acumular **187 archivos de sesión**, causando carga de contexto exponencial y consumo de créditos disparado ([issue #4684](https://github.com/kirodotdev/Kiro/issues/4684)). Su propio workaround fue un steering file de "higiene de sesión" recordándole al agente cortar sesiones periódicamente.

**Paso 11 — Sesión nueva por tema, no por conveniencia.** Al cambiar de proyecto o de tipo de tarea (de un repo a otro, o de implementar a hacer troubleshooting), abrí una sesión nueva en vez de seguir acumulando todo en una sola — cada mensaje previo sigue pesando en tokens mientras la sesión esté abierta.

**Paso 12 — Dejá que la auto-resumización trabaje, pero no dependas de ella como única defensa.** En el IDE, cuando el uso de contexto llega al 80% del límite del modelo, Kiro resume automáticamente los mensajes previos — mirá el medidor de uso de contexto en el panel de chat para no llegar sorprendido.

*(Fuente: [Summarization](https://kiro.dev/docs/chat/summarization/), issue #4684)*

## 7. Specs en vez de chat libre para trabajo complejo

**Paso 13 — Usá los workflows estructurados (`Spec`, `Quick Spec`, `Bug Fix`, `Plan`) para trabajo no trivial**, en vez de dejar todo en modo "vibe" (Default). Generan `requirements`/`design`/`tasks` — documentación que después referenciás liviano con `#spec:nombre` en vez de tener que re-explicar el contexto cada vez.

*(Fuente: [Chat - IDE](https://kiro.dev/docs/ide/chat/), tabla de workflows)*

## 8. Bugs conocidos a vigilar (no los "arreglás" vos, pero conviene saber que existen)

| Issue | Qué reporta | Estado |
|---|---|---|
| [#11031](https://github.com/kirodotdev/Kiro/issues/11031) | Regresión de performance severa (1-2 órdenes de magnitud más lento) tras actualizar a la versión 1.0.337 | Abierto, reciente (agosto 2026) — si notás lentitud extrema justo después de actualizar, no sos vos |
| [#8391](https://github.com/kirodotdev/Kiro/issues/8391) / [#11258](https://github.com/kirodotdev/Kiro/issues/11258) | Expansión de variables de entorno `${VAR}` rota en `mcp.json` | Confirmado por un maintainer como bug real, en investigación |
| [#4723](https://github.com/kirodotdev/Kiro/issues/4723) / [#5983](https://github.com/kirodotdev/Kiro/issues/5983) / [#6840](https://github.com/kirodotdev/Kiro/issues/6840) | Comportamiento errático de `kiroAgent.agentIgnoreFiles` | Varios reportes relacionados, sin resolución unificada |
| [#3502](https://github.com/kirodotdev/Kiro/issues/3502) | Uso alto de CPU/memoria, sobrecalentamiento | Reportado en versión 0.4.0 (octubre 2025) — conviene confirmar si persiste en la versión actual |

**Paso 14 — Antes de asumir que un problema de rendimiento es tuyo, buscá el mensaje de error exacto en `kirodotdev/Kiro` issues.** Varios de estos bugs tienen workarounds documentados por otros usuarios en los comentarios, no solo por el equipo de Kiro.

## Resumen accionable (por orden de impacto probable)

1. `.kiroignore` + setting `agentIgnoreFiles` activado — sin esto, nada de lo demás protege tokens.
2. `inclusion` correcto en cada steering (`auto`/`fileMatch`/`manual`, nunca `always` salvo lo esencial).
3. Sesiones cortas y por tema — no acumules cientos de sesiones activas.
4. Powers en vez de `mcp.json` con muchos servidores fijos.
5. `permissions.yaml` sin comodines amplios en `deny`.
6. Specs para trabajo complejo, chat libre para lo simple.

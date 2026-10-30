---
inclusion: auto
name: optimizacion-kiro
description: Reglas de optimizacion de contexto y consumo de tokens en Kiro. Aplica cuando la tarea menciona optimizar Kiro, reducir consumo de tokens o creditos, configurar steering (inclusion always/auto/fileMatch/manual), .kiroignore, Powers vs MCP, higiene de sesiones, o cuando se diagnostica lentitud o gasto alto de contexto.
---

# Optimizacion de Kiro (contexto y tokens)

Guia completa: `docs/guides/guia-optimizar-kiro.md`.
Configuracion manual de steering + AI-DLC: `docs/guides/guia-configuracion-steering-aidlc-manual.md`.

Reglas accionables (aplicar al trabajar en este repo):

1. Steering: nunca `inclusion: always` salvo lo esencial (los 3 base product/tech/structure y baseline). Para reglas situacionales usar `auto` (con `name` + `description`), `fileMatch` o `manual`.
2. Mantener cada steering corto y denso (< ~150 lineas). Cada linea de un steering activo se paga en tokens por mensaje.
3. En el chat, preferir context providers puntuales (`#file`, `#folder`, `#steering:archivo.md`, `#spec:nombre`) sobre `#codebase` generico cuando ya se sabe que archivo interesa.
4. `.kiroignore` no filtra por defecto: debe agregarse al setting `kiroAgent.agentIgnoreFiles`. Verificar con un test de humo (pedir un `.env` que deberia estar ignorado).
5. Preferir Powers (carga dinamica) sobre `mcp.json` con muchos servidores fijos; separar Powers por dominio, no monoliticos.
6. En `permissions.yaml`, evitar comodines amplios en `deny` (ej. `git *`); acotar a subcomandos concretos.
7. Higiene de sesion: sesion nueva por tema; no acumular cientos de sesiones activas. Dejar que la auto-resumizacion (80% del limite) trabaje sin depender solo de ella.
8. Usar workflows estructurados (Spec, Quick Spec, Bug Fix, Plan) para trabajo no trivial; referenciar luego con `#spec:nombre` en vez de reexplicar contexto.

Ante lentitud extrema tras actualizar Kiro, buscar el error exacto en issues de `kirodotdev/Kiro` antes de asumir causa local (ver tabla de bugs conocidos en la guia completa).

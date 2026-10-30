# Tarea (kiro-cli): "super documentación" del Módulo de Reglas del OMS

**Pedido en la reunión 2026-10-27 (gerente):** generar documentación del módulo de
reglas del OMS — cómo funcionan las reglas y cómo trabaja — **pensada para el
USUARIO** (no un dump técnico). Verifica: Claude (Chus revisa).

## Alcance y restricciones (IMPORTANTE)
- **SOLO LECTURA sobre el OMS. NO modificar NINGÚN archivo de código del OMS**
  (`backend/oms/`, `src/pages/oms/` salvo que sea el doc). La tarea es LEER el código
  y los documentos existentes y ESCRIBIR un documento nuevo.
- Entregable único: un documento Markdown nuevo en **`docs/guides/modulo-reglas-oms.md`**
  (en español, para el usuario). No tocar nada más.

## Fuentes a leer (para entender cómo funciona)
- `backend/oms/src/` — motor de reglas, handoff, barrido (ADR-013), score.
- `src/pages/oms/` — la vista "Motor de Reglas" (catálogo semi-configurable) y la Cola.
- `aidlc/spaces/default/memory/project.md` → sección `## Decided` (muchas decisiones
  firmes sobre reglas, prioridad, score, cliente-retira, EPA vs Cofersa).
- `docs/` y `docs/work/` — entradas previas relacionadas con reglas/priorización.

## Contenido que debe cubrir el documento (orientado al usuario)
1. **Qué hace el módulo de reglas** en una frase y dónde encaja (OMS prepara el
   pedido: cambia estado/situación + prioridad; no crea el viaje, eso es Planificación).
2. **Las 5 macro-reglas**: (1) cálculo de fecha, (2) análisis de observaciones (texto
   libre), (3) cliente retira (subconjunto de observaciones → prioridad alta + viaje
   dummy), (4) asignación de viaje/bajada, (5) inventario/capacidad (futuro).
3. **Prioridad** (tal como se aclaró el 2026-10-27): numérica, **0 = máxima**, luego
   1, 2, 3 … n; se acomodan a futuro (p. ej. prioridad 100 y va corriendo). La 0 es la
   que se está trabajando. **Cofersa**: 0..n. **EPA**: solo 1 y 2 (usa las que trae).
   Se calcula según cuánto tarda en prepararse (regla T-1 / lead time).
4. **Score ponderado**: cada regla activa suma peso → prioridad.
5. **Automático vs manual**: el cálculo es 100% automático; la única intervención
   humana permitida es el override de prioridad de un pedido puntual por el rol
   Responsable del OMS. No hay paso de aprobación humana.
6. **Configuración**: el Motor de Reglas es un catálogo semi-configurable (on/off,
   peso/score, parámetros como T-1 y cortes, por compañía); la lógica vive en código,
   NO es un constructor dinámico desde la UI.
7. **Barrido / liberación (ADR-013)**: priorizar (deja DISP) vs liberar (DISP→GENE un
   día antes de la salida); EPA solo se libera, no se prioriza.

## Estilo
- Español, claro, para usuario de negocio. Diagramas simples en texto/Mermaid si ayudan.
- Sin inventar: si algo no está en el código/decisiones, marcarlo como pendiente.

## Verificación (lo que Claude comprobará)
- Existe `docs/guides/modulo-reglas-oms.md` y NO se modificó código del OMS.
- El contenido es coherente con `project.md` (`## Decided`) y el código real.

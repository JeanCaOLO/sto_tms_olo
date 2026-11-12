# Prompting por fase AI-DLC (Prompt Master) — guia INTELIX

Proyecto: intelix-estandar-frontend · Actualizado: 2026-10-28

Guia **de disciplina**, no una skill. Estructura los prompts tecnicos por fase de
AI-DLC v2.8.2 para reducir alucinaciones y mantener el trabajo alineado al estandar
INTELIX. No reemplaza ninguna fase, gate ni skill: las **alimenta** con mejores
entradas.

> Relacionada con: [`gobierno-iadlc-intelix.md`](gobierno-iadlc-intelix.md) ·
> estandares en `docs/estandares/`.

## 1. Principios anti-alucinacion

1. **Anclar en el repo, no en el modelo.** Pedir que lea el artefacto real
   (`Product-Definition/`, ADR, `docs/estandares/*`, plan) antes de proponer.
2. **Una salida verificable por prompt.** Si no se puede comprobar, el prompt esta
   mal planteado.
3. **Declarar restricciones duras**: estandar hexagonal, Lambda por defecto,
   secretos fuera del codigo, exposicion (publica/corporativa), R1–R14.
4. **Pedir que cite el archivo y la linea** cuando afirme algo del codigo.
5. **Separar proponer de decidir.** El agente propone; el humano aprueba en el gate.
6. **Sin inventar datos.** Si falta un dato (dominio, KPI, motor de BD), que lo
   pregunte, no que lo asuma.

## 2. Plantilla base de prompt

```
Contexto: <fase AI-DLC> del proyecto <nombre>. Clase: <Menor/Intermedio/Mayor>.
Lee primero: <rutas de artefactos reales>.
Restricciones: <estandar aplicable> + seguridad R1-R14 + exposicion <publica|corporativa>.
Tarea: <una sola cosa, verificable>.
Salida esperada: <formato concreto: ADR, historias Given/When/Then, diff, checklist>.
No hagas: inventar datos, saltar gates, escribir secretos, proponer stack fuera del estandar.
Si falta un dato, preguntalo antes de continuar.
```

## 3. Prompts por fase

### Gate 0 / Discovery
- "Lee `Product-Definition/vision.md` y `technical-environment.md`. Lista actores,
  casos de uso y **fuera de alcance**. Marca los KPIs ausentes como preguntas
  abiertas; no inventes metricas."
- Salida: brief + `open-questions.md` actualizado. Verificable con
  `validate_discovery_gate.py`.

### Inception
- "Convierte estos casos en historias `Como/Quiero/Para` con criterios de
  aceptacion **evaluables** (Given/When/Then). No agrupes requisitos ambiguos."
- "Antes de disenar, corre mentalmente el checklist del `intelix-arquitectura-gate`:
  capas hexagonales, Lambda vs ECS, ambientes, secretos, exposicion."
- Salida: backlog priorizado + ADR borrador.

### Transicion a Construction (Arquitectura Gate)
- "Completa el ADR (`docs/arquitectura/ADR.md`) con las 9 secciones. Justifica
  Lambda vs ECS con duracion/runtime/costo. Declara exposicion e IdP."
- Salida: ADR que pase `intelix-arquitectura-gate` (APROBADO).

### Construction
- "Implementa <caso de uso> en arquitectura hexagonal. El dominio no depende de
  boto3. Secretos via Secrets Manager/SSM. Cita el archivo y la linea de cada
  cambio."
- "Antes de proponer el commit, pasa el diff por `intelix-seguridad-linter` y
  reporta hallazgos R1–R7."
- Salida: diff + evidencia de pruebas. Verificable con el linter y las pruebas.

### Cierre de unidad / QA (QA Gate)
- "Recorre la Definition of Done de `intelix-qa-gate` para la unidad <X>. Para cada
  control (R1–R8 + criterios de aceptacion) di estado y evidencia; no marques
  cumplido sin evidencia."
- Salida: checklist DoD con estados + task-tracker actualizado.

### Pre-Deploy / Operacion
- "Consolida el checklist R11. Ejecuta `intelix-certificacion` y reporta el
  dictamen **tal cual** lo emite el motor; no lo recalcules. Lista R12 (diferidos
  al piloto) con dueno y fecha."
- Salida: AUTORIZADO/BLOQUEADO para el sign-off humano.

## 4. Antipatrones de prompt (evitar)

- "Hazme el sistema completo" (salta Discovery y gates).
- "Asume lo que falte" (genera alucinaciones y deuda).
- "Certifica esto" dirigido al modelo (el dictamen lo fija el motor, no el chat).
- "Usa la libreria X para una pantalla" (rompe el Design System / estandar React).
- Prompts multi-objetivo sin salida verificable.

## 5. Como encaja con las skills

| Fase | Prompt busca… | Skill/gate que valida |
|------|---------------|-----------------------|
| Gate 0 | vision/KPIs/alcance | `validate_discovery_gate.py` |
| Inception | historias + ADR borrador | `intelix-inception-iterations` |
| Pre-Construction | ADR completo | `intelix-arquitectura-gate` |
| Construction | diff seguro | `intelix-seguridad-linter` |
| Cierre unidad | DoD cerrada | `intelix-qa-gate` |
| Pre-Deploy | dictamen + R11 | `intelix-certificacion` |

El prompt mejora la **entrada**; el gate valida la **salida**. Ninguno sustituye al
otro ni al sign-off humano.

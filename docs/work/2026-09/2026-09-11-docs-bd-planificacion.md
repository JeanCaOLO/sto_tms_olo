# 2026-09-11 — Docs de BD para Planificación (reunión Calzadilla)

## What changed

Dos guías nuevas bajo `docs/guides/`:

- `preguntas-calzadilla-bd.md`: checklist de dudas de BD, **actualizada con las
  respuestas** de la reunión con Calzadilla (2026-09-11 tarde). Marca lo
  respondido y deja las acciones pendientes (réplica IPRAX para CR, trigger de
  viaje listo, dummies de cliente-retira en VE, lógica WMS/DMS).
- `planificacion-modelo-datos-propuesta.md`: propuesta del modelo de datos
  propio (Supabase), con una sección nueva de **decisiones confirmadas**: clave
  del pedido por 4 campos (pedido+almacén+compañía+sucursal) + país nuestro,
  `guia_ref` (IDCONFIRMACION) como marca de "listo", y el filtro `situation`.

## Why

Aterrizar en el repo lo que se decidió/confirmó en la reunión, para que el
modelo propio y las queries no dependan de la memoria de la reunión.

## How

Docs; sin código. El impacto de código de la misma reunión (filtro
`situation=INVALIDATED`) se hizo en TMS-Backend (deploy dev verificado).

## Follow-ups

- Solicitar réplica IPRAX para CR (Rafael/Alfredo) + usuario read-only.
- Confirmar trigger "viaje listo": todos con guía vs `situation=PENDING`.
- Campo de observaciones (dirección/ruta alterna + IA) quedó sin cubrir.

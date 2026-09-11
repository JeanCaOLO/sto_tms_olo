# Intent Statement — Planificación de Rutas: Matriz de Requerimientos y Roles

## Problem Statement

El módulo de Planificación de Rutas del TMS OLO fue construido iterativamente entre el 2026-08-11 y el 2026-08-24, trabajando directo con el usuario (Jesús Araujo) sin un proceso formal de levantamiento de requerimientos. [desc] [Q1] El módulo está funcionando — cubre viajes, bin-packing con márgenes de seguridad 85%/95%, optimización de paradas vía OSRM, reparto de flota multi-vehículo, generación y edición de rutas, y mapa interactivo con Leaflet — pero no existe una matriz de requerimientos formal ni un documento de roles del equipo que establezca responsabilidades y relaciones con otros módulos. [desc]

Esta ausencia dificulta: (a) onboarding de nuevos miembros, (b) trazabilidad de qué comportamientos son intencionales vs. incidentales, (c) gobernanza de cambios futuros, y (d) coordinación con módulos dependientes como el OMS de Eduardo. [Q1] [Q4]

## Target Customer

El equipo técnico de TMS OLO: Jesús Araujo (owner técnico de Planificación), Jean Carlo (líder del proyecto, Intelix), Eduardo (OMS/guía de despacho — proveedor de viajes/pedidos como insumo), Dylan (Liquidación/Tarifas) y Andrey (SRO). [Q2] [Q5]

El dolor principal es la falta de una referencia formal compartida sobre qué hace el módulo, cuáles son sus invariantes de negocio (ej. márgenes de capacidad), y cómo se conecta con el resto del sistema. [Q2]

## Success Metrics

- Matriz de requerimientos que cubra el 100% del comportamiento funcional observado en `src/pages/planificacion/` y `src/lib/routePlanning/`. [Q3]
- Cada requerimiento con criterio de aceptación verificable derivado del código. [Q3] [desc]
- Documento de roles que identifique owner, responsabilidades y relaciones inter-módulo. [Q3] [desc]
- Los entregables quedan en el record del intent AI-DLC (`aidlc/spaces/default/intents/260825-route-planning-reqs/`). [Q7]

## Initiative Trigger

El módulo fue construido sin proceso formal (iteración directa usuario↔AI) y ahora necesita documentación retroactiva para escalar el equipo, transferir conocimiento y gobernar cambios futuros. [Q4] No hay un evento externo (regulación, rotación de personal) — es una decisión proactiva del owner técnico para formalizar lo construido. [Q4]

## Initial Scope Signal

- **Workflow-selected scope**: `route-planning-docs` (7 stages, Minimal depth). [scope]
- **User-confirmed product boundary**: Levantamiento documental del módulo existente sin construcción de código nuevo. Scope confirmado como correcto. [Q8]

## Assumptions & Open Questions

None.


# Stakeholder Map — Planificación de Rutas

## Key Stakeholders

| Stakeholder | Rol en TMS OLO | Interés en este módulo | Autoridad | Source |
|---|---|---|---|---|
| Jesús Araujo | Owner técnico de Planificación de Rutas | Documentar formalmente lo que construyó; tener una referencia para cambios futuros | Ejecutor y responsable del módulo | [Q5] [desc] |
| Jean Carlo | Líder del proyecto TMS OLO (Intelix) | Visibilidad sobre el estado del módulo; coordinación con el resto del equipo | Decision-maker de alcance y prioridad | [Q5] [Q6] |
| Eduardo | Desarrollador del OMS / guía de despacho | Su módulo (OMS) genera los viajes/pedidos que Planificación consume como insumo | Influencer — define el contrato de datos de entrada | [Q5] [desc] |
| Dylan | Desarrollador de Liquidación/Tarifas | Módulo paralelo; potencial consumidor de datos de rutas completadas para cálculo de tarifas | Influencer — interfaz futura | [Q5] |
| Andrey | Desarrollador de SRO | Módulo paralelo; relación por definir | Influencer — interfaz futura | [Q5] |

## Decision-Makers vs. Influencers

| Categoría | Persona(s) | Alcance de decisión | Source |
|---|---|---|---|
| Decision-maker | Jean Carlo | Alcance del proyecto, prioridad entre módulos, aprobación de cambios cross-módulo | [Q6] |
| Decision-maker (técnico) | Jesús Araujo | Diseño técnico del módulo de Planificación, implementación, arquitectura interna | [Q5] [Q6] |
| Influencer (datos de entrada) | Eduardo | Define el contrato de viajes/pedidos que Planificación consume — un cambio en OMS impacta directamente | [Q5] |
| Influencer (datos de salida) | Dylan | Posible consumidor de rutas generadas para liquidación — relación aún no formalizada | [Q5] |
| Influencer (paralelo) | Andrey | SRO como módulo paralelo — relación por definir | [Q5] |

## Communication Requirements

| Mecanismo | Cadencia | Participantes | Source |
|---|---|---|---|
| Entregables en record AI-DLC | Al completarse | Jesús (autor), Jean Carlo (revisor) | [Q7] |
| Reuniones de equipo (Notion) | Ad-hoc, según necesidad | Todo el equipo TMS OLO | [Q5] [Q7] |

## Assumptions & Open Questions

None.


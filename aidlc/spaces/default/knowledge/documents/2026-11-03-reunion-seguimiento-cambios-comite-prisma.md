# Reunión de seguimiento — 2026-11-03

Fuente: transcripción de la reunión del equipo TMS/OMS (3-nov-2026). Resumen por tema.

## Cambios pedidos

**Panel OMS** — los indicadores deben pasar a *warnings* (alertas), estilo dashboard:
pedidos con fecha de entrega sin prioridad (el OMS no los procesó), cantidad de
modificaciones de fecha por pedido, cuántos pedidos hay, cuántos en planificación,
en camino y atrasados.

**Bandeja de pedidos**
- Poder modificar la fecha de entrega de un pedido (p. ej. el cliente lo pide para hoy o
  mañana). Amarrado a una aprobación con **clave master del rol Coordinador**; se registra
  qué coordinador aprobó.
- Mostrar las **devoluciones** (creadas en el TMS o en la app) con etiqueta/color.
- Filtro pickup / delivery (devolución vs. no devolución).

**Planificación**
- Contemplar sábados y domingos: no es planificar fines de semana, sino poder verlos si la
  fecha de entrega cae ahí (hoy la vista muestra solo lunes a viernes).
- Con transportista tercero no se asigna chofer ni vehículo; el transportista indica el
  chofer después. Pensar cómo lo informa. **No urgente.**
- **EPA sin zona** (respuesta a Chus): EPA tiene tiendas fijas (8 en CR, ~16 en VE) con
  coordenadas conocidas; se usan las coordenadas de la tienda y la zona casi no importa,
  porque EPA va en viaje directo, camión lleno, a una tienda. La zona sí importa en
  Cofersa/mayoreo, donde un camión entrega a varios clientes y se agrupa por zona.

**Tracking**
- Registrar hora de llegada y salida en cada parada (tiempo en el punto). Dylan/José, desde
  la app al confirmar entrega.
- Al cerrar una parada, enviar correo al siguiente cliente: "eres el siguiente", con un ETA
  promedio por distancia.
- Nuevo rol/perfil **Cliente**: solo ve el mapa de tracking (camión y ETA actualizado).

**Routing**: falta un motor que genere la ruta completa en el mapa. Se pidió una API de
prueba a un proveedor; si no, Google.

## Otros

- Venezuela: la planificación hoy es por experiencia, sin criterio formal → VE se adapta
  al sistema de priorización de CR. Devoluciones: mismo formulario para ambos países.
- App móvil: el APK del repo se cierra al abrir; el enviado por WhatsApp sí funciona.
  Dylan/José lo revisan.
- **Viernes 6-nov: presentación al comité de Prisma.** Jueves 5-nov al final del día se
  cierra; el viernes no se hacen cambios. Cargar datos para todos los escenarios.

## Cambio de base de datos (renombrado de tablas)

Hoy 3-nov a las **14:00 hora de Venezuela**: todos suben sus PR a `main` antes del corte,
el líder los acepta y confirma que `main` está al día. Desde ahí Chus modifica la base de
datos, ajusta las Lambdas/funciones afectadas y lo entrega en un PR.

# Refined Mockups — memoria

## Interpretations
- 2026-09-01T14:11:40Z — acento rose para devolucion (el usuario lo asocio en un prototipo); tramos de ruta emerald/rose en el mapa. Regla tipo(rose)+estado(amber) en elementos separados. Los 3 Major de rough-mockups resueltos.

## Deviations

## Tradeoffs
- 2026-09-01T14:11:40Z — rose vs indigo: se eligio rose porque el usuario ya lo probo; requirements.md admitia "azul o rojo".

## Open questions
- 2026-09-01T14:11:40Z — segmentar la polilinea del mapa por tramo puede requerir N polilineas en vez de 1; coste a estimar en functional-design.

## Deviations
- 2026-09-01T14:25:12Z — rev1 asumio colores sin leer el codigo (dijo amber=fuera-de-ventana, era rojo; amber=anclado). rev2 verificado contra ParadaCard/PedidoCard/RutaMapaPreview/Badge.tsx: devolucion pasa a indigo, leg de recoleccion = indigo discontinuo, componente = TipoParadaBadge (StopBadge estaba tomado), plan real de N polilineas.

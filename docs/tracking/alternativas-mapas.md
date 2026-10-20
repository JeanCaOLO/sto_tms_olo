# Alternativas de mapas, rutas y geocodificación (proveedores pagos)

Fecha de la investigación: 2026-10-20. Estado: **para decidir** (no hay cambios de código).

## Por qué

Hoy el frontend usa servicios abiertos sin garantía:

| Uso | Dónde | Servicio actual |
|---|---|---|
| Tiles del mapa | `TripMapa.tsx`, `ZoneMap.tsx`, `FlotaMapa.tsx` (Tracking acepta `VITE_MAP_TILES_URL`) | `tile.openstreetmap.org` |
| Ruta por calles (`/route`) | `planificacion/route-geometry.ts`, `tracking/route-osrm.ts` | OSRM público (`VITE_OSRM_URL`) |
| Matriz de distancias (`/table`) | `planificacion/distance-matrix.ts`, `optimize-stops.ts` | OSRM público |
| Geocodificación | no hay API externa; las coordenadas vienen de la carga de puntos de entrega | — |

El propio código lo advierte (`osrm-config.ts`): el OSRM público no tiene SLA, tiene límite de tasa y puede caerse. Los tiles de OSM tampoco están pensados para uso comercial intensivo. La empresa quiere un proveedor pago con soporte y continuidad.

El polling de Tracking (cada 15 s) lo atiende el backend propio: **no llama a ninguna API de mapas y no genera costo**.

## Nota sobre «grok»

Se interpretó como **GraphHopper** (motor de rutas). xAI Grok es un modelo de lenguaje, no un proveedor de mapas. Si se refería a otro, indicarlo.

## Supuestos de volumen (míos, a validar con datos de Planificación)

Por mes: 1.320 viajes (60/día × 22 días, CR + VN), ~12 paradas por viaje.

- 3.000 cargas de mapa ≈ 600.000 tiles.
- 40.000 solicitudes de ruta (`/route`).
- 380.000 elementos de matriz (2.640 llamadas de 12×12).
- 500 geocodificaciones nuevas.

**La matriz domina el costo**: casi todos los proveedores la cobran por celda origen-destino.

## Comparativa (14 alternativas)

Estimado mensual en USD con los supuestos de arriba. «Verificación»: **Oficial** = leído de la página del proveedor el 2026-10-20; **Parcial** = una parte no se pudo leer; **No verificado** = solo fuentes de terceros o datos antiguos.

| # | Proveedor | Tiles / rutas / matriz / geocoding | Precios relevantes | Uso comercial y soporte | Estimado/mes | Verificación |
|---|---|---|---|---|---|---|
| 1 | Google Maps Platform | Todo | Dynamic Maps $7/1.000 (10 mil gratis). Routes Essentials $5/1.000 (10 mil gratis), Pro $10. Route Matrix Essentials $5/1.000 elementos. Geocoding $5/1.000 (10 mil gratis). Descuentos por volumen | Sí, soporte y SLA comerciales | ≈ 1.700 (matriz ≈ 1.570, rutas ≈ 150) | Oficial |
| 2 | Mapbox | Todo | Map loads GL JS: 50 mil gratis, luego $5→$2,50/1.000. Directions, Matrix (elementos) y Optimization: 100 mil gratis, luego $2→$1,20/1.000. Geocoding temporal: 100 mil gratis, luego $0,75 | Sí | ≈ 560 (solo la matriz excede el gratis) | Oficial |
| 3 | HERE | Todo | Datos 2022: ruteo auto $0,75/1.000, matriz $5/1.000. La matriz se cuenta por celdas (5×mayor lado si ≥5). Precios actuales por cotización | Sí | ≈ 150–800 | No verificado |
| 4 | TomTom | Todo | Ruteo y geocoding $0,75/1.000, matriz $2,50/1.000 solicitudes, optimización de paradas $4. Cuota gratis diaria; al pasarla **bloquea** salvo crédito prepago. Precios nuevos desde 2026-07-01 (fijables hasta 2028 si se firma antes del 2026-12-31) | Revisar términos del plan gratis | ≈ 30–60 | Parcial |
| 5 | Stadia Maps | Tiles, ruteo, matriz, geocoding (Valhalla/Pelias) | Planes: Free $0 (200 mil créditos, **no comercial**), Starter $20 (1 M), Standard $80 (7,5 M), Professional $250 (25 M). Tile 1 crédito, ruta 20, matriz 10 por elemento, geocode 20 | Sí en planes pagos | ≈ 80 (≈ 5,2 M créditos). Sin matriz: ≈ 32 | Oficial |
| 6 | Geoapify | Tiles, ruteo, matriz, geocoding | Planes: Free (3.000 créditos/día), API 10 $59, 25 $109, 50 $179, 100 $299, 250 $609. Ruteo y geocode 1 crédito. No se leyó el costo de tiles ni matriz | Free permite comercial con límites y soporte «best effort» | ≈ 59–179 | Parcial |
| 7 | MapTiler Cloud | **Solo tiles y búsqueda** (sin ruteo) | Free $0 (no comercial). Flex $30 (25 mil sesiones de mapa, 500 mil solicitudes). Extra: $2,50/1.000 sesiones, $0,15/1.000 solicitudes. SLA 99,9 % solo en Custom | Sí desde Flex | ≈ 30 (más el ruteo de otro proveedor) | Oficial |
| 8 | Amazon Location Service | Todo (HERE/Esri/Grab detrás) | Facturación por solicitud en buckets Core/Advanced/Premium. La matriz cobra cada par origen-destino. Descuento sobre $5.000 al mes. Crédito inicial hasta $200 | Sí, dentro de AWS (facturación e IAM únicas) | No calculable: no se leyeron las tarifas por 1.000 | Parcial |
| 9 | GraphHopper | Ruteo, matriz, optimización, geocoding (sin tiles) | Planes (€/mes): Free 500 créditos/día (**no comercial**), Basic 69 (5 mil/día), Standard 199 (15 mil/día), Premium 479 (50 mil/día). Geocoding 0,3 créditos. No se leyó el costo de ruteo/matriz. Motor open source autohospedable | Sí en planes pagos | ≈ 199–479 € (si la matriz cuesta ~1 crédito por elemento) | Parcial |
| 10 | Microsoft Azure Maps | Todo | Gratis mensual: 5.000 tiles base, 1.000 ruteos, 5.000 búsquedas. Matriz cuenta 1 transacción por 4 celdas. Precios pagos no publicados (contactar). Sucesor de Bing Maps for Enterprise (retiro de Bing: 2028-06-30) | Sí | No calculable (≈ 95 mil transacciones de matriz) | Parcial |
| 11 | Esri ArcGIS Location Platform | Todo | Sesiones de basemap $4/1.000 (1.000 gratis). Según terceros: tiles $0,15/1.000 tras 2 M gratis, ruteo $0,50/1.000 tras 20 mil gratis. Almacenar geocodes cuesta aparte | Sí | ≈ 10–200 (tiles dentro del gratis; matriz sin precio confirmado) | No verificado |
| 12 | LocationIQ | Tiles, ruteo, geocoding | Free 5.000 solicitudes/día. Maps Lite $45 (sin ruteo), Developer $100 (25 mil/día, con ruteo), Startup $200 (60 mil/día), Growth Plus $500. Permite guardar respuestas mientras la cuenta esté activa. No se especifica cuota de matriz | Sí desde Maps Lite | ≈ 100–200 | Parcial |
| 13 | Radar | Geocoding, mapas, ruteo, matriz | Core Maps $0,50/1.000 llamadas (geocode, ruta, matriz por elemento). Premium $2/1.000 (optimización de rutas). Sin plan gratis; compromiso anual | Sí | ≈ 210 (≈ 420 mil llamadas) | Oficial |
| 14 | openrouteservice (HeiGIT) | Ruteo, matriz, optimización, geocoding (sin tiles) | Plan gratis con cuotas diarias y planes pagos / autohospedaje. **No se pudo leer la página de planes** | A confirmar con HeiGIT | No calculable | No verificado |

### Opción híbrida (no es un proveedor)

Tiles pagos (p. ej. MapTiler Flex, $30) más **OSRM propio** (ya existe `infra/osrm/`): costo de infraestructura (estimación mía, no investigada: unos $40–80/mes con un servidor pequeño que cubra CR y VN) y control total. El soporte y el uptime los asumimos nosotros.

## Impacto en el frontend

- **Cambio de URL (Leaflet sigue igual):** Stadia, Geoapify, MapTiler, TomTom, HERE, LocationIQ, Azure Maps, Esri y Amazon Location (con estilo/tiles raster). El tile ya se parametriza en Tracking con `VITE_MAP_TILES_URL`.
- **Reescritura de mapas:** Google (SDK propio) y Mapbox (`react-map-gl`).
- **Ruteo:** el cliente espera el formato OSRM (`/route`, `/table`). Stadia (Valhalla), Mapbox, Google, HERE, TomTom, GraphHopper y Radar usan otro formato: hace falta un adaptador en `route-geometry.ts`, `route-osrm.ts` y `distance-matrix.ts`. Mapbox Directions y Matrix son los más parecidos a OSRM.
- **Orden de magnitud:** rutas y geocoding son baratos en casi todos; el costo real sale de la matriz y de si el contrato permite guardar resultados.

## Cómo reducir el gasto a futuro

1. Calcular la matriz una vez por plan y guardarla; hoy se recalcula en cada optimización.
2. Prefiltrar con haversine (ya existe `routePlanning/haversine.ts`) y pedir matriz solo de paradas cercanas, o usar la API de optimización del proveedor (una solicitud en vez de N²).
3. Guardar la geometría de ruta por viaje y recalcular solo si cambian las paradas.
4. Geocodificar una vez y guardar el resultado; confirmar en el contrato que el almacenamiento está permitido (LocationIQ sí, Mapbox exige geocoding permanente, Amazon Location exige el bucket *Stored*).
5. Pedir ruta sin `steps` cuando no se necesite el detalle (menor tamaño y a veces menor costo).
6. Cachear tiles en el navegador (cabeceras estándar); en LocationIQ está prohibido cachear tiles del lado servidor.

## Recomendación preliminar

- **Mapbox**: mejor balance costo/soporte; exige reescribir mapas.
- **Stadia Maps**: más barato con soporte comercial y sin reescribir mapas; exige adaptador de ruteo.
- **Google**: el más completo y de mayor soporte; caro si la matriz no se optimiza antes.
- **Amazon Location**: encaja con la infraestructura AWS de Intelix; falta confirmar tarifas.

## Pendientes antes de decidir

- Validar el volumen con datos reales (viajes/día, llamadas de matriz por plan, usuarios concurrentes).
- Cotizar HERE y TomTom; leer tarifas de Amazon Location, Azure Maps, ArcGIS y openrouteservice.
- Confirmar cobertura de datos en Costa Rica y Venezuela (calidad de calles y tráfico) con una prueba de ruta real por proveedor.
- Confirmar términos de almacenamiento de resultados y uso en apps móviles (la app del chofer también usará mapas).
- Decidir con Jean y con Intelix quién contrata y paga la cuenta del proveedor.

## Fuentes

- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Mapbox pricing](https://www.mapbox.com/pricing)
- [Stadia Maps pricing](https://stadiamaps.com/pricing/)
- [Geoapify pricing](https://www.geoapify.com/pricing/)
- [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/)
- [GraphHopper pricing](https://www.graphhopper.com/pricing/)
- [LocationIQ pricing](https://locationiq.com/pricing)
- [Radar pricing](https://radar.com/pricing)
- [Azure Maps pricing](https://azure.microsoft.com/en-us/pricing/details/azure-maps/)
- [Amazon Location pricing](https://aws.amazon.com/location/pricing) y [Routes pricing](https://docs.aws.amazon.com/location/latest/developerguide/routes-pricing.html)
- [TomTom API pricing](https://docs.tomtom.com/pricing/price-announcement)
- [HERE pricing plans](https://developers.here.com/plans)
- [ArcGIS Location Platform pricing](https://location.arcgis.com/pricing/)
- [openrouteservice plans](https://account.heigit.org/info/plans)
- Terceros: [Woosmap, Google Maps pricing 2026](https://www.woosmap.com/blog/google-maps-api-pricing-breakdown), [Woosmap, Mapbox pricing](https://www.woosmap.com/blog/mapbox-pricing), [StoreRocket, alternativas](https://storerocket.io/learn/google-maps-api-alternatives)
